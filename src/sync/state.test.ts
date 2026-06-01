import { describe, expect, test } from 'bun:test';
import { canSync, needsConflictResolution, buildConflictSuffix } from './state';
import type { SyncState } from '@/types';

describe('canSync', () => {
  test('true when webdavUrl is set', () => {
    const s: SyncState = { id: 'main', webdavUrl: 'https://dav.example.com/state.json', pendingSync: false };
    expect(canSync(s)).toBe(true);
  });
  test('false when webdavUrl is absent', () => {
    const s: SyncState = { id: 'main', pendingSync: false };
    expect(canSync(s)).toBe(false);
  });
});

describe('needsConflictResolution', () => {
  test('true when currentServerEtag differs from stored serverEtag', () => {
    const s: SyncState = { id: 'main', pendingSync: false, serverEtag: '"abc123"' };
    expect(needsConflictResolution(s, '"xyz999"')).toBe(true);
  });
  test('false when currentServerEtag matches stored serverEtag', () => {
    const s: SyncState = { id: 'main', pendingSync: false, serverEtag: '"abc123"' };
    expect(needsConflictResolution(s, '"abc123"')).toBe(false);
  });
  test('false when no serverEtag stored (first sync ever)', () => {
    const s: SyncState = { id: 'main', pendingSync: false };
    expect(needsConflictResolution(s, '"abc123"')).toBe(false);
  });
});

describe('buildConflictSuffix', () => {
  test('returns _conflict_YYYY-MM-DD from ISO datetime', () => {
    expect(buildConflictSuffix('2026-05-31T14:00:00.000Z')).toBe('_conflict_2026-05-31');
  });
});
