# Tasks Harmony

A progressive web app for tracking recurring chores and earning XP for completing them consistently.

## Table of Contents

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)

## Background

Tasks Harmony is a personal chore tracker built around the idea that completing routine tasks consistently deserves recognition. Each chore has a recurrence window (daily, weekly, or monthly). Completing a chore on time builds a streak that multiplies the XP reward; missing a window resets the streak.

All data is stored locally in IndexedDB — no account or server required. Optionally, state can be synced automatically across devices via end-to-end encrypted server sync, and Chore Definition Packs (CDP) can be imported from a URL.

**Tech stack:** React 19, TypeScript 5, Zustand 5, IndexedDB (idb 8), Vite 6, Tailwind CSS 4, Bun.

## Install

**Prerequisites:** [Bun](https://bun.sh) ≥ 1.x.

```bash
bun install
```

## Usage

### Dev server

The app requires a running Redis instance and a sync server process for sync features to work locally.

**1. Create two env files.**

`.env.local` in the repo root (read by Vite):

```dotenv
VITE_SYNC_APP_SECRET=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
VITE_SYNC_URL=http://localhost:5173
```

`sync-server/.env.local` (read by the Bun sync server):

```dotenv
SYNC_APP_SECRET=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
REDIS_URL=redis://localhost:6379
SYNC_BLOB_DIR=.dev-sync-data/
SYNC_SOCKET=
```

Both secrets must be identical base64-encoded values that decode to at least 32 bytes — the placeholder above (32 zero bytes) is fine for local development. To generate a random value for both files: `openssl rand -base64 32`. Leave `SYNC_SOCKET` empty so the sync server listens on TCP port 3001 instead of a Unix socket.

**2. Start Redis** (requires Docker):

```bash
docker compose -f docker-compose.dev.yml up -d
```

**3. Start the sync server** (in a separate terminal):

```bash
bun run sync:dev
```

Runs on `http://localhost:3001` with `--watch`.

**4. Start the Vite dev server**:

```bash
bun run dev
```

Opens at `http://localhost:5173`. The app hot-reloads on file changes. Vite proxies `/sync/*` requests to the sync server automatically.

### Production build

```bash
bun run build
```

Output goes to `dist/`. Serve with any static file server:

```bash
bun run preview   # Vite's built-in preview server
```

### Tests

```bash
bun test          # Run all unit tests
bun run typecheck # TypeScript type-check only
```

### Features

- **Dashboard** — chores sorted by urgency (Overdue → Due → Completed → Upcoming), with XP preview and streak counter
- **Completion questions** — attach custom questions to a chore; answers are recorded with each completion
- **Profile page** — display name, email, XP formula selector, total XP summary
- **Encrypted sync** — automatic background sync across devices; the server stores only opaque ciphertext; a sync key export/import option protects against data loss
- **CDP import** — import a Chore Definition Pack from a URL; update it later to pull upstream changes
- **Offline support** — the app works fully offline; sync and CDP import are deferred until reconnect

## Contributing

Open an issue to report a bug or propose a feature. Pull requests are welcome — please include tests for any new behaviour and ensure the full suite passes (`bun test`) before submitting.

## License

[MIT](LICENSE) © Arne Ludwig
