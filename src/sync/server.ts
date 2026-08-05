import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';
import type { PQSyncCredentials } from '@/db/schema';
import { exportAppState } from '@/sync/export';
import { importAppState } from '@/sync/import';
import { validateAppState } from '@/schemas/validate';
import { encryptStatePQ, decryptStatePQ } from '@/sync/encrypt';
import { isLegacyCredentials, deriveSyncId } from '@/sync/credentials';
import { markDirty, clearDirty } from '@/sync/dirty';
import { putSyncState, getSyncState, getCredentials } from '@/db';
import { ml_dsa87 } from '@noble/post-quantum/ml-dsa.js';

const SYNC_URL = import.meta.env.VITE_SYNC_URL;
const SESSION_KEY = 'sync-session-token';

function bytesToBase64url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function fetchNewSessionToken(syncId: string, creds: PQSyncCredentials): Promise<string> {
  const basicAuth = import.meta.env.VITE_BASIC_AUTH ?? '';
  const authHeader: Record<string, string> = basicAuth ? { Authorization: `Basic ${basicAuth}` } : {};
  const chalRes = await fetch(`${SYNC_URL}/sync/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify({ syncId }),
  });
  if (!chalRes.ok) throw new Error(`Challenge failed: ${chalRes.status}`);
  const { nonce } = await chalRes.json() as { nonce: string };

  // CORRECT argument order: sign(msg, secretKey)
  const signPayload = new TextEncoder().encode(nonce + syncId);
  const signature = ml_dsa87.sign(signPayload, creds.mldsaPrivateKey);

  const sessRes = await fetch(`${SYNC_URL}/sync/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify({
      nonce,
      mldsaPublicKey: bytesToBase64url(creds.mldsaPublicKey),
      mlkemPublicKey: bytesToBase64url(creds.mlkemPublicKey),
      signature: bytesToBase64url(signature),
    }),
  });
  if (!sessRes.ok) throw new Error(`Session failed: ${sessRes.status}`);
  const { sessionToken } = await sessRes.json() as { sessionToken: string };
  localStorage.setItem(SESSION_KEY, sessionToken);
  return sessionToken;
}

async function getSessionToken(syncId: string, creds: PQSyncCredentials): Promise<string> {
  return localStorage.getItem(SESSION_KEY) ?? fetchNewSessionToken(syncId, creds);
}

async function authorizedFetch(
  method: 'GET' | 'PUT' | 'DELETE',
  syncId: string,
  creds: PQSyncCredentials,
  body?: Uint8Array,
  retried = false,
): Promise<Response> {
  const sessionToken = await getSessionToken(syncId, creds);
  const basicAuth = import.meta.env.VITE_BASIC_AUTH ?? '';
  const blobAuthHeaders: Record<string, string> = basicAuth
    ? { Authorization: `Basic ${basicAuth}`, 'X-Sync-Token': `Bearer ${sessionToken}` }
    : { Authorization: `Bearer ${sessionToken}` };
  const res = await fetch(`${SYNC_URL}/sync/${syncId}`, {
    method,
    headers: {
      ...blobAuthHeaders,
      ...(body ? { 'Content-Type': 'application/octet-stream' } : {}),
    },
    body: body ? new Uint8Array(body.buffer as ArrayBuffer, body.byteOffset, body.byteLength) : undefined,
    keepalive: method === 'PUT',
  });
  if ((res.status === 401 || res.status === 403) && !retried) {
    localStorage.removeItem(SESSION_KEY);
    return authorizedFetch(method, syncId, creds, body, true);
  }
  return res;
}

export interface PushResult { success: boolean; status?: number; }
export type PullResult = { imported: true } | { imported: false; skipped?: 'server-newer' };
export interface DeleteResult { deleted: boolean; }

export async function push(db: IDBPDatabase<TasksHarmonyDB>): Promise<PushResult> {
  if (!SYNC_URL) return { success: false };
  const creds = await getCredentials(db);
  if (!creds || isLegacyCredentials(creds)) return { success: false };
  const syncId = await deriveSyncId(creds);

  const appState = await exportAppState(db);
  const now = new Date().toISOString();
  appState.syncState.lastSyncedAt = now;
  clearDirty();

  try {
    const blob = await encryptStatePQ(creds, appState);
    const res = await authorizedFetch('PUT', syncId, creds, blob);
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

export async function deleteRemote(
  db: IDBPDatabase<TasksHarmonyDB>,
): Promise<DeleteResult> {
  if (!SYNC_URL) return { deleted: false };
  const creds = await getCredentials(db);
  if (!creds || isLegacyCredentials(creds)) return { deleted: false };
  try {
    const syncId = await deriveSyncId(creds);
    const res = await authorizedFetch('DELETE', syncId, creds);
    if (res.status === 204 || res.status === 404) return { deleted: true };
    return { deleted: false };
  } catch {
    return { deleted: false };
  }
}

export async function pull(
  db: IDBPDatabase<TasksHarmonyDB>,
  options: { overwriteLocal?: boolean } = {},
): Promise<PullResult> {
  const { overwriteLocal = true } = options;
  if (!SYNC_URL) return { imported: false };
  const creds = await getCredentials(db);
  if (!creds || isLegacyCredentials(creds)) return { imported: false };
  const syncId = await deriveSyncId(creds);

  try {
    const res = await authorizedFetch('GET', syncId, creds);
    if (res.status === 404) { markDirty(); return { imported: false }; }
    if (!res.ok) return { imported: false };

    const blob = new Uint8Array(await res.arrayBuffer());
    const serverState = await decryptStatePQ(creds, blob);
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
    if (localTs > serverTs) markDirty();
    return { imported: false };
  } catch {
    return { imported: false };
  }
}
