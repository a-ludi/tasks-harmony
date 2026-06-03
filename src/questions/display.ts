import type { Question, Answer } from '@/types';

export function getAnswerDisplay(answers: Answer[], question: Question): string {
  const ans = answers.find((a) => a.questionId === question.id);
  if (!ans || ans.value === null || ans.value === '') return '';
  if (question.type === 'ENUM') {
    const choice = (question.choices ?? []).find((c) => c.id === String(ans.value));
    return choice?.label ?? String(ans.value);
  }
  return String(ans.value);
}
