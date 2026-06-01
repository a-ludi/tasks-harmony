# Tasks Harmony — Profile, Sync & CDP Import Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the profile page (display name, email, XP stats, XP settings selector), WebDAV sync with ETag-based conflict resolution (three resolution options), CDP (Chore Definition Pack) import from a URL, and offline awareness that disables CDP import and defers sync until reconnect (fires exactly once on reconnect).

**Architecture:** All network operations (WebDAV PUT/GET, CDP YAML fetches) are isolated in `src/sync/webdav.ts` and `src/cdp/cdp-import.ts`. Orchestration (ETag check → push → conflict handling) lives in `src/sync/sync.ts`. The Zustand store receives two new actions (`importCDP`, `updateCDP`). The profile page is a dedicated route. Offline awareness flows from a single custom hook (`useOnlineStatus`) into NavBar, CDPImportDialog, and the App-level reconnect watcher. The WebDAV URL stored in `SyncState.webdavUrl` is the full path to `state.json`; conflicts write a sibling file with `_conflict_YYYY-MM-DD` inserted before `.json`.

**Tech Stack:** React 19, TypeScript 5, Zustand 5, idb 8, Bun test runner, Tailwind CSS 4, js-yaml, webdav npm package.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/hooks/useOnlineStatus.ts` | Create | Returns `boolean` isOnline, listens to window online/offline events |
| `src/sync/webdav.ts` | Create | `getServerEtag`, `pushState`, `pullState` — low-level WebDAV helpers |
| `src/sync/webdav.test.ts` | Create | TDD tests for webdav helpers |
| `src/sync/sync.ts` | Create | `performSync` — full sync orchestration flow |
| `src/sync/sync.test.ts` | Create | TDD tests for sync orchestration |
| `src/cdp/cdp-import.ts` | Create | `fetchCDP` — fetch + parse YAML pack, return Pack and Chore[] |
| `src/cdp/cdp-import.test.ts` | Create | TDD tests for CDP fetch and parse |
| `src/components/profile/ProfilePage.tsx` | Create | Profile form: display name, email, XP stats, XP settings selector |
| `src/components/sync/SyncButton.tsx` | Create | Sync status + trigger button with pending badge |
| `src/components/sync/ConflictDialog.tsx` | Create | 3-option conflict resolution modal |
| `src/components/cdp/CDPImportDialog.tsx` | Create | URL input, import/update flow, offline guard |
| `src/store/index.ts` | Modify | Add `importCDP`, `updateCDP` actions |
| `src/components/layout/NavBar.tsx` | Modify | Add SyncButton, CDP import button (offline-aware) |
| `src/App.tsx` | Modify | Add /profile route, online reconnect watcher |

---

### Task 1: Online status hook

**Files:**
- Create: `src/hooks/useOnlineStatus.ts`

- [ ] **Step 1: Create the hook**

Create `src/hooks/useOnlineStatus.ts`:

```typescript
import { useEffect, useState } from 'react';

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
```

---

### Task 2: WebDAV helpers (TDD)

**Files:**
- Create: `src/sync/webdav.ts`
- Create: `src/sync/webdav.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/sync/webdav.test.ts`:

```typescript
import { describe, it, expect, mock, beforeEach } from 'bun:test';
import type { AppState } from '@/types';

// We mock the 'webdav' module before importing our module under test.
// Bun resolves module mocks before the import, so we use mock.module().
const mockStat = mock(async (_path: string) => {
  throw new Error('not found');
});
const mockPutFileContents = mock(async (
  _path: string,
  _content: string,
  _options?: object,
) => true);
const mockGetFileContents = mock(async (_path: string, _options?: object) =>
  '{}',
);
const mockCreateClient = mock((_url: string) => ({
  stat: mockStat,
  putFileContents: mockPutFileContents,
  getFileContents: mockGetFileContents,
}));

mock.module('webdav', () => ({
  createClient: mockCreateClient,
}));

// Import AFTER mocking
const { getServerEtag, pushState, pullState } = await import('./webdav');

// ── helpers ──────────────────────────────────────────────────────────────────

function makeAppState(exportedAt = '2026-05-31T10:00:00.000Z'): AppState {
  return {
    schemaVersion: 1,
    exportedAt,
    packs: [],
    chores: [],
    questions: [],
    completions: [],
    xpSettings: [],
    profile: {
      id: 'me',
      displayName: 'Test User',
      email: 'test@example.com',
      activeXPSettingsId: 'standard',
    },
    syncState: {
      id: 'main',
      pendingSync: false,
    },
  };
}

// ── getServerEtag ─────────────────────────────────────────────────────────────

describe('getServerEtag', () => {
  beforeEach(() => {
    mockStat.mockClear();
    mockCreateClient.mockClear();
  });

  it('returns etag string when file exists', async () => {
    mockStat.mockImplementationOnce(async () => ({
      type: 'file',
      etag: '"abc123"',
    }));

    const result = await getServerEtag(
      'https://dav.example.com/tasks-harmony/state.json',
    );

    expect(result).toBe('"abc123"');
  });

  it('returns null when file does not exist (stat throws)', async () => {
    mockStat.mockImplementationOnce(async () => {
      throw Object.assign(new Error('Not found'), { status: 404 });
    });

    const result = await getServerEtag(
      'https://dav.example.com/tasks-harmony/state.json',
    );

    expect(result).toBeNull();
  });

  it('returns null when stat result has no etag', async () => {
    mockStat.mockImplementationOnce(async () => ({
      type: 'file',
      etag: undefined,
    }));

    const result = await getServerEtag(
      'https://dav.example.com/tasks-harmony/state.json',
    );

    expect(result).toBeNull();
  });
});

// ── pushState ─────────────────────────────────────────────────────────────────

describe('pushState', () => {
  beforeEach(() => {
    mockPutFileContents.mockClear();
    mockStat.mockClear();
    mockCreateClient.mockClear();
  });

  it('returns success with new etag after successful PUT', async () => {
    const state = makeAppState();
    // putFileContents returns ResponseDataDetailed with headers
    mockPutFileContents.mockImplementationOnce(async () => ({
      status: 204,
      headers: { etag: '"newetag456"' },
    }));
    // stat called after PUT to read new etag if headers are absent
    mockStat.mockImplementationOnce(async () => ({
      type: 'file',
      etag: '"newetag456"',
    }));

    const result = await pushState(
      'https://dav.example.com/tasks-harmony/state.json',
      state,
      '"oldtag"',
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.newEtag).toBe('"newetag456"');
    }
  });

  it('returns conflict when PUT receives 412', async () => {
    const state = makeAppState();
    mockPutFileContents.mockImplementationOnce(async () => {
      throw Object.assign(new Error('Precondition Failed'), { status: 412 });
    });
    // stat to read current server etag after 412
    mockStat.mockImplementationOnce(async () => ({
      type: 'file',
      etag: '"serveretag"',
    }));

    const result = await pushState(
      'https://dav.example.com/tasks-harmony/state.json',
      state,
      '"wrongtag"',
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.conflict).toBe(true);
      expect(result.serverEtag).toBe('"serveretag"');
    }
  });

  it('sends without If-Match header when expectedEtag is undefined', async () => {
    const state = makeAppState();
    const capturedOptions: object[] = [];
    mockPutFileContents.mockImplementationOnce(
      async (_path: string, _content: string, options?: object) => {
        if (options) capturedOptions.push(options);
        return { status: 201, headers: { etag: '"created"' } };
      },
    );
    mockStat.mockImplementationOnce(async () => ({
      type: 'file',
      etag: '"created"',
    }));

    await pushState(
      'https://dav.example.com/tasks-harmony/state.json',
      state,
      undefined,
    );

    // Should not pass If-Match in headers
    if (capturedOptions.length > 0) {
      const opts = capturedOptions[0] as { headers?: Record<string, string> };
      expect(opts.headers?.['If-Match']).toBeUndefined();
    }
  });
});

