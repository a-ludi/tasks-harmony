# Sprint Design: UI Library Migration, Dark Mode, Compact Mode

**Issues:** #6 (Shadcn/ui migration) → #16 (Dark mode) → #12 (Compact mode)  
**Date:** 2026-06-08

---

## #6 — Migrate to Shadcn/ui

### Setup

Run `bunx shadcn@latest init` targeting Tailwind v4. This writes `src/components/ui/`, adds CSS variable token definitions (light and dark) to `index.css`, and sets up the Tailwind v4 CSS-based config. Add `clsx` and `tailwind-merge` as a `cn()` utility.

### Component mapping

| Current pattern | Shadcn component |
|---|---|
| Hand-rolled dialogs (7 components) | `Dialog` |
| Inline cards (`div.rounded-xl.border`) | `Card`, `CardHeader`, `CardContent` |
| `StatusBadge` | `Badge` |
| All `<button>` elements | `Button` |
| Quick-answer tooltip | `Tooltip` |
| Pack actions `⋮` menu | `DropdownMenu` |
| Form inputs / selects / textareas | `Input`, `Select`, `Label`, `Textarea` |
| Sidebar off-canvas on mobile | `Sheet` |
| Dark mode toggle | `Switch` |

### Principles

- Use Shadcn components as-is and as-intended. Do not wrap primitives in extra layers.
- Compose using documented patterns (`Card > CardHeader > CardContent`, etc.).
- Minimise custom CSS overrides — lean on Shadcn tokens and variants.
- Assess bundle size impact before and after migration.

### Acceptance criteria

- All existing components migrated to use Shadcn primitives.
- Visual regression is minimal — screens look equivalent or better.
- Theming/customisation approach established (CSS variables, ready for dark mode).
- Bundle size impact assessed and acceptable.

---

## #16 — Dark Mode

### Theming

Shadcn's init writes `:root` (light) and `.dark` (dark) CSS variable sets into `index.css`. Toggling `class="dark"` on `<html>` switches the entire theme. No per-component work needed — all Shadcn tokens use these variables.

### State and persistence

A `useTheme` hook owns all logic:

1. On mount: read `localStorage.getItem('theme')`. If absent, fall back to `window.matchMedia('(prefers-color-scheme: dark)')`.
2. Apply or remove the `dark` class on `document.documentElement`.
3. On toggle: flip the class, write the new value to `localStorage`.

The hook is called once at the app root (`App.tsx`). No Zustand involvement — theme is a device-level display preference and must not sync via WebDAV.

### Toggle placement

A Shadcn `Switch` with a "Dark mode" label is added to `Sidebar`, in the same border-separated bottom section as `SyncButton`, above the version footer. The switch reads and writes through `useTheme`.

### Acceptance criteria

- Dark mode theme applied consistently across all screens.
- Defaults to OS colour scheme preference.
- User override persists across sessions via `localStorage`.
- Toggle accessible from the sidebar navigation.
- No readability or contrast issues in dark mode (WCAG AA).

---

## #12 — Compact Mode

### State and persistence

A `useCompactMode` hook mirrors `useTheme`: reads and writes `localStorage('compact-mode')`, returns `[compact, toggle]`. No Zustand involvement — compact mode is a device-level display preference.

### ChoreCard

`ChoreCard` accepts a `compact?: boolean` prop. When `true`, the Shadcn `Card` root receives `data-compact="true"`. All visual changes are purely CSS:

```css
[data-compact="true"] {
  /* reduced card padding */
}
[data-compact="true"] .chore-description,
[data-compact="true"] .chore-recurrence,
[data-compact="true"] .chore-xp {
  display: none;
}
```

No conditional rendering inside `ChoreCard` — it remains a pure presentational component. The card list container in `Dashboard` applies a reduced `gap` class when compact is active.

### Visible in compact cards

- Chore name
- `StatusBadge`
- Streak count
- `CompleteButton` (and quick-answer buttons when due/overdue)

All other content (description, recurrence label, XP preview) is hidden via CSS.

### Toggle

A compact-mode icon button lives in the Dashboard header, right-aligned above the chore list. It calls `toggle()` from `useCompactMode`. `Dashboard` reads `compact` and:
- Passes it as a prop to each `ChoreCard`.
- Applies the tighter `gap` class to the card list wrapper.

### Acceptance criteria

- Compact mode toggle accessible from the dashboard toolbar.
- Compact cards show name, status, streak, and complete button only.
- Mode preference persists across sessions via `localStorage`.
- Both modes usable on mobile and desktop.
- All chore actions remain reachable from compact cards.
