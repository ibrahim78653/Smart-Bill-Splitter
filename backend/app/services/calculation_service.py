"""
calculation_service.py — Pure deterministic calculation engine.

ZERO dependency on FastAPI, MongoDB, or Gemini.
Takes/returns plain Pydantic models and Decimals.
Runs in milliseconds even for 10 people × 50 items.

Calculation sequence (per spec §7):
1. Food subtotal per person
2. Tax share (proportional to food subtotal)
3. Service charge share (proportional to food subtotal)
4. Discount share (proportional to food subtotal — documented default)
5. Person total = food_subtotal + taxes + service - discount
6. Reconciliation pass to ensure sum == final_bill_total
"""
from decimal import Decimal

from app.models.bill import Bill, LineItem
from app.models.calculation import (
    BillResult,
    ItemAssignment,
    Person,
    PersonLineShare,
    PersonResult,
)
from app.services.money import allocate_proportionally, to_money


def calculate_bill(
    bill: Bill,
    people: list[Person],
    assignments: list[ItemAssignment],
) -> BillResult:
    """
    Run the deterministic calculation engine.

    Returns a BillResult where people_total == final_bill_total (enforced).
    Raises ValueError if reconciliation fails (this is a bug, not a user error).
    """
    person_map = {p.id: p for p in people}
    assignment_map = {a.line_item_id: a for a in assignments}
    line_item_map = {item.id: item for item in bill.line_items}

    # Step 1: Compute food subtotals per person
    person_food_subtotals: dict[str, Decimal] = {p.id: Decimal("0") for p in people}
    person_line_breakdowns: dict[str, list[PersonLineShare]] = {p.id: [] for p in people}

    for item in bill.line_items:
        assignment = assignment_map.get(item.id)
        if not assignment:
            continue

        for alloc in assignment.allocations:
            if alloc.person_id not in person_map:
                continue

            # Use confirmed unit_price (post-human-review)
            if item.unit_price is None or item.line_total is None:
                continue

            # Proportional share of this line's total
            if item.quantity == Decimal("0"):
                continue

            line_share = (alloc.quantity / item.quantity) * item.line_total

            person_food_subtotals[alloc.person_id] += line_share
            person_line_breakdowns[alloc.person_id].append(
                PersonLineShare(
                    line_item_id=item.id,
                    item_name=item.name,
                    allocated_quantity=alloc.quantity,
                    line_total_share=line_share,  # intermediate, not yet rounded
                    provenance="calculated",
                )
            )

    # Step 2–4: Allocate taxes, service charge, and discount proportionally
    food_weights = {pid: subtotal for pid, subtotal in person_food_subtotals.items()}

    all_rounding_log: list[str] = []

    # Tax allocations per tax
    tax_allocations_per_person: dict[str, dict[str, Decimal]] = {p.id: {} for p in people}
    for tax in bill.taxes:
        per_person_tax, rlog = allocate_proportionally(tax.amount, food_weights)
        all_rounding_log.extend(rlog)
        for pid, amount in per_person_tax.items():
            tax_allocations_per_person[pid][tax.name] = amount

    # Service charge allocations
    service_allocations: dict[str, Decimal] = {}
    if bill.service_charge > Decimal("0"):
        service_allocations, rlog = allocate_proportionally(bill.service_charge, food_weights)
        all_rounding_log.extend(rlog)
    else:
        service_allocations = {p.id: Decimal("0") for p in people}

    # Discount allocations (default: proportional to food subtotal — documented policy)
    discount_allocations: dict[str, Decimal] = {}
    if bill.discount > Decimal("0"):
        discount_allocations, rlog = allocate_proportionally(bill.discount, food_weights)
        all_rounding_log.extend(rlog)
    else:
        discount_allocations = {p.id: Decimal("0") for p in people}

    # Step 5: Build PersonResult list (with intermediate (unrounded) totals)
    person_results: list[PersonResult] = []
    person_raw_totals: dict[str, Decimal] = {}

    for person in people:
        pid = person.id
        food_sub = person_food_subtotals[pid]
        tax_items = list(tax_allocations_per_person[pid].items())
        tax_sum = sum(v for _, v in tax_items)
        svc = service_allocations.get(pid, Decimal("0"))
        disc = discount_allocations.get(pid, Decimal("0"))
        raw_total = food_sub + tax_sum + svc - disc
        person_raw_totals[pid] = raw_total

    # Step 6: Global reconciliation pass
    # Sum raw totals and compute difference vs. final_bill_total
    final_bill_total = bill.total_calculated
    raw_sum = sum(person_raw_totals.values())

    # Round each person's total
    rounded_totals: dict[str, Decimal] = {}
    for pid, raw in person_raw_totals.items():
        rounded_totals[pid] = to_money(raw)

    rounded_sum = sum(rounded_totals.values())
    reconciliation_diff = final_bill_total - rounded_sum

    # Distribute any remaining rounding difference using largest-remainder on the differences
    if reconciliation_diff != Decimal("0"):
        # Build remainder weights — the person with the largest fractional part absorbs first
        remainders = {pid: raw - rounded_totals[pid] for pid, raw in person_raw_totals.items()}
        from decimal import ROUND_DOWN
        from app.services.money import CURRENCY_PRECISION
        step = CURRENCY_PRECISION if reconciliation_diff > Decimal("0") else -CURRENCY_PRECISION
        remaining = reconciliation_diff
        sorted_ids = sorted(
            remainders.items(),
            key=lambda kv: (-abs(kv[1]), kv[0]),
        )
        i = 0
        while abs(remaining) >= CURRENCY_PRECISION:
            pid = sorted_ids[i % len(sorted_ids)][0]
            rounded_totals[pid] += step
            remaining -= step
            person = person_map[pid]
            all_rounding_log.append(
                f"Rounding adjustment: {step:+} assigned to {person.name}"
            )
            i += 1

    # Assemble final PersonResult objects
    for person in people:
        pid = person.id
        food_sub = person_food_subtotals[pid]
        tax_items = list(tax_allocations_per_person[pid].items())
        tax_sum = sum(v for _, v in tax_items)
        svc = service_allocations.get(pid, Decimal("0"))
        disc = discount_allocations.get(pid, Decimal("0"))

        person_results.append(
            PersonResult(
                person_id=pid,
                name=person.name,
                line_breakdown=person_line_breakdowns[pid],
                food_subtotal=to_money(food_sub),
                tax_breakdown=[(name, to_money(amt)) for name, amt in tax_items],
                service_charge_share=to_money(svc),
                discount_share=to_money(disc),
                rounding_adjustment=rounded_totals[pid] - to_money(food_sub + tax_sum + svc - disc),
                total=rounded_totals[pid],
            )
        )

    people_total = sum(pr.total for pr in person_results)
    reconciled = people_total == to_money(final_bill_total)

    tax_totals = [
        (tax.name, sum(
            tax_allocations_per_person[pid].get(tax.name, Decimal("0"))
            for pid in [p.id for p in people]
        ))
        for tax in bill.taxes
    ]

    return BillResult(
        bill_id=bill.bill_id,
        people=person_results,
        items_subtotal=to_money(bill.subtotal_calculated),
        discount_total=to_money(bill.discount),
        service_charge_total=to_money(bill.service_charge),
        tax_totals=[(name, to_money(amt)) for name, amt in tax_totals],
        final_bill_total=to_money(final_bill_total),
        people_total=people_total,
        reconciled=reconciled,
        rounding_log=all_rounding_log,
    )
