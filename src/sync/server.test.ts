import { describe, it, expect, mock, beforeEach } from 'bun:test';

// Must be set before server.ts is imported (module-level SYNC_URL constant)
process.env.VITE_SYNC_URL = 'http://test.local';

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

describe('pull — marks dirty on server 404', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    Object.keys(localStore).forEach((k) => delete localStore[k]);
    originalFetch = globalThis.fetch;
  });

  it('calls markDirty when server has no blob so local state gets pushed', async () => {
    const dirty = await import('@/sync/dirty');
    const callsBefore = (dirty.markDirty as ReturnType<typeof mock>).mock.calls.length;

    globalThis.fetch = mockFetch([404]);
    await pull({} as never);
    globalThis.fetch = originalFetch;

    expect((dirty.markDirty as ReturnType<typeof mock>).mock.calls.length).toBe(callsBefore + 1);
  });
});

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

    expect(result.imported).toBe(false); // 404 on retry → no server blob yet
    expect(localStore[SESSION_KEY]).toBe('fresh-session'); // stale session replaced
  });

  it('clears stale session and retries on 401', async () => {
    localStore[SESSION_KEY] = 'stale-session';
    globalThis.fetch = mockFetch([401, 404]);

    const result = await pull({} as never);

    globalThis.fetch = originalFetch;

    expect(result.imported).toBe(false);
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
    expect(result.imported).toBe(false);
  });
});

describe('pull — overwriteLocal option (SEC-000018)', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    Object.keys(localStore).forEach((k) => delete localStore[k]);
    originalFetch = globalThis.fetch;
  });

  it('does not call importAppState when overwriteLocal is false and server blob is newer than local', async () => {
    // The existing top-of-file mock for @/sync/import exposes importAppState as a spy.
    const importMod = await import('@/sync/import');
    const spy = importMod.importAppState as ReturnType<typeof mock>;
    const callsBefore = spy.mock.calls.length;

    // The existing decryptState mock returns a server blob with
    // syncState.lastSyncedAt = '2026-01-02T00:00:00.000Z'.
    // The @/db mock has getSyncState returning null → localTs = '' → serverTs > localTs.
    // Fetch returns 200 for the blob GET so pull reaches the timestamp branch.
    globalThis.fetch = mockFetch([200]);

    const result = await pull({} as never, { overwriteLocal: false });

    globalThis.fetch = originalFetch;

    // Assertion that FAILS before fix (importAppState is called unconditionally) and
    // PASSES after fix (guard short-circuits before importAppState).
    expect(spy.mock.calls.length).toBe(callsBefore);
    expect(result).toEqual({ imported: false, skipped: 'server-newer' });
  });

  it('still calls importAppState when overwriteLocal is true and server blob is newer', async () => {
    // The existing top-of-file mock for @/sync/import exposes importAppState as a spy.
    const importMod = await import('@/sync/import');
    const spy = importMod.importAppState as ReturnType<typeof mock>;
    const callsBefore = spy.mock.calls.length;

    // The existing decryptState mock returns a server blob with
    // syncState.lastSyncedAt = '2026-01-02T00:00:00.000Z'.
    // The @/db mock has getSyncState returning null → localTs = '' → serverTs > localTs.
    // Fetch returns 200 for the blob GET so pull reaches the timestamp branch.
    globalThis.fetch = mockFetch([200]);

    const result = await pull({} as never, { overwriteLocal: true });

    globalThis.fetch = originalFetch;

    // Should call importAppState and return imported: true
    expect(spy.mock.calls.length).toBe(callsBefore + 1);
    expect(result).toEqual({ imported: true });
  });

  it('returns { imported: true } when overwriteLocal is true with default parameter', async () => {
    const importMod = await import('@/sync/import');
    const spy = importMod.importAppState as ReturnType<typeof mock>;
    const callsBefore = spy.mock.calls.length;

    globalThis.fetch = mockFetch([200]);

    const result = await pull({} as never);

    globalThis.fetch = originalFetch;

    expect(spy.mock.calls.length).toBe(callsBefore + 1);
    expect(result).toEqual({ imported: true });
  });
});

describe('deleteRemote — DELETE endpoint', () => {
  let originalFetch: typeof fetch;
  const capturedRequests: { url: string; method: string; headers: Record<string, string> }[] = [];

  beforeEach(() => {
    Object.keys(localStore).forEach((k) => delete localStore[k]);
    originalFetch = globalThis.fetch;
    capturedRequests.length = 0;
  });

  it('deleteRemote issues DELETE /sync/{token} with a valid session and returns { deleted: true } on 204', async () => {
    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      let s: string;
      let method: string;
      let headers: Record<string, string> = {};

      if (url instanceof Request) {
        s = url.url;
        method = url.method;
        headers = Object.fromEntries(url.headers.entries());
      } else {
        s = url.toString();
        method = (init?.method ?? 'GET').toUpperCase();
        if (init?.headers) {
          const h = init.headers as Record<string, string>;
          headers = h;
        }
      }

      capturedRequests.push({ url: s, method, headers });

      if (s.includes('/sync/challenge'))
        return new Response(JSON.stringify({ nonce: 'n' }), { headers: { 'Content-Type': 'application/json' } });
      if (s.includes('/sync/session'))
        return new Response(JSON.stringify({ sessionToken: 'fresh-session' }), { headers: { 'Content-Type': 'application/json' } });
      if (s.includes(`/sync/${SYNC_TOKEN}`) && method === 'DELETE')
        return new Response('', { status: 204 });
      return new Response('Not Found', { status: 404 });
    }) as unknown as typeof fetch;

    const { deleteRemote } = await import('@/sync/server');
    const result = await deleteRemote({} as never, mockKey);

    globalThis.fetch = originalFetch;

    expect(result.deleted).toBe(true);
    const deleteReq = capturedRequests.find(r => r.method === 'DELETE');
    expect(deleteReq).toBeDefined();
    expect(deleteReq?.url).toContain(`/sync/${SYNC_TOKEN}`);
    expect(deleteReq?.headers['Authorization'] || deleteReq?.headers['authorization']).toBe('Bearer fresh-session');
  });
});
