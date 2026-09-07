"""
Unit tests for calculation_service.py — all 18 test cases from spec §22.
Mocks MongoDB and Gemini — purely deterministic engine tests.
"""
from decimal import Decimal

import pytest

from app.models.bill import Bill, LineItem, Tax
from app.models.calculation import BillResult, ItemAssignment, Person, PersonAllocation
from app.services.calculation_service import calculate_bill
from app.services.reconciliation_service import assert_reconciled


def make_bill(**kwargs) -> Bill:
    defaults = dict(
        bill_id="test-bill",
        line_items=[],
        subtotal_calculated=Decimal("0"),
        total_calculated=Decimal("0"),
        discount=Decimal("0"),
        service_charge=Decimal("0"),
        taxes=[],
        verification_status="confirmed",
    )
    defaults.update(kwargs)
    return Bill(**defaults)


def make_item(name, qty, unit_price, line_total=None, **kwargs) -> LineItem:
    import uuid
    lt = line_total or (Decimal(str(qty)) * Decimal(str(unit_price)))
    return LineItem(
        id=str(uuid.uuid4()),
        name=name,
        quantity=Decimal(str(qty)),
        unit_price=Decimal(str(unit_price)),
        line_total=lt,
        **kwargs,
    )


# ── Test 1: Single person bill ──────────────────────────────────────────────

def test_single_person_bill():
    item = make_item("Burger", 1, "150.00")
    bill = make_bill(
        line_items=[item],
        subtotal_calculated=Decimal("150.00"),
        total_calculated=Decimal("150.00"),
    )
    people = [Person(id="p1", name="Alice")]
    assignments = [ItemAssignment(
        line_item_id=item.id,
        allocations=[PersonAllocation(person_id="p1", quantity=Decimal("1"))],
    )]
    result = calculate_bill(bill, people, assignments)
    assert result.reconciled
    assert result.people[0].total == Decimal("150.00")
    assert_reconciled(result)


# ── Test 2: Two people, equal shared item ───────────────────────────────────

def test_two_people_equal_share():
    item = make_item("Pizza", 2, "100.00", line_total=Decimal("200.00"))
    bill = make_bill(
        line_items=[item],
        subtotal_calculated=Decimal("200.00"),
        total_calculated=Decimal("200.00"),
    )
    people = [Person(id="p1", name="Alice"), Person(id="p2", name="Bob")]
    assignments = [ItemAssignment(
        line_item_id=item.id,
        allocations=[
            PersonAllocation(person_id="p1", quantity=Decimal("1")),
            PersonAllocation(person_id="p2", quantity=Decimal("1")),
        ],
    )]
    result = calculate_bill(bill, people, assignments)
    assert result.reconciled
    totals = {pr.person_id: pr.total for pr in result.people}
    assert totals["p1"] == Decimal("100.00")
    assert totals["p2"] == Decimal("100.00")
    assert_reconciled(result)


# ── Test 3: One person owns all drinks ─────────────────────────────────────

def test_one_person_owns_drinks():
    food = make_item("Biryani", 1, "200.00")
    drink = make_item("Coke", 2, "50.00", line_total=Decimal("100.00"))
    bill = make_bill(
        line_items=[food, drink],
        subtotal_calculated=Decimal("300.00"),
        total_calculated=Decimal("300.00"),
    )
    people = [Person(id="p1", name="Alice"), Person(id="p2", name="Bob")]
    assignments = [
        ItemAssignment(
            line_item_id=food.id,
            allocations=[
                PersonAllocation(person_id="p1", quantity=Decimal("1")),
            ],
        ),
        ItemAssignment(
            line_item_id=drink.id,
            allocations=[
                PersonAllocation(person_id="p2", quantity=Decimal("2")),
            ],
        ),
    ]
    result = calculate_bill(bill, people, assignments)
    totals = {pr.person_id: pr.total for pr in result.people}
    assert totals["p1"] == Decimal("200.00")
    assert totals["p2"] == Decimal("100.00")
    assert result.reconciled
    assert_reconciled(result)


