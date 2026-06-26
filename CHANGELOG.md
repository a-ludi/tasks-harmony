# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.10.2] — 2026-06-26

### Fixed

- **Sync server EADDRINUSE on restart** — the Unix socket file left behind by a previous container run is now removed before binding, preventing the server from crashing with "address already in use" after a redeploy

## [0.10.1] — 2026-06-26

### Fixed

- **nginx sync location** — regex braces in the `location ~ …` directive were unquoted, causing nginx to reject the config with "unknown directive"; the pattern is now quoted per nginx docs

## [0.10.0] — 2026-06-26

### Added

- **Encrypted sync** — AES-256-GCM end-to-end encrypted backup sync via a self-hosted Bun HTTP server backed by Redis; data is encrypted on-device before upload and decrypted locally after download; sync is triggered automatically on every chore completion
- **Sync key management** — generate, copy, and import a 256-bit sync key from the Profile page; the key is stored in IndexedDB and never transmitted in plain text; HMAC challenge-response authentication prevents unauthorized access
- **Encrypted export format** — the Profile page export dialog now offers an "Encrypted" format option that produces a sync-compatible encrypted ZIP alongside the existing plain ZIP
- **Sync server** — new `sync-server/` directory containing the Bun HTTP server, Docker Compose stack (Bun + Redis with AOF persistence), nginx reverse proxy config template, systemd service unit, and a `DEPLOYMENT.md` guide for self-hosting

### Changed

- **Auto-pull on key import** — importing a sync key immediately triggers a pull from the sync server so existing server data is loaded without a manual page reload
- **Session retry on 403** — the sync client retries authentication on HTTP 403 (stale session after a key change) in addition to 401, preventing a silent failure after importing a new key
- **`SERVER_DIR` renamed from `DEPLOY_DIR`** — GitHub Actions variable and systemd service placeholder renamed for clarity; `SERVER_DIR` (sync server files) is explicitly kept outside `SSH_PATH` (nginx web root) to protect the `.env` secret file

### Fixed

- **Blob directory auto-creation** — the sync server now creates the blob storage directory on first write instead of returning 500 ENOENT when the directory does not yet exist
- **`VITE_SYNC_URL` silent override** — removed a `define` entry in `vite.config.ts` that was overriding `VITE_SYNC_URL` from `.env.local` with an empty string at build time, causing all sync requests to be skipped silently without any console error

## [0.9.0] — 2026-06-24

### Added

