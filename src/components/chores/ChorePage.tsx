import { useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { useAppStore } from '@/store';
import { getAnswerDisplay } from '@/questions/display';
import type { Answer, Completion } from '@/types';
import { Button } from '@/components/ui/button';
import { MarkdownDisplay } from '@/components/ui/MarkdownDisplay';
import AmendCompletionModal from '@/components/completion/AmendCompletionModal';
import CompleteButton from '@/components/chores/CompleteButton';
import QuickCompleteButtonList from '@/components/chores/QuickCompleteButtonList';
import ChoreActionsDropdown from '@/components/chores/ChoreActionsDropdown';

type SortDir = 'asc' | 'desc';
type SortKey = 'completedAt' | `question:${string}` | 'xpEarned';
interface SortEntry { key: SortKey; dir: SortDir; }

interface UnifiedRow {
  kind: 'completion' | 'target';
  id: string;
  completedAt: string | null;
  answers: Answer[];
  xpEarned: number | null;
}

export default function ChorePage() {
  const { encodedChoreKey } = useParams<{ encodedChoreKey: string }>();
  const navigate = useNavigate();
  const [editingCompletion, setEditingCompletion] = useState<Completion | null>(null);

  const choreKey = encodedChoreKey ? decodeURIComponent(encodedChoreKey) : '';
  const chores = useAppStore((s) => s.chores);
  const allCompletions = useAppStore((s) => s.completions);
  const questions = useAppStore((s) => s.questions);
  const allTargets = useAppStore((s) => s.targets);

  const chore = chores.find((c) => c.key === choreKey);
  if (!chore) return <Navigate to="/" replace />;

  const choreQuestions = questions
    .filter((q) => q.choreKey === choreKey)
    .sort((a, b) => a.order - b.order);

  const completions = allCompletions.filter((c) => c.choreKey === choreKey);
  const targets = allTargets.filter((t) => t.choreKey === choreKey);
  const hasTargets = targets.length > 0;

  // Pending targets: those without any linked completion
  const pendingTargets = targets.filter((t) => !completions.some((c) => c.targetId === t.id));

  const [showTargets, setShowTargets] = useState(false);
  const [sorts, setSorts] = useState<SortEntry[]>([]);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  const completionRows: UnifiedRow[] = completions.map((c) => ({
    kind: 'completion',
    id: c.id,
    completedAt: c.completedAt,
    answers: c.answers,
    xpEarned: c.xpEarned,
  }));

  const targetRows: UnifiedRow[] = showTargets ? pendingTargets.map((t) => ({
    kind: 'target',
    id: t.id,
    completedAt: null,
    answers: t.answers,
    xpEarned: null,
  })) : [];

  const allRows = [...completionRows, ...targetRows];

  function getAnswerVal(row: UnifiedRow, questionId: string): string | number | boolean | null {
    return row.answers.find((a) => a.questionId === questionId)?.value ?? null;
  }

  function compareValues(a: unknown, b: unknown): number {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b));
  }

  const effectiveSorts: SortEntry[] = sorts.length > 0 ? sorts : [{ key: 'completedAt', dir: 'desc' }];
  const sorted = [...allRows].sort((a, b) => {
    for (const sort of effectiveSorts) {
      let result = 0;
      if (sort.key === 'completedAt') result = compareValues(a.completedAt, b.completedAt);
      else if (sort.key === 'xpEarned') result = compareValues(a.xpEarned, b.xpEarned);
      else {
        const qId = sort.key.slice('question:'.length);
        result = compareValues(getAnswerVal(a, qId), getAnswerVal(b, qId));
      }
      if (result !== 0) return sort.dir === 'asc' ? result : -result;
    }
    return 0;
  });

  function clickHeader(key: SortKey) {
    setSorts((prev) => {
      const existing = prev.find((s) => s.key === key);
      if (!existing) return [...prev, { key, dir: 'asc' }];
      if (existing.dir === 'asc') return prev.map((s) => s.key === key ? { ...s, dir: 'desc' } : s);
      return prev.filter((s) => s.key !== key);
    });
  }

  function SortLabel({ colKey }: { colKey: SortKey }) {
    const idx = sorts.findIndex((s) => s.key === colKey);
    if (idx === -1) return <span className="ml-1 text-muted-foreground/40 text-xs">↕</span>;
    return <span className="ml-1 text-xs">{sorts[idx].dir === 'asc' ? '↑' : '↓'}<sup>{idx + 1}</sup></span>;
  }

  const hasSorts = sorts.length > 0;

  return (
    <div className="py-4">
      <Button variant="link" onClick={() => navigate(-1)} className="mb-4 px-0">← Back</Button>
      <h1 className="mb-2 text-2xl font-bold text-foreground">{chore.title}</h1>
      {chore.description && (
        <MarkdownDisplay key={chore.description} content={chore.description} className="mb-4 text-sm text-muted-foreground" />
      )}

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <CompleteButton chore={chore} disabled={!chore.active} />
        <QuickCompleteButtonList chore={chore} disabled={!chore.active} />
        <ChoreActionsDropdown chore={chore} />
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-foreground">Completion History</h2>
        {hasTargets && pendingTargets.length > 0 && (
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowTargets((v) => !v)}>
            {showTargets ? 'Hide targets' : `Show targets (${pendingTargets.length} pending)`}
          </Button>
        )}
      </div>

      {allRows.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No completions yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th
                  className="py-2 pr-4 font-medium text-foreground whitespace-nowrap cursor-pointer select-none"
                  onClick={() => clickHeader('completedAt')}
                >
                  Completed at <SortLabel colKey="completedAt" />
                </th>
                {choreQuestions.map((q) => (
                  <th
                    key={q.id}
                    className="py-2 pr-4 font-medium text-foreground cursor-pointer select-none"
                    onClick={() => clickHeader(`question:${q.id}`)}
                  >
                    {q.prompt} <SortLabel colKey={`question:${q.id}`} />
                  </th>
                ))}
                <th
                  className="py-2 font-medium text-foreground text-right cursor-pointer select-none"
                  onClick={() => clickHeader('xpEarned')}
                >
                  XP earned <SortLabel colKey="xpEarned" />
                </th>
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
              {sorted.map((row) => {
                const isPending = row.kind === 'target';
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-border ${isPending ? 'opacity-40' : 'hover:bg-muted'}`}
                  >
                    <th scope="row" className="py-2 pr-4 text-muted-foreground whitespace-nowrap font-normal">
                      {row.completedAt ? formatDate(row.completedAt) : '—'}
                    </th>
                    {choreQuestions.map((q) => (
                      <td key={q.id} className="py-2 pr-4 text-muted-foreground">
                        {getAnswerDisplay(row.answers, q)}
                      </td>
                    ))}
                    <td className="py-2 text-foreground font-medium text-right">
                      {row.xpEarned !== null ? row.xpEarned : '—'}
                    </td>
                    <td className="py-2 pl-4">
                      <div className="flex justify-end gap-2">
                        {row.kind === 'completion' && (
                          <button
                            className="text-xs text-muted-foreground hover:text-foreground underline"
                            onClick={() => {
                              const completion = completions.find((c) => c.id === row.id);
                              if (completion) setEditingCompletion(completion);
                            }}
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editingCompletion && (
        <AmendCompletionModal
          completion={editingCompletion}
          chore={chore}
          choreCompletions={completions}
          questions={choreQuestions}
          onClose={() => setEditingCompletion(null)}
        />
      )}
    </div>
  );
}
