import { describe, it, expect } from 'bun:test';
import type { QuickAnswerSet } from '@/types';

function filterByChore(sets: QuickAnswerSet[], choreKey: string): QuickAnswerSet[] {
  return sets.filter((s) => s.choreKey === choreKey);
}

const SET_A: QuickAnswerSet = { id: '1', choreKey: 'pack/chore-a', label: 'Default', answers: [] };
const SET_B: QuickAnswerSet = { id: '2', choreKey: 'pack/chore-b', label: 'Fast', answers: [] };

describe('filterByChore', () => {
  it('returns only sets for the given choreKey', () => {
    expect(filterByChore([SET_A, SET_B], 'pack/chore-a')).toHaveLength(1);
  });

  it('returns empty when no sets match', () => {
    expect(filterByChore([SET_B], 'pack/chore-a')).toHaveLength(0);
  });
});
