import type { XPSize, XPSettings } from '@/types';
import { getXPBase } from './calculator';

export function buildXPPreview(xpSize: XPSize | number, settings: XPSettings): string {
  const base = getXPBase(xpSize);
  const max = Math.round(base * settings.maxStreakMultiplier);
  if (max === base) return `${base} XP`;
  return `${base} XP · up to ${max} XP at max streak`;
}

export function toRepetitionFactor(xpPerUnit: number): number {
  if (!Number.isFinite(xpPerUnit) || xpPerUnit <= 0) return 1;
  return Math.max(1, Math.round(1 / xpPerUnit));
}

export function buildMultiplierXPPreview(repetitionFactor: number): string {
  return `÷${repetitionFactor} per unit answered`;
}
