# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-06-04

### Fixed

- **CD pipeline**: `gh release create --skip-existing` is not supported on GitHub Actions runners; replaced with `gh release view ... || gh release create ...`.

## [0.1.0] - 2026-06-04

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

[0.1.1]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.1.1
[0.1.0]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.1.0
