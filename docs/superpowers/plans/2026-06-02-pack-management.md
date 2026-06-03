# Pack Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add vertical sidebar nav with pack list and creation, `/packs/:packId` filtered views with inline rename, and client-side CDP ZIP export.

**Architecture:** Responsive sidebar (fixed 200px on desktop, hamburger drawer on mobile) replaces the horizontal NavBar. `PackDashboard` wraps `Dashboard` with pack-filtered chores and a header for inline rename and CDP download. `buildCDPZip` generates ZIP bytes using `fflate` entirely in the browser.

**Tech Stack:** React 19, Zustand 5, React Router v7, `fflate`, `js-yaml`, Tailwind CSS v4

---

### Task 1: slugifyPackId helper

**Files:**
- Create: `src/cdp/packId.ts`
- Create: `src/cdp/packId.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/cdp/packId.test.ts
import { describe, expect, test } from 'bun:test';
import { slugifyPackId } from './packId';

describe('slugifyPackId', () => {
  test('lowercases and hyphenates spaces', () => {
    expect(slugifyPackId('Morning Routines', [])).toBe('morning-routines');
  });

  test('returns base ID when no collision', () => {
    expect(slugifyPackId('My Pack', ['other-pack'])).toBe('my-pack');
  });

  test('appends -2 on first collision', () => {
    expect(slugifyPackId('Morning Routines', ['morning-routines'])).toBe('morning-routines-2');
  });

  test('increments suffix until unique', () => {
    expect(
      slugifyPackId('Morning Routines', ['morning-routines', 'morning-routines-2'])
    ).toBe('morning-routines-3');
  });

  test('falls back to "pack" for symbol-only names', () => {
    expect(slugifyPackId('!!!', [])).toBe('pack');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test --isolate src/cdp/packId.test.ts
```

Expected: FAIL — `slugifyPackId` is not defined (module does not exist yet)

- [ ] **Step 3: Implement slugifyPackId**

```ts
// src/cdp/packId.ts
import { titleToFilename } from './filename';

export function slugifyPackId(name: string, existingIds: string[]): string {
  const base = titleToFilename(name) || 'pack';
  if (!existingIds.includes(base)) return base;
  let i = 2;
  while (existingIds.includes(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test --isolate src/cdp/packId.test.ts
```

Expected: 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/cdp/packId.ts src/cdp/packId.test.ts
git commit -m "feat: add slugifyPackId helper for collision-safe pack ID generation"
```

---

### Task 2: Store actions addPack + renamePack

**Files:**
- Modify: `src/store/index.ts`
- Create: `src/store/packActions.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/store/packActions.test.ts
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, test } from 'bun:test';
import { useAppStore } from './index';

describe('addPack', () => {
  beforeAll(async () => {
    await useAppStore.getState().init();
  });

  test('creates pack with slugified ID and adds it to store', async () => {
    const packId = await useAppStore.getState().addPack('Evening Routines');
    expect(packId).toBe('evening-routines');
    const pack = useAppStore.getState().packs.find((p) => p.id === 'evening-routines');
    expect(pack).toBeDefined();
    expect(pack?.manifest.title).toBe('Evening Routines');
    expect(pack?.isPersonal).toBe(false);
  });

  test('appends numeric suffix on ID collision', async () => {
    await useAppStore.getState().addPack('Clash Pack');
    const id2 = await useAppStore.getState().addPack('Clash Pack');
    expect(id2).toBe('clash-pack-2');
    expect(
      useAppStore.getState().packs.filter((p) => p.id.startsWith('clash-pack'))
    ).toHaveLength(2);
  });
});

