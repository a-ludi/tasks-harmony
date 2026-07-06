import { describe, it, expect, mock, beforeEach } from 'bun:test';

const mockPQCreds = {
  id: 'main' as const,
  version: 2 as const,
  mlkemPublicKey: new Uint8Array(1568),
  mlkemPrivateKey: new Uint8Array(3168),
  mldsaPublicKey: new Uint8Array(2592),
  mldsaPrivateKey: new Uint8Array(4896),
};

const mockGetCredentials = mock(async () => null);
const mockPutCredentials = mock(async () => {});

mock.module('@/db', () => ({
  getCredentials: mockGetCredentials,
  putCredentials: mockPutCredentials,
}));

const { getOrCreateSyncKey } = await import('./credentials');

describe('getOrCreateSyncKey', () => {
  beforeEach(() => {
    mockGetCredentials.mockReset();
    mockPutCredentials.mockReset();
  });

  it('throws instead of overwriting PQ credentials with a fresh AES key', async () => {
    mockGetCredentials.mockImplementation(async () => mockPQCreds as never);

    await expect(getOrCreateSyncKey({} as never)).rejects.toThrow();

    expect(mockPutCredentials).not.toHaveBeenCalled();
  });

  it('returns the existing AES key for legacy credentials without regenerating', async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'],
    );
    mockGetCredentials.mockImplementation(async () => ({ id: 'main', cryptoKey: key }) as never);

    const result = await getOrCreateSyncKey({} as never);

    expect(result).toBe(key);
    expect(mockPutCredentials).not.toHaveBeenCalled();
  });

  it('generates and stores a new AES key when no credentials exist', async () => {
    mockGetCredentials.mockImplementation(async () => null);

    const result = await getOrCreateSyncKey({} as never);

    expect(result).toBeDefined();
    expect(mockPutCredentials).toHaveBeenCalledTimes(1);
  });
});
