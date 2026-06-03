# I02: Personal Title Bar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the user's display name alongside "Tasks Harmony" in the mobile header and below the logo in the desktop sidebar, using a serif italic style to distinguish the personal name from the app name.

**Architecture:** Two touch points: (1) `App.tsx` mobile header appends `· {displayName}` in `font-serif italic` after "Tasks Harmony" when a name is set; (2) `Sidebar.tsx` shows the display name in `font-serif italic` below the logo link. Both read `profile` from the Zustand store. A small helper formats the name safely.

**Tech Stack:** React, Zustand (`useAppStore`), Tailwind CSS (`font-serif italic`).

---

### Task 1: Extract and test the display name helper

**Files:**
- Create: `src/components/layout/displayName.ts`
- Create: `src/components/layout/displayName.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/components/layout/displayName.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { getDisplayName } from './displayName';

describe('getDisplayName', () => {
  it('returns the trimmed display name when set', () => {
    expect(getDisplayName('Alice')).toBe('Alice');
  });

  it('returns null when display name is empty', () => {
    expect(getDisplayName('')).toBeNull();
  });

  it('returns null when display name is whitespace only', () => {
    expect(getDisplayName('   ')).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(getDisplayName('  Bob  ')).toBe('Bob');
  });
});
```

- [ ] **Step 2: Run test — expect fail**

```bash
bun test --isolate src/components/layout/displayName.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement displayName.ts**

Create `src/components/layout/displayName.ts`:

```ts
export function getDisplayName(displayName: string): string | null {
  const trimmed = displayName.trim();
  return trimmed || null;
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
bun test --isolate src/components/layout/displayName.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/displayName.ts src/components/layout/displayName.test.ts
git commit -m "feat: add getDisplayName helper for personal title bar"
```

---

### Task 2: Update mobile header in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import helper and read profile**

At the top of `src/App.tsx`, add:

```ts
import { getDisplayName } from '@/components/layout/displayName';
```

Inside the `App` component, add after the existing store subscriptions:

```ts
const profile = useAppStore((s) => s.profile);
const displayName = getDisplayName(profile?.displayName ?? '');
```

- [ ] **Step 2: Update the mobile header title**

Find the mobile header `<Link to="/" className="font-bold text-gray-900">Tasks Harmony</Link>`.

Replace with:

```tsx
<Link to="/" className="font-bold text-gray-900 flex items-baseline gap-1.5">
  Tasks Harmony
  {displayName && (
    <>
      <span className="text-gray-300 font-normal">·</span>
      <span className="font-serif italic font-normal text-gray-700">{displayName}</span>
    </>
  )}
</Link>
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: show display name in mobile header alongside app title"
```

---

### Task 3: Show display name in desktop sidebar

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Import helper and read profile**

In `src/components/layout/Sidebar.tsx`, add the import:

```ts
import { getDisplayName } from '@/components/layout/displayName';
```

Inside the `Sidebar` component, add after the existing store subscriptions:

```ts
const profile = useAppStore((s) => s.profile);
const displayName = getDisplayName(profile?.displayName ?? '');
```

- [ ] **Step 2: Add name below the logo link**

Find the `<Link to="/" ... className="mb-4 hidden ...">Tasks Harmony</Link>` block.

After it, add:

```tsx
{displayName && (
  <p className="mb-3 hidden font-serif italic text-gray-500 md:block">
    {displayName}
  </p>
)}
```

- [ ] **Step 3: Run typecheck + full suite**

```bash
bun run typecheck && bun test
```

Expected: exits 0, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat: show display name in serif italic below logo in desktop sidebar"
```
