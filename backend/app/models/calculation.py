"""Person, Assignment, and Calculation result models."""
from decimal import Decimal

from pydantic import BaseModel, Field, model_validator


class Person(BaseModel):
    id: str
    name: str


class PersonAllocation(BaseModel):
    person_id: str
    quantity: Decimal  # Fractional allowed, e.g. 0.5


class ItemAssignment(BaseModel):
    line_item_id: str
    allocations: list[PersonAllocation] = Field(default_factory=list)
    # Validated: sum(allocations.quantity) == line_item.quantity


class PersonLineShare(BaseModel):
    line_item_id: str
    item_name: str
    allocated_quantity: Decimal
    line_total_share: Decimal
    provenance: str = "calculated"  # always "calculated" for computed shares


class PersonResult(BaseModel):
    person_id: str
    name: str
    line_breakdown: list[PersonLineShare] = Field(default_factory=list)
    food_subtotal: Decimal
    tax_breakdown: list[tuple[str, Decimal]] = Field(default_factory=list)
    service_charge_share: Decimal = Decimal("0")
    discount_share: Decimal = Decimal("0")
    rounding_adjustment: Decimal = Decimal("0")
    total: Decimal


class BillResult(BaseModel):
    bill_id: str
    people: list[PersonResult]
    items_subtotal: Decimal
    discount_total: Decimal
    service_charge_total: Decimal
    tax_totals: list[tuple[str, Decimal]] = Field(default_factory=list)
    final_bill_total: Decimal
    people_total: Decimal
    reconciled: bool  # people_total == final_bill_total — must be True to ship
    rounding_log: list[str] = Field(default_factory=list)
