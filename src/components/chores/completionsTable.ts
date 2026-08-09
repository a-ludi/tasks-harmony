// src/components/chores/completionsTable.ts
import type { Completion, Question, Answer, EnumQuestion, Target } from '@/types';
import { getAnswerDisplay } from '@/questions/display';

export type SortDir = 'asc' | 'desc';
export type SortKey = 'completedAt' | `question:${string}` | 'xpEarned';
export interface SortEntry { key: SortKey; dir: SortDir; }

export function isGroupableQuestion(q: Question): boolean {
  return q.type === 'ENUM' || q.type === 'INTEGER' || q.type === 'BOOLEAN' || q.type === 'MULTIPLIER';
}

export interface TotalsRow {
  count: number;
  xpSum: number;
  questionSums: Record<string, number | null>;
}

export interface JsonCompletionAnswer {
  prompt: string;
  value: string;
  enumIndex?: number;
}

export interface JsonCompletion {
  completedAt: string;
  xpEarned: number;
  streak: number;
  answers: JsonCompletionAnswer[];
}

function questionIdFromKey(key: SortKey): string | null {
  return key.startsWith('question:') ? key.slice('question:'.length) : null;
}

function getAnswerValue(c: Completion, qId: string): string | number | boolean | null {
  return c.answers.find(a => a.questionId === qId)?.value ?? null;
}

function compareValues(a: unknown, b: unknown): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0);
  return String(a).localeCompare(String(b));
}

function compareByKey(a: Completion, b: Completion, key: SortKey, dir: SortDir, questions: Question[]): number {
  let result = 0;
  if (key === 'completedAt') {
    result = new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime();
  } else if (key === 'xpEarned') {
    result = a.xpEarned - b.xpEarned;
  } else {
    const qId = questionIdFromKey(key)!;
    const q = questions.find(q => q.id === qId);
    const av = getAnswerValue(a, qId);
    const bv = getAnswerValue(b, qId);
    if (q?.type === 'ENUM') {
      const choices = (q as EnumQuestion).choices ?? [];
      const aOrder = av === null ? Infinity : (choices.find(c => c.id === String(av))?.order ?? Infinity);
      const bOrder = bv === null ? Infinity : (choices.find(c => c.id === String(bv))?.order ?? Infinity);
      result = aOrder - bOrder;
    } else {
      result = compareValues(av, bv);
    }
  }
  return dir === 'asc' ? result : -result;
}

export function sortCompletions(completions: Completion[], sorts: SortEntry[], questions: Question[]): Completion[] {
  if (sorts.length === 0) return completions;
  return [...completions].sort((a, b) => {
    for (const sort of sorts) {
      const r = compareByKey(a, b, sort.key, sort.dir, questions);
      if (r !== 0) return r;
    }
    return 0;
  });
}

export function getGroupKey(completion: Completion, groupBys: string[]): string {
  return JSON.stringify(groupBys.map(qId => getAnswerValue(completion, qId)));
}

export function groupCompletions(completions: Completion[], groupBys: string[]): Map<string, Completion[]> {
  const groups = new Map<string, Completion[]>();
  for (const c of completions) {
    const key = getGroupKey(c, groupBys);
    const existing = groups.get(key);
    if (existing) existing.push(c);
    else groups.set(key, [c]);
  }
  return groups;
}

export function groupTargets(targets: Target[], groupBys: string[]): Map<string, Target[]> {
  const groups = new Map<string, Target[]>();
  for (const t of targets) {
    const key = JSON.stringify(groupBys.map((qId) => t.answers.find((a) => a.questionId === qId)?.value ?? null));
    const existing = groups.get(key);
    if (existing) existing.push(t);
    else groups.set(key, [t]);
  }
  return groups;
}

export function getGroupLabel(key: string, groupBys: string[], questions: Question[]): string {
  const values = JSON.parse(key) as Array<string | number | boolean | null>;
  return groupBys.map((qId, i) => {
    const q = questions.find(q => q.id === qId);
    if (!q) return String(values[i] ?? '—');
    const fakeAnswer: Answer = { questionId: qId, value: values[i] };
    return `${q.prompt}: ${getAnswerDisplay([fakeAnswer], q) || '—'}`;
  }).join(', ');
}

export function computeTotals(completions: Completion[], questions: Question[]): TotalsRow {
  const questionSums: Record<string, number | null> = {};
  for (const q of questions) {
    if (q.type === 'INTEGER' || q.type === 'MULTIPLIER') {
      questionSums[q.id] = completions.reduce((sum, c) => {
        const v = getAnswerValue(c, q.id);
        return sum + (typeof v === 'number' ? v : 0);
      }, 0);
    } else {
      questionSums[q.id] = null;
    }
  }
  return {
    count: completions.length,
    xpSum: completions.reduce((sum, c) => sum + c.xpEarned, 0),
    questionSums,
  };
}

