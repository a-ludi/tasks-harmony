# CDP URL Normalization & Imported Pack Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize CDN URLs on import so users can paste any GitHub/GitLab URL, and show a clickable sync icon next to imported pack titles in the sidebar and pack dashboard.

**Architecture:** A pure `normalizePackUrl()` utility handles URL transformation before any fetch or storage occurs, keeping `sourceUrl` always clean. The sync icon is a sibling `<Button>` element (not nested inside the `<NavLink>`) that opens the existing `CDPImportDialog`.

**Tech Stack:** TypeScript, React, Bun test runner (`bun:test`), Tailwind CSS, shadcn `<Button>`

---

## File Map

| Action | File | Purpose |
|---|---|---|
| Create | `src/cdp/normalizePackUrl.ts` | Pure URL normalization function |
| Create | `src/cdp/normalizePackUrl.test.ts` | Unit tests for all URL patterns |
| Modify | `src/components/cdp/CDPImportDialog.tsx` | Call `normalizePackUrl` before fetch in `handleImport` |
| Modify | `src/components/layout/Sidebar.tsx` | Restructure pack items; add sync icon button |
| Modify | `src/components/packs/PackDashboard.tsx` | Add sync icon button + `CDPImportDialog` |

---

## Task 1: `normalizePackUrl` — tests

