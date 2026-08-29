import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, test } from 'bun:test';
import { useAppStore } from './index';

describe('patchCompletionTargetId', () => {
  let choreKey: string;
  let completionId: string;

  beforeAll(async () => {
    await useAppStore.getState().init();

    choreKey = await useAppStore.getState().addChore({
      packId: 'personal',
      title: 'Patchable Chore',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });

    await useAppStore.getState().recordCompletion(choreKey);
    completionId = useAppStore.getState().completions.find((c) => c.choreKey === choreKey)!.id;
  });

  test('sets targetId on the completion when targetId is a string', async () => {
    const newTargetId = 'target-abc-123';
    await useAppStore.getState().patchCompletionTargetId(completionId, newTargetId);

    const updated = useAppStore.getState().completions.find((c) => c.id === completionId)!;
    expect(updated.targetId).toBe(newTargetId);
  });

  test('removes targetId from the completion when targetId is undefined', async () => {
    // Ensure the completion already has a targetId from the previous test
    const before = useAppStore.getState().completions.find((c) => c.id === completionId)!;
    expect(before.targetId).toBeDefined();

    await useAppStore.getState().patchCompletionTargetId(completionId, undefined);

    const updated = useAppStore.getState().completions.find((c) => c.id === completionId)!;
    expect('targetId' in updated).toBe(false);
  });

  test('does not modify other fields when patching targetId', async () => {
    const before = useAppStore.getState().completions.find((c) => c.id === completionId)!;
    const newTargetId = 'target-xyz-456';

    await useAppStore.getState().patchCompletionTargetId(completionId, newTargetId);

    const updated = useAppStore.getState().completions.find((c) => c.id === completionId)!;
    expect(updated.id).toBe(before.id);
    expect(updated.choreKey).toBe(before.choreKey);
    expect(updated.xpEarned).toBe(before.xpEarned);
    expect(updated.streak).toBe(before.streak);
    expect(updated.completedAt).toBe(before.completedAt);
  });

  test('does nothing when completionId does not exist', async () => {
    const completionsBefore = useAppStore.getState().completions;
    await useAppStore.getState().patchCompletionTargetId('non-existent-id', 'some-target');
    const completionsAfter = useAppStore.getState().completions;
    expect(completionsAfter).toEqual(completionsBefore);
  });
});
