import { describe, it, expect } from 'bun:test';
import type { Pack } from '@/types';
import { packRowOrder } from './packRowOrder';

const BASE_PACK: Pack = {
  id: 'pack-a',
  manifest: { title: 'Pack A' },
  isPersonal: false,
  importedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const IMPORTED_PACK: Pack = {
  ...BASE_PACK,
  sourceUrl: 'https://raw.githubusercontent.com/user/repo/refs/heads/main/pack',
};

describe('packRowOrder', () => {
  it('places sync before xp for an imported pack with XP', () => {
    expect(packRowOrder(IMPORTED_PACK, 100)).toEqual(['sync', 'xp']);
  });

  it('places sync before xp when XP is large', () => {
    const order = packRowOrder(IMPORTED_PACK, 99999);
    expect(order.indexOf('sync')).toBeLessThan(order.indexOf('xp'));
  });

  it('omits sync for an owned pack', () => {
    expect(packRowOrder(BASE_PACK, 100)).toEqual(['xp']);
  });

  it('omits xp when XP is zero', () => {
    expect(packRowOrder(IMPORTED_PACK, 0)).toEqual(['sync']);
  });

  it('returns empty array for owned pack with zero XP', () => {
    expect(packRowOrder(BASE_PACK, 0)).toEqual([]);
  });
});
