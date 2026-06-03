import type { XPSize, XPSettings } from '@/types';
import { XP_BASE } from './calculator';

export function buildXPPreview(xpSize: XPSize, settings: XPSettings): string {
  const base = XP_BASE[xpSize];
  const max = Math.round(base * settings.maxStreakMultiplier);
  if (max === base) return `${base} XP`;
  return `${base} XP · up to ${max} XP at max streak`;
}
