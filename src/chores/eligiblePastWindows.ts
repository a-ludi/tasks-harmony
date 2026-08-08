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
    const start = getWindowStart(chore.recurrence, i);
    const end = getWindowEnd(chore.recurrence, i);

    if (!chore.repeatable) {
      const s = start.getTime();
      const e = end.getTime();
      const hasCompletion = completions.some((c) => {
        const t = new Date(c.completedAt).getTime();
        return t >= s && t < e;
      });
      if (hasCompletion) continue;
    }
    results.push({ index: i, start, end });
  }
  return results;
}
