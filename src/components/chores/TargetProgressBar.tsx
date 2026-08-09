interface Props {
  done: number;
  total: number;
  compact?: boolean;
}

export default function TargetProgressBar({ done, total, compact }: Props) {
  const pct = Math.round((done / total) * 100);
  const allDone = done === total;

  return (
    <div className="space-y-1">
      {!compact && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Target progress</span>
          {allDone
            ? <span className="rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-green-800 dark:text-green-300 font-medium">Completed</span>
            : <span>{done} / {total}</span>
          }
        </div>
      )}
      <div
        className="h-2 w-full rounded-full bg-muted overflow-hidden"
        title={compact ? `${done} / ${total} targets` : undefined}
      >
        <div
          className="h-full rounded-full bg-indigo-400 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
