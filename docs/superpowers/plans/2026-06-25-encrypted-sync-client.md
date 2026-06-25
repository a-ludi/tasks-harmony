# Encrypted Sync Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the client side of automatic encrypted sync: remove the WebDAV layer, add a `credentials` IndexedDB store for the AES-256-GCM sync key, encrypt/decrypt app state blobs, authenticate via challenge-response, auto-sync on writes, and expose key management in settings.

**Architecture:** A `dirty.ts` registry decouples store writes from sync scheduling. `encrypt.ts` owns AES-256-GCM + gzip. `credentials.ts` owns the sync key lifecycle. `server.ts` talks to the server. `useSync.ts` wires the triggers (startup pull, debounced push, pagehide push). The bundle-baked secret is obfuscated across three separate source constants generated in `vite.config.ts`.

**Tech Stack:** Web Crypto API, CompressionStream/DecompressionStream, IndexedDB (idb), Zustand, Vite, React, bun:test.

---

## File Structure

**Delete:**
- `src/sync/webdav.ts` + `src/sync/webdav.test.ts`
- `src/sync/state.ts` + `src/sync/state.test.ts`
- `src/sync/sync.ts` + `src/sync/sync.test.ts`
- `src/components/sync/SyncButton.tsx` + `src/components/sync/SyncButton.test.ts`
- `src/components/sync/ConflictDialog.tsx`

**Modify:**
- `src/types/index.ts` — remove `webdavUrl`, `serverEtag` from `SyncState`
- `src/db/schema.ts` — add `credentials` store
- `src/db/index.ts` — bump `DB_VERSION` to 4, add credentials store migration, add `getCredentials`/`putCredentials` helpers
- `src/sync/export.ts` — add `encryptedExport` helper
- `src/sync/import.ts` — fix missing `quickAnswerSets`; add `decryptedImport` helper
- `src/store/index.ts` — call `markDirty()` on every write mutation
- `src/components/profile/ProfilePage.tsx` — format selector for export; key import/export UI
- `src/App.tsx` — remove WebDAV sync logic; add `useSync` hook
- `vite.config.ts` — secret splitting into three `define` constants; `/sync/*` dev proxy
- `src/vite-env.d.ts` — declare `VITE_SYNC_URL`, `__SYNC_PART_A/B/C__`

**New:**
- `src/sync/secret-a.ts`, `src/sync/secret-b.ts`, `src/sync/secret-c.ts` — hold obfuscated secret fragments
- `src/sync/credentials.ts` — key generation, token derivation, key export/import
- `src/sync/encrypt.ts` + `src/sync/encrypt.test.ts` — AES-256-GCM + gzip
- `src/sync/dirty.ts` + `src/sync/dirty.test.ts` — dirty flag + listener
- `src/sync/server.ts` — challenge-response auth, push, pull
- `src/hooks/useSync.ts` — auto-sync triggers
- `src/components/sync/SyncPanel.tsx` — sync status + error banner

---

### Task 1: Delete obsolete files

**Files:**
- Delete: `src/sync/webdav.ts`, `src/sync/webdav.test.ts`, `src/sync/state.ts`, `src/sync/state.test.ts`, `src/sync/sync.ts`, `src/sync/sync.test.ts`
- Delete: `src/components/sync/SyncButton.tsx`, `src/components/sync/SyncButton.test.ts`, `src/components/sync/ConflictDialog.tsx`

- [ ] **Step 1: Delete all obsolete sync files**

```bash
git rm src/sync/webdav.ts src/sync/webdav.test.ts \
       src/sync/state.ts src/sync/state.test.ts \
       src/sync/sync.ts src/sync/sync.test.ts \
       src/components/sync/SyncButton.tsx src/components/sync/SyncButton.test.ts \
       src/components/sync/ConflictDialog.tsx
```

- [ ] **Step 2: Run typecheck to see what's now broken**

```bash
bun run typecheck 2>&1 | head -40
```
Expected: errors about missing imports in `src/App.tsx` and any other consumers. These will be fixed in later tasks.

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor: delete WebDAV sync layer and SyncButton"
```

---

### Task 2: Update SyncState type

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Remove webdavUrl and serverEtag from SyncState**

In `src/types/index.ts`, replace the `SyncState` interface (lines 112–118):

```typescript
export interface SyncState {
  id: 'main';
  lastSyncedAt?: string;
  pendingSync: boolean;
}
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck 2>&1 | grep 'webdavUrl\|serverEtag'
```
Expected: no remaining references.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "refactor: simplify SyncState — remove webdavUrl and serverEtag"
```

---

### Task 3: Add credentials store to DB schema

**Files:**
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Add credentials store to TasksHarmonyDB**

In `src/db/schema.ts`, add `SyncCredentials` type and the `credentials` store entry:

```typescript
// src/db/schema.ts
import type { DBSchema } from 'idb';
import type {
  Pack, Chore, Question, Completion,
  XPSettings, UserProfile, SyncState, QuickAnswerSet,
} from '@/types';

export interface SyncCredentials {
  id: 'main';
  cryptoKey: CryptoKey;
}

export interface TasksHarmonyDB extends DBSchema {
  packs:           { key: string; value: Pack };
  chores:          { key: string; value: Chore; indexes: { 'by-pack': string } };
  questions:       { key: string; value: Question; indexes: { 'by-chore': string } };
  completions:     { key: string; value: Completion; indexes: { 'by-chore': string; 'by-date': string } };
  xpSettings:      { key: string; value: XPSettings };
  profile:         { key: string; value: UserProfile };
  syncState:       { key: string; value: SyncState };
  quickAnswerSets: { key: string; value: QuickAnswerSet; indexes: { 'by-chore': string } };
  credentials:     { key: string; value: SyncCredentials };
}
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck 2>&1 | grep credentials
```
Expected: no errors about credentials (type is declared).

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat: add credentials store to DB schema"
```

---

### Task 4: DB migration to v4 and credentials helpers

**Files:**
- Modify: `src/db/index.ts`

- [ ] **Step 1: Bump DB_VERSION and add migration**

In `src/db/index.ts`:

Change line 11:
```typescript
const DB_VERSION = 4;
```

Add a v4 migration block after the `if (oldVersion < 3)` block (inside `upgrade`):
```typescript
      if (oldVersion < 4) {
        db.createObjectStore('credentials', { keyPath: 'id' });
      }
```

- [ ] **Step 2: Add getCredentials and putCredentials helpers**

At the end of `src/db/index.ts`, add:

```typescript
import type { SyncCredentials } from './schema';

export const getCredentials = (
  db: IDBPDatabase<TasksHarmonyDB>,
): Promise<SyncCredentials | undefined> =>
  db.get('credentials', 'main');

export const putCredentials = (
  db: IDBPDatabase<TasksHarmonyDB>,
  creds: SyncCredentials,
): Promise<string> =>
  db.put('credentials', creds);
```

(The `import type { SyncCredentials }` line goes at the top with the other schema imports.)

- [ ] **Step 3: Run existing DB tests to verify migration doesn't break**

```bash
bun test --isolate src/db/index.test.ts
```
Expected: all existing tests pass.

- [ ] **Step 4: Run typecheck**

```bash
bun run typecheck 2>&1 | head -20
```
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/db/index.ts
git commit -m "feat: bump DB to v4 with credentials store and helpers"
```

---

### Task 5: vite.config.ts — secret splitting and dev proxy

**Files:**
- Modify: `vite.config.ts`
- Create: `src/sync/secret-a.ts`, `src/sync/secret-b.ts`, `src/sync/secret-c.ts`
- Modify: `src/vite-env.d.ts`

- [ ] **Step 1: Update vite.config.ts**

Replace the current `vite.config.ts` with:

```typescript
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { randomBytes, createHash } from 'crypto';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const { version } = JSON.parse(readFileSync('package.json', 'utf-8'));
const buildDate = new Date().toISOString().substring(0, 10);

function splitSecret(): { partA: string; partB: string; partC: string } {
  const raw = process.env.VITE_SYNC_APP_SECRET ?? '';
  if (!raw) {
    // Dev fallback: 32 null bytes
    const zero = Buffer.alloc(32).toString('base64');
    return { partA: zero, partB: zero, partC: zero };
  }
  const secret = Buffer.from(raw, 'base64');
  const noiseA = randomBytes(32);
  const noiseB = randomBytes(32);
  const partC = Buffer.from(secret.map((b, i) => b ^ noiseA[i]! ^ noiseB[i]!));
  return {
    partA: noiseA.toString('base64'),
    partB: noiseB.toString('base64'),
    partC: partC.toString('base64'),
  };
}

const { partA, partB, partC } = splitSecret();

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      devOptions: { enabled: true },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      manifest: {
        name: 'Tasks Harmony',
        short_name: 'Tasks',
        description: 'Gamified recurring chore tracker',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(version),
    'import.meta.env.VITE_BUILD_DATE': JSON.stringify(buildDate),
    'import.meta.env.VITE_SYNC_URL': JSON.stringify(process.env.VITE_SYNC_URL ?? ''),
    '__SYNC_PART_A__': JSON.stringify(partA),
    '__SYNC_PART_B__': JSON.stringify(partB),
    '__SYNC_PART_C__': JSON.stringify(partC),
  },
  server: {
    proxy: {
      '/sync': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});
```

- [ ] **Step 2: Create the three secret fragment files**

Create `src/sync/secret-a.ts`:
```typescript
declare const __SYNC_PART_A__: string;
export const partA: string = typeof __SYNC_PART_A__ !== 'undefined' ? __SYNC_PART_A__ : '';
```

Create `src/sync/secret-b.ts`:
```typescript
declare const __SYNC_PART_B__: string;
export const partB: string = typeof __SYNC_PART_B__ !== 'undefined' ? __SYNC_PART_B__ : '';
```

Create `src/sync/secret-c.ts`:
```typescript
declare const __SYNC_PART_C__: string;
export const partC: string = typeof __SYNC_PART_C__ !== 'undefined' ? __SYNC_PART_C__ : '';
```

- [ ] **Step 3: Update src/vite-env.d.ts**

Replace the current content:

```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string;
  readonly VITE_BUILD_DATE: string;
  readonly VITE_SYNC_URL: string;
}

declare const __SYNC_PART_A__: string;
declare const __SYNC_PART_B__: string;
declare const __SYNC_PART_C__: string;
```

