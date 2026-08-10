# Push Notifications Design

**Issue:** #14 — Push notifications: reminders on iOS and Android
**Scope:** Feasibility and architecture slice — notification infrastructure, permission flows, and at least one working notification type end-to-end.

---

## Background

Tasks Harmony is a PWA running locally in each user's browser. A central sync server handles multiple users (low count) with multiple devices each. The app state is end-to-end encrypted — the server stores only an opaque blob and cannot read chore schedules. This means all scheduling logic must originate client-side.

Prior research (issue comment) established that service-worker-only local notifications are unreliable on mobile when the app is closed, and that a VAPID server is required for reliable delivery on both iOS (16.4+) and Android.

---

## Architecture

Five components, three new:

```
┌─────────────────────────┐         ┌──────────────────────────┐
│  PWA (browser)          │         │  sync-server/            │
│                         │──auth──▶│  existing blob handlers   │
│  - notification UI      │         │                           │
│  - push subscription    │──push──▶│  new push handlers        │
│  - schedule upload      │         │  (subscription, schedule) │
│  - service worker       │         └──────────┬───────────────┘
│    (receives push,      │                    │ read/write
│     shows notification) │         ┌──────────▼───────────────┐
└─────────────────────────┘         │  CouchDB                  │
                                    │  subscriptions + schedules│
                                    └──────────▲───────────────┘
                                               │ read/write
                                    ┌──────────┴───────────────┐
                                    │  vapid-observer/          │
                                    │  polls CouchDB, sends     │
                                    │  VAPID pushes             │
                                    └──────────────────────────┘

Shared: Redis (session tokens, nonces — existing)
```

### Deployment containers

| Container | Role |
|---|---|
| `sync-server` | existing + new push registration endpoints |
| `vapid-observer` | new — polls CouchDB, sends VAPID pushes |
| `couchdb` | new — persistent document store |
| `redis` | existing — session tokens, nonces |

`sync-server` and `vapid-observer` both connect to CouchDB. Only `sync-server` connects to Redis (for session token validation). The two services have no direct dependency on each other.

---

## Data Model (CouchDB)

### `push-subscriptions` database

One document per device. A user with multiple devices has multiple documents sharing the same `syncId`.

```json
{
  "_id": "sub-<sha256(endpoint)>",
  "syncId": "<64-char hex>",
  "endpoint": "https://fcm.googleapis.com/...",
  "keys": { "p256dh": "...", "auth": "..." },
  "createdAt": "2026-08-10T12:00:00Z",
  "failedAttempts": 0,
  "blockedUntil": 0
}
```

`failedAttempts` and `blockedUntil` (Unix ms, `0` = epoch = not blocked) implement per-subscription delivery backoff. Index on `{ syncId, blockedUntil }`.

### `push-schedules` database

One document per user per chore. `_id` is the compound `<syncId>/<packId>/<choreId>`, enforcing uniqueness natively — no separate index needed. PUT to the same `_id` is a natural upsert; DELETE by `_id` removes the schedule.

```json
{
  "_id": "<syncId>/<packId>/<choreId>",
  "syncId": "<64-char hex>",
  "choreKey": "my-pack/take-out-trash",
  "title": "Take out trash",
  "recurrence": {
    "frequency": "daily",
    "interval": 1,
    "startDate": "2026-01-01",
    "windowStartTime": "09:00"
  },
  "duePeriod": { "value": 2, "unit": "hours" },
  "trigger": "at-due-time",
  "lastDeliveredAt": null,
  "nextNotificationAt": "2026-08-11T09:00:00Z",
  "updatedAt": "2026-08-10T12:00:00Z"
}
```

`nextNotificationAt` is stored (not computed at query time) so CouchDB can index and filter on it. Index on `nextNotificationAt`. Schedule documents are persistent — they live as long as notifications are enabled for the chore.

---

## API Surface (sync-server)

All authenticated routes use `Authorization: Bearer <sessionToken>`. The handler resolves `syncId` from Redis exactly as `blob.ts` does.

