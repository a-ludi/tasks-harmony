# Tasks Harmony — Dashboard & Basic Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the dashboard with chore cards, chore CRUD (create/edit/deactivate), and simple (no-questions) completion flow so the app is fully usable for tracking chores.

**Architecture:** A single Zustand store (`src/store/index.ts`) holds all app state and drives all IndexedDB writes immediately on mutation. Recurrence and streak logic live in pure modules (`src/chores/recurrence.ts`, `src/chores/streak.ts`) tested with Bun's built-in test runner. React components read from the store via selectors, keeping re-renders naturally scoped.

**Tech Stack:** React 19, TypeScript 5, Zustand 5, idb 8, Bun test runner, Tailwind CSS 4.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/store/index.ts` | Create | Zustand store — all state + actions |
| `src/chores/recurrence.ts` | Create | Window arithmetic + status + format |
| `src/chores/recurrence.test.ts` | Create | TDD tests for recurrence logic |
| `src/chores/streak.ts` | Create | Streak computation |
| `src/chores/streak.test.ts` | Create | TDD tests for streak logic |
| `src/components/layout/NavBar.tsx` | Create | Brand + XP counter + nav links |
| `src/components/dashboard/Dashboard.tsx` | Create | Sorted, grouped chore list + New Chore button |
| `src/components/dashboard/ChoreCard.tsx` | Create | Individual chore card with actions |
| `src/components/dashboard/StatusBadge.tsx` | Create | Pill badge for chore status |
| `src/components/chores/ChoreFormModal.tsx` | Create | Create/edit chore modal form |
| `src/components/chores/CompleteButton.tsx` | Create | Complete action button |
| `src/App.tsx` | Modify | Wire NavBar + Dashboard + store init |

---

### Task 1: Recurrence logic (TDD)

**Files:**
- Create: `src/chores/recurrence.ts`
- Create: `src/chores/recurrence.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/chores/recurrence.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test';
import {
  getWindowStart,
  getWindowEnd,
  getCurrentWindowIndex,
  getChoreStatus,
  formatRecurrence,
} from './recurrence';
import type { Recurrence, Chore, Completion, ChoreStatus } from '@/types';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeRecurrence(
  frequency: Recurrence['frequency'],
  interval: number,
  startDate: string,
  windowStartTime = '00:00',
): Recurrence {
  return { frequency, interval, startDate, windowStartTime };
}

function makeChore(recurrence: Recurrence): Chore {
  return {
    key: 'personal/test-chore',
    choreId: 'test-chore',
    packId: 'personal',
    title: 'Test Chore',
    xpSize: 'S',
    recurrence,
    repeatable: false,
    active: true,
    createdAt: recurrence.startDate + 'T00:00:00.000Z',
  };
}

function makeCompletion(completedAt: string, streak = 1): Completion {
  return {
    id: crypto.randomUUID(),
    choreKey: 'personal/test-chore',
    completedAt,
    xpEarned: 10,
    streak,
    answers: [],
  };
}

// Use a fixed local midnight for date arithmetic predictability
function localMidnight(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

// ── getWindowStart ────────────────────────────────────────────────────────────

describe('getWindowStart', () => {
  it('index 0 daily/1 returns startDate at local midnight', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const result = getWindowStart(rec, 0);
    expect(result.getTime()).toBe(localMidnight('2026-01-10').getTime());
  });

  it('index 3 daily/1 returns startDate + 3 days', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const result = getWindowStart(rec, 3);
    expect(result.getTime()).toBe(localMidnight('2026-01-13').getTime());
  });

  it('index 1 weekly/2 returns startDate + 14 days', () => {
    const rec = makeRecurrence('weekly', 2, '2026-01-05');
    const result = getWindowStart(rec, 1);
    expect(result.getTime()).toBe(localMidnight('2026-01-19').getTime());
  });

  it('index 2 monthly/1 returns startDate + 2 months (proper date arithmetic)', () => {
    const rec = makeRecurrence('monthly', 1, '2026-01-31');
    const result = getWindowStart(rec, 2);
    // Jan 31 + 2 months = Mar 31
    expect(result.getTime()).toBe(localMidnight('2026-03-31').getTime());
  });

  it('windowStartTime 18:00 offsets window 0 to 18:00 on startDate', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10', '18:00');
    const expected = new Date(2026, 0, 10, 18, 0, 0, 0);
    expect(getWindowStart(rec, 0).getTime()).toBe(expected.getTime());
  });

  it('windowStartTime 18:00 means completion at 00:30 next day falls in window 0', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10', '18:00');
    // window 0: Jan 10 18:00 → Jan 11 18:00
    // Jan 11 00:30 is within that window
    const completionTime = new Date(2026, 0, 11, 0, 30, 0, 0);
    const windowStart = getWindowStart(rec, 0);
    const windowEnd = getWindowEnd(rec, 0);
    expect(completionTime.getTime()).toBeGreaterThanOrEqual(windowStart.getTime());
    expect(completionTime.getTime()).toBeLessThan(windowEnd.getTime());
  });
});

// ── getWindowEnd ──────────────────────────────────────────────────────────────

describe('getWindowEnd', () => {
  it('equals getWindowStart(index + 1)', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const end = getWindowEnd(rec, 2);
    const nextStart = getWindowStart(rec, 3);
    expect(end.getTime()).toBe(nextStart.getTime());
  });
});

// ── getCurrentWindowIndex ─────────────────────────────────────────────────────

describe('getCurrentWindowIndex', () => {
  it('returns null when now is before startDate', () => {
    const rec = makeRecurrence('daily', 1, '2026-06-01');
    const now = localMidnight('2026-05-31');
    expect(getCurrentWindowIndex(rec, now)).toBeNull();
  });

  it('returns 0 when now equals startDate (first window)', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const now = localMidnight('2026-01-10');
    expect(getCurrentWindowIndex(rec, now)).toBe(0);
  });

  it('returns 0 for now within first window but not yet at window 1', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const now = new Date(localMidnight('2026-01-10').getTime() + 23 * 3_600_000);
    expect(getCurrentWindowIndex(rec, now)).toBe(0);
  });

  it('returns 2 for now in the third window', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const now = localMidnight('2026-01-12');
    expect(getCurrentWindowIndex(rec, now)).toBe(2);
  });

  it('returns 2 for weekly/1 three weeks after startDate', () => {
    const rec = makeRecurrence('weekly', 1, '2026-01-05');
    const now = localMidnight('2026-01-19');
    expect(getCurrentWindowIndex(rec, now)).toBe(2);
  });
});