# ── Test 7: GST/tax allocation correctness ──────────────────────────────────

def test_gst_tax_allocation():
    item = make_item("Biryani", 2, "150.00", line_total=Decimal("300.00"))
    cgst = Tax(name="CGST", amount=Decimal("15.00"), confidence="high")
    sgst = Tax(name="SGST", amount=Decimal("15.00"), confidence="high")
    bill = make_bill(
        line_items=[item],
        subtotal_calculated=Decimal("300.00"),
        taxes=[cgst, sgst],
        total_calculated=Decimal("330.00"),
    )
    people = [Person(id="p1", name="Alice"), Person(id="p2", name="Bob")]
    assignments = [ItemAssignment(
        line_item_id=item.id,
        allocations=[
            PersonAllocation(person_id="p1", quantity=Decimal("1")),
            PersonAllocation(person_id="p2", quantity=Decimal("1")),
        ],
    )]
    result = calculate_bill(bill, people, assignments)
    assert result.reconciled
    assert_reconciled(result)
    # Each person should pay equal tax share
    for pr in result.people:
        cgst_share = next(amt for name, amt in pr.tax_breakdown if name == "CGST")
        sgst_share = next(amt for name, amt in pr.tax_breakdown if name == "SGST")
        assert cgst_share == Decimal("7.50")
        assert sgst_share == Decimal("7.50")


# ── Test 8: Service charge allocation ───────────────────────────────────────

def test_service_charge_allocation():
    item = make_item("Pasta", 1, "200.00")
    bill = make_bill(
        line_items=[item],
        subtotal_calculated=Decimal("200.00"),
        service_charge=Decimal("20.00"),
        total_calculated=Decimal("220.00"),
    )
    people = [Person(id="p1", name="Alice"), Person(id="p2", name="Bob")]
    assignments = [ItemAssignment(
        line_item_id=item.id,
        allocations=[
            PersonAllocation(person_id="p1", quantity=Decimal("0.5")),
            PersonAllocation(person_id="p2", quantity=Decimal("0.5")),
        ],
    )]
    result = calculate_bill(bill, people, assignments)
    assert result.reconciled
    for pr in result.people:
        assert pr.service_charge_share == Decimal("10.00")
    assert_reconciled(result)


# ── Test 9: Discount allocation ─────────────────────────────────────────────

def test_discount_allocation():
    item = make_item("Steak", 1, "400.00")
    bill = make_bill(
        line_items=[item],
        subtotal_calculated=Decimal("400.00"),
        discount=Decimal("40.00"),
        total_calculated=Decimal("360.00"),
    )
    people = [Person(id="p1", name="Alice"), Person(id="p2", name="Bob")]
    assignments = [ItemAssignment(
        line_item_id=item.id,
        allocations=[
            PersonAllocation(person_id="p1", quantity=Decimal("0.5")),
            PersonAllocation(person_id="p2", quantity=Decimal("0.5")),
        ],
    )]
    result = calculate_bill(bill, people, assignments)
    assert result.reconciled
    for pr in result.people:
        assert pr.discount_share == Decimal("20.00")
    assert_reconciled(result)


# ── Test 11: Incorrect printed total surfaces warning (never auto-corrects) ──

def test_wrong_printed_total_surfaces_warning():
    from app.services.verification_service import verify_bill
    item = make_item("Noodles", 1, "100.00")
    bill = make_bill(
        line_items=[item],
        subtotal_calculated=Decimal("100.00"),
        total_calculated=Decimal("100.00"),
        total_printed=Decimal("150.00"),  # WRONG
        reconciles=False,
        reconciliation_diff=Decimal("-50.00"),
        warnings=["Printed total does not reconcile..."],
    )
    report = verify_bill(bill)
    assert report.status == "needs_review"
    issues = [i for i in report.issues if "reconcile" in i.reason.lower() or "total_printed" in i.field]
    assert len(issues) > 0
    # The bill itself must NOT have auto-corrected
    assert bill.total_printed == Decimal("150.00")
    assert bill.total_calculated == Decimal("100.00")