### Unauthenticated

```
GET /push/vapid-public-key
→ 200 { "publicKey": "BN..." }
```

The PWA needs the VAPID public key before calling `pushManager.subscribe()`. Public key is not sensitive.

### Authenticated

```
GET    /push/schedules
PUT    /push/subscriptions
DELETE /push/subscriptions
PUT    /push/schedules/<packId>/<choreId>
DELETE /push/schedules/<packId>/<choreId>
```

`packId` and `choreId` are guaranteed slugs (lowercase alphanumeric and hyphens), so the slash in the URL path requires no encoding.

**`GET /push/schedules`**
Returns choreKeys and next notification times for the authenticated user. Used by the PWA for reconciliation on startup. The server strips the `<syncId>/` prefix from each document `_id` to derive `choreKey`.
```json
→ 200 [{ "choreKey": "my-pack/take-out-trash", "nextNotificationAt": "2026-08-11T09:00:00Z" }]
```

**`PUT /push/subscriptions`** — registers or refreshes a device subscription:
```json
{ "endpoint": "https://fcm.googleapis.com/...", "keys": { "p256dh": "...", "auth": "..." } }
```
Upserts by `_id = sub-<sha256(endpoint)>`. Sets `failedAttempts: 0, blockedUntil: 0` on write.

**`DELETE /push/subscriptions`** — unregisters a device:
```json
{ "endpoint": "https://fcm.googleapis.com/..." }
```

**`PUT /push/schedules/<packId>/<choreId>`** — upserts a chore's notification schedule. Server computes `nextNotificationAt` from `recurrence` and the existing `lastDeliveredAt` (null on first write).
```json
{
  "title": "Take out trash",
  "recurrence": { "frequency": "daily", "interval": 1, "startDate": "2026-01-01", "windowStartTime": "09:00" },
  "duePeriod": { "value": 2, "unit": "hours" },
  "trigger": "at-due-time"
}
```

**`DELETE /push/schedules/<packId>/<choreId>`** — removes the schedule when the user disables notifications for a chore or when the chore is deleted.

### Validation

Server rejects with `400 Bad Request` for:
- `recurrence.frequency` not in `['daily', 'weekly', 'monthly']`
- `recurrence.interval` less than 1
- Unknown `trigger` value
- `duePeriod` present but malformed
- More than 500 schedule documents for the authenticated `syncId`

### Response codes

| Code | Meaning |
|---|---|
| 200 | Success with body (GET) |
| 204 | Success (PUT / DELETE) |
| 400 | Validation failure |
| 401 | Missing or invalid session token |
| 507 | Schedule cap exceeded |

---

## VAPID Observer

### Directory structure

```
vapid-observer/
  index.ts       — entry point, starts poll loop and _changes listener
  couch.ts       — CouchDB client (plain fetch, no driver)
  scheduler.ts   — nextNotificationAt computation
  deliver.ts     — VAPID send + backoff updates
  Dockerfile
  package.json
```

### Environment variables

| Variable | Used by |
|---|---|
| `VAPID_PUBLIC_KEY` | sync-server + observer |
| `VAPID_PRIVATE_KEY` | observer only |
| `VAPID_SUBJECT` | observer only (mailto: or URL) |
| `COUCHDB_URL` | both |
| `COUCHDB_USER` / `COUCHDB_PASSWORD` | both |
| `POLL_INTERVAL_MS` | observer (default 60000) |

### Indexes created on startup (if absent)

- `push-schedules`: index on `nextNotificationAt`
- `push-subscriptions`: index on `{ syncId, blockedUntil }`

### Poll loop

Runs every `POLL_INTERVAL_MS` (default 60s). CouchDB unavailability is logged and the loop continues at the normal interval — no backoff on connectivity failure.