// ── getChoreStatus ────────────────────────────────────────────────────────────

describe('getChoreStatus', () => {
  it('returns upcoming when startDate is in the future', () => {
    const rec = makeRecurrence('daily', 1, '2099-01-01');
    const chore = makeChore(rec);
    const now = new Date();
    expect(getChoreStatus(chore, [], now)).toBe('upcoming');
  });

  it('returns completed when there is a completion in the current window', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const chore = makeChore(rec);
    // Window 0: 2026-01-10 00:00 – 2026-01-11 00:00
    const now = new Date(localMidnight('2026-01-10').getTime() + 3_600_000);
    const completedAt = new Date(localMidnight('2026-01-10').getTime() + 1_800_000).toISOString();
    const completions = [makeCompletion(completedAt)];
    expect(getChoreStatus(chore, completions, now)).toBe('completed');
  });

  it('returns overdue when previous window has no completion', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const chore = makeChore(rec);
    // Now is window 1 (2026-01-11), window 0 (2026-01-10) has no completion
    const now = localMidnight('2026-01-11');
    expect(getChoreStatus(chore, [], now)).toBe('overdue');
  });

  it('returns due when no completion in current window but previous window was completed', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const chore = makeChore(rec);
    // Now is window 1 (2026-01-11)
    const now = localMidnight('2026-01-11');
    // Completion in window 0
    const completedAt = new Date(localMidnight('2026-01-10').getTime() + 1_800_000).toISOString();
    const completions = [makeCompletion(completedAt)];
    expect(getChoreStatus(chore, completions, now)).toBe('due');
  });

  it('returns due (not throw) for malformed recurrence frequency', () => {
    const chore: Chore = {
      ...makeChore(makeRecurrence('daily', 1, '2026-01-10')),
      recurrence: { frequency: 'bogus' as Recurrence['frequency'], interval: 1, startDate: '2026-01-10', windowStartTime: '00:00' },
    };
    const now = localMidnight('2026-01-11');
    let result: ChoreStatus;
    expect(() => {
      result = getChoreStatus(chore, [], now);
    }).not.toThrow();
    expect(getChoreStatus(chore, [], now)).toBe('due');
  });
});

// ── formatRecurrence ──────────────────────────────────────────────────────────

describe('formatRecurrence', () => {
  it('interval=1 daily → "Daily"', () => {
    expect(formatRecurrence(makeRecurrence('daily', 1, '2026-01-01'))).toBe('Daily');
  });

  it('interval=1 weekly → "Weekly"', () => {
    expect(formatRecurrence(makeRecurrence('weekly', 1, '2026-01-01'))).toBe('Weekly');
  });

  it('interval=1 monthly → "Monthly"', () => {
    expect(formatRecurrence(makeRecurrence('monthly', 1, '2026-01-01'))).toBe('Monthly');
  });

  it('interval=3 daily → "Every 3 days"', () => {
    expect(formatRecurrence(makeRecurrence('daily', 3, '2026-01-01'))).toBe('Every 3 days');
  });

  it('interval=2 weekly → "Every 2 weeks"', () => {
    expect(formatRecurrence(makeRecurrence('weekly', 2, '2026-01-01'))).toBe('Every 2 weeks');
  });

  it('interval=6 monthly → "Every 6 months"', () => {
    expect(formatRecurrence(makeRecurrence('monthly', 6, '2026-01-01'))).toBe('Every 6 months');
  });

});
```

- [ ] **Step 2: Run test, verify fail**

```bash
cd /home/alu/projects/tasks-harmony && bun test src/chores/recurrence.test.ts
```

Expected: FAIL — `recurrence.ts` does not exist yet, import will error.

- [ ] **Step 3: Implement src/chores/recurrence.ts**

Create `src/chores/recurrence.ts`:

```typescript
import type { Chore, Completion, ChoreStatus, Recurrence } from '@/types';

// ── Window arithmetic ─────────────────────────────────────────────────────────

/**
 * Returns the start of window at `index` (0-based) for the given recurrence.
 * index 0 = startDate at local midnight; index n = startDate + n*interval*freq.
 * Uses calendar-aware date arithmetic (setDate/setMonth), not ms multiplication,
 * so monthly windows don't drift.
 */
export function getWindowStart(recurrence: Recurrence, index: number): Date {
  const [year, month, day] = recurrence.startDate.split('-').map(Number);
  const [hours, minutes] = recurrence.windowStartTime.split(':').map(Number);
  const base = new Date(year, month - 1, day, hours, minutes, 0, 0);

  switch (recurrence.frequency) {
    case 'daily':
      base.setDate(base.getDate() + index * recurrence.interval);
      break;
    case 'weekly':
      base.setDate(base.getDate() + index * recurrence.interval * 7);
      break;
    case 'monthly':
      base.setMonth(base.getMonth() + index * recurrence.interval);
      break;
    default:
      throw new Error(`Unknown recurrence frequency: ${recurrence.frequency}`);
  }

  return base;
}

/**
 * Returns the end of window at `index` (exclusive) — equal to the start of
 * window index+1.
 */
export function getWindowEnd(recurrence: Recurrence, index: number): Date {
  return getWindowStart(recurrence, index + 1);
}

/**
 * Returns the 0-based index of the window that contains `now`, or null if
 * `now` is before the first window start.
 *
 * Approximates with ms to get close, then adjusts with a while-loop to handle
 * calendar edge cases (e.g. month-end arithmetic).
 */
export function getCurrentWindowIndex(recurrence: Recurrence, now: Date): number | null {
  const startDate = getWindowStart(recurrence, 0);

  if (now < startDate) return null;

  const approxMs: Record<Recurrence['frequency'], number> = {
    daily: 86_400_000,
    weekly: 604_800_000,
    monthly: 2_592_000_000,
  };

  const periodMs = approxMs[recurrence.frequency] * recurrence.interval;
  const elapsed = now.getTime() - startDate.getTime();
  let index = Math.max(0, Math.floor(elapsed / periodMs));

  // Advance if our estimate landed too early (calendar rounding)
  while (getWindowStart(recurrence, index + 1) <= now) {
    index++;
  }

  // Retreat if our estimate landed too late (calendar rounding)
  while (index > 0 && getWindowStart(recurrence, index) > now) {
    index--;
  }

  return index;
}

