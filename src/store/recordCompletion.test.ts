import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, test } from 'bun:test';
import { useAppStore } from './index';
import type { DraftQuestion } from '@/components/questions/QuestionFormFields';

describe('recordCompletion — MULTIPLIER question', () => {
  let choreKey: string;
  let multiplierQuestionId: string;

  beforeAll(async () => {
    await useAppStore.getState().init();
    choreKey = await useAppStore.getState().addChore({
      packId: 'personal',
      title: 'Multiplier Chore',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });

    multiplierQuestionId = crypto.randomUUID();
    await useAppStore.getState().saveQuestions(choreKey, [{
      id: multiplierQuestionId,
      choreKey,
      prompt: 'How many reps?',
      type: 'MULTIPLIER',
      required: true,
      order: 0,
      xpPerUnit: 2,
      multiplierAnswerType: 'integer',
      _isNew: true,
    } as DraftQuestion]);
  });

  test('xpEarned is multiplied by xpPerUnit × answer', async () => {
    await useAppStore.getState().recordCompletion(choreKey, [
      { questionId: multiplierQuestionId, value: 3 },
    ]);

    const completions = useAppStore.getState().completions.filter((c) => c.choreKey === choreKey);
    expect(completions).toHaveLength(1);
    // base XP for S ≈ 5, actual = base × 2 × 3 — verify it's much more than bare base XP
    expect(completions[0].xpEarned).toBeGreaterThan(5);
  });
});

describe('recordCompletion — no-streak pack', () => {
  let noStreakPackId: string;
  let noStreakChoreKey: string;
  let defaultStreakPackId: string;
  let defaultStreakChoreKey: string;

  beforeAll(async () => {
    // Initialize store
    const store = useAppStore.getState();

    // Create a pack with streak disabled
    noStreakPackId = await store.addPack('No Streak Pack');
    await store.updatePackManifest(noStreakPackId, { streak: false });

    // Add a chore to the no-streak pack
    noStreakChoreKey = await store.addChore({
      packId: noStreakPackId,
      title: 'No Streak Chore',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });

    // Create a pack with default streak behavior (true)
    defaultStreakPackId = await store.addPack('Default Streak Pack');

    // Add a chore to the default streak pack
    defaultStreakChoreKey = await store.addChore({
      packId: defaultStreakPackId,
      title: 'Default Streak Chore',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });
  });

  test('records streak=0 when pack.manifest.streak is false', async () => {
    await useAppStore.getState().recordCompletion(noStreakChoreKey, []);

    const completions = useAppStore.getState().completions.filter((c) => c.choreKey === noStreakChoreKey);
    expect(completions).toHaveLength(1);
    expect(completions[0].streak).toBe(0);
  });

  test('records non-zero streak when pack.manifest.streak is true (default)', async () => {
    await useAppStore.getState().recordCompletion(defaultStreakChoreKey, []);

    const completions = useAppStore.getState().completions.filter((c) => c.choreKey === defaultStreakChoreKey);
    expect(completions).toHaveLength(1);
    expect(completions[0].streak).toBeGreaterThan(0);
  });
});
