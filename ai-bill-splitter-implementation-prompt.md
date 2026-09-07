# Implementation Prompt: AI Bill Splitter

> Paste this entire document as the system/task prompt for an AI coding agent (Claude Code, Cursor, etc.). It is self-contained and unambiguous — the agent should not need to ask clarifying questions to start Phase 1.

---

## 0. Role

You are acting as a senior full-stack engineer, financial-calculation engineer, AI-integration engineer, and product designer building **one cohesive production application**. You will make and document technical decisions rather than leaving TODOs. Where this spec is silent, choose the simplest correct option and note the decision in the README.

---

## 1. Product Definition (one paragraph)

A mobile-first web app where a user photographs a restaurant bill, an AI extraction pipeline turns it into structured, editable data, the user assigns each item to one or more of 2–10 people, and a **deterministic** calculation engine computes each person's exact share — including proportional tax, service charge, and discount allocation — such that the sum of all shares equals the verified bill total to the cent. This is a financial utility, not a chatbot.

**Non-negotiable invariant, enforced by an automated test:**
```
sum(person.total for person in people) == verified_final_bill_total   # at currency precision, always
```

---

## 2. Hard Architectural Rule: AI vs. Deterministic Code

| Layer | Allowed to do | Forbidden from doing |
|---|---|---|
| **AI (Gemini)** | Read images, extract candidate field values with confidence + source text + bounding box, flag ambiguity, parse free-text assignment instructions into a structured *proposal* | Any arithmetic that determines a final owed amount; writing directly to the bill-of-record; skipping human review; being trusted without validation |
| **Deterministic backend code** | All multiplication, addition, proportional allocation (tax/service/discount), rounding, reconciliation, persistence of the bill-of-record | Interpreting images or free text |

Every AI output is **untrusted input**. It passes through Pydantic validation and the Verification Agent before a human ever sees it, and nothing from the AI reaches the Calculation Engine without having first been part of a human-confirmed `Bill`.

---

## 3. Tech Stack (fixed — do not substitute without a documented reason)

**Frontend:** React 18 + TypeScript (strict mode) + Vite, Tailwind CSS, shadcn/ui, TanStack Query for server state, Zustand for local session state (current bill draft, assignment UI state), React Hook Form + Zod for the review-screen forms (Zod schema mirrors the backend Pydantic schema).

**Backend:** Python 3.11+, FastAPI, Pydantic v2, `pydantic-settings` for config, `decimal.Decimal` for all money math, Uvicorn/Gunicorn.

**AI:** Gemini (vision-capable model) via the official SDK, called **only** from the backend, using structured output / JSON schema mode — never free-form text parsing of the model's reply.

**Persistence:** MongoDB (Motor async driver) for `bills`, `processing_logs`, optional `users`. Images stored in temporary object storage (or local disk with TTL cleanup for MVP) — not committed to permanent storage unless explicitly configured.

**Image preprocessing:** Pillow + OpenCV (`opencv-python-headless`) for deskew, contrast, denoise, sharpening, blur/quality scoring.

**Testing:** `pytest` + `pytest-asyncio` + `hypothesis` (for rounding/reconciliation property tests) on the backend; `vitest` + `@testing-library/react` on the frontend.

**Tooling:** `ruff` + `mypy --strict` (Python), `eslint` + `tsc --noEmit` (TypeScript), pre-commit hooks running both.

---

## 4. Backend Project Structure

```
backend/
  app/
    main.py
    api/routes/{bills,extraction,people,assignments,calculations}.py
    models/{bill.py,person.py,assignment.py,calculation.py}
    schemas/{bill.py,extraction.py,assignment.py,result.py}
    services/
      gemini_service.py
      image_service.py
      extraction_service.py
      verification_service.py
      assignment_service.py
      calculation_service.py      # pure functions, zero I/O, 100% unit-testable
      reconciliation_service.py
      money.py                    # centralized Decimal/rounding utilities — the ONLY place rounding happens
    core/{config.py,logging.py,security.py,errors.py}
    repositories/bill_repository.py
  tests/
    unit/{test_money.py,test_calculation_service.py,test_reconciliation_service.py,...}
    integration/{test_bills_api.py,...}
    fixtures/bills/            # the 12+ real-bill test dataset + ground truth JSON
```

