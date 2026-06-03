import { describe, expect, it } from 'bun:test';
import type { EnumQuestion, Answer, EnumChoice } from '@/types';
import { getAnswerDisplay } from '@/questions/display';

const choice: EnumChoice = { id: 'uuid-1', label: 'High', order: 0 };
const q: EnumQuestion = {
  id: 'q-1',
  choreKey: 'personal/test',
  prompt: 'Effort?',
  type: 'ENUM',
  required: true,
  order: 0,
  choices: [choice],
};

describe('ENUM answer display in CompletionsPage', () => {
  it('shows label when the stored UUID matches a choice', () => {
    const answers: Answer[] = [{ questionId: 'q-1', value: 'uuid-1' }];
    expect(getAnswerDisplay(answers, q)).toBe('High');
  });

  it('falls back to raw value when UUID has no matching choice', () => {
    const answers: Answer[] = [{ questionId: 'q-1', value: 'unknown-uuid' }];
    expect(getAnswerDisplay(answers, q)).toBe('unknown-uuid');
  });

  it('returns empty string when answer is absent', () => {
    expect(getAnswerDisplay([], q)).toBe('');
  });
});
