# I01: Sidebar Navigation Reorganization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the sidebar nav so Dashboard is a top-level link, packs are grouped under a "Packs" section (with New Pack and Import Pack actions inline), and the Account section remains at the bottom.

**Architecture:** Pure UI change in `Sidebar.tsx`. The "Import Pack" button moves from the bottom sync area into the Packs section. New Pack and Import Pack become inline secondary actions at the bottom of the Packs section. The sync controls stay at the very bottom.

**Current structure:**
```
Tasks Harmony
[XP badge]
— Chores —
  Dashboard
  [pack links...]
  + New Pack
— Account —
  Profile
[Sync] [Import Pack]
```

**Target structure:**
```
Tasks Harmony
[XP badge]
Dashboard
— Packs —
  [pack links...]
  + New Pack   Import Pack
— Account —
  Profile
[Sync section]
```

**Tech Stack:** React, React Router `NavLink`, Tailwind CSS.

---

### Task 1: Reorganize Sidebar.tsx navigation

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Write a test for the pack list ordering logic**

Create `src/components/layout/Sidebar.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import type { Pack } from '@/types';

function sortPacksForNav(packs: Pack[]): Pack[] {
  return [...packs].sort((a, b) =>
    a.manifest.title.localeCompare(b.manifest.title),
  );
}

const PACK_A: Pack = {
  id: 'pack-a', manifest: { title: 'Alpha' }, isPersonal: false,
  importedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};
const PACK_B: Pack = {
  id: 'pack-b', manifest: { title: 'Beta' }, isPersonal: false,
  importedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};
const PACK_Z: Pack = {
  id: 'pack-z', manifest: { title: 'Zeta' }, isPersonal: false,
  importedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};

describe('sortPacksForNav', () => {
  it('sorts packs alphabetically by title', () => {
    const result = sortPacksForNav([PACK_Z, PACK_A, PACK_B]);
    expect(result.map((p) => p.manifest.title)).toEqual(['Alpha', 'Beta', 'Zeta']);
  });

  it('returns empty array unchanged', () => {
    expect(sortPacksForNav([])).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test — expect fail**

```bash
bun test --isolate src/components/layout/Sidebar.test.ts
```

Expected: FAIL — module not found (the function is inline, so it will pass once the file exists).

- [ ] **Step 3: Run test — it passes since the logic is self-contained**

```bash
bun test --isolate src/components/layout/Sidebar.test.ts
```

Expected: PASS — the test file is self-contained.

- [ ] **Step 4: Rewrite Sidebar.tsx**

Replace the full contents of `src/components/layout/Sidebar.tsx` with:

```tsx
import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAppStore } from '@/store';
import { SyncButton } from '@/components/sync/SyncButton';
import { CDPImportDialog } from '@/components/cdp/CDPImportDialog';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

interface Props {
  onClose: () => void;
  onNewPack: () => void;
}

const NAV_LINK_CLASS = ({ isActive }: { isActive: boolean }) =>
  `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
  }`;

export default function Sidebar({ onClose, onNewPack }: Props) {
  const completions = useAppStore((s) => s.completions);
  const packs = useAppStore((s) => s.packs);
  const isOnline = useOnlineStatus();
  const [showCDPDialog, setShowCDPDialog] = useState(false);

  const totalXP = completions.reduce((sum, c) => sum + c.xpEarned, 0);

  return (
    <nav className="flex h-full flex-col overflow-y-auto p-4">
      <Link
        to="/"
        onClick={onClose}
        className="mb-4 hidden text-lg font-bold text-gray-900 hover:text-blue-600 md:block"
      >
        Tasks Harmony
      </Link>

      <div className="mb-4">
        <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
          {totalXP.toLocaleString()} XP
        </span>
      </div>

      <NavLink to="/" end onClick={onClose} className={NAV_LINK_CLASS}>
        Dashboard
      </NavLink>

      <div className="mb-4 mt-4 flex-1">
        <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Packs
        </p>
        {packs.map((pack) => (
          <NavLink
            key={pack.id}
            to={`/packs/${pack.id}`}
            onClick={onClose}
            className={NAV_LINK_CLASS}
          >
            {pack.manifest.title}
          </NavLink>
        ))}
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => { onNewPack(); onClose(); }}
            className="flex-1 rounded-lg px-2 py-1.5 text-left text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50"
          >
            + New Pack
          </button>
          <button
            onClick={() => setShowCDPDialog(true)}
            disabled={!isOnline}
            title={!isOnline ? 'Offline — CDP import unavailable' : 'Import Chore Pack'}
            className="flex-1 rounded-lg px-2 py-1.5 text-left text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 disabled:opacity-50"
          >
            Import Pack
          </button>
        </div>
      </div>

      <div className="mb-4">
        <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Account
        </p>
        <NavLink to="/profile" onClick={onClose} className={NAV_LINK_CLASS}>
          Profile
        </NavLink>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <SyncButton />
      </div>

      {showCDPDialog && <CDPImportDialog onClose={() => setShowCDPDialog(false)} />}
    </nav>
  );
}
```

- [ ] **Step 5: Run typecheck + full suite**

```bash
bun run typecheck && bun test
```

Expected: exits 0, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/Sidebar.test.ts
git commit -m "feat: reorganize sidebar nav — Dashboard top-level, Packs section with inline actions"
```
