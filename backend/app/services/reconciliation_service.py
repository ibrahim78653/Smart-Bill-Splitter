"""
reconciliation_service.py — Invariant enforcement.

Asserts sum(person_totals) == final_bill_total before any result is returned.
If they don't match, this is a BUG — raise 500, never ship an unreconciled result.
"""
from decimal import Decimal

from app.core.errors import AppError, ErrorCode
from app.models.calculation import BillResult
from app.services.money import CURRENCY_PRECISION, to_money


def assert_reconciled(result: BillResult) -> None:
    """
    Final invariant check: sum(person.total) must equal final_bill_total exactly.

    Raises AppError with RECONCILIATION_MISMATCH if not.
    This error maps to HTTP 500 — it signals a calculation bug.
    """
    expected = result.final_bill_total
    actual = sum(pr.total for pr in result.people)

    if actual != expected:
        diff = expected - actual
        raise AppError(
            ErrorCode.RECONCILIATION_MISMATCH,
            detail=(
                f"CALCULATION BUG: sum(person_totals)={actual} != "
                f"final_bill_total={expected}, diff={diff}"
            ),
            status_code=500,
        )


def verify_assignment_completeness(
    line_item_quantity: Decimal,
    allocated_total: Decimal,
    item_id: str,
) -> None:
    """Ensure an item's allocated quantity matches the line item quantity exactly."""
    if abs(allocated_total - line_item_quantity) > CURRENCY_PRECISION:
        raise AppError(
            ErrorCode.ASSIGNMENT_UNDER_ALLOCATED,
            detail=f"Item {item_id}: allocated={allocated_total}, required={line_item_quantity}",
        )
    if allocated_total > line_item_quantity + CURRENCY_PRECISION:
        raise AppError(
            ErrorCode.ASSIGNMENT_OVER_ALLOCATED,
            detail=f"Item {item_id}: allocated={allocated_total} > quantity={line_item_quantity}",
        )
