import type { Chore, Completion, ChoreStatus, Recurrence } from '@/types';

export function getWindowStart(recurrence: Recurrence, index: number): Date {
  const [year, month, day] = recurrence.startDate.split('-').map(Number);
  const [hours, minutes] = recurrence.windowStartTime.split(':').map(Number);
  const base = new Date(year, month - 1, day, hours, minutes, 0, 0);

  switch (recurrence.frequency) {
    case 'daily':
      base.setDate(base.getDate() + index * recurrence.interval);
      break;
    case 'weekly':
      base.setDate(base.getDate() + index * recurrence.interval * 7);
      break;
    case 'monthly':
      base.setMonth(base.getMonth() + index * recurrence.interval);
      break;
    default:
      throw new Error(`Unknown recurrence frequency: ${recurrence.frequency}`);
  }

  return base;
}

export function getWindowEnd(recurrence: Recurrence, index: number): Date {
  return getWindowStart(recurrence, index + 1);
}

export function getCurrentWindowIndex(recurrence: Recurrence, now: Date): number | null {
  const startDate = getWindowStart(recurrence, 0);

  if (now < startDate) return null;

  const approxMs: Record<Recurrence['frequency'], number> = {
    daily: 86_400_000,
    weekly: 604_800_000,
    monthly: 2_592_000_000,
  };

  const periodMs = approxMs[recurrence.frequency] * recurrence.interval;
  const elapsed = now.getTime() - startDate.getTime();
  let index = Math.max(0, Math.floor(elapsed / periodMs));

  while (getWindowStart(recurrence, index + 1) <= now) {
    index++;
  }

  while (index > 0 && getWindowStart(recurrence, index) > now) {
    index--;
  }

  return index;
}

export function getChoreStatus(
  chore: Chore,
  completions: Completion[],
  now: Date,
): ChoreStatus {
  try {
    const startDate = getWindowStart(chore.recurrence, 0);

    if (now < startDate) return 'upcoming';

    const currentIdx = getCurrentWindowIndex(chore.recurrence, now);
    if (currentIdx === null) return 'upcoming';

    const windowStart = getWindowStart(chore.recurrence, currentIdx);
    const windowEnd = getWindowEnd(chore.recurrence, currentIdx);

    const hasCurrentCompletion = completions.some((c) => {
      const t = new Date(c.completedAt).getTime();
      return t >= windowStart.getTime() && t < windowEnd.getTime();
    });

    if (hasCurrentCompletion) return 'completed';

    if (currentIdx > 0) {
      const prevWindowStart = getWindowStart(chore.recurrence, currentIdx - 1);
      const prevWindowEnd = windowStart;

      const hasPrevCompletion = completions.some((c) => {
        const t = new Date(c.completedAt).getTime();
        return t >= prevWindowStart.getTime() && t < prevWindowEnd.getTime();
      });

      if (!hasPrevCompletion) return 'overdue';
    }

    return 'due';
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Unknown recurrence frequency:')) {
      return 'due';
    }
    throw e;
  }
}

const SINGULAR: Record<Recurrence['frequency'], string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

const PLURAL: Record<Recurrence['frequency'], string> = {
  daily: 'days',
  weekly: 'weeks',
  monthly: 'months',
};

export function formatRecurrence(recurrence: Recurrence): string {
  if (recurrence.interval === 1) {
    return SINGULAR[recurrence.frequency];
  }
  return `Every ${recurrence.interval} ${PLURAL[recurrence.frequency]}`;
}