// ── Status ────────────────────────────────────────────────────────────────────

/**
 * Computes the display status for a chore.
 * Wraps everything in try/catch: malformed recurrence returns 'due' instead of
 * crashing the UI.
 */
export function getChoreStatus(
  chore: Chore,
  completions: Completion[],
  now: Date,
): ChoreStatus {
  try {
    const startDate = getWindowStart(chore.recurrence, 0);

    if (now < startDate) return 'upcoming';

    const currentIdx = getCurrentWindowIndex(chore.recurrence, now);
    if (currentIdx === null) return 'upcoming';

    const windowStart = getWindowStart(chore.recurrence, currentIdx);
    const windowEnd = getWindowEnd(chore.recurrence, currentIdx);

    const hasCurrentCompletion = completions.some((c) => {
      const t = new Date(c.completedAt).getTime();
      return t >= windowStart.getTime() && t < windowEnd.getTime();
    });

    if (hasCurrentCompletion) return 'completed';

    if (currentIdx > 0) {
      const prevWindowStart = getWindowStart(chore.recurrence, currentIdx - 1);
      const prevWindowEnd = windowStart; // same as getWindowEnd(currentIdx - 1)

      const hasPrevCompletion = completions.some((c) => {
        const t = new Date(c.completedAt).getTime();
        return t >= prevWindowStart.getTime() && t < prevWindowEnd.getTime();
      });

      if (!hasPrevCompletion) return 'overdue';
    }

    return 'due';
  } catch {
    return 'due';
  }
}

// ── Formatting ────────────────────────────────────────────────────────────────

const SINGULAR: Record<Recurrence['frequency'], string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

const PLURAL: Record<Recurrence['frequency'], string> = {
  daily: 'days',
  weekly: 'weeks',
  monthly: 'months',
};

/**
 * Human-readable recurrence description.
 * interval=1 → "Daily" / "Weekly" / etc.
 * interval>1 → "Every N days" / "Every N weeks" / etc.
 */
export function formatRecurrence(recurrence: Recurrence): string {
  if (recurrence.interval === 1) {
    return SINGULAR[recurrence.frequency];
  }
  return `Every ${recurrence.interval} ${PLURAL[recurrence.frequency]}`;
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
cd /home/alu/projects/tasks-harmony && bun test src/chores/recurrence.test.ts
```

Expected: All tests pass (green). Confirm no skipped tests.

- [ ] **Step 5: Commit**

```bash
cd /home/alu/projects/tasks-harmony && git add src/chores/recurrence.ts src/chores/recurrence.test.ts && git commit -m "feat: add recurrence window arithmetic, status, and format logic with tests"
```

---

### Task 2: Streak logic (TDD)

**Files:**
- Create: `src/chores/streak.ts`
- Create: `src/chores/streak.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/chores/streak.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test';
import { computeNewStreak } from './streak';
import type { Chore, Completion, Recurrence } from '@/types';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeRecurrence(
  frequency: Recurrence['frequency'],
  interval: number,
  startDate: string,
  windowStartTime = '00:00',
): Recurrence {
  return { frequency, interval, startDate, windowStartTime };
}

function makeChore(recurrence: Recurrence): Chore {
  return {
    key: 'personal/test-chore',
    choreId: 'test-chore',
    packId: 'personal',
    title: 'Test Chore',
    xpSize: 'S',
    recurrence,
    repeatable: false,
    active: true,
    createdAt: recurrence.startDate + 'T00:00:00.000Z',
  };
}

function makeCompletion(completedAt: string, streak: number): Completion {
  return {
    id: crypto.randomUUID(),
    choreKey: 'personal/test-chore',
    completedAt,
    xpEarned: 10,
    streak,
    answers: [],
  };
}

function localMidnight(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

// ── computeNewStreak ──────────────────────────────────────────────────────────

describe('computeNewStreak', () => {
  it('returns 1 when there are no previous completions', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const chore = makeChore(rec);
    const now = localMidnight('2026-01-10');
    expect(computeNewStreak(chore, [], now)).toBe(1);
  });

  it('returns lastCompletion.streak + 1 when last completion was in the immediately preceding window', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const chore = makeChore(rec);
    // Now = window 1 (2026-01-11). Previous window = window 0 (2026-01-10).
    const now = localMidnight('2026-01-11');
    // Completion in window 0
    const completedAt = new Date(localMidnight('2026-01-10').getTime() + 3_600_000).toISOString();
    const completions = [makeCompletion(completedAt, 3)];
    expect(computeNewStreak(chore, completions, now)).toBe(4);
  });

  it('returns 1 when last completion was two windows ago (streak broken)', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const chore = makeChore(rec);
    // Now = window 2 (2026-01-12). Previous window = window 1 (2026-01-11).
    // Last completion was in window 0 (2026-01-10) — two windows ago.
    const now = localMidnight('2026-01-12');
    const completedAt = new Date(localMidnight('2026-01-10').getTime() + 3_600_000).toISOString();
    const completions = [makeCompletion(completedAt, 5)];
    expect(computeNewStreak(chore, completions, now)).toBe(1);
  });

  it('returns 1 when currentIdx is 0 (first window, no prior window to check)', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const chore = makeChore(rec);
    const now = localMidnight('2026-01-10');
    // Even if there are completions (shouldn't normally happen), streak resets
    const completedAt = new Date(localMidnight('2026-01-10').getTime() + 100).toISOString();
    const completions = [makeCompletion(completedAt, 99)];
    expect(computeNewStreak(chore, completions, now)).toBe(1);
  });

  it('handles multiple previous completions and picks the most recent', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const chore = makeChore(rec);
    // Now = window 2 (2026-01-12). Previous window = window 1 (2026-01-11).
    const now = localMidnight('2026-01-12');
    // Two completions: one old (window 0) with streak 1, one recent (window 1) with streak 2
    const oldCompletion = makeCompletion(
      new Date(localMidnight('2026-01-10').getTime() + 3_600_000).toISOString(),
      1,
    );
    const recentCompletion = makeCompletion(
      new Date(localMidnight('2026-01-11').getTime() + 3_600_000).toISOString(),
      2,
    );
    expect(computeNewStreak(chore, [oldCompletion, recentCompletion], now)).toBe(3);
  });

  it('works for weekly recurrence streak continuation', () => {
    const rec = makeRecurrence('weekly', 1, '2026-01-05');
    const chore = makeChore(rec);
    // Now = window 1 start (2026-01-12). Previous window = window 0 (2026-01-05).
    const now = localMidnight('2026-01-12');
    const completedAt = new Date(localMidnight('2026-01-07').getTime()).toISOString();
    const completions = [makeCompletion(completedAt, 2)];
    expect(computeNewStreak(chore, completions, now)).toBe(3);
  });
});
```

- [ ] **Step 2: Run test, verify fail**

```bash
cd /home/alu/projects/tasks-harmony && bun test src/chores/streak.test.ts
```

Expected: FAIL — `streak.ts` does not exist yet, import will error.

- [ ] **Step 3: Implement src/chores/streak.ts**

Create `src/chores/streak.ts`:

```typescript
import type { Chore, Completion } from '@/types';
import { getCurrentWindowIndex, getWindowStart } from './recurrence';

