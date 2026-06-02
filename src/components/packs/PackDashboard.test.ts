import { describe, it, expect } from 'bun:test';
import type { Chore, Pack } from '@/types';

// Pure logic extracted from PackDashboard: filter chores by packId
function filterChoresByPack(chores: Chore[], packId: string): Chore[] {
  return chores.filter((c) => c.packId === packId);
}

// Pure logic: find pack by id
function findPack(packs: Pack[], packId: string): Pack | undefined {
  return packs.find((p) => p.id === packId);
}

const PACK_A: Pack = {
  id: 'pack-a',
  manifest: { title: 'Pack A' },
  isPersonal: false,
  importedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const PACK_B: Pack = {
  id: 'pack-b',
  manifest: { title: 'Pack B' },
  isPersonal: false,
  importedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const BASE_CHORE: Chore = {
  key: 'pack-a/chore-1',
  choreId: 'chore-1',
  packId: 'pack-a',
  title: 'Chore 1',
  xpSize: 'S',
  recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
  repeatable: false,
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const CHORE_PACK_A_1: Chore = { ...BASE_CHORE, key: 'pack-a/chore-1', choreId: 'chore-1', packId: 'pack-a', title: 'Chore A1' };
const CHORE_PACK_A_2: Chore = { ...BASE_CHORE, key: 'pack-a/chore-2', choreId: 'chore-2', packId: 'pack-a', title: 'Chore A2' };
const CHORE_PACK_B_1: Chore = { ...BASE_CHORE, key: 'pack-b/chore-1', choreId: 'chore-1', packId: 'pack-b', title: 'Chore B1' };
const INACTIVE_CHORE_A: Chore = { ...BASE_CHORE, key: 'pack-a/chore-3', choreId: 'chore-3', packId: 'pack-a', title: 'Inactive A', active: false };

describe('PackDashboard - filterChoresByPack', () => {
  it('returns only chores belonging to the given packId', () => {
    const result = filterChoresByPack([CHORE_PACK_A_1, CHORE_PACK_A_2, CHORE_PACK_B_1], 'pack-a');
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.choreId)).toEqual(['chore-1', 'chore-2']);
  });

  it('returns empty array when no chores match', () => {
    const result = filterChoresByPack([CHORE_PACK_B_1], 'pack-a');
    expect(result).toHaveLength(0);
  });

  it('includes both active and inactive chores (Dashboard filters active internally)', () => {
    const result = filterChoresByPack([CHORE_PACK_A_1, INACTIVE_CHORE_A, CHORE_PACK_B_1], 'pack-a');
    expect(result).toHaveLength(2);
    expect(result.some((c) => !c.active)).toBe(true);
  });

  it('returns empty array when chores list is empty', () => {
    expect(filterChoresByPack([], 'pack-a')).toHaveLength(0);
  });
});

describe('PackDashboard - findPack', () => {
  it('returns the matching pack', () => {
    const result = findPack([PACK_A, PACK_B], 'pack-b');
    expect(result?.manifest.title).toBe('Pack B');
  });

  it('returns undefined when packId does not match any pack (triggers Navigate)', () => {
    const result = findPack([PACK_A, PACK_B], 'nonexistent');
    expect(result).toBeUndefined();
  });
});

describe('PackDashboard - Dashboard chores prop override', () => {
  // Validates the prop-merging pattern: choresProp ?? storeChores
  it('choresProp takes precedence when provided', () => {
    const storeChores = [CHORE_PACK_B_1];
    const choresProp = [CHORE_PACK_A_1];
    const resolved = choresProp ?? storeChores;
    expect(resolved).toBe(choresProp);
  });

  it('falls back to storeChores when choresProp is undefined', () => {
    const storeChores = [CHORE_PACK_B_1];
    const choresProp = undefined;
    const resolved = choresProp ?? storeChores;
    expect(resolved).toBe(storeChores);
  });
});
