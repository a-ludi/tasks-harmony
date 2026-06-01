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
  return Math.max(1, Math.round(base * streakMult * decayMult));
}
