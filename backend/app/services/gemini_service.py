"""
gemini_service.py — ALL Gemini API calls live here and ONLY here.

Rules (per spec §2):
- Called only from the backend, never from the frontend.
- Uses structured output / JSON schema mode — never free-form text parsing.
- Every output is UNTRUSTED — it passes through Pydantic validation before use.
- Two distinct calls: extraction and NL-assignment-parse.
"""
import json
import logging
import re
from decimal import Decimal

import google.generativeai as genai
from pydantic import BaseModel, ValidationError

from app.core.config import get_settings
from app.core.errors import AppError, ErrorCode
from app.schemas.extraction import BillDraftResponse, ExtractionLineItem

logger = logging.getLogger(__name__)


def _get_model(model_name: str | None = None) -> genai.GenerativeModel:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise AppError(ErrorCode.EXTRACTION_FAILED, "GEMINI_API_KEY not configured")
    genai.configure(api_key=settings.gemini_api_key)
    return genai.GenerativeModel(model_name or settings.gemini_model)


def _unwrap(v: object) -> object:
    """
    Unwrap a value that might be wrapped in a dict like:
      {'value': '123', 'confidence': 'high', 'source_text': '123'}
      {'source_text': '123', 'confidence': 'high'}
    Returns the inner scalar, or the dict unchanged if it's a real object.
    """
    if isinstance(v, dict):
        if "value" in v:
            return _unwrap(v["value"])
        if "source_text" in v and len(v) <= 3 and "value" not in v:
            return v.get("source_text")
    return v


def _unwrap_conf(v: object, default: str = "medium") -> str:
    """Extract confidence string ('high' | 'medium' | 'low') from wrapped dict or direct value."""
    if isinstance(v, dict) and "confidence" in v:
        val = str(v["confidence"]).lower()
        if val in ("high", "medium", "low"):
            return val
    elif isinstance(v, str) and v.lower() in ("high", "medium", "low"):
        return v.lower()
    return default


def _clean_decimal_str(v: object) -> object:
    """Strip thousand-separator commas, currency symbols, and percent signs from numeric values."""
    if v is None:
        return None
    if isinstance(v, (int, float, Decimal)):
        return str(v)
    if isinstance(v, str):
        s = v.strip().replace(",", "")
        s = re.sub(r"^[₹$€£\s]+", "", s)
        if s.endswith("%"):
            s = s[:-1].strip()
        return s
    return v


