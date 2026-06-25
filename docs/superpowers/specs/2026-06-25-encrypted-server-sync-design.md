# Encrypted Server Sync — Design Spec

**Date:** 2026-06-25
**Closes:** #17 (auto-sync), #32 (CORS)
**Follow-up filed:** #50 (pull-merge-push conflict resolution)

---

## 1. Overview

Replaces the manual WebDAV sync with automatic, end-to-end encrypted sync to the app server. The server stores opaque ciphertext — it never sees plaintext app data. A small Bun HTTP server handles sync endpoints; nginx proxies to it via a Unix socket. Redis stores nonces and session tokens.

**What changes for the user:**
- No more WebDAV URL to configure
- Sync happens automatically in the background
- A dedicated key export/import option in settings protects against data loss
- The existing manual app-state export gains an encrypted format (default)

---

## 2. Architecture

```
PRODUCTION
──────────────────────────────────────────────────────────────
nginx (existing, any user)
  rate limiting zones in http block (one-time manual setup)
  location /sync/* → unix:$SOCKET_DIR/sync.sock          (vars.SOCKET_DIR)

$SOCKET_DIR/sync.sock   mode 0666
  bind-mounted into sync container at /run/sync/sync.sock

Docker Compose  (isolated bridge network)
  sync  — Bun HTTP server
            reads SYNC_APP_SECRET and SYNC_BLOB_DIR from env
            writes blobs to /data named volume
            connects to redis:6379 on internal network
  redis — no exposed ports, AOF persistence

Volumes
  sync-data  /data in sync container  (encrypted blobs)
  redis-data                           (Redis AOF)

LOCAL DEVELOPMENT
──────────────────────────────────────────────────────────────
Vite dev server (:5173)
  proxy /sync/* → http://localhost:3001

docker compose -f docker-compose.dev.yml up -d   (Redis only, port 6379 on 127.0.0.1)
bun run sync:dev                                  (Bun on :3001, --watch)

.env.local
  SYNC_APP_SECRET=<any fixed dev value>
  VITE_SYNC_URL=http://localhost:3001
  REDIS_URL=redis://localhost:6379
  SYNC_BLOB_DIR=.dev-sync-data/
  SYNC_SOCKET=            ← empty → Bun uses TCP port 3001
```

**Dev/prod switch:** Bun checks `SYNC_SOCKET` — if set, listens on the Unix socket path; if empty, listens on `SYNC_PORT` (default 3001). No application code branches.

---

## 3. Key & Token Model

### Sync key

Generated once on first launch via Web Crypto API:

```
crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, extractable: true, ['encrypt', 'decrypt'])
```

Stored as a `CryptoKey` object in a dedicated `credentials` IndexedDB store (structured-clone safe). **Never included in app state exports or imports** — the `credentials` store is explicitly excluded from `exportAppState` and `importAppState`.

### Server token (permanent identity)

```
token = SHA-256(raw key bytes) → 64-char hex string
```

Used as:
- URL path segment: `/sync/{token}`
- Blob filename: `/data/{token}.enc`

Unguessable (256 bits of entropy). Changes only if the user imports a different key.

### Session token (ephemeral auth)

Issued by the server after a successful challenge-response. Stored in `localStorage` under `sync-session-token`. TTL 24 h (enforced in Redis). On 401 or expiry the client clears the entry and re-runs the challenge-response transparently.

### Encryption envelope (each push)

```
input      = JSON.stringify(appState)        ← AppState with syncState.lastSyncedAt set to now
compressed = CompressionStream('gzip')(input)
iv         = crypto.getRandomValues(new Uint8Array(12))   ← fresh per push
ciphertext = AES-256-GCM(key, iv, compressed)
stored     = iv (12 bytes) || ciphertext
```

Decryption reverses: strip IV → AES-256-GCM decrypt → DecompressionStream('gzip') → JSON.parse → schema validate.

---

## 4. Server

### Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/sync/challenge` | none | Returns `{ nonce }`, nonce stored in Redis `nonce:{id}` TTL 60 s |
| `POST` | `/sync/session` | HMAC proof | Validates challenge, stores `session:{token}` → sync token in Redis TTL 24 h, returns `{ sessionToken }` |
| `GET` | `/sync/:token` | session | Serves `/data/{token}.enc`, 404 if absent |
| `PUT` | `/sync/:token` | session | Overwrites blob; session's stored syncToken must equal `:token`; 1 MB cap |