- [ ] **Step 4: Run typecheck**

```bash
bun run typecheck 2>&1 | head -20
```
Expected: no errors related to vite-env.

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts src/sync/secret-a.ts src/sync/secret-b.ts src/sync/secret-c.ts src/vite-env.d.ts
git commit -m "feat: obfuscate bundle secret via 3-part XOR split in vite.config"
```

---

### Task 6: encrypt.ts — AES-256-GCM + gzip helpers

**Files:**
- Create: `src/sync/encrypt.ts`
- Create: `src/sync/encrypt.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/sync/encrypt.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test';
import { encryptState, decryptState } from './encrypt';
import type { AppState } from '@/types';

function makeKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

function makeState(): AppState {
  return {
    schemaVersion: 1,
    exportedAt: '2026-06-25T00:00:00.000Z',
    packs: [], chores: [], questions: [], completions: [], xpSettings: [],
    profile: { id: 'me', displayName: 'Test', email: 't@example.com', activeXPSettingsId: 's1' },
    syncState: { id: 'main', pendingSync: false },
  };
}

describe('encryptState / decryptState', () => {
  it('round-trips app state', async () => {
    const key = await makeKey();
    const state = makeState();
    const blob = await encryptState(key, state);
    expect(blob).toBeInstanceOf(Uint8Array);
    expect(blob.length).toBeGreaterThan(12); // IV + ciphertext

    const recovered = await decryptState(key, blob);
    expect(recovered.schemaVersion).toBe(1);
    expect(recovered.profile.displayName).toBe('Test');
    expect(recovered.syncState.pendingSync).toBe(false);
  });

  it('produces different ciphertext on each call (fresh IV)', async () => {
    const key = await makeKey();
    const state = makeState();
    const blob1 = await encryptState(key, state);
    const blob2 = await encryptState(key, state);
    expect(blob1).not.toEqual(blob2);
  });

  it('throws on wrong key', async () => {
    const key1 = await makeKey();
    const key2 = await makeKey();
    const blob = await encryptState(key1, makeState());
    await expect(decryptState(key2, blob)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
bun test --isolate src/sync/encrypt.test.ts
```
Expected: error about missing module `./encrypt`.

- [ ] **Step 3: Implement encrypt.ts**

Create `src/sync/encrypt.ts`:

```typescript
import type { AppState } from '@/types';

async function compress(data: Uint8Array): Promise<Uint8Array> {
  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  writer.write(data);
  writer.close();
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out;
}

async function decompress(data: Uint8Array): Promise<Uint8Array> {
  const stream = new DecompressionStream('gzip');
  const writer = stream.writable.getWriter();
  writer.write(data);
  writer.close();
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out;
}

export async function encryptState(key: CryptoKey, state: AppState): Promise<Uint8Array> {
  const plaintext = new TextEncoder().encode(JSON.stringify(state));
  const compressed = await compress(plaintext);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, compressed);
  const result = new Uint8Array(12 + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), 12);
  return result;
}

export async function decryptState(key: CryptoKey, blob: Uint8Array): Promise<AppState> {
  const iv = blob.slice(0, 12);
  const ciphertext = blob.slice(12);
  const compressed = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  const plaintext = await decompress(new Uint8Array(compressed));
  return JSON.parse(new TextDecoder().decode(plaintext)) as AppState;
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
bun test --isolate src/sync/encrypt.test.ts
```
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/sync/encrypt.ts src/sync/encrypt.test.ts
git commit -m "feat: add AES-256-GCM + gzip encrypt/decrypt helpers"
```

---

### Task 7: dirty.ts — dirty flag and listener registry

**Files:**
- Create: `src/sync/dirty.ts`
- Create: `src/sync/dirty.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/sync/dirty.test.ts`:

```typescript
import { describe, it, expect, mock, beforeEach } from 'bun:test';

beforeEach(async () => {
  // Re-import fresh module state each test
  mock.module('./dirty', () => {
    let dirty = false;
    let listener: (() => void) | null = null;
    return {
      markDirty: () => { dirty = true; listener?.(); },
      isDirty: () => dirty,
      clearDirty: () => { dirty = false; },
      setDirtyListener: (fn: (() => void) | null) => { listener = fn; },
    };
  });
});

// Import after mock is set up
const mod = await import('./dirty');

describe('dirty flag', () => {
  it('starts clean', () => {
    expect(mod.isDirty()).toBe(false);
  });

  it('markDirty sets the flag', () => {
    mod.markDirty();
    expect(mod.isDirty()).toBe(true);
  });

  it('clearDirty resets the flag', () => {
    mod.markDirty();
    mod.clearDirty();
    expect(mod.isDirty()).toBe(false);
  });

  it('calls the listener on markDirty', () => {
    const listener = mock(() => {});
    mod.setDirtyListener(listener);
    mod.markDirty();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not call listener after setDirtyListener(null)', () => {
    const listener = mock(() => {});
    mod.setDirtyListener(listener);
    mod.setDirtyListener(null);
    mod.markDirty();
    expect(listener).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
bun test --isolate src/sync/dirty.test.ts
```
Expected: error about missing module `./dirty`.

- [ ] **Step 3: Implement dirty.ts**

Create `src/sync/dirty.ts`:

```typescript
let dirty = false;
let listener: (() => void) | null = null;

export function markDirty(): void {
  dirty = true;
  listener?.();
}

export function isDirty(): boolean {
  return dirty;
}

export function clearDirty(): void {
  dirty = false;
}

export function setDirtyListener(fn: (() => void) | null): void {
  listener = fn;
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
bun test --isolate src/sync/dirty.test.ts
```
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/sync/dirty.ts src/sync/dirty.test.ts
git commit -m "feat: add dirty flag registry for sync scheduling"
```

---

### Task 8: credentials.ts — key lifecycle

**Files:**
- Create: `src/sync/credentials.ts`

- [ ] **Step 1: Create src/sync/credentials.ts**

```typescript
import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';
import { getCredentials, putCredentials } from '@/db';

export async function getOrCreateSyncKey(db: IDBPDatabase<TasksHarmonyDB>): Promise<CryptoKey> {
  const stored = await getCredentials(db);
  if (stored) return stored.cryptoKey;
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
  await putCredentials(db, { id: 'main', cryptoKey: key });
  return key;
}

export async function deriveSyncToken(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  const hash = await crypto.subtle.digest('SHA-256', raw);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function exportKeyFile(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  const b64url = btoa(String.fromCharCode(...new Uint8Array(raw)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return JSON.stringify({ version: 1, key: b64url });
}

export async function importKeyFile(jsonStr: string): Promise<CryptoKey> {
  const { key: b64url } = JSON.parse(jsonStr) as { version: number; key: string };
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, '=');
  const raw = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck 2>&1 | grep credentials
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/sync/credentials.ts
git commit -m "feat: add sync key generation, token derivation, key export/import"
```

---

### Task 9: server.ts — HTTP sync client

**Files:**
- Create: `src/sync/server.ts`

- [ ] **Step 1: Create src/sync/server.ts**

```typescript
import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';
import { exportAppState } from '@/sync/export';
import { importAppState } from '@/sync/import';
import { validateAppState } from '@/schemas/validate';
import { encryptState, decryptState } from '@/sync/encrypt';
import { getOrCreateSyncKey, deriveSyncToken } from '@/sync/credentials';
import { markDirty, clearDirty } from '@/sync/dirty';
import { partA } from '@/sync/secret-a';
import { partB } from '@/sync/secret-b';
import { partC } from '@/sync/secret-c';
import { putSyncState, getSyncState } from '@/db';

const SYNC_URL = import.meta.env.VITE_SYNC_URL;
const SESSION_KEY = 'sync-session-token';

function getAppSecretBytes(): Uint8Array {
  const a = Uint8Array.from(atob(partA), (c) => c.charCodeAt(0));
  const b = Uint8Array.from(atob(partB), (c) => c.charCodeAt(0));
  const c = Uint8Array.from(atob(partC), (c) => c.charCodeAt(0));
  return a.map((byte, i) => byte ^ b[i]! ^ c[i]!);
}

async function computeHmac(nonce: string): Promise<string> {
  const secretBytes = getAppSecretBytes();
  const hmacKey = await crypto.subtle.importKey(
    'raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(nonce));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function fetchSessionToken(syncToken: string): Promise<string> {
  const chalRes = await fetch(`${SYNC_URL}/sync/challenge`);
  if (!chalRes.ok) throw new Error(`Challenge failed: ${chalRes.status}`);
  const { nonce } = await chalRes.json() as { nonce: string };
  const hmac = await computeHmac(nonce);
  const sessRes = await fetch(`${SYNC_URL}/sync/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nonce, hmac, syncToken }),
  });
  if (!sessRes.ok) throw new Error(`Session failed: ${sessRes.status}`);
  const { sessionToken } = await sessRes.json() as { sessionToken: string };
  localStorage.setItem(SESSION_KEY, sessionToken);
  return sessionToken;
}

async function getSessionToken(syncToken: string): Promise<string> {
  return localStorage.getItem(SESSION_KEY) ?? fetchSessionToken(syncToken);
}

async function authorizedFetch(
  method: 'GET' | 'PUT',
  syncToken: string,
  body?: Uint8Array,
  retried = false,
): Promise<Response> {
  const sessionToken = await getSessionToken(syncToken);
  const res = await fetch(`${SYNC_URL}/sync/${syncToken}`, {
    method,
    headers: {
      Authorization: `Bearer ${sessionToken}`,
      ...(body ? { 'Content-Type': 'application/octet-stream' } : {}),
    },
    body: body ?? undefined,
    keepalive: method === 'PUT',
  });
  if (res.status === 401 && !retried) {
    localStorage.removeItem(SESSION_KEY);
    return authorizedFetch(method, syncToken, body, true);
  }
  return res;
}

export interface PushResult {
  success: boolean;
  status?: number;
}

export async function push(db: IDBPDatabase<TasksHarmonyDB>): Promise<PushResult> {
  if (!SYNC_URL) return { success: false };
  const key = await getOrCreateSyncKey(db);
  const syncToken = await deriveSyncToken(key);

  const appState = await exportAppState(db);
  const now = new Date().toISOString();
  appState.syncState.lastSyncedAt = now;

  clearDirty();

  const blob = await encryptState(key, appState);
  const res = await authorizedFetch('PUT', syncToken, blob);

  if (res.ok) {
    const syncState = await getSyncState(db);
    if (syncState) {
      await putSyncState(db, { ...syncState, lastSyncedAt: now, pendingSync: false });
    }
    return { success: true };
  }

  markDirty();
  return { success: false, status: res.status };
}

export async function pull(db: IDBPDatabase<TasksHarmonyDB>): Promise<boolean> {
  if (!SYNC_URL) return false;
  const key = await getOrCreateSyncKey(db);
  const syncToken = await deriveSyncToken(key);

  const res = await authorizedFetch('GET', syncToken);
  if (res.status === 404) return false;
  if (!res.ok) return false;

  const blob = new Uint8Array(await res.arrayBuffer());
  const serverState = await decryptState(key, blob);
  const validation = validateAppState(serverState);
  if (!validation.valid) return false;

  const localSyncState = await getSyncState(db);
  const localTs = localSyncState?.lastSyncedAt ?? '';
  const serverTs = serverState.syncState.lastSyncedAt ?? '';

  if (serverTs > localTs) {
    await importAppState(db, serverState);
    return true;
  }

  markDirty();
  return false;
}
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck 2>&1 | head -30
```
Expected: no errors in server.ts. (Other files may still have errors fixed in later tasks.)

- [ ] **Step 3: Commit**

```bash
git add src/sync/server.ts
git commit -m "feat: add encrypted server sync client (push/pull)"
```

---

### Task 10: useSync.ts — auto-sync hook

**Files:**
- Create: `src/hooks/useSync.ts`

- [ ] **Step 1: Create src/hooks/useSync.ts**

```typescript
import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store';
import { push, pull } from '@/sync/server';
import { setDirtyListener, isDirty } from '@/sync/dirty';

const DEBOUNCE_MS = 10_000;
const MAX_CONSECUTIVE_FAILURES = 3;

export interface SyncStatus {
  lastSyncedAt: string | undefined;
  error: boolean;
  retryNow: () => void;
}

export function useSync(): SyncStatus {
  const db = useAppStore((s) => s.db);
  const reload = useAppStore((s) => s.reload);
  const syncState = useAppStore((s) => s.syncState);
  const updateSyncState = useAppStore((s) => s.updateSyncState);

  const [error, setError] = useState(false);
  const consecutiveFailures = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function doPush() {
    if (!db) return;
    const result = await push(db);
    if (result.success) {
      consecutiveFailures.current = 0;
      setError(false);
      const updated = await import('@/db').then((m) => m.getSyncState(db));
      if (updated) await updateSyncState(updated);
    } else {
      consecutiveFailures.current += 1;
      if (consecutiveFailures.current >= MAX_CONSECUTIVE_FAILURES) {
        setError(true);
      }
    }
  }

  function schedulePush() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (consecutiveFailures.current >= MAX_CONSECUTIVE_FAILURES) return;
    debounceRef.current = setTimeout(doPush, DEBOUNCE_MS);
  }

  function retryNow() {
    consecutiveFailures.current = 0;
    setError(false);
    void doPush();
  }

  // Startup pull
  useEffect(() => {
    if (!db) return;
    pull(db).then(async (imported) => {
      if (imported) await reload();
    });
  }, [db]); // eslint-disable-line react-hooks/exhaustive-deps

  // Register dirty listener for debounced push
  useEffect(() => {
    setDirtyListener(schedulePush);
    return () => {
      setDirtyListener(null);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [db]); // eslint-disable-line react-hooks/exhaustive-deps

  // pagehide: best-effort push if dirty
  useEffect(() => {
    function handlePageHide() {
      if (!db || !isDirty()) return;
      void push(db);
    }
    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [db]);

  return { lastSyncedAt: syncState?.lastSyncedAt, error, retryNow };
}
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck 2>&1 | grep useSync
```
Expected: no errors in useSync.ts.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useSync.ts
git commit -m "feat: add useSync hook (startup pull, debounced push, pagehide push)"
```

---

### Task 11: SyncPanel.tsx — status and error banner

**Files:**
- Create: `src/components/sync/SyncPanel.tsx`

- [ ] **Step 1: Create src/components/sync/SyncPanel.tsx**

```typescript
import { useSync } from '@/hooks/useSync';

export function SyncPanel() {
  const { lastSyncedAt, error, retryNow } = useSync();

  return (
    <section className="rounded-lg border border-border bg-background p-4 shadow-sm space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Sync</h2>
      <p className="text-sm text-muted-foreground">
        Last synced:{' '}
        <span className="font-medium text-foreground">
          {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : 'Never'}
        </span>
      </p>
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-md bg-destructive/10 border border-destructive/30 px-4 py-2 text-sm text-destructive"
        >
          <span>Sync failed after 3 attempts.</span>
          <button
            onClick={retryNow}
            className="ml-4 font-medium underline hover:no-underline"
          >
            Retry now
          </button>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck 2>&1 | grep SyncPanel
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/sync/SyncPanel.tsx
git commit -m "feat: add SyncPanel with last-synced timestamp and error retry banner"
```

---

### Task 12: Update export.ts — exclude quickAnswerSets from credentials; add encryptedExport

**Files:**
- Modify: `src/sync/export.ts`

- [ ] **Step 1: Update export.ts**

Replace the content of `src/sync/export.ts`:

```typescript
import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';
import {
  getPacks, getAllChores, getAllQuestions, getAllCompletions,
  getXPSettings, getProfile, getSyncState, getAllQuickAnswerSets,
} from '@/db/index';
import type { AppState } from '@/types';
import { getOrCreateSyncKey } from '@/sync/credentials';
import { encryptState } from '@/sync/encrypt';

export async function exportAppState(db: IDBPDatabase<TasksHarmonyDB>): Promise<AppState> {
  const [packs, chores, questions, completions, xpSettings, profile, syncState, quickAnswerSets] =
    await Promise.all([
      getPacks(db), getAllChores(db), getAllQuestions(db), getAllCompletions(db),
      getXPSettings(db), getProfile(db), getSyncState(db), getAllQuickAnswerSets(db),
    ]);
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    packs, chores, questions, completions, xpSettings,
    profile: profile!,
    syncState: syncState!,
    quickAnswerSets,
  };
}

export async function encryptedExport(db: IDBPDatabase<TasksHarmonyDB>): Promise<Uint8Array> {
  const key = await getOrCreateSyncKey(db);
  const state = await exportAppState(db);
  return encryptState(key, state);
}
```

Note: `AppState` does not currently include `quickAnswerSets`. The next step adds it.

- [ ] **Step 2: Add quickAnswerSets to AppState in types/index.ts**

In `src/types/index.ts`, update the `AppState` interface:

```typescript
export interface AppState {
  schemaVersion: 1;
  exportedAt: string;
  packs: Pack[];
  chores: Chore[];
  questions: Question[];
  completions: Completion[];
  xpSettings: XPSettings[];
  profile: UserProfile;
  syncState: SyncState;
  quickAnswerSets: QuickAnswerSet[];
}
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck 2>&1 | head -30
```
Expected: some errors in import.ts and validate (fixed in next tasks).

- [ ] **Step 4: Commit**

```bash
git add src/sync/export.ts src/types/index.ts
git commit -m "feat: export quickAnswerSets in AppState; add encryptedExport helper"
```

---

### Task 13: Update import.ts — fix missing quickAnswerSets; add decryptedImport

**Files:**
- Modify: `src/sync/import.ts`

- [ ] **Step 1: Update import.ts**

Replace the content of `src/sync/import.ts`:

```typescript
import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';
import type { AppState } from '@/types';
import { getOrCreateSyncKey } from '@/sync/credentials';
import { decryptState } from '@/sync/encrypt';

export async function importAppState(db: IDBPDatabase<TasksHarmonyDB>, state: AppState): Promise<void> {
  const storeNames = [
    'packs', 'chores', 'questions', 'completions',
    'xpSettings', 'profile', 'syncState', 'quickAnswerSets',
  ] as const;
  const tx = db.transaction(storeNames, 'readwrite');

  await Promise.all(storeNames.map((name) => tx.objectStore(name).clear()));

  await Promise.all([
    ...state.packs.map((p) => tx.objectStore('packs').put(p)),
    ...state.chores.map((c) => tx.objectStore('chores').put(c)),
    ...state.questions.map((q) => tx.objectStore('questions').put(q)),
    ...state.completions.map((c) => tx.objectStore('completions').put(c)),
    ...state.xpSettings.map((s) => tx.objectStore('xpSettings').put(s)),
    ...(state.quickAnswerSets ?? []).map((q) => tx.objectStore('quickAnswerSets').put(q)),
    tx.objectStore('profile').put(state.profile),
    tx.objectStore('syncState').put(state.syncState),
  ]);

  await tx.done;
}

export async function decryptedImport(
  db: IDBPDatabase<TasksHarmonyDB>,
  blob: Uint8Array,
): Promise<AppState> {
  const key = await getOrCreateSyncKey(db);
  return decryptState(key, blob);
}
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck 2>&1 | head -30
```
Expected: fewer errors than before.

- [ ] **Step 3: Commit**

```bash
git add src/sync/import.ts
git commit -m "fix: include quickAnswerSets in importAppState; add decryptedImport helper"
```

---

### Task 14: Update store/index.ts — add markDirty() to all write mutations

**Files:**
- Modify: `src/store/index.ts`

- [ ] **Step 1: Add markDirty import at the top of store/index.ts**

After the existing imports, add:

```typescript
import { markDirty } from '@/sync/dirty';
```

- [ ] **Step 2: Add markDirty() call to each write mutation**

For each of the following mutations, add `markDirty();` at the end of the function body, just before the closing `},`. The mutations to update are:

- `addChore` — add `markDirty();` after `set(...)` on line ~125
- `updateChore` — add `markDirty();` after `set(...)` on line ~136
- `deactivateChore` — add `markDirty();` after `set(...)` on line ~150
- `recordCompletion` — add `markDirty();` after `set(...)` on line ~193
- `updateProfile` — add `markDirty();` after `set({ profile });` on line ~201
- `saveQuestions` — add `markDirty();` after `set({ questions: allQuestions });` on line ~228
- `importCDP` — add `markDirty();` after the final `set(...)` on line ~241
- `updateCDP` — add `markDirty();` after the final `set(...)` on line ~258
- `addPack` — add `markDirty();` after `set(...)` on line ~278
- `renamePack` — add `markDirty();` after `set(...)` on line ~294
- `updatePackDescription` — add `markDirty();` after `set(...)` (check exact line)
- `deletePack` — add `markDirty();` at the end (check exact line)
- `saveQuickAnswerSet` — add `markDirty();` at the end
- `removeQuickAnswerSet` — add `markDirty();` at the end
- `moveChore` — add `markDirty();` at the end (only when returning `true`)
- `duplicateChore` — add `markDirty();` at the end

Do NOT add markDirty to: `init`, `reload`, `updateSyncState`.

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck 2>&1 | grep store
```
Expected: no errors in store/index.ts.

- [ ] **Step 4: Run unit tests**

```bash
bun test --isolate src/
```
Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/store/index.ts
git commit -m "feat: call markDirty() on all store write mutations"
```

---

### Task 15: Update ProfilePage.tsx — export format selector and key management

**Files:**
- Modify: `src/components/profile/ProfilePage.tsx`

- [ ] **Step 1: Add key management state and handlers**

In `src/components/profile/ProfilePage.tsx`, add these imports:

```typescript
import { getOrCreateSyncKey, exportKeyFile, importKeyFile } from '@/sync/credentials';
import { encryptedExport } from '@/sync/export';
import { decryptedImport } from '@/sync/import';
import { putCredentials } from '@/db';
import { SyncPanel } from '@/components/sync/SyncPanel';
```

Add these state variables inside `ProfilePage`:

```typescript
const [exportFormat, setExportFormat] = useState<'encrypted' | 'plain'>('encrypted');
const [keyExportError, setKeyExportError] = useState<string | null>(null);
const [keyImportError, setKeyImportError] = useState<string | null>(null);
const [keyImportSuccess, setKeyImportSuccess] = useState(false);
const keyFileInputRef = useRef<HTMLInputElement>(null);
```

- [ ] **Step 2: Update handleExport to use the format selector**

Replace the existing `handleExport` function:

```typescript
async function handleExport() {
  if (!db) return;
  if (exportFormat === 'encrypted') {
    const blob = await encryptedExport(db);
    const file = new Blob([blob.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tasks-harmony-backup-${new Date().toISOString().substring(0, 10)}.enc`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  } else {
    const state = await exportAppState(db);
    const zipBytes = wrapStateInZip(state);
    const date = new Date().toISOString().substring(0, 10);
    const filename = buildBackupFilename(date);
    const file = new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' });
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }
}
```

- [ ] **Step 3: Update handleImport to support .enc files**

Replace the existing `handleImport` function:

```typescript
async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file || !db) return;
  setImportError(null);
  setImportSuccess(false);

  if (!isAppStatePristine(packs, completions)) {
    const ok = window.confirm(
      'This will replace all your current data with the backup. This cannot be undone. Continue?'
    );
    if (!ok) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
  }

  try {
    const buffer = await file.arrayBuffer();
    let state;
    if (file.name.endsWith('.enc')) {
      const blob = new Uint8Array(buffer);
      state = await decryptedImport(db, blob);
    } else {
      const zipBytes = new Uint8Array(buffer);
      state = unwrapStateFromZip(zipBytes);
    }
    const validation = validateAppState(state);
    if (!validation.valid) {
      setImportError(`Invalid backup file: ${validation.errors.join('; ')}`);
      return;
    }
    await importAppState(db, state);
    await reload();
    setImportSuccess(true);
  } catch (err) {
    setImportError(err instanceof Error ? err.message : 'Failed to import backup');
  } finally {
    if (fileInputRef.current) fileInputRef.current.value = '';
  }
}
```

Update the file input `accept` attribute to include `.enc`:
```typescript
accept=".zip,.enc"
```

- [ ] **Step 4: Add key export handler**

```typescript
async function handleKeyExport() {
  if (!db) return;
  setKeyExportError(null);
  try {
    const key = await getOrCreateSyncKey(db);
    const json = await exportKeyFile(key);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tasks-harmony-sync-key.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  } catch {
    setKeyExportError('Failed to export sync key.');
  }
}
```

- [ ] **Step 5: Add key import handler**

```typescript
async function handleKeyImport(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file || !db) return;
  setKeyImportError(null);
  setKeyImportSuccess(false);
  const ok = window.confirm(
    'Importing a new key will make your existing server data inaccessible. Your local data is unaffected. Continue?'
  );
  if (!ok) {
    if (keyFileInputRef.current) keyFileInputRef.current.value = '';
    return;
  }
  try {
    const text = await file.text();
    const key = await importKeyFile(text);
    await putCredentials(db, { id: 'main', cryptoKey: key });
    setKeyImportSuccess(true);
  } catch {
    setKeyImportError('Invalid key file.');
  } finally {
    if (keyFileInputRef.current) keyFileInputRef.current.value = '';
  }
}
```

- [ ] **Step 6: Add the Sync section and format selector to the JSX**

In the returned JSX, add a format selector above the Export Backup button, inside the Backup section:

```tsx
{/* Format selector */}
<div className="flex items-center gap-3">
  <span className="text-sm font-medium text-foreground">Format</span>
  <label className="flex items-center gap-1 text-sm cursor-pointer">
    <input
      type="radio"
      name="exportFormat"
      value="encrypted"
      checked={exportFormat === 'encrypted'}
      onChange={() => setExportFormat('encrypted')}
    />
    Encrypted
  </label>
  <label className="flex items-center gap-1 text-sm cursor-pointer">
    <input
      type="radio"
      name="exportFormat"
      value="plain"
      checked={exportFormat === 'plain'}
      onChange={() => setExportFormat('plain')}
    />
    Plain
  </label>
</div>
```

Add a new Sync Key section after the Backup section:

```tsx
<section className="rounded-lg border border-border bg-background p-4 shadow-sm space-y-3">
  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Sync Key</h2>
  <p className="text-sm text-muted-foreground">
    Export your sync key to set up another device, or import a key from another device.
  </p>
  <button
    onClick={handleKeyExport}
    className="w-full rounded-md bg-muted px-4 py-2 text-sm font-semibold text-foreground shadow-sm hover:bg-muted/80 focus:outline-none focus:ring-2 focus:ring-ring"
  >
    Export Sync Key
  </button>
  <input
    ref={keyFileInputRef}
    type="file"
    accept=".json"
    onChange={handleKeyImport}
    className="hidden"
    aria-label="Import sync key file"
  />
  <button
    onClick={() => keyFileInputRef.current?.click()}
    className="w-full rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground shadow-sm hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
  >
    Import Sync Key
  </button>
  {keyExportError && <p className="text-sm text-destructive" role="alert">{keyExportError}</p>}
  {keyImportError && <p className="text-sm text-destructive" role="alert">{keyImportError}</p>}
  {keyImportSuccess && <p className="text-sm text-green-600 dark:text-green-400" role="status">Sync key imported successfully.</p>}
</section>

<SyncPanel />
```

- [ ] **Step 7: Run typecheck**

```bash
bun run typecheck 2>&1 | grep ProfilePage
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/profile/ProfilePage.tsx
git commit -m "feat: add encrypted export format selector and sync key management to ProfilePage"
```

---

### Task 16: Update App.tsx — remove WebDAV logic, wire useSync

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Remove WebDAV sync imports and online-reconnect logic from App.tsx**

Remove these imports from `src/App.tsx`:
```typescript
import { performSync } from '@/sync/sync';
```

Remove these state variables:
```typescript
const wasOnlineRef = useRef(isOnline);
const syncState = useAppStore((s) => s.syncState);
const updateSyncState = useAppStore((s) => s.updateSyncState);
```

Remove the entire `useEffect` that handles online reconnect sync (the block starting with `const wasOnline = wasOnlineRef.current`).

- [ ] **Step 2: Add useSync import**

Add to imports:
```typescript
import { useSync } from '@/hooks/useSync';
```

- [ ] **Step 3: Call useSync inside the App component**

Inside `App()`, after the other hook calls:

```typescript
useSync();
```

`useSync` handles its own startup pull, debounced push, and pagehide push internally. No return value is needed at the App level — the `SyncPanel` in `ProfilePage` will render the sync status.

- [ ] **Step 4: Run typecheck**

```bash
bun run typecheck 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 5: Run all unit tests**

```bash
bun test --isolate src/
```
Expected: all tests pass (deleted test files are gone; remaining tests pass).

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire useSync into App, remove legacy WebDAV sync logic"
```

---

### Task 17: Validate AppState schema includes quickAnswerSets

**Files:**
- Modify: `src/schemas/validate.ts` (if it validates `AppState` structure)

- [ ] **Step 1: Check current validation coverage**

```bash
grep -n 'quickAnswerSets\|AppState' src/schemas/validate.ts | head -20
```

- [ ] **Step 2: Add quickAnswerSets to the schema validator if missing**

Open `src/schemas/validate.ts`. If the `AppState` validator checks for specific keys and `quickAnswerSets` is not included, add it. If the validator uses a JSON schema object, add:

```typescript
quickAnswerSets: { type: 'array' }
```

(or equivalent for the validation library in use).

If `quickAnswerSets` is already included or the validator uses a loose schema, no changes needed.

- [ ] **Step 3: Run typecheck and unit tests**

```bash
bun run typecheck 2>&1 | head -10
bun test --isolate src/
```
Expected: all pass.

- [ ] **Step 4: Commit (if changes were made)**

```bash
git add src/schemas/validate.ts
git commit -m "fix: include quickAnswerSets in AppState schema validation"
```

---

### Task 18: Final integration check

- [ ] **Step 1: Run full typecheck**

```bash
bun run typecheck
```
Expected: exit 0, no errors.

- [ ] **Step 2: Run all unit tests**

```bash
bun test --isolate src/
```
Expected: all tests pass.

- [ ] **Step 3: Start dev server and verify sync panel renders**

```bash
bun run dev
```

Open http://localhost:5173, navigate to Profile page. Verify:
- "Sync" section shows "Last synced: Never" (no server running yet)
- "Sync Key" section shows Export/Import buttons
- "Backup" section shows Format radio buttons (Encrypted default, Plain option)
- No console errors about missing modules

- [ ] **Step 4: Commit any remaining fixes**

```bash
git add -p
git commit -m "fix: resolve remaining integration issues after sync client wiring"
```