def normalize_extraction_output(raw: dict) -> dict:
    """
    Normalize the raw Gemini response dict to match our BillDraftResponse schema.

    Handles both flat and nested JSON hierarchies produced by Gemini's inbuilt OCR:
    - Nested containers: 'merchant' -> 'name', 'invoice' -> 'invoice_number' / 'date', 'totals' -> 'subtotal' / 'taxes' / 'grand_total'
    - Wrapped scalar objects: {'value': ..., 'confidence': ..., 'source_text': ...}
    - Field aliases: 'restaurant_name', 'items', 'total_price', 'discount'/'discounts'
    """
    out: dict = {}

    merchant_obj = raw.get("merchant") if isinstance(raw.get("merchant"), dict) else {}
    invoice_obj = raw.get("invoice") if isinstance(raw.get("invoice"), dict) else {}
    totals_obj = raw.get("totals") if isinstance(raw.get("totals"), dict) else {}

    # ── Top-level field aliases ──────────────────────────────────────────────
    # merchant_name
    merchant_raw = (
        raw.get("merchant_name")
        or raw.get("restaurant_name")
        or raw.get("merchant")
        or merchant_obj.get("name")
    )
    out["merchant_name"] = _clean_decimal_str(_unwrap(merchant_raw)) if merchant_raw else None

    # bill_number
    bill_num_raw = (
        raw.get("bill_number")
        or raw.get("invoice_number")
        or raw.get("bill_no")
        or raw.get("invoice_no")
        or invoice_obj.get("invoice_number")
        or invoice_obj.get("bill_number")
    )
    unwrapped_num = _unwrap(bill_num_raw)
    out["bill_number"] = str(unwrapped_num) if unwrapped_num is not None else None

    # bill_date
    bill_date_raw = (
        raw.get("bill_date")
        or raw.get("date")
        or invoice_obj.get("date")
        or invoice_obj.get("bill_date")
    )
    unwrapped_date = _unwrap(bill_date_raw)
    out["bill_date"] = str(unwrapped_date) if unwrapped_date is not None else None

    # currency
    out["currency"] = str(_unwrap(raw.get("currency") or totals_obj.get("currency")) or "INR")

    # subtotal
    subtotal_raw = (
        raw.get("subtotal")
        or totals_obj.get("subtotal")
        or totals_obj.get("sub_total")
    )
    subtotal_val = _unwrap(subtotal_raw)
    out["subtotal"] = _clean_decimal_str(subtotal_val) if subtotal_val is not None else None

    # discount
    discount_raw = (
        raw.get("discount")
        or totals_obj.get("discount")
        or totals_obj.get("discounts")
    )
    if isinstance(discount_raw, list):
        discount_val = discount_raw[0] if len(discount_raw) > 0 else None
    else:
        discount_val = discount_raw
    discount_unwrapped = _unwrap(discount_val)
    out["discount"] = _clean_decimal_str(discount_unwrapped) if discount_unwrapped is not None else None

    # service_charge
    sc_raw = (
        raw.get("service_charge")
        or totals_obj.get("service_charge")
        or totals_obj.get("serviceCharge")
    )
    sc_val = _unwrap(sc_raw)
    out["service_charge"] = _clean_decimal_str(sc_val) if sc_val is not None else None

    # total
    total_raw = (
        raw.get("total")
        or raw.get("grand_total")
        or totals_obj.get("grand_total")
        or totals_obj.get("total")
        or totals_obj.get("final_total")
    )
    total_val = _unwrap(total_raw)
    out["total"] = _clean_decimal_str(total_val) if total_val is not None else None

    # confidence fields
    out["subtotal_confidence"] = _unwrap_conf(subtotal_raw, str(raw.get("subtotal_confidence", "medium")))
    out["total_confidence"] = _unwrap_conf(total_raw, str(raw.get("total_confidence", "medium")))

    # warnings
    out["warnings"] = raw.get("warnings", [])

    # ── Line items ───────────────────────────────────────────────────────────
    raw_items = raw.get("line_items") or raw.get("items") or []
    normalized_items = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        ni: dict = {}
        # name: may be 'name', 'description', 'item_name', or wrapped
        name_raw = item.get("name") or item.get("description") or item.get("item_name")
        name_val = _unwrap(name_raw)
        ni["name"] = str(name_val) if name_val is not None else "Unknown Item"

        # quantity
        qty_raw = item.get("quantity") or item.get("qty") or item.get("count")
        qty_val = _unwrap(qty_raw)
        ni["quantity"] = _clean_decimal_str(qty_val) if qty_val is not None else None

        # unit_price
        up_raw = item.get("unit_price") or item.get("rate") or item.get("price")
        up_val = _unwrap(up_raw)
        ni["unit_price"] = _clean_decimal_str(up_val) if up_val is not None else None

        # line_total: may be 'line_total', 'total_price', 'total', or 'amount'
        lt_raw = (
            item.get("line_total")
            or item.get("total_price")
            or item.get("total")
            or item.get("amount")
        )
        lt_val = _unwrap(lt_raw)
        ni["line_total"] = _clean_decimal_str(lt_val) if lt_val is not None else None

        # category
        ni["category"] = _unwrap(item.get("category"))

        # confidence fields
        ni["name_confidence"] = _unwrap_conf(name_raw, _unwrap_conf(item.get("name_confidence"), "medium"))
        ni["quantity_confidence"] = _unwrap_conf(qty_raw, _unwrap_conf(item.get("quantity_confidence"), "medium"))
        ni["unit_price_confidence"] = _unwrap_conf(up_raw, _unwrap_conf(item.get("unit_price_confidence"), "medium"))
        ni["line_total_confidence"] = _unwrap_conf(lt_raw, _unwrap_conf(item.get("line_total_confidence"), "medium"))

        # source_text
        source_text = None
        if isinstance(name_raw, dict) and "source_text" in name_raw:
            source_text = name_raw["source_text"]
        elif "source_text" in item:
            source_text = _unwrap(item["source_text"])
        ni["source_text"] = source_text

        normalized_items.append(ni)
    out["line_items"] = normalized_items

    # ── Taxes ────────────────────────────────────────────────────────────────
    raw_taxes = raw.get("taxes") or totals_obj.get("taxes") or []
    normalized_taxes = []
    for tax in raw_taxes:
        if not isinstance(tax, dict):
            continue
        nt: dict = {}
        # name: may be 'name', 'description', 'tax_name', etc.
        name_raw = tax.get("name") or tax.get("description") or tax.get("tax_name")
        name_val = _unwrap(name_raw)
        nt["name"] = str(name_val) if name_val is not None else "Tax"

        # rate
        rate_raw = tax.get("rate") or tax.get("percentage")
        rate_val = _unwrap(rate_raw)
        nt["rate"] = _clean_decimal_str(rate_val) if rate_val is not None else None

        # amount
        amount_raw = tax.get("amount") or tax.get("tax_amount") or tax.get("value")
        amount_val = _unwrap(amount_raw)
        nt["amount"] = _clean_decimal_str(amount_val) if amount_val is not None else "0"

        # confidence
        nt["confidence"] = _unwrap_conf(amount_raw, _unwrap_conf(tax.get("confidence"), "medium"))

        normalized_taxes.append(nt)
    out["taxes"] = normalized_taxes

    return out