/**
 * Computes the streak value to store on the new Completion being recorded now.
 *
 * Rules:
 * - No previous completions → 1
 * - First window (currentIdx === 0 or null) → 1 (no preceding window exists)
 * - Last completion was in the immediately preceding window → lastStreak + 1
 * - Otherwise → 1 (streak broken)
 *
 * Uses the completedAt timestamps from previousCompletions (does NOT include
 * the completion being created right now).
 */
export function computeNewStreak(
  chore: Chore,
  previousCompletions: Completion[],
  now: Date,
): number {
  if (previousCompletions.length === 0) return 1;

  const currentIdx = getCurrentWindowIndex(chore.recurrence, now);

  // Can't have a previous window if we're at the start or haven't started yet
  if (currentIdx === null || currentIdx === 0) return 1;

  // Sort descending by completedAt to find the most recent completion
  const sorted = [...previousCompletions].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
  );
  const lastCompletion = sorted[0];

  // The preceding window boundaries
  const prevWindowStart = getWindowStart(chore.recurrence, currentIdx - 1);
  const prevWindowEnd = getWindowStart(chore.recurrence, currentIdx); // exclusive

  const lastCompletedAt = new Date(lastCompletion.completedAt).getTime();
  const wasInPrevWindow =
    lastCompletedAt >= prevWindowStart.getTime() &&
    lastCompletedAt < prevWindowEnd.getTime();

  return wasInPrevWindow ? lastCompletion.streak + 1 : 1;
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
cd /home/alu/projects/tasks-harmony && bun test src/chores/streak.test.ts
```

Expected: All tests pass (green).

- [ ] **Step 5: Commit**

```bash
cd /home/alu/projects/tasks-harmony && git add src/chores/streak.ts src/chores/streak.test.ts && git commit -m "feat: add streak computation logic with tests"
```

---

### Task 3: Zustand store

**Files:**
- Create: `src/store/index.ts`

- [ ] **Step 1: Create src/store/index.ts**

```typescript
import { create } from 'zustand';
import { openDB, getAllChores, getAllCompletions, getAllQuestions, getXPSettings, getProfile, getSyncState, getPacks, putChore, putCompletion, putProfile, putSyncState } from '@/db';
import { titleToFilename } from '@/cdp/filename';
import { calculateXP } from '@/xp/calculator';
import { computeNewStreak } from '@/chores/streak';
import type {
  Chore,
  Completion,
  Pack,
  Question,
  XPSettings,
  UserProfile,
  SyncState,
  Answer,
  XPSize,
} from '@/types';
import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';

// ── State shape ───────────────────────────────────────────────────────────────

interface AppState {
  // Persistence
  db: IDBPDatabase<TasksHarmonyDB> | null;
  loaded: boolean;

  // Domain data
  packs: Pack[];
  chores: Chore[];
  completions: Completion[];
  questions: Question[];
  xpSettings: XPSettings[];
  profile: UserProfile | null;
  syncState: SyncState | null;

  // Actions
  init: () => Promise<void>;
  addChore: (data: Omit<Chore, 'key' | 'choreId' | 'createdAt'>) => Promise<void>;
  updateChore: (chore: Chore) => Promise<void>;
  deactivateChore: (key: string) => Promise<void>;
  recordCompletion: (choreKey: string, answers?: Answer[]) => Promise<void>;
  updateProfile: (profile: UserProfile) => Promise<void>;
  updateSyncState: (state: SyncState) => Promise<void>;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  db: null,
  loaded: false,
  packs: [],
  chores: [],
  completions: [],
  questions: [],
  xpSettings: [],
  profile: null,
  syncState: null,

  // ── init ────────────────────────────────────────────────────────────────────

  init: async () => {
    if (get().loaded) return;

    const db = await openDB();
    const [packs, chores, completions, questions, xpSettings, profile, syncState] =
      await Promise.all([
        getPacks(db),
        getAllChores(db),
        getAllCompletions(db),
        getAllQuestions(db),
        getXPSettings(db),
        getProfile(db),
        getSyncState(db),
      ]);

    set({ db, loaded: true, packs, chores, completions, questions, xpSettings, profile, syncState });
  },

  // ── addChore ────────────────────────────────────────────────────────────────

  addChore: async (data) => {
    const { db, chores } = get();
    if (!db) throw new Error('DB not initialised');

    // Generate choreId from title, ensure uniqueness within the pack
    const baseId = titleToFilename(data.title);
    const existingIds = new Set(
      chores.filter((c) => c.packId === data.packId).map((c) => c.choreId),
    );

    let choreId = baseId;
    let counter = 1;
    while (existingIds.has(choreId)) {
      choreId = `${baseId}-${counter}`;
      counter++;
    }

    const newChore: Chore = {
      ...data,
      choreId,
      key: `${data.packId}/${choreId}`,
      createdAt: new Date().toISOString(),
    };

    await putChore(db, newChore);
    set((state) => ({ chores: [...state.chores, newChore] }));
  },

  // ── updateChore ─────────────────────────────────────────────────────────────

  updateChore: async (chore) => {
    const { db } = get();
    if (!db) throw new Error('DB not initialised');

    await putChore(db, chore);
    set((state) => ({
      chores: state.chores.map((c) => (c.key === chore.key ? chore : c)),
    }));
  },

  // ── deactivateChore ─────────────────────────────────────────────────────────

