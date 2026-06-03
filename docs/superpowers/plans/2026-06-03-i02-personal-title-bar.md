# I02: Personal Title Bar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the user's display name in the title bar — the mobile header and the desktop sidebar header — making the app feel personal beyond the XP badge.

**Architecture:** Two touch points: (1) `App.tsx` mobile header replaces "Tasks Harmony" with the display name (falling back to "Tasks Harmony" when no name is set), and (2) `Sidebar.tsx` shows the display name below the "Tasks Harmony" logo link when set. Both read `profile` from the Zustand store.

**Tech Stack:** React, Zustand (`useAppStore`), Tailwind CSS.

---

### Task 1: Extract and test the display name formatting logic

**Files:**
- Create: `src/components/layout/displayName.ts`
- Create: `src/components/layout/displayName.test.ts`

- [ ] **Step 1: Write a failing test**

Create `src/components/layout/displayName.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { resolveHeaderTitle, resolveGreeting } from './displayName';

describe('resolveHeaderTitle', () => {
  it('returns the display name when set', () => {
    expect(resolveHeaderTitle('Alice')).toBe('Alice');
  });

  it('returns "Tasks Harmony" when display name is empty', () => {
    expect(resolveHeaderTitle('')).toBe('Tasks Harmony');
  });

  it('returns "Tasks Harmony" when display name is whitespace only', () => {
    expect(resolveHeaderTitle('   ')).toBe('Tasks Harmony');
  });
});

describe('resolveGreeting', () => {
  it('returns "Hi, Alice" when display name is set', () => {
    expect(resolveGreeting('Alice')).toBe('Hi, Alice');
  });

  it('returns null when display name is empty', () => {
    expect(resolveGreeting('')).toBeNull();
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
export function resolveHeaderTitle(displayName: string): string {
  return displayName.trim() || 'Tasks Harmony';
}

export function resolveGreeting(displayName: string): string | null {
  const name = displayName.trim();
  return name ? `Hi, ${name}` : null;
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
bun test --isolate src/components/layout/displayName.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/displayName.ts src/components/layout/displayName.test.ts
git commit -m "feat: add display name formatting helpers for title bar"
```

---

### Task 2: Show display name in the mobile header (App.tsx)

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import the helper and read profile**

At the top of `src/App.tsx`, add the import:

```ts
import { resolveHeaderTitle } from '@/components/layout/displayName';
```

Inside the `App` component, add after the existing store subscriptions:

```ts
const profile = useAppStore((s) => s.profile);
```

- [ ] **Step 2: Update the mobile header**

Find the mobile header `<Link to="/" className="font-bold text-gray-900">Tasks Harmony</Link>`.

Replace with:

```tsx
<Link to="/" className="font-bold text-gray-900">
  {resolveHeaderTitle(profile?.displayName ?? '')}
</Link>
```

- [ ] **Step 3: Typecheck**

```bash
bun run typecheck
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: show user display name in mobile header title bar"
```

---

### Task 3: Show greeting in the desktop sidebar (Sidebar.tsx)

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Import helpers and read profile**

In `src/components/layout/Sidebar.tsx`, add the import:

```ts
import { resolveGreeting } from '@/components/layout/displayName';
```

In the `Sidebar` component, add the profile subscription alongside the existing store reads:

```ts
const profile = useAppStore((s) => s.profile);
```

- [ ] **Step 2: Add greeting below the logo**

Find the logo `<Link to="/" ... className="mb-4 hidden ...">Tasks Harmony</Link>` block.

After it, add:

```tsx
{resolveGreeting(profile?.displayName ?? '') && (
  <p className="mb-3 hidden text-sm text-gray-500 md:block">
    {resolveGreeting(profile?.displayName ?? '')}
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
git commit -m "feat: show greeting with display name in desktop sidebar"
```