# ── Bill Extraction ───────────────────────────────────────────────────────────

EXTRACTION_SYSTEM_PROMPT = """You are a precise bill OCR system. Extract structured data from restaurant bill images.

STRICT RULES:
1. Read ONLY what is visibly printed. Never infer or invent a value that isn't legible.
2. If a field cannot be confidently read, return null — do NOT guess.
3. Return a confidence label per field: "high" (>=0.9), "medium" (0.6-0.9), or "low" (<0.6).
4. Return source_text showing the exact text you read from the image.
5. Distinguish quantity from unit price — do NOT conflate multi-line items.
6. Identify EACH tax line SEPARATELY — never merge CGST/SGST/GST into one.
7. Identify subtotal, every tax line, service charge, discount, and total as DISTINCT fields.
8. If multiple images are provided, treat them as ONE continuous bill. If the same item appears in overlapping regions, include it ONLY ONCE.
9. Output ONLY valid JSON matching the provided schema — no prose, no markdown fences.
"""

EXTRACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "merchant_name": {"type": ["string", "null"]},
        "bill_number": {"type": ["string", "null"]},
        "bill_date": {"type": ["string", "null"], "description": "ISO date YYYY-MM-DD or null"},
        "currency": {"type": "string", "default": "INR"},
        "line_items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "quantity": {"type": ["string", "null"], "description": "Numeric string"},
                    "unit_price": {"type": ["string", "null"], "description": "Numeric string"},
                    "line_total": {"type": ["string", "null"], "description": "Numeric string"},
                    "category": {"type": ["string", "null"]},
                    "name_confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                    "quantity_confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                    "unit_price_confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                    "line_total_confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                    "source_text": {"type": ["string", "null"]},
                },
                "required": ["name"],
            },
        },
        "subtotal": {"type": ["string", "null"], "description": "Numeric string"},
        "discount": {"type": ["string", "null"], "description": "Numeric string"},
        "service_charge": {"type": ["string", "null"], "description": "Numeric string"},
        "taxes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "rate": {"type": ["string", "null"]},
                    "amount": {"type": "string"},
                    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                },
                "required": ["name", "amount"],
            },
        },
        "total": {"type": ["string", "null"], "description": "Numeric string"},
        "subtotal_confidence": {"type": "string", "enum": ["high", "medium", "low"]},
        "total_confidence": {"type": "string", "enum": ["high", "medium", "low"]},
        "warnings": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["line_items"],
}


CANDIDATE_MODELS = [
    "gemini-flash-latest",
    "gemini-3.5-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
]


