import { describe, it, expect, mock, beforeEach } from 'bun:test';

// Must be set before server.ts is imported (module-level SYNC_URL constant)
process.env.VITE_SYNC_URL = 'http://test.local';

// Secret parts: partA ^ partB ^ partC must decode to ≥32 bytes for the HMAC key.
// All-zero buffers XOR to zero, which is a valid HMAC-SHA256 key.
const ZERO_B64 = btoa(String.fromCharCode(...new Array(32).fill(0)));
mock.module('@/sync/secret-a', () => ({ partA: ZERO_B64 }));
mock.module('@/sync/secret-b', () => ({ partB: ZERO_B64 }));
mock.module('@/sync/secret-c', () => ({ partC: ZERO_B64 }));

const SYNC_TOKEN = 'a'.repeat(64);
const mockKey = await crypto.subtle.generateKey(
  { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'],
);

mock.module('@/sync/credentials', () => ({
  getOrCreateSyncKey: mock(async () => mockKey),
  deriveSyncToken: mock(async () => SYNC_TOKEN),
}));

mock.module('@/db', () => ({
  getSyncState: mock(async () => null),
  putSyncState: mock(async () => {}),
}));

mock.module('@/sync/export', () => ({
  exportAppState: mock(async () => ({
    schemaVersion: 1,
    exportedAt: '2026-01-01T00:00:00.000Z',
    packs: [], chores: [], questions: [], completions: [], xpSettings: [], quickAnswerSets: [],
    profile: { id: 'me', displayName: 'T', email: 't@t.com', activeXPSettingsId: 's1' },
    syncState: { id: 'main', pendingSync: false },
  })),
}));

mock.module('@/sync/import', () => ({ importAppState: mock(async () => {}) }));

mock.module('@/sync/encrypt', () => ({
  encryptState: mock(async () => new Uint8Array([1, 2, 3])),
  decryptState: mock(async () => ({
    schemaVersion: 1,
    exportedAt: '2026-01-01T00:00:00.000Z',
    packs: [], chores: [], questions: [], completions: [], xpSettings: [], quickAnswerSets: [],
    profile: { id: 'me', displayName: 'T', email: 't@t.com', activeXPSettingsId: 's1' },
    syncState: { id: 'main', pendingSync: false, lastSyncedAt: '2026-01-02T00:00:00.000Z' },
  })),
}));

mock.module('@/schemas/validate', () => ({
  validateAppState: mock(() => ({ valid: true })),
}));

mock.module('@/sync/dirty', () => ({
  markDirty: mock(() => {}),
  clearDirty: mock(() => {}),
}));

const { pull } = await import('@/sync/server');

// localStorage is not available in Bun's test environment
const localStore: Record<string, string> = {};
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => localStore[k] ?? null,
    setItem: (k: string, v: string) => { localStore[k] = v; },
    removeItem: (k: string) => { delete localStore[k]; },
  },
  writable: true,
  configurable: true,
});

const SESSION_KEY = 'sync-session-token';

function mockFetch(blobStatus: number[]): typeof fetch {
  let idx = 0;
  return mock(async (url: string | URL | Request) => {
    const s = url.toString();
    if (s.includes('/sync/challenge'))
      return new Response(JSON.stringify({ nonce: 'n' }), { headers: { 'Content-Type': 'application/json' } });
    if (s.includes('/sync/session'))
      return new Response(JSON.stringify({ sessionToken: 'fresh-session' }), { headers: { 'Content-Type': 'application/json' } });
    return new Response('', { status: blobStatus[idx++] ?? 404 });
  }) as unknown as typeof fetch;
}

describe('pull — session retry on auth errors', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    Object.keys(localStore).forEach((k) => delete localStore[k]);
    originalFetch = globalThis.fetch;
  });

  it('clears stale session and retries on 403', async () => {
    localStore[SESSION_KEY] = 'stale-session';
    globalThis.fetch = mockFetch([403, 404]);

    const result = await pull({} as never);

    globalThis.fetch = originalFetch;

    expect(result).toBe(false); // 404 on retry → no server blob yet
    expect(localStore[SESSION_KEY]).toBe('fresh-session'); // stale session replaced
  });

  it('clears stale session and retries on 401', async () => {
    localStore[SESSION_KEY] = 'stale-session';
    globalThis.fetch = mockFetch([401, 404]);

    await pull({} as never);

    globalThis.fetch = originalFetch;

    expect(localStore[SESSION_KEY]).toBe('fresh-session');
  });

  it('does not retry a second time on persistent 403', async () => {
    localStore[SESSION_KEY] = 'stale-session';
    let blobCallCount = 0;
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const s = url.toString();
      if (s.includes('/sync/challenge'))
        return new Response(JSON.stringify({ nonce: 'n' }), { headers: { 'Content-Type': 'application/json' } });
      if (s.includes('/sync/session'))
        return new Response(JSON.stringify({ sessionToken: 'fresh-session' }), { headers: { 'Content-Type': 'application/json' } });
      blobCallCount++;
      return new Response('Forbidden', { status: 403 });
    }) as unknown as typeof fetch;

    const result = await pull({} as never);

    globalThis.fetch = originalFetch;

    expect(blobCallCount).toBe(2); // original attempt + one retry only
    expect(result).toBe(false);
  });
});
