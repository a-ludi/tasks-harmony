import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'bun:test';
import { openDB } from '@/db/index';
import { putCredentials } from '@/db';
import { generatePQCredentials } from '@/sync/credentials';
import { encryptedExport } from './export';
import { decryptedImport } from './import';
import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB, LegacySyncCredentials } from '@/db/schema';

let db: IDBPDatabase<TasksHarmonyDB>;

beforeEach(async () => {
  db = await openDB('test-export-' + crypto.randomUUID());
});

describe('encryptedExport + decryptedImport — PQ credentials', () => {
  it('produces a blob with PQ version byte 0x02', async () => {
    const creds = await generatePQCredentials();
    await putCredentials(db, creds);
    const blob = await encryptedExport(db);
    expect(blob[0]).toBe(0x02);
  });

  it('round-trips app state through PQ encrypted backup', async () => {
    const creds = await generatePQCredentials();
    await putCredentials(db, creds);
    const blob = await encryptedExport(db);
    const state = await decryptedImport(db, blob);
    expect(state.profile.id).toBe('me');
    expect(state.syncState.id).toBe('main');
  });
});

describe('encryptedExport + decryptedImport — legacy credentials', () => {
  it('round-trips app state through legacy encrypted backup', async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'],
    );
    const legacyCreds: LegacySyncCredentials = { id: 'main', cryptoKey: key };
    await putCredentials(db, legacyCreds);
    const blob = await encryptedExport(db);
    const state = await decryptedImport(db, blob);
    expect(state.profile.id).toBe('me');
    expect(state.syncState.id).toBe('main');
  });
});
