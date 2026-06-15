# Sprint Pack Features Design — 2026-06-15

Issues: #33, #36, #39, #40

---

## #40 — Due period

A per-chore optional field that delays the `due` status until near the end of the window.

### Data model

Add to `Chore`:

```ts
duePeriod?: { value: number; unit: 'minutes' | 'hours' | 'days' | 'weeks' | 'months' }
```

Constraint: `unit` must be ≤ the chore's frequency unit (e.g. a daily chore cannot have a `duePeriod` in weeks). Omitting `duePeriod` preserves current behaviour (full window = due from window open).

Exported in CDP chore YAML.

### Logic

In `recurrence.ts`, when computing status: if the chore has a `duePeriod` and the current time is within the window but before `windowEnd − duePeriod`, return `'upcoming'` instead of `'due'`. The existing upcoming section on the dashboard handles it automatically.

### UI

A new "Due period" field in the chore edit form — number input + unit `<select>`. Only rendered when the chore has a frequency set. Leaving the field blank omits `duePeriod` from the saved chore.

---

## #36 — Pack-level streak control

Allows disabling streak mechanics for an entire pack — useful for exercise sets or rotation packs where variety is more important than repetition.

### Data model

Add to `PackManifest`:

```ts
streak?: boolean  // default: true
```

When `streak` is `false`: streak multiplier is fixed at 1 for all chores in the pack, and streak count is not shown on chore cards. Exported in CDP `__pack__.yaml`.

### UI

Replace the existing "Download as CDP" and "Delete Pack" buttons on `PackDashboard` with a single kebab `DropdownMenu` (shadcn). Menu structure:

| Item | Type | Notes |
|------|------|-------|
| Streaks enabled | `DropdownMenuCheckboxItem` | Checked = `streak: true` (default) |
| Allow shift on import | `DropdownMenuCheckboxItem` | See #33 below |
| Set XP target… | `DropdownMenuItem` | See #33 below |
| Set target date… | `DropdownMenuItem` | See #33 below |
| *(separator)* | | |
| Download as CDP | `DropdownMenuItem` | |
| *(separator)* | | |
| Delete Pack | `DropdownMenuItem` | Destructive style; hidden for the built-in personal pack |

---

## #33 — Completable chore packs

Packs can optionally declare an XP target and/or a target date. Progress is shown on the pack page; completion and lapse are communicated visually.

### Data model

Add to `PackManifest`:

```ts
xpTarget?: number
targetDate?: string           // ISO date, e.g. "2026-12-31"
allowShiftOnImport?: boolean  // default: false
```

All three optional and independent. Exported in CDP `__pack__.yaml`.

### Pack page display

Between the title row and the pack description, show whichever progress bars are configured (most prominent feature after the title):

- **XP bar (amber):** `packXP / xpTarget`, label "840 / 1 200 XP". Replaced by a "Completed" badge once `packXP >= xpTarget`.
- **Time bar (blue):** `(today − earliestChoreStart) / (targetDate − earliestChoreStart)`, label showing the target date. Not rendered if the pack has no chores. Replaced by a "Lapsed" badge once `today > targetDate` and the XP target is not yet met (or no XP target is set).

### Setting values

Three new items in the pack kebab menu (see #36 table above):

- **"Allow shift on import"** — `DropdownMenuCheckboxItem`, sets `allowShiftOnImport`.
- **"Set XP target…"** — opens a `Dialog` modal with a number input. Clearing the field removes the goal.
- **"Set target date…"** — opens a `Dialog` modal with a date input. Clearing the field removes the goal.

Note: XP target and target date use `Dialog` (not `Popover`) because Radix `Popover` nested inside `DropdownMenu` loses focus and disappears when the mouse moves between the two.

### CDP import date shifting

When an imported CDP has both a `targetDate` and `allowShiftOnImport: true`, the import dialog switches to a date-shift step showing:

- A two-column grid: **Start date** input (left) and **Target date** input (right)
- A "Duration: N days" label below the grid
- "Import with these dates" and "Back" buttons

Editing either date recomputes the other by preserving the original offset between them. All chore start dates are shifted by the same delta. When `allowShiftOnImport` is `false` or absent, dates are imported as-is and no shifting UI is shown.

---

## #39 — Nav menu cleanup

Simplify the sidebar footer by moving utility items to the Profile page.

### Sidebar changes

Remove from the sidebar:
- `SyncButton`
- Dark mode toggle
- "View on GitHub" link

The footer becomes:
```
[Update to vX.Y.Z]   ← conditional, unchanged
v0.5.0 · 2026-06-15  ← version line, unchanged
```

### Profile page additions

Add two sections to `ProfilePage`:

**"App" section:**
- `SyncButton`
- Dark mode toggle (Switch + Label)

**"About" section:**
- App title ("Tasks Harmony")
- Short description
- Version and build date
- Author
- "View on GitHub" link
