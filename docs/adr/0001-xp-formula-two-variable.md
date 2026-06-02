# XP formula uses streak count and total completions as separate inputs

The XP earned per completion is computed as `round(base × streak_mult × decay_mult)`, where `streak_mult` depends on the current consecutive streak and `decay_mult` depends on the total number of previous completions for that chore.

```
streak_mult = max_streak_multiplier
              - (max_streak_multiplier - 1) × exp(-streak_approach_rate × streak_count)

decay_mult  = decay_floor
              + (1 - decay_floor) × exp(-decay_approach_rate × total_completions)
```

`total_completions` is the count of previous completions for the specific chore (not global), not including the one currently being recorded.

## Why two separate inputs

A single-variable formula (streak only) cannot produce a below-base penalty when a streak breaks, because at streak=1 the multiplier is always ≥ 1. The two-variable design allows an experienced user who breaks a streak to earn significantly less than base XP: the decay has accumulated over their completion history, but their streak multiplier has reset to near 1.

## Considered alternatives

**Streak only (original plan):** `XP = base × f(streak)`. Cannot drop below base — no penalty for breaking. Rejected.

**Single approach rate:** Both streak and decay used the same `approachRate` parameter. Too coarse — the speed at which the streak bonus builds and the speed at which the decay accumulates are independent design levers.
