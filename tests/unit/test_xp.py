import pytest
from decimal import Decimal
from dataclasses import dataclass

@dataclass
class FakeSettings:
    max_streak_multiplier: float
    streak_approach_rate: float
    decay_approach_rate: float
    decay_floor: float

STANDARD = FakeSettings(
    max_streak_multiplier=2.0,
    streak_approach_rate=0.1,
    decay_approach_rate=0.05,
    decay_floor=0.5,
)

def test_streak_zero_returns_base_xp():
    from xp.formulas import calculate_xp
    assert calculate_xp(Decimal("5"), 0, STANDARD) == 5

def test_streak_zero_non_integer_base_rounds():
    from xp.formulas import calculate_xp
    # base_xp=0.5 (XXS), streak=0 → round(0.5 * 1.0 * 1.0) = round(0.5)
    # Python 3 banker's rounding: round(0.5) == 0
    result = calculate_xp(Decimal("0.5"), 0, STANDARD)
    assert result == round(0.5)  # 0

def test_rising_streak_never_exceeds_max_mult_times_base():
    from xp.formulas import calculate_xp
    base = Decimal("10")
    for streak in range(1, 1000):
        result = calculate_xp(base, streak, STANDARD)
        assert result <= STANDARD.max_streak_multiplier * float(base) + 1  # +1 for rounding

def test_high_streak_never_below_decay_floor_times_base():
    from xp.formulas import calculate_xp
    base = Decimal("10")
    result_high = calculate_xp(base, 500, STANDARD)
    net_floor = STANDARD.max_streak_multiplier * STANDARD.decay_floor * float(base)
    assert result_high >= net_floor - 1  # -1 for rounding

def test_infinite_streak_converges_to_max_mult_times_decay_floor_times_base():
    from xp.formulas import calculate_xp
    base = Decimal("100")
    result = calculate_xp(base, 1000, STANDARD)
    expected = round(STANDARD.max_streak_multiplier * STANDARD.decay_floor * float(base))
    assert result == expected

def test_custom_settings_are_respected():
    from xp.formulas import calculate_xp
    custom = FakeSettings(
        max_streak_multiplier=3.0,
        streak_approach_rate=1.0,
        decay_approach_rate=1.0,
        decay_floor=0.25,
    )
    base = Decimal("10")
    result = calculate_xp(base, 1000, custom)
    expected = round(3.0 * 0.25 * 10)
    assert result == expected
