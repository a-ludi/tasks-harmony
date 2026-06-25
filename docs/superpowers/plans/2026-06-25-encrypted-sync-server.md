# Encrypted Sync Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a small Bun HTTP server that stores encrypted blobs on behalf of the app, authenticated via a challenge-response HMAC mechanism using a bundle-baked secret.

**Architecture:** Bun HTTP server in `sync-server/` behind nginx (Unix socket via Docker bind-mount), with Redis for nonces and session tokens. Docker Compose v3.3 isolates the service; a systemd unit manages the compose stack. The CD pipeline writes the server `.env`, deploys via rsync, and restarts the service.

**Tech Stack:** Bun 1, ioredis 5, Docker Compose 1.17.1+, Redis 7-alpine, nginx (existing), GitHub Actions.

---

## File Structure

**New files:**
- `sync-server/package.json` — Bun project manifest with ioredis dep
- `sync-server/tsconfig.json` — TypeScript config for Bun
- `sync-server/redis.ts` — ioredis singleton
- `sync-server/handlers/challenge.ts` — `GET /sync/challenge`
- `sync-server/handlers/challenge.test.ts`
- `sync-server/handlers/session.ts` — `POST /sync/session`
- `sync-server/handlers/session.test.ts`
- `sync-server/handlers/blob.ts` — `GET + PUT /sync/:token`
- `sync-server/handlers/blob.test.ts`
- `sync-server/index.ts` — entry point; routes + socket/TCP switch
- `sync-server/Dockerfile`
- `sync-server/tasks-harmony-sync.service`
- `docker-compose.yml`
- `docker-compose.dev.yml`
- `nginx/sync-location.conf.template`

**Modified files:**
- `.github/workflows/ci.yml` — add `sync-server-check` job
- `.github/workflows/cd.yml` — add VITE_ env vars to build; add deploy sync server steps

---

### Task 1: sync-server package setup

**Files:**
- Create: `sync-server/package.json`
- Create: `sync-server/tsconfig.json`

- [ ] **Step 1: Create sync-server/package.json**

```json
{
  "name": "tasks-harmony-sync-server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "bun --watch index.ts",
    "test": "bun test"
  },
  "dependencies": {
    "ioredis": "^5.6.1"
  },
  "devDependencies": {
    "@types/bun": "^1"
  }
}
```

- [ ] **Step 2: Create sync-server/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["bun-types"]
  },
  "include": ["."]
}
```

- [ ] **Step 3: Install dependencies**

Run from `sync-server/`:
```bash
cd sync-server && bun install
```
Expected: `bun.lock` created, `node_modules/ioredis` present.

- [ ] **Step 4: Commit**

```bash
git add sync-server/package.json sync-server/tsconfig.json sync-server/bun.lock
git commit -m "feat(sync-server): add package setup"
```

---

### Task 2: Redis client

**Files:**
- Create: `sync-server/redis.ts`

- [ ] **Step 1: Create sync-server/redis.ts**

```typescript
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
export const redis = new Redis(REDIS_URL, { lazyConnect: true });
```

`lazyConnect: true` means tests that mock redis.ts don't need a live Redis instance.

- [ ] **Step 2: Commit**

```bash
git add sync-server/redis.ts
git commit -m "feat(sync-server): add Redis client"
```

---

### Task 3: Challenge endpoint

**Files:**
- Create: `sync-server/handlers/challenge.ts`
- Create: `sync-server/handlers/challenge.test.ts`

- [ ] **Step 1: Write the failing test**

Create `sync-server/handlers/challenge.test.ts`:

```typescript
import { describe, it, expect, mock, beforeEach } from 'bun:test';

const mockSet = mock(async () => 'OK' as const);
mock.module('../redis', () => ({ redis: { set: mockSet } }));

const { handleChallenge } = await import('./challenge');

