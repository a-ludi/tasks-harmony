# Design: Navigate to Pack Page After CDP Import

**Date:** 2026-06-20
**Scope:** Initial CDP import only (not the update flow)

---

## Problem

After a successful CDP import the dialog shows a success message and stays open. The user must manually close it and find the new pack in the sidebar to start using it.

## Solution

After `importCDP` resolves, close the dialog and navigate directly to the new pack's page. The pack page itself confirms the import succeeded — no success message is needed.

## Changes

### `src/store/index.ts`

Change the `importCDP` action return type from `Promise<void>` to `Promise<string>`. Return `pack.id` at the end of the action — it is already available from `fetchCDP`'s return value and is the canonical pack identifier.

```typescript
// Type signature (AppStore interface)
importCDP: (baseUrl: string, startDateOffsetDays?: number) => Promise<string>;

// Implementation — add return at the end
return pack.id;
```

### `src/components/cdp/CDPImportDialog.tsx`

Add `useNavigate` from `react-router-dom`. In both import success paths, replace the success-message lines with `onClose()` then `navigate('/packs/${packId}')`:

**`handleImport` (direct path):**
```typescript
const packId = await importCDP(trimmed);
onClose();
navigate(`/packs/${packId}`);
```

**`handleConfirmShift` (date-shift path):**
```typescript
const packId = await importCDP(pendingUrl, offsetDays);
onClose();
navigate(`/packs/${packId}`);
```

The `handleUpdate` function is unchanged.

### `src/cdp/cdp-import.test.ts`

Add a test asserting that `fetchCDP` sets `pack.id` to the last path segment of the base URL. This is the canonical assertion that the ID used for navigation is correct.

```typescript
it('derives pack id from the last segment of the base URL', async () => {
  // mock fetch to return minimal valid manifest + chore
  const result = await fetchCDP('https://raw.githubusercontent.com/user/repo/refs/heads/main/fitness');
  expect(result.pack.id).toBe('fitness');
});
```

## What Does Not Change

- `updateCDP` — no navigation after updating an existing pack
- The offline guard, error handling, and date-shift UI are unchanged
- No URL-parsing logic is added to the dialog — the store is the single source of truth for the pack ID

## Out of Scope

- Navigation after pack update
- Toast/notification confirming the import on the pack page
