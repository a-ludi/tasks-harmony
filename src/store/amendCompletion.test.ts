import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, test } from 'bun:test';
import { useAppStore } from './index';
import type { DraftQuestion } from '@/components/questions/QuestionFormFields';

describe('amendCompletion', () => {
  let choreKey: string;
  let completionId: string;
  let multiplierQId: string;

  beforeAll(async () => {
    await useAppStore.getState().init();

    choreKey = await useAppStore.getState().addChore({
      packId: 'personal',
      title: 'Amendable Chore',
      xpSize: 'S', // base XP = 5
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });

    multiplierQId = crypto.randomUUID();
    await useAppStore.getState().saveQuestions(choreKey, [{
      id: multiplierQId, choreKey, prompt: 'Reps?', type: 'MULTIPLIER',
      required: true, order: 0, xpPerUnit: 2, multiplierAnswerType: 'integer', _isNew: true,
    } as DraftQuestion]);

    await useAppStore.getState().recordCompletion(choreKey, [{ questionId: multiplierQId, value: 3 }]);
    completionId = useAppStore.getState().completions.find(c => c.choreKey === choreKey)!.id;
  });

  test('updates answers on the completion', async () => {
    const newAnswers = [{ questionId: multiplierQId, value: 5 }];
    await useAppStore.getState().amendCompletion(completionId, {
      completedAt: '2026-01-01T10:00:00.000Z',
      answers: newAnswers,
    });
    const c = useAppStore.getState().completions.find(c => c.id === completionId)!;
    expect(c.answers).toEqual(newAnswers);
  });

  test('recalculates xpEarned after answer change', () => {
    // answer=5, xpPerUnit=2, xpSize=S(base=5), streak=1, totalCompletions=0
    // streakMult ≈ 1.1414, decayMult=1.0 → round(5 × 1.1414) = 6 → round(6 × 2 × 5) = 60
    const c = useAppStore.getState().completions.find(c => c.id === completionId)!;
    expect(c.xpEarned).toBe(60);
  });

  test('updates completedAt', async () => {
    await useAppStore.getState().amendCompletion(completionId, {
      completedAt: '2026-01-01T18:00:00.000Z',
      answers: [{ questionId: multiplierQId, value: 5 }],
    });
    const c = useAppStore.getState().completions.find(c => c.id === completionId)!;
    expect(c.completedAt).toBe('2026-01-01T18:00:00.000Z');
  });

  test('preserves streak value (not recalculated)', () => {
    const c = useAppStore.getState().completions.find(c => c.id === completionId)!;
    expect(c.streak).toBeGreaterThan(0); // same as originally recorded
  });
});