  deactivateChore: async (key) => {
    const { db, chores } = get();
    if (!db) throw new Error('DB not initialised');

    const chore = chores.find((c) => c.key === key);
    if (!chore) return;

    const deactivated: Chore = { ...chore, active: false };
    await putChore(db, deactivated);
    set((state) => ({
      chores: state.chores.map((c) => (c.key === key ? deactivated : c)),
    }));
  },

  // ── recordCompletion ────────────────────────────────────────────────────────

  recordCompletion: async (choreKey, answers = []) => {
    const { db, chores, completions, xpSettings, profile } = get();
    if (!db) throw new Error('DB not initialised');

    const chore = chores.find((c) => c.key === choreKey);
    if (!chore) throw new Error(`Chore not found: ${choreKey}`);

    // Always use current time — never allow future timestamps
    const now = new Date();

    // Resolve active XP settings
    const activeSettingsId = profile?.activeXPSettingsId;
    const activeSettings =
      xpSettings.find((s) => s.id === activeSettingsId) ?? xpSettings[0];
    if (!activeSettings) throw new Error('No XP settings found');

    // Completions for this chore only (for streak calculation)
    const choreCompletions = completions.filter((c) => c.choreKey === choreKey);

    // Compute streak and XP
    const streak = computeNewStreak(chore, choreCompletions, now);
    const totalCompletions = choreCompletions.length; // count before this new completion
    const xpEarned = calculateXP(chore.xpSize as XPSize, streak, totalCompletions, activeSettings);

    const newCompletion: Completion = {
      id: crypto.randomUUID(),
      choreKey,
      completedAt: now.toISOString(),
      xpEarned,
      streak,
      answers,
    };

    await putCompletion(db, newCompletion);
    set((state) => ({ completions: [...state.completions, newCompletion] }));
  },

  // ── updateProfile ───────────────────────────────────────────────────────────

  updateProfile: async (profile) => {
    const { db } = get();
    if (!db) throw new Error('DB not initialised');

    await putProfile(db, profile);
    set({ profile });
  },

  // ── updateSyncState ─────────────────────────────────────────────────────────

  updateSyncState: async (state) => {
    const { db } = get();
    if (!db) throw new Error('DB not initialised');

    await putSyncState(db, state);
    set({ syncState: state });
  },
}));
```

- [ ] **Step 2: Commit**

```bash
cd /home/alu/projects/tasks-harmony && git add src/store/index.ts && git commit -m "feat: add Zustand store with all state and actions"
```

---

### Task 4: StatusBadge component

**Files:**
- Create: `src/components/dashboard/StatusBadge.tsx`

- [ ] **Step 1: Create src/components/dashboard/StatusBadge.tsx**

```tsx
import type { ChoreStatus } from '@/types';

interface Props {
  status: ChoreStatus;
}

const STATUS_CONFIG: Record<
  ChoreStatus,
  { label: string; className: string }
> = {
  overdue: { label: 'Overdue', className: 'bg-red-100 text-red-800' },
  due: { label: 'Due', className: 'bg-amber-100 text-amber-800' },
  completed: { label: 'Completed', className: 'bg-green-100 text-green-800' },
  upcoming: { label: 'Upcoming', className: 'bg-slate-100 text-slate-600' },
};

