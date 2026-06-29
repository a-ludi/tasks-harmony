import { formatDurationMs, formatShortDate } from '@/chores/dueDateConversion';

interface WindowBarProps {
  windowOpenDate: Date;
  firstDueDate: Date;
  duePeriodMs: number;
}

export default function WindowBar({ windowOpenDate, firstDueDate, duePeriodMs }: WindowBarProps) {
  const windowLengthMs = firstDueDate.getTime() - windowOpenDate.getTime();
  if (windowLengthMs <= 0) return null;

  const safedue = Math.min(duePeriodMs, windowLengthMs);
  // When no due period is set, treat entire window as "Due"
  const upcomingMs = safedue === 0 ? 0 : windowLengthMs - safedue;
  const upcomingPct = (upcomingMs / windowLengthMs) * 100;
  const duePct = (safedue === 0 ? windowLengthMs : safedue) / windowLengthMs * 100;

  const dueStartDate = safedue > 0
    ? new Date(firstDueDate.getTime() - safedue)
    : null;

  return (
    <div className="space-y-1">
      {/* Duration labels above */}
      <div className="flex text-xs text-muted-foreground" style={{ width: '100%' }}>
        {upcomingMs > 0 && (
          <span style={{ width: `${upcomingPct}%` }} className="text-center">
            {formatDurationMs(upcomingMs)}
          </span>
        )}
        <span style={{ width: `${duePct}%` }} className="text-center">
          {formatDurationMs(safedue > 0 ? safedue : windowLengthMs)}
        </span>
      </div>

      {/* Segment bar */}
      <div className="flex w-full h-4 rounded overflow-hidden">
        {upcomingMs > 0 && (
          <div
            className="bg-muted flex items-center justify-center"
            style={{ width: `${upcomingPct}%` }}
            title="Upcoming"
          />
        )}
        <div
          className="bg-yellow-400 dark:bg-yellow-500"
          style={{ width: `${duePct}%` }}
          title="Due"
        />
      </div>

      {/* Section name labels */}
      <div className="flex text-xs text-muted-foreground" style={{ width: '100%' }}>
        {upcomingMs > 0 && (
          <span style={{ width: `${upcomingPct}%` }} className="text-center font-medium">
            Upcoming
          </span>
        )}
        <span style={{ width: `${duePct}%` }} className="text-center font-medium">
          Due
        </span>
      </div>

      {/* Date anchors */}
      <div className="relative flex text-xs text-muted-foreground w-full">
        <span className="absolute left-0">{formatShortDate(windowOpenDate)}</span>
        {dueStartDate && (
          <span
            className="absolute"
            style={{ left: `${upcomingPct}%`, transform: 'translateX(-50%)' }}
          >
            {formatShortDate(dueStartDate)}
          </span>
        )}
        <span className="absolute right-0">{formatShortDate(firstDueDate)}</span>
      </div>
      {/* Spacer so date row has height */}
      <div className="h-4" />
    </div>
  );
}
