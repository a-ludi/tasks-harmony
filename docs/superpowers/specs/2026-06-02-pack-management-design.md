# Pack Management — Design Spec

**Date:** 2026-06-02

**Goal:** Let users organise chores into named packs, navigate to a pack-filtered dashboard, create new packs, and export any pack as a downloadable CDP ZIP.

---

## Background

The app already has a `Pack` data model and a default "personal" pack seeded at first launch. The CDP import flow (fetch from URL) is implemented. What is missing:

- Packs are not surfaced in the UI navigation
- There is no way to create a new pack
- There is no way to export a pack as a shareable CDP

---

## 1. Navigation — Responsive Vertical Sidebar

The current horizontal top bar is replaced by a responsive vertical sidebar.

### Desktop (viewport ≥ 768px)

A fixed left sidebar (~200px wide) is always visible. The main content area has a corresponding left margin. The sidebar contains, top to bottom:

- App title ("Tasks Harmony")
- XP counter
- **Chores** section:
  - "Dashboard" link → `/` (all chores, unfiltered)
  - One link per pack (pack `manifest.title`) → `/packs/:packId`
  - `+` button labelled "New Pack"
- **Account** section:
  - "Profile" link → `/profile`
- **Sync** section:
  - Sync button + Import Pack button (as today)

### Mobile (viewport < 768px)

A compact top bar shows the app title and a ☰ hamburger button. Tapping the button opens the full sidebar as a left-side drawer overlay. Tapping any link or the backdrop closes the drawer.

### Implementation approach

`NavBar.tsx` is replaced by two components:
- `Sidebar.tsx` — the vertical nav content (used in both desktop and mobile drawer)
- The layout shell in `App.tsx` renders Sidebar beside `<main>` on desktop, and a top bar + drawer on mobile (using a Tailwind `md:` breakpoint and a React `useState` for the open/closed state)

---

## 2. Pack-Filtered Routes

| Route | Component | Behaviour |
|---|---|---|
| `/` | `Dashboard` | All active chores (unchanged) |
| `/packs/:packId` | `PackDashboard` | Chores filtered to `chore.packId === packId` |
| `/profile` | `ProfilePage` | Unchanged |

`PackDashboard` renders:
- A pack header: pack title + "Download as CDP" button + optional rename control (inline edit of `manifest.title`)
- The existing `Dashboard` component receiving only the filtered chore list

If `:packId` does not match any pack in the store, the route redirects to `/`.

The rename control is a small ✏️ button beside the pack title. Clicking it switches the title to an inline text input with Save/Cancel. On save, `renamePack` is called.

---

## 3. Pack Creation

The `+` New Pack button in the sidebar opens a small modal dialog containing:

- A single text field: **Pack name** (required)
- "Create" and "Cancel" buttons

On confirm:

1. Pack ID is derived by slugifying the name: lowercase, spaces → hyphens (e.g. "Morning Routines" → `morning-routines`). If a pack with that ID already exists, a numeric suffix is appended (`morning-routines-2`, etc.).
2. A new `Pack` record is written to IndexedDB:
   - `id`: derived slug
   - `manifest.title`: the entered name
   - `isPersonal`: `false`
   - `importedAt` / `updatedAt`: current timestamp
   - `sourceUrl`: absent
3. The store's `packs` array is updated.
4. The app navigates to `/packs/:newPackId`.

The default "personal" pack cannot be deleted. Its `manifest.title` can be edited via the rename control in the pack header (inline edit). Its `id` remains `"personal"` permanently.

---

## 4. Chore Form — Pack Field

`ChoreFormModal` gains a **Pack** field.

**Create mode:** a `<select>` dropdown listing all packs by `manifest.title`. Default selection:
- The current pack if the user opened the form from a `/packs/:packId` view.
- `"personal"` if opened from the unfiltered `/` dashboard.

**Edit mode:** a read-only text display of the chore's current pack name. Changing pack (moving a chore) is not supported in this version; the field is displayed for information only.

The `packId` value from the form is passed to the existing `addChore` store action, which already accepts `packId`.

---

## 5. CDP Export

A **"Download as CDP"** button in the `PackDashboard` header generates and downloads a ZIP file entirely in the browser.

### ZIP structure

```
morning-routines.zip
└── morning-routines/
    ├── __pack__.yaml
    ├── brush-teeth.yaml
    └── make-bed.yaml
```

The ZIP filename is `<packId>.zip`. The folder inside the ZIP is also named `<packId>`.

### `__pack__.yaml` contents

```yaml
title: "Morning Routines"
author: "Alice"            # omitted if not set on the pack manifest
license: "MIT"             # omitted if not set
description: "..."         # omitted if not set
chores:
  - brush-teeth.yaml
  - make-bed.yaml
```

### Per-chore YAML contents

```yaml
title: "Brush Teeth"
xpSize: XXS
frequency: daily
interval: 1
windowStartTime: "22:00"
repeatable: false
description: "..."         # omitted if not set
```

Only **active** chores (`chore.active === true`) in the pack are included. Questions and completion history are excluded (they are user-specific runtime data, not pack definitions).

### ZIP generation

Client-side, using the `fflate` npm package (lightweight, browser-compatible, no server required). `fflate` is added as a production dependency.

### Export logic

Lives in `src/cdp/cdp-export.ts`, which exports a single function:

```ts
export function buildCDPZip(pack: Pack, chores: Chore[]): Uint8Array
```

Returns the raw ZIP bytes. The component calls this and triggers a browser download via a temporary `<a>` element with an object URL.

---

## 6. Store Changes

Two new actions added to `src/store/index.ts`:

| Action | Signature | Effect |
|---|---|---|
| `addPack` | `(name: string) => Promise<string>` | Creates pack, writes to IDB, updates `packs`, returns new pack ID |
| `renamePack` | `(packId: string, newTitle: string) => Promise<void>` | Updates `pack.manifest.title` in IDB and store |

No schema changes to IndexedDB — the `packs` store already exists.

---

## 7. File Map

| File | Action | Purpose |
|---|---|---|
| `src/components/layout/Sidebar.tsx` | Create | Vertical nav: XP, pack links, + New Pack, Profile, Sync |
| `src/components/packs/NewPackDialog.tsx` | Create | Modal for naming and creating a new pack |
| `src/components/packs/PackDashboard.tsx` | Create | Pack header (title, rename, export) + filtered Dashboard |
| `src/cdp/cdp-export.ts` | Create | `buildCDPZip(pack, chores): Uint8Array` |
| `src/cdp/cdp-export.test.ts` | Create | Unit tests for export logic |
| `src/components/layout/NavBar.tsx` | Delete/replace | Superseded by Sidebar.tsx |
| `src/App.tsx` | Modify | Use sidebar layout, add `/packs/:packId` route |
| `src/components/chores/ChoreFormModal.tsx` | Modify | Add pack selector (create) / pack display (edit) |
| `src/store/index.ts` | Modify | Add `addPack`, `renamePack` actions |
| `package.json` | Modify | Add `fflate` dependency |