```
1. Query push-schedules:
   { "selector": { "nextNotificationAt": { "$lte": <now_iso> } } }

2. For each due schedule:
   a. Query push-subscriptions:
      { "selector": { "syncId": "<syncId>", "blockedUntil": { "$lte": <now_ms> } } }
   b. For each eligible subscription, send VAPID push
   c. On 410 or 404 from push service: DELETE subscription document
   d. On other delivery failure: update subscription backoff (see below)
   e. On any successful delivery: reset subscription backoff, update schedule

3. Update schedule: lastDeliveredAt = now, nextNotificationAt = next window start
```

### `nextNotificationAt` computation

```
base = recurrence.startDate + recurrence.windowStartTime (as datetime)
period = recurrence.interval × (daily → 1 day | weekly → 7 days | monthly → 1 month)
advance base by period repeatedly until result > lastDeliveredAt (or > now if lastDeliveredAt is null)

trigger 'at-due-time' without duePeriod: fire at window start
trigger 'at-due-time' with duePeriod:   fire at (window start + period - duePeriod)
```

### Delivery backoff (per subscription)

```typescript
const BACKOFF_BASE_S = 2; // change this constant to tune the entire backoff curve

// On delivery failure (non-410/404):
failedAttempts += 1;
blockedUntil = Date.now() + (BACKOFF_BASE_S ** failedAttempts) * 1000;
// PUT updated failedAttempts + blockedUntil to CouchDB subscription document

// On successful delivery:
failedAttempts = 0;
blockedUntil = 0;
// PUT reset values to CouchDB subscription document

// On new subscription document via _changes (push-subscriptions):
// sync-server already writes failedAttempts: 0, blockedUntil: 0 on PUT
// no additional action needed in observer
```

`blockedUntil: 0` (epoch) always satisfies `<= now`, so the CouchDB query naturally includes unblocked subscriptions with no special case. Backoff state is persisted in CouchDB and survives observer restarts. Without a cap, permanently broken endpoints that never return 410/404 eventually reach intervals measured in days — an effective soft-off that resets on the next successful delivery.

### `_changes` listener

Maintains two concurrent long-poll subscriptions to CouchDB:

- `push-schedules/_changes` — triggers an immediate poll when a new or updated schedule document arrives (user just enabled notifications; deliver promptly rather than wait for the next timed poll)
- `push-subscriptions/_changes` — no immediate action needed; `failedAttempts: 0, blockedUntil: 0` is already written by the sync-server on PUT

### Notification content

For the initial slice, the observer generates:
- `title`: `schedule.title`
- `body`: `"<title> is due"`

Body generation strategy to be refined in a follow-up.

### Delivery semantics

At-least-once: if a push is sent successfully but the subsequent CouchDB update of `lastDeliveredAt` fails, the next poll re-sends the notification. Occasional duplicates are acceptable for a reminder system.

---

## Client-side Changes

### 1. Notification settings — cascade

Three levels resolve the effective notification state for each chore:

```
global (UserProfile):    'on' | 'off'
pack   (PackManifest):   'on' | 'off' | 'default'
chore  (Chore):          'on' | 'off' | 'default'
```

**Type additions:**

```typescript
// UserProfile gains:
defaultNotifications?: 'on' | 'off'; // absent = 'off' (backwards-compatible default)

// PackManifest gains:
defaultNotifications?: 'on' | 'off' | 'default'; // absent = 'default'

// Chore.notifications becomes:
interface ChoreNotificationSettings {
  enabled: 'on' | 'off' | 'default';
  trigger: 'at-due-time';
}
```

**Resolution utility:**

```typescript
function resolveNotificationsEnabled(chore: Chore, pack: Pack, profile: UserProfile): boolean {
  const choreLevel = chore.notifications?.enabled ?? 'default';
  if (choreLevel !== 'default') return choreLevel === 'on';
  const packLevel = pack.manifest.defaultNotifications ?? 'default';
  if (packLevel !== 'default') return packLevel === 'on';
  return profile.defaultNotifications === 'on';
}
```

