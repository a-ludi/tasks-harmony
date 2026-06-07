import { describe, it, expect } from 'bun:test';
import { validateQuestionDrafts } from './choreFormValidation';

const baseMultiplier = {
  id: 'q-1',
  choreKey: 'personal/test',
  prompt: 'How many?',
  required: true as const,
  order: 0,
  type: 'MULTIPLIER' as const,
  multiplierAnswerType: 'integer' as const,
};

describe('validateQuestionDrafts — MULTIPLIER', () => {
  it('accepts xpPerUnit = 1 (repetition factor 1)', () => {
    expect(validateQuestionDrafts([{ ...baseMultiplier, xpPerUnit: 1 }])).toBeNull();
  });

  it('accepts xpPerUnit = 0.5 (repetition factor 2)', () => {
    expect(validateQuestionDrafts([{ ...baseMultiplier, xpPerUnit: 0.5 }])).toBeNull();
  });

  it('rejects xpPerUnit = 0', () => {
    expect(validateQuestionDrafts([{ ...baseMultiplier, xpPerUnit: 0 }])).toBe(
      'Repetition factor must be a whole number of 1 or more',
    );
  });

  it('rejects xpPerUnit = NaN', () => {
    expect(validateQuestionDrafts([{ ...baseMultiplier, xpPerUnit: NaN }])).toBe(
      'Repetition factor must be a whole number of 1 or more',
    );
  });

  it('rejects more than one multiplier', () => {
    const drafts = [
      { ...baseMultiplier, id: 'q-1', xpPerUnit: 0.5 },
      { ...baseMultiplier, id: 'q-2', xpPerUnit: 0.33 },
    ];
    expect(validateQuestionDrafts(drafts)).toBe(
      'Only one score multiplier question is allowed per chore',
    );
  });

  it('ignores deleted drafts', () => {
    expect(
      validateQuestionDrafts([{ ...baseMultiplier, xpPerUnit: NaN, _deleted: true }]),
    ).toBeNull();
  });
});
