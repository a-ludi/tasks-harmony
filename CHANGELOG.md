# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[0.4.0]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.4.0
[0.2.0]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.2.0
[0.1.1]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.1.1
[0.1.0]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.1.0
