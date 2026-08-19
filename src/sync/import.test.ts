import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'bun:test';
import { openDB } from '@/db/index';
import { importAppState } from './import';
import { getAllTargets, putTarget } from '@/db';
import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';
import type { AppState, Target } from '@/types';

let db: IDBPDatabase<TasksHarmonyDB>;

const minimalState: AppState = {
  schemaVersion: 1,
  exportedAt: new Date().toISOString(),
  packs: [{ id: 'personal', manifest: { title: 'My Chores' }, isPersonal: true, importedAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() }],
  chores: [],
  questions: [],
  completions: [],
  xpSettings: [{ id: 'standard', name: 'Standard', maxStreakMultiplier: 2.5, decayFloor: 0.6, streakHalfLife: 7, decayHalfLife: 56 }],
  quickAnswerSets: [],
  targets: [],
  profile: { id: 'me', displayName: '', email: '', activeXPSettingsId: 'standard' },
  syncState: { id: 'main', pendingSync: false },
};

beforeEach(async () => {
  db = await openDB('test-import-' + crypto.randomUUID());
});

describe('importAppState — targets', () => {
  it('imports targets from state', async () => {
    const target: Target = { id: 't1', choreKey: 'personal/chore', order: 0, answers: [] };
    await importAppState(db, { ...minimalState, targets: [target] });
    expect(await getAllTargets(db)).toContainEqual(target);
  });

  it('clears existing targets before importing', async () => {
    await putTarget(db, { id: 'old', choreKey: 'personal/chore', order: 0, answers: [] });
    await importAppState(db, minimalState);
    expect(await getAllTargets(db)).toHaveLength(0);
  });

  it('imports multiple targets', async () => {
    const targets: Target[] = [
      { id: 'a', choreKey: 'personal/c', order: 0, answers: [] },
      { id: 'b', choreKey: 'personal/c', order: 1, answers: [] },
    ];
    await importAppState(db, { ...minimalState, targets });
    expect(await getAllTargets(db)).toHaveLength(2);
  });
});
