import React, { useState } from 'react';
import type { Completion, Question } from '@/types';
import { getAnswerDisplay } from '@/questions/display';
import {
  type SortEntry, type SortKey, sortCompletions, clickColumnHeader,
  groupCompletions, getGroupLabel, computeTotals, addGroupBy, removeGroupBy,
  exportCsv, exportJson, isGroupableQuestion,
} from './completionsTable';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

interface Props {
  completions: Completion[];
  questions: Question[];
  choreTitle: string;
  onEdit?: (completion: Completion) => void;
}

function SortLabel({ sorts, colKey }: { sorts: SortEntry[]; colKey: SortKey }) {
  const idx = sorts.findIndex(s => s.key === colKey);
  if (idx === -1) return <span className="ml-1 text-muted-foreground/40 text-xs">↕</span>;
  const entry = sorts[idx];
  const n = idx + 1;
  return (
    <span className="ml-1 text-xs">
      {entry.dir === 'asc' ? '↑' : '↓'}<sup>{n}</sup>
    </span>
  );
}

export default function CompletionsTable({ completions, questions, choreTitle, onEdit }: Props) {
  const [sorts, setSorts] = useState<SortEntry[]>([]);
  const [groupBys, setGroupBys] = useState<string[]>([]);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  function handleHeaderClick(key: SortKey) {
    setSorts(prev => clickColumnHeader(prev, key, groupBys));
  }

  const sorted = sortCompletions(completions, sorts, questions);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  const hasSorts = sorts.length > 0;

  return (
    <div>
      {/* Toolbar */}
      {(() => {
        const eligibleQuestions = questions.filter(isGroupableQuestion);
        const availableToGroup = eligibleQuestions.filter(q => !groupBys.includes(q.id));
        return (
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {groupBys.map(qId => {
              const q = questions.find(q => q.id === qId);
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
                  {availableToGroup.map(q => (
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
            <div className="ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="text-xs h-6 px-2">Export ▾</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => exportCsv(completions, questions, choreTitle)}>
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportJson(completions, questions, choreTitle)}>
                    Export as JSON
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        );
      })()}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th
                className="py-2 pr-4 font-medium text-foreground whitespace-nowrap cursor-pointer select-none"
                onClick={() => handleHeaderClick('completedAt')}
              >
                Completed at
                <SortLabel sorts={sorts} colKey="completedAt" />
              </th>
              {questions.map(q => (
                <th
                  key={q.id}
                  className="py-2 pr-4 font-medium text-foreground cursor-pointer select-none"
                  onClick={() => handleHeaderClick(`question:${q.id}`)}
                >
                  {q.prompt}
                  <SortLabel sorts={sorts} colKey={`question:${q.id}`} />
                </th>
              ))}
              <th
                className="py-2 font-medium text-foreground text-right cursor-pointer select-none"
                onClick={() => handleHeaderClick('xpEarned')}
              >
                XP earned
                <SortLabel sorts={sorts} colKey="xpEarned" />
              </th>
              {hasSorts && (
                <th className="py-2 pl-4 font-normal">
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                    onClick={() => setSorts([])}
                  >
                    Reset sorting
                  </button>
                </th>
              )}
              {onEdit && <th />}
            </tr>
          </thead>
          <tbody>
            {groupBys.length === 0 ? (
              sorted.map(c => (
                <tr key={c.id} className="border-b border-border hover:bg-muted">
                  <th scope="row" className="py-2 pr-4 text-muted-foreground whitespace-nowrap font-normal">{formatDate(c.completedAt)}</th>
                  {questions.map(q => (
                    <td key={q.id} className="py-2 pr-4 text-muted-foreground">{getAnswerDisplay(c.answers, q)}</td>
                  ))}
                  <td className="py-2 text-foreground font-medium text-right">{c.xpEarned}</td>
                  {hasSorts && <td />}
                  {onEdit && (
                    <td className="py-2 pl-2">
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground underline"
                        onClick={() => onEdit(c)}
                      >
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))
            ) : (
              Array.from(groupCompletions(sorted, groupBys)).map(([key, groupRows]) => {
                const label = getGroupLabel(key, groupBys, questions);
                const subtotals = computeTotals(groupRows, questions);
                const isOpen = openGroup === key;
                return (
                  <React.Fragment key={key}>
                    <tr
                      data-group={key}
                      data-group-open={isOpen}
                      className="border-b border-border bg-muted/50 cursor-pointer select-none hover:bg-muted"
                      onClick={() => setOpenGroup(isOpen ? null : key)}
                    >
                      <td colSpan={questions.length + 2 + (hasSorts ? 1 : 0) + (onEdit ? 1 : 0)} className="py-2 px-2 font-medium">
                        <span className="mr-2">{isOpen ? '▾' : '▸'}</span>
                        {label}
                        <span className="ml-3 text-xs font-normal text-muted-foreground">
                          ({subtotals.count} completion{subtotals.count !== 1 ? 's' : ''} · {subtotals.xpSum} XP)
                        </span>
                      </td>
                    </tr>
                    {isOpen && groupRows.map(c => (
                      <tr key={c.id} className="border-b border-border hover:bg-muted">
                        <th scope="row" className="py-2 pr-4 text-muted-foreground whitespace-nowrap font-normal pl-6">{formatDate(c.completedAt)}</th>
                        {questions.map(q => (
                          <td key={q.id} className="py-2 pr-4 text-muted-foreground">{getAnswerDisplay(c.answers, q)}</td>
                        ))}
                        <td className="py-2 text-foreground font-medium text-right">{c.xpEarned}</td>
                        {hasSorts && <td />}
                        {onEdit && (
                          <td className="py-2 pl-2">
                            <button
                              className="text-xs text-muted-foreground hover:text-foreground underline"
                              onClick={() => onEdit(c)}
                            >
                              Edit
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
          {(() => {
            const totals = computeTotals(completions, questions);
            return (
              <tfoot>
                <tr className="border-t-2 border-border font-medium bg-muted/30">
                  <th scope="row" className="py-2 pr-4 text-foreground whitespace-nowrap text-left">
                    {totals.count} completion{totals.count !== 1 ? 's' : ''}
                  </th>
                  {questions.map(q => (
                    <td key={q.id} className="py-2 pr-4 text-foreground">
                      {totals.questionSums[q.id] !== null ? totals.questionSums[q.id] : '—'}
                    </td>
                  ))}
                  <td className="py-2 text-foreground font-medium text-right">{totals.xpSum}</td>
                  {hasSorts && <td />}
                  {onEdit && <td />}
                </tr>
              </tfoot>
            );
          })()}
        </table>
      </div>
    </div>
  );
}
