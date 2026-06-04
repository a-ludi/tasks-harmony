import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, test } from 'bun:test';
import { useAppStore } from './index';

describe('moveChore', () => {
  beforeAll(async () => {
    await useAppStore.getState().init();
  });

  test('moves chore to target pack, updates key and packId', async () => {
    const packId = await useAppStore.getState().addPack('Move Target');
    const choreKey = await useAppStore.getState().addChore({
      packId: 'personal',
      title: 'Move Me',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });

    const success = await useAppStore.getState().moveChore(choreKey, packId);

    expect(success).toBe(true);
    const state = useAppStore.getState();
    expect(state.chores.find((c) => c.key === choreKey)).toBeUndefined();
    const moved = state.chores.find((c) => c.choreId === 'move-me' && c.packId === packId);
    expect(moved).toBeDefined();
    expect(moved?.key).toBe(`${packId}/move-me`);
  });

  test('returns false and writes nothing when target pack has same choreId', async () => {
    const packId = await useAppStore.getState().addPack('Collision Target');
    await useAppStore.getState().addChore({
      packId,
      title: 'Clash Chore',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });
    const sourceKey = await useAppStore.getState().addChore({
      packId: 'personal',
      title: 'Clash Chore',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });

    const success = await useAppStore.getState().moveChore(sourceKey, packId);

    expect(success).toBe(false);
    expect(useAppStore.getState().chores.find((c) => c.key === sourceKey)).toBeDefined();
  });

  test('cascades updated choreKey to all questions', async () => {
    const packId = await useAppStore.getState().addPack('Questions Target');
    const choreKey = await useAppStore.getState().addChore({
      packId: 'personal',
      title: 'Chore With Questions',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });
    await useAppStore.getState().saveQuestions(choreKey, [{
      id: crypto.randomUUID(), choreKey, prompt: 'Q?', type: 'TEXT',
      required: false, order: 0, _isNew: true,
    } as import('@/components/questions/QuestionFormFields').DraftQuestion]);

    await useAppStore.getState().moveChore(choreKey, packId);

    const newKey = `${packId}/chore-with-questions`;
    const state = useAppStore.getState();
    expect(state.questions.filter((q) => q.choreKey === choreKey)).toHaveLength(0);
    expect(state.questions.filter((q) => q.choreKey === newKey)).toHaveLength(1);
  });

  test('cascades updated choreKey to all completions', async () => {
    const packId = await useAppStore.getState().addPack('Completions Target');
    const choreKey = await useAppStore.getState().addChore({
      packId: 'personal',
      title: 'Chore With Completions',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });
    await useAppStore.getState().recordCompletion(choreKey, []);

    await useAppStore.getState().moveChore(choreKey, packId);

    const newKey = `${packId}/chore-with-completions`;
    const state = useAppStore.getState();
    expect(state.completions.filter((c) => c.choreKey === choreKey)).toHaveLength(0);
    expect(state.completions.filter((c) => c.choreKey === newKey)).toHaveLength(1);
  });
});
