import { describe, it, expect } from 'bun:test';
import { zipSync, strToU8 } from 'fflate';
import { buildBackupFilename, wrapStateInZip, unwrapStateFromZip } from './backup';
import type { AppState, Pack, Completion } from '@/types';

const MINIMAL_STATE: AppState = {
  schemaVersion: 1,
  exportedAt: '2026-01-01T00:00:00Z',
  packs: [],
  chores: [],
  questions: [],
  completions: [],
  xpSettings: [],
  profile: { id: 'me', displayName: 'Test', email: 'test@example.com', activeXPSettingsId: 'default' },
  syncState: { id: 'main', pendingSync: false },
};

describe('buildBackupFilename', () => {
  it('returns a filename with the given date', () => {
    expect(buildBackupFilename('2026-06-03')).toBe('tasks-harmony-backup-2026-06-03.zip');
  });
});

describe('wrapStateInZip / unwrapStateFromZip', () => {
  it('round-trips the state through a ZIP', () => {
    const zipBytes = wrapStateInZip(MINIMAL_STATE);
    expect(zipBytes).toBeInstanceOf(Uint8Array);
    expect(zipBytes.length).toBeGreaterThan(0);

    const recovered = unwrapStateFromZip(zipBytes);
    expect(recovered.schemaVersion).toBe(1);
    expect(recovered.profile.displayName).toBe('Test');
  });

  it('throws when the ZIP does not contain state.json', () => {
    const badZip = zipSync({ 'other.json': strToU8('{}') });
    expect(() => unwrapStateFromZip(badZip)).toThrow();
  });
});

import { isAppStatePristine } from './backup';

const PACK: Pack = {
  id: 'p1', manifest: { title: 'A Pack' }, isPersonal: false,
  importedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};

const COMPLETION: Completion = {
  id: 'c1', choreKey: 'p1/chore', completedAt: '2026-01-01T00:00:00Z',
  xpEarned: 10, streak: 1, answers: [],
};

describe('isAppStatePristine', () => {
  it('returns true when packs and completions are empty', () => {
    expect(isAppStatePristine([], [])).toBe(true);
  });

  it('returns false when there are packs', () => {
    expect(isAppStatePristine([PACK], [])).toBe(false);
  });

  it('returns false when there are completions', () => {
    expect(isAppStatePristine([], [COMPLETION])).toBe(false);
  });
});
