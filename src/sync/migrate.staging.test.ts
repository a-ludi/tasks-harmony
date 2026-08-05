import { describe, it, expect, mock, beforeEach } from 'bun:test';

// Set BEFORE importing migrate.ts so import.meta.env picks it up
process.env.VITE_SYNC_URL = 'http://test.local';
process.env.VITE_BASIC_AUTH = btoa('staging:testpassword');

const NONCE = 'e'.repeat(64);
const SESSION_TOKEN = 'f'.repeat(64);
const EXPECTED_BASIC = `Basic ${btoa('staging:testpassword')}`;

mock.module('@/sync/credentials', () => ({
  isLegacyCredentials: mock(() => true),
  generatePQCredentials: mock(async () => ({
    id: 'main' as const, version: 2 as const,
    mlkemPublicKey: new Uint8Array(1568), mlkemPrivateKey: new Uint8Array(3168),
    mldsaPublicKey: new Uint8Array(2592), mldsaPrivateKey: new Uint8Array(4896),
  })),
  deriveSyncToken: mock(async () => 'a'.repeat(64)),
}));

mock.module('@/db', () => ({
  getCredentials: mock(async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'],
    );
    return { id: 'main', cryptoKey: key };
  }),
  putCredentials: mock(async () => {}),
  getSyncState: mock(async () => null),
}));

mock.module('@/sync/encrypt', () => ({ decryptState: mock(async () => ({})) }));
mock.module('@/sync/import', () => ({ importAppState: mock(async () => {}) }));
mock.module('@/schemas/validate', () => ({ validateAppState: mock(() => ({ valid: false })) }));
mock.module('@/sync/server', () => ({ push: mock(async () => ({ success: true })) }));

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

const { migrate } = await import('./migrate');

type CapturedCall = { url: string; init: RequestInit };

function makeStagingFetch(calls: CapturedCall[]) {
  return mock(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    if (url.includes('/challenge')) return new Response(JSON.stringify({ nonce: NONCE }), { status: 200 });
    if (url.includes('/session')) return new Response(JSON.stringify({ sessionToken: SESSION_TOKEN }), { status: 200 });
    return new Response(null, { status: 404 });
  }) as unknown as typeof fetch;
}

describe('migrate — legacy path with staging basic auth', () => {
  beforeEach(() => { localStorage.clear(); });

  it('sends Authorization: Basic on the challenge request', async () => {
    const calls: CapturedCall[] = [];
    globalThis.fetch = makeStagingFetch(calls);
    await migrate({} as never);
    const req = calls.find(c => c.url.includes('/challenge'));
    expect((req?.init.headers as Record<string, string>)?.['Authorization']).toBe(EXPECTED_BASIC);
  });

  it('sends Authorization: Basic on the session request', async () => {
    const calls: CapturedCall[] = [];
    globalThis.fetch = makeStagingFetch(calls);
    await migrate({} as never);
    const req = calls.find(c => c.url.includes('/session'));
    expect((req?.init.headers as Record<string, string>)?.['Authorization']).toBe(EXPECTED_BASIC);
  });
});