When creating a new chore, `notifications` is pre-filled from `pack.manifest.defaultNotifications` — consistent with how `defaultXPSize` already works.

### 2. Service worker

The existing service worker (via `vite-plugin-pwa`) must be extended with push handlers. This requires switching to the `injectManifest` strategy so custom code can be added.

```
push event:
  parse payload → { title, body, choreKey }
  self.registration.showNotification(title, { body, data: { choreKey } })

notificationclick event:
  event.notification.close()
  clients.openWindow(`/chores/${encodeURIComponent(choreKey)}`)
  — or focus existing window if already open
```

### 3. `usePushNotifications` hook

Owns permission state, subscription lifecycle, and VAPID key rotation detection.

```
on mount:
  1. Check support: Notification API + serviceWorker + HTTPS
     — if absent: state = 'unsupported', return
  2. If permission = 'granted':
     a. Fetch GET /push/vapid-public-key
     b. Compare with key in localStorage ('push-vapid-key')
     c. If changed: unsubscribe old → subscribe with new key → store new key
     d. PUT /push/subscriptions (idempotent upsert)

requestPermission():
  1. Notification.requestPermission()
  2. If 'granted':
     a. pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
     b. PUT /push/subscriptions with endpoint + keys
     c. Store VAPID public key in localStorage

Exposes: { supported, permission, requestPermission, loading }
```

### 4. Schedule reconciliation

Runs after every successful sync pull (triggered from `useSync`):

```
1. GET /push/schedules → server schedule list
2. localEnabled = chores where resolveNotificationsEnabled(...) = true
3. For each localEnabled chore not in server list: PUT /push/schedules/<packId>/<choreId>
4. For each server choreKey not matching a localEnabled chore: DELETE /push/schedules/<packId>/<choreId>
5. PUT /push/subscriptions (idempotent — ensures device subscription is current)
```

### 5. UI

**`NotificationsPanel`** (profile/settings area):
- Shows overall permission state
- "Enable notifications" button if permission is `'default'`
- Informative message directing to OS settings if `'denied'`
- "Install the app to enable notifications" if `'unsupported'` due to non-installed iOS PWA

**Pack settings** — gains "Notify new chores by default" selector: `Default / On / Off`

**Chore edit form** — gains notification toggle (only shown when supported and permission ≠ 'denied'): `Default / On / Off` with the resolved effective state shown when set to Default.

### 6. VAPID key rotation

No routine rotation schedule. When rotation is needed:
1. Generate new key pair, update env vars on sync-server and observer
2. On next app open, PWA detects key mismatch (localStorage vs. fetched), re-subscribes automatically
3. Old subscriptions are cleaned up by the observer when it receives 410/404 on next delivery attempt

---

## Error Handling

**`unsupported`** — Notification API or PushManager absent (HTTP, old iOS, non-installed PWA on iOS 16.3 and below). Show install prompt rather than a broken toggle.

**`denied`** — Static message directing to browser/OS settings. No re-prompt.

**Server failures (subscription/schedule PUT/DELETE)** — Best-effort, silent failure. Reconciliation on next startup corrects drift. Not surfaced to the user.

**At-least-once delivery** — If a push sends successfully but `lastDeliveredAt` update fails, the next poll re-delivers. Documented behaviour, not solved with distributed transactions.

**410/404 from push service** — Immediate subscription document deletion. No backoff.

**Non-410/404 push service errors** — Per-subscription exponential backoff stored in CouchDB (`failedAttempts`, `blockedUntil`). No cap — permanent failures become an effective soft-off. Resets on successful delivery or new subscription PUT.

---

## Acceptance Criteria (from issue #14)

- [ ] User can grant/deny notification permission from within the app
- [ ] At least one notification trigger works end-to-end (`at-due-time`)
- [ ] Per-chore notification settings (on/off/default) are configurable
- [ ] Notifications deep-link back to the relevant chore on tap
- [ ] Tested on both iOS and Android
- [ ] Notification payload respects user's chosen reminder mode
