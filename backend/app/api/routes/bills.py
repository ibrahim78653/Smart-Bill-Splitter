"""Bills API routes — upload, extract, verify, confirm, update."""
import logging
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.errors import AppError, ErrorCode
from app.core.security import (
    ALLOWED_MIME_TYPES,
    compute_image_hash,
    validate_file_extension,
    validate_file_size,
    validate_filename,
)
from app.models.bill import Bill, WorkflowStage
from app.repositories import bill_repository
from app.schemas.extraction import VerificationReport
from app.services import extraction_service, verification_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/bills", tags=["bills"])


# ── Upload ─────────────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_bill(files: list[UploadFile] = File(...)):
    """Upload 1+ images, create Bill in pending state."""
    if not files:
        raise AppError(ErrorCode.VALIDATION_ERROR, "At least one image is required")
    if len(files) > 5:
        raise AppError(ErrorCode.VALIDATION_ERROR, "Maximum 5 images per bill")

    settings = get_settings()
    settings.image_storage_path.mkdir(parents=True, exist_ok=True)

    bill_id = str(uuid.uuid4())
    saved_paths: list[str] = []

    for upload in files:
        filename = validate_filename(upload.filename or "upload.jpg")
        validate_file_extension(filename)

        data = await upload.read()
        validate_file_size(len(data), settings.max_image_size_mb)

        # Store with bill_id prefix
        safe_path = settings.image_storage_path / f"{bill_id}_{filename}"
        safe_path.write_bytes(data)
        saved_paths.append(str(safe_path))

    bill = Bill(
        bill_id=bill_id,
        source_images=saved_paths,
        workflow_stage=WorkflowStage.UPLOAD,
        verification_status="pending",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    await bill_repository.create_bill(bill)

    return {"bill_id": bill_id, "image_count": len(saved_paths), "status": "pending"}


# ── Extract ────────────────────────────────────────────────────────────────────

@router.post("/{bill_id}/extract")
async def extract_bill(bill_id: str):
    """Run image preprocessing + Gemini extraction → BillDraft."""
    bill = await _get_bill_or_404(bill_id)

    if not bill.source_images:
        raise AppError(ErrorCode.VALIDATION_ERROR, "No images to extract from")

    # Load images from disk
    image_bytes_list: list[bytes] = []
    mime_types: list[str] = []

    for path_str in bill.source_images:
        p = Path(path_str)
        if not p.exists():
            raise AppError(ErrorCode.INVALID_IMAGE, f"Image file missing: {p.name}")
        data = p.read_bytes()
        image_bytes_list.append(data)
        ext = p.suffix.lower()
        mime = {
            ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".png": "image/png", ".heic": "image/heic", ".heif": "image/heif",
        }.get(ext, "image/jpeg")
        mime_types.append(mime)

    updated_bill = await extraction_service.extract_bill(
        bill_id=bill_id,
        image_bytes_list=image_bytes_list,
        mime_types=mime_types,
        existing_bill=bill,
    )
    await bill_repository.update_bill(updated_bill)

    return updated_bill.model_dump(mode="json")


# ── Verify ─────────────────────────────────────────────────────────────────────

@router.post("/{bill_id}/verify")
async def verify_bill(bill_id: str) -> VerificationReport:
    """Run arithmetic verification checks → VerificationReport."""
    bill = await _get_bill_or_404(bill_id)
    report = verification_service.verify_bill(bill)

    # Update verification_status based on report
    new_status = "needs_review" if report.status == "needs_review" else bill.verification_status
    updated = bill.model_copy(update={
        "verification_status": new_status,
        "workflow_stage": WorkflowStage.HUMAN_REVIEW,
        "updated_at": datetime.utcnow(),
    })
    await bill_repository.update_bill(updated)

    return report


# ── Get Bill ───────────────────────────────────────────────────────────────────

@router.get("/{bill_id}")
async def get_bill(bill_id: str):
    """Fetch current bill state."""
    bill = await _get_bill_or_404(bill_id)
    return bill.model_dump(mode="json")


# ── Update Bill (human corrections) ───────────────────────────────────────────

class BillUpdateRequest(BaseModel):
    merchant_name: str | None = None
    bill_number: str | None = None
    currency: str | None = None
    line_items: list | None = None
    subtotal_printed: str | None = None
    discount: str | None = None
    service_charge: str | None = None
    taxes: list | None = None
    total_printed: str | None = None


@router.put("/{bill_id}")
async def update_bill(bill_id: str, body: BillUpdateRequest):
    """Human corrections to any field. Recomputes calculated totals. Never calls Gemini."""
    from decimal import Decimal
    from app.models.bill import LineItem, Tax
    from app.services.money import is_within_tolerance, CURRENCY_PRECISION

    bill = await _get_bill_or_404(bill_id)

    updates: dict = {"updated_at": datetime.utcnow()}

    if body.merchant_name is not None:
        updates["merchant_name"] = body.merchant_name
    if body.bill_number is not None:
        updates["bill_number"] = body.bill_number
    if body.currency is not None:
        updates["currency"] = body.currency
    if body.discount is not None:
        updates["discount"] = Decimal(body.discount)
    if body.service_charge is not None:
        updates["service_charge"] = Decimal(body.service_charge)
    if body.total_printed is not None:
        updates["total_printed"] = Decimal(body.total_printed)

    if body.line_items is not None:
        new_items: list[LineItem] = []
        for raw in body.line_items:
            existing = next((i for i in bill.line_items if i.id == raw.get("id")), None)
            if existing:
                # Mark user_edited if any numeric field changed
                edited = (
                    str(existing.quantity) != str(raw.get("quantity", existing.quantity))
                    or str(existing.unit_price) != str(raw.get("unit_price", existing.unit_price))
                    or str(existing.line_total) != str(raw.get("line_total", existing.line_total))
                )
                new_items.append(existing.model_copy(update={
                    "name": raw.get("name", existing.name),
                    "quantity": Decimal(str(raw["quantity"])) if "quantity" in raw else existing.quantity,
                    "unit_price": Decimal(str(raw["unit_price"])) if raw.get("unit_price") else existing.unit_price,
                    "line_total": Decimal(str(raw["line_total"])) if raw.get("line_total") else existing.line_total,
                    "user_edited": existing.user_edited or edited,
                }))
            else:
                new_items.append(existing or bill.line_items[0])  # fallback
        updates["line_items"] = new_items

    if body.taxes is not None:
        updates["taxes"] = [
            Tax(
                name=t["name"],
                rate=Decimal(str(t["rate"])) if t.get("rate") else None,
                amount=Decimal(str(round(float(t["amount"])))),
                confidence=t.get("confidence", "medium"),
            )
            for t in body.taxes
        ]

    updated_bill = bill.model_copy(update=updates)

    # Recompute calculated fields
    line_items = updated_bill.line_items
    subtotal_calculated = sum((i.line_total or Decimal("0")) for i in line_items)
    discount = updated_bill.discount
    service_charge = updated_bill.service_charge
    taxes = updated_bill.taxes
    total_calculated = subtotal_calculated - discount + service_charge + sum(t.amount for t in taxes)

    reconciles = False
    reconciliation_diff = None
    if updated_bill.total_printed is not None:
        reconciliation_diff = updated_bill.total_printed - total_calculated
        reconciles = is_within_tolerance(updated_bill.total_printed, total_calculated)

    updated_bill = updated_bill.model_copy(update={
        "subtotal_calculated": subtotal_calculated,
        "total_calculated": total_calculated,
        "reconciles": reconciles,
        "reconciliation_diff": reconciliation_diff,
    })

    await bill_repository.update_bill(updated_bill)
    return updated_bill.model_dump(mode="json")


# ── Confirm ────────────────────────────────────────────────────────────────────

@router.post("/{bill_id}/confirm")
async def confirm_bill(bill_id: str):
    """Lock verification_status → confirmed. Only way to unlock the People step."""
    bill = await _get_bill_or_404(bill_id)

    updated = bill.model_copy(update={
        "verification_status": "confirmed",
        "workflow_stage": WorkflowStage.PEOPLE_SETUP,
        "updated_at": datetime.utcnow(),
    })
    await bill_repository.update_bill(updated)
    return {"status": "confirmed", "workflow_stage": WorkflowStage.PEOPLE_SETUP.value}


# ── Helper ─────────────────────────────────────────────────────────────────────

async def _get_bill_or_404(bill_id: str) -> Bill:
    bill = await bill_repository.get_bill(bill_id)
    if bill is None:
        raise AppError(ErrorCode.BILL_NOT_FOUND, status_code=404)
    return bill