No ETag check on `PUT` — last-write-wins. Conflict detection uses `appState.syncState.lastSyncedAt` after client-side decryption.

### Challenge-response detail

```
Client                                   Server
  GET /sync/challenge              →
                                   ←  { nonce }   (stored Redis nonce:{nonce} = "1" EX 60 NX)
  hmac = HMAC-SHA256(nonce, APP_SECRET)
  POST /sync/session { nonce, hmac } →
                                        DEL nonce:{nonce}   (single-use)
                                        verify HMAC
                                   ←  { sessionToken }   (Redis session:{token} = syncToken EX 86400)
```

`APP_SECRET` is the `SYNC_APP_SECRET` env var on the server; `VITE_SYNC_APP_SECRET` baked into the client bundle. HMAC is computed via `crypto.subtle` using an imported HMAC-SHA256 key.

### Pre-shared secret obfuscation

`VITE_SYNC_APP_SECRET` (256-bit random, base64-encoded, provided as a GitHub secret) is baked into the bundle at build time. In source, it is split across three module-level constants in separate files and XOR-combined at the call site, defeating casual `grep` of the bundle without requiring an external obfuscation tool.

### File layout

```
sync-server/
  Dockerfile
  index.ts              ← entry point: socket vs TCP from SYNC_SOCKET env
  redis.ts              ← ioredis client
  handlers/
    challenge.ts        ← GET /sync/challenge
    session.ts          ← POST /sync/session
    blob.ts             ← GET + PUT /sync/:token
  tasks-harmony-sync.service
```

### `docker-compose.yml`

```yaml
version: '3.3'

services:
  sync:
    build: ./sync-server
    volumes:
      - ${SOCKET_DIR}:/run/sync
      - sync-data:/data
    environment:
      - SYNC_APP_SECRET=${SYNC_APP_SECRET}
      - REDIS_URL=redis://redis:6379
      - SYNC_SOCKET=/run/sync/sync.sock
      - SYNC_BLOB_DIR=/data
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes
    restart: unless-stopped

volumes:
  sync-data:
  redis-data:
```

### `docker-compose.dev.yml`

```yaml
version: '3.3'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "127.0.0.1:6379:6379"
```

### `sync-server/tasks-harmony-sync.service`

```ini
[Unit]
Description=Tasks Harmony Sync Server
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=__DEPLOY_DIR__
ExecStartPre=/usr/bin/docker-compose build
ExecStart=/usr/bin/docker-compose up
ExecStop=/usr/bin/docker-compose down
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Docker Compose reads `.env` from the working directory automatically — no `EnvironmentFile=` needed.

### nginx additions

```nginx
# Add to http block (one-time manual setup)
limit_req_zone $binary_remote_addr zone=sync_challenge:10m rate=5r/m;
limit_req_zone $binary_remote_addr zone=sync_write:10m rate=30r/m;

# nginx/sync-location.conf.template in repo — __SOCKET_DIR__ substituted by CD
location /sync/challenge {
    limit_req zone=sync_challenge burst=2 nodelay;
    proxy_pass http://unix:__SOCKET_DIR__/sync.sock;
    proxy_http_version 1.1;
}

location ~ ^/sync/[a-f0-9]{64}$ {
    limit_req zone=sync_write burst=5 nodelay;
    client_max_body_size 1m;
    proxy_pass http://unix:__SOCKET_DIR__/sync.sock;
    proxy_http_version 1.1;
}

location /sync/ {
    proxy_pass http://unix:__SOCKET_DIR__/sync.sock;
    proxy_http_version 1.1;
}
```

The rate limiting `limit_req_zone` directives belong in the `http` block and are applied once manually. The `location` blocks live in `nginx/sync-location.conf.template` in the repo; CD substitutes `__SOCKET_DIR__` before rsyncing the rendered file to `$NGINX_INCLUDE_DIR/sync-location.conf` on the server.

### Server setup (one-time, manual)

```bash
# Set from GitHub vars (same values as vars.DEPLOY_DIR / SOCKET_DIR / NGINX_INCLUDE_DIR)
DEPLOY_DIR=/opt/tasks-harmony
SOCKET_DIR=/var/run/tasks-harmony
NGINX_INCLUDE_DIR=/etc/nginx/tasks-harmony

