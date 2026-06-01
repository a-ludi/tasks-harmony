import type { XPSettings, XPSize } from '@/types';

export const XP_BASE: Record<XPSize, number> = {
  XXS: 0.5, XS: 1, S: 2, M: 3, L: 5, XL: 8, XXL: 13, XXXL: 21,
};

export function calculateXP(
  xpSize: XPSize,
  streakCount: number,
  settings: XPSettings,
): number {
  const base = XP_BASE[xpSize];
  const { maxStreakMultiplier, decayFloor, streakHalfLife, decayHalfLife } = settings;
  const streakMult = maxStreakMultiplier
    - (maxStreakMultiplier - 1) * Math.exp(-Math.LN2 / streakHalfLife * streakCount);
  const decayMult = decayFloor
    + (1 - decayFloor) * Math.exp(-Math.LN2 / decayHalfLife * streakCount);
  // Defensive floor of 1: custom XPSettings with a very low multiplier × a small base (e.g.
  // XXS=0.5) could produce a product < 0.5, which rounds to 0.  Earning 0 XP for completing a
  // chore would be confusing, so we guarantee at least 1 XP regardless of settings.
  return Math.max(1, Math.round(base * streakMult * decayMult));
}
