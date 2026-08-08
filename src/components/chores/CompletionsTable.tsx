import { useState } from 'react';
import type { Completion, Question } from '@/types';
import { getAnswerDisplay } from '@/questions/display';
import {
  type SortEntry, type SortKey, sortCompletions, clickColumnHeader,
} from './completionsTable';

interface Props {
  completions: Completion[];
  questions: Question[];
  choreTitle: string;
}

function SortLabel({ sorts, colKey }: { sorts: SortEntry[]; colKey: SortKey }) {
  const idx = sorts.findIndex(s => s.key === colKey);
  if (idx === -1) return <span className="ml-1 text-muted-foreground/40 text-xs">↕</span>;
  const entry = sorts[idx];
  const n = idx + 1;
  return (
    <span
      className="ml-1 text-xs"
      dangerouslySetInnerHTML={{ __html: `${entry.dir === 'asc' ? '&uarr;' : '&darr;'}<sup>${n}</sup>` }}
    />
  );
}

export default function CompletionsTable({ completions, questions, choreTitle }: Props) {
  const [sorts, setSorts] = useState<SortEntry[]>([]);
  const [groupBys] = useState<string[]>([]); // extended in Task 7

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
      {/* Toolbar placeholder for groupBy + export (Tasks 7/8) */}
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
            </tr>
          </thead>
          <tbody>
            {sorted.map(c => (
              <tr key={c.id} className="border-b border-border hover:bg-muted">
                <th scope="row" className="py-2 pr-4 text-muted-foreground whitespace-nowrap font-normal">
                  {formatDate(c.completedAt)}
                </th>
                {questions.map(q => (
                  <td key={q.id} className="py-2 pr-4 text-muted-foreground">
                    {getAnswerDisplay(c.answers, q)}
                  </td>
                ))}
                <td className="py-2 text-foreground font-medium text-right">{c.xpEarned}</td>
                {hasSorts && <td />}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
