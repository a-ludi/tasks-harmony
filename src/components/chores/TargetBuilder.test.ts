import { describe, it, expect } from 'bun:test';
import { isDuplicateOfAnyDraft } from './TargetBuilder';
import type { Question, Answer } from '@/types';
import type { DraftTarget } from '@/store';

const q1: Question = { id: 'q1', choreKey: 'p/c', prompt: 'Q1', required: false, order: 1, type: 'TEXT' };
const q2: Question = { id: 'q2', choreKey: 'p/c', prompt: 'Q2', required: false, order: 2, type: 'INTEGER' };

function makeDraft(q1Val: string | null, q2Val: number | null): DraftTarget {
  const answers: Answer[] = [];
  if (q1Val !== null) answers.push({ questionId: 'q1', value: q1Val });
  if (q2Val !== null) answers.push({ questionId: 'q2', value: q2Val });
  return { id: 'draft-1', order: 0, answers };
}

describe('isDuplicateOfAnyDraft', () => {
  it('returns true when completion answers exactly match a draft', () => {
    const drafts = [makeDraft('hello', 5)];
    const answers: Answer[] = [
      { questionId: 'q1', value: 'hello' },
      { questionId: 'q2', value: 5 },
    ];
    expect(isDuplicateOfAnyDraft(answers, drafts, [q1, q2])).toBe(true);
  });

  it('returns false when one answer value differs', () => {
    const drafts = [makeDraft('hello', 5)];
    const answers: Answer[] = [
      { questionId: 'q1', value: 'hello' },
      { questionId: 'q2', value: 6 },
    ];
    expect(isDuplicateOfAnyDraft(answers, drafts, [q1, q2])).toBe(false);
  });

  it('returns false when draft has null for a question but completion has a value', () => {
    const drafts = [makeDraft(null, 5)];
    const answers: Answer[] = [
      { questionId: 'q1', value: 'hello' },
      { questionId: 'q2', value: 5 },
    ];
    expect(isDuplicateOfAnyDraft(answers, drafts, [q1, q2])).toBe(false);
  });

  it('returns true when both have null for a question', () => {
    const drafts = [makeDraft(null, 5)];
    const answers: Answer[] = [{ questionId: 'q2', value: 5 }]; // q1 absent → null
    expect(isDuplicateOfAnyDraft(answers, drafts, [q1, q2])).toBe(true);
  });

  it('returns false when there are no drafts', () => {
    const answers: Answer[] = [{ questionId: 'q1', value: 'hello' }];
    expect(isDuplicateOfAnyDraft(answers, [], [q1])).toBe(false);
  });

  it('returns true if any one draft matches', () => {
    const drafts = [makeDraft('other', 1), makeDraft('hello', 5)];
    const answers: Answer[] = [
      { questionId: 'q1', value: 'hello' },
      { questionId: 'q2', value: 5 },
    ];
    expect(isDuplicateOfAnyDraft(answers, drafts, [q1, q2])).toBe(true);
  });
});
