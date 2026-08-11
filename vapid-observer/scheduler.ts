export type Recurrence = {
  frequency: 'daily' | 'weekly' | 'monthly';
  interval: number;
  startDate: string;
  windowStartTime: string;
};

export type DuePeriod = { value: number; unit: 'minutes' | 'hours' | 'days' | 'weeks' | 'months' };

export function computeNextNotificationAt(
  recurrence: Recurrence,
  duePeriod: DuePeriod | undefined,
  _trigger: 'at-due-time',
  lastDeliveredAt: string | null,
): string {
  const reference = lastDeliveredAt ? new Date(lastDeliveredAt) : new Date(0);
  const now = new Date();
  const refTime = reference > now ? reference : now;

  let windowStart = new Date(`${recurrence.startDate}T${recurrence.windowStartTime}:00Z`);
  while (windowStart <= refTime) {
    windowStart = advancePeriod(windowStart, recurrence.frequency, recurrence.interval);
  }

  if (duePeriod) {
    const windowEnd = advancePeriod(windowStart, recurrence.frequency, recurrence.interval);
    return new Date(windowEnd.getTime() - duePeriodToMs(duePeriod)).toISOString();
  }
  return windowStart.toISOString();
}

function advancePeriod(date: Date, frequency: string, interval: number): Date {
  if (frequency === 'daily') return new Date(date.getTime() + interval * 86_400_000);
  if (frequency === 'weekly') return new Date(date.getTime() + interval * 7 * 86_400_000);
  const d = new Date(date);
  d.setMonth(d.getMonth() + interval);
  return d;
}

function duePeriodToMs(dp: DuePeriod): number {
  const ms: Record<string, number> = {
    minutes: 60_000, hours: 3_600_000, days: 86_400_000,
    weeks: 604_800_000, months: 2_592_000_000,
  };
  return dp.value * (ms[dp.unit] ?? 0);
}