describe('renamePack', () => {
  beforeAll(async () => {
    await useAppStore.getState().init();
  });

  test('updates manifest.title in store', async () => {
    await useAppStore.getState().addPack('Old Name');
    await useAppStore.getState().renamePack('old-name', 'New Name');
    const pack = useAppStore.getState().packs.find((p) => p.id === 'old-name');
    expect(pack?.manifest.title).toBe('New Name');
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
bun test --isolate src/store/packActions.test.ts
```

Expected: FAIL — `addPack is not a function`

- [ ] **Step 3: Add addPack and renamePack to the AppState interface in src/store/index.ts**

Add import at the top of the file (alongside existing imports):
```ts
import { slugifyPackId } from '@/cdp/packId';
```

Add to the `AppState` interface after `updateCDP`:
```ts
  addPack: (name: string) => Promise<string>;
  renamePack: (packId: string, newTitle: string) => Promise<void>;
```

- [ ] **Step 4: Implement both actions inside the create() call, after updateCDP**

```ts
  addPack: async (name) => {
    const { db, packs } = get();
    if (!db) throw new Error('DB not initialised');

    const packId = slugifyPackId(name, packs.map((p) => p.id));
    const now = new Date().toISOString();
    const newPack: Pack = {
      id: packId,
      manifest: { title: name },
      isPersonal: false,
      importedAt: now,
      updatedAt: now,
    };

    await putPack(db, newPack);
    set((state) => ({ packs: [...state.packs, newPack] }));
    return packId;
  },

  renamePack: async (packId, newTitle) => {
    const { db, packs } = get();
    if (!db) throw new Error('DB not initialised');

    const pack = packs.find((p) => p.id === packId);
    if (!pack) throw new Error(`Pack '${packId}' not found`);
    const updated: Pack = {
      ...pack,
      manifest: { ...pack.manifest, title: newTitle },
      updatedAt: new Date().toISOString(),
    };

    await putPack(db, updated);
    set((state) => ({
      packs: state.packs.map((p) => (p.id === packId ? updated : p)),
    }));
  },
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
bun test --isolate src/store/packActions.test.ts
```

Expected: 3 tests pass

- [ ] **Step 6: Run full unit suite**

```bash
bun test --isolate src/
```

Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/store/index.ts src/store/packActions.test.ts
git commit -m "feat: add addPack and renamePack store actions"
```

---

### Task 3: CDP export with fflate

**Files:**
- Modify: `package.json` (fflate added by bun add)
- Create: `src/cdp/cdp-export.ts`
- Create: `src/cdp/cdp-export.test.ts`

- [ ] **Step 1: Install fflate**

```bash
bun add fflate
```

Expected: fflate installed, `package.json` and `bun.lock` updated (exit 0)

- [ ] **Step 2: Write the failing tests**

```ts
// src/cdp/cdp-export.test.ts
import { describe, expect, test } from 'bun:test';
import { unzipSync, strFromU8 } from 'fflate';
import jsYaml from 'js-yaml';
import type { Pack, Chore } from '@/types';
import { buildCDPZip } from './cdp-export';

const PACK: Pack = {
  id: 'morning-routines',
  manifest: { title: 'Morning Routines' },
  isPersonal: false,
  importedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const ACTIVE_CHORE: Chore = {
  key: 'morning-routines/brush-teeth',
  choreId: 'brush-teeth',
  packId: 'morning-routines',
  title: 'Brush Teeth',
  xpSize: 'XXS',
  recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '22:00' },
  repeatable: false,
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const INACTIVE_CHORE: Chore = {
  ...ACTIVE_CHORE,
  choreId: 'archived',
  key: 'morning-routines/archived',
  active: false,
};

describe('buildCDPZip', () => {
  test('returns a Uint8Array', () => {
    expect(buildCDPZip(PACK, [ACTIVE_CHORE])).toBeInstanceOf(Uint8Array);
  });

  test('__pack__.yaml contains title and chores list', () => {
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE]));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(manifest.title).toBe('Morning Routines');
    expect(manifest.chores).toEqual(['brush-teeth.yaml']);
  });

  test('per-chore YAML contains required fields', () => {
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE]));
    const chore = jsYaml.load(strFromU8(files['morning-routines/brush-teeth.yaml'])) as Record<string, unknown>;
    expect(chore.title).toBe('Brush Teeth');
    expect(chore.xpSize).toBe('XXS');
    expect(chore.frequency).toBe('daily');
    expect(chore.interval).toBe(1);
    expect(chore.windowStartTime).toBe('22:00');
    expect(chore.repeatable).toBe(false);
  });

  test('excludes inactive chores from zip and chores list', () => {
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE, INACTIVE_CHORE]));
    expect(files['morning-routines/archived.yaml']).toBeUndefined();
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect((manifest.chores as string[]).length).toBe(1);
  });

  test('omits optional pack manifest fields when absent', () => {
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE]));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(manifest.author).toBeUndefined();
    expect(manifest.license).toBeUndefined();
    expect(manifest.description).toBeUndefined();
  });

  test('includes optional pack manifest fields when present', () => {
    const packWithExtras: Pack = {
      ...PACK,
      manifest: { ...PACK.manifest, author: 'Alice', license: 'MIT' },
    };
    const files = unzipSync(buildCDPZip(packWithExtras, [ACTIVE_CHORE]));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(manifest.author).toBe('Alice');
    expect(manifest.license).toBe('MIT');
  });
});
```

- [ ] **Step 3: Run to verify tests fail**

```bash
bun test --isolate src/cdp/cdp-export.test.ts
```

Expected: FAIL — `buildCDPZip` is not defined

- [ ] **Step 4: Implement buildCDPZip**

```ts
// src/cdp/cdp-export.ts
import { zipSync, strToU8 } from 'fflate';
import jsYaml from 'js-yaml';
import type { Pack, Chore } from '@/types';

export function buildCDPZip(pack: Pack, chores: Chore[]): Uint8Array {
  const active = chores.filter((c) => c.active);
  const choreFilenames = active.map((c) => `${c.choreId}.yaml`);

  const files: Record<string, Uint8Array> = {
    [`${pack.id}/__pack__.yaml`]: strToU8(buildPackYaml(pack, choreFilenames)),
  };
  for (const chore of active) {
    files[`${pack.id}/${chore.choreId}.yaml`] = strToU8(buildChoreYaml(chore));
  }

  return zipSync(files);
}

function buildPackYaml(pack: Pack, choreFilenames: string[]): string {
  const data: Record<string, unknown> = { title: pack.manifest.title };
  if (pack.manifest.author) data.author = pack.manifest.author;
  if (pack.manifest.license) data.license = pack.manifest.license;
  if (pack.manifest.description) data.description = pack.manifest.description;
  data.chores = choreFilenames;
  return jsYaml.dump(data);
}

function buildChoreYaml(chore: Chore): string {
  const data: Record<string, unknown> = {
    title: chore.title,
    xpSize: chore.xpSize,
    frequency: chore.recurrence.frequency,
    interval: chore.recurrence.interval,
    windowStartTime: chore.recurrence.windowStartTime,
    repeatable: chore.repeatable,
  };
  if (chore.description) data.description = chore.description;
  return jsYaml.dump(data);
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
bun test --isolate src/cdp/cdp-export.test.ts
```

Expected: 6 tests pass

- [ ] **Step 6: Run full unit suite**

```bash
bun test --isolate src/
```

Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add package.json bun.lock src/cdp/cdp-export.ts src/cdp/cdp-export.test.ts
git commit -m "feat: add buildCDPZip for client-side CDP ZIP export using fflate"
```

---

### Task 4: Sidebar + responsive App layout

**Files:**
- Create: `src/components/layout/Sidebar.tsx`
- Modify: `src/App.tsx`
- Delete: `src/components/layout/NavBar.tsx`

- [ ] **Step 1: Create Sidebar.tsx**

```tsx
// src/components/layout/Sidebar.tsx
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

      <div className="mb-4 flex-1">
        <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Chores
        </p>
        <NavLink
          to="/"
          end
          onClick={onClose}
          className={({ isActive }) =>
            `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
            }`
          }
        >
          Dashboard
        </NavLink>
        {packs.map((pack) => (
          <NavLink
            key={pack.id}
            to={`/packs/${pack.id}`}
            onClick={onClose}
            className={({ isActive }) =>
              `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              }`
            }
          >
            {pack.manifest.title}
          </NavLink>
        ))}
        <button
          onClick={() => { onNewPack(); onClose(); }}
          className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50"
        >
          + New Pack
        </button>
      </div>

      <div className="mb-4">
        <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Account
        </p>
        <NavLink
          to="/profile"
          onClick={onClose}
          className={({ isActive }) =>
            `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
            }`
          }
        >
          Profile
        </NavLink>
      </div>

      <div className="space-y-2 border-t border-gray-200 pt-4">
        <SyncButton />
        <button
          onClick={() => setShowCDPDialog(true)}
          disabled={!isOnline}
          title={!isOnline ? 'Offline — CDP import unavailable' : 'Import Chore Pack'}
          className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Import Pack
        </button>
      </div>

      {showCDPDialog && <CDPImportDialog onClose={() => setShowCDPDialog(false)} />}
    </nav>
  );
}
```

- [ ] **Step 2: Replace App.tsx with sidebar layout**

Replace the entire content of `src/App.tsx`:

```tsx
// src/App.tsx
import { useEffect, useRef, useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { useAppStore } from '@/store';
import Sidebar from '@/components/layout/Sidebar';
import Dashboard from '@/components/dashboard/Dashboard';
import { ProfilePage } from '@/components/profile/ProfilePage';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { performSync } from '@/sync/sync';

export default function App() {
  const init = useAppStore((s) => s.init);
  const loaded = useAppStore((s) => s.loaded);
  const isOnline = useOnlineStatus();
  const wasOnlineRef = useRef(isOnline);
  const syncState = useAppStore((s) => s.syncState);
  const updateSyncState = useAppStore((s) => s.updateSyncState);
  const db = useAppStore((s) => s.db);

  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { init(); }, [init]);

  useEffect(() => {
    const wasOnline = wasOnlineRef.current;
    wasOnlineRef.current = isOnline;
    if (!wasOnline && isOnline && syncState?.pendingSync && db) {
      performSync(db, syncState, () => {}).then((updated) => {
        updateSyncState(updated);
      }).catch(() => {});
    }
  }, [isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-48 bg-white border-r border-gray-200 transition-transform md:static md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar
          onClose={() => setSidebarOpen(false)}
          onNewPack={() => {}}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-xl text-gray-600"
            aria-label="Open menu"
          >
            ☰
          </button>
          <Link to="/" className="font-bold text-gray-900">
            Tasks Harmony
          </Link>
        </header>

        <main className="flex-1 px-4">
          <div className="mx-auto max-w-2xl">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Delete NavBar.tsx**

```bash
git rm src/components/layout/NavBar.tsx
```

- [ ] **Step 4: Verify no TypeScript errors**

```bash
bun run typecheck
```

Expected: exit 0, no errors

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/App.tsx
git commit -m "feat: replace horizontal NavBar with responsive vertical Sidebar"
```

---

### Task 5: NewPackDialog

**Files:**
- Create: `src/components/packs/NewPackDialog.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create NewPackDialog.tsx**

```tsx
// src/components/packs/NewPackDialog.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store';

export default function NewPackDialog({ onClose }: { onClose: () => void }) {
  const addPack = useAppStore((s) => s.addPack);
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const packId = await addPack(name.trim());
      onClose();
      navigate(`/packs/${packId}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">New Pack</h2>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="pack-name">
            Pack name <span className="text-red-500">*</span>
          </label>
          <input
            id="pack-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') onClose();
            }}
            autoFocus
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            placeholder="e.g. Morning Routines"
          />
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!name.trim() || submitting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire NewPackDialog into App.tsx**

In `src/App.tsx`, make these three changes:

1. Add import after existing imports:
```tsx
import NewPackDialog from '@/components/packs/NewPackDialog';
```

2. Add state alongside the existing `sidebarOpen` state:
```tsx
const [showNewPackDialog, setShowNewPackDialog] = useState(false);
```

3. Replace the `onNewPack={() => {}}` prop with:
```tsx
onNewPack={() => setShowNewPackDialog(true)}
```

4. Before the final closing `</div>` of the returned JSX, add:
```tsx
{showNewPackDialog && (
  <NewPackDialog onClose={() => setShowNewPackDialog(false)} />
)}
```

- [ ] **Step 3: Verify no TypeScript errors**

```bash
bun run typecheck
```

Expected: exit 0, no errors

- [ ] **Step 4: Commit**

```bash
git add src/components/packs/NewPackDialog.tsx src/App.tsx
git commit -m "feat: add NewPackDialog and wire into Sidebar + New Pack button"
```

---

### Task 6: PackDashboard + route + Dashboard chores prop

**Files:**
- Create: `src/components/packs/PackDashboard.tsx`
- Modify: `src/components/dashboard/Dashboard.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add optional chores and currentPackId props to Dashboard.tsx**

In `src/components/dashboard/Dashboard.tsx`, make these changes:

1. Add a `DashboardProps` interface and update the function signature. Insert before the `export default function Dashboard()` line:

```tsx
interface DashboardProps {
  chores?: Chore[];
  currentPackId?: string;
}
```

2. Change the function signature and first store selector:

Replace:
```tsx
export default function Dashboard() {
  const chores = useAppStore((s) => s.chores);
```

With:
```tsx
export default function Dashboard({ chores: choresProp, currentPackId }: DashboardProps = {}) {
  const storeChores = useAppStore((s) => s.chores);
  const chores = choresProp ?? storeChores;
```

3. Update the `ChoreFormModal` default pack reference:

Replace:
```tsx
<ChoreFormModal
  packId="personal"
  onClose={() => setShowNewChoreModal(false)}
/>
```

With:
```tsx
<ChoreFormModal
  packId={currentPackId ?? 'personal'}
  onClose={() => setShowNewChoreModal(false)}
/>
```

- [ ] **Step 2: Create PackDashboard.tsx**

```tsx
// src/components/packs/PackDashboard.tsx
import { useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useAppStore } from '@/store';
import Dashboard from '@/components/dashboard/Dashboard';
import { buildCDPZip } from '@/cdp/cdp-export';

export default function PackDashboard() {
  const { packId } = useParams<{ packId: string }>();
  const packs = useAppStore((s) => s.packs);
  const chores = useAppStore((s) => s.chores);
  const renamePack = useAppStore((s) => s.renamePack);

  const pack = packs.find((p) => p.id === packId);
  const packChores = chores.filter((c) => c.packId === packId);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  if (!pack) return <Navigate to="/" replace />;

  async function handleRename() {
    if (!renameValue.trim() || !pack) return;
    await renamePack(pack.id, renameValue.trim());
    setIsRenaming(false);
  }

  function handleExport() {
    if (!pack) return;
    const zipBytes = buildCDPZip(pack, packChores);
    const blob = new Blob([zipBytes], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pack.id}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 pb-2 pt-4">
        {isRenaming ? (
          <>
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') setIsRenaming(false);
              }}
              autoFocus
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xl font-bold focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <button
              onClick={handleRename}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Save
            </button>
            <button
              onClick={() => setIsRenaming(false)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900">{pack.manifest.title}</h1>
            <button
              onClick={() => { setRenameValue(pack.manifest.title); setIsRenaming(true); }}
              title="Rename pack"
              className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              ✏️
            </button>
          </>
        )}
        <button
          onClick={handleExport}
          className="ml-auto rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          Download as CDP
        </button>
      </div>

      <Dashboard chores={packChores} currentPackId={pack.id} />
    </div>
  );
}
```

- [ ] **Step 3: Add /packs/:packId route to App.tsx**

In `src/App.tsx`:

1. Add import:
```tsx
import PackDashboard from '@/components/packs/PackDashboard';
```

2. Add route inside `<Routes>` (between the `/` and `/profile` routes):
```tsx
<Route path="/packs/:packId" element={<PackDashboard />} />
```

- [ ] **Step 4: Verify no TypeScript errors**

```bash
bun run typecheck
```

Expected: exit 0, no errors

- [ ] **Step 5: Run full unit suite**

```bash
bun test --isolate src/
```

Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/components/packs/PackDashboard.tsx src/components/dashboard/Dashboard.tsx src/App.tsx
git commit -m "feat: add PackDashboard with rename and CDP export, add /packs/:packId route"
```

---

### Task 7: Pack label on ChoreCard

**Files:**
- Modify: `src/components/dashboard/ChoreCard.tsx`
- Modify: `src/components/dashboard/Dashboard.tsx`

- [ ] **Step 1: Add packTitle prop to ChoreCard**

In `src/components/dashboard/ChoreCard.tsx`:

1. Add `packTitle?: string` to the `Props` interface:

Replace:
```tsx
interface Props {
  chore: Chore;
  completions: Completion[];
  xpSettings: XPSettings[];
  profile: UserProfile | null;
}
```

With:
```tsx
interface Props {
  chore: Chore;
  completions: Completion[];
  xpSettings: XPSettings[];
  profile: UserProfile | null;
  packTitle?: string;
}
```

2. Add `packTitle` to the destructured props:

Replace:
```tsx
export default function ChoreCard({ chore, completions, xpSettings, profile }: Props) {
```

With:
```tsx
export default function ChoreCard({ chore, completions, xpSettings, profile, packTitle }: Props) {
```

3. Render the pack label. After the closing `</div>` of the `mb-1` flex div (the one containing `<h3>` and `<StatusBadge />`), and before the `{chore.description && ...}` line, add:

```tsx
{packTitle && (
  <p className="text-xs text-gray-400">{packTitle}</p>
)}
```

- [ ] **Step 2: Look up and pass packTitle from Dashboard**

In `src/components/dashboard/Dashboard.tsx`:

1. Add `packs` selector after the existing store selectors:
```tsx
const packs = useAppStore((s) => s.packs);
```

2. Pass `packTitle` to each `<ChoreCard>`:

Replace:
```tsx
{sectionChores.map((chore) => (
  <ChoreCard
    key={chore.key}
    chore={chore}
    completions={completions.filter((c) => c.choreKey === chore.key)}
    xpSettings={xpSettings}
    profile={profile}
  />
))}
```

With:
```tsx
{sectionChores.map((chore) => (
  <ChoreCard
    key={chore.key}
    chore={chore}
    completions={completions.filter((c) => c.choreKey === chore.key)}
    xpSettings={xpSettings}
    profile={profile}
    packTitle={packs.find((p) => p.id === chore.packId)?.manifest.title}
  />
))}
```

- [ ] **Step 3: Verify no TypeScript errors**

```bash
bun run typecheck
```

Expected: exit 0, no errors

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/ChoreCard.tsx src/components/dashboard/Dashboard.tsx
git commit -m "feat: show pack title label on each ChoreCard"
```

---

### Task 8: Chore form pack field

**Files:**
- Modify: `src/components/chores/ChoreFormModal.tsx`

- [ ] **Step 1: Add packs selector and selectedPackId state**

In `src/components/chores/ChoreFormModal.tsx`:

1. Add `packs` from the store. After the `saveQuestions` line in the store selectors:
```tsx
const packs = useAppStore((s) => s.packs);
```

2. Add `selectedPackId` state. After the `[submitting, setSubmitting]` state line:
```tsx
const [selectedPackId, setSelectedPackId] = useState(packId);
```

- [ ] **Step 2: Add the pack field to the form JSX**

Insert between the description field's closing `</div>` and the XP Size field's opening `<div>`:

```tsx
<div>
  <label className="mb-1 block text-sm font-medium text-gray-700">Pack</label>
  {isEdit ? (
    <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
      {packs.find((p) => p.id === chore?.packId)?.manifest.title ?? chore?.packId}
    </p>
  ) : (
    <select
      value={selectedPackId}
      onChange={(e) => setSelectedPackId(e.target.value)}
      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
    >
      {packs.map((p) => (
        <option key={p.id} value={p.id}>{p.manifest.title}</option>
      ))}
    </select>
  )}
</div>
```

- [ ] **Step 3: Use selectedPackId in addChore call**

In the `handleSubmit` function, replace the `packId` reference inside the `addChore` call:

Replace:
```tsx
await addChore({
  packId,
```

With:
```tsx
await addChore({
  packId: selectedPackId,
```

- [ ] **Step 4: Verify no TypeScript errors**

```bash
bun run typecheck
```

Expected: exit 0, no errors

- [ ] **Step 5: Run full unit suite**

```bash
bun test --isolate src/
```

Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/components/chores/ChoreFormModal.tsx
git commit -m "feat: add pack selector to ChoreFormModal (create mode) and readonly display (edit mode)"
```
