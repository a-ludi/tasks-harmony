import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, test } from 'bun:test';
import { useAppStore } from './index';
import type { DraftQuestion } from '@/components/questions/QuestionFormFields';

describe('deleteChore', () => {
  let choreKey: string;
  let qId: string;

  beforeAll(async () => {
    await useAppStore.getState().init();

    choreKey = await useAppStore.getState().addChore({
      packId: 'personal',
      title: 'To Delete',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });

    qId = crypto.randomUUID();
    await useAppStore.getState().saveQuestions(choreKey, [{
      id: qId, choreKey, prompt: 'Notes?', type: 'TEXT',
      required: false, order: 0, _isNew: true,
    } as DraftQuestion]);

    await useAppStore.getState().recordCompletion(choreKey, [{ questionId: qId, value: 'hello' }]);
  });

  test('removes chore from state', async () => {
    await useAppStore.getState().deleteChore(choreKey);
    expect(useAppStore.getState().chores.find(c => c.key === choreKey)).toBeUndefined();
  });

  test('removes associated completions from state', () => {
    expect(useAppStore.getState().completions.filter(c => c.choreKey === choreKey)).toHaveLength(0);
  });

  test('removes associated questions from state', () => {
    expect(useAppStore.getState().questions.filter(q => q.choreKey === choreKey)).toHaveLength(0);
  });
});