- **Issues archive** — a new 'View archived' toggle in the dashboard and pack view dropdown lets you switch to archive mode, which shows only archived (inactive) chores; switching back restores the normal view; mode persists across page reloads (#46)

## [0.8.0] — 2026-06-24

### Changed

- **Sticky mobile header** — the top navigation bar stays fixed at the top of the screen on mobile so the sidebar is always reachable without scrolling back up (#47)
- **Sticky desktop sidebar** — the sidebar stays in view while scrolling through a long chore list on desktop; it becomes independently scrollable when its content overflows (#47)

## [0.7.0] — 2026-06-20

### Added

- **CDP URL normalization** — paste any browser URL from GitHub (tree/blob), GitLab.com, self-hosted GitLab, or GitHub Enterprise; it is automatically normalized to the raw CDN base URL before fetching and storing (#42)
- **Sync button on imported packs** — a ↻ button appears next to each imported pack in the sidebar and on the pack page header; clicking it opens the CDP update dialog; the button is disabled when offline (#43)
- **Navigate after import** — after a successful initial CDP import, the dialog closes and navigates directly to the new pack's page

## [0.6.0] — 2026-06-15

### Added

- **Completable packs** — set an XP target and/or target date on any pack; an amber XP bar and a blue time bar appear on the pack page; XP goal shows a "Completed" badge once reached, time goal shows a "Lapsed" badge if the date passes without meeting the XP target (#33)
- **CDP import date shifting** — when a pack has `allowShiftOnImport: true`, the import dialog prompts for a start date and shifts all chore dates accordingly; if the pack also has a `targetDate`, both dates are shown and automatically kept in sync (#33)
- **Pack streak control** — disable streak mechanics for an entire pack via the pack kebab menu; streak count is hidden on chore cards and the streak multiplier is fixed at 1; useful for variety-focused or rotation packs (#36)
- **Due period** — per-chore optional field that delays the `due` status until N time before the window ends; configured in the chore edit form with a number + unit selector; exported in CDP YAML (#40)

### Changed

- **Nav menu cleanup** — sync button, dark mode toggle, and "View on GitHub" link moved from the sidebar footer to the Profile page; Profile gains an "App" section and an "About" section with app metadata (#39)

## [0.5.0] — 2026-06-13

### Added

- **Markdown descriptions** — chore and pack descriptions now use a Milkdown WYSIWYG editor with a formatting toolbar (bold, italic, strikethrough, inline code, headings H1–H3, bullet/ordered lists, blockquote, code block); rendered with `prose` styling in read-only display (#38)
- **Conscious releases** — the app detects new versions automatically (PWA `prompt` mode), fetches the latest changelog, and opens an update modal with highlights and expandable full changelog; actions: Update Now, Remind Me Later, Ignore Update; nav burger icon badge and pill button remain visible even after ignoring (#2)
- **GitHub link** — "View on GitHub" anchor at the bottom of the nav menu, opens the repository README in a new tab (#35)
- **iOS PWA splash screens** — `apple-touch-startup-image` PNG assets at all required iOS device sizes, generated from `icon-template.svg`; meta tags injected in `index.html` (#30)

### Fixed

- Milkdown Nord theme dark mode — CSS overrides so the editor respects the `.dark` class toggle (the theme's built-in `@media` query uses OS preference, not the app's class-based toggle)
- Stale MarkdownDisplay after editing — description display now re-mounts when content changes

## [0.4.0] — 2026-06-09

### Added

- **Dark mode** — toggle in the sidebar; persisted to `localStorage`; respects OS preference on first visit (#16)
- **Compact mode** — dashboard toggle via "+ New Chore" button dropdown; hides description, XP, and recurrence fields and tightens card spacing; persisted to `localStorage` (#12)

### Changed

- **Shadcn/ui migration** — all UI components (buttons, cards, dialogs, badges, inputs, selects, dropdowns, switches, tooltips) now use Shadcn/ui primitives with consistent Tailwind v4 CSS variable theming (#6)
- **ChoreCard redesign** — uses `CardHeader`/`CardTitle`/`CardDescription`/`CardAction` anatomy; Complete button in the card action slot (top-right); Edit, Duplicate, and Archive moved to a `⋮` dropdown menu
- **Dark mode coverage** — all hardcoded gray/white color classes replaced with semantic tokens (`bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`) across all pages and components; ProfilePage migrated to Shadcn `Input` and `Select`

## [0.2.0] — 2026-06-05

### Added

- Move chores between packs via the chore edit modal — select a different pack and save; collision with an existing choreId is caught inline before saving
- Safe pack deletion with per-chore disposition dialog — choose to move or delete each chore individually; "Move all" / "Delete all" shortcuts; auto-resolves name collisions with a numeric suffix shown inline
- Duplicate chore — new Duplicate button on every chore card; choose target pack and name; inline collision detection; "Duplicate & Edit" opens the edit modal for the new copy immediately
- Completion history preserved on pack deletion — completions are never deleted; their `choreKey` is rewritten to a UUID so XP history remains intact
- Local git hooks via lefthook — pre-commit runs typecheck, pre-push runs unit tests; hooks auto-install via `bun install`

### Fixed

- PWA icons (`icon-192.png`, `icon-512.png`) are now committed so CI builds include them, fixing the installability check (#25)

### Changed

- `SSH_HOST`, `SSH_USER`, `SSH_PATH` moved from GitHub Actions secrets to repository variables for easier auditing in the Actions UI (#24)
- GitHub Actions upgraded: `actions/checkout` → v6, `actions/upload-artifact` → v7, `actions/download-artifact` → v8 (Node.js 24, avoids deprecation warnings) (#22)

## [0.1.1] — 2026-06-04

### Fixed

- **CD pipeline**: `gh release create --skip-existing` is not supported on GitHub Actions runners; replaced with `gh release view ... || gh release create ...`

## [0.1.0] — 2026-06-04

### Added

- **Quick-complete**: Chore cards now show pre-defined answer sets as quick-complete buttons with tooltip previews, configurable per chore in the edit form.
- **ZIP backup**: Export and import the full app state as a ZIP archive from the Profile page.
- **XP preview in edit mode**: Chore form shows projected XP range (base to max-streak) live as you change the XP size. Score multiplier questions now also show a per-unit weight preview.
- **XP per pack**: Pack dashboard header displays total XP earned for that pack; sidebar shows XP earned next to each pack name.
- **Personal title bar**: Display name shown in the desktop sidebar and the mobile header alongside the app title.
- **Sidebar version footer**: App version and build date shown at the bottom of the sidebar.
- **CI/CD via GitHub Actions**: Reusable CI workflow (typecheck, unit tests, E2E tests, production build + artifact upload); CD pipeline creates a GitHub Release and deploys via rsync on every push to `main`.

### Changed

- **Sidebar navigation**: Dashboard moved to top-level; pack actions (New Pack, Import Pack) consolidated into a ⋮ overflow menu.

### Fixed

- **Sidebar width bounds**: Minimum raised to 200 px; maximum is now dynamic — `max(200 px, 50 vw)` — so the sidebar can fill up to half the viewport on wide screens.
- **CDP export now includes questions**: Questions attached to a chore are exported and imported correctly. They are sorted by their `order` field in the YAML and the `order` field is omitted (position in the array is authoritative on import).
- **WebDAV URL field**: Input is now full-width so it no longer gets clipped when the sidebar is narrow.
- **Score multiplier XP preview**: Weight input in the question form now shows the per-unit preview (was missing, chore questions already had it).

[0.10.2]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.10.2
[0.10.1]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.10.1
[0.10.0]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.10.0
[0.9.0]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.9.0
[0.8.0]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.8.0
[0.7.0]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.7.0
[0.6.0]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.6.0
[0.5.0]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.5.0
[0.4.0]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.4.0
[0.2.0]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.2.0
[0.1.1]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.1.1
[0.1.0]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.1.0
