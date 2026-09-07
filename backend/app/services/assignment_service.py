"""Assignment validation service."""
from decimal import Decimal

from app.core.errors import AppError, ErrorCode
from app.models.bill import Bill, LineItem
from app.models.calculation import ItemAssignment, Person, PersonAllocation
from app.services.money import CURRENCY_PRECISION


def validate_assignment(
    assignment: ItemAssignment,
    bill: Bill,
    people: list[Person],
) -> None:
    """
    Validate that:
    1. line_item_id exists in the bill
    2. All person_ids exist in people
    3. sum(allocations.quantity) == line_item.quantity (within tolerance)
    4. No quantity <= 0
    """
    item_map = {item.id: item for item in bill.line_items}
    person_ids = {p.id for p in people}

    item = item_map.get(assignment.line_item_id)
    if item is None:
        raise AppError(
            ErrorCode.VALIDATION_ERROR,
            detail=f"Line item {assignment.line_item_id!r} not found in bill",
        )

    for alloc in assignment.allocations:
        if alloc.person_id not in person_ids:
            raise AppError(
                ErrorCode.VALIDATION_ERROR,
                detail=f"Person {alloc.person_id!r} not found",
            )
        if alloc.quantity <= Decimal("0"):
            raise AppError(
                ErrorCode.VALIDATION_ERROR,
                detail=f"Quantity must be > 0, got {alloc.quantity}",
            )

    allocated_total = sum(a.quantity for a in assignment.allocations)
    if abs(allocated_total - item.quantity) > CURRENCY_PRECISION:
        raise AppError(
            ErrorCode.ASSIGNMENT_UNDER_ALLOCATED,
            detail=(
                f"Item '{item.name}': allocated {allocated_total} "
                f"but item quantity is {item.quantity}"
            ),
        )
    if allocated_total > item.quantity + CURRENCY_PRECISION:
        raise AppError(
            ErrorCode.ASSIGNMENT_OVER_ALLOCATED,
            detail=f"Item '{item.name}': over-allocated {allocated_total} > {item.quantity}",
        )


def validate_all_assignments_complete(
    bill: Bill,
    assignments: list[ItemAssignment],
) -> None:
    """Ensure every line item has a complete assignment."""
    assigned_ids = {a.line_item_id for a in assignments}
    for item in bill.line_items:
        if item.id not in assigned_ids:
            raise AppError(
                ErrorCode.ASSIGNMENT_INCOMPLETE,
                detail=f"Item '{item.name}' (id={item.id}) has no assignment",
            )
