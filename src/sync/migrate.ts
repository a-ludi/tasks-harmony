import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';
import { getCredentials, putCredentials, getSyncState } from '@/db';
import { isLegacyCredentials, generatePQCredentials, deriveSyncToken } from '@/sync/credentials';
import { decryptState } from '@/sync/encrypt';
import { importAppState } from '@/sync/import';
import { validateAppState } from '@/schemas/validate';
import { push } from '@/sync/server';

const SYNC_URL = import.meta.env.VITE_SYNC_URL;
const LEGACY_SESSION_KEY = 'sync-session-token-legacy';

async function legacyFetchSessionToken(syncToken: string): Promise<string | null> {
  try {
    const chalRes = await fetch(`${SYNC_URL}/sync/challenge`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ syncToken }),
    });
    if (!chalRes.ok) return null;
    const { nonce } = await chalRes.json() as { nonce: string };
    const sessRes = await fetch(`${SYNC_URL}/sync/session`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nonce, syncToken }),
    });
    if (!sessRes.ok) return null;
    const { sessionToken } = await sessRes.json() as { sessionToken: string };
    return sessionToken;
  } catch { return null; }
}

export async function migrate(db: IDBPDatabase<TasksHarmonyDB>): Promise<void> {
  const creds = await getCredentials(db);
  if (!creds || !isLegacyCredentials(creds)) return;

  // Step 1 & 1b: Best-effort final pull with legacy credentials, then delete the legacy blob
  let legacyDeleted = false;
  if (SYNC_URL) {
    try {
      const syncToken = await deriveSyncToken(creds.cryptoKey);
      const sessionToken = await legacyFetchSessionToken(syncToken);
      if (sessionToken) {
        // Step 1: Best-effort final pull
        try {
          const res = await fetch(`${SYNC_URL}/sync/${syncToken}`, {
            headers: { Authorization: `Bearer ${sessionToken}` },
          });
          if (res.ok) {
            const blob = new Uint8Array(await res.arrayBuffer());
            const serverState = await decryptState(creds.cryptoKey, blob);
            const validation = validateAppState(serverState);
            if (validation.valid) {
              const localSyncState = await getSyncState(db);
              const localTs = localSyncState?.lastSyncedAt ?? '';
              const serverTs = serverState.syncState.lastSyncedAt ?? '';
              if (serverTs > localTs) {
                await importAppState(db, serverState);
              }
            }
          }
        } catch { /* pull failure does not block delete attempt */ }

        // Step 1b: Authoritative delete of the legacy blob
        try {
          const delRes = await fetch(`${SYNC_URL}/sync/${syncToken}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${sessionToken}` },
          });
          // 204 = deleted, 404 = already gone — both count as success
          if (delRes.status === 204 || delRes.status === 404) legacyDeleted = true;
        } catch { /* leave legacyDeleted=false; will retry next run */ }
      }
    } catch { /* challenge/session fetch failure */ }
  }

  // Step 2: Gate the credential swap on legacyDeleted when server is reachable
  // If SYNC_URL is set and deletion failed, skip credential swap to retry next time
  if (SYNC_URL && !legacyDeleted) return;

  // If SYNC_URL is unset (offline), skip the delete gate and proceed with swap
  const pqCreds = await generatePQCredentials();
  await putCredentials(db, pqCreds);

  // Step 3: Push with new credentials (best-effort)
  try {
    await push(db);
  } catch { /* push failed; dirty flag will be set by push internals */ }

  // Clean up legacy session token
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(LEGACY_SESSION_KEY);
  }
}
