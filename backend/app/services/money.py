"""
money.py — The ONLY place rounding logic lives in the entire codebase.

All money is Decimal, constructed from strings, NEVER from float.
Quantize only at the final output boundary (ROUND_HALF_UP to 2dp for INR).
Never quantize intermediate values.

This module has ZERO dependencies on FastAPI, MongoDB, or Gemini.
It takes/returns plain Decimals and dicts — trivially unit-testable.
"""
from decimal import ROUND_DOWN, ROUND_HALF_UP, Decimal, getcontext

# Set precision high enough to avoid intermediate rounding issues
getcontext().prec = 28

# Currency precision — 2 decimal places for INR
CURRENCY_PRECISION = Decimal("0.01")


def to_money(value: Decimal) -> Decimal:
    """Quantize a Decimal to currency precision using ROUND_HALF_UP."""
    return value.quantize(CURRENCY_PRECISION, rounding=ROUND_HALF_UP)


def allocate_proportionally(
    pool_amount: Decimal,
    weights: dict[str, Decimal],
) -> tuple[dict[str, Decimal], list[str]]:
    """
    Largest-remainder method for proportional allocation.

    Guarantees: sum(result.values()) == pool_amount, EXACTLY, always.
    This is the only place rounding adjustments happen.

    Args:
        pool_amount: The total amount to distribute (e.g. total tax amount).
        weights: {person_id -> eligible subtotal weight}

    Returns:
        (allocations: {person_id -> allocated_amount}, rounding_log: list[str])
    """
    if not weights:
        return {}, []

    total_weight = sum(weights.values())
    rounding_log: list[str] = []

    # Handle zero total weight (all people have zero subtotal — split equally)
    if total_weight == Decimal("0"):
        n = len(weights)
        equal_share = pool_amount / Decimal(str(n))
        # Floor each share
        floored = {pid: equal_share.quantize(CURRENCY_PRECISION, rounding=ROUND_DOWN) for pid in weights}
        leftover = pool_amount - sum(floored.values())
        # Distribute leftover 1 cent at a time by person_id order (deterministic)
        sorted_ids = sorted(weights.keys())
        i = 0
        while leftover > Decimal("0"):
            pid = sorted_ids[i % len(sorted_ids)]
            floored[pid] += CURRENCY_PRECISION
            leftover -= CURRENCY_PRECISION
            i += 1
        return floored, rounding_log

    # Step 1: Compute exact (unrounded) shares
    exact_shares: dict[str, Decimal] = {
        pid: (weight / total_weight) * pool_amount
        for pid, weight in weights.items()
    }

    # Step 2: Floor each share to currency precision
    floored: dict[str, Decimal] = {
        pid: share.quantize(CURRENCY_PRECISION, rounding=ROUND_DOWN)
        for pid, share in exact_shares.items()
    }

    # Step 3: Compute leftover
    leftover = pool_amount - sum(floored.values())
    # Quantize leftover to avoid floating-point drift (shouldn't happen with Decimal, but safe)
    leftover = leftover.quantize(CURRENCY_PRECISION, rounding=ROUND_HALF_UP)

    # Step 4: Compute fractional remainders for tie-breaking
    remainders: dict[str, Decimal] = {
        pid: exact_shares[pid] - floored[pid]
        for pid in weights
    }

    # Sort by remainder descending, ties broken by person_id ascending (deterministic)
    sorted_by_remainder = sorted(
        remainders.items(),
        key=lambda kv: (-kv[1], kv[0]),
    )

    # Step 5: Distribute leftover one cent at a time
    i = 0
    while leftover >= CURRENCY_PRECISION:
        pid = sorted_by_remainder[i % len(sorted_by_remainder)][0]
        floored[pid] += CURRENCY_PRECISION
        leftover -= CURRENCY_PRECISION
        i += 1

    # Log non-zero rounding adjustments
    for pid, share in floored.items():
        exact = exact_shares[pid]
        adjustment = share - exact
        if abs(adjustment) >= CURRENCY_PRECISION:
            sign = "+" if adjustment > 0 else ""
            rounding_log.append(
                f"Rounding adjustment: {sign}{to_money(adjustment)} assigned to {pid}"
            )

    return floored, rounding_log


def verify_allocation(
    pool_amount: Decimal,
    allocations: dict[str, Decimal],
) -> bool:
    """Assert that allocations sum to pool_amount exactly."""
    return sum(allocations.values()) == pool_amount


def compute_line_total(quantity: Decimal, unit_price: Decimal) -> Decimal:
    """Compute line total without rounding (intermediate value)."""
    return quantity * unit_price


def is_within_tolerance(a: Decimal, b: Decimal, tolerance: Decimal = CURRENCY_PRECISION) -> bool:
    """Check if two monetary values are within currency tolerance."""
    return abs(a - b) <= tolerance
