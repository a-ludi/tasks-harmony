# XP formula uses streak count as the sole input variable

The XP earned per completion is computed as `round(base × streakMult × decayMult)`, where
**both** multipliers depend on the same single variable: `streak_count` (the current consecutive
streak for that chore).

```
streak_mult = max_streak_multiplier
              - (max_streak_multiplier - 1) × exp(-ln2 / streak_half_life × streak_count)

decay_mult  = decay_floor
              + (1 - decay_floor) × exp(-ln2 / decay_half_life × streak_count)
```

`streak_count` is the length of the current consecutive streak at the point of completion
(including the completion being recorded).  No separate `total_completions` counter is needed.

## Why single-variable (streak only)

Having both a streak bonus and a decay factor driven by the same streak counter produces a
natural arc: at low streaks the exponential decay term is still large, which pulls the product
`streakMult × decayMult` toward 1; at very long streaks both multipliers approach their
asymptotes (`max_streak_multiplier` and `decay_floor` respectively), so XP converges to
`base × max_streak_multiplier × decay_floor`.

A streak break resets `streak_count` to 1, which simultaneously collapses the streak bonus
*and* restores the decay factor — the user earns close to base XP again, which is intuitive.

## Considered alternatives

**Two-variable (previous design):** `decay_mult` depended on `total_completions` (independent of
streak), allowing XP to drop below base even on a fresh streak start. This required tracking an
additional counter per chore and made the formula harder to explain. Rejected in favour of
simplicity.

**Single approach rate:** Both multipliers share the same half-life parameter.  Too coarse — the
speed at which the streak bonus builds and the speed at which the decay accumulates are
independent design levers, so `streak_half_life` and `decay_half_life` remain separate settings.
