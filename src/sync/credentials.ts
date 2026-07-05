import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB, SyncCredentials, LegacySyncCredentials } from '@/db/schema';
import { getCredentials, putCredentials } from '@/db';
import { ml_kem1024 } from '@noble/post-quantum/ml-kem.js';
import { ml_dsa87 } from '@noble/post-quantum/ml-dsa.js';
import type { PQSyncCredentials } from '@/db/schema';

export async function getOrCreateSyncKey(db: IDBPDatabase<TasksHarmonyDB>): Promise<CryptoKey> {
  const stored = await getCredentials(db);
  if (stored && isLegacyCredentials(stored)) return stored.cryptoKey;
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

export function isLegacyCredentials(c: SyncCredentials): c is LegacySyncCredentials {
  return 'cryptoKey' in c;
}

export async function generatePQCredentials(): Promise<PQSyncCredentials> {
  const kem = ml_kem1024.keygen();
  const dsa = ml_dsa87.keygen();
  return {
    id: 'main',
    version: 2,
    mlkemPublicKey: kem.publicKey,
    mlkemPrivateKey: kem.secretKey,
    mldsaPublicKey: dsa.publicKey,
    mldsaPrivateKey: dsa.secretKey,
  };
}

export async function deriveSyncId(creds: PQSyncCredentials): Promise<string> {
  const combined = new Uint8Array(creds.mlkemPublicKey.length + creds.mldsaPublicKey.length);
  combined.set(creds.mlkemPublicKey, 0);
  combined.set(creds.mldsaPublicKey, creds.mlkemPublicKey.length);
  const hash = await crypto.subtle.digest('SHA-256', combined);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
