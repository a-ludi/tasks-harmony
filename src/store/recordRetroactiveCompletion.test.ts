import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, test } from 'bun:test';
import { useAppStore } from './index';

describe('recordRetroactiveCompletion', () => {
  let choreKey: string;

  beforeAll(async () => {
    await useAppStore.getState().init();

    choreKey = await useAppStore.getState().addChore({
      packId: 'personal',
      title: 'Retroactive Chore',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });
  });

  test('creates a completion with the supplied timestamp', async () => {
    await useAppStore.getState().recordRetroactiveCompletion(choreKey, {
      completedAt: '2026-01-02T10:00:00.000Z',
      answers: [],
    });

    const completions = useAppStore.getState().completions.filter(c => c.choreKey === choreKey);
    expect(completions).toHaveLength(1);
    expect(completions[0].completedAt).toBe('2026-01-02T10:00:00.000Z');
  });

  test('computes streak based on the retroactive timestamp', () => {
    // window index 1 (Jan 2). No prior completion → streak should be 1
    const c = useAppStore.getState().completions.filter(c => c.choreKey === choreKey)[0];
    expect(c.streak).toBe(1);
  });

  test('earns XP > 0', () => {
    const c = useAppStore.getState().completions.filter(c => c.choreKey === choreKey)[0];
    expect(c.xpEarned).toBeGreaterThan(0);
  });

  test('totalCompletions for XP uses existing count at save time', async () => {
    // After first retroactive completion, totalCompletions for the next = 1
    const choreKey2 = await useAppStore.getState().addChore({
      packId: 'personal',
      title: 'Retro Chore 2',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: true,
      active: true,
    });

    await useAppStore.getState().recordRetroactiveCompletion(choreKey2, {
      completedAt: '2026-01-01T10:00:00.000Z',
      answers: [],
    });
    const xp1 = useAppStore.getState().completions.filter(c => c.choreKey === choreKey2)[0].xpEarned;

    await useAppStore.getState().recordRetroactiveCompletion(choreKey2, {
      completedAt: '2026-01-02T10:00:00.000Z',
      answers: [],
    });
    const xp2 = useAppStore.getState().completions.filter(c => c.choreKey === choreKey2)[1].xpEarned;

    // With decay enabled, second completion earns less XP (higher totalCompletions)
    expect(xp2).toBeLessThanOrEqual(xp1);
  });
});
