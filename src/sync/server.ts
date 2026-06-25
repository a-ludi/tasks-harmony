import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';
import { exportAppState } from '@/sync/export';
import { importAppState } from '@/sync/import';
import { validateAppState } from '@/schemas/validate';
import { encryptState, decryptState } from '@/sync/encrypt';
import { getOrCreateSyncKey, deriveSyncToken } from '@/sync/credentials';
import { markDirty, clearDirty } from '@/sync/dirty';
import { partA } from '@/sync/secret-a';
import { partB } from '@/sync/secret-b';
import { partC } from '@/sync/secret-c';
import { putSyncState, getSyncState } from '@/db';

const SYNC_URL = import.meta.env.VITE_SYNC_URL;
const SESSION_KEY = 'sync-session-token';

function getAppSecretBytes(): Uint8Array {
  const a = Uint8Array.from(atob(partA), (c) => c.charCodeAt(0));
  const b = Uint8Array.from(atob(partB), (c) => c.charCodeAt(0));
  const c = Uint8Array.from(atob(partC), (c) => c.charCodeAt(0));
  return a.map((byte, i) => byte ^ b[i]! ^ c[i]!);
}

async function computeHmac(nonce: string): Promise<string> {
  const secretBytes = getAppSecretBytes();
  const hmacKey = await crypto.subtle.importKey(
    'raw', new Uint8Array(secretBytes.buffer as ArrayBuffer, secretBytes.byteOffset, secretBytes.byteLength),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const encoded = new TextEncoder().encode(nonce);
  const sig = await crypto.subtle.sign('HMAC', hmacKey, new Uint8Array(encoded.buffer as ArrayBuffer, encoded.byteOffset, encoded.byteLength));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function fetchNewSessionToken(syncToken: string): Promise<string> {
  const chalRes = await fetch(`${SYNC_URL}/sync/challenge`);
  if (!chalRes.ok) throw new Error(`Challenge failed: ${chalRes.status}`);
  const { nonce } = await chalRes.json() as { nonce: string };
  const hmac = await computeHmac(nonce);
  const sessRes = await fetch(`${SYNC_URL}/sync/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nonce, hmac, syncToken }),
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
  method: 'GET' | 'PUT',
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
  if (res.status === 401 && !retried) {
    localStorage.removeItem(SESSION_KEY);
    return authorizedFetch(method, syncToken, body, true);
  }
  return res;
}

export interface PushResult {
  success: boolean;
  status?: number;
}

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

export async function pull(db: IDBPDatabase<TasksHarmonyDB>): Promise<boolean> {
  if (!SYNC_URL) return false;
  const key = await getOrCreateSyncKey(db);
  const syncToken = await deriveSyncToken(key);

  try {
    const res = await authorizedFetch('GET', syncToken);
    if (res.status === 404) return false;
    if (!res.ok) return false;

    const blob = new Uint8Array(await res.arrayBuffer());
    const serverState = await decryptState(key, blob);
    const validation = validateAppState(serverState);
    if (!validation.valid) return false;

    const localSyncState = await getSyncState(db);
    const localTs = localSyncState?.lastSyncedAt ?? '';
    const serverTs = serverState.syncState.lastSyncedAt ?? '';

    if (serverTs > localTs) {
      await importAppState(db, serverState);
      return true;
    }

    markDirty();
    return false;
  } catch {
    return false;
  }
}
