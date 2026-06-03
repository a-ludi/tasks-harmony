# I03: XP Preview in Chore Edit Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a live XP preview in the chore create/edit form that updates as the user changes the XP Size field, using the active XP formula settings.

**Architecture:** Add a `buildXPPreview` pure function that takes the selected `xpSize`, the active `XPSettings`, and (for edit mode) the current streak count, and returns a display string like `"8 XP at start · up to 24 XP at max streak"`. Wire this into `ChoreFormModal.tsx` by subscribing to `xpSettings` and `profile` from the store. For new chores streak=0; for existing chores read the last recorded streak from `completions`.

**Tech Stack:** React, Zustand, `calculateXP` from `@/xp/calculator`.

---

### Task 1: Extract and test the XP preview formatting logic

**Files:**
- Create: `src/xp/xpPreview.ts`
- Create: `src/xp/xpPreview.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/xp/xpPreview.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { buildXPPreview } from './xpPreview';
import type { XPSettings } from '@/types';

const DEFAULT_SETTINGS: XPSettings = {
  id: 'default',
  name: 'Default',
  maxStreakMultiplier: 3,
  decayFloor: 0.1,
  streakHalfLife: 7,
  decayHalfLife: 20,
};

describe('buildXPPreview', () => {
  it('shows base XP for streak=0 and a max-streak projection', () => {
    const result = buildXPPreview('M', 0, DEFAULT_SETTINGS);
    // XP_BASE.M = 8; at streak 0: calculateXP('M', 0, 0, settings)
    // At streak 0: streakMult ≈ 1.0, decayMult ≈ 1.0, result = 8
    // At max streak (e.g. 100): streakMult ≈ 3.0, result ≈ 24
    expect(result).toContain('XP');
    expect(result).toContain('·');
  });

  it('shows higher base XP when current streak is non-zero', () => {
    const atZero = buildXPPreview('M', 0, DEFAULT_SETTINGS);
    const atSeven = buildXPPreview('M', 7, DEFAULT_SETTINGS);
    // At streak 7 the first number should be >= the first number at streak 0
    const firstNumZero = parseInt(atZero.split(' ')[0], 10);
    const firstNumSeven = parseInt(atSeven.split(' ')[0], 10);
    expect(firstNumSeven).toBeGreaterThanOrEqual(firstNumZero);
  });

  it('returns a string containing two XP values separated by ·', () => {
    const result = buildXPPreview('S', 0, DEFAULT_SETTINGS);
    expect(result).toMatch(/\d+ XP.*·.*\d+ XP/);
  });
});
```

- [ ] **Step 2: Run test — expect fail**

```bash
bun test --isolate src/xp/xpPreview.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement xpPreview.ts**

Create `src/xp/xpPreview.ts`:

```ts
import type { XPSize, XPSettings } from '@/types';
import { calculateXP } from './calculator';

const PREVIEW_MAX_STREAK = 100;

export function buildXPPreview(
  xpSize: XPSize,
  currentStreak: number,
  settings: XPSettings,
): string {
  const atCurrent = calculateXP(xpSize, currentStreak, 0, settings);
  const atMax = calculateXP(xpSize, PREVIEW_MAX_STREAK, 0, settings);
  if (atCurrent === atMax) return `${atCurrent} XP`;
  return `${atCurrent} XP · up to ${atMax} XP at max streak`;
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
bun test --isolate src/xp/xpPreview.test.ts
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/xp/xpPreview.ts src/xp/xpPreview.test.ts
git commit -m "feat: add buildXPPreview helper for live XP preview in chore form"
```

---

### Task 2: Wire XP preview into ChoreFormModal

**Files:**
- Modify: `src/components/chores/ChoreFormModal.tsx`

- [ ] **Step 1: Add imports and store subscriptions**

In `src/components/chores/ChoreFormModal.tsx`, add at the top:

```ts
import { buildXPPreview } from '@/xp/xpPreview';
import { computeNewStreak } from '@/chores/streak';
```

Inside the `ChoreFormModal` component, add new store reads after the existing ones:

```ts
const xpSettings = useAppStore((s) => s.xpSettings);
const profile = useAppStore((s) => s.profile);
const completions = useAppStore((s) => s.completions);
```

- [ ] **Step 2: Compute the current streak and active settings**

After the existing form state declarations, add:

```ts
const activeSettings =
  xpSettings.find((s) => s.id === profile?.activeXPSettingsId) ?? xpSettings[0];

const currentStreak = isEdit
  ? (() => {
      const choreCompletions = completions.filter((c) => c.choreKey === chore!.key);
      if (choreCompletions.length === 0) return 0;
      return [...choreCompletions].sort(
        (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
      )[0].streak;
    })()
  : 0;

const xpPreview = activeSettings
  ? buildXPPreview(xpSize, currentStreak, activeSettings)
  : null;
```

- [ ] **Step 3: Render the preview below the XP Size select**

Find the closing `</div>` of the XP Size field block (the block that contains `<label htmlFor="chore-xp-size">` and its `<select>`). After the select and before the closing `</div>`, add:

```tsx
{xpPreview && (
  <p className="mt-1 text-xs text-indigo-600">{xpPreview}</p>
)}
```

The XP Size field block should now look like:

```tsx
<div>
  <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="chore-xp-size">
    XP Size
  </label>
  <select
    id="chore-xp-size"
    value={xpSize}
    onChange={(e) => setXpSize(e.target.value as XPSize)}
    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
  >
    {XP_SIZES.map((size) => (
      <option key={size} value={size}>{size} ({XP_BASE[size]} XP)</option>
    ))}
  </select>
  {xpPreview && (
    <p className="mt-1 text-xs text-indigo-600">{xpPreview}</p>
  )}
</div>
```

- [ ] **Step 4: Run typecheck + full test suite**

```bash
bun run typecheck && bun test
```

Expected: exits 0, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/chores/ChoreFormModal.tsx
git commit -m "feat: show live XP preview in chore edit form based on active XP formula"
```
