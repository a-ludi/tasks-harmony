import { describe, it, expect, mock, beforeEach } from 'bun:test';

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

const { migrate, ensureCredentials } = await import('./migrate');

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

    globalThis.fetch = mock(async () => new Response(null, { status: 404 })) as unknown as typeof fetch;

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
    globalThis.fetch = mock(async () => new Response(null, { status: 404 })) as unknown as typeof fetch;

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

    await expect(migrate({} as never)).resolves.toBeUndefined();
    expect(mockPutCredentials).toHaveBeenCalled();
  });
});

describe('ensureCredentials', () => {
  beforeEach(() => {
    mockPutCredentials.mockClear();
    mockGeneratePQCredentials.mockClear();
  });

  it('generates and stores PQ credentials when the database has none', async () => {
    mockGetCredentials.mockImplementationOnce(async () => undefined as never);

    await ensureCredentials({} as never);

    expect(mockGeneratePQCredentials).toHaveBeenCalled();
    expect(mockPutCredentials).toHaveBeenCalled();
  });

  it('does nothing when PQ credentials already exist', async () => {
    const pqCreds = { id: 'main', version: 2, mlkemPublicKey: new Uint8Array(1568),
      mlkemPrivateKey: new Uint8Array(3168), mldsaPublicKey: new Uint8Array(2592),
      mldsaPrivateKey: new Uint8Array(4896) };
    mockGetCredentials.mockImplementationOnce(async () => pqCreds as never);

    await ensureCredentials({} as never);

    expect(mockPutCredentials).not.toHaveBeenCalled();
  });

  it('does nothing when legacy credentials exist', async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'],
    );
    mockGetCredentials.mockImplementationOnce(async () => ({ id: 'main', cryptoKey: key }) as never);

    await ensureCredentials({} as never);

    expect(mockPutCredentials).not.toHaveBeenCalled();
  });
});