export function addGroupBy(groupBys: string[], sorts: SortEntry[], questionId: string): { groupBys: string[]; sorts: SortEntry[] } {
  const newGroupBys = [...groupBys, questionId];
  const groupKeySet = new Set(newGroupBys.map(id => `question:${id}` as SortKey));
  const key = `question:${questionId}` as SortKey;
  const wasInExtra = sorts.some(s => s.key === key) && !groupBys.includes(questionId);
  const existingEntry = sorts.find(s => s.key === key);
  const extraSorts = sorts.filter(s => !groupKeySet.has(s.key));
  const orderedGroupSorts: SortEntry[] = newGroupBys
    .map(id => sorts.find(s => s.key === `question:${id}`))
    .filter((s): s is SortEntry => s !== undefined);
  if (!orderedGroupSorts.find(s => s.key === key)) {
    orderedGroupSorts.push(wasInExtra && existingEntry ? existingEntry : { key, dir: 'asc' });
  }
  return { groupBys: newGroupBys, sorts: [...orderedGroupSorts, ...extraSorts] };
}

export function removeGroupBy(groupBys: string[], sorts: SortEntry[], questionId: string): { groupBys: string[]; sorts: SortEntry[] } {
  const key = `question:${questionId}` as SortKey;
  return {
    groupBys: groupBys.filter(id => id !== questionId),
    sorts: sorts.filter(s => s.key !== key),
  };
}

export function clickColumnHeader(sorts: SortEntry[], key: SortKey, groupBys: string[]): SortEntry[] {
  const qId = questionIdFromKey(key);
  const isGrouped = qId !== null && groupBys.includes(qId);
  const existing = sorts.find(s => s.key === key);
  if (!existing) {
    if (isGrouped) {
      const groupKeySet = new Set(groupBys.map(id => `question:${id}` as SortKey));
      const groupSorts = sorts.filter(s => groupKeySet.has(s.key));
      const extraSorts = sorts.filter(s => !groupKeySet.has(s.key));
      return [...groupSorts, { key, dir: 'asc' }, ...extraSorts];
    }
    return [...sorts, { key, dir: 'asc' }];
  }
  if (existing.dir === 'asc') return sorts.map(s => s.key === key ? { ...s, dir: 'desc' as SortDir } : s);
  return sorts.filter(s => s.key !== key);
}

// --- Export data builders (exported for testing) ---

function chronological(completions: Completion[]): Completion[] {
  return [...completions].sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());
}

export function buildCsvHeaders(questions: Question[]): string[] {
  const headers = ['Completed at', 'Streak'];
  for (const q of questions) {
    headers.push(q.prompt);
    if (q.type === 'ENUM') headers.push(`${q.prompt} (index)`);
  }
  headers.push('XP earned');
  return headers;
}

export function buildCsvRows(completions: Completion[], questions: Question[]): string[][] {
  return chronological(completions).map(c => {
    const row: string[] = [
      c.completedAt,
      String(c.streak),
    ];
    for (const q of questions) {
      row.push(getAnswerDisplay(c.answers, q));
      if (q.type === 'ENUM') {
        const ans = c.answers.find(a => a.questionId === q.id);
        const choice = (q as EnumQuestion).choices?.find(ch => ch.id === String(ans?.value));
        row.push(choice ? String(choice.order) : '');
      }
    }
    row.push(String(c.xpEarned));
    return row;
  });
}

export function buildJsonData(completions: Completion[], questions: Question[]): JsonCompletion[] {
  return chronological(completions).map(c => ({
    completedAt: c.completedAt,
    xpEarned: c.xpEarned,
    streak: c.streak,
    answers: questions.map(q => {
      const ans = c.answers.find(a => a.questionId === q.id);
      const value = getAnswerDisplay(c.answers, q);
      if (q.type === 'ENUM') {
        const choice = (q as EnumQuestion).choices?.find(ch => ch.id === String(ans?.value));
        return { prompt: q.prompt, value, enumIndex: choice?.order };
      }
      return { prompt: q.prompt, value };
    }),
  }));
}

function csvEscape(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function getDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportCsv(completions: Completion[], questions: Question[], choreTitle: string): void {
  const headers = buildCsvHeaders(questions);
  const rows = buildCsvRows(completions, questions);
  const csv = [headers, ...rows].map(r => r.map(csvEscape).join(',')).join('\n');
  triggerDownload(csv, `${getDateString()}-completions-${slugify(choreTitle)}.csv`, 'text/csv');
}

export function exportJson(completions: Completion[], questions: Question[], choreTitle: string): void {
  const data = buildJsonData(completions, questions);
  triggerDownload(JSON.stringify(data, null, 2), `${getDateString()}-completions-${slugify(choreTitle)}.json`, 'application/json');
}
