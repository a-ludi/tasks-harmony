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

describe('duplicateChore', () => {
  beforeAll(async () => {
    await useAppStore.getState().init();
  });

  test('creates a copy with empty completion history and returns new key', async () => {
    const choreKey = await useAppStore.getState().addChore({
      packId: 'personal',
      title: 'Original Chore',
      xpSize: 'M',
      recurrence: { frequency: 'weekly', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: true,
      active: true,
    });
    await useAppStore.getState().recordCompletion(choreKey, []);

    const newKey = await useAppStore.getState().duplicateChore(choreKey, 'Original Chore (copy)', 'personal');

    const state = useAppStore.getState();
    const dupe = state.chores.find((c) => c.key === newKey);
    expect(dupe).toBeDefined();
    expect(dupe?.title).toBe('Original Chore (copy)');
    expect(dupe?.xpSize).toBe('M');
    expect(dupe?.repeatable).toBe(true);
    expect(state.completions.filter((c) => c.choreKey === newKey)).toHaveLength(0);
  });

  test('copies questions to the duplicate', async () => {
    const choreKey = await useAppStore.getState().addChore({
      packId: 'personal',
      title: 'Chore With Q',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });
    await useAppStore.getState().saveQuestions(choreKey, [{
      id: crypto.randomUUID(), choreKey, prompt: 'Rate it?', type: 'INTEGER',
      required: true, order: 0, _isNew: true,
    } as import('@/components/questions/QuestionFormFields').DraftQuestion]);

    const newKey = await useAppStore.getState().duplicateChore(choreKey, 'Chore With Q (copy)', 'personal');

    const state = useAppStore.getState();
    const dupeQuestions = state.questions.filter((q) => q.choreKey === newKey);
    expect(dupeQuestions).toHaveLength(1);
    expect(dupeQuestions[0].prompt).toBe('Rate it?');
    expect(dupeQuestions[0].id).not.toBe(state.questions.find((q) => q.choreKey === choreKey)?.id);
  });

  test('throws on choreId collision in target pack', async () => {
    const choreKey = await useAppStore.getState().addChore({
      packId: 'personal',
      title: 'Clash Source',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });

    await expect(
      useAppStore.getState().duplicateChore(choreKey, 'Clash Source', 'personal')
    ).rejects.toThrow();
  });

  test('duplicates into a different pack', async () => {
    const targetPackId = await useAppStore.getState().addPack('Dupe Target Pack');
    const choreKey = await useAppStore.getState().addChore({
      packId: 'personal',
      title: 'Cross Pack Source',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });

    const newKey = await useAppStore.getState().duplicateChore(choreKey, 'Cross Pack Source', targetPackId);

    expect(newKey).toBe(`${targetPackId}/cross-pack-source`);
    expect(useAppStore.getState().chores.find((c) => c.key === newKey)?.packId).toBe(targetPackId);
  });
});
