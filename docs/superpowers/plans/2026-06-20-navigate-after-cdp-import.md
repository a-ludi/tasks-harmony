# Navigate to Pack Page After CDP Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a successful initial CDP import, close the dialog and navigate directly to the new pack's page at `/packs/${packId}`.

**Architecture:** `importCDP` in the Zustand store changes its return type from `Promise<void>` to `Promise<string>`, returning `pack.id` (already computed from `fetchCDP`). `CDPImportDialog` calls `useNavigate` and navigates to the pack page after both import success paths. The update flow (`handleUpdate`) is untouched.

**Tech Stack:** TypeScript, React, React Router v6 (`useNavigate`), Zustand, Bun test runner

---

## Pre-existing test coverage

The spec calls for a test that `fetchCDP` sets `pack.id` to the last URL segment. **This test already exists** at `src/cdp/cdp-import.test.ts:77`:

```typescript
it('derives packId from last URL path segment', async () => {
  setupFetchResponses({ ... });
  const { pack } = await fetchCDP(BASE);
  expect(pack.id).toBe('morning');
});
```

No new test for `pack.id` derivation is needed. Run the suite to confirm it passes before making changes.

---

## File Structure

- **Modify:** `src/store/index.ts` — change `importCDP` return type in interface and implementation
- **Modify:** `src/components/cdp/CDPImportDialog.tsx` — add `useNavigate`, update two success paths

---

### Task 1: Change `importCDP` to return the pack ID

**Files:**
- Modify: `src/store/index.ts:48` (interface line)
- Modify: `src/store/index.ts:236-247` (implementation)

- [ ] **Step 1: Run tests to confirm baseline**

```bash
bun test src/cdp/cdp-import.test.ts
```

Expected: all tests pass (including `'derives packId from last URL path segment'` at line 77).

- [ ] **Step 2: Change the interface declaration**

In `src/store/index.ts`, find line 48:

```typescript
importCDP: (baseUrl: string, startDateOffsetDays?: number) => Promise<void>;
```

Change to:

```typescript
importCDP: (baseUrl: string, startDateOffsetDays?: number) => Promise<string>;
```

- [ ] **Step 3: Change the implementation to return `pack.id`**

In `src/store/index.ts`, find the `importCDP` action (lines 236–247). The current implementation ends with:

```typescript
importCDP: async (baseUrl, startDateOffsetDays = 0) => {
  const { db } = get();
  if (!db) throw new Error('Database not initialised');
  const { pack, chores, questions } = await fetchCDP(baseUrl, startDateOffsetDays);
  await putPack(db, pack);
  for (const chore of chores) await putChore(db, chore);
  for (const question of questions) await putQuestion(db, question);
  const [updatedPacks, updatedChores, updatedQuestions] = await Promise.all([
    getPacks(db), getAllChores(db), getAllQuestions(db),
  ]);
  set({ packs: updatedPacks, chores: updatedChores, questions: updatedQuestions });
},
```

Change to (add `return pack.id;` as the last line before the closing brace):

```typescript
importCDP: async (baseUrl, startDateOffsetDays = 0) => {
  const { db } = get();
  if (!db) throw new Error('Database not initialised');
  const { pack, chores, questions } = await fetchCDP(baseUrl, startDateOffsetDays);
  await putPack(db, pack);
  for (const chore of chores) await putChore(db, chore);
  for (const question of questions) await putQuestion(db, question);
  const [updatedPacks, updatedChores, updatedQuestions] = await Promise.all([
    getPacks(db), getAllChores(db), getAllQuestions(db),
  ]);
  set({ packs: updatedPacks, chores: updatedChores, questions: updatedQuestions });
  return pack.id;
},
```

- [ ] **Step 4: Run typecheck to verify the change is consistent**

```bash
bun run typecheck
```

Expected: no errors. If TypeScript complains about the return type mismatch, double-check both the interface declaration (step 2) and the implementation (step 3).

- [ ] **Step 5: Commit**

```bash
git add src/store/index.ts
git commit -m "feat: importCDP returns pack.id"
```

---

### Task 2: Navigate to pack page after import in CDPImportDialog

**Files:**
- Modify: `src/components/cdp/CDPImportDialog.tsx`

- [ ] **Step 1: Add `useNavigate` import**

In `src/components/cdp/CDPImportDialog.tsx`, the current first import line is:

```typescript
import { useState } from 'react';
```

Change to:

```typescript
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
```

- [ ] **Step 2: Call `useNavigate` inside the component**

At the top of the `CDPImportDialog` component body (after `const isOnline = useOnlineStatus();`), add:

```typescript
const navigate = useNavigate();
```

The top of the component currently looks like:

```typescript
export function CDPImportDialog({ onClose }: CDPImportDialogProps) {
  const isOnline = useOnlineStatus();
  const packs = useAppStore((s) => s.packs);
```

Change to:

```typescript
export function CDPImportDialog({ onClose }: CDPImportDialogProps) {
  const isOnline = useOnlineStatus();
  const navigate = useNavigate();
  const packs = useAppStore((s) => s.packs);
```

- [ ] **Step 3: Update `handleImport` success path**

Find the `handleImport` function. The current success path (inside the `try` block, after the date-shift branch) is:

```typescript
      await importCDP(trimmed);
      setMessage({ type: 'success', text: 'Pack imported successfully.' });
      setUrl('');
```

Replace with:

```typescript
      const packId = await importCDP(trimmed);
      onClose();
      navigate(`/packs/${packId}`);
```

- [ ] **Step 4: Update `handleConfirmShift` success path**

Find the `handleConfirmShift` function. The current success path (inside the `try` block) is:

```typescript
      await importCDP(pendingUrl, offsetDays);
      setMessage({ type: 'success', text: 'Pack imported successfully.' });
      setUrl('');
      setStep('url');
```

Replace with:

```typescript
      const packId = await importCDP(pendingUrl, offsetDays);
      onClose();
      navigate(`/packs/${packId}`);
```

- [ ] **Step 5: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors. TypeScript will confirm `importCDP` now returns `Promise<string>` and `packId` is typed as `string`.

- [ ] **Step 6: Run the full test suite**

```bash
bun test
```

Expected: all existing tests pass. There are no new tests to add — the pack ID derivation is covered by `cdp-import.test.ts:77`, and the dialog navigation is a browser-only behavior.

- [ ] **Step 7: Commit**

```bash
git add src/components/cdp/CDPImportDialog.tsx
git commit -m "feat: navigate to pack page after CDP import"
```