async def extract_bill_from_images(
    image_bytes_list: list[bytes],
    mime_types: list[str],
    image_hash: str,
) -> dict:
    """
    Call Gemini with structured output to extract bill data from one or more images.
    Returns raw dict (untrusted — caller must validate with Pydantic).
    Tries configured model first, then falls back to candidate models if quota exceeded.
    """
    settings = get_settings()
    models_to_try = [settings.gemini_model] + [m for m in CANDIDATE_MODELS if m != settings.gemini_model]

    parts: list = [EXTRACTION_SYSTEM_PROMPT]
    for img_bytes, mime in zip(image_bytes_list, mime_types):
        parts.append({"mime_type": mime, "data": img_bytes})
    parts.append(
        "Extract the bill data from the image(s) above. "
        "Return ONLY a JSON object matching the schema. No prose."
    )

    last_error: Exception | None = None
    for model_name in models_to_try:
        try:
            model = _get_model(model_name)
            response = model.generate_content(
                parts,
                generation_config=genai.GenerationConfig(
                    response_mime_type="application/json",
                    temperature=0.0,
                ),
            )
            raw_text = response.text.strip()
            # Strip any accidental markdown fences
            if raw_text.startswith("```"):
                raw_text = raw_text.split("```")[1]
                if raw_text.startswith("json"):
                    raw_text = raw_text[4:]
            data = json.loads(raw_text)
            return normalize_extraction_output(data)
        except Exception as e:
            logger.warning("Gemini extraction with model %s failed: %s", model_name, e)
            last_error = e

    logger.error("All Gemini extraction model candidates failed: %s", last_error)
    raise AppError(ErrorCode.EXTRACTION_FAILED, detail=str(last_error))


# ── NL Assignment Parse ───────────────────────────────────────────────────────

NL_ASSIGNMENT_PROMPT = """You are helping parse natural-language assignment instructions for a bill split.
Given the list of line items and people, parse the free-text instruction into structured assignments.

RULES:
1. Return ONLY a JSON array of assignments — no prose.
2. If an item is ambiguous, include it with a warning field.
3. "Everyone" means all people in the provided list.
4. Quantities must be numeric and sum to the item's total quantity.
5. Return null for items not mentioned in the instruction — they will remain unassigned.
"""

NL_ASSIGNMENT_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "line_item_id": {"type": "string"},
            "allocations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "person_id": {"type": "string"},
                        "quantity": {"type": "string", "description": "Numeric string"},
                    },
                    "required": ["person_id", "quantity"],
                },
            },
            "warning": {"type": ["string", "null"]},
        },
        "required": ["line_item_id", "allocations"],
    },
}


async def parse_assignment_instruction(
    instruction: str,
    line_items: list[dict],
    people: list[dict],
) -> list[dict]:
    """
    Parse natural-language assignment instruction into a structured proposal.
    This is ADVISORY only — the user must confirm before it's applied.
    """
    settings = get_settings()
    models_to_try = [settings.gemini_model] + [m for m in CANDIDATE_MODELS if m != settings.gemini_model]

    context = (
        f"Line items: {json.dumps(line_items)}\n"
        f"People: {json.dumps(people)}\n"
        f"Instruction: {instruction}"
    )

    prompt = f"{NL_ASSIGNMENT_PROMPT}\n\n{context}\n\nReturn the JSON assignment array:"

    last_error: Exception | None = None
    for model_name in models_to_try:
        try:
            model = _get_model(model_name)
            response = model.generate_content(
                prompt,
                generation_config=genai.GenerationConfig(
                    response_mime_type="application/json",
                    temperature=0.0,
                ),
            )
            raw_text = response.text.strip()
            if raw_text.startswith("```"):
                raw_text = raw_text.split("```")[1]
                if raw_text.startswith("json"):
                    raw_text = raw_text[4:]
            return json.loads(raw_text)
        except Exception as e:
            logger.warning("NL assignment parse with model %s failed: %s", model_name, e)
            last_error = e

    logger.error("All Gemini NL parse model candidates failed: %s", last_error)
    raise AppError(ErrorCode.EXTRACTION_FAILED, detail=f"NL parse failed: {last_error}")
