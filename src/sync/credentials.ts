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

function bytesToBase64url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64.padEnd(b64.length + (4 - b64.length % 4) % 4, '=');
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

/**
 * @deprecated For LegacySyncCredentials only. Use the PQSyncCredentials overload.
 * Only called from migrate.ts.
 */
export async function exportKeyFile(creds: SyncCredentials): Promise<string> {
  if (!isLegacyCredentials(creds)) {
    return JSON.stringify({
      version: 2,
      mlkem: {
        pk: bytesToBase64url(creds.mlkemPublicKey),
        sk: bytesToBase64url(creds.mlkemPrivateKey),
      },
      mldsa: {
        pk: bytesToBase64url(creds.mldsaPublicKey),
        sk: bytesToBase64url(creds.mldsaPrivateKey),
      },
    });
  }
  // v1 legacy path
  const raw = await crypto.subtle.exportKey('raw', creds.cryptoKey);
  const b64url = bytesToBase64url(new Uint8Array(raw));
  return JSON.stringify({ version: 1, key: b64url });
}

export async function importKeyFile(jsonStr: string): Promise<SyncCredentials> {
  const parsed = JSON.parse(jsonStr) as { version?: number; key?: string; mlkem?: unknown; mldsa?: unknown };
  if (parsed.version === 2) {
    const v2 = parsed as {
      version: 2;
      mlkem: { pk: string; sk: string };
      mldsa: { pk: string; sk: string };
    };
    const mlkemPublicKey = base64urlToBytes(v2.mlkem.pk);
    const mlkemPrivateKey = base64urlToBytes(v2.mlkem.sk);
    const mldsaPublicKey = base64urlToBytes(v2.mldsa.pk);
    const mldsaPrivateKey = base64urlToBytes(v2.mldsa.sk);
    if (mlkemPublicKey.byteLength !== 1568) throw new Error('Invalid mlkem.pk length');
    if (mlkemPrivateKey.byteLength !== 3168) throw new Error('Invalid mlkem.sk length');
    if (mldsaPublicKey.byteLength !== 2592) throw new Error('Invalid mldsa.pk length');
    if (mldsaPrivateKey.byteLength !== 4896) throw new Error('Invalid mldsa.sk length');
    return { id: 'main', version: 2, mlkemPublicKey, mlkemPrivateKey, mldsaPublicKey, mldsaPrivateKey };
  }
  // v1 legacy path — produces LegacySyncCredentials (triggers migration on next sync)
  const { key: b64url } = parsed as { key: string };
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64.padEnd(b64.length + (4 - b64.length % 4) % 4, '=');
  const raw = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  return { id: 'main', cryptoKey };
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
