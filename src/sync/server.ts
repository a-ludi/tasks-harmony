import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';
import { exportAppState } from '@/sync/export';
import { importAppState } from '@/sync/import';
import { validateAppState } from '@/schemas/validate';
import { encryptState, decryptState } from '@/sync/encrypt';
import { getOrCreateSyncKey, deriveSyncToken } from '@/sync/credentials';
import { markDirty, clearDirty } from '@/sync/dirty';
import { putSyncState, getSyncState } from '@/db';

const SYNC_URL = import.meta.env.VITE_SYNC_URL;
const SESSION_KEY = 'sync-session-token';

async function fetchNewSessionToken(syncToken: string): Promise<string> {
  const chalRes = await fetch(`${SYNC_URL}/sync/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ syncToken }),
  });
  if (!chalRes.ok) throw new Error(`Challenge failed: ${chalRes.status}`);
  const { nonce } = await chalRes.json() as { nonce: string };
  const sessRes = await fetch(`${SYNC_URL}/sync/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nonce, syncToken }),
  });
  if (!sessRes.ok) throw new Error(`Session failed: ${sessRes.status}`);
  const { sessionToken } = await sessRes.json() as { sessionToken: string };
  localStorage.setItem(SESSION_KEY, sessionToken);
  return sessionToken;
}

async function getSessionToken(syncToken: string): Promise<string> {
  return localStorage.getItem(SESSION_KEY) ?? fetchNewSessionToken(syncToken);
}

async function authorizedFetch(
  method: 'GET' | 'PUT' | 'DELETE',
  syncToken: string,
  body?: Uint8Array,
  retried = false,
): Promise<Response> {
  const sessionToken = await getSessionToken(syncToken);
  const res = await fetch(`${SYNC_URL}/sync/${syncToken}`, {
    method,
    headers: {
      Authorization: `Bearer ${sessionToken}`,
      ...(body ? { 'Content-Type': 'application/octet-stream' } : {}),
    },
    body: body ? new Uint8Array(body.buffer as ArrayBuffer, body.byteOffset, body.byteLength) : undefined,
    keepalive: method === 'PUT',
  });
  if ((res.status === 401 || res.status === 403) && !retried) {
    localStorage.removeItem(SESSION_KEY);
    return authorizedFetch(method, syncToken, body, true);
  }
  return res;
}

export interface PushResult {
  success: boolean;
  status?: number;
}

export type PullResult =
  | { imported: true }
  | { imported: false; skipped?: 'server-newer' };

export async function push(db: IDBPDatabase<TasksHarmonyDB>): Promise<PushResult> {
  if (!SYNC_URL) return { success: false };
  const key = await getOrCreateSyncKey(db);
  const syncToken = await deriveSyncToken(key);

  const appState = await exportAppState(db);
  const now = new Date().toISOString();
  appState.syncState.lastSyncedAt = now;

  clearDirty();

  try {
    const blob = await encryptState(key, appState);
    const res = await authorizedFetch('PUT', syncToken, blob);

    if (res.ok) {
      const syncState = await getSyncState(db);
      const base = syncState ?? { id: 'main' as const, pendingSync: true };
      await putSyncState(db, { ...base, lastSyncedAt: now, pendingSync: false });
      return { success: true };
    }

    markDirty();
    return { success: false, status: res.status };
  } catch {
    markDirty();
    return { success: false };
  }
}

export interface DeleteResult {
  deleted: boolean;
}

export async function deleteRemote(
  db: IDBPDatabase<TasksHarmonyDB>,
  key: CryptoKey,
): Promise<DeleteResult> {
  if (!SYNC_URL) return { deleted: false };
  try {
    const syncToken = await deriveSyncToken(key);
    const res = await authorizedFetch('DELETE', syncToken);
    // 204 (deleted) or 404 (already gone) are both success
    if (res.status === 204 || res.status === 404) {
      return { deleted: true };
    }
    // Best-effort: silently ignore other statuses
    return { deleted: false };
  } catch {
    // Best-effort: network errors are silently ignored
    return { deleted: false };
  }
}

export async function pull(
  db: IDBPDatabase<TasksHarmonyDB>,
  options: { overwriteLocal?: boolean } = {},
): Promise<PullResult> {
  const { overwriteLocal = true } = options;
  if (!SYNC_URL) return { imported: false };
  const key = await getOrCreateSyncKey(db);
  const syncToken = await deriveSyncToken(key);

  try {
    const res = await authorizedFetch('GET', syncToken);
    if (res.status === 404) { markDirty(); return { imported: false }; }
    if (!res.ok) return { imported: false };

    const blob = new Uint8Array(await res.arrayBuffer());
    const serverState = await decryptState(key, blob);
    const validation = validateAppState(serverState);
    if (!validation.valid) return { imported: false };

    const localSyncState = await getSyncState(db);
    const localTs = localSyncState?.lastSyncedAt ?? '';
    const serverTs = serverState.syncState.lastSyncedAt ?? '';

    if (serverTs > localTs) {
      if (!overwriteLocal) return { imported: false, skipped: 'server-newer' };
      await importAppState(db, serverState);
      return { imported: true };
    }

    if (localTs > serverTs) {
      markDirty();
    }
    return { imported: false };
  } catch {
    return { imported: false };
  }
}