export default function StatusBadge({ status }: Props) {
  const { label, className } = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${className}`}
    >
      {label}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/alu/projects/tasks-harmony && git add src/components/dashboard/StatusBadge.tsx && git commit -m "feat: add StatusBadge component"
```

---

### Task 5: CompleteButton component

**Files:**
- Create: `src/components/chores/CompleteButton.tsx`

- [ ] **Step 1: Create src/components/chores/CompleteButton.tsx**

```tsx
import { useState } from 'react';
import { useAppStore } from '@/store';

interface Props {
  choreKey: string;
}

export default function CompleteButton({ choreKey }: Props) {
  const recordCompletion = useAppStore((s) => s.recordCompletion);
  const [processing, setProcessing] = useState(false);

  async function handleClick() {
    if (processing) return;
    setProcessing(true);
    try {
      await recordCompletion(choreKey);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={processing}
      className={`rounded px-3 py-1 text-sm font-medium text-white transition-colors ${
        processing
          ? 'cursor-not-allowed bg-green-300'
          : 'bg-green-600 hover:bg-green-700 active:bg-green-800'
      }`}
    >
      {processing ? 'Saving…' : 'Complete'}
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/alu/projects/tasks-harmony && git add src/components/chores/CompleteButton.tsx && git commit -m "feat: add CompleteButton component"
```

---

### Task 6: ChoreFormModal component

**Files:**
- Create: `src/components/chores/ChoreFormModal.tsx`

- [ ] **Step 1: Create src/components/chores/ChoreFormModal.tsx**

```tsx
import { useState } from 'react';
import { useAppStore } from '@/store';
import type { Chore, XPSize, RecurrenceFrequency } from '@/types';

interface Props {
  chore?: Chore;       // undefined = create mode, defined = edit mode
  packId: string;
  onClose: () => void;
}

const XP_SIZES: XPSize[] = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const FREQUENCIES: RecurrenceFrequency[] = ['daily', 'weekly', 'monthly'];

function todayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface FormErrors {
  title?: string;
  interval?: string;
  startDate?: string;
}

export default function ChoreFormModal({ chore, packId, onClose }: Props) {
  const addChore = useAppStore((s) => s.addChore);
  const updateChore = useAppStore((s) => s.updateChore);

  const isEdit = chore !== undefined;

  const [title, setTitle] = useState(chore?.title ?? '');
  const [description, setDescription] = useState(chore?.description ?? '');
  const [xpSize, setXpSize] = useState<XPSize>(chore?.xpSize ?? 'S');
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(
    chore?.recurrence.frequency ?? 'daily',
  );
  const [interval, setInterval] = useState<string>(
    String(chore?.recurrence.interval ?? 1),
  );
  const [startDate, setStartDate] = useState(
    chore?.recurrence.startDate ?? todayString(),
  );
  const [windowStartTime, setWindowStartTime] = useState(
    chore?.recurrence.windowStartTime ?? '00:00',
  );
  const [repeatable, setRepeatable] = useState(chore?.repeatable ?? false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  function validate(): FormErrors {
    const errs: FormErrors = {};

    if (!title.trim()) {
      errs.title = 'Title is required.';
    }

    const intervalNum = Number(interval);
    if (!Number.isInteger(intervalNum) || intervalNum < 1) {
      errs.interval = 'Interval must be a whole number of 1 or more.';
    }

    if (!startDate) {
      errs.startDate = 'Start date is required.';
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      errs.startDate = 'Start date must be in YYYY-MM-DD format.';
    }

    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setSubmitting(true);

    try {
      if (isEdit && chore) {
        await updateChore({
          ...chore,
          title: title.trim(),
          description: description.trim() || undefined,
          xpSize,
          recurrence: {
            frequency,
            interval: Number(interval),
            startDate,
            windowStartTime,
          },
          repeatable,
        });
      } else {
        await addChore({
          packId,
          title: title.trim(),
          description: description.trim() || undefined,
          xpSize,
          recurrence: {
            frequency,
            interval: Number(interval),
            startDate,
            windowStartTime,
          },
          repeatable,
          active: true,
        });
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          {isEdit ? 'Edit Chore' : 'New Chore'}
        </h2>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Title */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="chore-title">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              id="chore-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                errors.title
                  ? 'border-red-400 focus:ring-red-300'
                  : 'border-gray-300 focus:ring-blue-300'
              }`}
              placeholder="e.g. Clean the bathroom"
            />
            {errors.title && (
              <p className="mt-1 text-xs text-red-600">{errors.title}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="chore-description">
              Description <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="chore-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="Add extra details…"
            />
          </div>

          {/* XP Size */}
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
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>

          {/* Frequency */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="chore-frequency">
              Frequency
            </label>
            <select
              id="chore-frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Interval */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="chore-interval">
              Interval
            </label>
            <input
              id="chore-interval"
              type="number"
              min={1}
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                errors.interval
                  ? 'border-red-400 focus:ring-red-300'
                  : 'border-gray-300 focus:ring-blue-300'
              }`}
            />
            {errors.interval && (
              <p className="mt-1 text-xs text-red-600">{errors.interval}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              e.g. interval 2 with "weekly" = every 2 weeks
            </p>
          </div>

          {/* Start Date */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="chore-start-date">
              Start Date <span className="text-red-500">*</span>
            </label>
            <input
              id="chore-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                errors.startDate
                  ? 'border-red-400 focus:ring-red-300'
                  : 'border-gray-300 focus:ring-blue-300'
              }`}
            />
            {errors.startDate && (
              <p className="mt-1 text-xs text-red-600">{errors.startDate}</p>
            )}
          </div>

          {/* Window Start Time */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="chore-window-start-time">
              Window Start Time
            </label>
            <input
              id="chore-window-start-time"
              type="time"
              value={windowStartTime}
              onChange={(e) => setWindowStartTime(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <p className="mt-1 text-xs text-gray-500">
              When does your day start for this chore? Default 00:00 (midnight). E.g. 18:00 for evening routines.
            </p>
          </div>

          {/* Repeatable */}
          <div className="flex items-center gap-3">
            <input
              id="chore-repeatable"
              type="checkbox"
              checked={repeatable}
              onChange={(e) => setRepeatable(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-300"
            />
            <label className="text-sm font-medium text-gray-700" htmlFor="chore-repeatable">
              Repeatable (allow multiple completions per window)
            </label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
                submitting
                  ? 'cursor-not-allowed bg-blue-300'
                  : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
              }`}
            >
              {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Chore'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/alu/projects/tasks-harmony && git add src/components/chores/ChoreFormModal.tsx && git commit -m "feat: add ChoreFormModal with create/edit mode and inline validation"
```

---

### Task 7: ChoreCard component

**Files:**
- Create: `src/components/dashboard/ChoreCard.tsx`

- [ ] **Step 1: Create src/components/dashboard/ChoreCard.tsx**

```tsx
import { useState } from 'react';
import type { Chore, Completion, XPSettings, UserProfile, ChoreStatus } from '@/types';
import { useAppStore } from '@/store';
import { getChoreStatus, formatRecurrence } from '@/chores/recurrence';
import { computeNewStreak } from '@/chores/streak';
import { calculateXP } from '@/xp/calculator';
import StatusBadge from './StatusBadge';
import CompleteButton from '@/components/chores/CompleteButton';
import ChoreFormModal from '@/components/chores/ChoreFormModal';

interface Props {
  chore: Chore;
  completions: Completion[];
  xpSettings: XPSettings[];
  profile: UserProfile | null;
}

const BORDER_COLOR: Record<ChoreStatus, string> = {
  overdue: 'border-l-red-500',
  due: 'border-l-amber-400',
  completed: 'border-l-green-500',
  upcoming: 'border-l-slate-300',
};

export default function ChoreCard({ chore, completions, xpSettings, profile }: Props) {
  const deactivateChore = useAppStore((s) => s.deactivateChore);
  const [showEditModal, setShowEditModal] = useState(false);

  const now = new Date();

  // Completions for this chore only
  const choreCompletions = completions.filter((c) => c.choreKey === chore.key);

  const status = getChoreStatus(chore, choreCompletions, now);

  // Resolve active XP settings
  const activeSettings =
    xpSettings.find((s) => s.id === profile?.activeXPSettingsId) ?? xpSettings[0];

  // Compute effective XP: always shows XP for the *next* completion
  const nextStreak = activeSettings
    ? computeNewStreak(chore, choreCompletions, now)
    : 1;
  // totalCompletions = count of existing completions (before the next one)
  const nextTotalCompletions = choreCompletions.length;
  const effectiveXP = activeSettings
    ? calculateXP(chore.xpSize, nextStreak, nextTotalCompletions, activeSettings)
    : 0;

  // Current streak: most recent completion's stored streak value
  const sortedCompletions = [...choreCompletions].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
  );
  const currentStreak = sortedCompletions[0]?.streak ?? 0;

  async function handleDeactivate() {
    if (window.confirm(`Archive "${chore.title}"? It will be removed from the dashboard.`)) {
      await deactivateChore(chore.key);
    }
  }

  return (
    <>
      <div
        className={`rounded-xl border border-gray-200 border-l-4 ${BORDER_COLOR[status]} bg-white p-4 shadow-sm`}
      >
        <div className="flex items-start justify-between gap-3">
          {/* Left: content */}
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-gray-900 leading-tight">{chore.title}</h3>
              <StatusBadge status={status} />
            </div>

            {chore.description && (
              <p className="mb-2 text-sm text-gray-500 line-clamp-2">{chore.description}</p>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
              <span>
                <span className="font-medium text-gray-700">{effectiveXP}</span> XP
              </span>
              {currentStreak > 0 && (
                <span>
                  Streak: <span className="font-medium text-gray-700">{currentStreak}</span>
                </span>
              )}
              <span>{formatRecurrence(chore.recurrence)}</span>
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex shrink-0 flex-col items-end gap-2">
            {(status === 'due' || status === 'overdue') && (
              <CompleteButton choreKey={chore.key} />
            )}
            {status === 'completed' && chore.repeatable && (
              <CompleteButton choreKey={chore.key} label="Complete again" />
            )}
            <div className="flex gap-1">
              <button
                onClick={() => setShowEditModal(true)}
                title="Edit chore"
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                ✎
              </button>
              <button
                onClick={handleDeactivate}
                title="Archive chore"
                className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                Archive
              </button>
            </div>
          </div>
        </div>
      </div>

      {showEditModal && (
        <ChoreFormModal
          chore={chore}
          packId={chore.packId}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/alu/projects/tasks-harmony && git add src/components/dashboard/ChoreCard.tsx && git commit -m "feat: add ChoreCard with status, XP, streak, edit, and archive"
```

---

### Task 8: NavBar component

**Files:**
- Create: `src/components/layout/NavBar.tsx`

- [ ] **Step 1: Create src/components/layout/NavBar.tsx**

```tsx
import { Link, NavLink } from 'react-router-dom';
import { useAppStore } from '@/store';

export default function NavBar() {
  const completions = useAppStore((s) => s.completions);

  const totalXP = completions.reduce((sum, c) => sum + c.xpEarned, 0);

  return (
    <nav className="sticky top-0 z-40 border-b border-gray-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        {/* Brand */}
        <Link to="/" className="text-lg font-bold text-gray-900 hover:text-blue-600 transition-colors">
          Tasks Harmony
        </Link>

        {/* XP counter + nav links */}
        <div className="flex items-center gap-4">
          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
            {Math.round(totalXP).toLocaleString()} XP
          </span>

          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `text-sm font-medium transition-colors ${
                isActive ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'
              }`
            }
          >
            Dashboard
          </NavLink>

          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `text-sm font-medium transition-colors ${
                isActive ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'
              }`
            }
          >
            Profile
          </NavLink>
        </div>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/alu/projects/tasks-harmony && git add src/components/layout/NavBar.tsx && git commit -m "feat: add NavBar with brand, total XP counter, and nav links"
```

---

### Task 9: Dashboard component

**Files:**
- Create: `src/components/dashboard/Dashboard.tsx`

- [ ] **Step 1: Create src/components/dashboard/Dashboard.tsx**

```tsx
import { useState } from 'react';
import { useAppStore } from '@/store';
import { getChoreStatus, getCurrentWindowIndex, getWindowEnd } from '@/chores/recurrence';
import type { ChoreStatus, Chore } from '@/types';
import ChoreCard from './ChoreCard';
import ChoreFormModal from '@/components/chores/ChoreFormModal';

const STATUS_ORDER: Record<ChoreStatus, number> = {
  overdue: 0,
  due: 1,
  completed: 2,
  upcoming: 3,
};

const SECTION_LABELS: Record<ChoreStatus, string> = {
  overdue: 'Overdue',
  due: 'Due',
  completed: 'Completed',
  upcoming: 'Upcoming',
};

const SECTION_ORDER: ChoreStatus[] = ['overdue', 'due', 'completed', 'upcoming'];

export default function Dashboard() {
  const chores = useAppStore((s) => s.chores);
  const completions = useAppStore((s) => s.completions);
  const xpSettings = useAppStore((s) => s.xpSettings);
  const profile = useAppStore((s) => s.profile);

  const [showNewChoreModal, setShowNewChoreModal] = useState(false);

  const now = new Date();

  // Only show active chores
  const activeChores = chores.filter((c) => c.active);

  // Compute status for each chore, then sort
  const withStatus: Array<{ chore: Chore; status: ChoreStatus }> = activeChores.map((chore) => {
    const choreCompletions = completions.filter((c) => c.choreKey === chore.key);
    const status = getChoreStatus(chore, choreCompletions, now);
    return { chore, status };
  });

  // Group by status, then sort within each group
  const grouped = new Map<ChoreStatus, Chore[]>();
  for (const { chore, status } of withStatus) {
    const existing = grouped.get(status) ?? [];
    existing.push(chore);
    grouped.set(status, existing);
  }

  // Sort within groups:
  // overdue/due: window deadline ascending (most urgent first)
  // completed: least recently completed first (ascending by last completedAt)
  // upcoming: alphabetical by title
  const now2 = now; // capture for closure
  for (const [status, group] of grouped) {
    if (status === 'overdue' || status === 'due') {
      group.sort((a, b) => {
        const idxA = getCurrentWindowIndex(a.recurrence, now2) ?? 0;
        const idxB = getCurrentWindowIndex(b.recurrence, now2) ?? 0;
        const endA = getWindowEnd(a.recurrence, idxA).getTime();
        const endB = getWindowEnd(b.recurrence, idxB).getTime();
        return endA - endB;
      });
    } else if (status === 'completed') {
      group.sort((a, b) => {
        const lastA = completions
          .filter((c) => c.choreKey === a.key)
          .reduce((max, c) => Math.max(max, new Date(c.completedAt).getTime()), 0);
        const lastB = completions
          .filter((c) => c.choreKey === b.key)
          .reduce((max, c) => Math.max(max, new Date(c.completedAt).getTime()), 0);
        return lastA - lastB; // least recent first
      });
    } else if (status === 'upcoming') {
      group.sort((a, b) => a.title.localeCompare(b.title));
    }
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between pt-4">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <button
          onClick={() => setShowNewChoreModal(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 transition-colors"
        >
          + New Chore
        </button>
      </div>

      {/* Empty state */}
      {activeChores.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500">No chores yet.</p>
          <p className="mt-1 text-sm text-gray-400">
            Add your first chore to get started.
          </p>
        </div>
      )}

      {/* Sections */}
      {SECTION_ORDER.map((status) => {
        const sectionChores = grouped.get(status);
        if (!sectionChores || sectionChores.length === 0) return null;

        return (
          <section key={status}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              {SECTION_LABELS[status]}
            </h2>
            <div className="space-y-3">
              {sectionChores.map((chore) => (
                <ChoreCard
                  key={chore.key}
                  chore={chore}
                  completions={completions.filter((c) => c.choreKey === chore.key)}
                  xpSettings={xpSettings}
                  profile={profile}
                />
              ))}
            </div>
          </section>
        );
      })}

      {/* New Chore Modal */}
      {showNewChoreModal && (
        <ChoreFormModal
          packId="personal"
          onClose={() => setShowNewChoreModal(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/alu/projects/tasks-harmony && git add src/components/dashboard/Dashboard.tsx && git commit -m "feat: add Dashboard with sorted sections, grouped chore cards, and New Chore button"
```

---

### Task 10: Wire up App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Read current App.tsx**

Read the file to confirm the current content before editing.

- [ ] **Step 2: Replace src/App.tsx**

```tsx
import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useAppStore } from '@/store';
import NavBar from '@/components/layout/NavBar';
import Dashboard from '@/components/dashboard/Dashboard';

export default function App() {
  const init = useAppStore((s) => s.init);
  const loaded = useAppStore((s) => s.loaded);

  useEffect(() => {
    init();
  }, [init]);

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="mx-auto max-w-2xl px-4">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route
            path="/profile"
            element={
              <div className="pt-8 text-center text-gray-500">
                Profile page — coming in Plan 3.
              </div>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/alu/projects/tasks-harmony && bun tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd /home/alu/projects/tasks-harmony && git add src/App.tsx && git commit -m "feat: wire NavBar and Dashboard into App, add store init on mount"
```

---

### Task 11: Run all tests and smoke-check dev server

**Files:** (none new)

- [ ] **Step 1: Run all tests**

```bash
cd /home/alu/projects/tasks-harmony && bun test src/chores/recurrence.test.ts src/chores/streak.test.ts
```

Expected: All tests pass (0 failures).

- [ ] **Step 2: Run existing foundation tests**

```bash
cd /home/alu/projects/tasks-harmony && bun test
```

Expected: All tests pass, no regressions.

- [ ] **Step 3: Type-check entire project**

```bash
cd /home/alu/projects/tasks-harmony && bun tsc --noEmit
```

Expected: No TypeScript errors.

- [ ] **Step 4: Start dev server and manually verify**

```bash
cd /home/alu/projects/tasks-harmony && bun run dev
```

Manual checks:
- Navigate to `http://localhost:5173/` — NavBar renders with "Tasks Harmony" brand and "0 XP"
- "New Chore" button opens ChoreFormModal
- Submit form without title — inline error appears under Title field
- Fill valid form data — chore appears on dashboard
- Click "Complete" on a due chore — card moves to "Completed" section, XP counter in NavBar updates immediately
- Click "Archive" on a chore — chore disappears from dashboard
- Click Edit (✎) on a chore — modal pre-populated with existing values
- Reload page — chores and completions persist (IndexedDB)

- [ ] **Step 5: Final commit**

```bash
cd /home/alu/projects/tasks-harmony && git add -p && git commit -m "feat: complete Plan 2 — dashboard, chore CRUD, and basic completion flow"
```

---

## Self-Review

### Spec Coverage Table

| Requirement | Task | Coverage |
|---|---|---|
| §2.1 Card shows name, description (2-line truncated), XP, streak, recurrence, status | Task 7 (ChoreCard) | `line-clamp-2` for description, all fields rendered, `formatRecurrence`, `StatusBadge` |
| §2.1 Sort: Overdue→Due→Completed→Upcoming | Task 9 (Dashboard) | `STATUS_ORDER` map + `.sort()` before render |
| §2.1 Malformed recurrence must not crash (try/catch → 'due') | Task 1 (recurrence.ts) | `getChoreStatus` wrapped in `try/catch` returning `'due'`, tested |
| §2.2 XP counter updates immediately on completion (no reload) | Tasks 3 + 8 (store + NavBar) | `recordCompletion` updates Zustand `completions`; NavBar selector re-renders |
| §2.3 Only completed card re-renders | Task 7 (ChoreCard) | Natural Zustand per-component selector; ChoreCard reads `completions` slice |
| §3.1 Create chore form with all fields, validation inline, start date defaults today | Task 6 (ChoreFormModal) | All fields present, `todayString()` default, inline error messages |
| §3.2 Edit form pre-populated, validation inline | Task 6 (ChoreFormModal) | `isEdit` branch initialises state from `chore` prop |
| §3.3 Deactivate chore → disappears from dashboard | Tasks 3 + 9 (store + Dashboard) | `deactivateChore` sets `active=false`; Dashboard filters `chore.active` |
| §5 Complete button records completion, future timestamp rejected | Tasks 3 + 5 (store + CompleteButton) | `recordCompletion` uses `new Date()` always; `CompleteButton` disabled during processing |
| §5 XP calculated and card updates | Tasks 1–3 (recurrence, streak, store) | `computeNewStreak` → `calculateXP` → stored on `Completion.xpEarned` |
| Edge §3.1 Start date defaults to today | Task 6 (ChoreFormModal) | `todayString()` called at form initialisation |

### Placeholder Scan

Confirm: No occurrences of "TODO", "TBD", "FIXME", "implement later", "add validation", "coming soon", or stub comments in any code block in this plan. The profile route placeholder in App.tsx is an intentional stub indicating future plan scope, not missing implementation.

### Type Consistency Check

- `Chore.key` format: `"${packId}/${choreId}"` — generated in `store.addChore` as `` `${data.packId}/${choreId}` `` matching the spec.
- `XPSettings` referenced by `profile.activeXPSettingsId` in `store.recordCompletion` and `ChoreCard` — falls back to `xpSettings[0]` if no match, preventing null-dereference.
- `XPSize` passed as `chore.xpSize` to `calculateXP` — TypeScript type is `XPSize`, imported from `@/types` everywhere.
- `Completion.xpEarned` set once at creation, never mutated — immutability maintained.
- `Chore.active: boolean` — `addChore` sets `active: true`; `deactivateChore` sets `active: false`.
- `Answer[]` defaults to `[]` in `recordCompletion` signature — no-questions flow fully supported.
- All store actions guard `if (!db) throw` — prevents silent data loss if `init()` not called.
- `computeNewStreak` and `getChoreStatus` receive only completions for the specific chore (filtered by `choreKey`) — avoids cross-chore streak contamination.
