import type { Chore, Completion } from '@/types';
import { getCurrentWindowIndex, getWindowStart, getWindowEnd } from './recurrence';

export interface EligibleWindow {
  index: number;
  start: Date;
  end: Date;
}

export function eligiblePastWindows(
  chore: Chore,
  completions: Completion[],
  now: Date,
): EligibleWindow[] {
  const currentIdx = getCurrentWindowIndex(chore.recurrence, now);
  if (currentIdx === null || currentIdx === 0) return [];

  let lastIdx = -1;
  for (const c of completions) {
    const idx = getCurrentWindowIndex(chore.recurrence, new Date(c.completedAt));
    if (idx !== null && idx > lastIdx) lastIdx = idx;
  }

  const results: EligibleWindow[] = [];
  for (let i = lastIdx + 1; i < currentIdx; i++) {
    if (!chore.repeatable) {
      const s = getWindowStart(chore.recurrence, i).getTime();
      const e = getWindowEnd(chore.recurrence, i).getTime();
      const hasCompletion = completions.some((c) => {
        const t = new Date(c.completedAt).getTime();
        return t >= s && t < e;
      });
      if (hasCompletion) continue;
    }
    results.push({
      index: i,
      start: getWindowStart(chore.recurrence, i),
      end: getWindowEnd(chore.recurrence, i),
    });
  }
  return results;
}
