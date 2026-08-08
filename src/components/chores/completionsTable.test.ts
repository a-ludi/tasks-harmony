// src/components/chores/completionsTable.test.ts
import { describe, it, expect } from 'bun:test';
import {
  sortCompletions, getGroupKey, groupCompletions, getGroupLabel,
  computeTotals, addGroupBy, removeGroupBy, clickColumnHeader,
  buildCsvRows, buildCsvHeaders, buildJsonData,
} from './completionsTable.ts';
import type { Completion, Question, EnumQuestion, IntegerQuestion } from '@/types';

const mkCompletion = (overrides: Partial<Completion> = {}): Completion => ({
  id: 'c1', choreKey: 'k', completedAt: '2026-01-01T12:00:00Z',
  xpEarned: 100, streak: 1, answers: [], ...overrides,
});

const mkEnumQ = (overrides: Partial<EnumQuestion> = {}): EnumQuestion => ({
  id: 'q1', choreKey: 'k', prompt: 'Mood', required: false, order: 1, type: 'ENUM',
  choices: [
    { id: 'c1', label: 'Happy', order: 1 },
    { id: 'c2', label: 'Sad', order: 2 },
  ],
  ...overrides,
});

const mkIntQ = (overrides: Partial<IntegerQuestion> = {}): IntegerQuestion => ({
  id: 'q2', choreKey: 'k', prompt: 'Count', required: false, order: 2, type: 'INTEGER', ...overrides,
});

// --- Sort ---
describe('sortCompletions', () => {
  it('sorts by completedAt asc', () => {
    const a = mkCompletion({ id: 'a', completedAt: '2026-01-01T00:00:00Z' });
    const b = mkCompletion({ id: 'b', completedAt: '2026-01-02T00:00:00Z' });
    expect(sortCompletions([b, a], [{ key: 'completedAt', dir: 'asc' }], [])).toEqual([a, b]);
  });

  it('sorts by completedAt desc', () => {
    const a = mkCompletion({ id: 'a', completedAt: '2026-01-01T00:00:00Z' });
    const b = mkCompletion({ id: 'b', completedAt: '2026-01-02T00:00:00Z' });
    expect(sortCompletions([a, b], [{ key: 'completedAt', dir: 'desc' }], [])).toEqual([b, a]);
  });

  it('sorts by xpEarned asc', () => {
    const a = mkCompletion({ id: 'a', xpEarned: 50 });
    const b = mkCompletion({ id: 'b', xpEarned: 200 });
    expect(sortCompletions([b, a], [{ key: 'xpEarned', dir: 'asc' }], [])).toEqual([a, b]);
  });

  it('sorts by INTEGER question value, null last', () => {
    const q = mkIntQ();
    const a = mkCompletion({ id: 'a', answers: [{ questionId: 'q2', value: 3 }] });
    const b = mkCompletion({ id: 'b', answers: [{ questionId: 'q2', value: 7 }] });
    const c = mkCompletion({ id: 'c', answers: [{ questionId: 'q2', value: null }] });
    expect(sortCompletions([c, b, a], [{ key: 'question:q2', dir: 'asc' }], [q])).toEqual([a, b, c]);
  });

  it('sorts by ENUM question by choice.order', () => {
    const q = mkEnumQ();
    const happy = mkCompletion({ id: 'h', answers: [{ questionId: 'q1', value: 'c1' }] });
    const sad = mkCompletion({ id: 's', answers: [{ questionId: 'q1', value: 'c2' }] });
    expect(sortCompletions([sad, happy], [{ key: 'question:q1', dir: 'asc' }], [q])).toEqual([happy, sad]);
  });

  it('applies multi-column sort with tiebreaking', () => {
    const q = mkEnumQ();
    const a = mkCompletion({ id: 'a', xpEarned: 100, answers: [{ questionId: 'q1', value: 'c1' }] });
    const b = mkCompletion({ id: 'b', xpEarned: 200, answers: [{ questionId: 'q1', value: 'c1' }] });
    const c = mkCompletion({ id: 'c', xpEarned: 50, answers: [{ questionId: 'q1', value: 'c2' }] });
    const result = sortCompletions([c, b, a], [
      { key: 'question:q1', dir: 'asc' },
      { key: 'xpEarned', dir: 'asc' },
    ], [q]);
    expect(result).toEqual([a, b, c]);
  });

  it('returns original order when sorts is empty', () => {
    const a = mkCompletion({ id: 'a' });
    const b = mkCompletion({ id: 'b' });
    expect(sortCompletions([a, b], [], [])).toEqual([a, b]);
  });
});

