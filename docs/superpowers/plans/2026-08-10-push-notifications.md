# Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement VAPID-based push notification infrastructure so users are reminded about due chores on iOS and Android.

**Architecture:** A new `vapid-observer` container polls CouchDB for due notification schedules and sends VAPID pushes via the Web Push protocol. The existing sync-server gains push API endpoints (subscription registration, schedule management) authenticated via the existing session token mechanism. The PWA gains permission UI, service worker push handlers, and schedule reconciliation.

**Tech Stack:** Bun, TypeScript, CouchDB (Mango queries, `_changes` feed), `web-push` npm package, `zod`, `vite-plugin-pwa` (`injectManifest` strategy), React.

---

## File Map

**New files:**
- `sync-server/schemas/push.ts` — Zod schemas for push API request bodies
- `sync-server/couch.ts` — fetch-based CouchDB client for sync-server
- `sync-server/handlers/push.ts` — all push route handlers
- `sync-server/handlers/push.test.ts` — handler tests
- `vapid-observer/package.json` — observer package
- `vapid-observer/tsconfig.json` — observer TypeScript config
- `vapid-observer/Dockerfile` — observer container
- `vapid-observer/couch.ts` — fetch-based CouchDB client for observer
- `vapid-observer/couch.test.ts` — CouchDB client tests
- `vapid-observer/scheduler.ts` — `nextNotificationAt` computation
- `vapid-observer/scheduler.test.ts` — scheduler tests (most logic lives here)
- `vapid-observer/deliver.ts` — VAPID send + per-subscription backoff updates
- `vapid-observer/deliver.test.ts` — delivery tests
- `vapid-observer/index.ts` — entry point: poll loop + `_changes` listeners
- `src/sw.ts` — custom service worker entry point (push + notificationclick handlers)
- `src/sync/pushApi.ts` — auth-aware push API calls (mirrors pattern of `server.ts`)
- `src/hooks/usePushNotifications.ts` — permission, subscription lifecycle, VAPID key rotation
- `src/hooks/useScheduleSync.ts` — schedule reconciliation after sync pull
- `src/components/notifications/NotificationsPanel.tsx` — permission UI + test button

**Modified files:**
- `src/types/index.ts` — add `ChoreNotificationSettings`, extend `Chore`, `UserProfile`, `PackManifest`
- `src/lib/notifications.ts` — add `resolveNotificationsEnabled` utility (new file in existing `src/lib/`)
- `sync-server/index.ts` — wire push routes
- `vite.config.ts` — switch VitePWA to `injectManifest` strategy
- `src/vite-env.d.ts` — add `VITE_PUSH_URL` env var type
- `src/hooks/useSync.ts` — trigger schedule reconciliation after successful pull
- `src/components/chores/ChoreFormModal.tsx` — add notification toggle
- `src/components/profile/ProfilePage.tsx` — add global default + `NotificationsPanel`

---

## Task 1: TypeScript types and resolution utility

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/lib/notifications.ts`
- Create: `src/lib/notifications.test.ts`

- [ ] **Add notification types to `src/types/index.ts`**

Add after the existing `ChoreSyncStatus` type (line 5):

```typescript
export type NotificationTrigger = 'at-due-time';
export type NotificationToggle = 'on' | 'off' | 'default';

export interface ChoreNotificationSettings {
  enabled: NotificationToggle;
  trigger: NotificationTrigger;
}
```

Add `notifications?: ChoreNotificationSettings` to the `Chore` interface after `syncStatus`:

```typescript
  notifications?: ChoreNotificationSettings;
```

Add `defaultNotifications?: 'on' | 'off' | 'default'` to `PackManifest` after `deletedXP`:

```typescript
  defaultNotifications?: 'on' | 'off' | 'default'; // absent = 'default'
```

Add `defaultNotifications?: 'on' | 'off'` to `UserProfile` after `activeXPSettingsId`:

```typescript
  defaultNotifications?: 'on' | 'off'; // absent = 'off'
```

- [ ] **Write failing test for `resolveNotificationsEnabled`**

Create `src/lib/notifications.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test';
import { resolveNotificationsEnabled } from './notifications';
import type { Chore, Pack, UserProfile } from '@/types';

const baseProfile: UserProfile = {
  id: 'me', displayName: 'Test', email: 'test@example.com', activeXPSettingsId: 'default',
};
const basePack: Pack = {
  id: 'my-pack', manifest: { title: 'My Pack' }, isPersonal: true,
  importedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};
const baseChore: Chore = {
  key: 'my-pack/take-out-trash', choreId: 'take-out-trash', packId: 'my-pack',
  title: 'Take out trash', xpSize: 'S',
  recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '09:00' },
  repeatable: false, active: true, createdAt: '2026-01-01T00:00:00Z',
};

describe('resolveNotificationsEnabled', () => {
  it('returns false when all defaults and global is absent (defaults to off)', () => {
    expect(resolveNotificationsEnabled(baseChore, basePack, baseProfile)).toBe(false);
  });

  it('returns true when global is on and no overrides', () => {
    const profile = { ...baseProfile, defaultNotifications: 'on' as const };
    expect(resolveNotificationsEnabled(baseChore, basePack, profile)).toBe(true);
  });

  it('pack off overrides global on', () => {
    const profile = { ...baseProfile, defaultNotifications: 'on' as const };
    const pack = { ...basePack, manifest: { ...basePack.manifest, defaultNotifications: 'off' as const } };
    expect(resolveNotificationsEnabled(baseChore, pack, profile)).toBe(false);
  });

  it('chore on overrides pack off', () => {
    const pack = { ...basePack, manifest: { ...basePack.manifest, defaultNotifications: 'off' as const } };
    const chore = { ...baseChore, notifications: { enabled: 'on' as const, trigger: 'at-due-time' as const } };
    expect(resolveNotificationsEnabled(chore, pack, baseProfile)).toBe(true);
  });

  it('chore default falls through to pack', () => {
    const pack = { ...basePack, manifest: { ...basePack.manifest, defaultNotifications: 'on' as const } };
    const chore = { ...baseChore, notifications: { enabled: 'default' as const, trigger: 'at-due-time' as const } };
    expect(resolveNotificationsEnabled(chore, pack, baseProfile)).toBe(true);
  });
});
```

- [ ] **Run test to verify it fails**

```bash
bun test src/lib/notifications.test.ts
```

Expected: FAIL — `notifications` module not found.

- [ ] **Create `src/lib/notifications.ts`**

```typescript
import type { Chore, Pack, UserProfile } from '@/types';

export function resolveNotificationsEnabled(
  chore: Chore,
  pack: Pack,
  profile: UserProfile,
): boolean {
  const choreLevel = chore.notifications?.enabled ?? 'default';
  if (choreLevel !== 'default') return choreLevel === 'on';
  const packLevel = pack.manifest.defaultNotifications ?? 'default';
  if (packLevel !== 'default') return packLevel === 'on';
  return (profile.defaultNotifications ?? 'off') === 'on';
}
```

- [ ] **Run test to verify it passes**

```bash
bun test src/lib/notifications.test.ts
```

Expected: PASS.

- [ ] **Run full typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Commit**

```bash
git add src/types/index.ts src/lib/notifications.ts src/lib/notifications.test.ts
git commit -m "feat(notifications): add notification types and resolution utility"
```

---

## Task 2: Zod schemas for push API (sync-server)

**Files:**
- Create: `sync-server/schemas/push.ts`
- Create: `sync-server/schemas/push.test.ts`

- [ ] **Install Zod in sync-server**

```bash
cd sync-server && bun add zod
```

- [ ] **Write failing test**

Create `sync-server/schemas/push.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test';
import { PushSubscriptionBody, DeleteSubscriptionBody, PushScheduleBody } from './push';

