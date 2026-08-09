import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'bun:test';
import { openDB } from './index';
import { getAllTargets, getTargetsByChore, putTarget, deleteTarget } from './targets';
import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from './schema';
import type { Target } from '@/types';

let db: IDBPDatabase<TasksHarmonyDB>;

beforeEach(async () => {
  db = await openDB('test-targets-' + crypto.randomUUID());
});

describe('getAllTargets', () => {
  it('returns empty array when no targets', async () => {
    expect(await getAllTargets(db)).toEqual([]);
  });

  it('returns all stored targets', async () => {
    const t: Target = { id: 'a', choreKey: 'p/c', order: 0, answers: [] };
    await putTarget(db, t);
    expect(await getAllTargets(db)).toContainEqual(t);
  });
});

describe('getTargetsByChore', () => {
  it('returns only targets for the given choreKey', async () => {
    await putTarget(db, { id: 'a', choreKey: 'p/c1', order: 0, answers: [] });
    await putTarget(db, { id: 'b', choreKey: 'p/c2', order: 0, answers: [] });
    const results = await getTargetsByChore(db, 'p/c1');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('a');
  });
});

describe('deleteTarget', () => {
  it('removes the target', async () => {
    await putTarget(db, { id: 'a', choreKey: 'p/c', order: 0, answers: [] });
    await deleteTarget(db, 'a');
    expect(await getAllTargets(db)).toHaveLength(0);
  });
});
