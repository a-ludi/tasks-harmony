import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';
import { getCredentials, putCredentials } from '@/db';

export async function getOrCreateSyncKey(db: IDBPDatabase<TasksHarmonyDB>): Promise<CryptoKey> {
  const stored = await getCredentials(db);
  if (stored) return stored.cryptoKey;
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
  await putCredentials(db, { id: 'main', cryptoKey: key });
  return key;
}

export async function deriveSyncToken(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  const hash = await crypto.subtle.digest('SHA-256', raw);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function exportKeyFile(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  const b64url = btoa(String.fromCharCode(...new Uint8Array(raw)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return JSON.stringify({ version: 1, key: b64url });
}

export async function importKeyFile(jsonStr: string): Promise<CryptoKey> {
  const { key: b64url } = JSON.parse(jsonStr) as { version: number; key: string };
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, '=');
  const raw = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
