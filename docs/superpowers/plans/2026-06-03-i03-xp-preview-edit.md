# I03: XP Preview in Chore Edit Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a live XP preview in the chore create/edit form that updates as the user changes XP Size, displaying the base XP and the theoretical maximum at infinite streak.

**Architecture:** Add a pure `buildXPPreview(xpSize, settings)` helper that computes two values from the formula's analytical limits — no simulation needed:

- **Base XP** = `XP_BASE[xpSize]` (streak multiplier → 1 as streak count → 0)
- **Max XP** = `Math.round(XP_BASE[xpSize] × settings.maxStreakMultiplier)` (streak multiplier → `maxStreakMultiplier` as streak → ∞)

When base equals max (multiplier = 1), only one number is shown. Wire into `ChoreFormModal.tsx` by subscribing to `xpSettings` and `profile`. Displayed as small indigo text below the XP Size selector.

**Tech Stack:** React, Zustand, `XP_BASE` from `@/xp/calculator`.

---

### Task 1: Add the XP preview helper

**Files:**
- Create: `src/xp/xpPreview.ts`
- Create: `src/xp/xpPreview.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/xp/xpPreview.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { buildXPPreview } from './xpPreview';
import type { XPSettings } from '@/types';

const SETTINGS_3X: XPSettings = {
  id: 'default', name: 'Default',
  maxStreakMultiplier: 3, decayFloor: 0.1, streakHalfLife: 7, decayHalfLife: 20,
};

const SETTINGS_1X: XPSettings = {
  id: 'flat', name: 'Flat',
  maxStreakMultiplier: 1, decayFloor: 0.1, streakHalfLife: 7, decayHalfLife: 20,
};

describe('buildXPPreview', () => {
  it('shows base and max XP when multiplier > 1', () => {
    // XP_BASE.M = 8; max = round(8 * 3) = 24
    expect(buildXPPreview('M', SETTINGS_3X)).toBe('8 XP · up to 24 XP at max streak');
  });

  it('shows only base XP when multiplier is 1', () => {
    // XP_BASE.M = 8; max = 8 — equal, so just one value
    expect(buildXPPreview('M', SETTINGS_1X)).toBe('8 XP');
  });

  it('scales correctly for different XP sizes', () => {
    // XP_BASE.S = 5; max = round(5 * 3) = 15
    expect(buildXPPreview('S', SETTINGS_3X)).toBe('5 XP · up to 15 XP at max streak');
  });

  it('handles fractional multiplier results by rounding', () => {
    const settings: XPSettings = { ...SETTINGS_3X, maxStreakMultiplier: 2.5 };
    // XP_BASE.XS = 3; max = round(3 * 2.5) = round(7.5) = 8
    expect(buildXPPreview('XS', settings)).toBe('3 XP · up to 8 XP at max streak');
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
import { XP_BASE } from './calculator';

export function buildXPPreview(xpSize: XPSize, settings: XPSettings): string {
  const base = XP_BASE[xpSize];
  const max = Math.round(base * settings.maxStreakMultiplier);
  if (max === base) return `${base} XP`;
  return `${base} XP · up to ${max} XP at max streak`;
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
bun test --isolate src/xp/xpPreview.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/xp/xpPreview.ts src/xp/xpPreview.test.ts
git commit -m "feat: add buildXPPreview helper using analytical formula limits"
```

---

### Task 2: Wire XP preview into ChoreFormModal

**Files:**
- Modify: `src/components/chores/ChoreFormModal.tsx`

- [ ] **Step 1: Add imports and store subscriptions**

In `src/components/chores/ChoreFormModal.tsx`, add at the top:

```ts
import { buildXPPreview } from '@/xp/xpPreview';
```

Inside the `ChoreFormModal` component, add after the existing store reads:

```ts
const xpSettings = useAppStore((s) => s.xpSettings);
const profile = useAppStore((s) => s.profile);
```

- [ ] **Step 2: Compute the preview**

After the existing form state declarations, add:

```ts
const activeSettings =
  xpSettings.find((s) => s.id === profile?.activeXPSettingsId) ?? xpSettings[0];

const xpPreview = activeSettings ? buildXPPreview(xpSize, activeSettings) : null;
```

- [ ] **Step 3: Render the preview below the XP Size selector**

Find the XP Size `<div>` block. After the `<select>` and before the closing `</div>`, add:

```tsx
{xpPreview && (
  <p className="mt-1 text-xs text-indigo-600">{xpPreview}</p>
)}
```

The full XP Size field block becomes:

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

- [ ] **Step 4: Run typecheck + full suite**

```bash
bun run typecheck && bun test
```

Expected: exits 0, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/chores/ChoreFormModal.tsx
git commit -m "feat: show live XP preview in chore form using analytical formula limits"
```
