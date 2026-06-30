import type { Recurrence, RecurrenceFrequency } from '@/types';
import { getWindowStart } from './recurrence';

function dateToYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function toFirstDueDate(recurrence: Recurrence): string {
  return dateToYMD(getWindowStart(recurrence, 1));
}

export function firstDueDateToStartDate(
  firstDueDate: string,
  frequency: RecurrenceFrequency,
  interval: number,
  windowStartTime: string,
): string {
  const [y, m, d] = firstDueDate.split('-').map(Number);
  const [h, min] = windowStartTime.split(':').map(Number);
  const date = new Date(y, m - 1, d, h, min, 0, 0);
  switch (frequency) {
    case 'daily':   date.setDate(date.getDate() - interval); break;
    case 'weekly':  date.setDate(date.getDate() - interval * 7); break;
    case 'monthly': date.setMonth(date.getMonth() - interval); break;
  }
  return dateToYMD(date);
}

export function formatDurationMs(ms: number): string {
  const days = ms / 86_400_000;
  if (days >= 1) {
    const rounded = Math.round(days);
    return `${rounded} ${rounded === 1 ? 'day' : 'days'}`;
  }
  const hours = ms / 3_600_000;
  if (hours >= 1) {
    const rounded = Math.round(hours);
    return `${rounded} ${rounded === 1 ? 'hour' : 'hours'}`;
  }
  const minutes = ms / 60_000;
  const rounded = Math.round(minutes);
  return `${rounded} ${rounded === 1 ? 'minute' : 'minutes'}`;
}

export function formatShortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatDateAnchor(date: Date): string {
  if (date.getHours() === 0 && date.getMinutes() === 0) {
    return formatShortDate(date);
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    + ' ' + date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
