import type { Chore, Completion } from '@/types';

export function calculatePackXP(
  packId: string,
  chores: Chore[],
  completions: Completion[],
): number {
  const packChoreKeys = new Set(
    chores.filter((c) => c.packId === packId).map((c) => c.key),
  );
  return completions
    .filter((c) => packChoreKeys.has(c.choreKey))
    .reduce((sum, c) => sum + c.xpEarned, 0);
}