describe('PushSubscriptionBody', () => {
  it('accepts valid subscription', () => {
    const result = PushSubscriptionBody.safeParse({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'somekey', auth: 'someauth' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-URL endpoint', () => {
    const result = PushSubscriptionBody.safeParse({
      endpoint: 'not-a-url',
      keys: { p256dh: 'k', auth: 'a' },
    });
    expect(result.success).toBe(false);
  });
});

describe('PushScheduleBody', () => {
  it('accepts valid daily schedule', () => {
    const result = PushScheduleBody.safeParse({
      title: 'Take out trash',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '09:00' },
      trigger: 'at-due-time',
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown frequency', () => {
    const result = PushScheduleBody.safeParse({
      title: 'X',
      recurrence: { frequency: 'hourly', interval: 1, startDate: '2026-01-01', windowStartTime: '09:00' },
      trigger: 'at-due-time',
    });
    expect(result.success).toBe(false);
  });

  it('rejects interval less than 1', () => {
    const result = PushScheduleBody.safeParse({
      title: 'X',
      recurrence: { frequency: 'daily', interval: 0, startDate: '2026-01-01', windowStartTime: '09:00' },
      trigger: 'at-due-time',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown trigger', () => {
    const result = PushScheduleBody.safeParse({
      title: 'X',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '09:00' },
      trigger: 'on-overdue',
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Run test to verify it fails**

```bash
cd sync-server && bun test schemas/push.test.ts
```

Expected: FAIL — module not found.

- [ ] **Create `sync-server/schemas/push.ts`**

```typescript
import { z } from 'zod';

export const PushSubscriptionBody = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const DeleteSubscriptionBody = z.object({
  endpoint: z.string().url(),
});

const DuePeriodSchema = z.object({
  value: z.number().int().positive(),
  unit: z.enum(['minutes', 'hours', 'days', 'weeks', 'months']),
});

export const PushScheduleBody = z.object({
  title: z.string().min(1),
  recurrence: z.object({
    frequency: z.enum(['daily', 'weekly', 'monthly']),
    interval: z.number().int().min(1),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    windowStartTime: z.string().regex(/^\d{2}:\d{2}$/),
  }),
  duePeriod: DuePeriodSchema.optional(),
  trigger: z.enum(['at-due-time']),
});

export type PushScheduleInput = z.infer<typeof PushScheduleBody>;
```

- [ ] **Run test to verify it passes**

```bash
cd sync-server && bun test schemas/push.test.ts
```

Expected: PASS.

- [ ] **Commit**

```bash
git add sync-server/schemas/push.ts sync-server/schemas/push.test.ts sync-server/bun.lock
git commit -m "feat(sync-server): add Zod schemas for push API inputs"
```

---

## Task 3: CouchDB client (sync-server)

**Files:**
- Create: `sync-server/couch.ts`
- Create: `sync-server/couch.test.ts`

- [ ] **Write failing tests**

Create `sync-server/couch.test.ts`:

```typescript
import { describe, it, expect, mock, beforeEach } from 'bun:test';

// We test the client by intercepting fetch. Set env vars before importing.
process.env.COUCHDB_URL = 'http://couchdb:5984';
process.env.COUCHDB_USER = 'admin';
process.env.COUCHDB_PASSWORD = 'password';

const { couchGet, couchPut, couchDel, couchFind } = await import('./couch');

describe('couchGet', () => {
  it('returns null for 404', async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(null, { status: 404 })));
    const result = await couchGet('push-subscriptions', 'sub-abc');
    expect(result).toBeNull();
  });

  it('returns parsed doc for 200', async () => {
    const doc = { _id: 'sub-abc', syncId: 'xyz' };
    globalThis.fetch = mock(() => Promise.resolve(new Response(JSON.stringify(doc), { status: 200 })));
    const result = await couchGet('push-subscriptions', 'sub-abc');
    expect(result).toEqual(doc);
  });
});

describe('couchFind', () => {
  it('returns docs array', async () => {
    const docs = [{ _id: 'a' }, { _id: 'b' }];
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ docs }), { status: 200 })),
    );
    const result = await couchFind('push-schedules', { syncId: 'xyz' });
    expect(result).toEqual(docs);
  });
});
```

- [ ] **Run test to verify it fails**

```bash
cd sync-server && bun test couch.test.ts
```

Expected: FAIL — `./couch` not found.

- [ ] **Create `sync-server/couch.ts`**

```typescript
const COUCHDB_URL = process.env.COUCHDB_URL!;
const COUCHDB_USER = process.env.COUCHDB_USER!;
const COUCHDB_PASSWORD = process.env.COUCHDB_PASSWORD!;

function authHeader(): string {
  return `Basic ${Buffer.from(`${COUCHDB_USER}:${COUCHDB_PASSWORD}`).toString('base64')}`;
}

function couchHeaders() {
  return { 'Content-Type': 'application/json', Authorization: authHeader() };
}

export async function ensureDb(db: string): Promise<void> {
  await fetch(`${COUCHDB_URL}/${db}`, { method: 'PUT', headers: couchHeaders() });
  // 201 = created, 412 = already exists — both OK
}

export async function ensureIndex(db: string, fields: string[]): Promise<void> {
  await fetch(`${COUCHDB_URL}/${db}/_index`, {
    method: 'POST',
    headers: couchHeaders(),
    body: JSON.stringify({ index: { fields } }),
  });
}

export async function couchGet<T>(db: string, id: string): Promise<T | null> {
  const res = await fetch(`${COUCHDB_URL}/${db}/${encodeURIComponent(id)}`, {
    headers: couchHeaders(),
  });
  if (res.status === 404) return null;
  return res.json() as Promise<T>;
}

export async function couchPut(
  db: string,
  id: string,
  doc: Record<string, unknown>,
): Promise<void> {
  const existing = await couchGet<{ _rev: string }>(db, id);
  const body = existing ? { ...doc, _rev: existing._rev } : doc;
  const res = await fetch(`${COUCHDB_URL}/${db}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: couchHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`CouchDB PUT failed: ${res.status}`);
}

export async function couchDel(db: string, id: string): Promise<void> {
  const existing = await couchGet<{ _rev: string }>(db, id);
  if (!existing) return;
  await fetch(
    `${COUCHDB_URL}/${db}/${encodeURIComponent(id)}?rev=${existing._rev}`,
    { method: 'DELETE', headers: couchHeaders() },
  );
}

export async function couchFind<T>(
  db: string,
  selector: Record<string, unknown>,
): Promise<T[]> {
  const res = await fetch(`${COUCHDB_URL}/${db}/_find`, {
    method: 'POST',
    headers: couchHeaders(),
    body: JSON.stringify({ selector }),
  });
  const { docs } = await res.json() as { docs: T[] };
  return docs;
}

export async function couchChanges(
  db: string,
  since: string,
  signal: AbortSignal,
): Promise<{ results: Array<{ id: string; seq: string }>, last_seq: string }> {
  const url = `${COUCHDB_URL}/${db}/_changes?feed=longpoll&since=${since}&timeout=60000`;
  const res = await fetch(url, { headers: couchHeaders(), signal });
  return res.json() as Promise<{ results: Array<{ id: string; seq: string }>, last_seq: string }>;
}
```

- [ ] **Run test to verify it passes**

```bash
cd sync-server && bun test couch.test.ts
```

Expected: PASS.

- [ ] **Commit**

```bash
git add sync-server/couch.ts sync-server/couch.test.ts
git commit -m "feat(sync-server): add CouchDB client"
```

---

## Task 4: Push handlers — subscriptions and VAPID public key

**Files:**
- Create: `sync-server/handlers/push.ts`
- Create: `sync-server/handlers/push.test.ts`

Authentication pattern: `authenticate(req)` resolves `syncId` from Redis using the Bearer token — identical to `blob.ts`.

- [ ] **Write failing tests**

Create `sync-server/handlers/push.test.ts`:

```typescript
import { describe, it, expect, mock, beforeEach } from 'bun:test';

process.env.COUCHDB_URL = 'http://couch:5984';
process.env.COUCHDB_USER = 'admin';
process.env.COUCHDB_PASSWORD = 'pw';
process.env.VAPID_PUBLIC_KEY = 'BN_test_public_key';

// Mock redis before importing handler
mock.module('../redis', () => ({ redis: { get: mock(() => Promise.resolve('syncid-abc')) } }));
mock.module('../couch', () => ({
  couchPut: mock(() => Promise.resolve()),
  couchDel: mock(() => Promise.resolve()),
  couchFind: mock(() => Promise.resolve([])),
  couchGet: mock(() => Promise.resolve(null)),
}));

const { handlePush } = await import('./push');

function makeRequest(method: string, path: string, body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + 'a'.repeat(64) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('GET /push/vapid-public-key', () => {
  it('returns 200 with public key', async () => {
    const res = await handlePush(makeRequest('GET', '/push/vapid-public-key'), null);
    expect(res.status).toBe(200);
    const body = await res.json() as { publicKey: string };
    expect(body.publicKey).toBe('BN_test_public_key');
  });
});

describe('PUT /push/subscriptions', () => {
  it('returns 204 on valid body', async () => {
    const res = await handlePush(
      makeRequest('PUT', '/push/subscriptions', {
        endpoint: 'https://fcm.googleapis.com/send/abc',
        keys: { p256dh: 'key', auth: 'auth' },
      }),
      null,
    );
    expect(res.status).toBe(204);
  });

  it('returns 400 on invalid body', async () => {
    const res = await handlePush(
      makeRequest('PUT', '/push/subscriptions', { endpoint: 'not-a-url' }),
      null,
    );
    expect(res.status).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const req = new Request('http://localhost/push/subscriptions', { method: 'PUT' });
    const res = await handlePush(req, null);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Run test to verify it fails**

```bash
cd sync-server && bun test handlers/push.test.ts
```

Expected: FAIL — `./push` not found.

- [ ] **Create `sync-server/handlers/push.ts`** (subscription + VAPID key routes)

```typescript
import { createHash } from 'node:crypto';
import { redis } from '../redis';
import { couchPut, couchDel, couchFind, couchGet } from '../couch';
import {
  PushSubscriptionBody,
  DeleteSubscriptionBody,
  PushScheduleBody,
} from '../schemas/push';

const TOKEN_RE = /^[a-f0-9]{64}$/;
const BLOCKED_UNTIL_RESET = '0001-01-01T00:00:00Z';
const SCHEDULE_CAP = 500;

const DB_SUBS = 'push-subscriptions';
const DB_SCHEDULES = 'push-schedules';

async function authenticate(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  if (!TOKEN_RE.test(token)) return null;
  return redis.get(`session:${token}`);
}

function subId(endpoint: string): string {
  return `sub-${createHash('sha256').update(endpoint).digest('hex')}`;
}

export async function handlePush(req: Request, _token: string | null): Promise<Response> {
  const { pathname } = new URL(req.url);

  // Unauthenticated
  if (pathname === '/push/vapid-public-key' && req.method === 'GET') {
    return Response.json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? '' });
  }

  // All other routes require auth
  const syncId = await authenticate(req);
  if (!syncId) return new Response('Unauthorized', { status: 401 });

  // Subscriptions
  if (pathname === '/push/subscriptions') {
    if (req.method === 'PUT') {
      let body: unknown;
      try { body = await req.json(); } catch { return new Response('Bad Request', { status: 400 }); }
      const parsed = PushSubscriptionBody.safeParse(body);
      if (!parsed.success) return new Response('Bad Request', { status: 400 });
      const { endpoint, keys } = parsed.data;
      await couchPut(DB_SUBS, subId(endpoint), {
        syncId, endpoint, keys,
        createdAt: new Date().toISOString(),
        failedAttempts: 0,
        blockedUntil: BLOCKED_UNTIL_RESET,
      });
      return new Response(null, { status: 204 });
    }
    if (req.method === 'DELETE') {
      let body: unknown;
      try { body = await req.json(); } catch { return new Response('Bad Request', { status: 400 }); }
      const parsed = DeleteSubscriptionBody.safeParse(body);
      if (!parsed.success) return new Response('Bad Request', { status: 400 });
      await couchDel(DB_SUBS, subId(parsed.data.endpoint));
      return new Response(null, { status: 204 });
    }
  }

  // Schedules list
  if (pathname === '/push/schedules' && req.method === 'GET') {
    const docs = await couchFind<{ _id: string; nextNotificationAt: string }>(
      DB_SCHEDULES,
      { syncId },
    );
    const result = docs
      .filter((d) => !d._id.endsWith('/~test'))
      .map((d) => ({
        choreKey: d._id.slice(syncId.length + 1),
        nextNotificationAt: d.nextNotificationAt,
      }));
    return Response.json(result);
  }

  // Test notification
  if (pathname === '/push/test' && req.method === 'POST') {
    await couchPut(DB_SCHEDULES, `${syncId}/~test`, {
      syncId,
      trigger: 'test',
      nextNotificationAt: new Date().toISOString(),
    });
    return new Response(null, { status: 204 });
  }

  // Schedule PUT/DELETE: /push/schedules/<packId>/<choreId>
  const scheduleMatch = pathname.match(/^\/push\/schedules\/([^/]+\/.+)$/);
  if (scheduleMatch) {
    const choreKey = scheduleMatch[1]!;
    const docId = `${syncId}/${choreKey}`;

    if (req.method === 'DELETE') {
      await couchDel(DB_SCHEDULES, docId);
      return new Response(null, { status: 204 });
    }

    if (req.method === 'PUT') {
      let body: unknown;
      try { body = await req.json(); } catch { return new Response('Bad Request', { status: 400 }); }
      const parsed = PushScheduleBody.safeParse(body);
      if (!parsed.success) return new Response('Bad Request', { status: 400 });

      // Cap check
      const existing = await couchFind<{ _id: string }>(DB_SCHEDULES, { syncId });
      const isNew = !existing.some((d) => d._id === docId);
      if (isNew && existing.filter((d) => !d._id.endsWith('/~test')).length >= SCHEDULE_CAP) {
        return new Response('Insufficient Storage', { status: 507 });
      }

      const existingDoc = await couchGet<{ lastDeliveredAt?: string }>(DB_SCHEDULES, docId);
      const lastDeliveredAt = existingDoc?.lastDeliveredAt ?? null;
      const nextNotificationAt = computeNextNotificationAt(
        parsed.data.recurrence,
        parsed.data.duePeriod,
        parsed.data.trigger,
        lastDeliveredAt,
      );

      await couchPut(DB_SCHEDULES, docId, {
        syncId,
        choreKey,
        title: parsed.data.title,
        recurrence: parsed.data.recurrence,
        ...(parsed.data.duePeriod ? { duePeriod: parsed.data.duePeriod } : {}),
        trigger: parsed.data.trigger,
        lastDeliveredAt,
        nextNotificationAt,
        updatedAt: new Date().toISOString(),
      });
      return new Response(null, { status: 204 });
    }
  }

  return new Response('Not Found', { status: 404 });
}

// Shared computation (also in vapid-observer/scheduler.ts — kept in sync)
function computeNextNotificationAt(
  recurrence: { frequency: 'daily' | 'weekly' | 'monthly'; interval: number; startDate: string; windowStartTime: string },
  duePeriod: { value: number; unit: string } | undefined,
  _trigger: 'at-due-time',
  lastDeliveredAt: string | null,
): string {
  const reference = lastDeliveredAt ? new Date(lastDeliveredAt) : new Date(0);
  const now = new Date();
  const refTime = reference > now ? reference : now;

  let windowStart = new Date(`${recurrence.startDate}T${recurrence.windowStartTime}:00Z`);
  while (windowStart <= refTime) {
    windowStart = advancePeriod(windowStart, recurrence.frequency, recurrence.interval);
  }

  if (duePeriod) {
    const windowEnd = advancePeriod(windowStart, recurrence.frequency, recurrence.interval);
    const offsetMs = duePeriodToMs(duePeriod.value, duePeriod.unit);
    return new Date(windowEnd.getTime() - offsetMs).toISOString();
  }
  return windowStart.toISOString();
}

function advancePeriod(date: Date, frequency: string, interval: number): Date {
  if (frequency === 'daily') return new Date(date.getTime() + interval * 86_400_000);
  if (frequency === 'weekly') return new Date(date.getTime() + interval * 7 * 86_400_000);
  const d = new Date(date);
  d.setMonth(d.getMonth() + interval);
  return d;
}

function duePeriodToMs(value: number, unit: string): number {
  const ms: Record<string, number> = {
    minutes: 60_000, hours: 3_600_000, days: 86_400_000,
    weeks: 604_800_000, months: 2_592_000_000,
  };
  return value * (ms[unit] ?? 0);
}
```

- [ ] **Run tests to verify they pass**

```bash
cd sync-server && bun test handlers/push.test.ts
```

Expected: PASS.

- [ ] **Commit**

```bash
git add sync-server/handlers/push.ts sync-server/handlers/push.test.ts
git commit -m "feat(sync-server): add push subscription and schedule handlers"
```

---

## Task 5: Wire push routes into sync-server

**Files:**
- Modify: `sync-server/index.ts`

- [ ] **Add push routes to `sync-server/index.ts`**

Add import after existing imports:

```typescript
import { handlePush } from './handlers/push';
```

Add push routing inside `handler()` before the final 404, after the blob handler:

```typescript
  if (pathname === '/push/vapid-public-key' && req.method === 'GET') return handlePush(req, null);
  if (pathname === '/push/subscriptions' && (req.method === 'PUT' || req.method === 'DELETE')) return handlePush(req, null);
  if (pathname === '/push/schedules' && req.method === 'GET') return handlePush(req, null);
  if (pathname === '/push/test' && req.method === 'POST') return handlePush(req, null);
  if (/^\/push\/schedules\/[^/]+\/.+$/.test(pathname) && (req.method === 'PUT' || req.method === 'DELETE')) return handlePush(req, null);
```

- [ ] **Add CouchDB startup initialisation**

In `sync-server/index.ts`, import and call on startup:

```typescript
import { ensureDb, ensureIndex } from './couch';

// After server starts:
await ensureDb('push-subscriptions');
await ensureDb('push-schedules');
await ensureIndex('push-subscriptions', ['syncId', 'blockedUntil']);
await ensureIndex('push-schedules', ['nextNotificationAt']);
await ensureIndex('push-schedules', ['syncId']);
```

- [ ] **Typecheck**

```bash
cd sync-server && bun run --eval "import './index.ts'" 2>&1 | head -5
```

Expected: no TypeScript errors (server starts then exits).

- [ ] **Commit**

```bash
git add sync-server/index.ts
git commit -m "feat(sync-server): wire push routes and CouchDB startup init"
```

---

## Task 6: vapid-observer — package setup and CouchDB client

**Files:**
- Create: `vapid-observer/package.json`
- Create: `vapid-observer/tsconfig.json`
- Create: `vapid-observer/couch.ts`
- Create: `vapid-observer/couch.test.ts`

- [ ] **Create `vapid-observer/package.json`**

```json
{
  "name": "tasks-harmony-vapid-observer",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "bun --watch index.ts",
    "test": "bun test"
  },
  "dependencies": {
    "web-push": "^3.6.7",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/bun": "^1",
    "@types/web-push": "^3.6.4"
  }
}
```

- [ ] **Create `vapid-observer/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Install dependencies**

```bash
cd vapid-observer && bun install
```

- [ ] **Create `vapid-observer/couch.ts`** — identical interface to `sync-server/couch.ts` plus `couchChanges`

```typescript
const COUCHDB_URL = process.env.COUCHDB_URL!;
const COUCHDB_USER = process.env.COUCHDB_USER!;
const COUCHDB_PASSWORD = process.env.COUCHDB_PASSWORD!;

function authHeader(): string {
  return `Basic ${Buffer.from(`${COUCHDB_USER}:${COUCHDB_PASSWORD}`).toString('base64')}`;
}

function couchHeaders() {
  return { 'Content-Type': 'application/json', Authorization: authHeader() };
}

export async function ensureDb(db: string): Promise<void> {
  await fetch(`${COUCHDB_URL}/${db}`, { method: 'PUT', headers: couchHeaders() });
}

export async function ensureIndex(db: string, fields: string[]): Promise<void> {
  await fetch(`${COUCHDB_URL}/${db}/_index`, {
    method: 'POST',
    headers: couchHeaders(),
    body: JSON.stringify({ index: { fields } }),
  });
}

export async function couchGet<T>(db: string, id: string): Promise<T | null> {
  const res = await fetch(`${COUCHDB_URL}/${db}/${encodeURIComponent(id)}`, {
    headers: couchHeaders(),
  });
  if (res.status === 404) return null;
  return res.json() as Promise<T>;
}

export async function couchPut(
  db: string,
  id: string,
  doc: Record<string, unknown>,
): Promise<void> {
  const existing = await couchGet<{ _rev: string }>(db, id);
  const body = existing ? { ...doc, _rev: existing._rev } : doc;
  const res = await fetch(`${COUCHDB_URL}/${db}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: couchHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`CouchDB PUT failed: ${res.status}`);
}

export async function couchDel(db: string, id: string): Promise<void> {
  const existing = await couchGet<{ _rev: string }>(db, id);
  if (!existing) return;
  await fetch(
    `${COUCHDB_URL}/${db}/${encodeURIComponent(id)}?rev=${existing._rev}`,
    { method: 'DELETE', headers: couchHeaders() },
  );
}

export async function couchFind<T>(
  db: string,
  selector: Record<string, unknown>,
): Promise<T[]> {
  const res = await fetch(`${COUCHDB_URL}/${db}/_find`, {
    method: 'POST',
    headers: couchHeaders(),
    body: JSON.stringify({ selector }),
  });
  const { docs } = await res.json() as { docs: T[] };
  return docs;
}

export async function couchChanges(
  db: string,
  since: string,
  signal: AbortSignal,
): Promise<{ results: Array<{ id: string }>; last_seq: string }> {
  const url = `${COUCHDB_URL}/${db}/_changes?feed=longpoll&since=${since}&timeout=60000`;
  const res = await fetch(url, { headers: couchHeaders(), signal });
  return res.json() as Promise<{ results: Array<{ id: string }>; last_seq: string }>;
}
```

- [ ] **Write and run couch.test.ts** (same pattern as Task 3, adapted for observer)

Create `vapid-observer/couch.test.ts`:

```typescript
import { describe, it, expect, mock } from 'bun:test';

process.env.COUCHDB_URL = 'http://couch:5984';
process.env.COUCHDB_USER = 'admin';
process.env.COUCHDB_PASSWORD = 'pw';

const { couchGet, couchFind } = await import('./couch');

describe('couchGet', () => {
  it('returns null for 404', async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(null, { status: 404 })));
    expect(await couchGet('db', 'id')).toBeNull();
  });
});

describe('couchFind', () => {
  it('returns docs', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ docs: [{ _id: 'x' }] }), { status: 200 })),
    );
    expect(await couchFind('db', {})).toEqual([{ _id: 'x' }]);
  });
});
```

```bash
cd vapid-observer && bun test couch.test.ts
```

Expected: PASS.

- [ ] **Commit**

```bash
git add vapid-observer/
git commit -m "feat(vapid-observer): add package setup and CouchDB client"
```

---

## Task 7: vapid-observer — scheduler

**Files:**
- Create: `vapid-observer/scheduler.ts`
- Create: `vapid-observer/scheduler.test.ts`

- [ ] **Write failing tests**

Create `vapid-observer/scheduler.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test';
import { computeNextNotificationAt } from './scheduler';

const dailyRec = { frequency: 'daily' as const, interval: 1, startDate: '2026-01-01', windowStartTime: '09:00' };

describe('computeNextNotificationAt', () => {
  it('returns first window start when never delivered', () => {
    const result = computeNextNotificationAt(dailyRec, undefined, 'at-due-time', null);
    // Should be a future date at 09:00 UTC
    const d = new Date(result);
    expect(d.getUTCHours()).toBe(9);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d > new Date()).toBe(true);
  });

  it('advances to next window after lastDeliveredAt', () => {
    const lastDeliveredAt = '2026-08-10T09:00:00Z';
    const result = computeNextNotificationAt(dailyRec, undefined, 'at-due-time', lastDeliveredAt);
    expect(result).toBe('2026-08-11T09:00:00.000Z');
  });

  it('applies duePeriod offset (2 hours before window end)', () => {
    const duePeriod = { value: 2, unit: 'hours' as const };
    const lastDeliveredAt = '2026-08-10T09:00:00Z';
    const result = computeNextNotificationAt(dailyRec, duePeriod, 'at-due-time', lastDeliveredAt);
    // Window: 2026-08-11T09:00Z → 2026-08-12T09:00Z; notify at 2026-08-12T07:00Z
    expect(result).toBe('2026-08-12T07:00:00.000Z');
  });

  it('handles weekly recurrence', () => {
    const weeklyRec = { frequency: 'weekly' as const, interval: 1, startDate: '2026-01-05', windowStartTime: '10:00' };
    const lastDeliveredAt = '2026-08-10T10:00:00Z';
    const result = computeNextNotificationAt(weeklyRec, undefined, 'at-due-time', lastDeliveredAt);
    const d = new Date(result);
    expect(d.getUTCHours()).toBe(10);
    // 7 days later
    const last = new Date(lastDeliveredAt);
    expect(d.getTime() - last.getTime()).toBe(7 * 86_400_000);
  });
});
```

- [ ] **Run test to verify it fails**

```bash
cd vapid-observer && bun test scheduler.test.ts
```

Expected: FAIL — `./scheduler` not found.

- [ ] **Create `vapid-observer/scheduler.ts`**

```typescript
export type Recurrence = {
  frequency: 'daily' | 'weekly' | 'monthly';
  interval: number;
  startDate: string;
  windowStartTime: string;
};

export type DuePeriod = { value: number; unit: string };

export function computeNextNotificationAt(
  recurrence: Recurrence,
  duePeriod: DuePeriod | undefined,
  _trigger: 'at-due-time',
  lastDeliveredAt: string | null,
): string {
  const reference = lastDeliveredAt ? new Date(lastDeliveredAt) : new Date(0);
  const now = new Date();
  const refTime = reference > now ? reference : now;

  let windowStart = new Date(`${recurrence.startDate}T${recurrence.windowStartTime}:00Z`);
  while (windowStart <= refTime) {
    windowStart = advancePeriod(windowStart, recurrence.frequency, recurrence.interval);
  }

  if (duePeriod) {
    const windowEnd = advancePeriod(windowStart, recurrence.frequency, recurrence.interval);
    return new Date(windowEnd.getTime() - duePeriodToMs(duePeriod)).toISOString();
  }
  return windowStart.toISOString();
}

function advancePeriod(date: Date, frequency: string, interval: number): Date {
  if (frequency === 'daily') return new Date(date.getTime() + interval * 86_400_000);
  if (frequency === 'weekly') return new Date(date.getTime() + interval * 7 * 86_400_000);
  const d = new Date(date);
  d.setMonth(d.getMonth() + interval);
  return d;
}

function duePeriodToMs(dp: DuePeriod): number {
  const ms: Record<string, number> = {
    minutes: 60_000, hours: 3_600_000, days: 86_400_000,
    weeks: 604_800_000, months: 2_592_000_000,
  };
  return dp.value * (ms[dp.unit] ?? 0);
}
```

- [ ] **Run tests to verify they pass**

```bash
cd vapid-observer && bun test scheduler.test.ts
```

Expected: PASS.

- [ ] **Commit**

```bash
git add vapid-observer/scheduler.ts vapid-observer/scheduler.test.ts
git commit -m "feat(vapid-observer): add nextNotificationAt scheduler"
```

---

## Task 8: vapid-observer — delivery and backoff

**Files:**
- Create: `vapid-observer/deliver.ts`
- Create: `vapid-observer/deliver.test.ts`

- [ ] **Write failing tests**

Create `vapid-observer/deliver.test.ts`:

```typescript
import { describe, it, expect, mock } from 'bun:test';

process.env.VAPID_PUBLIC_KEY = 'pubkey';
process.env.VAPID_PRIVATE_KEY = 'privkey';
process.env.VAPID_SUBJECT = 'mailto:test@example.com';
process.env.COUCHDB_URL = 'http://couch:5984';
process.env.COUCHDB_USER = 'admin';
process.env.COUCHDB_PASSWORD = 'pw';

const mockSendNotification = mock(() => Promise.resolve({ statusCode: 201 }));
mock.module('web-push', () => ({
  default: { setVapidDetails: mock(() => {}), sendNotification: mockSendNotification },
}));

const mockCouchPut = mock(() => Promise.resolve());
const mockCouchDel = mock(() => Promise.resolve());
mock.module('./couch', () => ({ couchPut: mockCouchPut, couchDel: mockCouchDel }));

const { sendToSubscription, buildBackoff } = await import('./deliver');

const BLOCKED_UNTIL_RESET = '0001-01-01T00:00:00Z';

describe('buildBackoff', () => {
  it('increases interval exponentially', () => {
    const b1 = buildBackoff(1);
    const b2 = buildBackoff(2);
    expect(b2.failedAttempts).toBe(2);
    const diff2 = new Date(b2.blockedUntil).getTime() - Date.now();
    const diff1 = new Date(b1.blockedUntil).getTime() - Date.now();
    expect(diff2).toBeGreaterThan(diff1);
  });

  it('reset returns epoch sentinel', () => {
    const reset = buildBackoff(0);
    expect(reset.blockedUntil).toBe(BLOCKED_UNTIL_RESET);
    expect(reset.failedAttempts).toBe(0);
  });
});

describe('sendToSubscription', () => {
  it('returns ok on success', async () => {
    mockSendNotification.mockResolvedValueOnce({ statusCode: 201 });
    const result = await sendToSubscription(
      { endpoint: 'https://fcm.example.com', keys: { p256dh: 'k', auth: 'a' } },
      { title: 'Test', body: 'Body', choreKey: 'p/c' },
    );
    expect(result).toBe('ok');
  });

  it('returns gone on 410', async () => {
    mockSendNotification.mockRejectedValueOnce({ statusCode: 410 });
    const result = await sendToSubscription(
      { endpoint: 'https://fcm.example.com', keys: { p256dh: 'k', auth: 'a' } },
      { title: 'Test', body: 'Body', choreKey: 'p/c' },
    );
    expect(result).toBe('gone');
  });

  it('returns error on other failure', async () => {
    mockSendNotification.mockRejectedValueOnce({ statusCode: 500 });
    const result = await sendToSubscription(
      { endpoint: 'https://fcm.example.com', keys: { p256dh: 'k', auth: 'a' } },
      { title: 'Test', body: 'Body', choreKey: 'p/c' },
    );
    expect(result).toBe('error');
  });
});
```

- [ ] **Run test to verify it fails**

```bash
cd vapid-observer && bun test deliver.test.ts
```

Expected: FAIL — `./deliver` not found.

- [ ] **Create `vapid-observer/deliver.ts`**

```typescript
import webpush from 'web-push';
import { couchPut, couchDel } from './couch';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

const BACKOFF_BASE_S = 2;
const BLOCKED_UNTIL_RESET = '0001-01-01T00:00:00Z';
const DB_SUBS = 'push-subscriptions';

export type DeliveryResult = 'ok' | 'gone' | 'error';

export type Subscription = {
  _id: string;
  syncId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  failedAttempts: number;
  blockedUntil: string;
};

export type Payload = { title: string; body: string; choreKey: string };

export function buildBackoff(failedAttempts: number): { failedAttempts: number; blockedUntil: string } {
  if (failedAttempts === 0) {
    return { failedAttempts: 0, blockedUntil: BLOCKED_UNTIL_RESET };
  }
  const blockedUntil = new Date(
    Date.now() + (BACKOFF_BASE_S ** failedAttempts) * 1000,
  ).toISOString();
  return { failedAttempts, blockedUntil };
}

export async function sendToSubscription(
  sub: Pick<Subscription, 'endpoint' | 'keys'>,
  payload: Payload,
): Promise<DeliveryResult> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify(payload),
    );
    return 'ok';
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 410 || status === 404) return 'gone';
    return 'error';
  }
}

export async function deliverToSubscriptions(
  subscriptions: Subscription[],
  payload: Payload,
): Promise<boolean> {
  let anySuccess = false;
  for (const sub of subscriptions) {
    const result = await sendToSubscription(sub, payload);
    if (result === 'gone') {
      await couchDel(DB_SUBS, sub._id);
    } else if (result === 'error') {
      const backoff = buildBackoff(sub.failedAttempts + 1);
      await couchPut(DB_SUBS, sub._id, { ...sub, ...backoff });
    } else {
      anySuccess = true;
      if (sub.failedAttempts > 0) {
        await couchPut(DB_SUBS, sub._id, { ...sub, ...buildBackoff(0) });
      }
    }
  }
  return anySuccess;
}
```

- [ ] **Run tests to verify they pass**

```bash
cd vapid-observer && bun test deliver.test.ts
```

Expected: PASS.

- [ ] **Commit**

```bash
git add vapid-observer/deliver.ts vapid-observer/deliver.test.ts
git commit -m "feat(vapid-observer): add VAPID delivery and exponential backoff"
```

---

## Task 9: vapid-observer — poll loop and entry point

**Files:**
- Create: `vapid-observer/index.ts`
- Create: `vapid-observer/Dockerfile`

- [ ] **Create `vapid-observer/index.ts`**

```typescript
import { couchFind, couchPut, couchDel, couchChanges, ensureDb, ensureIndex } from './couch';
import { computeNextNotificationAt, type Recurrence, type DuePeriod } from './scheduler';
import { deliverToSubscriptions, type Subscription, type Payload } from './deliver';

const DB_SCHEDULES = 'push-schedules';
const DB_SUBS = 'push-subscriptions';
const BLOCKED_UNTIL_RESET = '0001-01-01T00:00:00Z';
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 60_000);

type ScheduleDoc = {
  _id: string;
  syncId: string;
  choreKey: string;
  title: string;
  recurrence: Recurrence;
  duePeriod?: DuePeriod;
  trigger: 'at-due-time' | 'test';
  lastDeliveredAt: string | null;
  nextNotificationAt: string;
};

async function poll() {
  const now = new Date().toISOString();
  let due: ScheduleDoc[];
  try {
    due = await couchFind<ScheduleDoc>(DB_SCHEDULES, {
      nextNotificationAt: { $lte: now },
      trigger: { $ne: 'test' },
    });
  } catch (err) {
    console.error('[poll] CouchDB unavailable:', err);
    return;
  }

  for (const schedule of due) {
    const subs = await couchFind<Subscription>(DB_SUBS, {
      syncId: schedule.syncId,
      blockedUntil: { $lte: now },
    });

    if (subs.length === 0) continue;

    const payload: Payload = {
      title: schedule.title,
      body: `${schedule.title} is due`,
      choreKey: schedule.choreKey,
    };

    const anySuccess = await deliverToSubscriptions(subs, payload);

    if (anySuccess) {
      const lastDeliveredAt = now;
      const nextNotificationAt = computeNextNotificationAt(
        schedule.recurrence,
        schedule.duePeriod,
        'at-due-time',
        lastDeliveredAt,
      );
      await couchPut(DB_SCHEDULES, schedule._id, { ...schedule, lastDeliveredAt, nextNotificationAt });
    }
  }
}

async function handleTestDoc(docId: string) {
  const syncId = docId.slice(0, docId.indexOf('/~test'));
  const now = new Date().toISOString();

  const subs = await couchFind<Subscription>(DB_SUBS, {
    syncId,
    blockedUntil: { $lte: now },
  });

  const payload: Payload = {
    title: 'Tasks Harmony',
    body: 'Notifications are working correctly!',
    choreKey: '',
  };

  await deliverToSubscriptions(subs, payload);
  await couchDel(DB_SCHEDULES, docId);
}

async function watchChanges(signal: AbortSignal) {
  let since = 'now';
  while (!signal.aborted) {
    try {
      const result = await couchChanges(DB_SCHEDULES, since, signal);
      since = result.last_seq;
      for (const change of result.results) {
        if (change.id.includes('/~test')) {
          await handleTestDoc(change.id);
        } else {
          await poll();
        }
      }
    } catch {
      if (!signal.aborted) await Bun.sleep(5_000);
    }
  }
}

// Startup
await ensureDb(DB_SUBS);
await ensureDb(DB_SCHEDULES);
await ensureIndex(DB_SUBS, ['syncId', 'blockedUntil']);
await ensureIndex(DB_SCHEDULES, ['nextNotificationAt']);
await ensureIndex(DB_SCHEDULES, ['syncId']);

console.log('[vapid-observer] started');

const ac = new AbortController();
process.on('SIGTERM', () => ac.abort());

// Start _changes watcher and poll loop concurrently
void watchChanges(ac.signal);

while (!ac.signal.aborted) {
  await poll();
  await Bun.sleep(POLL_INTERVAL_MS);
}
```

- [ ] **Create `vapid-observer/Dockerfile`**

```dockerfile
FROM oven/bun:1 AS base
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .

CMD ["bun", "run", "index.ts"]
```

- [ ] **Commit**

```bash
git add vapid-observer/index.ts vapid-observer/Dockerfile
git commit -m "feat(vapid-observer): add poll loop, _changes listener, and Dockerfile"
```

---

## Task 10: Service worker — push and notificationclick handlers

**Files:**
- Modify: `vite.config.ts`
- Create: `src/sw.ts`

The existing config uses the `workbox` (generateSW) strategy. Switching to `injectManifest` lets us write custom service worker code while keeping Workbox's caching.

- [ ] **Update `vite.config.ts`**

Replace the `VitePWA({...})` block:

```typescript
VitePWA({
  registerType: 'prompt',
  devOptions: { enabled: true },
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'sw.ts',
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
```

- [ ] **Create `src/sw.ts`**

```typescript
/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;
  const { title, body, choreKey } = event.data.json() as {
    title: string;
    body: string;
    choreKey: string;
  };
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      data: { choreKey },
    }),
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const choreKey = (event.notification.data as { choreKey?: string }).choreKey;
  const url = choreKey ? `/chores/${encodeURIComponent(choreKey)}` : '/';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => c.url.includes(url));
        if (existing) return existing.focus();
        return self.clients.openWindow(url);
      }),
  );
});
```

- [ ] **Add workbox packages** (required by `injectManifest`)

```bash
bun add -d workbox-precaching
```

- [ ] **Verify build succeeds**

```bash
bun run build 2>&1 | tail -5
```

Expected: build completes without errors.

- [ ] **Commit**

```bash
git add vite.config.ts src/sw.ts bun.lock
git commit -m "feat(pwa): switch to injectManifest and add push/notificationclick handlers"
```

---

## Task 11: Push API client (`src/sync/pushApi.ts`)

**Files:**
- Create: `src/sync/pushApi.ts`
- Modify: `src/vite-env.d.ts`

The push API calls reuse the session token from localStorage. If a call returns 401, the session token is cleared so the next sync's `authorizedFetch` will re-authenticate.

- [ ] **Add `VITE_PUSH_URL` to `src/vite-env.d.ts`**

```typescript
interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string;
  readonly VITE_BUILD_DATE: string;
  readonly VITE_SYNC_URL: string;
  readonly VITE_PUSH_URL: string; // same origin as VITE_SYNC_URL unless split
}
```

In practice `VITE_PUSH_URL` equals `VITE_SYNC_URL` — they share the same server. The separate var allows future splitting.

- [ ] **Create `src/sync/pushApi.ts`**

```typescript
const PUSH_URL = import.meta.env.VITE_PUSH_URL ?? import.meta.env.VITE_SYNC_URL;
const SESSION_KEY = 'sync-session-token';

function sessionHeaders(): Record<string, string> {
  const token = localStorage.getItem(SESSION_KEY);
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

async function pushFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${PUSH_URL}${path}`, {
    ...init,
    headers: { ...sessionHeaders(), ...init?.headers },
  });
  if (res.status === 401) localStorage.removeItem(SESSION_KEY);
  return res;
}

export async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch(`${PUSH_URL}/push/vapid-public-key`);
    if (!res.ok) return null;
    const { publicKey } = await res.json() as { publicKey: string };
    return publicKey;
  } catch { return null; }
}

export async function registerSubscription(
  endpoint: string,
  keys: { p256dh: string; auth: string },
): Promise<boolean> {
  try {
    const res = await pushFetch('/push/subscriptions', {
      method: 'PUT',
      body: JSON.stringify({ endpoint, keys }),
    });
    return res.ok;
  } catch { return false; }
}

export async function unregisterSubscription(endpoint: string): Promise<void> {
  try {
    await pushFetch('/push/subscriptions', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint }),
    });
  } catch { /* best-effort */ }
}

export async function sendTestNotification(): Promise<void> {
  try {
    await pushFetch('/push/test', { method: 'POST' });
  } catch { /* best-effort */ }
}

export interface ServerSchedule {
  choreKey: string;
  nextNotificationAt: string;
}

export async function fetchSchedules(): Promise<ServerSchedule[]> {
  try {
    const res = await pushFetch('/push/schedules');
    if (!res.ok) return [];
    return res.json() as Promise<ServerSchedule[]>;
  } catch { return []; }
}

export async function upsertSchedule(
  packId: string,
  choreId: string,
  body: {
    title: string;
    recurrence: { frequency: string; interval: number; startDate: string; windowStartTime: string };
    duePeriod?: { value: number; unit: string };
    trigger: 'at-due-time';
  },
): Promise<void> {
  try {
    await pushFetch(`/push/schedules/${packId}/${choreId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  } catch { /* best-effort */ }
}

export async function deleteSchedule(packId: string, choreId: string): Promise<void> {
  try {
    await pushFetch(`/push/schedules/${packId}/${choreId}`, { method: 'DELETE' });
  } catch { /* best-effort */ }
}
```

- [ ] **Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Commit**

```bash
git add src/sync/pushApi.ts src/vite-env.d.ts
git commit -m "feat(pwa): add push API client"
```

---

## Task 12: `usePushNotifications` hook

**Files:**
- Create: `src/hooks/usePushNotifications.ts`

- [ ] **Create `src/hooks/usePushNotifications.ts`**

```typescript
import { useState, useEffect } from 'react';
import {
  fetchVapidPublicKey,
  registerSubscription,
  unregisterSubscription,
  sendTestNotification,
} from '@/sync/pushApi';

const VAPID_KEY_STORAGE = 'push-vapid-key';

export type PushPermissionState = NotificationPermission | 'unsupported';

export interface PushNotificationState {
  supported: boolean;
  permission: PushPermissionState;
  loading: boolean;
  requestPermission: () => Promise<void>;
  sendTest: () => Promise<void>;
}

function isSupported(): boolean {
  return (
    typeof Notification !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    location.protocol === 'https:'
  );
}

function base64urlToUint8Array(base64url: string): Uint8Array {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, '=');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function subscriptionToKeys(sub: PushSubscription): { p256dh: string; auth: string } {
  const p256dh = btoa(
    String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')!)),
  ).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const auth = btoa(
    String.fromCharCode(...new Uint8Array(sub.getKey('auth')!)),
  ).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return { p256dh, auth };
}

async function subscribe(publicKey: string): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64urlToUint8Array(publicKey),
  });
  localStorage.setItem(VAPID_KEY_STORAGE, publicKey);
  await registerSubscription(sub.endpoint, subscriptionToKeys(sub));
}

export function usePushNotifications(): PushNotificationState {
  const supported = isSupported();
  const [permission, setPermission] = useState<PushPermissionState>(
    supported ? Notification.permission : 'unsupported',
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supported || Notification.permission !== 'granted') return;
    void (async () => {
      const serverKey = await fetchVapidPublicKey();
      if (!serverKey) return;
      const storedKey = localStorage.getItem(VAPID_KEY_STORAGE);
      if (storedKey && storedKey !== serverKey) {
        // Key rotated — unsubscribe old
        const reg = await navigator.serviceWorker.ready;
        const oldSub = await reg.pushManager.getSubscription();
        if (oldSub) {
          await unregisterSubscription(oldSub.endpoint);
          await oldSub.unsubscribe();
        }
      }
      await subscribe(serverKey);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function requestPermission() {
    if (!supported) return;
    setLoading(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === 'granted') {
        const serverKey = await fetchVapidPublicKey();
        if (serverKey) {
          await subscribe(serverKey);
          await sendTestNotification();
        }
      }
    } finally {
      setLoading(false);
    }
  }

  return {
    supported,
    permission,
    loading,
    requestPermission,
    sendTest: sendTestNotification,
  };
}
```

- [ ] **Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Commit**

```bash
git add src/hooks/usePushNotifications.ts
git commit -m "feat(pwa): add usePushNotifications hook"
```

---

## Task 13: `useScheduleSync` hook

**Files:**
- Create: `src/hooks/useScheduleSync.ts`
- Modify: `src/hooks/useSync.ts`

- [ ] **Create `src/hooks/useScheduleSync.ts`**

```typescript
import { useAppStore } from '@/store';
import { resolveNotificationsEnabled } from '@/lib/notifications';
import { fetchSchedules, upsertSchedule, deleteSchedule } from '@/sync/pushApi';

export function useScheduleSync() {
  const chores = useAppStore((s) => s.chores);
  const packs = useAppStore((s) => s.packs);
  const profile = useAppStore((s) => s.profile);

  async function reconcile() {
    if (!profile) return;

    const [serverSchedules] = await Promise.all([fetchSchedules()]);
    const serverKeys = new Set(serverSchedules.map((s) => s.choreKey));

    const localEnabled = chores.filter((chore) => {
      const pack = packs.find((p) => p.id === chore.packId);
      if (!pack) return false;
      return resolveNotificationsEnabled(chore, pack, profile);
    });

    const localKeys = new Set(localEnabled.map((c) => c.key));

    // Upsert missing schedules
    for (const chore of localEnabled) {
      if (!serverKeys.has(chore.key)) {
        await upsertSchedule(chore.packId, chore.choreId, {
          title: chore.title,
          recurrence: chore.recurrence,
          ...(chore.duePeriod ? { duePeriod: chore.duePeriod } : {}),
          trigger: 'at-due-time',
        });
      }
    }

    // Delete orphaned server schedules
    for (const { choreKey } of serverSchedules) {
      if (!localKeys.has(choreKey)) {
        const [packId, choreId] = choreKey.split('/') as [string, string];
        await deleteSchedule(packId, choreId);
      }
    }
  }

  return { reconcile };
}
```

- [ ] **Wire reconciliation into `src/hooks/useSync.ts`**

Add import at the top of `useSync.ts`:

```typescript
import { useScheduleSync } from './useScheduleSync';
```

Inside `useSync`, add:

```typescript
const { reconcile } = useScheduleSync();
```

In the startup pull `useEffect`, after `await reload()`:

```typescript
pull(db).then(async (result) => {
  if (result.imported) {
    await reload();
    void reconcile();
  } else {
    void reconcile();
  }
});
```

- [ ] **Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Commit**

```bash
git add src/hooks/useScheduleSync.ts src/hooks/useSync.ts
git commit -m "feat(pwa): add schedule reconciliation hook, wire into useSync"
```

---

## Task 14: `NotificationsPanel` component

**Files:**
- Create: `src/components/notifications/NotificationsPanel.tsx`

- [ ] **Create `src/components/notifications/NotificationsPanel.tsx`**

```tsx
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { Button } from '@/components/ui/button';

export function NotificationsPanel() {
  const { supported, permission, loading, requestPermission, sendTest } = usePushNotifications();

  return (
    <section className="rounded-lg border border-border bg-background p-4 shadow-sm space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Notifications
      </h2>

      {!supported && (
        <p className="text-sm text-muted-foreground">
          Push notifications require the app to be installed. Add it to your home screen, then return here.
        </p>
      )}

      {supported && permission === 'denied' && (
        <p className="text-sm text-muted-foreground">
          Notifications are blocked. Enable them in your browser or OS settings.
        </p>
      )}

      {supported && permission === 'default' && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Enable push notifications to receive reminders for due chores.
          </p>
          <Button onClick={requestPermission} disabled={loading} size="sm">
            {loading ? 'Enabling…' : 'Enable notifications'}
          </Button>
        </div>
      )}

      {supported && permission === 'granted' && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Notifications are enabled.</p>
          <Button variant="outline" size="sm" onClick={sendTest}>
            Send test notification
          </Button>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Add `NotificationsPanel` to `ProfilePage`**

In `src/components/profile/ProfilePage.tsx`, import and render `NotificationsPanel` alongside the existing `SyncPanel`:

```typescript
import { NotificationsPanel } from '@/components/notifications/NotificationsPanel';
```

Add `<NotificationsPanel />` after `<SyncPanel />` in the JSX.

- [ ] **Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Commit**

```bash
git add src/components/notifications/NotificationsPanel.tsx src/components/profile/ProfilePage.tsx
git commit -m "feat(pwa): add NotificationsPanel component"
```

---

## Task 15: Per-chore notification toggle in ChoreFormModal

**Files:**
- Modify: `src/components/chores/ChoreFormModal.tsx`

The chore form already has an XP size selector and other fields. The notification toggle follows the same pattern: a 3-way `Default / On / Off` selector, only shown when push is supported and permission is not `denied`.

- [ ] **Add notification toggle to `src/components/chores/ChoreFormModal.tsx`**

Add import:

```typescript
import { usePushNotifications } from '@/hooks/usePushNotifications';
import type { NotificationToggle } from '@/types';
```

Inside the component, add:

```typescript
const { supported, permission } = usePushNotifications();
const showNotificationToggle = supported && permission !== 'denied';
```

Add state for the notification setting (initialised from existing chore if editing):

```typescript
const [notificationEnabled, setNotificationEnabled] = useState<NotificationToggle>(
  chore?.notifications?.enabled ?? 'default',
);
```

Add toggle UI inside the form (after XP size selector):

```tsx
{showNotificationToggle && (
  <div className="space-y-2">
    <Label>Notifications</Label>
    <div className="flex gap-2">
      {(['default', 'on', 'off'] as const).map((v) => (
        <Button
          key={v}
          type="button"
          variant={notificationEnabled === v ? 'default' : 'outline'}
          size="sm"
          onClick={() => setNotificationEnabled(v)}
        >
          {v === 'default' ? 'Default' : v === 'on' ? 'On' : 'Off'}
        </Button>
      ))}
    </div>
  </div>
)}
```

When saving the chore, include the notification setting:

```typescript
// In the save handler, add to chore data:
notifications: showNotificationToggle
  ? { enabled: notificationEnabled, trigger: 'at-due-time' as const }
  : chore?.notifications,
```

- [ ] **Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Commit**

```bash
git add src/components/chores/ChoreFormModal.tsx
git commit -m "feat(pwa): add per-chore notification toggle to ChoreFormModal"
```

---

## Task 16: Pack and profile notification defaults

**Files:**
- Modify: `src/components/profile/ProfilePage.tsx`
- Locate and modify the pack settings component (find via `grep -r "PackManifest\|packId.*title" src/components/packs/ --include="*.tsx" -l`)

- [ ] **Find the pack settings component**

```bash
grep -r "renamePack\|PackManifest" src/components --include="*.tsx" -l
```

Open the matching file and locate where pack properties (title, description) are edited.

- [ ] **Add `defaultNotifications` to pack settings**

In `src/components/packs/PackOptionsModal.tsx`:

Add import:
```typescript
import type { NotificationToggle } from '@/types';
import { usePushNotifications } from '@/hooks/usePushNotifications';
```

Add state after the existing state declarations:
```typescript
const { supported, permission } = usePushNotifications();
const showNotificationToggle = supported && permission !== 'denied';
const [defaultNotifications, setDefaultNotifications] = useState<NotificationToggle>(
  pack.manifest.defaultNotifications ?? 'default',
);
```

Add `defaultNotifications` to the `updatePackManifest` call in `handleSave`:
```typescript
await updatePackManifest(pack.id, {
  title: title.trim(),
  description: description.trim() || undefined,
  streak,
  decay,
  xpTarget: xpTargetVal,
  targetDate: targetDateVal,
  allowShiftOnImport,
  defaultXPSize: defaultXPSizeVal,
  ...(showNotificationToggle ? { defaultNotifications } : {}),
});
```

Add toggle UI inside the form (after the `defaultXPSize` section):
```tsx
{showNotificationToggle && (
  <div className="space-y-2">
    <Label>Default notifications for chores in this pack</Label>
    <div className="flex gap-2">
      {(['default', 'on', 'off'] as const).map((v) => (
        <Button
          key={v}
          type="button"
          variant={defaultNotifications === v ? 'default' : 'outline'}
          size="sm"
          onClick={() => setDefaultNotifications(v)}
        >
          {v === 'default' ? 'Default' : v === 'on' ? 'On' : 'Off'}
        </Button>
      ))}
    </div>
  </div>
)}
```

- [ ] **Add global `defaultNotifications` to ProfilePage**

In `src/components/profile/ProfilePage.tsx`, locate the profile edit form. Add:

```tsx
<div className="space-y-2">
  <Label>Default notifications for new chores</Label>
  <div className="flex gap-2">
    {(['off', 'on'] as const).map((v) => (
      <Button
        key={v}
        type="button"
        variant={(profile?.defaultNotifications ?? 'off') === v ? 'default' : 'outline'}
        size="sm"
        onClick={() => void updateProfile({ ...profile!, defaultNotifications: v })}
      >
        {v === 'on' ? 'On' : 'Off'}
      </Button>
    ))}
  </div>
</div>
```

- [ ] **Typecheck and run tests**

```bash
bun run typecheck && bun run test
```

Expected: no errors, all tests pass.

- [ ] **Commit**

```bash
git add src/components/profile/ProfilePage.tsx src/components/packs/
git commit -m "feat(pwa): add global and per-pack notification defaults"
```

---

## Task 17: Docker deployment

**Files:**
- Locate the project's `docker-compose.yml` or deployment config

- [ ] **Add CouchDB service**

In the compose file, add:

```yaml
couchdb:
  image: couchdb:3
  environment:
    COUCHDB_USER: ${COUCHDB_USER}
    COUCHDB_PASSWORD: ${COUCHDB_PASSWORD}
  volumes:
    - couchdb-data:/opt/couchdb/data
  restart: unless-stopped
```

Add `couchdb-data` to the top-level `volumes` block.

- [ ] **Add vapid-observer service**

```yaml
vapid-observer:
  build: ./vapid-observer
  environment:
    COUCHDB_URL: http://couchdb:5984
    COUCHDB_USER: ${COUCHDB_USER}
    COUCHDB_PASSWORD: ${COUCHDB_PASSWORD}
    VAPID_PUBLIC_KEY: ${VAPID_PUBLIC_KEY}
    VAPID_PRIVATE_KEY: ${VAPID_PRIVATE_KEY}
    VAPID_SUBJECT: ${VAPID_SUBJECT}
    POLL_INTERVAL_MS: 60000
  depends_on:
    - couchdb
  restart: unless-stopped
```

- [ ] **Add CouchDB env vars to sync-server service**

```yaml
sync-server:
  # ... existing config ...
  environment:
    # ... existing vars ...
    COUCHDB_URL: http://couchdb:5984
    COUCHDB_USER: ${COUCHDB_USER}
    COUCHDB_PASSWORD: ${COUCHDB_PASSWORD}
    VAPID_PUBLIC_KEY: ${VAPID_PUBLIC_KEY}
```

- [ ] **Generate VAPID keys (one-time, store in secrets)**

```bash
cd vapid-observer && bun -e "
const webpush = (await import('web-push')).default;
const keys = webpush.generateVAPIDKeys();
console.log('VAPID_PUBLIC_KEY=' + keys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + keys.privateKey);
"
```

Store these in the CD pipeline as secrets. Never commit to version control.

- [ ] **Commit**

```bash
git add docker-compose.yml  # or equivalent
git commit -m "feat(deploy): add CouchDB and vapid-observer services to compose"
```

---

## End-to-end verification

- [ ] **Start all services**

```bash
docker compose up --build
```

- [ ] **Open the app on an iOS 16.4+ or Android device, installed as PWA**

Navigate to Profile → find `NotificationsPanel` → tap "Enable notifications" → grant permission.

- [ ] **Verify test notification arrives within a few seconds**

The sentinel `trigger: "test"` document triggers the `_changes` listener in the observer, which delivers immediately.

- [ ] **Enable notifications on a chore, wait for the next scheduled window**

The observer poll loop fires every 60s. Confirm the notification arrives at `nextNotificationAt`.

- [ ] **Tap the notification — verify deep link opens the correct chore**
