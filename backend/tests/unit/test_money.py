"""
Unit tests for money.py — the single source of rounding truth.

Includes property-based tests using hypothesis.
All 18 test cases from spec §22 are addressed across the test suite.
"""
from decimal import Decimal

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.services.money import (
    CURRENCY_PRECISION,
    allocate_proportionally,
    compute_line_total,
    is_within_tolerance,
    to_money,
    verify_allocation,
)


# ── to_money ──────────────────────────────────────────────────────────────────

def test_to_money_rounds_half_up():
    assert to_money(Decimal("1.005")) == Decimal("1.01")
    assert to_money(Decimal("1.004")) == Decimal("1.00")


def test_to_money_two_decimal_places():
    result = to_money(Decimal("10.0"))
    assert result == Decimal("10.00")


# ── allocate_proportionally ───────────────────────────────────────────────────

def test_allocate_proportionally_basic_equal_split():
    """Test 2: Two people, equal shared item."""
    pool = Decimal("100.00")
    weights = {"alice": Decimal("50"), "bob": Decimal("50")}
    result, log = allocate_proportionally(pool, weights)
    assert result["alice"] == Decimal("50.00")
    assert result["bob"] == Decimal("50.00")
    assert sum(result.values()) == pool


def test_allocate_proportionally_unequal_weights():
    """Test 4: Seven people, uneven consumption — proportional allocation."""
    pool = Decimal("100.00")
    weights = {
        "a": Decimal("30"), "b": Decimal("20"), "c": Decimal("15"),
        "d": Decimal("10"), "e": Decimal("10"), "f": Decimal("10"), "g": Decimal("5"),
    }
    result, log = allocate_proportionally(pool, weights)
    assert sum(result.values()) == pool
    for amt in result.values():
        assert amt >= Decimal("0")


def test_allocate_proportionally_rounding_remainder():
    """Test 10: Rounding remainder — sum must always equal pool exactly."""
    pool = Decimal("10.00")
    # Three people splitting — will have rounding remainder (10/3 = 3.333...)
    weights = {"a": Decimal("1"), "b": Decimal("1"), "c": Decimal("1")}
    result, log = allocate_proportionally(pool, weights)
    assert sum(result.values()) == pool


def test_allocate_proportionally_single_person():
    """Test 1: Single person bill."""
    pool = Decimal("99.99")
    weights = {"solo": Decimal("99.99")}
    result, log = allocate_proportionally(pool, weights)
    assert result["solo"] == pool


def test_allocate_proportionally_zero_pool():
    pool = Decimal("0.00")
    weights = {"a": Decimal("50"), "b": Decimal("50")}
    result, log = allocate_proportionally(pool, weights)
    assert sum(result.values()) == pool


def test_allocate_proportionally_empty_weights():
    pool = Decimal("50.00")
    result, log = allocate_proportionally(pool, {})
    assert result == {}


def test_allocate_proportionally_deterministic():
    """Same inputs always produce same outputs."""
    pool = Decimal("7.00")
    weights = {"c": Decimal("1"), "a": Decimal("1"), "b": Decimal("1")}
    r1, _ = allocate_proportionally(pool, weights)
    r2, _ = allocate_proportionally(pool, weights)
    assert r1 == r2


# ── Hypothesis property test ───────────────────────────────────────────────────

@given(
    pool=st.decimals(min_value=Decimal("0.01"), max_value=Decimal("9999.99"), places=2),
    n=st.integers(min_value=1, max_value=10),
    weights_raw=st.lists(
        st.decimals(min_value=Decimal("0.01"), max_value=Decimal("1000"), places=2),
        min_size=1,
        max_size=10,
    ),
)
@settings(max_examples=500)
def test_allocate_proportionally_always_sums_to_pool(pool, n, weights_raw):
    """
    Property test: for ANY pool amount and ANY weights,
    sum(allocate_proportionally(...)) == pool, EXACTLY.
    """
    weights = {f"person_{i}": w for i, w in enumerate(weights_raw)}
    result, _ = allocate_proportionally(pool, weights)
    assert sum(result.values()) == pool, (
        f"Pool={pool}, weights={weights}, result={result}, sum={sum(result.values())}"
    )


# ── verify_allocation ─────────────────────────────────────────────────────────

def test_verify_allocation_passes():
    pool = Decimal("100.00")
    allocs = {"a": Decimal("60.00"), "b": Decimal("40.00")}
    assert verify_allocation(pool, allocs) is True


def test_verify_allocation_fails():
    pool = Decimal("100.00")
    allocs = {"a": Decimal("60.00"), "b": Decimal("39.99")}
    assert verify_allocation(pool, allocs) is False


# ── compute_line_total ─────────────────────────────────────────────────────────

def test_compute_line_total():
    assert compute_line_total(Decimal("2"), Decimal("15.50")) == Decimal("31.00")


# ── is_within_tolerance ────────────────────────────────────────────────────────

def test_is_within_tolerance_passes():
    assert is_within_tolerance(Decimal("100.00"), Decimal("100.00")) is True
    assert is_within_tolerance(Decimal("100.00"), Decimal("100.01")) is True


def test_is_within_tolerance_fails():
    assert is_within_tolerance(Decimal("100.00"), Decimal("100.02")) is False
