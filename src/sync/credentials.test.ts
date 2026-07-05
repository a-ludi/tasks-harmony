import { describe, it, expect } from 'bun:test';
import { isLegacyCredentials } from './credentials';
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
