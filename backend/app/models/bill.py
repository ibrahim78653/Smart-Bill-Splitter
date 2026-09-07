"""
Core domain models (Pydantic v2).
These are the authoritative data shapes — mirrored in the frontend Zod schemas.
All monetary fields use Decimal; floats are never used for money.
"""
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class Confidence(str, Enum):
    HIGH = "high"    # >= 0.9
    MEDIUM = "medium"  # 0.6 – 0.9
    LOW = "low"      # < 0.6 or field is null


class SourceRef(BaseModel):
    source_text: str | None = None
    bounding_box: tuple[float, float, float, float] | None = None
    image_index: int = 0


class LineItem(BaseModel):
    id: str
    name: str
    quantity: Decimal
    unit_price: Decimal | None = None
    line_total: Decimal | None = None
    category: str | None = None
    confidence: dict[str, Confidence] = Field(default_factory=dict)
    source: SourceRef = Field(default_factory=SourceRef)
    warnings: list[str] = Field(default_factory=list)
    user_edited: bool = False  # True once a human touches this field


class Tax(BaseModel):
    name: str  # e.g. "CGST", "SGST", "GST"
    rate: Decimal | None = None
    amount: Decimal
    confidence: Confidence = Confidence.MEDIUM


class WorkflowStage(str, Enum):
    UPLOAD = "UPLOAD"
    IMAGE_PREPROCESSING = "IMAGE_PREPROCESSING"
    EXTRACTION = "EXTRACTION"
    VALIDATION = "VALIDATION"
    AI_VERIFICATION = "AI_VERIFICATION"
    HUMAN_REVIEW = "HUMAN_REVIEW"
    PEOPLE_SETUP = "PEOPLE_SETUP"
    ASSIGNMENT = "ASSIGNMENT"
    ASSIGNMENT_VALIDATION = "ASSIGNMENT_VALIDATION"
    DETERMINISTIC_CALCULATION = "DETERMINISTIC_CALCULATION"
    RECONCILIATION = "RECONCILIATION"
    RESULT = "RESULT"


class Bill(BaseModel):
    bill_id: str
    merchant_name: str | None = None
    bill_number: str | None = None
    bill_date: date | None = None
    currency: str = "INR"
    line_items: list[LineItem] = Field(default_factory=list)
    subtotal_printed: Decimal | None = None  # What the AI read off the paper
    subtotal_calculated: Decimal = Decimal("0")  # sum(line_items) — always computed
    discount: Decimal = Decimal("0")
    service_charge: Decimal = Decimal("0")
    taxes: list[Tax] = Field(default_factory=list)
    total_printed: Decimal | None = None
    total_calculated: Decimal = Decimal("0")  # subtotal_calc - discount + service + taxes
    reconciles: bool = False  # total_printed == total_calculated within tolerance
    reconciliation_diff: Decimal | None = None
    verification_status: Literal["pending", "needs_review", "confirmed"] = "pending"
    workflow_stage: WorkflowStage = WorkflowStage.UPLOAD
    warnings: list[str] = Field(default_factory=list)
    source_images: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
