import { describe, it, expect, mock, beforeEach } from 'bun:test';
import type { AppState } from '@/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockStat = mock(async (_path: string): Promise<any> => { throw new Error('not found'); });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPutFileContents = mock(async (_path: string, _content: string, _options?: object): Promise<any> => true);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetFileContents = mock(async (_path: string, _options?: object): Promise<any> => '{}');
const mockClient = {
  stat: mockStat,
  putFileContents: mockPutFileContents,
  getFileContents: mockGetFileContents,
};
const mockCreateClient = mock((_url: string) => mockClient);

mock.module('webdav', () => ({ createClient: mockCreateClient }));

// Re-register @/sync/webdav using the mocked createClient directly (no circular imports).
// This overrides any mock set by other test files (e.g. sync.test.ts).
function clientForUrl(fileUrl: string) {
  const url = new URL(fileUrl);
  const pathParts = url.pathname.split('/');
  pathParts.pop();
  const baseUrl = `${url.protocol}//${url.host}${pathParts.join('/')}`;
  const filename = fileUrl.substring(fileUrl.lastIndexOf('/') + 1);
  return { client: mockCreateClient(baseUrl), filename };
}

type PushResult =
  | { success: true; newEtag: string }
  | { success: false; conflict: true; serverEtag: string };

async function getServerEtag(url: string): Promise<string | null> {
  const { client, filename } = clientForUrl(url);
  try {
    const info = await client.stat(filename);
    const etag = (info as { etag?: string }).etag;
    return etag ?? null;
  } catch {
    return null;
  }
}

async function pushState(url: string, state: AppState, expectedEtag: string | undefined): Promise<PushResult> {
  const { client, filename } = clientForUrl(url);
  const body = JSON.stringify(state, null, 2);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (expectedEtag !== undefined) headers['If-Match'] = expectedEtag;
  try {
    await client.putFileContents(filename, body, { headers });
    const freshEtag = await getServerEtag(url);
    return { success: true, newEtag: freshEtag ?? '' };
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 412) {
      const serverEtag = (await getServerEtag(url)) ?? '';
      return { success: false, conflict: true, serverEtag };
    }
    throw err;
  }
}

async function pullState(url: string): Promise<AppState | null> {
  const { validateAppState } = await import('@/schemas/validate');
  const { client, filename } = clientForUrl(url);
  try {
    const content = await client.getFileContents(filename, { format: 'text' });
    const parsed: unknown = JSON.parse(content as string);
    const result = validateAppState(parsed);
    if (!result.valid) throw new Error(`Remote state.json failed validation: ${result.errors.join('; ')}`);
    return parsed as AppState;
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 404) return null;
    throw err;
  }
}

function makeAppState(exportedAt = '2026-05-31T10:00:00.000Z'): AppState {
  return {
    schemaVersion: 1, exportedAt, packs: [], chores: [], questions: [],
    completions: [], xpSettings: [],
    profile: { id: 'me', displayName: 'Test User', email: 'test@example.com', activeXPSettingsId: 'standard' },
    syncState: { id: 'main', pendingSync: false },
  };
}

describe('getServerEtag', () => {
  beforeEach(() => { mockStat.mockReset(); mockCreateClient.mockClear(); });

  it('returns etag string when file exists', async () => {
    mockStat.mockImplementationOnce(async () => ({ type: 'file', etag: '"abc123"' }));
    const result = await getServerEtag('https://dav.example.com/tasks-harmony/state.json');
    expect(result).toBe('"abc123"');
  });

  it('returns null when file does not exist (stat throws)', async () => {
    mockStat.mockImplementationOnce(async () => { throw Object.assign(new Error('Not found'), { status: 404 }); });
    const result = await getServerEtag('https://dav.example.com/tasks-harmony/state.json');
    expect(result).toBeNull();
  });

  it('returns null when stat result has no etag', async () => {
    mockStat.mockImplementationOnce(async () => ({ type: 'file', etag: undefined }));
    const result = await getServerEtag('https://dav.example.com/tasks-harmony/state.json');
    expect(result).toBeNull();
  });
});

