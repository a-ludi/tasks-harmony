import { describe, it, expect, mock, beforeEach } from 'bun:test';

process.env.VITE_SYNC_URL = 'http://test.local';

const mockGetCredentials = mock(async () => null);
const mockPutCredentials = mock(async () => {});
const mockGetSyncState = mock(async () => null);
mock.module('@/db', () => ({
  getCredentials: mockGetCredentials,
  putCredentials: mockPutCredentials,
  getSyncState: mockGetSyncState,
}));

const mockGeneratePQCredentials = mock(async () => ({
  id: 'main' as const, version: 2 as const,
  mlkemPublicKey: new Uint8Array(1568), mlkemPrivateKey: new Uint8Array(3168),
  mldsaPublicKey: new Uint8Array(2592), mldsaPrivateKey: new Uint8Array(4896),
}));
const mockIsLegacyCredentials = mock((_c: unknown) => false);
mock.module('@/sync/credentials', () => ({
  generatePQCredentials: mockGeneratePQCredentials,
  isLegacyCredentials: mockIsLegacyCredentials,
  deriveSyncToken: mock(async () => 'a'.repeat(64)),
}));

const mockDecryptState = mock(async () => ({
  schemaVersion: 1, exportedAt: '2026-01-01T00:00:00.000Z',
  packs: [], chores: [], questions: [], completions: [], xpSettings: [], quickAnswerSets: [],
  profile: { id: 'me', displayName: 'T', email: 't@t.com', activeXPSettingsId: 's1' },
  syncState: { id: 'main', pendingSync: false, lastSyncedAt: '2026-01-02T00:00:00.000Z' },
}));
mock.module('@/sync/encrypt', () => ({ decryptState: mockDecryptState }));

const mockPush = mock(async () => ({ success: true }));
mock.module('@/sync/server', () => ({ push: mockPush }));

mock.module('@/sync/import', () => ({ importAppState: mock(async () => {}) }));
mock.module('@/schemas/validate', () => ({ validateAppState: mock(() => ({ valid: true })) }));

const { migrate } = await import('./migrate');

