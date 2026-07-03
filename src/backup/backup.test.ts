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
  quickAnswerSets: [],
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

describe('unwrapStateFromZip (zip bomb guard)', () => {
  it('throws on ZIP with oversized declared originalSize (zip bomb guard)', () => {
    // Build a valid ZIP with an artificially large originalSize in its central directory.
    // fflate's zipSync produces correct headers; we patch the originalSize field
    // in the central directory to 0xFFFFFFFF (max uint32 ≈ 4 GB).
    const tinyPayload = { 'state.json': strToU8('{}') };
    const realZip = zipSync(tinyPayload);

    // Patch the 'uncompressed size' field (4 bytes, little-endian) in the central directory.
    // Central directory starts at the offset stored at byte [EOCD - 6] (4 bytes, LE).
    // For a single-file ZIP from fflate the layout is predictable enough to patch.
    const patched = new Uint8Array(realZip);
    // Find the central directory file header signature 0x02014B50.
    let cdOffset = -1;
    for (let i = 0; i < patched.length - 4; i++) {
      if (patched[i] === 0x50 && patched[i+1] === 0x4b &&
          patched[i+2] === 0x01 && patched[i+3] === 0x02) {
        cdOffset = i;
        break;
      }
    }
    expect(cdOffset).toBeGreaterThan(-1);
    // Bytes [cdOffset+24..cdOffset+27] = uncompressed size (LE).
    patched[cdOffset + 24] = 0xff;
    patched[cdOffset + 25] = 0xff;
    patched[cdOffset + 26] = 0xff;
    patched[cdOffset + 27] = 0xff;

    // Before fix: throws with an OOM / range error (or crashes the process).
    // After fix: throws a controlled 'Backup file too large' error before allocating.
    expect(() => unwrapStateFromZip(patched)).toThrow(/too large/i);
  });
});
