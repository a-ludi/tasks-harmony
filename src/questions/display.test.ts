import { describe, expect, it } from 'bun:test';
import type { EnumQuestion, EnumChoice } from '@/types';
import { getAnswerDisplay } from './display';

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

describe('getAnswerDisplay', () => {
  it('shows label when the stored UUID matches a choice', () => {
    expect(getAnswerDisplay([{ questionId: 'q-1', value: 'uuid-1' }], q)).toBe('High');
  });

  it('falls back to raw value when UUID has no matching choice', () => {
    expect(getAnswerDisplay([{ questionId: 'q-1', value: 'unknown-uuid' }], q)).toBe('unknown-uuid');
  });

  it('returns empty string when answer is absent', () => {
    expect(getAnswerDisplay([], q)).toBe('');
  });
});
