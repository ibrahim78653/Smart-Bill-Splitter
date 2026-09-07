"""
verification_service.py — Arithmetic checks on extracted BillDraft.

Prefers deterministic code over a second AI call where the check is purely arithmetic.
Returns a VerificationReport (advisory only — never blocks progression, only flags).
"""
import logging
import statistics
from decimal import Decimal

from app.models.bill import Bill, LineItem
from app.schemas.extraction import VerificationIssue, VerificationReport
from app.services.money import CURRENCY_PRECISION, is_within_tolerance

logger = logging.getLogger(__name__)

QUANTITY_ZERO_TOLERANCE = Decimal("0")
PRICE_OUTLIER_FACTOR = Decimal("10")  # Flag if price is 10x median


def _check_line_arithmetic(item: LineItem, field_prefix: str) -> list[VerificationIssue]:
    """Check qty × unit_price ≈ line_total for a single line item."""
    issues: list[VerificationIssue] = []
    if (
        item.quantity is not None
        and item.unit_price is not None
        and item.line_total is not None
    ):
        computed = item.quantity * item.unit_price
        if not is_within_tolerance(computed, item.line_total, CURRENCY_PRECISION):
            issues.append(VerificationIssue(
                field=f"{field_prefix}.unit_price",
                severity="high",
                reason=(
                    f"OCR value inconsistent with line total: "
                    f"{item.quantity} × {item.unit_price} = {computed}, "
                    f"but printed total is {item.line_total}"
                ),
            ))
    return issues


def verify_bill(bill: Bill) -> VerificationReport:
    """
    Run all deterministic verification checks.
    Returns a VerificationReport annotating the draft — does NOT modify the bill.
    """
    issues: list[VerificationIssue] = []

    # 1. Per-line arithmetic consistency: qty × unit_price ≈ line_total
    for idx, item in enumerate(bill.line_items):
        field_prefix = f"line_items[{idx}]"
        issues.extend(_check_line_arithmetic(item, field_prefix))

    # 2. Sum of line items vs. printed subtotal
    if bill.subtotal_printed is not None:
        computed_sub = sum(
            (item.line_total or Decimal("0")) for item in bill.line_items
        )
        if not is_within_tolerance(computed_sub, bill.subtotal_printed, Decimal("0.05")):
            issues.append(VerificationIssue(
                field="subtotal_printed",
                severity="high",
                reason=(
                    f"Sum of line items (₹{computed_sub}) does not match "
                    f"printed subtotal (₹{bill.subtotal_printed}). "
                    f"Difference: ₹{bill.subtotal_printed - computed_sub}"
                ),
            ))

    # 3. Full reconciliation vs. printed total
    if bill.total_printed is not None and not bill.reconciles:
        issues.append(VerificationIssue(
            field="total_printed",
            severity="high",
            reason=(
                f"Printed total (₹{bill.total_printed}) does not reconcile with "
                f"calculated total (₹{bill.total_calculated}). "
                f"Difference: ₹{bill.reconciliation_diff}. "
                "Possible: printing error, missing item, unreadable charge, OCR mistake."
            ),
        ))

    # 4. Duplicate items
    names_seen: dict[str, int] = {}
    for idx, item in enumerate(bill.line_items):
        norm = item.name.strip().lower()
        if norm in names_seen:
            issues.append(VerificationIssue(
                field=f"line_items[{idx}].name",
                severity="medium",
                reason=f"Duplicate item name '{item.name}' (also at index {names_seen[norm]}). "
                       "Check if this is a cross-image duplicate.",
            ))
        names_seen[norm] = idx

    # 5. Suspicious quantities
    for idx, item in enumerate(bill.line_items):
        if item.quantity <= QUANTITY_ZERO_TOLERANCE:
            issues.append(VerificationIssue(
                field=f"line_items[{idx}].quantity",
                severity="high",
                reason=f"Quantity is {item.quantity} — must be > 0.",
            ))

    # 6. Price outlier detection (10x median)
    prices = [item.unit_price for item in bill.line_items if item.unit_price is not None]
    if len(prices) >= 3:
        median_price = Decimal(str(statistics.median(float(p) for p in prices)))
        for idx, item in enumerate(bill.line_items):
            if item.unit_price is not None and median_price > Decimal("0"):
                if item.unit_price > PRICE_OUTLIER_FACTOR * median_price:
                    issues.append(VerificationIssue(
                        field=f"line_items[{idx}].unit_price",
                        severity="medium",
                        reason=(
                            f"Unit price ₹{item.unit_price} is more than "
                            f"10× the median price ₹{median_price}. Possible OCR error."
                        ),
                    ))

    # 7. Low confidence fields
    for idx, item in enumerate(bill.line_items):
        from app.models.bill import Confidence
        for field_name, conf in item.confidence.items():
            if conf == Confidence.LOW:
                issues.append(VerificationIssue(
                    field=f"line_items[{idx}].{field_name}",
                    severity="low",
                    reason=f"Low confidence reading for '{field_name}' on item '{item.name}'. "
                           "Please verify this value.",
                ))

    # 8. Missing price (null price — flag, not crash)
    for idx, item in enumerate(bill.line_items):
        if item.unit_price is None and item.line_total is None:
            issues.append(VerificationIssue(
                field=f"line_items[{idx}].unit_price",
                severity="medium",
                reason=f"No price found for '{item.name}'. Please enter the price manually.",
            ))

    status = "needs_review" if any(i.severity in ("high", "medium") for i in issues) else "ok"

    return VerificationReport(status=status, issues=issues)