Business logic lives only in `services/`. Routes do request/response marshalling and call services. `calculation_service.py` and `money.py` must have **no dependency on FastAPI, MongoDB, or Gemini** — they take/return plain Pydantic models and Decimals, so they're trivially unit-testable and impossible to accidentally make non-deterministic.

---

## 5. Domain Models (Pydantic v2)

```python
class Confidence(str, Enum):
    HIGH = "high"       # >= 0.9
    MEDIUM = "medium"   # 0.6 - 0.9
    LOW = "low"         # < 0.6 or field is null

class SourceRef(BaseModel):
    source_text: str | None
    bounding_box: tuple[float, float, float, float] | None
    image_index: int

class LineItem(BaseModel):
    id: str
    name: str
    quantity: Decimal
    unit_price: Decimal | None
    line_total: Decimal | None
    category: str | None
    confidence: dict[str, Confidence]      # per-field: name, quantity, unit_price, line_total
    source: SourceRef
    warnings: list[str] = []
    user_edited: bool = False              # true once a human touches this field — see §17

class Tax(BaseModel):
    name: str                              # e.g. "CGST", "SGST", "GST"
    rate: Decimal | None
    amount: Decimal
    confidence: Confidence

class Bill(BaseModel):
    bill_id: str
    merchant_name: str | None
    bill_number: str | None
    bill_date: date | None
    currency: str = "INR"
    line_items: list[LineItem]
    subtotal_printed: Decimal | None       # what the AI read off the paper
    subtotal_calculated: Decimal           # sum(line_items) — always computed, never AI-sourced
    discount: Decimal = Decimal("0")
    service_charge: Decimal = Decimal("0")
    taxes: list[Tax] = []
    total_printed: Decimal | None
    total_calculated: Decimal              # subtotal_calc - discount + service_charge + sum(taxes)
    reconciles: bool                       # total_printed == total_calculated within tolerance
    reconciliation_diff: Decimal | None
    verification_status: Literal["pending","needs_review","confirmed"]
    warnings: list[str] = []
    source_images: list[str]
    created_at: datetime
```

```python
class Person(BaseModel):
    id: str
    name: str

class ItemAssignment(BaseModel):
    line_item_id: str
    allocations: list[PersonAllocation]    # must sum to line_item.quantity, validated on write

class PersonAllocation(BaseModel):
    person_id: str
    quantity: Decimal                      # fractional allowed, e.g. 0.5

class PersonResult(BaseModel):
    person_id: str
    name: str
    line_breakdown: list[PersonLineShare]  # item name, qty portion, share of line_total
    food_subtotal: Decimal
    tax_breakdown: list[tuple[str, Decimal]]  # per named tax
    service_charge_share: Decimal
    discount_share: Decimal
    rounding_adjustment: Decimal = Decimal("0")
    total: Decimal

class BillResult(BaseModel):
    people: list[PersonResult]
    items_subtotal: Decimal
    discount_total: Decimal
    service_charge_total: Decimal
    tax_totals: list[tuple[str, Decimal]]
    final_bill_total: Decimal
    people_total: Decimal
    reconciled: bool                       # people_total == final_bill_total, must be True to ship a result
    rounding_log: list[str]
```

**Verification rule enforced in code, not just displayed:** for every `LineItem`, check `abs(quantity * unit_price - line_total) <= tolerance` where tolerance = one currency unit's smallest increment (e.g. `Decimal("0.01")`); flag violations as warnings rather than silently "fixing" them.

---

## 6. Money & Rounding — Exact Algorithm

All money is `Decimal`, constructed from strings (`Decimal("125.50")`), never from `float`. Set `getcontext().prec` high enough (e.g. 28) and quantize only at the final output boundary (`ROUND_HALF_UP` to 2dp for INR) — never quantize intermediate values.

**Proportional allocation function** (used identically for tax, service charge, and discount):

```python
def allocate_proportionally(
    pool_amount: Decimal,
    weights: dict[str, Decimal],       # person_id -> eligible subtotal
) -> dict[str, Decimal]:
    """
    Largest-remainder method:
    1. Compute each person's exact (unrounded) share.
    2. Quantize every share down to currency precision (floor).
    3. Sum the floored shares; compute the leftover = pool_amount - sum(floored).
    4. Distribute the leftover one smallest-unit increment at a time to the
       people with the largest fractional remainder (ties broken by person_id
       for determinism), until the leftover is exhausted.
    Guarantees: sum(result.values()) == pool_amount, exactly, always.
    """
```