**Files:**
- Create: `src/cdp/normalizePackUrl.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
// src/cdp/normalizePackUrl.test.ts
import { describe, it, expect } from 'bun:test';
import { normalizePackUrl } from './normalizePackUrl';

describe('normalizePackUrl', () => {
  // ── suffix stripping ──────────────────────────────────────────────────
  it('strips /__pack__.yaml suffix from an already-raw URL', () => {
    expect(normalizePackUrl(
      'https://raw.githubusercontent.com/user/repo/refs/heads/main/fitness/__pack__.yaml'
    )).toBe('https://raw.githubusercontent.com/user/repo/refs/heads/main/fitness');
  });

  it('strips /__pack__.yaml before applying provider transformation', () => {
    expect(normalizePackUrl(
      'https://github.com/user/repo/blob/main/fitness/__pack__.yaml'
    )).toBe('https://raw.githubusercontent.com/user/repo/refs/heads/main/fitness');
  });

  // ── GitHub.com ────────────────────────────────────────────────────────
  it('transforms GitHub tree URL to raw URL', () => {
    expect(normalizePackUrl(
      'https://github.com/a-ludi/harmony-tasks/tree/main/fitness'
    )).toBe('https://raw.githubusercontent.com/a-ludi/harmony-tasks/refs/heads/main/fitness');
  });

  it('transforms GitHub blob URL to raw URL', () => {
    expect(normalizePackUrl(
      'https://github.com/a-ludi/harmony-tasks/blob/main/fitness/chore.yaml'
    )).toBe('https://raw.githubusercontent.com/a-ludi/harmony-tasks/refs/heads/main/fitness/chore.yaml');
  });

  it('passes through GitHub raw URL unchanged', () => {
    expect(normalizePackUrl(
      'https://raw.githubusercontent.com/user/repo/refs/heads/main/fitness'
    )).toBe('https://raw.githubusercontent.com/user/repo/refs/heads/main/fitness');
  });

  // ── GitLab.com ────────────────────────────────────────────────────────
  it('transforms GitLab tree URL to raw URL', () => {
    expect(normalizePackUrl(
      'https://gitlab.com/user/repo/-/tree/main/fitness'
    )).toBe('https://gitlab.com/user/repo/-/raw/main/fitness');
  });

  it('transforms GitLab blob URL to raw URL', () => {
    expect(normalizePackUrl(
      'https://gitlab.com/user/repo/-/blob/main/fitness/__pack__.yaml'
    )).toBe('https://gitlab.com/user/repo/-/raw/main/fitness');
  });

  it('passes through GitLab raw URL unchanged', () => {
    expect(normalizePackUrl(
      'https://gitlab.com/user/repo/-/raw/main/fitness'
    )).toBe('https://gitlab.com/user/repo/-/raw/main/fitness');
  });

  // ── self-hosted GitLab ────────────────────────────────────────────────
  it('transforms self-hosted GitLab tree URL to raw URL', () => {
    expect(normalizePackUrl(
      'https://git.mycompany.com/user/repo/-/tree/main/fitness'
    )).toBe('https://git.mycompany.com/user/repo/-/raw/main/fitness');
  });

  it('transforms self-hosted GitLab blob URL to raw URL', () => {
    expect(normalizePackUrl(
      'https://git.mycompany.com/user/repo/-/blob/main/fitness/__pack__.yaml'
    )).toBe('https://git.mycompany.com/user/repo/-/raw/main/fitness');
  });

  it('passes through self-hosted GitLab raw URL unchanged', () => {
    expect(normalizePackUrl(
      'https://git.mycompany.com/user/repo/-/raw/main/fitness'
    )).toBe('https://git.mycompany.com/user/repo/-/raw/main/fitness');
  });

  // ── GitHub Enterprise (custom domain) ────────────────────────────────
  it('transforms GitHub Enterprise blob URL to raw URL', () => {
    expect(normalizePackUrl(
      'https://github.mycompany.com/user/repo/blob/main/fitness/__pack__.yaml'
    )).toBe('https://github.mycompany.com/user/repo/raw/main/fitness');
  });

  it('transforms GitHub Enterprise tree URL to raw URL', () => {
    expect(normalizePackUrl(
      'https://github.mycompany.com/user/repo/tree/main/fitness'
    )).toBe('https://github.mycompany.com/user/repo/raw/main/fitness');
  });

  it('passes through GitHub Enterprise raw URL unchanged', () => {
    expect(normalizePackUrl(
      'https://github.mycompany.com/user/repo/raw/main/fitness'
    )).toBe('https://github.mycompany.com/user/repo/raw/main/fitness');
  });

  // ── unknown / already correct ─────────────────────────────────────────
  it('passes through unknown URLs unchanged', () => {
    expect(normalizePackUrl('https://example.com/some/pack'))
      .toBe('https://example.com/some/pack');
  });

  it('passes through an empty string unchanged', () => {
    expect(normalizePackUrl('')).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail (function not yet defined)**

```bash
bun test --isolate src/cdp/normalizePackUrl.test.ts
```

Expected: all tests fail with "Cannot find module './normalizePackUrl'" or similar.

---

## Task 2: `normalizePackUrl` — implementation

**Files:**
- Create: `src/cdp/normalizePackUrl.ts`

- [ ] **Step 1: Create the implementation**

```typescript
// src/cdp/normalizePackUrl.ts
export function normalizePackUrl(url: string): string {
  // Strip /__pack__.yaml suffix first so provider patterns match the directory URL
  url = url.replace(/\/__pack__\.yaml$/, '');

  // GitHub.com: /tree/ or /blob/ → raw.githubusercontent.com with refs/heads/
  const ghMatch = url.match(
    /^https:\/\/github\.com\/([^/]+\/[^/]+)\/(tree|blob)\/([^/]+)\/(.+)$/
  );
  if (ghMatch) {
    const [, repo, , branch, path] = ghMatch;
    return `https://raw.githubusercontent.com/${repo}/refs/heads/${branch}/${path}`;
  }

  // GitLab (any domain): /-/tree/ or /-/blob/ → /-/raw/ on the same host
  // The /-/ path prefix is unique to GitLab, so this is safe for any domain.
  if (/\/-\/(tree|blob)\//.test(url)) {
    return url.replace(/\/-\/(tree|blob)\//, '/-/raw/');
  }

  // GitHub Enterprise (any non-github.com domain): /blob/ or /tree/ → /raw/
  const gheMatch = url.match(
    /^(https?:\/\/[^/]+\/[^/]+\/[^/]+)\/(blob|tree)\/(.+)$/
  );
  if (gheMatch) {
    const [, base, , rest] = gheMatch;
    return `${base}/raw/${rest}`;
  }

  return url;
}
```

- [ ] **Step 2: Run tests to confirm they all pass**

```bash
bun test --isolate src/cdp/normalizePackUrl.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Run full test suite to check for regressions**

```bash
bun run test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/cdp/normalizePackUrl.ts src/cdp/normalizePackUrl.test.ts
git commit -m "feat: add normalizePackUrl utility for GitHub and GitLab URL normalization"
```

---

## Task 3: Integrate `normalizePackUrl` into `CDPImportDialog`

**Files:**
- Modify: `src/components/cdp/CDPImportDialog.tsx`

- [ ] **Step 1: Add the import and call `normalizePackUrl` before `fetchCDPManifestOnly`**

At the top of `CDPImportDialog.tsx`, add the import after the existing `cdp-import` import:

```typescript
import { normalizePackUrl } from '@/cdp/normalizePackUrl';
```

In `handleImport`, replace this line:
```typescript
const trimmed = url.trim();
```
with:
```typescript
const trimmed = normalizePackUrl(url.trim());
```

The full updated `handleImport` function:
```typescript
async function handleImport() {
  const trimmed = normalizePackUrl(url.trim());
  if (!trimmed) return;
  setImporting(true); setMessage(null);
  try {
    const meta = await fetchCDPManifestOnly(trimmed);
    if (meta.allowShiftOnImport) {
      const today = todayStr();
      setShiftStartDate(today);
      setPendingUrl(trimmed);
      if (meta.targetDate) {
        const duration = dateDiffDays(today, meta.targetDate);
        setShiftDurationDays(duration);
        setShiftTargetDate(meta.targetDate);
        setShiftHasTargetDate(true);
      } else {
        setShiftHasTargetDate(false);
      }
      setStep('date-shift');
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
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 3: Run full test suite**

```bash
bun run test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/cdp/CDPImportDialog.tsx
git commit -m "feat: normalize CDP URLs on import (GitHub, GitLab, GitHub Enterprise)"
```

---

## Task 4: Add sync icon to Sidebar

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

The pack `<NavLink>` must become a sibling of the `<Button>` (not its parent) — nesting a button inside an anchor is invalid HTML.

- [ ] **Step 1: Restructure the pack list items**

In `Sidebar.tsx`, replace the existing pack map block:

```tsx
{sortedPacks.map((pack) => {
  const packXP = calculatePackXP(pack.id, chores, completions);
  return (
    <NavLink key={pack.id} to={`/packs/${pack.id}`} onClick={onClose} className={NAV_LINK_CLASS}>
      <span className="flex items-center justify-between gap-2">
        <span className="truncate">{pack.manifest.title}</span>
        {packXP > 0 && <span className="shrink-0 text-xs font-normal text-amber-600">{packXP.toLocaleString()} XP</span>}
      </span>
    </NavLink>
  );
})}
```

with:

```tsx
{sortedPacks.map((pack) => {
  const packXP = calculatePackXP(pack.id, chores, completions);
  return (
    <div key={pack.id} className="flex items-center gap-1">
      <NavLink
        to={`/packs/${pack.id}`}
        onClick={onClose}
        className={({ isActive }) => `${NAV_LINK_CLASS({ isActive })} flex-1`}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="truncate">{pack.manifest.title}</span>
          {packXP > 0 && <span className="shrink-0 text-xs font-normal text-amber-600">{packXP.toLocaleString()} XP</span>}
        </span>
      </NavLink>
      {pack.sourceUrl && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowCDPDialog(true)}
          title="Update imported pack"
          aria-label="Update imported pack"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          ↻
        </Button>
      )}
    </div>
  );
})}
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 3: Run full test suite**

