import { describe, it, expect } from 'bun:test';
import { validateQuestionDrafts } from './choreFormValidation';
import type { DraftQuestion } from '@/components/questions/QuestionFormFields';

function makeDraft(overrides: Record<string, unknown> = {}): DraftQuestion {
  return {
    id: 'q-1',
    choreKey: 'personal/test',
    prompt: 'How many?',
    type: 'TEXT',
    required: true,
    order: 0,
    ...overrides,
  } as DraftQuestion;
}

describe('validateQuestionDrafts', () => {
  it('returns null when there are no drafts', () => {
    expect(validateQuestionDrafts([])).toBeNull();
  });

  it('returns null when all drafts have valid or no regex patterns', () => {
    const drafts = [
      makeDraft({ type: 'TEXT', regexPattern: '^\\d{4}$' }),
      makeDraft({ id: 'q-2', type: 'INTEGER', order: 1 }),
    ];
    expect(validateQuestionDrafts(drafts)).toBeNull();
  });

  it('returns null when deleted drafts have invalid regex (deleted drafts are skipped)', () => {
    const drafts = [
      makeDraft({ type: 'TEXT', regexPattern: '[invalid', _deleted: true }),
    ];
    expect(validateQuestionDrafts(drafts)).toBeNull();
  });

  it('returns an error message when a draft has an invalid regex pattern', () => {
    const drafts = [makeDraft({ type: 'TEXT', regexPattern: '[invalid' })];
    const result = validateQuestionDrafts(drafts);
    expect(result).not.toBeNull();
    expect(result).toMatch(/invalid/i);
  });

  it('returns an error message when a draft has a catastrophically-backtracking regex', () => {
    const drafts = [makeDraft({ type: 'TEXT', regexPattern: '(a+)+' })];
    const result = validateQuestionDrafts(drafts);
    expect(result).not.toBeNull();
    expect(result).toMatch(/backtracking/i);
  });

  it('returns an error on the first invalid draft among multiple', () => {
    const drafts = [
      makeDraft({ type: 'TEXT', regexPattern: '^valid$' }),
      makeDraft({ id: 'q-2', type: 'TEXT', regexPattern: '(a+)+', order: 1 }),
    ];
    const result = validateQuestionDrafts(drafts);
    expect(result).not.toBeNull();
    expect(result).toMatch(/backtracking/i);
  });
});
