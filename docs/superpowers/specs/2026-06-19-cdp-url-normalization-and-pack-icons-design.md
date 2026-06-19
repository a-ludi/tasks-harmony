# Design: CDP URL Normalization & Imported Pack Icons

**Date:** 2026-06-19
**Issues:** #42 (Improved CDN URLs), #43 (Icon for imported CDP)

---

## Issue #42 — URL Normalization (`normalizePackUrl`)

### Problem

Users must currently supply an exact raw CDN URL when importing a CDP pack. Pasting a standard GitHub or GitLab browser URL (tree/blob view) fails. Pasting the manifest file URL (`/__pack__.yaml`) also fails.

### Solution

A pure utility function `normalizePackUrl(url: string): string` in `src/cdp/normalizePackUrl.ts` that transforms common provider URLs into fetchable raw base URLs. Called once in `CDPImportDialog.handleImport()` before any fetch, so the stored `sourceUrl` is always in normalized form.

### Transformations

Applied in order. The `/__pack__.yaml` suffix is stripped first (before provider matching), then the first matching provider rule is applied. Unrecognized URLs (including already-raw URLs) pass through unchanged.

| Input pattern | Output |
|---|---|
| Any URL ending `/__pack__.yaml` | Strip suffix, then continue matching |
| `https://github.com/{u}/{r}/tree/{branch}/{path}` | `https://raw.githubusercontent.com/{u}/{r}/refs/heads/{branch}/{path}` |
| `https://github.com/{u}/{r}/blob/{branch}/{path}` | `https://raw.githubusercontent.com/{u}/{r}/refs/heads/{branch}/{path}` |
| `https://{host}/.../-/tree/{branch}/{path}` | `https://{host}/.../-/raw/{branch}/{path}` (GitLab, any host) |
| `https://{host}/.../-/blob/{branch}/{path}` | `https://{host}/.../-/raw/{branch}/{path}` (GitLab, any host) |
| `https://{host}/{u}/{r}/blob/{branch}/{path}` | `https://{host}/{u}/{r}/raw/{branch}/{path}` (GitHub Enterprise) |
| `https://{host}/{u}/{r}/tree/{branch}/{path}` | `https://{host}/{u}/{r}/raw/{branch}/{path}` (GitHub Enterprise) |
| Anything else | Unchanged (already raw, or unknown provider) |

GitLab is detected by the `/-/` path prefix (unique to GitLab regardless of domain), checked before the GitHub Enterprise fallback.

**Scope limitation:** GitHub branch references are always written as `refs/heads/{branch}`. Tags and commit SHAs are not handled.

### Architecture

- **`src/cdp/normalizePackUrl.ts`** — exports `normalizePackUrl(url: string): string`
- **`src/cdp/normalizePackUrl.test.ts`** — unit tests covering:
  - Each provider transformation (GitHub.com, GitLab hosted, GitLab self-hosted, GitHub Enterprise)
  - Already-raw URLs for each provider return unchanged (idempotency)
  - `/__pack__.yaml` suffix stripped before and independently of provider matching
  - Combined suffix stripping + provider transformation
  - Unknown / arbitrary URLs pass through unchanged
- **`src/components/cdp/CDPImportDialog.tsx`** — call `normalizePackUrl(trimmed)` in `handleImport()` before `fetchCDPManifestOnly`

---

## Issue #43 — Imported Pack Icon

### Problem

Imported CDPs (packs with a `sourceUrl`) are visually indistinguishable from locally-created packs in the sidebar and on the pack dashboard. Users have no quick way to trigger an update for an imported pack from those locations.

### Solution

A small `↻` icon button rendered next to the pack title when `pack.sourceUrl` is set. Clicking it opens `CDPImportDialog`, which already lists all updatable packs. The button appears in two places:

#### Sidebar (`src/components/layout/Sidebar.tsx`)

Each pack item becomes a `<div>` flex row with the `NavLink` and the icon button as siblings (a `<button>` cannot be a descendant of an `<a>`):

```
[ NavLink: Pack Title   12 XP ] [ ↻ ]
```

The `NavLink` takes `flex-1` so it fills the row. The `↻` button is a sibling, only rendered when `pack.sourceUrl` is truthy. Click handler: `setShowCDPDialog(true)` — opens the existing `CDPImportDialog` already rendered in the sidebar. No event suppression needed since the button is not inside the link.

#### Pack Dashboard (`src/components/packs/PackDashboard.tsx`)

Inside the title row alongside the existing ✏️ rename button:

```
[ Pack Title ] [ ✏️ ] [ ↻ ]  [ 1,234 XP ]  [ ⋮ ]
```

Requires a new `showCDPDialog` local state and `<CDPImportDialog>` rendered at the bottom of the component, following the same pattern as the existing `showDeletionDialog` / `<PackDeletionDialog>`.

### Button style

```tsx
<Button
  variant="ghost"
  size="sm"
  onClick={() => setShowCDPDialog(true)}
  title="Update imported pack"
  aria-label="Update imported pack"
  className="text-muted-foreground hover:text-foreground"
>
  ↻
</Button>
```

Consistent with the existing ✏️ and ⋮ ghost buttons in both locations.

### No new components

Both changes are inline additions to existing components. No new files needed beyond the icon button markup.

---

## Out of Scope

- Gitea / Forgejo URL normalization (different pattern; add when requested)
- Bitbucket URL normalization
- GitHub tag/commit SHA references in `normalizePackUrl`
- Scrolling/highlighting a specific pack in `CDPImportDialog` when opened via the icon
