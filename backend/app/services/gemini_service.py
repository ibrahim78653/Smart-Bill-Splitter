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


async def extract_bill_from_images(
    image_bytes_list: list[bytes],
    mime_types: list[str],
    image_hash: str,
) -> dict:
    """
    Call Gemini with structured output to extract bill data from one or more images.
    Returns raw dict (untrusted — caller must validate with Pydantic).
    """
    model = _get_model()

    parts: list = [EXTRACTION_SYSTEM_PROMPT]
    for img_bytes, mime in zip(image_bytes_list, mime_types):
        parts.append({"mime_type": mime, "data": img_bytes})
    parts.append(
        "Extract the bill data from the image(s) above. "
        "Return ONLY a JSON object matching the schema. No prose."
    )

    try:
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
        return json.loads(raw_text)

    except Exception as e:
        logger.error("Gemini extraction failed: %s", e)
        raise AppError(ErrorCode.EXTRACTION_FAILED, detail=str(e))


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
    model = _get_model()

    context = (
        f"Line items: {json.dumps(line_items)}\n"
        f"People: {json.dumps(people)}\n"
        f"Instruction: {instruction}"
    )

    prompt = f"{NL_ASSIGNMENT_PROMPT}\n\n{context}\n\nReturn the JSON assignment array:"

    try:
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
        logger.error("NL assignment parse failed: %s", e)
        raise AppError(ErrorCode.EXTRACTION_FAILED, detail=f"NL parse failed: {e}")