// --- Group key ---
describe('getGroupKey', () => {
  it('serialises single groupBy answer value', () => {
    const c = mkCompletion({ answers: [{ questionId: 'q1', value: 'c1' }] });
    expect(getGroupKey(c, ['q1'])).toBe(JSON.stringify(['c1']));
  });

  it('serialises compound groupBy tuple', () => {
    const c = mkCompletion({ answers: [{ questionId: 'q1', value: 'c1' }, { questionId: 'q2', value: 3 }] });
    expect(getGroupKey(c, ['q1', 'q2'])).toBe(JSON.stringify(['c1', 3]));
  });

  it('uses null for missing answer', () => {
    const c = mkCompletion({ answers: [] });
    expect(getGroupKey(c, ['q1'])).toBe(JSON.stringify([null]));
  });

  it('same key for same values', () => {
    const a = mkCompletion({ id: 'a', answers: [{ questionId: 'q1', value: 'c1' }] });
    const b = mkCompletion({ id: 'b', answers: [{ questionId: 'q1', value: 'c1' }] });
    expect(getGroupKey(a, ['q1'])).toBe(getGroupKey(b, ['q1']));
  });

  it('different key for different values', () => {
    const a = mkCompletion({ id: 'a', answers: [{ questionId: 'q1', value: 'c1' }] });
    const b = mkCompletion({ id: 'b', answers: [{ questionId: 'q1', value: 'c2' }] });
    expect(getGroupKey(a, ['q1'])).not.toBe(getGroupKey(b, ['q1']));
  });
});

describe('groupCompletions', () => {
  it('groups into a Map keyed by tuple', () => {
    const a = mkCompletion({ id: 'a', answers: [{ questionId: 'q1', value: 'c1' }] });
    const b = mkCompletion({ id: 'b', answers: [{ questionId: 'q1', value: 'c2' }] });
    const c = mkCompletion({ id: 'c', answers: [{ questionId: 'q1', value: 'c1' }] });
    const groups = groupCompletions([a, b, c], ['q1']);
    expect(groups.size).toBe(2);
    expect(groups.get(JSON.stringify(['c1']))).toEqual([a, c]);
    expect(groups.get(JSON.stringify(['c2']))).toEqual([b]);
  });
});

// --- Totals ---
describe('computeTotals', () => {
  it('counts completions for completedAt', () => {
    const cs = [mkCompletion({ id: 'a' }), mkCompletion({ id: 'b' })];
    expect(computeTotals(cs, []).count).toBe(2);
  });

  it('sums xpEarned', () => {
    const cs = [mkCompletion({ xpEarned: 100 }), mkCompletion({ xpEarned: 50 })];
    expect(computeTotals(cs, []).xpSum).toBe(150);
  });

  it('sums INTEGER question answers, treating null as 0', () => {
    const q = mkIntQ();
    const cs = [
      mkCompletion({ answers: [{ questionId: 'q2', value: 5 }] }),
      mkCompletion({ answers: [{ questionId: 'q2', value: null }] }),
    ];
    expect(computeTotals(cs, [q]).questionSums['q2']).toBe(5);
  });

  it('returns null sum for ENUM question', () => {
    const q = mkEnumQ();
    const cs = [mkCompletion({ answers: [{ questionId: 'q1', value: 'c1' }] })];
    expect(computeTotals(cs, [q]).questionSums['q1']).toBeNull();
  });
});

// --- Sort/group invariant ---
describe('addGroupBy', () => {
  it('adds new column to groupBys and groupSorts with asc', () => {
    const result = addGroupBy([], [], 'q1');
    expect(result.groupBys).toEqual(['q1']);
    expect(result.sorts).toEqual([{ key: 'question:q1', dir: 'asc' }]);
  });

  it('inserts new groupSort before extraSorts', () => {
    const sorts = [{ key: 'question:q1' as const, dir: 'asc' as const }, { key: 'xpEarned' as const, dir: 'desc' as const }];
    const result = addGroupBy(['q1'], sorts, 'q2');
    expect(result.sorts).toEqual([
      { key: 'question:q1', dir: 'asc' },
      { key: 'question:q2', dir: 'asc' },
      { key: 'xpEarned', dir: 'desc' },
    ]);
  });

  it('moves existing extraSort to groupSorts, preserving direction', () => {
    const sorts = [{ key: 'question:q1' as const, dir: 'desc' as const }];
    const result = addGroupBy([], sorts, 'q1');
    expect(result.sorts).toEqual([{ key: 'question:q1', dir: 'desc' }]);
  });
});

