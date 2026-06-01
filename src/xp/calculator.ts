import type { XPSettings, XPSize } from '@/types';

export const XP_BASE: Record<XPSize, number> = {
  XXS: 2, XS: 3, S: 5, M: 8, L: 13, XL: 21, XXL: 34, XXXL: 55,
};

export function calculateXP(
  xpSize: XPSize,
  streakCount: number,
  totalCompletions: number,
  settings: XPSettings,
): number {
  const base = XP_BASE[xpSize];
  const { maxStreakMultiplier, decayFloor, streakHalfLife, decayHalfLife } = settings;
  const streakMult = maxStreakMultiplier
    - (maxStreakMultiplier - 1) * Math.exp(-Math.LN2 / streakHalfLife * streakCount);
  const decayMult = decayFloor
    + (1 - decayFloor) * Math.exp(-Math.LN2 / decayHalfLife * totalCompletions);
  return Math.round(base * streakMult * decayMult);
}
