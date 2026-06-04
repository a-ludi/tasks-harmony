import { describe, it, expect } from 'bun:test';
import type { Question, Answer } from '@/types';
import { getAnswerDisplay } from '@/questions/display';

function buildTooltipRows(
  questions: Question[],
  answers: Answer[],
): Array<{ prompt: string; display: string }> {
  return [...questions]
    .sort((a, b) => a.order - b.order)
    .map((q) => ({
      prompt: q.prompt,
      display: getAnswerDisplay(answers, q) || '—',
    }));
}

const Q_TEXT: Question = {
  id: 'q-1', choreKey: 'p/c', prompt: 'How long?',
  type: 'TEXT', required: false, order: 0,
};
const Q_BOOL: Question = {
  id: 'q-2', choreKey: 'p/c', prompt: 'Difficult?',
  type: 'BOOLEAN', required: false, order: 1,
};

describe('buildTooltipRows', () => {
  it('shows answer value when present', () => {
    const answers: Answer[] = [{ questionId: 'q-1', value: '30 min' }];
    const rows = buildTooltipRows([Q_TEXT, Q_BOOL], answers);
    expect(rows[0].display).toBe('30 min');
  });

  it('shows — for null answers', () => {
    const answers: Answer[] = [{ questionId: 'q-1', value: null }];
    const rows = buildTooltipRows([Q_TEXT], answers);
    expect(rows[0].display).toBe('—');
  });

  it('shows — when question has no answer entry', () => {
    const rows = buildTooltipRows([Q_BOOL], []);
    expect(rows[0].display).toBe('—');
  });

  it('sorts by question order', () => {
    const rows = buildTooltipRows([Q_BOOL, Q_TEXT], []);
    expect(rows[0].prompt).toBe('How long?');
    expect(rows[1].prompt).toBe('Difficult?');
  });
});
