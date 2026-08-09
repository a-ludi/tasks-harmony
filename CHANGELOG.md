# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.14.0] — 2026-08-09

### Added

- **Targets** — a chore with at least one question can have a pre-defined list of Targets (pre-filled answer sets). Each Target is a record the user intends to complete; the chore becomes a finite collection challenge. Targets are defined in a new **Targets** section of `ChoreFormModal` (shown after Questions). Targets and Quick Answer Sets are mutually exclusive — when one is defined the other section is hidden with an explanatory note. (#72)
- **TargetFormModal** — a two-step secondary modal for adding or editing a Target: Step 1 imports pre-filled answers from an existing unlinked completion (shown when unlinked completions exist); Step 2 edits the answers via `AnswerForm`. (#72)
- **TargetPickerModal** — replaces `CompletionModal` when the chore has targets. Three steps: (1) select a pending target from `TargetsTable`; (2) fill any unfilled answers; (3) celebration screen with confetti burst and trophy graphic when all targets are completed for the first time. (#72)
- **Set-completion bonus** — an optional extra XP award configured per-chore (`completionBonusXPSize`), credited once when a real completion causes all targets to be done for the first time. The triggering completion stores `setCompletionBonus` and the bonus is included in its `xpEarned`. (#72)
- **Target progress bar on ChoreCard** — rendered between the XP/streak row and quick-complete buttons when the chore has targets. Shows `N / total` and a green fill bar; displays a green 'Completed' pill when all targets are done. Compact mode hides the label but keeps the bar with a tooltip. (#72)
- **Unified completion history + targets table on ChorePage** — pending targets appear as greyed-out hidden rows in the completions table, toggled with 'Show targets / Hide targets'. Completed targets appear as their linked completion row — no duplication. Sorting applies to both row types. (#72)

### Fixed

- **Trophy icon** — replaced placeholder `trophy.svg` with actual trophy graphic displayed on the set-completion celebration screen
- **Set-completion celebration** — the celebration screen now fires whenever all targets are first completed, regardless of whether a bonus XP award is configured
- **Infinite render loop** — moved the completion filter out of Zustand selectors (which run on every render) into component-level derived state, preventing a render loop on pages with target data
- **moveChore migrates targets** — moving a chore to another pack now correctly updates `choreKey` on all associated targets, keeping target data consistent after a move

## [0.13.0] — 2026-08-09

### Added

- **Archive page** — a dedicated `/archive` route shows all archived chores in a flat alphabetical list with a construction-site banner; ChoreCard is rendered in read-only mode (Complete and quick-answer buttons disabled, dropdown reduced to Delete only); deleting an archived chore opens a Dialog explaining that completion history is lost but XP earned is preserved (#60)
- **Log past completion** — the Complete button on the chore detail page becomes a split button: the primary action completes the current window as before, while a `▾` dropdown reveals 'Log past completion'; the dropdown item is disabled when no eligible past windows exist; clicking it opens `LogPastCompletionModal` with a window selector showing human-readable date ranges, a `completedAt` date-time picker defaulting to the window end, and the standard answers form; saves via a new `recordRetroactiveCompletion` store action (#63)
- **Amend completions** — each row in the completion history table gains an Edit button that opens `AmendCompletionModal`; the user can adjust `completedAt` (constrained to the original window) and re-answer any questions; XP is recalculated and overwritten on save via a new `amendCompletion` store action (#63)
- **CompletionsTable component** — the plain completion history table on `ChorePage` is replaced by a fully-featured `CompletionsTable`; features include: multi-column sort with header clicks (asc→desc→removed cycle) and priority superscripts (↑¹, ↑²) plus a 'Reset sorting' link; grouping accordion with chip-based group-by selector for discrete question columns (ENUM, INTEGER, BOOLEAN, and MULTIPLIER); accordion sections with per-group subtotals and one-open-at-a-time behaviour; a totals row showing completion count for the date column and sums for numeric columns; and an export dropdown for CSV (with double columns for ENUM: label + index) and JSON (#61, #71)
- **Card controls bar on ChorePage** — the chore detail page now shows a controls bar above the completion history with the Complete button, quick-complete buttons, and actions dropdown; `CompleteButton`, `QuickCompleteButton`/`QuickCompleteButtonList`, and `ChoreActionsDropdown` are extracted as reusable components (#61)

### Fixed

- **XP formula streak factor display** — the streak factor in the XP formula block was shown as `1–N` (bare multiplier range); it now displays as `100%–N%` to match the decay factor convention and make the scaling immediately legible (#64)

## [0.12.3] — 2026-08-06

### Fixed

- **CD sync-server deploy** — removed the redundant `docker-compose build` step from the workflow; the systemd service file's `ExecStartPre` already rebuilds the image before startup, and `sudo systemctl restart` correctly triggers this sequence

## [0.12.2] — 2026-08-06

### Fixed

- **CD sync-server Docker image build** — the deploy user does not have direct Docker socket access; `docker compose build` and `docker-compose build` now run with `sudo`, consistent with how `systemctl restart` is invoked

## [0.12.1] — 2026-08-06

### Fixed

- **CD sync-server Docker image rebuild** — `docker compose build` (Compose v2 plugin) failed on the production server which has the standalone `docker-compose` binary; the step now tries the plugin first and falls back to the standalone command

## [0.12.0] — 2026-08-06

### Added

- **Post-quantum sync authentication** — sync authentication is replaced with a proper challenge-response scheme: ML-DSA-87 signatures authenticate the client; ML-KEM-1024 hybrid encryption replaces AES-GCM for blob confidentiality; the server no longer holds any secret that would allow decrypting stored blobs
- **Automatic PQ migration** — on first startup after upgrading from v0.11.0 or earlier, a migration modal performs a final pull with the old credentials, generates a new post-quantum key bundle, re-encrypts local state, and pushes to the new blob path; multi-device users are prompted to export the new key before migrating other devices
- **Auto-generate sync credentials on fresh install** — new installations no longer require manual key generation; a PQ key bundle is generated automatically on first launch and a non-blocking notice prompts the user to export it
- **Sync key rotation via DELETE endpoint** — a new `DELETE /sync/{syncId}` endpoint removes the encrypted blob, enabling clean key rotation after a credential compromise; the client exposes this via the sync key management UI
- **Sync overwrite confirmation** — when a pull finds the server state is newer than local, an explicit confirmation dialog is shown before local data is replaced (SEC-000018)
- **Content-Security-Policy** — a `Content-Security-Policy` meta tag in `index.html` enforces strict source allowlists for scripts, styles, and connections (SEC-000031)

### Changed

- **Schema validation migrated from ajv to zod** — all runtime validation uses zod schemas; ajv removed from the dependency tree
- **Sync server runs as non-root** — Docker container user changed from root to `bun`; Dockerfile updated accordingly (SEC-000010)
- **Production error handling** — `NODE_ENV=production` set and a global error handler added to suppress stack traces in server error responses (SEC-000015)
- **Docker image rebuilt on CD deploy** — the CD pipeline now rebuilds the sync-server Docker image before restarting the service so code changes reach the container

### Security

- **Legacy session code path removed (SEC-000037)** — the legacy `syncToken`-based session path that allowed an attacker who knew a user's syncId to hijack their sync blob without ML-DSA authentication is closed; all session creation now requires a valid ML-DSA-87 signature
- **Shared HMAC secret removed from client bundle (SEC-000006)** — `VITE_SYNC_APP_SECRET` / `SYNC_APP_SECRET` removed entirely; the old HMAC challenge-response that baked a shared secret into every bundle is replaced by the PQ signature scheme
- **Cross-tenant blob eviction fixed (SEC-000035)** — PUT quota enforcement previously could evict another user's blob to make room; eviction now only removes blobs that are not the caller's own
- **BREACH/CRIME mitigated (SEC-000034)** — the compress-then-encrypt ordering in the sync blob path is fixed; payload is no longer compressed before encryption, closing the length-based plaintext recovery side channel
- **CDP update pack-overwrite fixed (SEC-000033)** — `updateCDP` now verifies that the pack ID derived from the ZIP's root folder matches the stored pack ID; mismatches are rejected before any records are written
- **CDP import pack ID collision rejected (SEC-000029)** — importing a CDP whose packId already exists in the app is rejected with an error instead of silently overwriting the existing pack
- **ReDoS protection hardened (SEC-000005, SEC-000011, SEC-000012, SEC-000017)** — the ad-hoc ReDoS heuristic is replaced with the `safe-regex` library; `{n,m}` bounded-quantifier and ambiguous-alternation bypasses are now detected; `validateAnswer` regex patterns are checked before use
- **XSS: javascript: URLs sanitized (SEC-000019, SEC-000021)** — `MarkdownDisplay` and `MarkdownEditor` both strip `javascript:` protocol links from rendered and editable content
- **Zip-bomb and decompression limits (SEC-000013, SEC-000016, SEC-000020)** — `fflate` unzipSync guarded with `originalSize` cap; a cumulative uncompressed-size limit is enforced across all entries; the sync decrypt path caps decompressed output at 10 MB
- **AppState schema tightened (SEC-000023, SEC-000030)** — strict `items` validation added to all AppState arrays; `pack.manifest` sub-schema is closed to reject unknown keys
- **Rate limiting on sync endpoints (SEC-000003, SEC-000009)** — `/sync/session` and the catch-all `/sync/` nginx location both have rate-limit zones
- **Path traversal validation for CDP filenames (SEC-000002)** — chore YAML filenames inside a CDP ZIP are validated to contain no path separators or traversal sequences
- **Nonce and bearer token validation (SEC-000001, SEC-000004)** — nonce format validated in the session handler; Bearer token format validated before any Redis lookup
- **Nonce bound to syncId at challenge time (SEC-000007)** — the challenge nonce is now bound to the requesting syncId, preventing nonce reuse across identities
- **nginx access logging disabled for syncToken URL (SEC-000028)** — the `/sync/session` location's access log is turned off to prevent session tokens from appearing in access logs
- **Profile email omitted from CDP export (SEC-000027)** — the `author` field in exported CDPs no longer includes the user's email address; only the display name is used
- **.dockerignore added (SEC-000014)** — secrets and local config files are excluded from the Docker build context to prevent them from being baked into the image
- **Stale SYNC_APP_SECRET references removed (SEC-000024)** — all documentation and config references to the removed `SYNC_APP_SECRET` / `VITE_SYNC_APP_SECRET` variables are cleaned up

## [0.11.0] — 2026-07-01

### Added

- **XP formula display** — a read-only formula block below the score multiplier section shows the full XP calculation: base × streak × decay × multiplier, wrapped in `round()` when any multiplier is active; ranges are shown as `1–N` for streak and `F%–100%` for decay based on active XP settings
- **Score multiplier as dedicated chore field** — the MULTIPLIER question type is removed from the question type selector; a collapsible 'Score Multiplier' section in the chore form replaces it with an enable toggle, prompt, answer type (integer/float), and repetition factor
- **Pack options modal** — a new 'Options…' menu item opens a single modal with Details (title, description), Scoring (streaks, decay, default XP size, XP target, target date), and Import (allow shift on import) sections; the kebab menu is reduced to Options, Download as CDP, and Delete Pack
- **Custom XP size** — the XP size selector gains a 'Custom…' option that replaces the dropdown with a number input for a precise positive-integer XP amount; supported both on chores and as a pack default
- **Default XP size per pack** — set a default XP size in the pack options modal; new chores created within that pack pre-fill with the pack's default instead of the app-wide default
- **Decay toggle per pack** — disable XP decay for individual packs via the pack options modal; the decay factor is hidden from the XP formula and treated as 1 in the calculation
- **First Due Date scheduling** — the 'Start Date' field in the chore form is relabelled 'First Due Date'; the displayed value is shifted by one interval so users enter the date the chore is first due rather than the internal window-open date
- **Window bar** — a proportional bar below the Due Period field visualises one complete window split into Upcoming (gray) and Due (yellow) segments with duration labels above and date anchors below

### Fixed

- **Pack options modal crash on open** — Radix UI `<SelectItem>` does not allow an empty string value; replaced the empty-string sentinel with `'NONE'` for the 'no default XP size' option
- **Stale pack settings after save** — `updatePackManifest` was not calling `markDirty()`, so pack changes were not synced; now marks dirty after every manifest update

### Security

- **Sync server blob-store resource exhaustion DoS (SEC-000026)** — enforced a disk quota with LRU eviction on the blob store to prevent unbounded storage growth; new `SYNC_BLOB_QUOTA_BYTES` (default 10 GB) and `SYNC_BLOB_MAX_COUNT` (default 10,000) environment variables control the limits; oldest blobs (by modification time) are evicted first when a cap is reached, never evicting the caller's own blob; new writes are rejected with HTTP 507 if eviction cannot free enough space

## [0.10.7] — 2026-06-26

### Fixed

- **No initial push when server is empty** — `pull` was silently returning on a server 404 without marking the state dirty; it now calls `markDirty()` so the debounced push fires and uploads local data to a fresh server without requiring any user action

## [0.10.6] — 2026-06-26

### Fixed

- **Double slash in sync requests** — trailing slashes on `SYNC_URL` (e.g. set with a trailing `/` in GitHub variables) are now stripped in `vite.config.ts` before the value is baked into the bundle, preventing `//sync/challenge` 404s

## [0.10.5] — 2026-06-26

### Fixed

- **SYNC_APP_SECRET not available in CD build** — GitHub Actions does not automatically pass secrets into reusable workflows; added `secrets: inherit` to the `ci` job call in `cd.yml` so `SYNC_APP_SECRET` reaches the build step

## [0.10.4] — 2026-06-26

### Fixed

- **SYNC_URL/SYNC_APP_SECRET scope** — variables and secrets must be set at repository level, not inside a named environment; the `build` job has no environment context so environment-scoped values were silently empty; `DEPLOYMENT.md` now documents the exact GitHub UI path for each value
- **Pre-build configuration check** — CI now fails with an explicit error message listing any missing repository-level variables or secrets before attempting the build

## [0.10.3] — 2026-06-26

### Fixed

- **VITE_SYNC_URL not injected into bundle** — `vite.config.ts` evaluates before Vite loads `.env` files, so `process.env.VITE_SYNC_URL` was undefined at config time and the URL was never baked in; the define block now conditionally injects it when the variable is present in the process environment (CI), while local dev continues to read from `.env.local` via Vite's normal env loading

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

[0.14.0]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.14.0
[0.13.0]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.13.0
[0.12.3]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.12.3
[0.12.2]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.12.2
[0.12.1]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.12.1
[0.12.0]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.12.0
[0.11.0]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.11.0
[0.10.7]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.10.7
[0.10.6]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.10.6
[0.10.5]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.10.5
[0.10.4]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.10.4
[0.10.3]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.10.3
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