This same function is the *only* place rounding logic exists in the codebase (`money.py`). Log every non-zero adjustment as `f"Rounding adjustment: {sign}{amount} assigned to {person_name}"` and surface it in `BillResult.rounding_log` and the UI reconciliation panel — never hide it.

**Reconciliation engine** re-derives `people_total` from `PersonResult.total` after allocation and asserts equality with `final_bill_total` before a result is ever returned from the API. If they don't match, this is a bug, not a UI edge case — raise a 500 and alert, don't ship an unreconciled result.

---

## 7. Calculation Sequence (deterministic, per bill)

For each person `p`:
1. **Food subtotal** = Σ over line items of `(line_item.unit_price × allocated_quantity_to(p))`, using each item's *confirmed* (post-human-review) values.
2. **Tax share**, per tax `t`: `allocate_proportionally(t.amount, weights={p: food_subtotal(p)})[p]`, where the weight base is total confirmed subtotal across all eligible people (support future per-item tax-exemption categories by filtering `weights` to only items where that tax applies — default: all items).
3. **Service charge share** = `allocate_proportionally(service_charge, weights=food_subtotals)[p]`.
4. **Discount share** = `allocate_proportionally(discount, weights=food_subtotals)[p]` (document this as the *default* policy in the UI; do not silently change it).
5. **Person total** = `food_subtotal + Σtax_shares + service_charge_share − discount_share`, then run the global reconciliation pass (§6) across all people simultaneously so the whole-bill invariant holds, not just each pool independently.

---

## 8. Image Pipeline

1. Validate MIME type (`jpg`, `png`, `heic`) and size (reject > configurable max, e.g. 15 MB).
2. Decode; run quality checks: blur score (variance of Laplacian), brightness histogram, tilt angle estimate.
3. If quality is poor, still proceed but attach a `warnings` entry the UI surfaces ("This photo looks a bit dark — extraction may be less accurate") rather than blocking upload.
4. Apply deskew/perspective correction, contrast/CLAHE enhancement, denoise, sharpen — each as an independent, testable function; keep the **original** upload untouched in storage.
5. Support multiple images per bill (`source_images: list[str]`); the extraction service sends all images in one Gemini call with instructions to treat them as one continuous bill and **deduplicate** any line item whose `source_text` + position suggests it appears in the overlap between two photos.

---

## 9. Gemini Extraction Contract

Call Gemini with **structured output** (JSON schema mode) bound to a schema that mirrors `BillDraft` (a superset of `Bill` before verification, all fields optional). System instructions, explicitly:

- Read only what is visibly printed; never infer or invent a value that isn't legible.
- If a field cannot be confidently read, return `null` and add a warning — do not guess.
- Return a confidence label per field, calibrated to High/Medium/Low, not a false-precision float shown to the user.
- Return `source_text` and an approximate bounding box per extracted field where feasible.
- Distinguish quantity from unit price explicitly; do not conflate multi-line items.
- Identify subtotal, every tax line separately (do not merge CGST/SGST), service charge, discount, and total as distinct fields.
- Output strict JSON only — no prose, no markdown fences.

The extraction call and the verification call (§10) are **two separate model calls**, not one — keep each stage's responsibility narrow and independently testable/promptable.

---

## 10. Verification Agent (advisory, not authoritative)

A second, smaller Gemini call — or pure rule-based code where possible — inspects the `BillDraft` and returns a `VerificationReport`:

```json
{
  "status": "needs_review",
  "issues": [
    {"field": "line_items[3].unit_price", "severity": "high",
     "reason": "OCR value inconsistent with line total"}
  ]
}
```

Checks to run (prefer deterministic code over another AI call wherever the check is purely arithmetic — e.g. `qty × price ≈ line_total` and `subtotal + tax + service − discount ≈ total` are pure math, not AI):
- Per-line arithmetic consistency
- Sum of line items vs. printed subtotal
- Full reconciliation vs. printed total (**this is where the "wrong printed total" test case must surface a warning, never auto-correct**)
- Duplicate items (including cross-image duplicates)
- Suspicious quantities/prices (e.g. quantity 0, price 10x median)
- Likely OCR character confusion (0/O, 1/l, misplaced decimal)

