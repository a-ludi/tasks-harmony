import type { Chore, Completion } from '@/types';
import { getCurrentWindowIndex, getWindowStart } from './recurrence';

export function computeNewStreak(
  chore: Chore,
  previousCompletions: Completion[],
  now: Date,
): number {
  if (previousCompletions.length === 0) return 1;

  try {
    const currentIdx = getCurrentWindowIndex(chore.recurrence, now);

    if (currentIdx === null || currentIdx === 0) return 1;

    const sorted = [...previousCompletions].sort(
      (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
    );
    const lastCompletion = sorted[0];

    const prevWindowStart = getWindowStart(chore.recurrence, currentIdx - 1);
    const prevWindowEnd = getWindowStart(chore.recurrence, currentIdx);

    const lastCompletedAt = new Date(lastCompletion.completedAt).getTime();
    const wasInPrevWindow =
      lastCompletedAt >= prevWindowStart.getTime() &&
      lastCompletedAt < prevWindowEnd.getTime();

    return wasInPrevWindow ? lastCompletion.streak + 1 : 1;
  } catch (e) {
    if (e instanceof Error && (
      e.message.startsWith('Unknown recurrence frequency:') ||
      e.message.startsWith('malformed recurrence:')
    )) {
      return 1;
    }
    throw e;
  }
}
