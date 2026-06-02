import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it, test } from 'bun:test';
import { useAppStore } from './index';
import type { DraftQuestion } from '@/components/questions/QuestionFormFields';

describe('addPack', () => {
  beforeAll(async () => {
    await useAppStore.getState().init();
  });

  test('creates pack with slugified ID and adds it to store', async () => {
    const packId = await useAppStore.getState().addPack('Evening Routines');
    expect(packId).toBe('evening-routines');
    const pack = useAppStore.getState().packs.find((p) => p.id === 'evening-routines');
    expect(pack).toBeDefined();
    expect(pack?.manifest.title).toBe('Evening Routines');
    expect(pack?.isPersonal).toBe(false);
  });

  test('appends numeric suffix on ID collision', async () => {
    await useAppStore.getState().addPack('Clash Pack');
    const id2 = await useAppStore.getState().addPack('Clash Pack');
    expect(id2).toBe('clash-pack-2');
    expect(
      useAppStore.getState().packs.filter((p) => p.id.startsWith('clash-pack'))
    ).toHaveLength(2);
  });
});

describe('renamePack', () => {
  beforeAll(async () => {
    await useAppStore.getState().init();
  });

  test('updates manifest.title in store', async () => {
    await useAppStore.getState().addPack('Old Name');
    await useAppStore.getState().renamePack('old-name', 'New Name');
    const pack = useAppStore.getState().packs.find((p) => p.id === 'old-name');
    expect(pack?.manifest.title).toBe('New Name');
  });
});

describe('deletePack', () => {
  beforeAll(async () => {
    await useAppStore.getState().init();
  });

  it('removes the pack and all its chores, questions, and completions', async () => {
    const packId = await useAppStore.getState().addPack('Pack To Delete');
    const choreKey = await useAppStore.getState().addChore({
      packId,
      title: 'Chore In Pack',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });

    await useAppStore.getState().saveQuestions(choreKey, [{
      id: crypto.randomUUID(),
      choreKey,
      prompt: 'Test?',
      type: 'TEXT',
      required: false,
      order: 0,
      _isNew: true,
    } as DraftQuestion]);

    await useAppStore.getState().deletePack(packId);

    const state = useAppStore.getState();
    expect(state.packs.find((p) => p.id === packId)).toBeUndefined();
    expect(state.chores.find((c) => c.packId === packId)).toBeUndefined();
    expect(state.questions.find((q) => q.choreKey === choreKey)).toBeUndefined();
  });

  it('throws when attempting to delete the personal pack', async () => {
    await expect(useAppStore.getState().deletePack('personal')).rejects.toThrow();
  });
});
