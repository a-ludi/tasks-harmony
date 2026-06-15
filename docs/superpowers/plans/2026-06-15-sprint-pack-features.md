# Sprint Pack Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement four issues — #40 (due period), #36 (no-streak packs), #33 (completable packs), #39 (nav cleanup).

**Architecture:** Types extended first to unblock all tasks; each feature is self-contained. Pack manifest fields (#33/#36) are persisted via a new `updatePackManifest` store action following the same pattern as `renamePack`/`updatePackDescription`. CDP import gains an optional day-offset for date shifting.

**Tech Stack:** TypeScript, React, Zustand, IndexedDB (via idb), shadcn/ui (Radix), Tailwind, fflate + js-yaml for CDP, Bun test runner.

---

## File Map

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `DuePeriod`, extend `Chore` and `PackManifest` |
| `src/chores/recurrence.ts` | Add `duePeriodToMs`, update `getChoreStatus` |
| `src/chores/recurrence.test.ts` | New tests for `duePeriod` |
| `src/store/index.ts` | Add `updatePackManifest`, update `recordCompletion` and `importCDP` |
| `src/xp/calculator.ts` | No change — streak=0 already yields multiplier=1 |
| `src/components/chores/ChoreFormModal.tsx` | Add due-period field |
| `src/components/dashboard/ChoreCard.tsx` | Suppress streak display/calculation for no-streak packs |
| `src/components/packs/PackDashboard.tsx` | Kebab menu, progress bars |
| `src/components/profile/ProfilePage.tsx` | Add SyncButton, dark-mode toggle, GitHub link |
| `src/components/layout/Sidebar.tsx` | Remove SyncButton, dark-mode toggle, GitHub link |
| `src/cdp/cdp-export.ts` | Export `duePeriod`, pack manifest fields |
| `src/cdp/cdp-import.ts` | Import new fields, add date-offset param, add manifest-only fetch |
| `src/components/cdp/CDPImportDialog.tsx` | Two-phase flow for date-shift UI |

---

## Task 1: Extend types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add `DuePeriodUnit`, `DuePeriod`, extend `Chore` and `PackManifest`**

In `src/types/index.ts`, after the `RecurrenceFrequency` line add:

```ts
export type DuePeriodUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months';

export interface DuePeriod {
  value: number;
  unit: DuePeriodUnit;
}
```

In the `Chore` interface, add after `active`:
```ts
  duePeriod?: DuePeriod;
```

In the `PackManifest` interface, add after `cdpCreatedAt`:
```ts
  streak?: boolean;         // default true; false disables streak mechanics for all chores
  xpTarget?: number;
  targetDate?: string;      // ISO date 'YYYY-MM-DD'
  allowShiftOnImport?: boolean; // default false; when true, import dialog offers date shifting
```

- [ ] **Step 2: Verify TypeScript still compiles**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add DuePeriod, pack manifest goal fields, streak flag"
```

---

## Task 2: #40 — Due period recurrence logic

**Files:**
- Modify: `src/chores/recurrence.ts`
- Modify: `src/chores/recurrence.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/chores/recurrence.test.ts` (before the closing of the file):

```ts
// ── duePeriod ─────────────────────────────────────────────────────────────────

describe('getChoreStatus with duePeriod', () => {
  it('returns upcoming when inside window but before due period (daily, 12h due period)', () => {
    // daily chore starting 2026-01-10; window 0: Jan 10 00:00 → Jan 11 00:00
    // due period: 12 hours → becomes due at Jan 10 12:00
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const chore: Chore = {
      ...makeChore(rec),
      duePeriod: { value: 12, unit: 'hours' },
    };
    // 09:00 on Jan 10 — inside window, before due period
    const now = new Date(2026, 0, 10, 9, 0, 0, 0);
    expect(getChoreStatus(chore, [], now)).toBe('upcoming');
  });

  it('returns due when at the start of the due period', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const chore: Chore = {
      ...makeChore(rec),
      duePeriod: { value: 12, unit: 'hours' },
    };
    // 12:00 on Jan 10 — exactly at due period start
    const now = new Date(2026, 0, 10, 12, 0, 0, 0);
    expect(getChoreStatus(chore, [], now)).toBe('due');
  });

  it('returns due when inside due period', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const chore: Chore = {
      ...makeChore(rec),
      duePeriod: { value: 6, unit: 'hours' },
    };
    // 20:00 on Jan 10 — in the last 6h of the 24h window
    const now = new Date(2026, 0, 10, 20, 0, 0, 0);
    expect(getChoreStatus(chore, [], now)).toBe('due');
  });

  it('omitted duePeriod preserves existing behaviour (due from window open)', () => {
    const rec = makeRecurrence('daily', 1, '2026-01-10');
    const chore = makeChore(rec);
    const now = new Date(2026, 0, 10, 1, 0, 0, 0);
    expect(getChoreStatus(chore, [], now)).toBe('due');
  });

  it('handles weekly chore with 2-day due period', () => {
    // weekly chore starting Mon 2026-01-05; window 0: Jan 5 → Jan 12
    // due period: 2 days → becomes due Jan 10 00:00
    const rec = makeRecurrence('weekly', 1, '2026-01-05');
    const chore: Chore = {
      ...makeChore(rec),
      duePeriod: { value: 2, unit: 'days' },
    };
    // Jan 8 — inside window, before due period
    const beforeDue = new Date(2026, 0, 8, 12, 0, 0, 0);
    expect(getChoreStatus(chore, [], beforeDue)).toBe('upcoming');
    // Jan 10 — inside due period
    const inDue = new Date(2026, 0, 10, 12, 0, 0, 0);
    expect(getChoreStatus(chore, [], inDue)).toBe('due');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bun test src/chores/recurrence.test.ts
```

Expected: 4–5 new test failures.

- [ ] **Step 3: Add `duePeriodToMs` and update `getChoreStatus`**

In `src/chores/recurrence.ts`, add after the imports:

```ts
import type { Chore, Completion, ChoreStatus, Recurrence, DuePeriod } from '@/types';

const DUE_PERIOD_MS: Record<import('@/types').DuePeriodUnit, number> = {
  minutes: 60_000,
  hours:   3_600_000,
  days:    86_400_000,
  weeks:   604_800_000,
  months:  2_592_000_000,
};

export function duePeriodToMs(dp: DuePeriod): number {
  return dp.value * DUE_PERIOD_MS[dp.unit];
}
```

In `getChoreStatus`, replace the final `return 'due';` with:

```ts
    if (chore.duePeriod) {
      const dueFromMs = windowEnd.getTime() - duePeriodToMs(chore.duePeriod);
      if (now.getTime() < dueFromMs) return 'upcoming';
    }

    return 'due';
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
bun test src/chores/recurrence.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/chores/recurrence.ts src/chores/recurrence.test.ts
git commit -m "feat(#40): add duePeriod support to getChoreStatus"
```

---

## Task 3: #40 — Due period ChoreFormModal field

**Files:**
- Modify: `src/components/chores/ChoreFormModal.tsx`

- [ ] **Step 1: Add state and import**

Open `src/components/chores/ChoreFormModal.tsx`. At the top, add to the imports:

```ts
import type { DuePeriodUnit } from '@/types';
```

In the component, after the `repeatable` state, add:

```ts
  const [duePeriodValue, setDuePeriodValue] = useState<string>(
    chore?.duePeriod ? String(chore.duePeriod.value) : ''
  );
  const [duePeriodUnit, setDuePeriodUnit] = useState<DuePeriodUnit>(
    chore?.duePeriod?.unit ?? 'hours'
  );
```

- [ ] **Step 2: Build the `duePeriod` object before save**

In the save handler (the function that calls `addChore` / `updateChore`), add before the call:

```ts
    const duePeriod = duePeriodValue.trim() && Number(duePeriodValue) > 0
      ? { value: Number(duePeriodValue), unit: duePeriodUnit }
      : undefined;
```

Pass `duePeriod` into the `addChore` / `updateChore` calls. The full chore object build already uses spread — add `duePeriod` to it:

```ts
// in addChore call:
await addChore({ ..., duePeriod });
// in updateChore call:
await updateChore({ ...chore, ..., duePeriod });
```

- [ ] **Step 3: Add the form field**

In the JSX, after the "Repeatable" checkbox row and before the closing of the form, add:

```tsx
              <div className="space-y-1">
                <Label>Due period</Label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    value={duePeriodValue}
                    onChange={(e) => setDuePeriodValue(e.target.value)}
                    placeholder="e.g. 12"
                    className="w-24 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <Select value={duePeriodUnit} onValueChange={(v) => setDuePeriodUnit(v as DuePeriodUnit)}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">minutes</SelectItem>
                      <SelectItem value="hours">hours</SelectItem>
                      <SelectItem value="days">days</SelectItem>
                      <SelectItem value="weeks">weeks</SelectItem>
                      <SelectItem value="months">months</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  Chore becomes due this long before the window ends. Leave blank to show as due from window open.
                </p>
              </div>
```

- [ ] **Step 4: Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/chores/ChoreFormModal.tsx
git commit -m "feat(#40): add due period field to chore form"
```

---

## Task 4: Store — add `updatePackManifest` action

**Files:**
- Modify: `src/store/index.ts`

- [ ] **Step 1: Add the action type to the store interface**

Find the store interface (around line 49–55 where `renamePack` is). Add after `updatePackDescription`:

```ts
  updatePackManifest: (packId: string, changes: Partial<import('@/types').PackManifest>) => Promise<void>;
```

- [ ] **Step 2: Implement the action**

After the `updatePackDescription` implementation (around line 310), add:

```ts
  updatePackManifest: async (packId, changes) => {
    const { db, packs } = get();
    if (!db) throw new Error('DB not initialised');
    const pack = packs.find((p) => p.id === packId);
    if (!pack) throw new Error(`Pack '${packId}' not found`);
    const updated: Pack = {
      ...pack,
      manifest: { ...pack.manifest, ...changes },
      updatedAt: new Date().toISOString(),
    };
    await putPack(db, updated);
    set((state) => ({
      packs: state.packs.map((p) => (p.id === packId ? updated : p)),
    }));
  },
```

- [ ] **Step 3: Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/store/index.ts
git commit -m "feat: add updatePackManifest store action"
```

---

## Task 5: #36 — No-streak: recordCompletion + ChoreCard

**Files:**
- Modify: `src/store/index.ts`
- Modify: `src/components/dashboard/ChoreCard.tsx`

- [ ] **Step 1: Update `recordCompletion` for no-streak packs**

In `src/store/index.ts`, in `recordCompletion` (around line 153), after the line `const chore = chores.find(...)`, add:

```ts
    const chorePack = get().packs.find((p) => p.id === chore.packId);
    const packStreak = chorePack?.manifest.streak ?? true;
```

Then replace:

```ts
    const streak = computeNewStreak(chore, choreCompletions, now);
    ...
    let xpEarned = calculateXP(chore.xpSize, streak, totalCompletions, activeSettings);
```

with:

```ts
    const streak = packStreak ? computeNewStreak(chore, choreCompletions, now) : 0;
    ...
    let xpEarned = calculateXP(chore.xpSize, streak, totalCompletions, activeSettings);
```

- [ ] **Step 2: Update `ChoreCard` to suppress streak when pack.streak is false**

In `src/components/dashboard/ChoreCard.tsx`, add a selector after the existing `useAppStore` calls near the top of the component body:

```ts
  const chorePack = useAppStore((s) => s.packs.find((p) => p.id === chore.packId));
  const packStreak = chorePack?.manifest.streak ?? true;
```

Then update the XP and streak calculation lines:

```ts
  const nextStreak = activeSettings && packStreak ? computeNewStreak(chore, choreCompletions, now) : 0;
```

And suppress the streak display. Find the streak display block (around line 113):

```tsx
{currentStreak > 0 && (
  <span>Streak: <span className="font-medium text-foreground">{currentStreak}</span></span>
)}
```

Replace with:

```tsx
{packStreak && currentStreak > 0 && (
  <span>Streak: <span className="font-medium text-foreground">{currentStreak}</span></span>
)}
```

- [ ] **Step 3: Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/store/index.ts src/components/dashboard/ChoreCard.tsx
git commit -m "feat(#36): suppress streak count and multiplier for no-streak packs"
```

---

## Task 6: #36/#33 — Pack kebab menu + settings

**Files:**
- Modify: `src/components/packs/PackDashboard.tsx`

- [ ] **Step 1: Add required imports**

At the top of `src/components/packs/PackDashboard.tsx`, add/extend imports:

```ts
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
```

Add to the store selectors:

```ts
  const updatePackManifest = useAppStore((s) => s.updatePackManifest);
```

Add state for the XP target and target date popovers:

```ts
  const [showXpTargetPopover, setShowXpTargetPopover] = useState(false);
  const [xpTargetInput, setXpTargetInput] = useState('');
  const [showTargetDatePopover, setShowTargetDatePopover] = useState(false);
  const [targetDateInput, setTargetDateInput] = useState('');
```

- [ ] **Step 2: Replace the buttons block with the kebab menu**

Find the `<div className="ml-auto flex gap-2">` block (around line 116) that contains the Download and Delete buttons. Replace the entire block with:

```tsx
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Pack options">
                ⋮
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuCheckboxItem
                checked={pack.manifest.streak ?? true}
                onCheckedChange={(checked) => updatePackManifest(pack.id, { streak: checked })}
              >
                Streaks enabled
              </DropdownMenuCheckboxItem>

              <DropdownMenuCheckboxItem
                checked={pack.manifest.allowShiftOnImport ?? false}
                onCheckedChange={(checked) => updatePackManifest(pack.id, { allowShiftOnImport: checked })}
              >
                Allow shift on import
              </DropdownMenuCheckboxItem>

              <Popover open={showXpTargetPopover} onOpenChange={setShowXpTargetPopover}>
                <PopoverTrigger asChild>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setXpTargetInput(pack.manifest.xpTarget != null ? String(pack.manifest.xpTarget) : '');
                      setShowXpTargetPopover(true);
                    }}
                  >
                    {pack.manifest.xpTarget != null ? `XP target: ${pack.manifest.xpTarget.toLocaleString()}` : 'Set XP target…'}
                  </DropdownMenuItem>
                </PopoverTrigger>
                <PopoverContent className="w-64 space-y-2">
                  <p className="text-sm font-medium">XP target</p>
                  <Input
                    type="number"
                    min="0"
                    placeholder="e.g. 1000"
                    value={xpTargetInput}
                    onChange={(e) => setXpTargetInput(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={async () => {
                        const val = xpTargetInput.trim() ? Number(xpTargetInput) : undefined;
                        await updatePackManifest(pack.id, { xpTarget: val });
                        setShowXpTargetPopover(false);
                      }}
                    >
                      Save
                    </Button>
                    {pack.manifest.xpTarget != null && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await updatePackManifest(pack.id, { xpTarget: undefined });
                          setShowXpTargetPopover(false);
                        }}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              <Popover open={showTargetDatePopover} onOpenChange={setShowTargetDatePopover}>
                <PopoverTrigger asChild>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setTargetDateInput(pack.manifest.targetDate ?? '');
                      setShowTargetDatePopover(true);
                    }}
                  >
                    {pack.manifest.targetDate ? `Target date: ${pack.manifest.targetDate}` : 'Set target date…'}
                  </DropdownMenuItem>
                </PopoverTrigger>
                <PopoverContent className="w-64 space-y-2">
                  <p className="text-sm font-medium">Target date</p>
                  <Input
                    type="date"
                    value={targetDateInput}
                    onChange={(e) => setTargetDateInput(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={async () => {
                        await updatePackManifest(pack.id, { targetDate: targetDateInput || undefined });
                        setShowTargetDatePopover(false);
                      }}
                    >
                      Save
                    </Button>
                    {pack.manifest.targetDate && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await updatePackManifest(pack.id, { targetDate: undefined });
                          setShowTargetDatePopover(false);
                        }}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={handleExport}>
                Download as CDP
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {!pack.isPersonal && (
                <DropdownMenuItem
                  onClick={handleDelete}
                  className="text-destructive focus:text-destructive"
                >
                  Delete Pack
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
```

- [ ] **Step 3: Check if `Popover` is available and install if missing**

```bash
ls src/components/ui/popover.tsx 2>/dev/null && echo "exists" || echo "missing"
```

If missing, add it:

```bash
bunx --bun shadcn@latest add popover
```

**Note:** Radix `Popover` nested inside `DropdownMenu` can have focus-trap conflicts. If focus leaves the dropdown unexpectedly, replace the `Popover` wrappers with simple `Dialog` modals triggered by `DropdownMenuItem` clicks instead. The pattern is: track `showXpTargetDialog` state, close the dropdown on click (`e.preventDefault()` in `onSelect`), then render a `<Dialog open={showXpTargetDialog}>` outside the `DropdownMenu`.

- [ ] **Step 4: Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/packs/PackDashboard.tsx src/components/ui/popover.tsx 2>/dev/null; git add -p
git commit -m "feat(#36,#33): replace pack buttons with kebab menu, add streak/goal toggles"
```

---

## Task 7: #33 — Pack progress bars

**Files:**
- Modify: `src/components/packs/PackDashboard.tsx`

- [ ] **Step 1: Add helper to get earliest chore start date**

At the top of the `PackDashboard` component body (after `packChores` is computed), add:

```ts
  const earliestStartDate: Date | null = packChores.length > 0
    ? packChores.reduce<Date | null>((earliest, c) => {
        const d = new Date(c.recurrence.startDate);
        return earliest === null || d < earliest ? d : earliest;
      }, null)
    : null;
```

- [ ] **Step 2: Compute progress values**

After `earliestStartDate`, add:

```ts
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const xpProgress = pack.manifest.xpTarget != null
    ? Math.min(1, packXP / pack.manifest.xpTarget)
    : null;
  const xpCompleted = pack.manifest.xpTarget != null && packXP >= pack.manifest.xpTarget;

  const targetDate = pack.manifest.targetDate ? (() => {
    const [y, m, d] = pack.manifest.targetDate!.split('-').map(Number);
    return new Date(y, m - 1, d);
  })() : null;

  const timeProgress = targetDate && earliestStartDate
    ? Math.min(1, (today.getTime() - earliestStartDate.getTime()) / (targetDate.getTime() - earliestStartDate.getTime()))
    : null;
  const timeLapsed = targetDate !== null
    && today > targetDate
    && (pack.manifest.xpTarget == null || packXP < pack.manifest.xpTarget);
```

- [ ] **Step 3: Add progress bar JSX**

After the pack description block (before `<Dashboard ...>`), add:

```tsx
      {(xpProgress !== null || timeProgress !== null) && (
        <div className="mt-3 space-y-2">
          {xpProgress !== null && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>XP progress</span>
                {xpCompleted
                  ? <span className="rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-green-800 dark:text-green-300 font-medium">Completed</span>
                  : <span>{packXP.toLocaleString()} / {pack.manifest.xpTarget!.toLocaleString()} XP</span>
                }
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-400 transition-all"
                  style={{ width: `${Math.round(xpProgress * 100)}%` }}
                />
              </div>
            </div>
          )}

          {timeProgress !== null && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Time progress</span>
                {timeLapsed
                  ? <span className="rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-0.5 text-red-800 dark:text-red-300 font-medium">Lapsed</span>
                  : <span>Target: {pack.manifest.targetDate}</span>
                }
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-400 transition-all"
                  style={{ width: `${Math.round(Math.max(0, timeProgress) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 4: Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/packs/PackDashboard.tsx
git commit -m "feat(#33): add XP and time progress bars to pack page"
```

---

## Task 8: CDP export — new fields

**Files:**
- Modify: `src/cdp/cdp-export.ts`

- [ ] **Step 1: Export pack manifest fields**

In `buildPackYaml`, after `data.chores = choreFilenames;` add:

```ts
  if (pack.manifest.streak === false) data.streak = false;
  if (pack.manifest.xpTarget != null)         data.xpTarget = pack.manifest.xpTarget;
  if (pack.manifest.targetDate)               data.targetDate = pack.manifest.targetDate;
  if (pack.manifest.allowShiftOnImport)       data.allowShiftOnImport = true;
```

- [ ] **Step 2: Export `duePeriod` in chore YAML**

In `buildChoreYaml`, after `if (chore.description) data.description = chore.description;` add:

```ts
  if (chore.duePeriod) data.duePeriod = chore.duePeriod;
```

- [ ] **Step 3: Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/cdp/cdp-export.ts
git commit -m "feat: export duePeriod, streak, xpTarget, targetDate, allowShiftOnImport to CDP"
```

---

## Task 9: CDP import — parse new fields + date-offset support

**Files:**
- Modify: `src/cdp/cdp-import.ts`

- [ ] **Step 1: Extend the local YAML interfaces and add `fetchCDP` date-offset parameter**

In `src/cdp/cdp-import.ts`, extend the `PackYaml` interface:

```ts
interface PackYaml {
  title: string;
  author?: string;
  license?: string;
  description?: string;
  chores: string[];
  streak?: boolean;
  xpTarget?: number;
  targetDate?: string;
  allowShiftOnImport?: boolean;
}
```

Extend the `ChoreYaml` interface:

```ts
interface ChoreYaml {
  title: string;
  description?: string;
  xpSize: XPSize;
  frequency: RecurrenceFrequency;
  interval: number;
  windowStartTime?: string;
  repeatable?: boolean;
  questions?: unknown[];
  duePeriod?: { value: number; unit: import('@/types').DuePeriodUnit };
}
```

- [ ] **Step 2: Update `fetchCDP` signature to accept an optional day offset**

Change the function signature:

```ts
export async function fetchCDP(
  baseUrl: string,
  startDateOffsetDays = 0,
): Promise<{ pack: Pack; chores: Chore[]; questions: Question[] }> {
```

In the function body, replace the line `const today = new Date().toISOString().substring(0, 10);` with:

```ts
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + startDateOffsetDays);
  const today = baseDate.toISOString().substring(0, 10);
```

Apply offset to `targetDate` in the pack object. Replace the `manifest` object construction:

```ts
  const pack: Pack = {
    id: packId,
    manifest: {
      title: manifestRaw.title,
      author: manifestRaw.author,
      license: manifestRaw.license,
      description: manifestRaw.description,
      streak: manifestRaw.streak,
      xpTarget: manifestRaw.xpTarget,
      targetDate: manifestRaw.targetDate
        ? (() => {
            const d = new Date(manifestRaw.targetDate + 'T00:00:00');
            d.setDate(d.getDate() + startDateOffsetDays);
            return d.toISOString().substring(0, 10);
          })()
        : undefined,
      allowShiftOnImport: manifestRaw.allowShiftOnImport,
    },
    isPersonal: false,
    importedAt: now,
    updatedAt: now,
    sourceUrl: baseUrl,
  };
```

- [ ] **Step 3: Parse `duePeriod` from chore YAML**

In the chore mapping inside `fetchCDP`, add `duePeriod` to the returned `Chore` object:

```ts
      return {
        key: choreKey, choreId, packId,
        title: choreRaw.title,
        description: choreRaw.description,
        xpSize: choreRaw.xpSize,
        recurrence: {
          frequency: choreRaw.frequency,
          interval: choreRaw.interval,
          startDate: today,
          windowStartTime: choreRaw.windowStartTime ?? '00:00',
        },
        repeatable: choreRaw.repeatable ?? false,
        active: true,
        createdAt: now,
        duePeriod: choreRaw.duePeriod,
      } satisfies Chore;
```

- [ ] **Step 4: Add `fetchCDPManifestOnly` for the two-phase import dialog**

After `fetchCDP`, add:

```ts
export async function fetchCDPManifestOnly(
  baseUrl: string,
): Promise<{ targetDate?: string; allowShiftOnImport?: boolean }> {
  const manifestUrl = `${baseUrl}/__pack__.yaml`;
  const res = await fetch(manifestUrl);
  if (!res.ok) throw new Error(`Failed to fetch CDP manifest: ${res.status}`);
  const raw = jsYaml.load(await res.text()) as PackYaml;
  return {
    targetDate: raw.targetDate,
    allowShiftOnImport: raw.allowShiftOnImport,
  };
}
```

- [ ] **Step 5: Update `importCDP` in the store to forward the offset**

In `src/store/index.ts`, update the `importCDP` signature:

```ts
  importCDP: (baseUrl: string, startDateOffsetDays?: number) => Promise<void>;
```

And the implementation:

```ts
  importCDP: async (baseUrl, startDateOffsetDays = 0) => {
    const { db } = get();
    if (!db) throw new Error('Database not initialised');
    const { pack, chores, questions } = await fetchCDP(baseUrl, startDateOffsetDays);
    // ... rest unchanged
  },
```

Extend the import at the top of `store/index.ts` (add `fetchCDPManifestOnly`):

```ts
import { fetchCDP, fetchCDPManifestOnly } from '@/cdp/cdp-import';
```

- [ ] **Step 6: Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/cdp/cdp-import.ts src/store/index.ts
git commit -m "feat(#33,#40): parse new CDP fields and add date-offset import support"
```

---

## Task 10: #33 — Date-shifting import dialog

**Files:**
- Modify: `src/components/cdp/CDPImportDialog.tsx`

- [ ] **Step 1: Add imports and state**

Add to the imports at the top:

```ts
import { fetchCDPManifestOnly } from '@/cdp/cdp-import';
```

Add state variables in the component:

```ts
  const [step, setStep] = useState<'url' | 'date-shift'>('url');
  const [pendingUrl, setPendingUrl] = useState('');
  const [shiftStartDate, setShiftStartDate] = useState('');
  const [shiftTargetDate, setShiftTargetDate] = useState('');
  const [shiftDurationDays, setShiftDurationDays] = useState(0);
```

- [ ] **Step 2: Replace `handleImport` with two-phase logic**

Replace the existing `handleImport` function with:

```ts
  function todayStr(): string {
    return new Date().toISOString().substring(0, 10);
  }

  function dateDiffDays(a: string, b: string): number {
    return Math.round(
      (new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime())
      / 86_400_000
    );
  }

  async function handleImport() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setImporting(true); setMessage(null);
    try {
      const meta = await fetchCDPManifestOnly(trimmed);
      if (meta.allowShiftOnImport && meta.targetDate) {
        const today = todayStr();
        const duration = dateDiffDays(today, meta.targetDate);
        setShiftDurationDays(duration);
        setShiftStartDate(today);
        setShiftTargetDate(meta.targetDate);
        setPendingUrl(trimmed);
        setStep('date-shift');
        setImporting(false);
        return;
      }
      await importCDP(trimmed);
      setMessage({ type: 'success', text: 'Pack imported successfully.' });
      setUrl('');
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Import failed.' });
    } finally {
      setImporting(false);
    }
  }

  async function handleConfirmShift() {
    setImporting(true); setMessage(null);
    try {
      const today = todayStr();
      const offsetDays = dateDiffDays(today, shiftStartDate);
      await importCDP(pendingUrl, offsetDays);
      setMessage({ type: 'success', text: 'Pack imported successfully.' });
      setUrl('');
      setStep('url');
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Import failed.' });
    } finally {
      setImporting(false);
    }
  }
```

- [ ] **Step 3: Add date-shift step UI**

Below the existing `<div className="space-y-2">` URL input block, add a conditional block:

```tsx
        {step === 'date-shift' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This pack supports date shifting. Set when you want to start, and the target date will adjust automatically.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="shift-start">Start date</Label>
                <Input
                  id="shift-start"
                  type="date"
                  value={shiftStartDate}
                  onChange={(e) => {
                    setShiftStartDate(e.target.value);
                    if (e.target.value) {
                      const d = new Date(e.target.value + 'T00:00:00');
                      d.setDate(d.getDate() + shiftDurationDays);
                      setShiftTargetDate(d.toISOString().substring(0, 10));
                    }
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="shift-target">Target date</Label>
                <Input
                  id="shift-target"
                  type="date"
                  value={shiftTargetDate}
                  onChange={(e) => {
                    setShiftTargetDate(e.target.value);
                    if (e.target.value) {
                      const d = new Date(e.target.value + 'T00:00:00');
                      d.setDate(d.getDate() - shiftDurationDays);
                      setShiftStartDate(d.toISOString().substring(0, 10));
                    }
                  }}
                />
              </div>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Duration: {shiftDurationDays} days
            </p>
            <div className="flex gap-2">
              <Button onClick={handleConfirmShift} disabled={importing} className="flex-1">
                {importing ? 'Importing…' : 'Import with these dates'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setStep('url')}
                disabled={importing}
              >
                Back
              </Button>
            </div>
          </div>
        )}
```

And wrap the existing URL input + import button in `{step === 'url' && (...)}`.

- [ ] **Step 5: Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/cdp/CDPImportDialog.tsx
git commit -m "feat(#33): two-phase CDP import dialog with date shifting"
```

---

## Task 11: #39 — Nav cleanup

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/profile/ProfilePage.tsx`

- [ ] **Step 1: Strip Sidebar of the three items**

In `src/components/layout/Sidebar.tsx`:

1. Remove the `<div className="border-t pt-4 space-y-3">` block entirely (it contains `SyncButton` and the dark mode toggle).
2. Remove the `"View on GitHub"` anchor tag.
3. Remove the now-unused imports: `SyncButton`, `Switch`, `Label`, `useTheme`.

The footer area at the bottom should now only contain:

```tsx
      <div className="mt-4 space-y-2">
        {updateVersion && (
          <button
            onClick={onUpdateClick}
            className="w-full rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors text-center"
          >
            Update to v{updateVersion}
          </button>
        )}
      </div>

      <footer className="mt-auto pt-4 text-xs text-muted-foreground select-none">
        v{import.meta.env.VITE_APP_VERSION} · {import.meta.env.VITE_BUILD_DATE}
      </footer>
```

- [ ] **Step 2: Add the three items to ProfilePage**

In `src/components/profile/ProfilePage.tsx`, add imports:

```ts
import { SyncButton } from '@/components/sync/SyncButton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useTheme } from '@/hooks/useTheme';
```

Inside the component function, add:

```ts
  const { theme, toggle } = useTheme();
```

At the end of the `return` block, before the closing `</div>`, add a new section:

```tsx
      <section className="rounded-lg border border-border bg-background p-4 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">App</h2>
        <SyncButton />
        <div className="flex items-center gap-2">
          <Switch checked={theme === 'dark'} onCheckedChange={toggle} />
          <Label className="text-sm font-normal cursor-pointer" onClick={toggle}>Dark mode</Label>
        </div>
        <a
          href="https://github.com/a-ludi/tasks-harmony"
          target="_blank"
          rel="noopener noreferrer"
          className="block text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          View on GitHub ↗
        </a>
      </section>
```

- [ ] **Step 3: Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/profile/ProfilePage.tsx
git commit -m "feat(#39): move sync, dark mode, and GitHub link from nav to Profile page"
```

---

## Final verification

- [ ] Run the full test suite:

```bash
bun test
```

Expected: all tests pass.

- [ ] Start the dev server and manually verify:
  1. A chore with `duePeriod: { value: 12, unit: 'hours' }` shows as "upcoming" in the morning and "due" in the afternoon
  2. A pack with `streak: false` shows no streak count on cards
  3. The pack kebab menu opens with all toggles working
  4. XP and time progress bars render on a pack with targets set
  5. The Sidebar no longer has sync/dark-mode/GitHub; Profile page has them
  6. CDP import from a URL with `allowShiftOnImport: true` shows the date-shift UI

```bash
bun run dev
```
