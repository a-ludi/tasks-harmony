import React, { useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { useAppStore } from '@/store';
import { getAnswerDisplay } from '@/questions/display';
import type { Answer, Completion, Target } from '@/types';
import { Button } from '@/components/ui/button';
import { MarkdownDisplay } from '@/components/ui/MarkdownDisplay';
import AmendCompletionModal from '@/components/completion/AmendCompletionModal';
import CompleteButton from '@/components/chores/CompleteButton';
import QuickCompleteButtonList from '@/components/chores/QuickCompleteButtonList';
import ChoreActionsDropdown from '@/components/chores/ChoreActionsDropdown';
import { groupCompletions, getGroupLabel, computeTotals, addGroupBy, removeGroupBy, isGroupableQuestion, exportCsv, exportJson, sortCompletions, groupTargets } from './completionsTable';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

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
  const [groupBys, setGroupBys] = useState<string[]>([]);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

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

  // Sorted completions (Completion[] for grouping and export)
  const sortedCompletions = sortCompletions(completions, effectiveSorts, choreQuestions);

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
  const totals = computeTotals(completions, choreQuestions);

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
        <div>
          {/* Toolbar: Group by + Export */}
          {(() => {
            const eligibleQuestions = choreQuestions.filter(isGroupableQuestion);
            const availableToGroup = eligibleQuestions.filter((q) => !groupBys.includes(q.id));
            return (
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                {groupBys.map((qId) => {
                  const q = choreQuestions.find((q) => q.id === qId);
                  return (
                    <span key={qId} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                      {q?.prompt ?? qId}
                      <button
                        className="hover:text-destructive"
                        onClick={() => {
                          const next = removeGroupBy(groupBys, sorts, qId);
                          setGroupBys(next.groupBys);
                          setSorts(next.sorts);
                          setOpenGroup(null);
                        }}
                        aria-label={`Remove ${q?.prompt} group`}
                      >×</button>
                    </span>
                  );
                })}
                {availableToGroup.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="text-xs h-6 px-2">+ Group by</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {availableToGroup.map((q) => (
                        <DropdownMenuItem key={q.id} onClick={() => {
                          const next = addGroupBy(groupBys, sorts, q.id);
                          setGroupBys(next.groupBys);
                          setSorts(next.sorts);
                          setOpenGroup(null);
                        }}>
                          {q.prompt}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {completions.length > 0 && (
                  <div className="ml-auto">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="text-xs h-6 px-2">Export ▾</Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => exportCsv(completions, choreQuestions, chore.title)}>
                          Export as CSV
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => exportJson(completions, choreQuestions, chore.title)}>
                          Export as JSON
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            );
          })()}
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
                {groupBys.length === 0 ? (
                  sorted.map((row) => {
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
                  })
                ) : (
                  <>
                    {(() => {
                      const completionGroups = groupCompletions(sortedCompletions, groupBys);
                      const targetGroups: Map<string, Target[]> = showTargets
                        ? groupTargets(pendingTargets, groupBys)
                        : new Map();
                      const allKeys = Array.from(new Set([...completionGroups.keys(), ...targetGroups.keys()]));
                      return allKeys.map((key) => {
                        const groupRows = completionGroups.get(key) ?? [];
                        const groupTargetRows = targetGroups.get(key) ?? [];
                        const label = getGroupLabel(key, groupBys, choreQuestions);
                        const subtotals = computeTotals(groupRows, choreQuestions);
                        const isOpen = openGroup === key;

                        const countParts: string[] = [];
                        if (subtotals.count > 0) countParts.push(`${subtotals.count} completion${subtotals.count !== 1 ? 's' : ''}`);
                        if (groupTargetRows.length > 0) countParts.push(`${groupTargetRows.length} target${groupTargetRows.length !== 1 ? 's' : ''}`);

                        return (
                          <React.Fragment key={key}>
                            <tr
                              data-group={key}
                              data-group-open={isOpen}
                              className="border-b border-border bg-muted/50 cursor-pointer select-none hover:bg-muted"
                              onClick={() => setOpenGroup(isOpen ? null : key)}
                            >
                              <td colSpan={choreQuestions.length + 3} className="py-2 px-2 font-medium">
                                <span className="mr-2">{isOpen ? '▾' : '▸'}</span>
                                {label}
                                <span className="ml-3 text-xs font-normal text-muted-foreground">
                                  ({countParts.join(' · ')}{subtotals.count > 0 ? ` · ${subtotals.xpSum} XP` : ''})
                                </span>
                              </td>
                            </tr>
                            {isOpen && groupRows.map((c) => (
                              <tr key={c.id} className="border-b border-border hover:bg-muted">
                                <th scope="row" className="py-2 pr-4 text-muted-foreground whitespace-nowrap font-normal pl-6">{formatDate(c.completedAt)}</th>
                                {choreQuestions.map((q) => (
                                  <td key={q.id} className="py-2 pr-4 text-muted-foreground">{getAnswerDisplay(c.answers, q)}</td>
                                ))}
                                <td className="py-2 text-foreground font-medium text-right">{c.xpEarned}</td>
                                <td className="py-2 pl-4">
                                  <div className="flex justify-end gap-2">
                                    <button
                                      className="text-xs text-muted-foreground hover:text-foreground underline"
                                      onClick={() => setEditingCompletion(c)}
                                    >
                                      Edit
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {isOpen && groupTargetRows.map((t) => (
                              <tr key={t.id} className="border-b border-border opacity-40">
                                <th scope="row" className="py-2 pr-4 text-muted-foreground whitespace-nowrap font-normal pl-6">—</th>
                                {choreQuestions.map((q) => (
                                  <td key={q.id} className="py-2 pr-4 text-muted-foreground">{getAnswerDisplay(t.answers, q)}</td>
                                ))}
                                <td className="py-2 text-foreground font-medium text-right">—</td>
                                <td className="py-2 pl-4" />
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      });
                    })()}
                  </>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-medium bg-muted/30">
                  <th scope="row" className="py-2 pr-4 text-foreground whitespace-nowrap text-left">
                    {[
                      `${completions.length} completion${completions.length !== 1 ? 's' : ''}`,
                      showTargets && pendingTargets.length > 0
                        ? `${pendingTargets.length} target${pendingTargets.length !== 1 ? 's' : ''}`
                        : null,
                    ].filter(Boolean).join(' · ')}
                  </th>
                  {choreQuestions.map((q) => (
                    <td key={q.id} className="py-2 pr-4 text-foreground">
                      {totals.questionSums[q.id] !== null ? totals.questionSums[q.id] : '—'}
                    </td>
                  ))}
                  <td className="py-2 text-foreground font-medium text-right">{totals.xpSum}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
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
