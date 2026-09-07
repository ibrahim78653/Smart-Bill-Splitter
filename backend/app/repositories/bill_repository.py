"""MongoDB repository for Bill documents using Motor async driver."""
import logging
from datetime import datetime
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import DESCENDING

from app.core.config import get_settings
from app.models.bill import Bill
from app.models.calculation import BillResult, ItemAssignment, Person

logger = logging.getLogger(__name__)

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


def get_db() -> AsyncIOMotorDatabase:
    global _client, _db
    if _db is None:
        settings = get_settings()
        _client = AsyncIOMotorClient(settings.mongodb_uri)
        _db = _client[settings.mongodb_db_name]
    return _db


async def close_db() -> None:
    global _client
    if _client:
        _client.close()
        _client = None


# ── Serialization helpers ─────────────────────────────────────────────────────

def _serialize(obj: Any) -> Any:
    """Convert Pydantic models to MongoDB-safe dicts (Decimal → str)."""
    from decimal import Decimal
    if isinstance(obj, Decimal):
        return str(obj)
    if isinstance(obj, dict):
        return {k: _serialize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_serialize(i) for i in obj]
    if hasattr(obj, "model_dump"):
        return _serialize(obj.model_dump())
    return obj


def _deserialize_bill(doc: dict) -> Bill:
    """Convert MongoDB doc back to Bill model."""
    doc.pop("_id", None)
    return Bill.model_validate(doc)


# ── Bill CRUD ─────────────────────────────────────────────────────────────────

async def create_bill(bill: Bill) -> Bill:
    db = get_db()
    doc = _serialize(bill)
    await db.bills.insert_one(doc)
    return bill


async def get_bill(bill_id: str) -> Bill | None:
    db = get_db()
    doc = await db.bills.find_one({"bill_id": bill_id})
    if doc is None:
        return None
    return _deserialize_bill(doc)


async def update_bill(bill: Bill) -> Bill:
    db = get_db()
    bill = bill.model_copy(update={"updated_at": datetime.utcnow()})
    doc = _serialize(bill)
    await db.bills.replace_one({"bill_id": bill.bill_id}, doc, upsert=True)
    return bill


async def get_people(bill_id: str) -> list[Person]:
    db = get_db()
    doc = await db.bill_people.find_one({"bill_id": bill_id})
    if doc is None:
        return []
    return [Person.model_validate(p) for p in doc.get("people", [])]


async def save_people(bill_id: str, people: list[Person]) -> None:
    db = get_db()
    await db.bill_people.replace_one(
        {"bill_id": bill_id},
        {"bill_id": bill_id, "people": [_serialize(p) for p in people]},
        upsert=True,
    )


async def get_assignments(bill_id: str) -> list[ItemAssignment]:
    db = get_db()
    doc = await db.bill_assignments.find_one({"bill_id": bill_id})
    if doc is None:
        return []
    return [ItemAssignment.model_validate(a) for a in doc.get("assignments", [])]


async def save_assignments(bill_id: str, assignments: list[ItemAssignment]) -> None:
    db = get_db()
    await db.bill_assignments.replace_one(
        {"bill_id": bill_id},
        {"bill_id": bill_id, "assignments": [_serialize(a) for a in assignments]},
        upsert=True,
    )


async def save_result(result: BillResult) -> None:
    db = get_db()
    await db.bill_results.replace_one(
        {"bill_id": result.bill_id},
        _serialize(result),
        upsert=True,
    )


async def get_result(bill_id: str) -> BillResult | None:
    db = get_db()
    doc = await db.bill_results.find_one({"bill_id": bill_id})
    if doc is None:
        return None
    doc.pop("_id", None)
    return BillResult.model_validate(doc)