describe('removeGroupBy', () => {
  it('removes column from groupBys and sorts', () => {
    const sorts = [{ key: 'question:q1' as const, dir: 'asc' as const }, { key: 'xpEarned' as const, dir: 'asc' as const }];
    const result = removeGroupBy(['q1'], sorts, 'q1');
    expect(result.groupBys).toEqual([]);
    expect(result.sorts).toEqual([{ key: 'xpEarned', dir: 'asc' }]);
  });
});

describe('clickColumnHeader', () => {
  it('adds unsorted non-grouped column as asc', () => {
    expect(clickColumnHeader([], 'xpEarned', [])).toEqual([{ key: 'xpEarned', dir: 'asc' }]);
  });

  it('asc → desc', () => {
    const sorts = [{ key: 'xpEarned' as const, dir: 'asc' as const }];
    expect(clickColumnHeader(sorts, 'xpEarned', [])).toEqual([{ key: 'xpEarned', dir: 'desc' }]);
  });

  it('desc → removed', () => {
    const sorts = [{ key: 'xpEarned' as const, dir: 'desc' as const }];
    expect(clickColumnHeader(sorts, 'xpEarned', [])).toEqual([]);
  });

  it('adds unsorted grouped column into groupSorts zone before extraSorts', () => {
    const sorts = [{ key: 'xpEarned' as const, dir: 'asc' as const }];
    const result = clickColumnHeader(sorts, 'question:q1', ['q1']);
    expect(result).toEqual([
      { key: 'question:q1', dir: 'asc' },
      { key: 'xpEarned', dir: 'asc' },
    ]);
  });
});

// --- Export data builders ---
describe('buildCsvHeaders', () => {
  it('includes two columns for ENUM questions', () => {
    const q = mkEnumQ();
    const headers = buildCsvHeaders([q]);
    expect(headers).toEqual(['completedAt', 'streak', 'Mood', 'Mood (index)', 'xpEarned']);
  });

  it('includes one column for INTEGER questions', () => {
    const q = mkIntQ();
    const headers = buildCsvHeaders([q]);
    expect(headers).toEqual(['completedAt', 'streak', 'Count', 'xpEarned']);
  });
});

describe('buildCsvRows', () => {
  it('outputs chronological order regardless of input order', () => {
    const a = mkCompletion({ id: 'a', completedAt: '2026-01-01T00:00:00Z' });
    const b = mkCompletion({ id: 'b', completedAt: '2026-01-02T00:00:00Z' });
    const rows = buildCsvRows([b, a], []);
    expect(rows[0][0]).toContain('Jan 1');
    expect(rows[1][0]).toContain('Jan 2');
  });

  it('includes enumIndex column for ENUM questions', () => {
    const q = mkEnumQ();
    const c = mkCompletion({ answers: [{ questionId: 'q1', value: 'c1' }] });
    const rows = buildCsvRows([c], [q]);
    // columns: completedAt, streak, Mood (display), Mood (index), xpEarned
    expect(rows[0][2]).toBe('Happy');
    expect(rows[0][3]).toBe('1'); // choice.order for 'c1'
  });

  it('uses empty string for null answer', () => {
    const q = mkIntQ();
    const c = mkCompletion({ answers: [{ questionId: 'q2', value: null }] });
    const rows = buildCsvRows([c], [q]);
    expect(rows[0][2]).toBe('');
  });
});

describe('buildJsonData', () => {
  it('includes enumIndex only for ENUM answers', () => {
    const enumQ = mkEnumQ();
    const intQ = mkIntQ();
    const c = mkCompletion({ answers: [{ questionId: 'q1', value: 'c1' }, { questionId: 'q2', value: 5 }] });
    const data = buildJsonData([c], [enumQ, intQ]);
    const moodAnswer = data[0].answers.find(a => a.prompt === 'Mood')!;
    const countAnswer = data[0].answers.find(a => a.prompt === 'Count')!;
    expect(moodAnswer.enumIndex).toBe(1);
    expect('enumIndex' in countAnswer).toBe(false);
  });

  it('outputs chronological order', () => {
    const a = mkCompletion({ id: 'a', completedAt: '2026-01-01T00:00:00Z' });
    const b = mkCompletion({ id: 'b', completedAt: '2026-01-02T00:00:00Z' });
    const data = buildJsonData([b, a], []);
    expect(data[0].completedAt).toBe('2026-01-01T00:00:00Z');
  });
});