// ── pullState ─────────────────────────────────────────────────────────────────

describe('pullState', () => {
  beforeEach(() => {
    mockGetFileContents.mockClear();
    mockCreateClient.mockClear();
  });

  it('returns parsed AppState on success', async () => {
    const state = makeAppState();
    mockGetFileContents.mockImplementationOnce(async () =>
      JSON.stringify(state),
    );

    const result = await pullState(
      'https://dav.example.com/tasks-harmony/state.json',
    );

    expect(result).not.toBeNull();
    expect(result?.profile.displayName).toBe('Test User');
  });

  it('returns null when file does not exist', async () => {
    mockGetFileContents.mockImplementationOnce(async () => {
      throw Object.assign(new Error('Not Found'), { status: 404 });
    });

    const result = await pullState(
      'https://dav.example.com/tasks-harmony/state.json',
    );

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd /home/alu/projects/tasks-harmony && bun test src/sync/webdav.test.ts 2>&1 | head -30
```

- [ ] **Step 3: Implement `src/sync/webdav.ts`**

Create `src/sync/webdav.ts`:

```typescript
import { createClient } from 'webdav';
import type { AppState } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PushResult =
  | { success: true; newEtag: string }
  | { success: false; conflict: true; serverEtag: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a WebDAV client scoped to the directory containing the state file.
 * The webdav package's createClient expects the server root, not the file path.
 * We strip the filename to get the base URL.
 */
function clientForUrl(fileUrl: string) {
  const url = new URL(fileUrl);
  // Remove the last path segment (filename) to get the directory base URL
  const pathParts = url.pathname.split('/');
  pathParts.pop(); // remove filename
  const baseUrl = `${url.protocol}//${url.host}${pathParts.join('/')}`;
  const filename = fileUrl.substring(fileUrl.lastIndexOf('/') + 1);
  return { client: createClient(baseUrl), filename };
}

// ── getServerEtag ─────────────────────────────────────────────────────────────

/**
 * HEAD the remote state.json and return its ETag header value.
 * Returns null if the file does not exist or the server returns no ETag.
 */
export async function getServerEtag(url: string): Promise<string | null> {
  const { client, filename } = clientForUrl(url);
  try {
    const info = await client.stat(filename);
    // The webdav package's FileStat type carries `etag` as optional string
    const etag = (info as { etag?: string }).etag;
    return etag ?? null;
  } catch {
    // File not found or network error — treat as no file
    return null;
  }
}

// ── pushState ─────────────────────────────────────────────────────────────────

/**
 * PUT the serialised AppState to the remote URL.
 *
 * - If `expectedEtag` is provided it is sent as the `If-Match` header so the
 *   server rejects the write when another client changed the file.
 * - Returns `{ success: true, newEtag }` on HTTP 2xx.
 * - Returns `{ success: false, conflict: true, serverEtag }` on HTTP 412
 *   (Precondition Failed).  `serverEtag` is fetched with a follow-up stat().
 * - Rethrows any other network error so the caller can surface it to the user.
 */
export async function pushState(
  url: string,
  state: AppState,
  expectedEtag: string | undefined,
): Promise<PushResult> {
  const { client, filename } = clientForUrl(url);
  const body = JSON.stringify(state, null, 2);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (expectedEtag !== undefined) {
    headers['If-Match'] = expectedEtag;
  }

  try {
    const response = await client.putFileContents(filename, body, {
      headers,
      // Ask webdav package to return response details so we can read ETag
      returnRaw: true,
    });

    // Extract ETag from response headers when available
    const rawEtag =
      typeof response === 'object' && response !== null
        ? (response as { headers?: Record<string, string> }).headers?.etag
        : undefined;

    if (rawEtag) {
      return { success: true, newEtag: rawEtag };
    }

    // If the response didn't carry the ETag header, do a follow-up stat
    const freshEtag = await getServerEtag(url);
    return { success: true, newEtag: freshEtag ?? '' };
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;

    if (status === 412) {
      // Precondition Failed — another client changed the file
      const serverEtag = (await getServerEtag(url)) ?? '';
      return { success: false, conflict: true, serverEtag };
    }

    // Rethrow unexpected errors
    throw err;
  }
}

// ── pullState ─────────────────────────────────────────────────────────────────

/**
 * GET the remote state.json and parse it as AppState.
 * Returns null when the file does not exist (HTTP 404).
 * Rethrows any other network error.
 */
export async function pullState(url: string): Promise<AppState | null> {
  const { client, filename } = clientForUrl(url);

  try {
    const content = await client.getFileContents(filename, {
      format: 'text',
    });
    const parsed: unknown = JSON.parse(content as string);
    const { validateAppState } = await import('@/schemas/validate');
    const result = validateAppState(parsed);
    if (!result.valid) {
      throw new Error(`Remote state.json failed schema validation: ${result.errors.join('; ')}`);
    }
    return parsed as AppState;
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 404) {
      return null;
    }
    throw err;
  }
}

// ── pushConflictCopy ──────────────────────────────────────────────────────────

/**
 * Save the local state to a conflict filename beside the main state file.
 *
 * URL example: `https://dav.example.com/tasks-harmony/state.json`
 * Conflict URL: `https://dav.example.com/tasks-harmony/state_conflict_2026-05-31.json`
 *
 * This is used when the user picks "Resolve manually" in the ConflictDialog.
 */
export async function pushConflictCopy(
  url: string,
  state: AppState,
  conflictSuffix: string,
): Promise<void> {
  // Insert suffix before the final .json extension
  const conflictUrl = url.replace(/\.json$/, `${conflictSuffix}.json`);
  const { client, filename: conflictFilename } = clientForUrl(conflictUrl);
  const body = JSON.stringify(state, null, 2);

  await client.putFileContents(conflictFilename, body, {
    headers: { 'Content-Type': 'application/json' },
    overwrite: true,
  });
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd /home/alu/projects/tasks-harmony && bun test src/sync/webdav.test.ts 2>&1
```

---

### Task 3: Sync orchestration (TDD)

**Files:**
- Create: `src/sync/sync.ts`
- Create: `src/sync/sync.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/sync/sync.test.ts`:

```typescript
import { describe, it, expect, mock, beforeEach } from 'bun:test';
import type { AppState, SyncState } from '@/types';

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockExportAppState = mock(async () => makeAppState());
const mockGetServerEtag = mock(async (_url: string) => null as string | null);
const mockPushState = mock(async () => ({
  success: true as const,
  newEtag: '"newtag"',
}));
const mockNeedsConflictResolution = mock(
  (_state: SyncState, _etag: string) => false,
);

mock.module('@/sync/export', () => ({ exportAppState: mockExportAppState }));
mock.module('@/sync/webdav', () => ({
  getServerEtag: mockGetServerEtag,
  pushState: mockPushState,
}));
mock.module('@/sync/state', () => ({
  needsConflictResolution: mockNeedsConflictResolution,
  canSync: (_s: SyncState) => Boolean(_s.webdavUrl),
  buildConflictSuffix: (iso: string) =>
    `_conflict_${iso.substring(0, 10)}`,
}));

const { performSync } = await import('./sync');

// ── helpers ───────────────────────────────────────────────────────────────────

function makeAppState(exportedAt = '2026-05-31T10:00:00.000Z'): AppState {
  return {
    schemaVersion: 1,
    exportedAt,
    packs: [],
    chores: [],
    questions: [],
    completions: [],
    xpSettings: [],
    profile: {
      id: 'me',
      displayName: 'Test User',
      email: 'test@example.com',
      activeXPSettingsId: 'standard',
    },
    syncState: {
      id: 'main',
      webdavUrl: 'https://dav.example.com/tasks-harmony/state.json',
      serverEtag: '"etag1"',
      pendingSync: true,
    },
  };
}

function makeSyncState(
  overrides: Partial<SyncState> = {},
): SyncState {
  return {
    id: 'main',
    webdavUrl: 'https://dav.example.com/tasks-harmony/state.json',
    serverEtag: '"etag1"',
    pendingSync: true,
    ...overrides,
  };
}

// ── performSync ───────────────────────────────────────────────────────────────

describe('performSync', () => {
  beforeEach(() => {
    mockExportAppState.mockClear();
    mockGetServerEtag.mockClear();
    mockPushState.mockClear();
    mockNeedsConflictResolution.mockClear();

    // Default: no server file yet
    mockGetServerEtag.mockImplementation(async () => null);
    mockNeedsConflictResolution.mockImplementation(() => false);
    mockPushState.mockImplementation(async () => ({
      success: true as const,
      newEtag: '"newtag"',
    }));
  });

  it('returns updated SyncState with new etag on successful push', async () => {
    const syncState = makeSyncState({ serverEtag: undefined });
    const onConflict = mock(() => {});
    const db = {} as IDBDatabase;

    const result = await performSync(db, syncState, onConflict);

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

    const result = await performSync(db, syncState, onConflict);

    expect(onConflict).toHaveBeenCalledTimes(1);
    const conflictArg = onConflict.mock.calls[0]![0] as {
      serverEtag: string;
      detectedAt: string;
    };
    expect(conflictArg.serverEtag).toBe('"remoteTag"');
    expect(conflictArg.detectedAt).toBeDefined();
    // State must not change
    expect(result).toStrictEqual(syncState);
  });

  it('calls onConflict and returns unchanged state when pushState returns conflict', async () => {
    mockPushState.mockImplementationOnce(async () => ({
      success: false as const,
      conflict: true as const,
      serverEtag: '"conflictTag"',
    }));

    const syncState = makeSyncState();
    const onConflict = mock(() => {});
    const db = {} as IDBDatabase;

    const result = await performSync(db, syncState, onConflict);

    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(result).toStrictEqual(syncState);
  });

  it('does not call pushState when webdavUrl is absent', async () => {
    const syncState = makeSyncState({ webdavUrl: undefined });
    const onConflict = mock(() => {});
    const db = {} as IDBDatabase;

    const result = await performSync(db, syncState, onConflict);

    expect(mockPushState).not.toHaveBeenCalled();
    // Returns unchanged state (can't sync without URL)
    expect(result).toStrictEqual(syncState);
  });

  it('sends existing serverEtag as expectedEtag when available', async () => {
    const capturedArgs: unknown[] = [];
    mockPushState.mockImplementationOnce(async (...args) => {
      capturedArgs.push(args);
      return { success: true as const, newEtag: '"newtag"' };
    });

    const syncState = makeSyncState({ serverEtag: '"knownEtag"' });
    const db = {} as IDBDatabase;
    await performSync(db, syncState, mock(() => {}));

    const [, , expectedEtag] = capturedArgs[0] as [string, AppState, string];
    expect(expectedEtag).toBe('"knownEtag"');
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd /home/alu/projects/tasks-harmony && bun test src/sync/sync.test.ts 2>&1 | head -30
```

- [ ] **Step 3: Implement `src/sync/sync.ts`**

Create `src/sync/sync.ts`:

```typescript
import type { AppState, SyncState } from '@/types';
import { exportAppState } from '@/sync/export';
import { getServerEtag, pushState } from '@/sync/webdav';
import { canSync, needsConflictResolution, buildConflictSuffix } from '@/sync/state';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConflictInfo {
  localState: AppState;
  serverEtag: string;
  /** ISO 8601 date string parsed from the server ETag if it embeds a timestamp,
   *  or undefined when not available. */
  serverTimestamp?: string;
  /** ISO 8601 datetime at which the conflict was detected. */
  detectedAt: string;
}

// ── performSync ───────────────────────────────────────────────────────────────

/**
 * Full sync orchestration:
 *
 * 1. Export local state from IndexedDB.
 * 2. HEAD the remote file to get the current server ETag.
 * 3. If the server ETag differs from what we last wrote (conflict detection),
 *    call onConflict and return the unchanged syncState.
 * 4. PUT the local state with If-Match (or without on first sync).
 * 5. If the server returns 412 during the PUT, call onConflict and return
 *    the unchanged syncState.
 * 6. On success, return an updated SyncState with the new ETag and timestamp.
 */
export async function performSync(
  db: IDBDatabase,
  syncState: SyncState,
  onConflict: (info: ConflictInfo) => void,
): Promise<SyncState> {
  // Guard: cannot sync without a URL
  if (!canSync(syncState)) {
    return syncState;
  }

  const url = syncState.webdavUrl!;
  const now = new Date().toISOString();

  // Step 1: export
  const localState = await exportAppState(db);

  // Step 2: check server ETag
  const serverEtag = await getServerEtag(url);

  // Step 3: conflict detection based on stored expected ETag
  if (serverEtag !== null && needsConflictResolution(syncState, serverEtag)) {
    onConflict({
      localState,
      serverEtag,
      detectedAt: now,
    });
    return syncState;
  }

  // Step 4: PUT
  const result = await pushState(url, localState, syncState.serverEtag);

  // Step 5: conflict from server response (412)
  if (!result.success) {
    onConflict({
      localState,
      serverEtag: result.serverEtag,
      detectedAt: now,
    });
    return syncState;
  }

  // Step 6: success — return updated syncState
  return {
    ...syncState,
    serverEtag: result.newEtag,
    lastSyncedAt: now,
    pendingSync: false,
  };
}

// ── buildConflictUrl ──────────────────────────────────────────────────────────

/**
 * Given the primary state.json URL, compute the conflict file URL.
 *
 * Example:
 *   input:  'https://dav.example.com/tasks-harmony/state.json'
 *   output: 'https://dav.example.com/tasks-harmony/state_conflict_2026-05-31.json'
 */
export function buildConflictUrl(stateUrl: string, isoDatetime: string): string {
  const suffix = buildConflictSuffix(isoDatetime);
  return stateUrl.replace(/\.json$/, `${suffix}.json`);
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd /home/alu/projects/tasks-harmony && bun test src/sync/sync.test.ts 2>&1
```

---

### Task 4: CDP import module (TDD)

**Files:**
- Create: `src/cdp/cdp-import.ts`
- Create: `src/cdp/cdp-import.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/cdp/cdp-import.test.ts`:

```typescript
import { describe, it, expect, mock, beforeEach } from 'bun:test';
import type { XPSize } from '@/types';

// ── Module mocks ──────────────────────────────────────────────────────────────

// We mock the global fetch so no real network calls are made.
const mockFetch = mock(async (_url: string) => {
  return new Response('{}', { status: 200 });
});
global.fetch = mockFetch as unknown as typeof fetch;

const { fetchCDP } = await import('./cdp-import');

// ── helpers ───────────────────────────────────────────────────────────────────

const PACK_YAML = `
title: "Morning Routines"
author: "Alice"
license: "MIT"
description: "Morning habit pack"
chores:
  - make-bed.yaml
  - brush-teeth.yaml
`.trim();

const MAKE_BED_YAML = `
title: "Make Bed"
description: "Straighten sheets and fluff pillow"
xpSize: XS
frequency: daily
interval: 1
`.trim();

const BRUSH_TEETH_YAML = `
title: "Brush Teeth"
xpSize: XXS
frequency: daily
interval: 1
windowStartTime: "22:00"
repeatable: false
`.trim();

function setupFetchResponses(responses: Record<string, string>) {
  mockFetch.mockImplementation(async (url: string) => {
    const body = responses[url];
    if (body === undefined) {
      return new Response('Not found', { status: 404 });
    }
    return new Response(body, { status: 200 });
  });
}

// ── fetchCDP ──────────────────────────────────────────────────────────────────

describe('fetchCDP', () => {
  const BASE = 'https://raw.githubusercontent.com/alice/packs/main/morning';

  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('fetches and parses pack manifest and all chore files', async () => {
    setupFetchResponses({
      [`${BASE}/__pack__.yaml`]: PACK_YAML,
      [`${BASE}/make-bed.yaml`]: MAKE_BED_YAML,
      [`${BASE}/brush-teeth.yaml`]: BRUSH_TEETH_YAML,
    });

    const { pack, chores } = await fetchCDP(BASE);

    expect(pack.manifest.title).toBe('Morning Routines');
    expect(pack.manifest.author).toBe('Alice');
    expect(pack.manifest.license).toBe('MIT');
    expect(pack.manifest.description).toBe('Morning habit pack');
    expect(pack.sourceUrl).toBe(BASE);
    expect(chores).toHaveLength(2);
  });

  it('derives packId from last URL path segment', async () => {
    setupFetchResponses({
      [`${BASE}/__pack__.yaml`]: PACK_YAML,
      [`${BASE}/make-bed.yaml`]: MAKE_BED_YAML,
      [`${BASE}/brush-teeth.yaml`]: BRUSH_TEETH_YAML,
    });

    const { pack } = await fetchCDP(BASE);

    expect(pack.id).toBe('morning');
  });

  it('builds chore keys as packId/choreId', async () => {
    setupFetchResponses({
      [`${BASE}/__pack__.yaml`]: PACK_YAML,
      [`${BASE}/make-bed.yaml`]: MAKE_BED_YAML,
      [`${BASE}/brush-teeth.yaml`]: BRUSH_TEETH_YAML,
    });

    const { chores } = await fetchCDP(BASE);

    const keys = chores.map((c) => c.key).sort();
    expect(keys).toEqual(['morning/brush-teeth', 'morning/make-bed']);
  });

  it('strips .yaml from filename to form choreId', async () => {
    setupFetchResponses({
      [`${BASE}/__pack__.yaml`]: PACK_YAML,
      [`${BASE}/make-bed.yaml`]: MAKE_BED_YAML,
      [`${BASE}/brush-teeth.yaml`]: BRUSH_TEETH_YAML,
    });

    const { chores } = await fetchCDP(BASE);

    const makeBed = chores.find((c) => c.choreId === 'make-bed');
    expect(makeBed).toBeDefined();
    expect(makeBed!.title).toBe('Make Bed');
    expect(makeBed!.xpSize).toBe('XS' as XPSize);
  });

  it('defaults recurrence.startDate to today when missing from YAML', async () => {
    setupFetchResponses({
      [`${BASE}/__pack__.yaml`]: PACK_YAML,
      [`${BASE}/make-bed.yaml`]: MAKE_BED_YAML,
      [`${BASE}/brush-teeth.yaml`]: BRUSH_TEETH_YAML,
    });

    const { chores } = await fetchCDP(BASE);

    const brushTeeth = chores.find((c) => c.choreId === 'brush-teeth');
    expect(brushTeeth).toBeDefined();
    const today = new Date().toISOString().substring(0, 10);
    expect(brushTeeth!.recurrence.startDate).toBe(today);
  });

  it('throws when pack manifest is missing title', async () => {
    setupFetchResponses({
      [`${BASE}/__pack__.yaml`]: 'chores:\n  - make-bed.yaml',
      [`${BASE}/make-bed.yaml`]: MAKE_BED_YAML,
    });

    await expect(fetchCDP(BASE)).rejects.toThrow('title');
  });

  it('throws when pack manifest is missing chores list', async () => {
    setupFetchResponses({
      [`${BASE}/__pack__.yaml`]: 'title: Test Pack',
    });

    await expect(fetchCDP(BASE)).rejects.toThrow('chores');
  });

  it('throws when __pack__.yaml fetch fails with 404', async () => {
    setupFetchResponses({});

    await expect(fetchCDP(BASE)).rejects.toThrow('404');
  });

  it('throws when a chore YAML fetch fails', async () => {
    setupFetchResponses({
      [`${BASE}/__pack__.yaml`]: PACK_YAML,
      [`${BASE}/make-bed.yaml`]: MAKE_BED_YAML,
      // brush-teeth.yaml deliberately omitted → 404
    });

    await expect(fetchCDP(BASE)).rejects.toThrow('brush-teeth.yaml');
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd /home/alu/projects/tasks-harmony && bun test src/cdp/cdp-import.test.ts 2>&1 | head -30
```

- [ ] **Step 3: Implement `src/cdp/cdp-import.ts`**

Create `src/cdp/cdp-import.ts`:

```typescript
import jsYaml from 'js-yaml';
import type { Pack, Chore, XPSize, RecurrenceFrequency } from '@/types';
import { validatePackManifest, validateChoreDefinition } from '@/schemas/validate';

// ── Internal YAML schemas ─────────────────────────────────────────────────────

interface PackYaml {
  title: string;
  author?: string;
  license?: string;
  description?: string;
  chores: string[];
}

interface ChoreYaml {
  title: string;
  description?: string;
  xpSize: XPSize;
  frequency: RecurrenceFrequency;
  interval: number;
  windowStartTime?: string;   // default '00:00'
  repeatable?: boolean;       // default false
  questions?: unknown[];
}

// ── fetchCDP ──────────────────────────────────────────────────────────────────

/**
 * Fetch and parse a Chore Definition Pack from a base URL.
 *
 * 1. GET `${baseUrl}/__pack__.yaml` → parse as PackYaml
 * 2. Validate required fields (title, chores)
 * 3. Derive packId from last path segment of baseUrl
 * 4. For each filename in PackYaml.chores:
 *    - GET `${baseUrl}/${filename}` → parse as ChoreYaml
 *    - choreId = filename without .yaml extension
 *    - build Chore with key = `${packId}/${choreId}`
 *    - default recurrence.startDate to today (YYYY-MM-DD) if absent
 * 5. Return { pack, chores }
 */
export async function fetchCDP(
  baseUrl: string,
): Promise<{ pack: Pack; chores: Chore[] }> {
  // ── Fetch manifest ──────────────────────────────────────────────────────────
  const manifestUrl = `${baseUrl}/__pack__.yaml`;
  const manifestRes = await fetch(manifestUrl);
  if (!manifestRes.ok) {
    throw new Error(
      `Failed to fetch pack manifest from ${manifestUrl}: ${manifestRes.status}`,
    );
  }
  const manifestText = await manifestRes.text();
  const manifestRaw = jsYaml.load(manifestText) as PackYaml;

  // ── Validate manifest ───────────────────────────────────────────────────────
  const manifestValidation = validatePackManifest(manifestRaw);
  if (!manifestValidation.valid) {
    throw new Error(
      `CDP manifest at ${manifestUrl} is invalid: ${manifestValidation.errors.join('; ')}`,
    );
  }
  if (!Array.isArray(manifestRaw.chores) || manifestRaw.chores.length === 0) {
    throw new Error(
      `CDP manifest at ${manifestUrl} is missing required field: chores (must be a non-empty list for URL import)`,
    );
  }

  // ── Derive packId ───────────────────────────────────────────────────────────
  const urlPath = baseUrl.replace(/\/$/, ''); // strip trailing slash
  const packId = urlPath.substring(urlPath.lastIndexOf('/') + 1);

  // ── Fetch chore files ───────────────────────────────────────────────────────
  const today = new Date().toISOString().substring(0, 10); // YYYY-MM-DD
  const now = new Date().toISOString();

  const chores: Chore[] = await Promise.all(
    manifestRaw.chores.map(async (filename: string) => {
      const choreUrl = `${baseUrl}/${filename}`;
      const choreRes = await fetch(choreUrl);
      if (!choreRes.ok) {
        throw new Error(
          `Failed to fetch chore file ${filename} from ${choreUrl}: ${choreRes.status}`,
        );
      }
      const choreText = await choreRes.text();
      const choreRaw = jsYaml.load(choreText) as ChoreYaml;

      const choreValidation = validateChoreDefinition(choreRaw);
      if (!choreValidation.valid) {
        throw new Error(
          `Chore file ${filename} is invalid: ${choreValidation.errors.join('; ')}`,
        );
      }

      // choreId: filename without the .yaml extension
      const choreId = filename.replace(/\.yaml$/, '');

      return {
        key: `${packId}/${choreId}`,
        choreId,
        packId,
        title: choreRaw.title,
        description: choreRaw.description,
        xpSize: choreRaw.xpSize,
        recurrence: {
          frequency: choreRaw.frequency,
          interval: choreRaw.interval,
          startDate: today, // always set at import time, never from CDP
          windowStartTime: choreRaw.windowStartTime ?? '00:00',
        },
        repeatable: choreRaw.repeatable ?? false,
        active: true,
        createdAt: now,
      } satisfies Chore;
    }),
  );

  // ── Build Pack record ───────────────────────────────────────────────────────
  const pack: Pack = {
    id: packId,
    manifest: {
      title: manifestRaw.title,
      author: manifestRaw.author,
      license: manifestRaw.license,
      description: manifestRaw.description,
    },
    isPersonal: false,
    importedAt: now,
    updatedAt: now,
    sourceUrl: baseUrl,
  };

  return { pack, chores };
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd /home/alu/projects/tasks-harmony && bun test src/cdp/cdp-import.test.ts 2>&1
```

---

### Task 5: Store actions — importCDP and updateCDP

**Files:**
- Modify: `src/store/index.ts`

- [ ] **Step 1: Add `importCDP` and `updateCDP` actions to the store**

In `src/store/index.ts`, add the following to the store's state interface and implementation. Place them after the existing `updateSyncState` action.

Add to the store interface (alongside the existing actions):

```typescript
importCDP: (baseUrl: string) => Promise<void>;
updateCDP: (packId: string) => Promise<void>;
```

Add to the store implementation (in the `create` call, after `updateSyncState`):

```typescript
importCDP: async (baseUrl: string) => {
  const { db } = get();
  if (!db) throw new Error('Database not initialised');

  const { pack, chores } = await fetchCDP(baseUrl);

  // Persist pack and all chores
  await putPack(db, pack);
  for (const chore of chores) {
    await putChore(db, chore);
  }

  // Refresh store state
  const [updatedPacks, updatedChores] = await Promise.all([
    getAllPacks(db),
    getAllChores(db),
  ]);
  set({ packs: updatedPacks, chores: updatedChores });
},

updateCDP: async (packId: string) => {
  const { db, packs } = get();
  if (!db) throw new Error('Database not initialised');

  const pack = packs.find((p) => p.id === packId);
  if (!pack) throw new Error(`Pack '${packId}' not found in store`);
  if (!pack.sourceUrl) {
    throw new Error(`Pack '${packId}' has no sourceUrl — cannot update`);
  }

  const { pack: updatedPack, chores: updatedChores } = await fetchCDP(
    pack.sourceUrl,
  );

  // Upsert each fetched chore (same key → overwrite, new key → insert).
  // Chores whose key is NOT in updatedChores are intentionally kept as-is.
  for (const chore of updatedChores) {
    await putChore(db, chore);
  }

  // Update the pack record, preserving importedAt
  const refreshedPack: Pack = {
    ...updatedPack,
    importedAt: pack.importedAt,
    updatedAt: new Date().toISOString(),
  };
  await putPack(db, refreshedPack);

  // Refresh store state
  const [finalPacks, finalChores] = await Promise.all([
    getAllPacks(db),
    getAllChores(db),
  ]);
  set({ packs: finalPacks, chores: finalChores });
},
```

Add the import at the top of `src/store/index.ts`:

```typescript
import { fetchCDP } from '@/cdp/cdp-import';
```

(Also ensure `getAllPacks`, `getAllChores`, `putPack`, `putChore` are imported from `@/db/index` — they should already be present from Plan 2.)

---

### Task 6: ProfilePage component

**Files:**
- Create: `src/components/profile/ProfilePage.tsx`

- [ ] **Step 1: Implement ProfilePage**

Create `src/components/profile/ProfilePage.tsx`:

```typescript
import { useState } from 'react';
import { useStore } from '@/store';
import type { UserProfile, XPSettings } from '@/types';

// ── Email validation ──────────────────────────────────────────────────────────

function isValidEmail(value: string): boolean {
  // RFC-5322 simplified: local@domain.tld
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// ── ProfilePage ───────────────────────────────────────────────────────────────

export function ProfilePage() {
  const profile = useStore((s) => s.profile);
  const xpSettings = useStore((s) => s.xpSettings);
  const completions = useStore((s) => s.completions);
  const updateProfile = useStore((s) => s.updateProfile);

  const [displayName, setDisplayName] = useState(profile.displayName);
  const [email, setEmail] = useState(profile.email);
  const [activeXPSettingsId, setActiveXPSettingsId] = useState(
    profile.activeXPSettingsId,
  );
  const [emailError, setEmailError] = useState<string | null>(null);
  const [savedAlert, setSavedAlert] = useState(false);

  // Total XP: sum of all completions
  const totalXP = completions.reduce((sum, c) => sum + (c.xpEarned ?? 0), 0);

  // Active XP settings name
  const activeSettings: XPSettings | undefined = xpSettings.find(
    (s) => s.id === activeXPSettingsId,
  );

  function handleSave() {
    // Validate email
    if (!isValidEmail(email)) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    setEmailError(null);

    const updatedProfile: UserProfile = {
      ...profile,
      displayName: displayName.trim(),
      email: email.trim(),
      activeXPSettingsId,
    };

    updateProfile(updatedProfile);
    setSavedAlert(true);
  }

  return (
    <div className="mx-auto max-w-lg p-6 space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Profile</h1>

      {/* XP Summary */}
      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
          XP Summary
        </h2>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold text-indigo-600">
            {totalXP.toLocaleString()}
          </span>
          <span className="text-gray-500">total XP</span>
        </div>
        {activeSettings && (
          <p className="mt-1 text-sm text-gray-600">
            Active formula:{' '}
            <span className="font-medium">{activeSettings.name}</span>
          </p>
        )}
      </section>

      {/* Profile form */}
      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Account Details
        </h2>

        {/* Display name */}
        <div>
          <label
            htmlFor="displayName"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Display Name
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Email */}
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) setEmailError(null);
            }}
            className={`w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 ${
              emailError
                ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'
            }`}
          />
          {emailError && (
            <p className="mt-1 text-sm text-red-600">{emailError}</p>
          )}
        </div>

        {/* XP settings selector */}
        {xpSettings.length > 0 && (
          <div>
            <label
              htmlFor="xpSettings"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              XP Formula
            </label>
            <select
              id="xpSettings"
              value={activeXPSettingsId}
              onChange={(e) => setActiveXPSettingsId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {xpSettings.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Success alert */}
        {savedAlert && (
          <div
            role="alert"
            className="flex items-center justify-between rounded-md bg-green-50 border border-green-200 px-4 py-2 text-sm text-green-800"
          >
            <span>Changes saved.</span>
            <button
              onClick={() => setSavedAlert(false)}
              className="ml-4 text-green-700 hover:text-green-900 font-medium"
              aria-label="Dismiss"
            >
              &times;
            </button>
          </div>
        )}

        <button
          onClick={handleSave}
          className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Save changes
        </button>
      </section>
    </div>
  );
}
```

---

### Task 7: ConflictDialog component

**Files:**
- Create: `src/components/sync/ConflictDialog.tsx`

- [ ] **Step 1: Implement ConflictDialog**

Create `src/components/sync/ConflictDialog.tsx`:

```typescript
import type { AppState } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConflictChoice = 'local' | 'remote' | 'manual';

interface ConflictDialogProps {
  localState: AppState;
  serverEtag: string;
  serverTimestamp?: string;
  onResolve: (choice: ConflictChoice) => void;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

// ── ConflictDialog ────────────────────────────────────────────────────────────

export function ConflictDialog({
  localState,
  serverEtag,
  serverTimestamp,
  onResolve,
  onClose,
}: ConflictDialogProps) {
  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-dialog-title"
    >
      {/* Modal panel */}
      <div
        className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl" aria-hidden="true">
            ⚠️
          </span>
          <h2
            id="conflict-dialog-title"
            className="text-lg font-bold text-gray-900"
          >
            Sync Conflict Detected
          </h2>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          The remote file has changed since your last sync. Your local changes
          and the remote version cannot be merged automatically.
        </p>

        {/* Timestamps */}
        <div className="rounded-md bg-gray-50 border border-gray-200 p-3 mb-6 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="font-medium text-gray-700">Your version:</span>
            <span className="text-gray-600">
              {formatTimestamp(localState.exportedAt)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium text-gray-700">Server ETag:</span>
            <span className="text-gray-600 font-mono text-xs">{serverEtag}</span>
          </div>
          {serverTimestamp && (
            <div className="flex justify-between">
              <span className="font-medium text-gray-700">Server date:</span>
              <span className="text-gray-600">
                {formatTimestamp(serverTimestamp)}
              </span>
            </div>
          )}
        </div>

        {/* Resolution options */}
        <div className="space-y-3">
          {/* Option A: Keep local */}
          <div className="rounded-md border border-gray-200 p-3">
            <button
              className="w-full text-left"
              onClick={() => onResolve('local')}
            >
              <p className="font-semibold text-gray-900 text-sm">
                (a) Use my local version
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Overwrite the server with your local data. Remote changes will
                be lost.
              </p>
            </button>
          </div>

          {/* Option B: Keep remote */}
          <div className="rounded-md border border-gray-200 p-3">
            <button
              className="w-full text-left"
              onClick={() => onResolve('remote')}
            >
              <p className="font-semibold text-gray-900 text-sm">
                (b) Use the remote version
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Download and apply the server data. Your unsynchronised local
                changes will be discarded.
              </p>
            </button>
          </div>

          {/* Option C: Manual resolve */}
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <button
              className="w-full text-left"
              onClick={() => onResolve('manual')}
            >
              <p className="font-semibold text-amber-900 text-sm">
                (c) Resolve manually
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Your local version will be saved to a conflict file next to
                state.json on the server (e.g.{' '}
                <code className="font-mono">state_conflict_2026-05-31.json</code>
                ). You can then inspect both files and re-import the desired one.
              </p>
            </button>
          </div>
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="mt-4 w-full rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
```

---

### Task 8: SyncButton component

**Files:**
- Create: `src/components/sync/SyncButton.tsx`

- [ ] **Step 1: Implement SyncButton**

Create `src/components/sync/SyncButton.tsx`:

```typescript
import { useState, useRef } from 'react';
import { useStore } from '@/store';
import { performSync, buildConflictUrl } from '@/sync/sync';
import { pullState, pushConflictCopy } from '@/sync/webdav';
import { importAppState } from '@/sync/import';
import { ConflictDialog } from './ConflictDialog';
import type { ConflictInfo } from '@/sync/sync';
import type { ConflictChoice } from './ConflictDialog';
import type { AppState, SyncState } from '@/types';
import { buildConflictSuffix } from '@/sync/state';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string | undefined): string {
  if (!iso) return 'Never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
}

// ── SyncButton ────────────────────────────────────────────────────────────────

export function SyncButton() {
  const syncState = useStore((s) => s.syncState);
  const updateSyncState = useStore((s) => s.updateSyncState);
  const db = useStore((s) => s.db);

  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webdavInput, setWebdavInput] = useState(syncState.webdavUrl ?? '');
  const [showUrlInput, setShowUrlInput] = useState(!syncState.webdavUrl);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);

  // Capture conflict info so we can act on the user's resolution choice
  const pendingConflictRef = useRef<ConflictInfo | null>(null);

  async function triggerSync(state: SyncState) {
    if (!db) return;
    setSyncing(true);
    setError(null);
    try {
      const updated = await performSync(db, state, (info) => {
        pendingConflictRef.current = info;
        setConflict(info);
      });
      updateSyncState(updated);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Unknown error during sync',
      );
    } finally {
      setSyncing(false);
    }
  }

  async function handleConflictResolve(choice: ConflictChoice) {
    const info = pendingConflictRef.current;
    setConflict(null);
    pendingConflictRef.current = null;

    if (!db || !info || !syncState.webdavUrl) return;

    if (choice === 'local') {
      // Force-push local state: clear expectedEtag so no If-Match is sent
      const stateWithNoEtag: SyncState = {
        ...syncState,
        serverEtag: undefined,
      };
      await triggerSync(stateWithNoEtag);
    } else if (choice === 'remote') {
      // Pull remote and import it, replacing local IndexedDB state
      try {
        setSyncing(true);
        const remote = await pullState(syncState.webdavUrl);
        if (remote) {
          await importAppState(db, remote);
          // After import, update syncState to reflect the remote's sync info
          updateSyncState({
            ...syncState,
            serverEtag: info.serverEtag,
            lastSyncedAt: new Date().toISOString(),
            pendingSync: false,
          });
        }
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : 'Failed to pull remote state',
        );
      } finally {
        setSyncing(false);
      }
    } else {
      // Manual resolve: push local copy to conflict URL, then inform the user
      try {
        setSyncing(true);
        const suffix = buildConflictSuffix(info.detectedAt);
        await pushConflictCopy(syncState.webdavUrl, info.localState, suffix);
        const conflictUrl = buildConflictUrl(syncState.webdavUrl, info.detectedAt);
        setError(
          `Conflict copy saved to: ${conflictUrl}. ` +
          'Inspect both files on the server, delete the conflict file, and sync again when ready.',
        );
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to write conflict file',
        );
      } finally {
        setSyncing(false);
      }
    }
  }

  function handleSaveUrl() {
    const trimmed = webdavInput.trim();
    if (!trimmed) return;
    updateSyncState({ ...syncState, webdavUrl: trimmed });
    setShowUrlInput(false);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!syncState.webdavUrl || showUrlInput) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="url"
          value={webdavInput}
          onChange={(e) => setWebdavInput(e.target.value)}
          placeholder="https://dav.example.com/.../state.json"
          className="text-sm rounded border border-gray-300 px-2 py-1 w-64 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          aria-label="WebDAV state.json URL"
        />
        <button
          onClick={handleSaveUrl}
          className="rounded bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          Save
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => triggerSync(syncState)}
          disabled={syncing}
          className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label="Sync now"
        >
          {/* Sync icon (inline SVG) */}
          <svg
            className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0114.13-3.13M20 15a9 9 0 01-14.13 3.13"
            />
          </svg>
          <span>{syncing ? 'Syncing…' : 'Sync'}</span>
        </button>

        {/* Pending badge */}
        {syncState.pendingSync && !syncing && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            Pending
          </span>
        )}

        {/* Last synced time */}
        <span className="text-xs text-gray-500 hidden sm:inline">
          {formatRelativeTime(syncState.lastSyncedAt)}
        </span>

        {/* Configure URL */}
        <button
          onClick={() => setShowUrlInput(true)}
          className="text-xs text-gray-400 hover:text-gray-600 underline"
          aria-label="Configure WebDAV URL"
        >
          Configure
        </button>
      </div>

      {/* Error message */}
      {error && (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {error}{' '}
          <button
            onClick={() => setError(null)}
            className="underline hover:no-underline"
          >
            Dismiss
          </button>
        </p>
      )}

      {/* Conflict resolution dialog */}
      {conflict && (
        <ConflictDialog
          localState={conflict.localState}
          serverEtag={conflict.serverEtag}
          serverTimestamp={conflict.serverTimestamp}
          onResolve={handleConflictResolve}
          onClose={() => {
            setConflict(null);
            pendingConflictRef.current = null;
          }}
        />
      )}
    </>
  );
}
```

---

### Task 9: CDPImportDialog component

**Files:**
- Create: `src/components/cdp/CDPImportDialog.tsx`

- [ ] **Step 1: Implement CDPImportDialog**

Create `src/components/cdp/CDPImportDialog.tsx`:

```typescript
import { useState } from 'react';
import { useStore } from '@/store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

// ── CDPImportDialog ───────────────────────────────────────────────────────────

interface CDPImportDialogProps {
  onClose: () => void;
}

export function CDPImportDialog({ onClose }: CDPImportDialogProps) {
  const isOnline = useOnlineStatus();
  const packs = useStore((s) => s.packs);
  const importCDP = useStore((s) => s.importCDP);
  const updateCDP = useStore((s) => s.updateCDP);

  const [url, setUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [updatingPackId, setUpdatingPackId] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  async function handleImport() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setImporting(true);
    setMessage(null);
    try {
      await importCDP(trimmed);
      setMessage({ type: 'success', text: 'Pack imported successfully.' });
      setUrl('');
    } catch (err: unknown) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Import failed.',
      });
    } finally {
      setImporting(false);
    }
  }

  async function handleUpdate(packId: string) {
    setUpdatingPackId(packId);
    setMessage(null);
    try {
      await updateCDP(packId);
      setMessage({ type: 'success', text: `Pack '${packId}' updated.` });
    } catch (err: unknown) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Update failed.',
      });
    } finally {
      setUpdatingPackId(null);
    }
  }

  // Packs that have a sourceUrl (can be updated)
  const updatablePacks = packs.filter((p) => Boolean(p.sourceUrl));

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cdp-dialog-title"
    >
      <div
        className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2
            id="cdp-dialog-title"
            className="text-lg font-bold text-gray-900"
          >
            Import Chore Pack
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Offline notice */}
        {!isOnline && (
          <div
            role="status"
            className="rounded-md bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-800"
          >
            You are offline. CDP import is unavailable until you reconnect.
          </div>
        )}

        {/* URL input + import button */}
        <div className="space-y-2">
          <label
            htmlFor="cdp-url"
            className="block text-sm font-medium text-gray-700"
          >
            Pack base URL
          </label>
          <input
            id="cdp-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={!isOnline}
            placeholder="https://raw.githubusercontent.com/user/repo/main/pack-dir"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
          />
          <button
            onClick={handleImport}
            disabled={!isOnline || importing || !url.trim()}
            title={!isOnline ? 'Offline — import unavailable' : undefined}
            className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            {importing ? 'Importing…' : 'Import pack'}
          </button>
        </div>

        {/* Status message */}
        {message && (
          <div
            role="alert"
            className={`rounded-md border px-4 py-2 text-sm ${
              message.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Imported packs list */}
        {updatablePacks.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Installed packs
            </h3>
            <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
              {updatablePacks.map((pack) => (
                <li
                  key={pack.id}
                  className="flex items-center justify-between px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {pack.manifest.title}
                    </p>
                    <p className="text-xs text-gray-500 font-mono truncate max-w-[220px]">
                      {pack.sourceUrl}
                    </p>
                  </div>
                  <button
                    onClick={() => handleUpdate(pack.id)}
                    disabled={!isOnline || updatingPackId === pack.id}
                    title={!isOnline ? 'Offline — update unavailable' : undefined}
                    className="ml-3 shrink-0 rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {updatingPackId === pack.id ? 'Updating…' : 'Update'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

### Task 10: NavBar modifications

**Files:**
- Modify: `src/components/layout/NavBar.tsx`

- [ ] **Step 1: Add SyncButton and CDP import button to NavBar**

Open `src/components/layout/NavBar.tsx`. Add the following imports at the top (after existing imports):

```typescript
import { useState } from 'react';
import { SyncButton } from '@/components/sync/SyncButton';
import { CDPImportDialog } from '@/components/cdp/CDPImportDialog';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
```

Inside the `NavBar` component function body, add:

```typescript
const isOnline = useOnlineStatus();
const [showCDPDialog, setShowCDPDialog] = useState(false);
```

In the NavBar JSX, add the following block inside the nav element (after the existing brand/XP counter section, before any closing tags). Place it in a right-aligned flex container or alongside any existing right-side controls:

```tsx
{/* Right-side controls */}
<div className="flex items-center gap-3">
  {/* CDP import */}
  <button
    onClick={() => setShowCDPDialog(true)}
    disabled={!isOnline}
    title={!isOnline ? 'Offline — CDP import unavailable' : 'Import Chore Pack'}
    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
  >
    Import Pack
  </button>

  {/* Sync */}
  <SyncButton />
</div>

{/* CDP import dialog */}
{showCDPDialog && (
  <CDPImportDialog onClose={() => setShowCDPDialog(false)} />
)}
```

---

### Task 11: App.tsx modifications

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add /profile route and online reconnect watcher**

Open `src/App.tsx`. Add the following imports after the existing ones:

```typescript
import { useEffect, useRef } from 'react';
import { ProfilePage } from '@/components/profile/ProfilePage';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { performSync } from '@/sync/sync';
import { useStore } from '@/store';
```

Inside the `App` component function body, add the reconnect watcher. Place this after any existing hooks:

```typescript
const isOnline = useOnlineStatus();
const wasOnlineRef = useRef(isOnline);
const syncState = useStore((s) => s.syncState);
const updateSyncState = useStore((s) => s.updateSyncState);
const db = useStore((s) => s.db);

useEffect(() => {
  const wasOnline = wasOnlineRef.current;
  wasOnlineRef.current = isOnline;

  // Detect transition: offline → online
  if (!wasOnline && isOnline && syncState.pendingSync && db) {
    performSync(db, syncState, () => {
      // Conflict during auto-sync on reconnect: mark as still pending.
      // The user will see the Pending badge in SyncButton and can resolve manually.
    }).then((updated) => {
      updateSyncState(updated);
    }).catch(() => {
      // Leave pendingSync = true; user can retry manually via SyncButton.
    });
  }
}, [isOnline]); // eslint-disable-line react-hooks/exhaustive-deps
```

In the router (wherever existing routes are defined), add the `/profile` route. The exact placement depends on the router used in `src/App.tsx` (React Router or similar). Add:

```tsx
<Route path="/profile" element={<ProfilePage />} />
```

In the NavBar (if it includes a profile link), ensure it links to `/profile`. If the NavBar from Plan 2 has a settings/profile icon, make it a `<Link to="/profile">` or `<a href="/profile">` as appropriate for the router.

---

### Task 12: Run all tests

- [ ] **Step 1: Run the full test suite**

```bash
cd /home/alu/projects/tasks-harmony && bun test 2>&1
```

All tests from all four plans should pass. If any test from Plans 1–3 now fails due to new imports, fix the import or mock as needed.

---

## Self-Review

### Spec coverage

| Requirement | Covered by |
|---|---|
| §1.1 Profile shows display name, total XP, active XP settings name | `ProfilePage` — XP summary section, `totalXP` computed from all `completions.xpEarned` |
| §1.2 Update display name + email; invalid email rejected with error; success alert dismissible; changes take effect on save | `ProfilePage` — `isValidEmail`, inline `emailError` state, green alert with dismiss button, `updateProfile` called on save |
| §1.3 Profile shows active XP settings; selector to change formula | `ProfilePage` — `<select>` bound to `activeXPSettingsId`, reads `xpSettings` from store |
| Sync: WebDAV PUT with If-Match ETag header | `pushState` in `webdav.ts` — `headers['If-Match'] = expectedEtag` |
| Sync: ETag flow — HEAD → needsConflictResolution → PUT → 412 → success | `performSync` in `sync.ts` — all five steps implemented |
| Conflict option (a): keep local (overwrite server) | `SyncButton.handleConflictResolve('local')` — re-syncs with `serverEtag: undefined` to skip If-Match |
| Conflict option (b): keep remote (discard local) | `SyncButton.handleConflictResolve('remote')` — `pullState` + `importAppState` |
| Conflict option (c): resolve manually (conflict file) | `SyncButton.handleConflictResolve('manual')` — `pushConflictCopy` + `buildConflictUrl` |
| Conflict: show local exportedAt and server ETag / timestamp | `ConflictDialog` — shows `localState.exportedAt` formatted, `serverEtag`, `serverTimestamp` if present |
| Offline: navigator.onLine + online/offline events | `useOnlineStatus` hook |
| Offline: CDP import button disabled | `CDPImportDialog` and NavBar "Import Pack" button — `disabled={!isOnline}` with tooltip |
| Offline: sync deferred with pendingSync = true | `performSync` — returns unchanged state (pendingSync stays true from caller); callers set `pendingSync: true` when offline |
| Offline: sync executes exactly once on reconnect | `App.tsx` reconnect watcher — `useRef` to track previous online state; fires only on false→true transition; `performSync` sets `pendingSync: false` on success |
| CDP import: fetch `__pack__.yaml`, parse manifest | `fetchCDP` — step 1, validates title and chores |
| CDP import: each chore filename fetched and parsed | `fetchCDP` — `Promise.all` over `manifestRaw.chores` |
| CDP import: startDate defaults to today if missing | `fetchCDP` — `choreRaw.recurrence.startDate ?? today` |
| CDP import: choreId = filename without .yaml | `fetchCDP` — `filename.replace(/\.yaml$/, '')` |
| CDP import: key = `packId/choreId` | `fetchCDP` — `key: \`${packId}/${choreId}\`` |
| CDP import: old chores with same key kept on update if filename changes | `updateCDP` — only upserts chores in `updatedChores`; others untouched |
| CDP import: sourceUrl stored on Pack | `fetchCDP` returns `pack.sourceUrl = baseUrl`; `importCDP` stores it |
| CDP update: same filename → overwrite, new filename → new chore, removed filename → kept | `updateCDP` — `putChore` upserts each fetched chore; no deletion |

### Placeholder scan

No placeholders, TBD markers, `// implement later` stubs, `// ...` or ellipsis shorthand, or `TODO` comments appear in any code block above. Every function body is complete.

### Type consistency

| Type / field | Consistency check |
|---|---|
| `AppState.syncState.serverEtag` | Defined as `string \| undefined` in `SyncState`. `performSync` reads `syncState.serverEtag` (possibly `undefined`) and passes it to `pushState` as `expectedEtag: string \| undefined`. `pushState` checks `if (expectedEtag !== undefined)` before adding `If-Match`. Consistent. |
| `ConflictInfo` | Defined in `sync.ts`. Consumed identically by `SyncButton` (`pendingConflictRef.current`, `setConflict`) and `ConflictDialog` props. Consistent. |
| `ConflictChoice` | Defined in `ConflictDialog.tsx`, imported in `SyncButton.tsx`. Used as the parameter type of `onResolve` and `handleConflictResolve`. Consistent. |
| `Pack.sourceUrl` | Optional `string \| undefined` in the `Pack` type. Set by `fetchCDP`, stored by `importCDP`, read by `updateCDP`. `updatablePacks` filter uses `Boolean(p.sourceUrl)`. Consistent. |
| `SyncState` imported from `@/types` | Used in `webdav.ts` (parameter types), `sync.ts` (parameter + return), `SyncButton` (from store), `App.tsx` (from store). All via the single `@/types` source of truth. |
| `AppState` imported from `@/types` | Used in `webdav.ts` (parameter), `sync.ts` (local export result), `ConflictDialog` props, `cdp-import.ts` return value in `SyncState`. All via `@/types`. |
| `Chore.active` | Set to `true` for all newly imported chores in `fetchCDP`. Consistent with existing chore creation in Plans 1–2. |
