"""Pydantic schemas for extraction pipeline — mirrors BillDraft before human verification."""
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.bill import Confidence, SourceRef, Tax


def _unwrap(v: Any) -> Any:
    """
    Gemini wraps every field as {"value": <actual>, "confidence": ..., "source_text": ...}.
    Unwrap to the raw value so downstream validators can coerce normally.
    """
    if isinstance(v, dict) and "value" in v:
        return v["value"]
    return v


def _unwrap_str(v: Any) -> str | None:
    v = _unwrap(v)
    if v is None:
        return None
    return str(v).strip() if str(v).strip() else None


def _unwrap_decimal(v: Any) -> Decimal | None:
    v = _unwrap(v)
    if v is None or v == "":
        return None
    try:
        return Decimal(str(v))
    except Exception:
        return None


class ExtractionLineItem(BaseModel):
    name: str
    quantity: Decimal | None = None
    unit_price: Decimal | None = None
    line_total: Decimal | None = None
    category: str | None = None
    name_confidence: Confidence = Confidence.MEDIUM
    quantity_confidence: Confidence = Confidence.MEDIUM
    unit_price_confidence: Confidence = Confidence.MEDIUM
    line_total_confidence: Confidence = Confidence.MEDIUM
    source_text: str | None = None
    warnings: list[str] = Field(default_factory=list)

    @field_validator("name", mode="before")
    @classmethod
    def coerce_name(cls, v: Any) -> str:
        result = _unwrap_str(v)
        return result or "Unknown item"

    @field_validator("quantity", "unit_price", "line_total", mode="before")
    @classmethod
    def coerce_decimal(cls, v: Any) -> Decimal | None:
        # Gemini may return price/quantity fields as {"value": X, ...}
        return _unwrap_decimal(v)

    @field_validator("category", mode="before")
    @classmethod
    def coerce_category(cls, v: Any) -> str | None:
        return _unwrap_str(v)

    @model_validator(mode="before")
    @classmethod
    def remap_gemini_item_fields(cls, data: Any) -> Any:
        """
        Gemini sometimes uses different field names:
          price / total  →  unit_price / line_total
        Also extracts confidence from nested objects.
        """
        if not isinstance(data, dict):
            return data

        # Field name remapping
        if "price" in data and "unit_price" not in data:
            data["unit_price"] = data.pop("price")
        if "total" in data and "line_total" not in data:
            data["line_total"] = data.pop("total")
        if "total_price" in data and "line_total" not in data:
            data["line_total"] = data.pop("total_price")

        # Extract confidence levels from nested objects
        for field, conf_key in [
            ("name", "name_confidence"),
            ("quantity", "quantity_confidence"),
            ("unit_price", "unit_price_confidence"),
            ("line_total", "line_total_confidence"),
        ]:
            if isinstance(data.get(field), dict):
                raw = data[field]
                conf_val = raw.get("confidence", "medium")
                try:
                    data[conf_key] = Confidence(conf_val)
                except ValueError:
                    data[conf_key] = Confidence.MEDIUM

        return data


class ExtractionTax(BaseModel):
    name: str
    rate: Decimal | None = None
    amount: Decimal = Decimal("0")
    confidence: Confidence = Confidence.MEDIUM

    @field_validator("name", mode="before")
    @classmethod
    def coerce_name(cls, v: Any) -> str:
        result = _unwrap_str(v)
        return result or "Tax"

    @field_validator("rate", "amount", mode="before")
    @classmethod
    def coerce_decimal(cls, v: Any) -> Decimal | None:
        return _unwrap_decimal(v)

    @model_validator(mode="before")
    @classmethod
    def remap_gemini_tax_fields(cls, data: Any) -> Any:
        """Extract confidence from the name field if it's a wrapped object."""
        if not isinstance(data, dict):
            return data
        if isinstance(data.get("name"), dict):
            conf_val = data["name"].get("confidence", "medium")
            try:
                data["confidence"] = Confidence(conf_val)
            except ValueError:
                data["confidence"] = Confidence.MEDIUM
        return data


class BillDraftResponse(BaseModel):
    """Raw AI extraction output — all fields optional, all amounts strings → Decimal."""
    merchant_name: str | None = None
    bill_number: str | None = None
    bill_date: str | None = None
    currency: str = "INR"
    line_items: list[ExtractionLineItem] = Field(default_factory=list)
    subtotal: Decimal | None = None
    discount: Decimal | None = None
    service_charge: Decimal | None = None
    taxes: list[ExtractionTax] = Field(default_factory=list)
    total: Decimal | None = None
    subtotal_confidence: Confidence = Confidence.MEDIUM
    total_confidence: Confidence = Confidence.MEDIUM
    warnings: list[str] = Field(default_factory=list)

    @field_validator("merchant_name", "bill_number", "bill_date", "currency", mode="before")
    @classmethod
    def coerce_str(cls, v: Any) -> Any:
        return _unwrap_str(v) if v is not None else v

    @field_validator("subtotal", "discount", "service_charge", "total", mode="before")
    @classmethod
    def coerce_decimal(cls, v: Any) -> Decimal | None:
        return _unwrap_decimal(v)

    @model_validator(mode="before")
    @classmethod
    def remap_gemini_bill_fields(cls, data: Any) -> Any:
        """
        Normalise top-level field name variations Gemini may return:
          restaurant_name  →  merchant_name
          invoice_number / invoice_no  →  bill_number
          date  →  bill_date
          items  →  line_items
        """
        if not isinstance(data, dict):
            return data

        renames = {
            "restaurant_name": "merchant_name",
            "invoice_number": "bill_number",
            "invoice_no": "bill_number",
            "bill_no": "bill_number",
            "date": "bill_date",
            "items": "line_items",
        }
        for old, new in renames.items():
            if old in data and new not in data:
                data[new] = data.pop(old)

        # Unwrap confidence-annotated scalar fields
        for field in ("merchant_name", "bill_number", "bill_date", "currency",
                      "subtotal", "discount", "service_charge", "total"):
            if isinstance(data.get(field), dict) and "value" in data[field]:
                data[field] = data[field]["value"]

        return data


class VerificationIssue(BaseModel):
    field: str
    severity: str  # "high", "medium", "low"
    reason: str


class VerificationReport(BaseModel):
    status: str  # "ok", "needs_review"
    issues: list[VerificationIssue] = Field(default_factory=list)