describe('migrate', () => {
  beforeEach(() => {
    mockGetCredentials.mockClear();
    mockPutCredentials.mockClear();
    mockGeneratePQCredentials.mockClear();
    mockIsLegacyCredentials.mockClear();
    mockPush.mockClear();
  });

  it('is a no-op when credentials are already PQSyncCredentials', async () => {
    const pqCreds = { id: 'main', version: 2, mlkemPublicKey: new Uint8Array(1568),
      mlkemPrivateKey: new Uint8Array(3168), mldsaPublicKey: new Uint8Array(2592),
      mldsaPrivateKey: new Uint8Array(4896) };
    mockGetCredentials.mockImplementationOnce(async () => pqCreds as never);
    mockIsLegacyCredentials.mockImplementationOnce(() => false);

    await migrate({} as never);

    expect(mockPutCredentials).not.toHaveBeenCalled();
    expect(mockGeneratePQCredentials).not.toHaveBeenCalled();
  });

  it('generates new PQ credentials and stores them when legacy credentials exist', async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'],
    );
    mockGetCredentials.mockImplementationOnce(async () => ({ id: 'main', cryptoKey: key }) as never);
    mockIsLegacyCredentials.mockImplementationOnce(() => true);

    globalThis.fetch = mock(async (input: string | Request, options?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.url;
      const method = options?.method || (typeof input === 'string' ? 'GET' : (input as Request).method) || 'GET';

      if (method === 'POST' && url.includes('/sync/challenge')) {
        return new Response(JSON.stringify({ nonce: 'n' }), { status: 200 });
      }
      if (method === 'POST' && url.includes('/sync/session')) {
        return new Response(JSON.stringify({ sessionToken: 's' }), { status: 200 });
      }
      if (method === 'GET' && url.includes('/sync/')) {
        return new Response(null, { status: 404 });
      }
      if (method === 'DELETE' && url.includes('/sync/')) {
        return new Response(null, { status: 204 });
      }
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    await migrate({} as never);

    expect(mockGeneratePQCredentials).toHaveBeenCalled();
    expect(mockPutCredentials).toHaveBeenCalled();
  });

  it('calls push after storing new credentials', async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'],
    );
    mockGetCredentials.mockImplementationOnce(async () => ({ id: 'main', cryptoKey: key }) as never);
    mockIsLegacyCredentials.mockImplementationOnce(() => true);

    globalThis.fetch = mock(async (input: string | Request, options?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.url;
      const method = options?.method || (typeof input === 'string' ? 'GET' : (input as Request).method) || 'GET';

      if (method === 'POST' && url.includes('/sync/challenge')) {
        return new Response(JSON.stringify({ nonce: 'n' }), { status: 200 });
      }
      if (method === 'POST' && url.includes('/sync/session')) {
        return new Response(JSON.stringify({ sessionToken: 's' }), { status: 200 });
      }
      if (method === 'GET' && url.includes('/sync/')) {
        return new Response(null, { status: 404 });
      }
      if (method === 'DELETE' && url.includes('/sync/')) {
        return new Response(null, { status: 204 });
      }
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    await migrate({} as never);

    expect(mockPush).toHaveBeenCalled();
  });

  it('completes successfully when server is unreachable (skips final pull and push)', async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'],
    );
    mockGetCredentials.mockImplementationOnce(async () => ({ id: 'main', cryptoKey: key }) as never);
    mockIsLegacyCredentials.mockImplementationOnce(() => true);
    mockPush.mockImplementationOnce(async () => { throw new Error('network error'); });
    globalThis.fetch = mock(async () => { throw new Error('network error'); }) as unknown as typeof fetch;

    // When server is unreachable, deletion will fail, so credentials will not be swapped
    // This is the at-least-once deletion semantics: retry on next app launch
    await expect(migrate({} as never)).resolves.toBeUndefined();
    expect(mockPutCredentials).not.toHaveBeenCalled();
  });

  it('deletes the legacy blob on the server before overwriting credentials', async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'],
    );
    mockGetCredentials.mockImplementationOnce(async () => ({ id: 'main', cryptoKey: key }) as never);
    mockIsLegacyCredentials.mockImplementationOnce(() => true);

    const fetchCalls: Array<{ method: string; url: string }> = [];
    let putCallOrder = -1;
    let callCounter = 0;

    globalThis.fetch = mock(async (input: string | Request, options?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.url;
      const method = options?.method || (typeof input === 'string' ? 'GET' : (input as Request).method) || 'GET';
      const callOrder = callCounter++;
      fetchCalls.push({ method, url });

      if (method === 'POST' && url.includes('/sync/challenge')) {
        return new Response(JSON.stringify({ nonce: 'n' }), { status: 200 });
      }
      if (method === 'POST' && url.includes('/sync/session')) {
        return new Response(JSON.stringify({ sessionToken: 's' }), { status: 200 });
      }
      if (method === 'GET' && url.includes('/sync/')) {
        return new Response(null, { status: 404 });
      }
      if (method === 'DELETE' && url.includes('/sync/')) {
        return new Response(null, { status: 204 });
      }
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    mockPutCredentials.mockImplementationOnce(async () => {
      putCallOrder = callCounter++;
    });

    await migrate({} as never);

    // Assert: DELETE call is in the fetch calls
    const deleteCall = fetchCalls.find((c) => c.method === 'DELETE');
    expect(deleteCall).toBeDefined();
    expect(deleteCall?.url).toMatch(/\/sync\/[a-z0-9]+/);

    // Assert: DELETE is called before putCredentials
    const deleteCallIndex = fetchCalls.findIndex((c) => c.method === 'DELETE');
    expect(deleteCallIndex).toBeGreaterThanOrEqual(0);
    expect(putCallOrder).toBeGreaterThan(deleteCallIndex);

    // Assert: putCredentials was called (credentials were swapped)
    expect(mockPutCredentials).toHaveBeenCalled();
  });

  it('does not overwrite credentials when the legacy blob deletion fails', async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'],
    );
    mockGetCredentials.mockImplementationOnce(async () => ({ id: 'main', cryptoKey: key }) as never);
    mockIsLegacyCredentials.mockImplementationOnce(() => true);

    globalThis.fetch = mock(async (input: string | Request, options?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.url;
      const method = options?.method || (typeof input === 'string' ? 'GET' : (input as Request).method) || 'GET';

      if (method === 'POST' && url.includes('/sync/challenge')) {
        return new Response(JSON.stringify({ nonce: 'n' }), { status: 200 });
      }
      if (method === 'POST' && url.includes('/sync/session')) {
        return new Response(JSON.stringify({ sessionToken: 's' }), { status: 200 });
      }
      if (method === 'GET' && url.includes('/sync/')) {
        return new Response(null, { status: 404 });
      }
      if (method === 'DELETE' && url.includes('/sync/')) {
        // Deletion fails
        return new Response(null, { status: 500 });
      }
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    await migrate({} as never);

    // Assert: putCredentials was NOT called (credentials were not swapped)
    expect(mockPutCredentials).not.toHaveBeenCalled();
    // Assert: generatePQCredentials was also not called (or if called, not stored)
    expect(mockGeneratePQCredentials).not.toHaveBeenCalled();
  });
});
