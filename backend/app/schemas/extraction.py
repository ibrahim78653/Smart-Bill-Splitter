"""Pydantic schemas for extraction pipeline — mirrors BillDraft before human verification."""
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.models.bill import Confidence, SourceRef, Tax


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

    @field_validator("quantity", "unit_price", "line_total", mode="before")
    @classmethod
    def coerce_decimal(cls, v: Any) -> Decimal | None:
        if v is None or v == "":
            return None
        try:
            return Decimal(str(v))
        except Exception:
            return None


class ExtractionTax(BaseModel):
    name: str
    rate: Decimal | None = None
    amount: Decimal
    confidence: Confidence = Confidence.MEDIUM

    @field_validator("rate", "amount", mode="before")
    @classmethod
    def coerce_decimal(cls, v: Any) -> Decimal | None:
        if v is None or v == "":
            return None
        try:
            return Decimal(str(v))
        except Exception:
            return None


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

    @field_validator("subtotal", "discount", "service_charge", "total", mode="before")
    @classmethod
    def coerce_decimal(cls, v: Any) -> Decimal | None:
        if v is None or v == "":
            return None
        try:
            return Decimal(str(v))
        except Exception:
            return None


class VerificationIssue(BaseModel):
    field: str
    severity: str  # "high", "medium", "low"
    reason: str


class VerificationReport(BaseModel):
    status: str  # "ok", "needs_review"
    issues: list[VerificationIssue] = Field(default_factory=list)
