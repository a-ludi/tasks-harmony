import { describe, it, expect } from 'bun:test';
import { encryptState, decryptState } from './encrypt';
import type { AppState } from '@/types';

function makeKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

function makeState(): AppState {
  return {
    schemaVersion: 1,
    exportedAt: '2026-06-25T00:00:00.000Z',
    packs: [], chores: [], questions: [], completions: [], xpSettings: [],
    quickAnswerSets: [],
    profile: { id: 'me', displayName: 'Test', email: 't@example.com', activeXPSettingsId: 's1' },
    syncState: { id: 'main', pendingSync: false },
  };
}

describe('encryptState / decryptState', () => {
  it('round-trips app state', async () => {
    const key = await makeKey();
    const state = makeState();
    const blob = await encryptState(key, state);
    expect(blob).toBeInstanceOf(Uint8Array);
    expect(blob.length).toBeGreaterThan(12);

    const recovered = await decryptState(key, blob);
    expect(recovered.schemaVersion).toBe(1);
    expect(recovered.profile.displayName).toBe('Test');
    expect(recovered.syncState.pendingSync).toBe(false);
  });

  it('produces different ciphertext on each call (fresh IV)', async () => {
    const key = await makeKey();
    const state = makeState();
    const blob1 = await encryptState(key, state);
    const blob2 = await encryptState(key, state);
    expect(blob1).not.toEqual(blob2);
  });

  it('throws on wrong key', async () => {
    const key1 = await makeKey();
    const key2 = await makeKey();
    const blob = await encryptState(key1, makeState());
    await expect(decryptState(key2, blob)).rejects.toThrow();
  });
});