# 1. Install Docker + docker-compose 1.17.1+

# 2. Create directories
sudo mkdir -p "$DEPLOY_DIR"
sudo chown deploy:deploy "$DEPLOY_DIR"
sudo mkdir -p "$SOCKET_DIR"

# 3. Render, install, and enable the systemd unit
perl -pe 's|__DEPLOY_DIR__|$ENV{DEPLOY_DIR}|g' sync-server/tasks-harmony-sync.service \
  | sudo tee /etc/systemd/system/tasks-harmony-sync.service
sudo systemctl daemon-reload
sudo systemctl enable tasks-harmony-sync

# 4. Create nginx include directory and add rate limiting zones + include
#    directive to the nginx config, then reload nginx
sudo mkdir -p "$NGINX_INCLUDE_DIR"

# 5. Run CD — it writes .env, renders templates, deploys, and starts the service
```

### Sudoers (narrow CD privileges)

```
deploy ALL=(ALL) NOPASSWD: /bin/systemctl restart tasks-harmony-sync
deploy ALL=(ALL) NOPASSWD: /usr/sbin/nginx -s reload
```

---

## 5. Client Sync Flow

### Changed and new files

| File | Change |
|---|---|
| `src/db/schema.ts` | Add `credentials` store (`key: string; value: { id: 'main'; cryptoKey: CryptoKey }`) |
| `src/types/index.ts` | Remove `webdavUrl`, `serverEtag` from `SyncState`; they are replaced by server URL baked in via env |
| `src/sync/encrypt.ts` | New — AES-256-GCM + gzip helpers (`encryptState`, `decryptState`) |
| `src/sync/server.ts` | New — replaces `webdav.ts`; challenge-response, push, pull |
| `src/sync/sync.ts` | Updated — remove WebDAV logic, delegate to `server.ts` |
| `src/hooks/useSync.ts` | New — wires auto-sync triggers, exposes `markDirty()` |
| Zustand store | Call `markDirty()` on every write |
| `src/sync/export.ts` | Explicitly exclude `credentials` store; add `encryptedExport` helper |
| `src/sync/import.ts` | Explicitly exclude `credentials` store; add `decryptedImport` helper |

### Auto-sync triggers

```
startup    → pull()
any write  → markDirty() → debounced push() after 10 s
pagehide   → if dirty: push()
```

`markDirty()` is the only call the Zustand store needs to make.

### Push flow

```
1. Ensure session token (challenge-response if absent or expired)
2. appState = exportAppState(db)
3. appState.syncState.lastSyncedAt = now        ← version timestamp
4. dirty = false                                ← clear before push; concurrent writes re-raise it
5. blob = encryptState(key, appState)           ← gzip → AES-256-GCM, fresh IV
6. PUT /sync/{token}   Authorization: Bearer {sessionToken}
7. On success: update local syncState.lastSyncedAt, consecutiveFailures = 0, clear error state
8. On failure: dirty = true, consecutiveFailures++
               if consecutiveFailures >= 3: stop debounce cycle, surface sync error to user
               else: debounce fires again normally
9. On 401: dirty = true, clear localStorage session token, retry once from step 1
           counts as a failure if the retry also fails
```

`consecutiveFailures` is an in-memory counter (not persisted). A page reload resets it to 0 and the startup pull re-establishes a clean state.

**Sync error UI:** a persistent non-blocking banner in the settings sync section — *"Sync failed after 3 attempts. [Retry now]"*. Tapping Retry resets the counter and re-enters the push flow immediately. The banner clears on the next successful push.

### Pull flow (startup only)

```
1. Ensure session token
2. GET /sync/{token}   Authorization: Bearer {sessionToken}
3. 404 → no server state yet, skip
4. 200 → decryptState(key, blob) → validateAppState → serverState
5. If serverState.syncState.lastSyncedAt > local lastSyncedAt:
       importAppState(db, serverState)
   Else: discard — local is newer; markDirty() so the debounce push updates the server
