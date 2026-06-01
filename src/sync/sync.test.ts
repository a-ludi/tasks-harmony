import { describe, it, expect, mock, beforeEach } from 'bun:test';
import type { AppState, SyncState } from '@/types';

const mockExportAppState = mock(async () => makeAppState());
const mockGetServerEtag = mock(async (_url: string) => null as string | null);
const mockPushState = mock(async () => ({ success: true as const, newEtag: '"newtag"' }));
const mockNeedsConflictResolution = mock((_state: SyncState, _etag: string) => false);

mock.module('@/sync/export', () => ({ exportAppState: mockExportAppState }));
mock.module('@/sync/webdav', () => ({ getServerEtag: mockGetServerEtag, pushState: mockPushState }));
mock.module('@/sync/state', () => ({
  needsConflictResolution: mockNeedsConflictResolution,
  canSync: (_s: SyncState) => Boolean(_s.webdavUrl),
  buildConflictSuffix: (iso: string) => `_conflict_${iso.substring(0, 10)}`,
}));

const { performSync } = await import('./sync');

function makeAppState(exportedAt = '2026-05-31T10:00:00.000Z'): AppState {
  return {
    schemaVersion: 1, exportedAt, packs: [], chores: [], questions: [],
    completions: [], xpSettings: [],
    profile: { id: 'me', displayName: 'Test User', email: 'test@example.com', activeXPSettingsId: 'standard' },
    syncState: { id: 'main', webdavUrl: 'https://dav.example.com/tasks-harmony/state.json', serverEtag: '"etag1"', pendingSync: true },
  };
}

function makeSyncState(overrides: Partial<SyncState> = {}): SyncState {
  return { id: 'main', webdavUrl: 'https://dav.example.com/tasks-harmony/state.json', serverEtag: '"etag1"', pendingSync: true, ...overrides };
}

describe('performSync', () => {
  beforeEach(() => {
    mockExportAppState.mockClear(); mockGetServerEtag.mockClear(); mockPushState.mockClear(); mockNeedsConflictResolution.mockClear();
    mockGetServerEtag.mockImplementation(async () => null);
    mockNeedsConflictResolution.mockImplementation(() => false);
    mockPushState.mockImplementation(async () => ({ success: true as const, newEtag: '"newtag"' }));
  });

  it('returns updated SyncState with new etag on successful push', async () => {
    const syncState = makeSyncState({ serverEtag: undefined });
    const onConflict = mock(() => {});
    const db = {} as IDBDatabase;
    const result = await performSync(db as never, syncState, onConflict);
    expect(result.pendingSync).toBe(false);
    expect(result.serverEtag).toBe('"newtag"');
    expect(result.lastSyncedAt).toBeDefined();
    expect(onConflict).not.toHaveBeenCalled();
  });

  it('calls onConflict and returns unchanged state when needsConflictResolution is true', async () => {
    mockGetServerEtag.mockImplementationOnce(async () => '"remoteTag"');
    mockNeedsConflictResolution.mockImplementationOnce(() => true);
    const syncState = makeSyncState({ serverEtag: '"differentTag"' });
    const onConflict = mock(() => {});
    const db = {} as IDBDatabase;
    const result = await performSync(db as never, syncState, onConflict);
    expect(onConflict).toHaveBeenCalledTimes(1);
    const conflictArg = onConflict.mock.calls[0]![0] as { serverEtag: string; detectedAt: string; };
    expect(conflictArg.serverEtag).toBe('"remoteTag"');
    expect(conflictArg.detectedAt).toBeDefined();
    expect(result).toStrictEqual(syncState);
  });

  it('calls onConflict and returns unchanged state when pushState returns conflict', async () => {
    mockPushState.mockImplementationOnce(async () => ({ success: false as const, conflict: true as const, serverEtag: '"conflictTag"' }));
    const syncState = makeSyncState();
    const onConflict = mock(() => {});
    const db = {} as IDBDatabase;
    const result = await performSync(db as never, syncState, onConflict);
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(result).toStrictEqual(syncState);
  });

  it('does not call pushState when webdavUrl is absent', async () => {
    const syncState = makeSyncState({ webdavUrl: undefined });
    const onConflict = mock(() => {});
    const db = {} as IDBDatabase;
    const result = await performSync(db as never, syncState, onConflict);
    expect(mockPushState).not.toHaveBeenCalled();
    expect(result).toStrictEqual(syncState);
  });

  it('sends existing serverEtag as expectedEtag when available', async () => {
    const capturedArgs: unknown[] = [];
    mockPushState.mockImplementationOnce(async (...args) => { capturedArgs.push(args); return { success: true as const, newEtag: '"newtag"' }; });
    const syncState = makeSyncState({ serverEtag: '"knownEtag"' });
    const db = {} as IDBDatabase;
    await performSync(db as never, syncState, mock(() => {}));
    const [, , expectedEtag] = capturedArgs[0] as [string, AppState, string];
    expect(expectedEtag).toBe('"knownEtag"');
  });
});
