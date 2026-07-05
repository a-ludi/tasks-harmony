import { describe, it, expect, mock, beforeEach } from 'bun:test';

process.env.VITE_SYNC_URL = 'http://test.local';

const SYNC_ID = 'd'.repeat(64);
const mockPQCreds = {
  id: 'main' as const,
  version: 2 as const,
  mlkemPublicKey: new Uint8Array(1568),
  mlkemPrivateKey: new Uint8Array(3168),
  mldsaPublicKey: new Uint8Array(2592),
  mldsaPrivateKey: new Uint8Array(4896),
};

const mockIsLegacy = mock(() => false);
const mockDeriveSyncId = mock(async () => SYNC_ID);

mock.module('@/sync/credentials', () => ({
  isLegacyCredentials: mockIsLegacy,
  deriveSyncId: mockDeriveSyncId,
}));

const mockGetCredentials = mock(async () => mockPQCreds);
const mockGetSyncState = mock(async () => null);
const mockPutSyncState = mock(async () => {});

mock.module('@/db', () => ({
  getCredentials: mockGetCredentials,
  getSyncState: mockGetSyncState,
  putSyncState: mockPutSyncState,
}));

const mockExportAppState = mock(async () => ({
  schemaVersion: 1, exportedAt: '2026-01-01T00:00:00.000Z',
  packs: [], chores: [], questions: [], completions: [], xpSettings: [], quickAnswerSets: [],
  profile: { id: 'me', displayName: 'T', email: 't@t.com', activeXPSettingsId: 's1' },
  syncState: { id: 'main', pendingSync: false },
}));

mock.module('@/sync/export', () => ({ exportAppState: mockExportAppState }));
mock.module('@/sync/import', () => ({ importAppState: mock(async () => {}) }));

const mockEncryptStatePQ = mock(async () => new Uint8Array([1, 2, 3]));
const mockDecryptStatePQ = mock(async () => ({
  schemaVersion: 1, exportedAt: '2026-01-01T00:00:00.000Z',
  packs: [], chores: [], questions: [], completions: [], xpSettings: [], quickAnswerSets: [],
  profile: { id: 'me', displayName: 'T', email: 't@t.com', activeXPSettingsId: 's1' },
  syncState: { id: 'main', pendingSync: false, lastSyncedAt: '2026-01-02T00:00:00.000Z' },
}));

mock.module('@/sync/encrypt', () => ({
  encryptStatePQ: mockEncryptStatePQ,
  decryptStatePQ: mockDecryptStatePQ,
}));

mock.module('@/sync/dirty', () => ({
  markDirty: mock(() => {}),
  clearDirty: mock(() => {}),
}));

mock.module('@/schemas/validate', () => ({
  validateAppState: mock(() => ({ valid: true })),
}));

// localStorage is not available in Bun's test environment — provide a polyfill
const localStore: Record<string, string> = {};
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => localStore[k] ?? null,
    setItem: (k: string, v: string) => { localStore[k] = v; },
    removeItem: (k: string) => { delete localStore[k]; },
    clear: () => { Object.keys(localStore).forEach(k => { delete localStore[k]; }); },
  },
  writable: true,
  configurable: true,
});

// Also mock @noble/post-quantum/ml-dsa.js so tests don't need real signing
mock.module('@noble/post-quantum/ml-dsa.js', () => ({
  ml_dsa87: {
    sign: mock(() => new Uint8Array(4627)),
  },
}));

const { push, pull, deleteRemote } = await import('./server');

function makeFetch(responses: Array<{ url: string; response: Response }>) {
  return mock(async (url: string) => {
    const match = responses.find(r => url.includes(r.url));
    return match?.response ?? new Response('Not Found', { status: 404 });
  }) as unknown as typeof fetch;
}

describe('push', () => {
  beforeEach(() => {
    mockDeriveSyncId.mockClear();
    mockEncryptStatePQ.mockClear();
    localStorage.clear();
  });

  it('returns success when server returns 204', async () => {
    globalThis.fetch = mock(async (url: string) => {
      if (url.includes('/challenge')) return new Response(JSON.stringify({ nonce: 'e'.repeat(64) }), { status: 200 });
      if (url.includes('/session')) return new Response(JSON.stringify({ sessionToken: 'f'.repeat(64) }), { status: 200 });
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;

    const db = {} as never;
    const result = await push(db);
    expect(result.success).toBe(true);
  });

  it('calls deriveSyncId to determine blob URL', async () => {
    globalThis.fetch = mock(async (url: string) => {
      if (url.includes('/challenge')) return new Response(JSON.stringify({ nonce: 'e'.repeat(64) }), { status: 200 });
      if (url.includes('/session')) return new Response(JSON.stringify({ sessionToken: 'f'.repeat(64) }), { status: 200 });
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;

    const db = {} as never;
    await push(db);
    expect(mockDeriveSyncId).toHaveBeenCalled();
  });

  it('returns failure when server returns 500', async () => {
    globalThis.fetch = mock(async (url: string) => {
      if (url.includes('/challenge')) return new Response(JSON.stringify({ nonce: 'e'.repeat(64) }), { status: 200 });
      if (url.includes('/session')) return new Response(JSON.stringify({ sessionToken: 'f'.repeat(64) }), { status: 200 });
      return new Response('Server Error', { status: 500 });
    }) as unknown as typeof fetch;

    const db = {} as never;
    const result = await push(db);
    expect(result.success).toBe(false);
  });
});

describe('pull', () => {
  beforeEach(() => {
    mockDecryptStatePQ.mockClear();
    localStorage.clear();
  });

  it('imports state when server returns 200 with newer timestamp', async () => {
    const serverBlob = new Uint8Array([0x02, ...new Array(1597).fill(0)]);
    globalThis.fetch = mock(async (url: string) => {
      if (url.includes('/challenge')) return new Response(JSON.stringify({ nonce: 'e'.repeat(64) }), { status: 200 });
      if (url.includes('/session')) return new Response(JSON.stringify({ sessionToken: 'f'.repeat(64) }), { status: 200 });
      return new Response(serverBlob, { status: 200 });
    }) as unknown as typeof fetch;

    const db = {} as never;
    const result = await pull(db);
    expect(result.imported).toBe(true);
  });

  it('returns not imported when server returns 404', async () => {
    globalThis.fetch = mock(async (url: string) => {
      if (url.includes('/challenge')) return new Response(JSON.stringify({ nonce: 'e'.repeat(64) }), { status: 200 });
      if (url.includes('/session')) return new Response(JSON.stringify({ sessionToken: 'f'.repeat(64) }), { status: 200 });
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    const db = {} as never;
    const result = await pull(db);
    expect(result.imported).toBe(false);
  });
});

describe('deleteRemote', () => {
  beforeEach(() => { localStorage.clear(); });

  it('returns deleted:true when server returns 204', async () => {
    globalThis.fetch = mock(async (url: string) => {
      if (url.includes('/challenge')) return new Response(JSON.stringify({ nonce: 'e'.repeat(64) }), { status: 200 });
      if (url.includes('/session')) return new Response(JSON.stringify({ sessionToken: 'f'.repeat(64) }), { status: 200 });
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;

    const db = {} as never;
    const result = await deleteRemote(db);
    expect(result.deleted).toBe(true);
  });
});