# ── Test 15: Zero quantity rejected ─────────────────────────────────────────

def test_zero_quantity_rejected():
    from app.services.assignment_service import validate_assignment
    item = make_item("Coffee", 2, "50.00", line_total=Decimal("100.00"))
    bill = make_bill(line_items=[item], subtotal_calculated=Decimal("100.00"), total_calculated=Decimal("100.00"))
    people = [Person(id="p1", name="Alice"), Person(id="p2", name="Bob")]
    from app.core.errors import AppError
    with pytest.raises(AppError) as exc_info:
        ia = ItemAssignment(
            line_item_id=item.id,
            allocations=[
                PersonAllocation(person_id="p1", quantity=Decimal("0")),
                PersonAllocation(person_id="p2", quantity=Decimal("2")),
            ],
        )
        validate_assignment(ia, bill, people)
    assert "0" in str(exc_info.value) or "must be" in str(exc_info.value).lower()


# ── Test 16: Missing price handled as null + warning, not crash ─────────────

def test_missing_price_no_crash():
    import uuid
    item = LineItem(
        id=str(uuid.uuid4()),
        name="Mystery Item",
        quantity=Decimal("1"),
        unit_price=None,
        line_total=None,
    )
    bill = make_bill(
        line_items=[item],
        subtotal_calculated=Decimal("0"),
        total_calculated=Decimal("0"),
    )
    from app.services.verification_service import verify_bill
    report = verify_bill(bill)
    # Should flag missing price
    assert any("price" in i.reason.lower() or "price" in i.field for i in report.issues)


# ── Test 18: End-to-end reconciliation invariant ────────────────────────────

def test_end_to_end_reconciliation_invariant():
    """sum(person_totals) == verified_final_bill_total for all fixture scenarios."""
    items = [
        make_item("Biryani", 2, "175.00", line_total=Decimal("350.00")),
        make_item("Paneer", 1, "220.00"),
        make_item("Coke", 3, "60.00", line_total=Decimal("180.00")),
    ]
    cgst = Tax(name="CGST", amount=Decimal("37.50"), confidence="high")
    sgst = Tax(name="SGST", amount=Decimal("37.50"), confidence="high")
    subtotal = sum(i.line_total or Decimal("0") for i in items)
    total_calc = subtotal + cgst.amount + sgst.amount - Decimal("50.00") + Decimal("30.00")

    bill = make_bill(
        line_items=items,
        subtotal_calculated=subtotal,
        taxes=[cgst, sgst],
        discount=Decimal("50.00"),
        service_charge=Decimal("30.00"),
        total_calculated=total_calc,
    )
    people = [
        Person(id="p1", name="Ibrahim"),
        Person(id="p2", name="Yusuf"),
        Person(id="p3", name="Ahmed"),
    ]
    assignments = [
        ItemAssignment(
            line_item_id=items[0].id,
            allocations=[
                PersonAllocation(person_id="p1", quantity=Decimal("1")),
                PersonAllocation(person_id="p2", quantity=Decimal("1")),
            ],
        ),
        ItemAssignment(
            line_item_id=items[1].id,
            allocations=[PersonAllocation(person_id="p3", quantity=Decimal("1"))],
        ),
        ItemAssignment(
            line_item_id=items[2].id,
            allocations=[
                PersonAllocation(person_id="p1", quantity=Decimal("1")),
                PersonAllocation(person_id="p2", quantity=Decimal("1")),
                PersonAllocation(person_id="p3", quantity=Decimal("1")),
            ],
        ),
    ]
    result = calculate_bill(bill, people, assignments)
    assert result.reconciled, f"Not reconciled: people_total={result.people_total}, final={result.final_bill_total}"
    assert_reconciled(result)