This report only *annotates* the draft for the human review UI; it never gates or blocks progression except to route into "needs_review" state.

---

## 11. Human Review — Mandatory Gate

No path from extraction to assignment skips this screen. Requirements:
- Table: Item | Qty | Unit Price | Total | Confidence badge (High/Med/Low, color-coded).
- Every field inline-editable; editing a field sets `user_edited = True` and recomputes `subtotal_calculated`/`total_calculated`/`reconciles` live, client-side validated against the Zod schema, persisted via `PUT /api/bills/{id}`.
- A dedicated **Printed vs. Calculated Total** panel that never auto-merges the two values (§13/§20 below) — the user must explicitly confirm before proceeding.
- "Confirm bill" action transitions `verification_status → confirmed` and is the only way to unlock the People step.

---

## 12. People & Assignment

- 2–10 people, add/rename/remove, no auth/account required — ephemeral session tied to `bill_id`.
- Assignment supports: single person (100%), multiple selected people (equal split of that line's total quantity), everyone, and **fractional quantity** allocation for items with qty > 1 (e.g. Pizza ×2 → A:1, B:0.5, C:0.5). Enforce, both client- and server-side, that `Σ allocations.quantity == line_item.quantity` before an assignment is accepted; show "Remaining: 0" live in the UI and block over-allocation in the UI (disable confirm) rather than only rejecting after submit.
- **Optional** natural-language assist: a single text box ("2 biryani shared by Ibrahim and Yusuf, Coke was Ahmed's, everything else shared by everyone") sent to Gemini, which returns a structured `assignments` proposal in the same `ItemAssignment` shape. This is a *proposal* rendered into the same editable assignment UI — the user reviews/confirms exactly as if they'd clicked it manually; it never writes assignments directly.

---

## 13. The Wrong-Printed-Total Requirement

This is a first-class product behavior, not an edge case:
- Store `total_printed` and `total_calculated` as separate fields, always.
- If they differ beyond tolerance, show (not hide, not auto-fix):
  ```
  ⚠ Printed total does not reconcile
  Expected (calculated): ₹XXXX.XX
  Printed on receipt:    ₹YYYY.YY
  Difference:             ₹ZZ.ZZ
  Possible reasons: printing error · missing item · unreadable charge · OCR mistake
  ```
- The split proceeds against `total_calculated` (the reconciled, editable, itemized figure) **only after** the user acknowledges the discrepancy; never silently substitute one total for the other.
- This scenario must exist in the real-bill test fixture set (§16) with a matching automated integration test.

---

## 14. REST API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/bills/upload` | Upload 1+ images, create `Bill` in `pending` state |
| POST | `/api/bills/{id}/extract` | Run image preprocessing + Gemini extraction → `BillDraft` |
| POST | `/api/bills/{id}/verify` | Run verification checks → `VerificationReport` |
| GET | `/api/bills/{id}` | Fetch current bill state |
| PUT | `/api/bills/{id}` | Human corrections to any field; recomputes calculated totals |
| POST | `/api/bills/{id}/confirm` | Lock verification_status → confirmed |
| POST | `/api/bills/{id}/people` | Add/rename/remove people |
| POST | `/api/bills/{id}/assignments` | Create/update item→people allocations |
| POST | `/api/bills/{id}/assignments/parse` | Optional NL-assist → assignment proposal |
| POST | `/api/bills/{id}/calculate` | Run deterministic engine → `BillResult` |
| GET | `/api/bills/{id}/result` | Fetch final result |

All endpoints: Pydantic request/response models, OpenAPI docs auto-generated, structured error responses (`{"error_code": ..., "message": ...}`), no stack traces leaked (§18). The frontend contains **zero** financial arithmetic — even the "live remaining quantity" display during assignment is a read model computed server-side or via a shared TS port of the same simple subtraction logic, kept behind a single small utility so it can't drift from the backend.

---

## 15. State Machine

```
UPLOAD → IMAGE_PREPROCESSING → EXTRACTION → VALIDATION → AI_VERIFICATION
→ HUMAN_REVIEW → PEOPLE_SETUP → ASSIGNMENT → ASSIGNMENT_VALIDATION
→ DETERMINISTIC_CALCULATION → RECONCILIATION → RESULT
```
Persist `Bill.verification_status` / an explicit `workflow_stage` field; each transition has its own request/response schema; no transition may be skipped by the AI or the frontend — only explicit user actions (confirm bill, confirm assignments) advance the gated stages.

---

## 16. Test Dataset & Ground Truth

Create `tests/fixtures/bills/` with **12+ real bill photographs** covering: dim lighting, crumpled paper, steep camera angle, faded thermal print, handwritten annotation, two scripts/languages, a bill requiring two photographs (with an intentionally overlapping item to test dedup), small font, dense item list, low contrast, multiple taxes/charges, and **one bill with a deliberately incorrect printed total**. Each has a hand-authored `ground_truth.json` (merchant, items, quantities, prices, subtotal, discount, service charge, taxes, total). Write a scoring script comparing extraction output to ground truth (field-level accuracy %) and check it into CI as a non-blocking report (extraction accuracy on real photos is expected to be <100%; it's tracked, not gated).

---

## 17. Provenance / Transparency Rule

Every monetary value the user sees must be traceable to one of exactly three origins, and the UI must label which:
- **AI extracted** (untouched since OCR)
- **User corrected** (edited during review)
- **Calculated** (output of the deterministic engine — always, for shares/totals)

Example: "AI extracted ₹320 → User corrected ₹350 → Calculated share ₹175." Implement this via the `user_edited` flag on `LineItem` plus provenance tags on `PersonResult` fields; never blur the distinction to simplify the UI.

---

## 18. Error Handling

User-facing messages only, mapped from internal error codes — never leak provider errors or stack traces:
- Extraction failure → "We couldn't read this bill clearly. Try another photo with better lighting."
- Reconciliation/calculation mismatch → "We found a mismatch in the bill. Please review the highlighted values."
- Unsupported file → "Please upload a JPG, PNG, or supported bill image."
All exceptions funneled through a single FastAPI exception handler that logs the real error server-side (with a correlation/request ID) and returns the sanitized message.

---

## 19. Security

- `GEMINI_API_KEY`, `MONGODB_URI`, etc. server-side only, via env vars (`.env`, never committed; ship `.env.example`).
- Validate file type/size/dimensions before any processing; reject path traversal in filenames; enforce request size limits.
- Rate-limit upload/extraction endpoints; avoid duplicate Gemini calls for the same image (hash-based idempotency).
- Never log API keys, full raw image bytes, or sensitive headers.
- Editing a price/quantity after verification never re-triggers a Gemini call — all post-confirmation math is local/server-side only (§21 performance).

---

## 20. UI/UX Direction

Premium financial-utility aesthetic, explicitly **not** a chatbot or generic AI-gradient dashboard:
- Warm off-white background, deep charcoal text, emerald/teal primary accent, amber for "needs review," red only for true errors, white elevated surfaces with thin borders, generous spacing, strong typographic hierarchy, large legible monetary figures, subtle shadows/micro-interactions.
- Color semantics: green = verified/reconciled, amber = needs review, red = error/mismatch, neutral = informational.
- **Landing screen:** hero "Split the bill. Not the friendship." / subtitle about photographing + assigning + instant breakdown; large drag-drop-or-camera upload zone; no registration.
- **Processing screen:** explicit progressive checklist ("✓ Reading your bill · ✓ Finding items · ◉ Checking numbers · ○ Preparing your bill"), not a bare spinner.
- **Review screen:** the best-built screen in the app — table/card hybrid, inline edit, confidence badges, printed-vs-calculated panel.
- **Assignment screen:** per-item "who ate this" chip selector, live remaining-quantity indicator, prevents over-allocation in the UI itself.
- **Result screen:** per-person cards with expandable itemized breakdown, plus a whole-bill reconciliation panel (items subtotal, discount, service charge, each tax, final total, people total, ✓ Fully reconciled).
- Mobile-first: large touch targets, sticky bottom actions, camera-first flow, expandable cards instead of tiny tables, swipe-friendly; desktop layout should feel equally considered, not just a stretched mobile view.
- Accessibility: semantic HTML, keyboard navigation, visible focus states, sufficient contrast, ARIA labels on custom controls (chip selectors, expandables).

---

## 21. Performance

- Compress/resize images client-side before upload where reasonable.
- Cache bill draft state client-side (TanStack Query) to avoid redundant fetches.
- **Never** call Gemini again for a price/quantity edit — recompute locally/server-side only.
- Lazy-load the result screen's per-person expandable breakdowns.
- Keep `calculation_service.py` allocation-free of I/O so it runs in milliseconds even for 10 people × 50 items.

---

## 22. Testing Matrix (minimum required, map 1:1 to test functions)

1. Single-person bill 2. Two people, equal shared item 3. One person owns all drinks 4. Seven people, uneven consumption 5. Multiple shared items 6. Differing quantities 7. GST/tax allocation correctness 8. Service charge allocation 9. Discount allocation 10. Rounding remainder distribution (property-test with `hypothesis`: for random pools/weights, `sum(allocate_proportionally(...))` always equals the input pool exactly) 11. Incorrect printed total surfaces a warning and never auto-corrects 12. Two-image bill merges correctly 13. Duplicate item across overlapping photos is deduplicated 14. Low-confidence field flagged and correctable via review UI 15. Zero/invalid quantity rejected with a clear validation error 16. Missing price handled as `null` + warning, not a crash or silent zero 17. Tax mismatch flagged by the verification agent 18. End-to-end reconciliation: `sum(person_totals) == verified_final_bill_total` for every fixture bill in the dataset.

Also: integration tests hitting the real API routes with mocked Gemini responses (never call the live model in CI), plus a small number of tests gated behind a manual/live flag that do call Gemini against the fixture images, for periodic accuracy tracking.

---

## 23. Definition of Done

Not "done" merely because an image uploads and a number appears. Done means, concretely and testably:
- [ ] All 18 tests in §22 pass, including the property-based rounding test.
- [ ] The incorrect-printed-total fixture bill produces the exact warning UI described in §13, without auto-correction.
- [ ] Two-photo bill with an overlapping item produces no duplicate line.
- [ ] Every `PersonResult.total` is traceable via provenance tags per §17.
- [ ] `GEMINI_API_KEY` never appears in any frontend bundle or client-visible response.
- [ ] Editing a confirmed bill's price never issues a new Gemini call (verified via a call-count assertion in tests).
- [ ] Mobile Lighthouse/accessibility pass on the review, assignment, and result screens.
- [ ] README covers setup, `.env.example`, running tests, and deployment.

---

## 24. Build Order (execute phases sequentially; each phase ends in a working, tested slice)

1. **Foundation** — repo scaffolding, FastAPI + Mongo + Gemini wiring, React/Vite/Tailwind/shadcn skeleton, env config, CI skeleton running lint+tests on empty suites.
2. **Image upload** — drag/drop + camera capture, multi-image, validation, preprocessing pipeline with unit tests on the quality/deskew functions.
3. **Extraction** — Gemini structured-output call, `BillDraft` schema validation, confidence handling.
4. **Verification** — arithmetic checks (deterministic) + AI verification call, `VerificationReport`.
5. **Human review UI** — the flagship screen; inline editing, printed-vs-calculated panel, confirm gate.
6. **People management** — add/rename/remove, no-auth ephemeral session.
7. **Assignments** — single/multi/everyone, fractional quantities, live remaining-quantity UI, optional NL-assist as a reviewable proposal.
8. **Calculation engine** — `money.py` largest-remainder allocator (with property tests first), then item/tax/service/discount allocation, then reconciliation.
9. **Result UI** — per-person cards, expandable breakdown, reconciliation panel, share/copy.
10. **Hardening** — full real-bill dataset run + scoring, edge-case tests, mobile pass, security review, load/perf pass on the calculation engine.

---

### Guiding priority order for every decision you make while building this

**Correctness → Transparency → Reliability → Human verification → Mobile UX → Performance → Security → Visual polish.**

Use AI for what it's good at (vision, OCR, language interpretation, assistance). Use deterministic code for everything involving money. Never let the two swap roles.
