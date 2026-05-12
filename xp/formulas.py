import math
from decimal import Decimal


def calculate_xp(base_xp: Decimal, streak_count: int, settings) -> int:
    streak_mult = (
        settings.max_streak_multiplier
        - (settings.max_streak_multiplier - 1) * math.exp(-settings.streak_approach_rate * streak_count)
    )
    decay_mult = (
        settings.decay_floor
        + (1 - settings.decay_floor) * math.exp(-settings.decay_approach_rate * streak_count)
    )
    return round(float(base_xp) * streak_mult * decay_mult)