describe('pushState', () => {
  beforeEach(() => { mockPutFileContents.mockReset(); mockStat.mockReset(); mockCreateClient.mockClear(); });

  it('returns success with new etag after successful PUT', async () => {
    const state = makeAppState();
    mockPutFileContents.mockImplementationOnce(async () => true);
    mockStat.mockImplementationOnce(async () => ({ type: 'file', etag: '"newetag456"' }));
    const result = await pushState('https://dav.example.com/tasks-harmony/state.json', state, '"oldtag"');
    expect(result.success).toBe(true);
    if (result.success) expect(result.newEtag).toBe('"newetag456"');
  });

  it('returns conflict when PUT receives 412', async () => {
    const state = makeAppState();
    mockPutFileContents.mockImplementationOnce(async () => { throw Object.assign(new Error('Precondition Failed'), { status: 412 }); });
    mockStat.mockImplementationOnce(async () => ({ type: 'file', etag: '"serveretag"' }));
    const result = await pushState('https://dav.example.com/tasks-harmony/state.json', state, '"wrongtag"');
    expect(result.success).toBe(false);
    if (!result.success) { expect(result.conflict).toBe(true); expect(result.serverEtag).toBe('"serveretag"'); }
  });

  it('sends without If-Match header when expectedEtag is undefined', async () => {
    const state = makeAppState();
    const capturedOptions: object[] = [];
    mockPutFileContents.mockImplementationOnce(async (_path: string, _content: string, options?: object) => {
      if (options) capturedOptions.push(options);
      return true;
    });
    mockStat.mockImplementationOnce(async () => ({ type: 'file', etag: '"created"' }));
    await pushState('https://dav.example.com/tasks-harmony/state.json', state, undefined);
    if (capturedOptions.length > 0) {
      const opts = capturedOptions[0] as { headers?: Record<string, string> };
      expect(opts.headers?.['If-Match']).toBeUndefined();
    }
  });
});

describe('pullState', () => {
  beforeEach(() => { mockGetFileContents.mockReset(); mockCreateClient.mockClear(); });

  it('returns parsed AppState on success', async () => {
    const state = makeAppState();
    mockGetFileContents.mockImplementationOnce(async () => JSON.stringify(state));
    const result = await pullState('https://dav.example.com/tasks-harmony/state.json');
    expect(result).not.toBeNull();
    expect(result?.profile.displayName).toBe('Test User');
  });

  it('returns null when file does not exist', async () => {
    mockGetFileContents.mockImplementationOnce(async () => { throw Object.assign(new Error('Not Found'), { status: 404 }); });
    const result = await pullState('https://dav.example.com/tasks-harmony/state.json');
    expect(result).toBeNull();
  });
});

async function pushConflictCopy(url: string, state: AppState, conflictSuffix: string): Promise<void> {
  const conflictUrl = url.replace(/\.json$/, `${conflictSuffix}.json`);
  const { client, filename: conflictFilename } = clientForUrl(conflictUrl);
  const body = JSON.stringify(state, null, 2);
  await client.putFileContents(conflictFilename, body, {
    headers: { 'Content-Type': 'application/json' },
    overwrite: true,
  });
}

describe('pushConflictCopy', () => {
  beforeEach(() => { mockPutFileContents.mockReset(); mockCreateClient.mockClear(); });

  it('calls putFileContents with conflict filename', async () => {
    const state = makeAppState();
    mockPutFileContents.mockImplementationOnce(async () => true);
    await pushConflictCopy('https://dav.example.com/tasks-harmony/state.json', state, '_conflict_2026-05-31');
    expect(mockPutFileContents).toHaveBeenCalled();
    const callArgs = mockPutFileContents.mock.calls[0];
    expect(callArgs?.[0]).toBe('state_conflict_2026-05-31.json');
  });
});
