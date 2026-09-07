"""
extraction_service.py — Orchestrates image preprocessing → Gemini extraction → BillDraft.
Handles multi-image bills and deduplication.
"""
import logging
import uuid
from datetime import date, datetime
from decimal import Decimal

from app.core.errors import AppError, ErrorCode
from app.core.security import compute_image_hash
from app.models.bill import Bill, Confidence, LineItem, SourceRef, Tax, WorkflowStage
from app.schemas.extraction import BillDraftResponse, ExtractionLineItem
from app.services import gemini_service, image_service
from app.services.money import compute_line_total, is_within_tolerance, CURRENCY_PRECISION

logger = logging.getLogger(__name__)


async def extract_bill(
    bill_id: str,
    image_bytes_list: list[bytes],
    mime_types: list[str],
    existing_bill: Bill,
) -> Bill:
    """
    Full extraction pipeline:
    1. Preprocess each image (quality check + enhance)
    2. Call Gemini structured output extraction
    3. Validate + coerce AI output through Pydantic
    4. Build confirmed Bill model with computed fields
    5. Deduplicate any cross-image duplicate line items
    """
    # Step 1: Preprocess
    processed_images: list[bytes] = []
    all_warnings: list[str] = list(existing_bill.warnings)

    for idx, (img_bytes, mime) in enumerate(zip(image_bytes_list, mime_types)):
        try:
            processed, quality_warnings = image_service.preprocess_image(img_bytes)
            processed_images.append(processed)
            for w in quality_warnings:
                all_warnings.append(f"Image {idx + 1}: {w}")
        except Exception as e:
            logger.warning("Image preprocessing failed for image %d: %s", idx, e)
            processed_images.append(img_bytes)
            all_warnings.append(f"Image {idx + 1}: Preprocessing skipped ({e})")

    # Step 2: Gemini extraction (hash-based idempotency)
    image_hash = compute_image_hash(b"".join(image_bytes_list))
    raw_data = await gemini_service.extract_bill_from_images(
        processed_images, mime_types, image_hash
    )

    # Step 3: Validate through Pydantic (untrusted → trusted)
    try:
        draft = BillDraftResponse.model_validate(raw_data)
    except Exception as e:
        logger.error("BillDraft validation failed: %s | raw=%s", e, raw_data)
        raise AppError(ErrorCode.EXTRACTION_FAILED, detail=f"Schema validation: {e}")

    # Step 4: Build LineItems with verification
    line_items: list[LineItem] = []
    for idx, raw_item in enumerate(draft.line_items):
        item_warnings: list[str] = list(raw_item.warnings)

        # Arithmetic consistency check per line item
        if (
            raw_item.quantity is not None
            and raw_item.unit_price is not None
            and raw_item.line_total is not None
        ):
            computed = compute_line_total(raw_item.quantity, raw_item.unit_price)
            if not is_within_tolerance(computed, raw_item.line_total):
                item_warnings.append(
                    f"Line arithmetic mismatch: {raw_item.quantity} × {raw_item.unit_price} "
                    f"= {computed}, but printed total is {raw_item.line_total}"
                )

        if raw_item.quantity is not None and raw_item.quantity <= Decimal("0"):
            item_warnings.append("Quantity is zero or negative")

        line_items.append(
            LineItem(
                id=str(uuid.uuid4()),
                name=raw_item.name,
                quantity=raw_item.quantity or Decimal("1"),
                unit_price=raw_item.unit_price,
                line_total=raw_item.line_total,
                category=raw_item.category,
                confidence={
                    "name": raw_item.name_confidence,
                    "quantity": raw_item.quantity_confidence,
                    "unit_price": raw_item.unit_price_confidence,
                    "line_total": raw_item.line_total_confidence,
                },
                source=SourceRef(
                    source_text=raw_item.source_text,
                    image_index=0,
                ),
                warnings=item_warnings,
                user_edited=False,
            )
        )

    # Step 5: Deduplicate (same name + same price across overlapping images)
    line_items = _deduplicate_items(line_items)

    # Compute subtotal
    subtotal_calculated = sum(
        (item.line_total or Decimal("0")) for item in line_items
    )

    # Taxes
    taxes: list[Tax] = [
        Tax(
            name=t.name,
            rate=t.rate,
            amount=t.amount,
            confidence=t.confidence,
        )
        for t in draft.taxes
    ]

    discount = draft.discount or Decimal("0")
    service_charge = draft.service_charge or Decimal("0")

    # Compute total_calculated
    total_calculated = (
        subtotal_calculated
        - discount
        + service_charge
        + sum(t.amount for t in taxes)
    )

    # Reconciliation check
    reconciles = False
    reconciliation_diff = None
    if draft.total is not None:
        reconciliation_diff = draft.total - total_calculated
        reconciles = is_within_tolerance(draft.total, total_calculated)
        if not reconciles:
            all_warnings.append(
                f"Printed total (₹{draft.total}) does not reconcile with calculated "
                f"total (₹{total_calculated}). Difference: ₹{reconciliation_diff}. "
                "Possible reasons: printing error · missing item · unreadable charge · OCR mistake"
            )

    # Parse bill date
    bill_date_parsed = None
    if draft.bill_date:
        try:
            bill_date_parsed = date.fromisoformat(draft.bill_date)
        except ValueError:
            all_warnings.append(f"Could not parse bill date: {draft.bill_date!r}")

    return existing_bill.model_copy(
        update=dict(
            merchant_name=draft.merchant_name,
            bill_number=draft.bill_number,
            bill_date=bill_date_parsed,
            currency=draft.currency or "INR",
            line_items=line_items,
            subtotal_printed=draft.subtotal,
            subtotal_calculated=subtotal_calculated,
            discount=discount,
            service_charge=service_charge,
            taxes=taxes,
            total_printed=draft.total,
            total_calculated=total_calculated,
            reconciles=reconciles,
            reconciliation_diff=reconciliation_diff,
            verification_status="needs_review" if not reconciles or any(
                item.warnings for item in line_items
            ) else "pending",
            workflow_stage=WorkflowStage.VALIDATION,
            warnings=all_warnings,
            updated_at=datetime.utcnow(),
        )
    )


def _deduplicate_items(items: list[LineItem]) -> list[LineItem]:
    """
    Remove duplicate line items that may appear in overlapping multi-image scans.
    Deduplication key: (normalized_name, unit_price).
    """
    seen: dict[tuple, LineItem] = {}
    unique: list[LineItem] = []

    for item in items:
        norm_name = item.name.strip().lower()
        key = (norm_name, item.unit_price)
        if key in seen:
            logger.info("Deduplicating item '%s' (duplicate across images)", item.name)
            continue
        seen[key] = item
        unique.append(item)

    return unique
