import { describe, it, expect, mock, beforeEach } from 'bun:test';

// Set BEFORE importing server.ts so import.meta.env picks it up
process.env.VITE_SYNC_URL = 'http://test.local';
process.env.VITE_BASIC_AUTH = btoa('staging:testpassword');

const SYNC_ID = 'd'.repeat(64);
const NONCE = 'e'.repeat(64);
const SESSION_TOKEN = 'f'.repeat(64);
const EXPECTED_BASIC = `Basic ${btoa('staging:testpassword')}`;

const mockPQCreds = {
  id: 'main' as const,
  version: 2 as const,
  mlkemPublicKey: new Uint8Array(1568),
  mlkemPrivateKey: new Uint8Array(3168),
  mldsaPublicKey: new Uint8Array(2592),
  mldsaPrivateKey: new Uint8Array(4896),
};

mock.module('@/sync/credentials', () => ({
  isLegacyCredentials: mock(() => false),
  deriveSyncId: mock(async () => SYNC_ID),
}));

mock.module('@/db', () => ({
  getCredentials: mock(async () => mockPQCreds),
  getSyncState: mock(async () => null),
  putSyncState: mock(async () => {}),
}));

mock.module('@/sync/export', () => ({
  exportAppState: mock(async () => ({
    schemaVersion: 1, exportedAt: '2026-01-01T00:00:00.000Z',
    packs: [], chores: [], questions: [], completions: [], xpSettings: [], quickAnswerSets: [],
    profile: { id: 'me', displayName: 'T', email: 't@t.com', activeXPSettingsId: 's1' },
    syncState: { id: 'main', pendingSync: false },
  })),
}));

mock.module('@/sync/import', () => ({ importAppState: mock(async () => {}) }));
mock.module('@/sync/encrypt', () => ({
  encryptStatePQ: mock(async () => new Uint8Array([1, 2, 3])),
  decryptStatePQ: mock(async () => ({})),
}));
mock.module('@/sync/dirty', () => ({
  markDirty: mock(() => {}),
  clearDirty: mock(() => {}),
}));
mock.module('@/schemas/validate', () => ({
  validateAppState: mock(() => ({ valid: true })),
}));
mock.module('@noble/post-quantum/ml-dsa.js', () => ({
  ml_dsa87: { sign: mock(() => new Uint8Array(4627)) },
}));

const localStore: Record<string, string> = {};
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => localStore[k] ?? null,
    setItem: (k: string, v: string) => { localStore[k] = v; },
    removeItem: (k: string) => { delete localStore[k]; },
    clear: () => { Object.keys(localStore).forEach(k => { delete localStore[k]; }); },
  },
  writable: true, configurable: true,
});

const { push } = await import('./server');

type CapturedCall = { url: string; init: RequestInit };

function makeStagingFetch(calls: CapturedCall[]) {
  return mock(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    if (url.includes('/challenge')) return new Response(JSON.stringify({ nonce: NONCE }), { status: 200 });
    if (url.includes('/session')) return new Response(JSON.stringify({ sessionToken: SESSION_TOKEN }), { status: 200 });
    return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;
}

describe('push — staging mode (VITE_BASIC_AUTH set)', () => {
  beforeEach(() => { localStorage.clear(); });

  it('sends Authorization: Basic on the challenge request', async () => {
    const calls: CapturedCall[] = [];
    globalThis.fetch = makeStagingFetch(calls);
    await push({} as never);
    const req = calls.find(c => c.url.includes('/challenge'));
    expect((req?.init.headers as Record<string, string>)?.['Authorization']).toBe(EXPECTED_BASIC);
  });

  it('sends Authorization: Basic on the session request', async () => {
    const calls: CapturedCall[] = [];
    globalThis.fetch = makeStagingFetch(calls);
    await push({} as never);
    const req = calls.find(c => c.url.includes('/session'));
    expect((req?.init.headers as Record<string, string>)?.['Authorization']).toBe(EXPECTED_BASIC);
  });

  it('sends Authorization: Basic on the blob request', async () => {
    const calls: CapturedCall[] = [];
    globalThis.fetch = makeStagingFetch(calls);
    await push({} as never);
    const req = calls.find(c => c.url.includes(`/${SYNC_ID}`));
    expect((req?.init.headers as Record<string, string>)?.['Authorization']).toBe(EXPECTED_BASIC);
  });

  it('sends X-Sync-Token: Bearer <session-token> on the blob request instead of Authorization: Bearer', async () => {
    const calls: CapturedCall[] = [];
    globalThis.fetch = makeStagingFetch(calls);
    await push({} as never);
    const req = calls.find(c => c.url.includes(`/${SYNC_ID}`));
    const headers = req?.init.headers as Record<string, string>;
    expect(headers?.['X-Sync-Token']).toBe(`Bearer ${SESSION_TOKEN}`);
    expect(headers?.['Authorization']).not.toMatch(/^Bearer /);
  });
});