```bash
bun run test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat: show sync icon next to imported packs in sidebar"
```

---

## Task 5: Add sync icon to PackDashboard

**Files:**
- Modify: `src/components/packs/PackDashboard.tsx`

- [ ] **Step 1: Add `CDPImportDialog` import**

Add to the import block at the top of `PackDashboard.tsx`:

```typescript
import { CDPImportDialog } from '@/components/cdp/CDPImportDialog';
```

- [ ] **Step 2: Add `showCDPDialog` state**

After the existing `useState` declarations (around line 78), add:

```typescript
const [showCDPDialog, setShowCDPDialog] = useState(false);
```

- [ ] **Step 3: Add the sync icon button next to the title**

In the title row (the `else` branch of `isRenaming`, starting around line 144), add the `↻` button after the existing ✏️ rename button:

```tsx
<>
  <h1 className="text-2xl font-bold text-foreground">{pack.manifest.title}</h1>
  <Button
    onClick={() => { setRenameValue(pack.manifest.title); setIsRenaming(true); }}
    title="Rename pack"
    variant="ghost"
    size="sm"
    className="text-muted-foreground hover:text-foreground"
  >
    ✏️
  </Button>
  {pack.sourceUrl && (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setShowCDPDialog(true)}
      title="Update imported pack"
      aria-label="Update imported pack"
      className="text-muted-foreground hover:text-foreground"
    >
      ↻
    </Button>
  )}
  <span className="rounded-full bg-amber-100 dark:bg-amber-900/30 px-3 py-1 text-sm font-semibold text-amber-800 dark:text-amber-300">
    {packXP.toLocaleString()} XP
  </span>
</>
```

- [ ] **Step 4: Render `CDPImportDialog` at the bottom of the component**

Just before the final closing `</div>` of the return statement (after the existing `showDeletionDialog` block), add:

```tsx
{showCDPDialog && <CDPImportDialog onClose={() => setShowCDPDialog(false)} />}
```

- [ ] **Step 5: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 6: Run full test suite**

```bash
bun run test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/packs/PackDashboard.tsx
git commit -m "feat: show sync icon on pack dashboard for imported packs"
```
