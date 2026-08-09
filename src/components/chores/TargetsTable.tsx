import { useState } from 'react';
import type { Target, Completion, Question } from '@/types';
import { getAnswerDisplay } from '@/questions/display';

type SortDir = 'asc' | 'desc';
type SortKey = 'completedAt' | `question:${string}`;
export interface SortEntry { key: SortKey; dir: SortDir; }

export interface TargetRow { target: Target; done: boolean; completedAt: string | null; }

export function isTargetDone(target: Target, completions: Completion[]): boolean {
  return completions.some((c) => c.targetId === target.id);
}

export function getTargetCompletedAt(target: Target, completions: Completion[]): string | null {
  const linked = completions
    .filter((c) => c.targetId === target.id)
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  return linked[0]?.completedAt ?? null;
}

function getAnswerValue(target: Target, questionId: string): string | number | boolean | null {
  return target.answers.find((a) => a.questionId === questionId)?.value ?? null;
}

function compareValues(a: unknown, b: unknown): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

export function filterAndSortTargets(
  targets: Target[],
  completions: Completion[],
  sorts: SortEntry[],
  showCompleted: boolean,
): TargetRow[] {
  const rows: TargetRow[] = targets.map((t) => ({
    target: t,
    done: isTargetDone(t, completions),
    completedAt: getTargetCompletedAt(t, completions),
  }));

  const visible = showCompleted ? rows : rows.filter((r) => !r.done);

  if (sorts.length === 0) return visible;

  return [...visible].sort((a, b) => {
    for (const sort of sorts) {
      let result = 0;
      if (sort.key === 'completedAt') {
        result = compareValues(a.completedAt, b.completedAt);
      } else {
        const qId = sort.key.slice('question:'.length);
        result = compareValues(getAnswerValue(a.target, qId), getAnswerValue(b.target, qId));
      }
      if (result !== 0) return sort.dir === 'asc' ? result : -result;
    }
    return 0;
  });
}

function SortLabel({ sorts, colKey }: { sorts: SortEntry[]; colKey: SortKey }) {
  const idx = sorts.findIndex((s) => s.key === colKey);
  if (idx === -1) return <span className="ml-1 text-muted-foreground/40 text-xs">↕</span>;
  return (
    <span className="ml-1 text-xs">
      {sorts[idx].dir === 'asc' ? '↑' : '↓'}<sup>{idx + 1}</sup>
    </span>
  );
}

function clickHeader(sorts: SortEntry[], key: SortKey): SortEntry[] {
  const existing = sorts.find((s) => s.key === key);
  if (!existing) return [...sorts, { key, dir: 'asc' }];
  if (existing.dir === 'asc') return sorts.map((s) => s.key === key ? { ...s, dir: 'desc' } : s);
  return sorts.filter((s) => s.key !== key);
}

interface Props {
  targets: Target[];
  completions: Completion[];
  questions: Question[];
  showCompleted: boolean;
  interactive?: boolean;
  selectedTargetId?: string;
  onSelect?: (targetId: string) => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function TargetsTable({ targets, completions, questions, showCompleted, interactive, selectedTargetId, onSelect }: Props) {
  const [sorts, setSorts] = useState<SortEntry[]>([]);
  const rows = filterAndSortTargets(targets, completions, sorts, showCompleted);
  const hasSorts = sorts.length > 0;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left border-collapse">
        <thead>
          <tr className="border-b border-border">
            {interactive && <th className="py-2 pr-2 w-6" aria-label="Select" />}
            {questions.map((q) => (
              <th
                key={q.id}
                className="py-2 pr-4 font-medium text-foreground cursor-pointer select-none"
                onClick={() => setSorts((s) => clickHeader(s, `question:${q.id}`))}
              >
                {q.prompt}
                <SortLabel sorts={sorts} colKey={`question:${q.id}`} />
              </th>
            ))}
            {showCompleted && (
              <th
                className="py-2 pr-4 font-medium text-foreground whitespace-nowrap cursor-pointer select-none"
                onClick={() => setSorts((s) => clickHeader(s, 'completedAt'))}
              >
                Completed at
                <SortLabel sorts={sorts} colKey="completedAt" />
              </th>
            )}
            <th className="py-2 pl-4 font-normal">
              <button
                className={`text-xs text-muted-foreground hover:text-foreground underline${!hasSorts ? ' invisible' : ''}`}
                onClick={() => setSorts([])}
                tabIndex={hasSorts ? undefined : -1}
                aria-hidden={!hasSorts || undefined}
              >
                Reset sorting
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ target, done, completedAt }) => {
            const isSelected = selectedTargetId === target.id;
            return (
              <tr
                key={target.id}
                className={[
                  'border-b border-border',
                  done ? 'opacity-40' : '',
                  interactive && !done ? 'cursor-pointer hover:bg-muted' : '',
                  isSelected ? 'bg-muted' : '',
                ].join(' ')}
                onClick={interactive && !done && onSelect ? () => onSelect(target.id) : undefined}
              >
                {interactive && (
                  <td className="py-2 pr-2">
                    <input
                      type="radio"
                      checked={isSelected}
                      onChange={() => onSelect?.(target.id)}
                      disabled={done}
                      className="accent-primary"
                      aria-label={`Select target`}
                    />
                  </td>
                )}
                {questions.map((q) => (
                  <td key={q.id} className={`py-2 pr-4 ${done ? 'text-muted-foreground' : 'text-foreground'}`}>
                    {getAnswerDisplay(target.answers, q)}
                  </td>
                ))}
                {showCompleted && (
                  <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                    {completedAt ? formatDate(completedAt) : '—'}
                  </td>
                )}
                <td />
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={questions.length + (interactive ? 1 : 0) + (showCompleted ? 1 : 0) + 1}
                  className="py-4 text-center text-sm text-muted-foreground italic">
                {showCompleted ? 'No targets.' : 'All targets completed.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