6. On 401: clear session token, retry once
```

### `SyncState` changes

```ts
// Before
interface SyncState {
  id: 'main';
  webdavUrl?: string;      // ← removed (URL baked into bundle)
  serverEtag?: string;     // ← removed (no ETag; last-write-wins via timestamp)
  lastSyncedAt?: string;   // kept — serves as version timestamp
  pendingSync: boolean;    // kept — dirty flag
}

// After
interface SyncState {
  id: 'main';
  lastSyncedAt?: string;
  pendingSync: boolean;
}
```

---

## 6. Key Management & App State Export UX

### First launch

When no key exists in the `credentials` store, generate one automatically and show a non-blocking notice prompting the user to export and store the key file safely. The app is fully usable without acting on this.

### Settings — Sync section

- **Last synced:** timestamp or "Never"
- **Export sync key** — downloads `tasks-harmony-sync-key.json`
- **Import sync key** — file picker; confirmation dialog: *"Importing a new key will make your existing server data inaccessible. Your local data is unaffected. Continue?"*

### Key export file

```json
{ "version": 1, "key": "<base64url-encoded raw 256-bit key>" }
```

Multi-device setup: export key from device A → import on device B. Both devices then push/pull to the same blob (`/sync/{shared-token}`).

### App state export (manual backup)

The existing export option gains a **Format** selector:

- **Encrypted** (default) — compress → AES-256-GCM encrypt with current sync key → `.enc` download
- **Plain** — existing JSON download, unchanged

App state import auto-detects format by file extension (`.enc` vs `.json`). Encrypted imports decrypt with the current key before proceeding through the existing import flow.

### CDP import/export

Unchanged — CDPs are always plaintext ZIP files. This feature is unrelated to sync.

---

## 7. Deployment

### GitHub variables (`vars.*`)

| Variable | Example | Purpose |
|---|---|---|
| `DEPLOY_DIR` | `/opt/tasks-harmony` | Root deployment directory on the server |
| `SOCKET_DIR` | `/var/run/tasks-harmony` | Directory holding the Unix socket |
| `NGINX_INCLUDE_DIR` | `/etc/nginx/tasks-harmony` | Directory for nginx include files |
| `SYNC_URL` | `https://tasks-harmony.example.com` | Public base URL of the sync server; passed to bundle as `VITE_SYNC_URL` |

### GitHub secrets (`secrets.*`)

| Secret | Purpose |
|---|---|
| `SYNC_APP_SECRET` | 256-bit random value, base64-encoded; written to server `.env` and passed to bundle as `VITE_SYNC_APP_SECRET` |

### CD deploy job additions

```yaml
- name: Deploy sync server
  env:
    DEPLOY_DIR: ${{ vars.DEPLOY_DIR }}
    SOCKET_DIR: ${{ vars.SOCKET_DIR }}
    NGINX_INCLUDE_DIR: ${{ vars.NGINX_INCLUDE_DIR }}
  run: |
    # Write server env file (includes SOCKET_DIR for docker-compose volume mount)
    printf 'SYNC_APP_SECRET=%s\nSOCKET_DIR=%s\n' \
      "${{ secrets.SYNC_APP_SECRET }}" "$SOCKET_DIR" \
      | ssh deploy@server "cat > $DEPLOY_DIR/.env"

    # Sync compose config and server source
    rsync -a docker-compose.yml deploy@server:$DEPLOY_DIR/
    rsync -a sync-server/ deploy@server:$DEPLOY_DIR/sync-server/

    # Render and sync nginx location config
    perl -pe 's|__SOCKET_DIR__|$ENV{SOCKET_DIR}|g' nginx/sync-location.conf.template \
      | ssh deploy@server "cat > $NGINX_INCLUDE_DIR/sync-location.conf"

    # Restart service and reload nginx
    ssh deploy@server "sudo systemctl restart tasks-harmony-sync \
                    && sudo nginx -s reload"
```

### Bundle build

```yaml
- name: Build
  env:
    VITE_SYNC_APP_SECRET: ${{ secrets.SYNC_APP_SECRET }}
    VITE_SYNC_URL: ${{ vars.SYNC_URL }}
  run: bun run build
```

---

## 8. Out of Scope

- Pull-merge-push conflict resolution → tracked in #50
- Multi-user / shared accounts
- Server-side search or indexing of encrypted content
- Sync key rotation (changing the key invalidates the server blob; user must push after import)
