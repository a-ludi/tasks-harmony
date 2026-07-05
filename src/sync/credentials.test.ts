import { describe, it, expect } from 'bun:test';
import { isLegacyCredentials, generatePQCredentials, deriveSyncId, exportKeyFile, importKeyFile } from './credentials';
import type { LegacySyncCredentials, PQSyncCredentials } from '@/db/schema';

describe('isLegacyCredentials', () => {
  it('returns true for a record with cryptoKey', async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'],
    );
    const legacy: LegacySyncCredentials = { id: 'main', cryptoKey: key };
    expect(isLegacyCredentials(legacy)).toBe(true);
  });

  it('returns false for a record with version 2 PQ fields', () => {
    const pq: PQSyncCredentials = {
      id: 'main',
      version: 2,
      mlkemPublicKey: new Uint8Array(1568),
      mlkemPrivateKey: new Uint8Array(3168),
      mldsaPublicKey: new Uint8Array(2592),
      mldsaPrivateKey: new Uint8Array(4896),
    };
    expect(isLegacyCredentials(pq)).toBe(false);
  });
});

describe('generatePQCredentials', () => {
  it('produces keys of the correct byte lengths', async () => {
    const creds = await generatePQCredentials();
    expect(creds.version).toBe(2);
    expect(creds.mlkemPublicKey.byteLength).toBe(1568);
    expect(creds.mlkemPrivateKey.byteLength).toBe(3168);
    expect(creds.mldsaPublicKey.byteLength).toBe(2592);
    expect(creds.mldsaPrivateKey.byteLength).toBe(4896);
  });

  it('generates different keys on each call', async () => {
    const a = await generatePQCredentials();
    const b = await generatePQCredentials();
    expect(a.mlkemPublicKey).not.toEqual(b.mlkemPublicKey);
    expect(a.mldsaPublicKey).not.toEqual(b.mldsaPublicKey);
  });
});

describe('deriveSyncId', () => {
  it('returns a 64-char hex string', async () => {
    const creds = await generatePQCredentials();
    const id = await deriveSyncId(creds);
    expect(id).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic for the same credentials', async () => {
    const creds = await generatePQCredentials();
    expect(await deriveSyncId(creds)).toBe(await deriveSyncId(creds));
  });

  it('differs when either key changes', async () => {
    const a = await generatePQCredentials();
    const b = await generatePQCredentials();
    expect(await deriveSyncId(a)).not.toBe(await deriveSyncId(b));
  });
});

describe('exportKeyFile / importKeyFile', () => {
  it('round-trips PQSyncCredentials through v2 JSON', async () => {
    const creds = await generatePQCredentials();
    const json = await exportKeyFile(creds);
    const parsed = JSON.parse(json) as { version: number };
    expect(parsed.version).toBe(2);

    const recovered = await importKeyFile(json);
    expect(isLegacyCredentials(recovered)).toBe(false);
    const pq = recovered as PQSyncCredentials;
    expect(pq.mlkemPublicKey).toEqual(creds.mlkemPublicKey);
    expect(pq.mlkemPrivateKey).toEqual(creds.mlkemPrivateKey);
    expect(pq.mldsaPublicKey).toEqual(creds.mldsaPublicKey);
    expect(pq.mldsaPrivateKey).toEqual(creds.mldsaPrivateKey);
  });

  it('importKeyFile on a v1 file returns LegacySyncCredentials', async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'],
    );
    const raw = await crypto.subtle.exportKey('raw', key);
    const b64url = btoa(String.fromCharCode(...new Uint8Array(raw)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const v1Json = JSON.stringify({ version: 1, key: b64url });

    const recovered = await importKeyFile(v1Json);
    expect(isLegacyCredentials(recovered)).toBe(true);
  });
});
