# B01: Resizable Sidebar on Desktop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the desktop sidebar resizable by dragging its right edge, with the chosen width persisted in `localStorage`.

**Architecture:** Add a drag handle `<div>` on the right edge of the `<aside>` in `App.tsx`. Track `mousedown` → `mousemove` → `mouseup` to update `sidebarWidth` state (clamped to 160–400 px). Replace the fixed `w-48` Tailwind class with an inline `style={{ width: sidebarWidth }}`. Read/write `localStorage['sidebarWidth']`. The handle is hidden on mobile (`md:block hidden`).

**Tech Stack:** React (useState, useRef, useEffect), Tailwind CSS, localStorage.

---

### Task 1: Extract and test sidebar width clamping logic

**Files:**
- Create: `src/components/layout/sidebarResize.ts`
- Create: `src/components/layout/sidebarResize.test.ts`

- [ ] **Step 1: Write a failing test for the clamp helper**

Create `src/components/layout/sidebarResize.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { clampSidebarWidth, SIDEBAR_MIN, SIDEBAR_MAX, SIDEBAR_DEFAULT } from './sidebarResize';

describe('clampSidebarWidth', () => {
  it('returns the value unchanged when within bounds', () => {
    expect(clampSidebarWidth(200)).toBe(200);
  });

  it('clamps to SIDEBAR_MIN when below minimum', () => {
    expect(clampSidebarWidth(50)).toBe(SIDEBAR_MIN);
  });

  it('clamps to SIDEBAR_MAX when above maximum', () => {
    expect(clampSidebarWidth(9999)).toBe(SIDEBAR_MAX);
  });

  it('accepts exactly SIDEBAR_MIN', () => {
    expect(clampSidebarWidth(SIDEBAR_MIN)).toBe(SIDEBAR_MIN);
  });

  it('accepts exactly SIDEBAR_MAX', () => {
    expect(clampSidebarWidth(SIDEBAR_MAX)).toBe(SIDEBAR_MAX);
  });
});

describe('SIDEBAR_DEFAULT', () => {
  it('is within [SIDEBAR_MIN, SIDEBAR_MAX]', () => {
    expect(SIDEBAR_DEFAULT).toBeGreaterThanOrEqual(SIDEBAR_MIN);
    expect(SIDEBAR_DEFAULT).toBeLessThanOrEqual(SIDEBAR_MAX);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
bun test --isolate src/components/layout/sidebarResize.test.ts
```

Expected: FAIL — `sidebarResize` module not found.

- [ ] **Step 3: Implement sidebarResize.ts**

Create `src/components/layout/sidebarResize.ts`:

```ts
export const SIDEBAR_MIN = 160;
export const SIDEBAR_MAX = 400;
export const SIDEBAR_DEFAULT = 192; // 48 * 4 = w-48

export function clampSidebarWidth(width: number): number {
  return Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, width));
}

export function readStoredWidth(): number {
  const stored = localStorage.getItem('sidebarWidth');
  if (!stored) return SIDEBAR_DEFAULT;
  const parsed = parseInt(stored, 10);
  return Number.isFinite(parsed) ? clampSidebarWidth(parsed) : SIDEBAR_DEFAULT;
}

export function writeStoredWidth(width: number): void {
  localStorage.setItem('sidebarWidth', String(width));
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
bun test --isolate src/components/layout/sidebarResize.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/sidebarResize.ts src/components/layout/sidebarResize.test.ts
git commit -m "feat: add sidebar width clamping helpers with localStorage persistence"
```

---

### Task 2: Add drag handle and resize behaviour to App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import the helpers in App.tsx**

At the top of `src/App.tsx`, add:

```ts
import { clampSidebarWidth, readStoredWidth, writeStoredWidth } from '@/components/layout/sidebarResize';
```

- [ ] **Step 2: Add sidebarWidth state and resize handler**

Inside the `App` component function, after the existing `useState` calls, add:

```ts
const [sidebarWidth, setSidebarWidth] = useState(() => readStoredWidth());
const sidebarWidthRef = useRef(sidebarWidth);

function handleResizeMouseDown(e: React.MouseEvent) {
  e.preventDefault();
  const startX = e.clientX;
  const startWidth = sidebarWidthRef.current;

  function onMouseMove(ev: MouseEvent) {
    const newWidth = clampSidebarWidth(startWidth + ev.clientX - startX);
    sidebarWidthRef.current = newWidth;
    setSidebarWidth(newWidth);
  }

  function onMouseUp() {
    writeStoredWidth(sidebarWidthRef.current);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}
```

Keep `sidebarWidthRef` in sync when state updates:

```ts
useEffect(() => {
  sidebarWidthRef.current = sidebarWidth;
}, [sidebarWidth]);
```

- [ ] **Step 3: Update the aside element**

Find the `<aside>` element in App.tsx (currently has `className="fixed inset-y-0 left-0 z-40 w-48 bg-white ..."`).

Replace the `aside` block with:

```tsx
<aside
  style={{ width: sidebarWidth }}
  className={`fixed inset-y-0 left-0 z-40 bg-white border-r border-gray-200 transition-transform md:static md:translate-x-0 ${
    sidebarOpen ? 'translate-x-0' : '-translate-x-full'
  }`}
>
  <Sidebar
    onClose={() => setSidebarOpen(false)}
    onNewPack={() => setShowNewPackDialog(true)}
  />
  <div
    onMouseDown={handleResizeMouseDown}
    className="absolute inset-y-0 right-0 hidden w-1 cursor-col-resize bg-transparent hover:bg-blue-300 md:block"
    title="Drag to resize sidebar"
  />
</aside>
```

- [ ] **Step 4: Run typecheck and full unit test suite**

```bash
bun run typecheck && bun test
```

Expected: exits 0, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: make desktop sidebar resizable by dragging its right edge"
```