describe('handleChallenge', () => {
  beforeEach(() => mockSet.mockClear());

  it('returns a 64-char hex nonce', async () => {
    const res = await handleChallenge(new Request('http://localhost/sync/challenge'));
    expect(res.status).toBe(200);
    const body = await res.json() as { nonce: string };
    expect(body.nonce).toMatch(/^[a-f0-9]{64}$/);
  });

  it('stores the nonce in Redis with 60s TTL', async () => {
    const res = await handleChallenge(new Request('http://localhost/sync/challenge'));
    const { nonce } = await res.json() as { nonce: string };
    expect(mockSet).toHaveBeenCalledWith(`nonce:${nonce}`, '1', 'EX', 60, 'NX');
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd sync-server && bun test handlers/challenge.test.ts
```
Expected: error about missing module `./challenge`.

- [ ] **Step 3: Implement challenge handler**

Create `sync-server/handlers/challenge.ts`:

```typescript
import { randomBytes } from 'crypto';
import { redis } from '../redis';

export async function handleChallenge(_req: Request): Promise<Response> {
  const nonce = randomBytes(32).toString('hex');
  await redis.set(`nonce:${nonce}`, '1', 'EX', 60, 'NX');
  return Response.json({ nonce });
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
cd sync-server && bun test handlers/challenge.test.ts
```
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add sync-server/handlers/challenge.ts sync-server/handlers/challenge.test.ts
git commit -m "feat(sync-server): add challenge endpoint"
```

---

### Task 4: Session endpoint

**Files:**
- Create: `sync-server/handlers/session.ts`
- Create: `sync-server/handlers/session.test.ts`

- [ ] **Step 1: Write the failing test**

Create `sync-server/handlers/session.test.ts`:

```typescript
import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { createHmac, randomBytes } from 'crypto';

const APP_SECRET = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='; // 32 null bytes base64
process.env.SYNC_APP_SECRET = APP_SECRET;

const mockDel = mock(async (_key: string) => 1);
const mockSet = mock(async () => 'OK' as const);
mock.module('../redis', () => ({ redis: { del: mockDel, set: mockSet } }));

const { handleSession } = await import('./session');

const SYNC_TOKEN = 'a'.repeat(64);

function makeHmac(nonce: string): string {
  const secretBytes = Buffer.from(APP_SECRET, 'base64');
  return createHmac('sha256', secretBytes).update(nonce).digest('hex');
}

function makeReq(body: unknown): Request {
  return new Request('http://localhost/sync/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('handleSession', () => {
  beforeEach(() => { mockDel.mockClear(); mockSet.mockClear(); });

  it('returns sessionToken when HMAC is valid', async () => {
    const nonce = randomBytes(32).toString('hex');
    const res = await handleSession(makeReq({ nonce, hmac: makeHmac(nonce), syncToken: SYNC_TOKEN }));
    expect(res.status).toBe(200);
    const body = await res.json() as { sessionToken: string };
    expect(body.sessionToken).toMatch(/^[a-f0-9]{64}$/);
    expect(mockDel).toHaveBeenCalledWith(`nonce:${nonce}`);
    expect(mockSet).toHaveBeenCalledWith(`session:${body.sessionToken}`, SYNC_TOKEN, 'EX', 86400);
  });

  it('returns 401 when HMAC is wrong', async () => {
    const nonce = randomBytes(32).toString('hex');
    const res = await handleSession(makeReq({ nonce, hmac: 'deadbeef'.repeat(8), syncToken: SYNC_TOKEN }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when nonce was already used (del returns 0)', async () => {
    mockDel.mockImplementationOnce(async () => 0);
    const nonce = randomBytes(32).toString('hex');
    const res = await handleSession(makeReq({ nonce, hmac: makeHmac(nonce), syncToken: SYNC_TOKEN }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when syncToken is not 64 hex chars', async () => {
    const nonce = randomBytes(32).toString('hex');
    const res = await handleSession(makeReq({ nonce, hmac: makeHmac(nonce), syncToken: 'short' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on malformed JSON', async () => {
    const req = new Request('http://localhost/sync/session', {
      method: 'POST',
      body: 'not json',
    });
    const res = await handleSession(req);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd sync-server && bun test handlers/session.test.ts
```
Expected: error about missing module `./session`.

- [ ] **Step 3: Implement session handler**

Create `sync-server/handlers/session.ts`:

```typescript
import { timingSafeEqual, createHmac, randomBytes } from 'crypto';
import { redis } from '../redis';

const APP_SECRET = process.env.SYNC_APP_SECRET ?? '';

function verifyHmac(nonce: string, hmacHex: string): boolean {
  try {
    const secretBytes = Buffer.from(APP_SECRET, 'base64');
    const expected = createHmac('sha256', secretBytes).update(nonce).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(hmacHex.toLowerCase().slice(0, 64).padEnd(64, '0'));
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function handleSession(req: Request): Promise<Response> {
  let body: { nonce?: unknown; hmac?: unknown; syncToken?: unknown };
  try {
    body = await req.json() as typeof body;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const { nonce, hmac, syncToken } = body;
  if (typeof nonce !== 'string' || typeof hmac !== 'string' || typeof syncToken !== 'string') {
    return new Response('Bad Request', { status: 400 });
  }
  if (!/^[a-f0-9]{64}$/.test(syncToken)) {
    return new Response('Bad Request', { status: 400 });
  }

  const deleted = await redis.del(`nonce:${nonce}`);
  if (deleted === 0) return new Response('Unauthorized', { status: 401 });

  if (!verifyHmac(nonce, hmac)) return new Response('Unauthorized', { status: 401 });

  const sessionToken = randomBytes(32).toString('hex');
  await redis.set(`session:${sessionToken}`, syncToken, 'EX', 86400);
  return Response.json({ sessionToken });
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
cd sync-server && bun test handlers/session.test.ts
```
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add sync-server/handlers/session.ts sync-server/handlers/session.test.ts
git commit -m "feat(sync-server): add session endpoint with HMAC challenge-response"
```

---

### Task 5: Blob endpoint

**Files:**
- Create: `sync-server/handlers/blob.ts`
- Create: `sync-server/handlers/blob.test.ts`

- [ ] **Step 1: Write the failing test**

Create `sync-server/handlers/blob.test.ts`:

```typescript
import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { rm, mkdir } from 'fs/promises';

const TEST_BLOB_DIR = '/tmp/test-sync-blobs-' + Date.now();
process.env.SYNC_BLOB_DIR = TEST_BLOB_DIR;

const SYNC_TOKEN = 'a'.repeat(64);
const SESSION_TOKEN = 'sess01';

const mockGet = mock(async (key: string) =>
  key === `session:${SESSION_TOKEN}` ? SYNC_TOKEN : null
);
mock.module('../redis', () => ({ redis: { get: mockGet } }));

const { handleBlob } = await import('./blob');

function makeReq(method: string, token: string, body?: Uint8Array, auth = SESSION_TOKEN): Request {
  return new Request(`http://localhost/sync/${token}`, {
    method,
    headers: {
      Authorization: `Bearer ${auth}`,
      ...(body ? { 'Content-Type': 'application/octet-stream', 'Content-Length': String(body.length) } : {}),
    },
    body: body ?? undefined,
  });
}

describe('handleBlob', () => {
  beforeEach(async () => {
    mockGet.mockClear();
    await rm(TEST_BLOB_DIR, { recursive: true, force: true });
    await mkdir(TEST_BLOB_DIR, { recursive: true });
  });

  it('GET returns 404 when no blob exists', async () => {
    const res = await handleBlob(makeReq('GET', SYNC_TOKEN), SYNC_TOKEN);
    expect(res.status).toBe(404);
  });

  it('PUT stores blob; GET retrieves it', async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const put = await handleBlob(makeReq('PUT', SYNC_TOKEN, data), SYNC_TOKEN);
    expect(put.status).toBe(204);

    const get = await handleBlob(makeReq('GET', SYNC_TOKEN), SYNC_TOKEN);
    expect(get.status).toBe(200);
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(data);
  });

  it('GET returns 401 when auth is missing', async () => {
    const req = new Request(`http://localhost/sync/${SYNC_TOKEN}`, { method: 'GET' });
    const res = await handleBlob(req, SYNC_TOKEN);
    expect(res.status).toBe(401);
  });

  it('GET returns 401 when session token is unknown', async () => {
    const res = await handleBlob(makeReq('GET', SYNC_TOKEN, undefined, 'unknown'), SYNC_TOKEN);
    expect(res.status).toBe(401);
  });

  it('PUT returns 403 when session belongs to a different sync token', async () => {
    const other = 'b'.repeat(64);
    const res = await handleBlob(makeReq('PUT', other, new Uint8Array([1])), other);
    expect(res.status).toBe(403);
  });

  it('PUT returns 413 when payload exceeds 1 MB', async () => {
    const big = new Uint8Array(1024 * 1024 + 1);
    const res = await handleBlob(makeReq('PUT', SYNC_TOKEN, big), SYNC_TOKEN);
    expect(res.status).toBe(413);
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd sync-server && bun test handlers/blob.test.ts
```
Expected: error about missing module `./blob`.

- [ ] **Step 3: Implement blob handler**

Create `sync-server/handlers/blob.ts`:

```typescript
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { redis } from '../redis';

const BLOB_DIR = process.env.SYNC_BLOB_DIR ?? '/data';
const MAX_BYTES = 1024 * 1024;

async function authenticate(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const sessionToken = auth.slice(7);
  return redis.get(`session:${sessionToken}`);
}

export async function handleBlob(req: Request, token: string): Promise<Response> {
  const storedSyncToken = await authenticate(req);
  if (!storedSyncToken) return new Response('Unauthorized', { status: 401 });
  if (storedSyncToken !== token) return new Response('Forbidden', { status: 403 });

  const blobPath = join(BLOB_DIR, `${token}.enc`);

  if (req.method === 'GET') {
    try {
      const data = await readFile(blobPath);
      return new Response(data, { headers: { 'Content-Type': 'application/octet-stream' } });
    } catch {
      return new Response('Not Found', { status: 404 });
    }
  }

  if (req.method === 'PUT') {
    const contentLength = Number(req.headers.get('Content-Length') ?? 0);
    if (contentLength > MAX_BYTES) return new Response('Payload Too Large', { status: 413 });
    const data = await req.arrayBuffer();
    if (data.byteLength > MAX_BYTES) return new Response('Payload Too Large', { status: 413 });
    await writeFile(blobPath, Buffer.from(data));
    return new Response(null, { status: 204 });
  }

  return new Response('Method Not Allowed', { status: 405 });
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
cd sync-server && bun test handlers/blob.test.ts
```
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add sync-server/handlers/blob.ts sync-server/handlers/blob.test.ts
git commit -m "feat(sync-server): add blob GET/PUT endpoint"
```

---

### Task 6: Entry point

**Files:**
- Create: `sync-server/index.ts`

- [ ] **Step 1: Create sync-server/index.ts**

```typescript
import { chmod } from 'fs/promises';
import { handleChallenge } from './handlers/challenge';
import { handleSession } from './handlers/session';
import { handleBlob } from './handlers/blob';

const SYNC_SOCKET = process.env.SYNC_SOCKET ?? '';
const SYNC_PORT = Number(process.env.SYNC_PORT ?? 3001);
const TOKEN_RE = /^\/sync\/([a-f0-9]{64})$/;

async function handler(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  if (pathname === '/sync/challenge' && req.method === 'GET') return handleChallenge(req);
  if (pathname === '/sync/session' && req.method === 'POST') return handleSession(req);
  const m = TOKEN_RE.exec(pathname);
  if (m && (req.method === 'GET' || req.method === 'PUT')) return handleBlob(req, m[1]!);
  return new Response('Not Found', { status: 404 });
}

if (SYNC_SOCKET) {
  Bun.serve({ unix: SYNC_SOCKET, fetch: handler });
  await chmod(SYNC_SOCKET, 0o666);
  console.log(`Listening on unix:${SYNC_SOCKET}`);
} else {
  Bun.serve({ port: SYNC_PORT, fetch: handler });
  console.log(`Listening on http://localhost:${SYNC_PORT}`);
}
```

- [ ] **Step 2: Verify it starts locally**

```bash
cd sync-server && SYNC_APP_SECRET=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= bun run index.ts
```
Expected: prints `Listening on http://localhost:3001`. Stop with Ctrl-C.

- [ ] **Step 3: Add sync:dev to root package.json scripts**

In `package.json`, inside `"scripts"`:
```json
"sync:dev": "cd sync-server && bun run dev",
```

- [ ] **Step 4: Commit**

```bash
git add sync-server/index.ts package.json
git commit -m "feat(sync-server): add entry point with socket/TCP switch"
```

---

### Task 7: Dockerfile

**Files:**
- Create: `sync-server/Dockerfile`

- [ ] **Step 1: Create sync-server/Dockerfile**

```dockerfile
FROM oven/bun:1-alpine
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production
COPY . .
CMD ["bun", "run", "index.ts"]
```

- [ ] **Step 2: Verify Docker build (if Docker is available)**

```bash
docker build -t tasks-harmony-sync sync-server/
```
Expected: image builds without error. Skip if Docker not available locally.

- [ ] **Step 3: Commit**

```bash
git add sync-server/Dockerfile
git commit -m "feat(sync-server): add Dockerfile"
```

---

### Task 8: Docker Compose files

**Files:**
- Create: `docker-compose.yml`
- Create: `docker-compose.dev.yml`

- [ ] **Step 1: Create docker-compose.yml**

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

- [ ] **Step 2: Create docker-compose.dev.yml**

```yaml
version: '3.3'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "127.0.0.1:6379:6379"
```

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml docker-compose.dev.yml
git commit -m "feat(sync-server): add Docker Compose configs"
```

---

### Task 9: Systemd service and sudoers snippet

**Files:**
- Create: `sync-server/tasks-harmony-sync.service`

- [ ] **Step 1: Create sync-server/tasks-harmony-sync.service**

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

`__DEPLOY_DIR__` is substituted by CD using `perl -pe 's|__DEPLOY_DIR__|$ENV{DEPLOY_DIR}|g'` before installation.

- [ ] **Step 2: Document the sudoers snippet in a comment in the service file**

Add a comment block at the top of the service file:

```ini
# Sudoers entries needed for the deploy user (add via visudo):
#   deploy ALL=(ALL) NOPASSWD: /bin/systemctl restart tasks-harmony-sync
#   deploy ALL=(ALL) NOPASSWD: /usr/sbin/nginx -s reload
```

- [ ] **Step 3: Commit**

```bash
git add sync-server/tasks-harmony-sync.service
git commit -m "feat(sync-server): add systemd service unit"
```

---

### Task 10: nginx location template

**Files:**
- Create: `nginx/sync-location.conf.template`

- [ ] **Step 1: Create nginx/sync-location.conf.template**

```nginx
# Rate limiting zones belong in the nginx http block (one-time manual setup):
#   limit_req_zone $binary_remote_addr zone=sync_challenge:10m rate=5r/m;
#   limit_req_zone $binary_remote_addr zone=sync_write:10m rate=30r/m;

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

`__SOCKET_DIR__` is substituted by CD using `perl -pe 's|__SOCKET_DIR__|$ENV{SOCKET_DIR}|g'`.

- [ ] **Step 2: Commit**

```bash
git add nginx/sync-location.conf.template
git commit -m "feat(sync-server): add nginx location config template"
```

---

### Task 11: CI — sync-server-check job

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add sync-server-check job to ci.yml**

In `.github/workflows/ci.yml`, add a new job after `check:` and before `e2e:`:

```yaml
  sync-server-check:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: sync-server
    steps:
      - uses: actions/checkout@v6

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1

      - name: Install dependencies
        run: bun install

      - name: Typecheck
        run: bun run tsc --noEmit

      - name: Unit tests
        run: bun test
```

Also update the `build` job's `needs` to include `sync-server-check`:

```yaml
  build:
    needs: [check, e2e, sync-server-check]
```

- [ ] **Step 2: Verify ci.yml is valid YAML**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"
```
Expected: no output (valid YAML).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add sync-server typecheck and unit test job"
```

---

### Task 12: CD — build env vars and deploy sync server

**Files:**
- Modify: `.github/workflows/cd.yml`

- [ ] **Step 1: Add VITE_ env vars to the build step in ci.yml**

The `build` job in `.github/workflows/ci.yml` currently has:

```yaml
      - name: Build
        run: bun run build
```

Replace it with:

```yaml
      - name: Build
        env:
          VITE_SYNC_APP_SECRET: ${{ secrets.SYNC_APP_SECRET }}
          VITE_SYNC_URL: ${{ vars.SYNC_URL }}
        run: bun run build
```

- [ ] **Step 2: Add deploy sync server steps to cd.yml**

In `.github/workflows/cd.yml`, add a `deploy-sync` job after `release:`:

```yaml
  deploy-sync:
    needs: [ci, release]
    runs-on: ubuntu-latest
    environment: production
    permissions: {}
    steps:
      - uses: actions/checkout@v6

      - name: Configure SSH
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.SSH_KEY }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          ssh-keyscan -H "${{ vars.SSH_HOST }}" >> ~/.ssh/known_hosts

      - name: Deploy sync server
        env:
          DEPLOY_DIR: ${{ vars.DEPLOY_DIR }}
          SOCKET_DIR: ${{ vars.SOCKET_DIR }}
          NGINX_INCLUDE_DIR: ${{ vars.NGINX_INCLUDE_DIR }}
          SSH_USER: ${{ vars.SSH_USER }}
          SSH_HOST: ${{ vars.SSH_HOST }}
        run: |
          # Write server env file
          printf 'SYNC_APP_SECRET=%s\nSOCKET_DIR=%s\n' \
            "${{ secrets.SYNC_APP_SECRET }}" "$SOCKET_DIR" \
            | ssh -i ~/.ssh/deploy_key "$SSH_USER@$SSH_HOST" "cat > $DEPLOY_DIR/.env"

          # Sync compose config and server source
          rsync -avz -e "ssh -i ~/.ssh/deploy_key" \
            docker-compose.yml "$SSH_USER@$SSH_HOST:$DEPLOY_DIR/"
          rsync -avz -e "ssh -i ~/.ssh/deploy_key" \
            sync-server/ "$SSH_USER@$SSH_HOST:$DEPLOY_DIR/sync-server/"

          # Render and sync nginx location config
          perl -pe 's|__SOCKET_DIR__|$ENV{SOCKET_DIR}|g' nginx/sync-location.conf.template \
            | ssh -i ~/.ssh/deploy_key "$SSH_USER@$SSH_HOST" \
              "cat > $NGINX_INCLUDE_DIR/sync-location.conf"

          # Restart service and reload nginx
          ssh -i ~/.ssh/deploy_key "$SSH_USER@$SSH_HOST" \
            "sudo systemctl restart tasks-harmony-sync && sudo nginx -s reload"
```

Also update the existing `deploy` job to depend on `deploy-sync` if desired, or keep them independent. Since they are independent deployments (frontend vs sync server), they can run in parallel. No changes needed to the existing `deploy` job's `needs`.

- [ ] **Step 3: Verify cd.yml and ci.yml are valid YAML**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/cd.yml')); yaml.safe_load(open('.github/workflows/ci.yml'))"
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/cd.yml .github/workflows/ci.yml
git commit -m "ci: add VITE_SYNC env vars to build and sync server deploy job"
```
