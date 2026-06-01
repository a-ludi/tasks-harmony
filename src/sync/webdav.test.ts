import { describe, it, expect, mock, beforeEach } from 'bun:test';
import type { AppState } from '@/types';

const mockStat = mock(async (_path: string) => { throw new Error('not found'); });
const mockPutFileContents = mock(async (_path: string, _content: string, _options?: object) => true);
const mockGetFileContents = mock(async (_path: string, _options?: object) => '{}');
const mockCreateClient = mock((_url: string) => ({
  stat: mockStat,
  putFileContents: mockPutFileContents,
  getFileContents: mockGetFileContents,
}));

mock.module('webdav', () => ({ createClient: mockCreateClient }));

const { getServerEtag, pushState, pullState } = await import('./webdav');

function makeAppState(exportedAt = '2026-05-31T10:00:00.000Z'): AppState {
  return {
    schemaVersion: 1, exportedAt, packs: [], chores: [], questions: [],
    completions: [], xpSettings: [],
    profile: { id: 'me', displayName: 'Test User', email: 'test@example.com', activeXPSettingsId: 'standard' },
    syncState: { id: 'main', pendingSync: false },
  };
}

describe('getServerEtag', () => {
  beforeEach(() => { mockStat.mockClear(); mockCreateClient.mockClear(); });

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
    mockPutFileContents.mockImplementationOnce(async () => ({ status: 204, headers: { etag: '"newetag456"' } }));
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
      return { status: 201, headers: { etag: '"created"' } };
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
  beforeEach(() => { mockGetFileContents.mockClear(); mockCreateClient.mockClear(); });

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
