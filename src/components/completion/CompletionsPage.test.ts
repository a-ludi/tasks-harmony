import { describe, expect, it } from 'bun:test';
import type { EnumQuestion, Answer, EnumChoice } from '@/types';

function resolveAnswerDisplay(
  answers: Answer[],
  question: EnumQuestion,
): string {
  const ans = answers.find((a) => a.questionId === question.id);
  if (!ans || ans.value === null || ans.value === '') return '';
  if (question.type === 'ENUM') {
    const choice = (question.choices ?? []).find((c) => c.id === ans.value);
    return choice?.label ?? String(ans.value);
  }
  return String(ans.value);
}

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
    expect(resolveAnswerDisplay(answers, q)).toBe('High');
  });

  it('falls back to raw value when UUID has no matching choice', () => {
    const answers: Answer[] = [{ questionId: 'q-1', value: 'unknown-uuid' }];
    expect(resolveAnswerDisplay(answers, q)).toBe('unknown-uuid');
  });

  it('returns empty string when answer is absent', () => {
    expect(resolveAnswerDisplay([], q)).toBe('');
  });
});
