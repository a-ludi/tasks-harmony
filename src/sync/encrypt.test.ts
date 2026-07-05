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

  it('rejects decompression bomb exceeding 10 MB limit', async () => {
    // Create an 11 MB all-zero buffer (highly compressible as gzip)
    const bigData = new Uint8Array(11 * 1024 * 1024); // 11 MB zeros

    // Compress it (will be much smaller than 11 MB)
    const cs = new CompressionStream('gzip');
    const csWriter = cs.writable.getWriter();
    csWriter.write(bigData);
    csWriter.close();
    const compressedChunks: Uint8Array[] = [];
    const csReader = cs.readable.getReader();
    while (true) {
      const { done, value } = await csReader.read();
      if (done) break;
      compressedChunks.push(value);
    }
    const compressedTotal = compressedChunks.reduce((n, c) => n + c.length, 0);
    const compressed = new Uint8Array(compressedTotal);
    let off = 0;
    for (const c of compressedChunks) { compressed.set(c, off); off += c.length; }

    // Encrypt the compressed payload with a valid key (AES-GCM tag will verify)
    const key = await makeKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      compressed,
    );
    const blob = new Uint8Array(12 + ciphertext.byteLength);
    blob.set(iv, 0);
    blob.set(new Uint8Array(ciphertext), 12);

    await expect(decryptState(key, blob)).rejects.toThrow(/exceeds limit/i);
  });

  it('does not compress plaintext before encryption (defeats CRIME/BREACH length oracle)', async () => {
    const key = await makeKey();

    // Create two AppState objects with equal JSON byte length but very different compressibility
    // State 1: highly repetitive (highly compressible)
    const state1: AppState = {
      schemaVersion: 1,
      exportedAt: '2026-06-25T00:00:00.000Z',
      packs: [],
      chores: [
        {
          key: 'pack1/c1',
          choreId: 'c1',
          packId: 'pack1',
          title: 'A'.repeat(4096), // Highly repetitive, compresses well
          description: 'A'.repeat(4096),
          xpSize: 'M',
          recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
          repeatable: false,
          active: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      questions: [],
      completions: [],
      xpSettings: [],
      quickAnswerSets: [],
      profile: { id: 'me', displayName: 'Test', email: 't@example.com', activeXPSettingsId: 's1' },
      syncState: { id: 'main', pendingSync: false },
    };

    // State 2: incompressible (random base64-like content of the same byte length after JSON encoding)
    const randomChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/';
    let randomString = '';
    for (let i = 0; i < 4096; i++) {
      randomString += randomChars[Math.floor(Math.random() * randomChars.length)];
    }
    const state2: AppState = {
      schemaVersion: 1,
      exportedAt: '2026-06-25T00:00:00.000Z',
      packs: [],
      chores: [
        {
          key: 'pack1/c1',
          choreId: 'c1',
          packId: 'pack1',
          title: randomString, // Incompressible
          description: randomString,
          xpSize: 'M',
          recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
          repeatable: false,
          active: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      questions: [],
      completions: [],
      xpSettings: [],
      quickAnswerSets: [],
      profile: { id: 'me', displayName: 'Test', email: 't@example.com', activeXPSettingsId: 's1' },
      syncState: { id: 'main', pendingSync: false },
    };

    // Encrypt both
    const blob1 = await encryptState(key, state1);
    const blob2 = await encryptState(key, state2);

    // Calculate expected blob size: 12 (IV) + plaintext length + 16 (AES-GCM auth tag)
    const json1Bytes = new TextEncoder().encode(JSON.stringify(state1)).length;
    const json2Bytes = new TextEncoder().encode(JSON.stringify(state2)).length;

    // After fix: blobs should have same length (no compression)
    expect(blob1.length).toBe(blob2.length);
    // And should be exactly IV + plaintext + tag
    expect(blob1.length).toBe(12 + json1Bytes + 16);
    expect(blob2.length).toBe(12 + json2Bytes + 16);
  });

  it('decrypts legacy compress-then-encrypt blobs (backward compatibility)', async () => {
    const key = await makeKey();
    const originalState = makeState();
    const json = new TextEncoder().encode(JSON.stringify(originalState));

    // Manually recreate the pre-fix encrypt path: compress then encrypt
    const cs = new CompressionStream('gzip');
    const csWriter = cs.writable.getWriter();
    csWriter.write(json);
    csWriter.close();
    const compressedChunks: Uint8Array[] = [];
    const csReader = cs.readable.getReader();
    while (true) {
      const { done, value } = await csReader.read();
      if (done) break;
      compressedChunks.push(value);
    }
    const compressedTotal = compressedChunks.reduce((n, c) => n + c.length, 0);
    const compressed = new Uint8Array(compressedTotal);
    let off = 0;
    for (const c of compressedChunks) { compressed.set(c, off); off += c.length; }

    // Now encrypt the compressed payload (legacy format)
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      compressed,
    );
    const legacyBlob = new Uint8Array(12 + ciphertext.byteLength);
    legacyBlob.set(iv, 0);
    legacyBlob.set(new Uint8Array(ciphertext), 12);

    // decryptState should detect gzip magic bytes and decompress automatically
    const recovered = await decryptState(key, legacyBlob);
    expect(recovered.schemaVersion).toBe(1);
    expect(recovered.profile.displayName).toBe('Test');
    expect(recovered.profile.email).toBe('t@example.com');
    expect(recovered.syncState.pendingSync).toBe(false);
  });
});
