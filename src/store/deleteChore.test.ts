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

    await useAppStore.getState().saveQuickAnswerSet({
      id: crypto.randomUUID(),
      choreKey,
      label: 'Quick',
      answers: [],
    });
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

  test('removes associated quick answer sets from state', () => {
    expect(useAppStore.getState().quickAnswerSets.filter(s => s.choreKey === choreKey)).toHaveLength(0);
  });

  test('persists deletion to IndexedDB', async () => {
    await useAppStore.getState().reload();
    expect(useAppStore.getState().chores.find(c => c.key === choreKey)).toBeUndefined();
  });
});

describe('deleteChore — XP preservation', () => {
  let choreKey2: string;
  let xpEarned: number;
  let packId: string;

  beforeAll(async () => {
    packId = await useAppStore.getState().addPack('Preservation Pack');
    choreKey2 = await useAppStore.getState().addChore({
      packId,
      title: 'XP Chore',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });
    await useAppStore.getState().recordCompletion(choreKey2);
    xpEarned = useAppStore.getState().completions
      .filter((c) => c.choreKey === choreKey2)
      .reduce((sum, c) => sum + c.xpEarned, 0);
    await useAppStore.getState().deleteChore(choreKey2);
  });

  test('accumulates deleted XP into pack manifest.deletedXP', () => {
    const pack = useAppStore.getState().packs.find((p) => p.id === packId);
    expect(pack?.manifest.deletedXP).toBe(xpEarned);
  });

  test('persists deletedXP to IndexedDB', async () => {
    await useAppStore.getState().reload();
    const pack = useAppStore.getState().packs.find((p) => p.id === packId);
    expect(pack?.manifest.deletedXP).toBe(xpEarned);
  });
});
