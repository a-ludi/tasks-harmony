# B02: WebDAV Input Hidden When Sidebar Narrow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the WebDAV URL input and Save button in `SyncButton` being hidden when the sidebar is narrow by making the input full-width and stacking the button below it.

**Architecture:** Pure CSS/layout fix in `SyncButton.tsx`. The URL input row currently uses `flex items-center gap-2` with a fixed `w-64` input — when the sidebar is narrower than 256 px the input overflows or clips. Change to a vertical `space-y-2` stack with `w-full` on both input and button.

**Tech Stack:** React, Tailwind CSS.

---

### Task 1: Fix SyncButton URL input layout

**Files:**
- Modify: `src/components/sync/SyncButton.tsx`

- [ ] **Step 1: Write a failing test for the layout logic**

Create `src/components/sync/SyncButton.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';

// Pure logic: determines whether the URL input section should be shown
function shouldShowUrlInput(webdavUrl: string | undefined, showUrlInput: boolean): boolean {
  return !webdavUrl || showUrlInput;
}

describe('SyncButton - URL input visibility', () => {
  it('shows input when no WebDAV URL is configured', () => {
    expect(shouldShowUrlInput(undefined, false)).toBe(true);
  });

  it('shows input when showUrlInput is forced true', () => {
    expect(shouldShowUrlInput('https://dav.example.com/state.json', true)).toBe(true);
  });

  it('hides input when URL is set and showUrlInput is false', () => {
    expect(shouldShowUrlInput('https://dav.example.com/state.json', false)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails (function not in scope)**

```bash
bun test --isolate src/components/sync/SyncButton.test.ts
```

Expected: FAIL — `shouldShowUrlInput` is not imported from anywhere (it's inline in the test, so it passes). This test validates the logic; the real fix is in the component.

- [ ] **Step 3: Fix the URL input section layout in SyncButton.tsx**

In `src/components/sync/SyncButton.tsx`, find the URL input render block (lines 108–117):

```tsx
    return (
      <div className="flex items-center gap-2">
        <input type="url" value={webdavInput} onChange={(e) => setWebdavInput(e.target.value)}
          placeholder="https://dav.example.com/.../state.json"
          className="text-sm rounded border border-gray-300 px-2 py-1 w-64 focus:outline-none focus:ring-1 focus:ring-indigo-500" aria-label="WebDAV state.json URL" />
        <button onClick={handleSaveUrl} className="rounded bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500">Save</button>
      </div>
    );
```

Replace with:

```tsx
    return (
      <div className="space-y-2">
        <input type="url" value={webdavInput} onChange={(e) => setWebdavInput(e.target.value)}
          placeholder="https://dav.example.com/.../state.json"
          className="w-full text-sm rounded border border-gray-300 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500" aria-label="WebDAV state.json URL" />
        <button onClick={handleSaveUrl} className="w-full rounded bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500">Save</button>
      </div>
    );
```

- [ ] **Step 4: Run test + typecheck**

```bash
bun test --isolate src/components/sync/SyncButton.test.ts && bun run typecheck
```

Expected: all tests pass, exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/sync/SyncButton.tsx src/components/sync/SyncButton.test.ts
git commit -m "fix: make WebDAV URL input full-width so it fits in a narrow sidebar"
```
