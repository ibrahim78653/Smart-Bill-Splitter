# Smart Bill Splitter

A production-grade, mobile-first web app that photographs restaurant bills, extracts structured data via Gemini AI, assigns items to people, and computes exact per-person shares using a deterministic calculation engine.

**Non-negotiable invariant:** `sum(person.total for person in people) == verified_final_bill_total` — enforced in code, not just displayed.

---

## Architecture

| Layer | Technology | Role |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind | 5 screens: Upload → Review → People → Assign → Result |
| Backend | Python 3.11+ + FastAPI + Pydantic v2 | REST API, orchestration, validation |
| AI | Gemini (vision) | OCR extraction only — **never** arithmetic |
| DB | MongoDB (Motor async) | Bill storage |
| Money | `decimal.Decimal` (largest-remainder) | All rounding in `money.py` only |

---

## Setup

### Prerequisites
- Python 3.11+
- Node 18+
- MongoDB (local or Atlas)
- Gemini API Key

### Backend

```bash
cd backend

# 1. Copy env template
cp .env.example .env
# Edit .env — add your GEMINI_API_KEY and MONGODB_URI

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run the API
uvicorn app.main:app --reload --port 8000
```

API docs available at: http://localhost:8000/api/docs

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Run dev server
npm run dev
```

App runs at: http://localhost:5173

---

## Environment Variables

Copy `backend/.env.example` to `backend/.env`:

| Variable | Description | Default |
|---|---|---|
| `GEMINI_API_KEY` | **Required.** Your Google Gemini API key | — |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017` |
| `MONGODB_DB_NAME` | Database name | `bill_splitter` |
| `IMAGE_STORAGE_PATH` | Where uploaded images are stored | `./uploads` |
| `MAX_IMAGE_SIZE_MB` | Max image upload size | `15` |
| `CORS_ORIGINS` | Allowed CORS origins | `http://localhost:5173` |
| `LOG_LEVEL` | Logging level | `INFO` |

> ⚠️ **Never commit `.env` files.** The `.env.example` template is safe to commit.

---

## Running Tests

```bash
cd backend

# Run all unit tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=app --cov-report=html

# Run just the money/rounding property tests (hypothesis)
pytest tests/unit/test_money.py -v

# Run just calculation tests
pytest tests/unit/test_calculation_service.py -v
```

### Test Coverage (§22 — 18 required test cases)

| # | Test | File |
|---|---|---|
| 1 | Single-person bill | `test_calculation_service.py` |
| 2 | Two people, equal shared item | `test_calculation_service.py` |
| 3 | One person owns all drinks | `test_calculation_service.py` |
| 7 | GST/tax allocation | `test_calculation_service.py` |
| 8 | Service charge allocation | `test_calculation_service.py` |
| 9 | Discount allocation | `test_calculation_service.py` |
| 10 | Rounding remainder (hypothesis property test) | `test_money.py` |
| 11 | Incorrect printed total → warning, never auto-corrects | `test_calculation_service.py` |
| 15 | Zero quantity rejected | `test_calculation_service.py` |
| 16 | Missing price → null + warning, not crash | `test_calculation_service.py` |
| 18 | End-to-end reconciliation invariant | `test_calculation_service.py` |

---

## Key Design Decisions

1. **AI vs Deterministic boundary** — Gemini is called only for OCR. `calculation_service.py` has zero I/O and no AI calls.
2. **`money.py` is the single rounding authority** — largest-remainder method, guarantees `sum(allocations) == pool` exactly.
3. **Wrong printed total is a first-class feature** — `total_printed` and `total_calculated` are always stored separately; the UI shows both and never auto-merges.
4. **Provenance labels** — every value is tagged AI extracted / User corrected / Calculated.
5. **No financial arithmetic in frontend** — the frontend only formats and displays, never computes shares.

---

## Project Structure

```
Smart Bill Splitter/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app factory
│   │   ├── core/                # config, errors, logging, security
│   │   ├── models/              # Bill, Person, Calculation domain models
│   │   ├── schemas/             # Pydantic request/response schemas
│   │   ├── services/
│   │   │   ├── money.py         # THE ONLY place rounding happens
│   │   │   ├── calculation_service.py  # Pure deterministic engine (no I/O)
│   │   │   ├── reconciliation_service.py
│   │   │   ├── image_service.py
│   │   │   ├── gemini_service.py
│   │   │   ├── extraction_service.py
│   │   │   ├── verification_service.py
│   │   │   └── assignment_service.py
│   │   ├── repositories/        # MongoDB Motor async
│   │   └── api/routes/          # bills, people routes
│   └── tests/
│       └── unit/                # money, calculation, reconciliation tests
└── frontend/
    └── src/
        ├── pages/               # Landing, Processing, Review, People, Assignment, Result
        ├── store/               # Zustand session state
        └── lib/                 # API client, utilities
```

---

## Deployment

### Docker (optional)

```bash
# Run MongoDB + Backend + Frontend
docker-compose up
```

### Production

- Backend: `gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker`
- Frontend: `npm run build` then serve `dist/` from any static host
- Set `CORS_ORIGINS` to your production frontend URL
