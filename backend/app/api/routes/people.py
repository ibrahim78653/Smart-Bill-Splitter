"""People management and assignment routes."""
import logging
import uuid
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.errors import AppError, ErrorCode
from app.models.bill import WorkflowStage
from app.models.calculation import ItemAssignment, Person, PersonAllocation
from app.repositories import bill_repository
from app.services import assignment_service
from app.services.gemini_service import parse_assignment_instruction

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/bills", tags=["people", "assignments"])


# ── People ─────────────────────────────────────────────────────────────────────

class PeopleRequest(BaseModel):
    people: list[dict]  # [{id?: str, name: str}]


@router.post("/{bill_id}/people")
async def manage_people(bill_id: str, body: PeopleRequest):
    """Add/rename/remove people (2–10). Ephemeral, no auth required."""
    bill = await _get_bill_or_404(bill_id)

    if bill.verification_status != "confirmed":
        raise AppError(ErrorCode.BILL_NOT_CONFIRMED)

    if not (2 <= len(body.people) <= 10):
        raise AppError(
            ErrorCode.VALIDATION_ERROR,
            "Between 2 and 10 people required",
        )

    people: list[Person] = []
    for p in body.people:
        pid = p.get("id") or str(uuid.uuid4())
        name = p.get("name", "").strip()
        if not name:
            raise AppError(ErrorCode.VALIDATION_ERROR, "Person name cannot be empty")
        people.append(Person(id=pid, name=name))

    await bill_repository.save_people(bill_id, people)

    # Advance workflow stage
    updated_bill = bill.model_copy(update={
        "workflow_stage": WorkflowStage.ASSIGNMENT,
        "updated_at": datetime.utcnow(),
    })
    await bill_repository.update_bill(updated_bill)

    return {"people": [p.model_dump() for p in people]}


@router.get("/{bill_id}/people")
async def get_people(bill_id: str):
    people = await bill_repository.get_people(bill_id)
    return {"people": [p.model_dump() for p in people]}


# ── Assignments ────────────────────────────────────────────────────────────────

class AssignmentRequest(BaseModel):
    assignments: list[dict]


@router.post("/{bill_id}/assignments")
async def save_assignments(bill_id: str, body: AssignmentRequest):
    """Create/update item→people allocations. Validates allocation invariants."""
    bill = await _get_bill_or_404(bill_id)
    people = await bill_repository.get_people(bill_id)

    if not people:
        raise AppError(ErrorCode.VALIDATION_ERROR, "Add people before assigning items")

    assignments: list[ItemAssignment] = []
    for raw in body.assignments:
        allocs = [
            PersonAllocation(
                person_id=a["person_id"],
                quantity=Decimal(str(a["quantity"])),
            )
            for a in raw.get("allocations", [])
        ]
        ia = ItemAssignment(
            line_item_id=raw["line_item_id"],
            allocations=allocs,
        )
        # Validate each assignment
        assignment_service.validate_assignment(ia, bill, people)
        assignments.append(ia)

    await bill_repository.save_assignments(bill_id, assignments)

    updated_bill = bill.model_copy(update={
        "workflow_stage": WorkflowStage.ASSIGNMENT_VALIDATION,
        "updated_at": datetime.utcnow(),
    })
    await bill_repository.update_bill(updated_bill)

    return {"assignments_saved": len(assignments)}


@router.get("/{bill_id}/assignments")
async def get_assignments(bill_id: str):
    assignments = await bill_repository.get_assignments(bill_id)
    return {"assignments": [a.model_dump(mode="json") for a in assignments]}


# ── NL Assignment Parse ────────────────────────────────────────────────────────

class NLParseRequest(BaseModel):
    instruction: str


@router.post("/{bill_id}/assignments/parse")
async def parse_nl_assignments(bill_id: str, body: NLParseRequest):
    """
    Parse natural-language assignment instruction → proposal (ADVISORY ONLY).
    User must review and confirm — this never writes assignments directly.
    """
    bill = await _get_bill_or_404(bill_id)
    people = await bill_repository.get_people(bill_id)

    line_items_ctx = [
        {"id": item.id, "name": item.name, "quantity": str(item.quantity)}
        for item in bill.line_items
    ]
    people_ctx = [{"id": p.id, "name": p.name} for p in people]

    raw_proposal = await parse_assignment_instruction(
        instruction=body.instruction,
        line_items=line_items_ctx,
        people=people_ctx,
    )

    # Validate proposal through Pydantic (untrusted AI output)
    proposals = []
    for raw in raw_proposal:
        try:
            allocs = [
                PersonAllocation(
                    person_id=a["person_id"],
                    quantity=Decimal(str(a["quantity"])),
                )
                for a in raw.get("allocations", [])
            ]
            proposals.append({
                "line_item_id": raw["line_item_id"],
                "allocations": [a.model_dump(mode="json") for a in allocs],
                "warning": raw.get("warning"),
            })
        except Exception as e:
            logger.warning("Invalid NL proposal item: %s | %s", raw, e)

    return {"proposal": proposals, "advisory": True}


# ── Calculate ──────────────────────────────────────────────────────────────────

@router.post("/{bill_id}/calculate")
async def calculate_bill(bill_id: str):
    """Run deterministic calculation engine → BillResult."""
    from app.services.calculation_service import calculate_bill as calc
    from app.services.reconciliation_service import assert_reconciled

    bill = await _get_bill_or_404(bill_id)

    if bill.verification_status != "confirmed":
        raise AppError(ErrorCode.BILL_NOT_CONFIRMED)

    people = await bill_repository.get_people(bill_id)
    assignments = await bill_repository.get_assignments(bill_id)

    if not people:
        raise AppError(ErrorCode.VALIDATION_ERROR, "No people added")

    # Validate completeness
    assignment_service.validate_all_assignments_complete(bill, assignments)

    # Run deterministic engine
    result = calc(bill, people, assignments)

    # Assert reconciliation invariant — raises 500 if broken
    assert_reconciled(result)

    # Save and return
    await bill_repository.save_result(result)

    updated_bill = bill.model_copy(update={
        "workflow_stage": WorkflowStage.RESULT,
        "updated_at": datetime.utcnow(),
    })
    await bill_repository.update_bill(updated_bill)

    return result.model_dump(mode="json")


@router.get("/{bill_id}/result")
async def get_result(bill_id: str):
    """Fetch final calculation result."""
    result = await bill_repository.get_result(bill_id)
    if result is None:
        raise AppError(ErrorCode.BILL_NOT_FOUND, "No result yet — run calculate first", status_code=404)
    return result.model_dump(mode="json")


async def _get_bill_or_404(bill_id: str):
    from app.repositories.bill_repository import get_bill
    bill = await get_bill(bill_id)
    if bill is None:
        raise AppError(ErrorCode.BILL_NOT_FOUND, status_code=404)
    return bill
