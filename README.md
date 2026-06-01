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

All data is stored locally in IndexedDB — no account or server required. Optionally, state can be synced across devices via WebDAV, and Chore Definition Packs (CDP) can be imported from a URL.

**Tech stack:** React 19, TypeScript 5, Zustand 5, IndexedDB (idb 8), Vite 6, Tailwind CSS 4, Bun.

## Install

**Prerequisites:** [Bun](https://bun.sh) ≥ 1.x.

```bash
bun install
```

## Usage

### Dev server

```bash
bun run dev
```

Opens at `http://localhost:5173`. The app hot-reloads on file changes.

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
- **WebDAV sync** — push/pull state to a self-hosted WebDAV server with ETag-based conflict detection
- **CDP import** — import a Chore Definition Pack from a URL; update it later to pull upstream changes
- **Offline support** — the app works fully offline; sync and CDP import are deferred until reconnect

## Contributing

Open an issue to report a bug or propose a feature. Pull requests are welcome — please include tests for any new behaviour and ensure the full suite passes (`bun test`) before submitting.

## License

[MIT](LICENSE) © Arne Ludwig
