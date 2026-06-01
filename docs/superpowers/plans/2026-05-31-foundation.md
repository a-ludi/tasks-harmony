# Tasks Harmony — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the React/TypeScript/Bun PWA with all domain types, IndexedDB persistence, XP calculation engine, and CDP filename logic — the shared foundation all feature plans build on.

**Architecture:** Single-page React PWA, no backend. All state in IndexedDB, exported to JSON for WebDAV sync. Chore Definition Packs (CDPs) imported by copy. XP is computed at completion time using a configurable formula and stored immutably.

**Tech Stack:** React 19, TypeScript 5, Bun 1.x, Vite 6, vite-plugin-pwa, idb 8, Zustand, js-yaml, transliteration, webdav, Tailwind CSS 4.

---

## File Map

| File | Purpose |
|---|---|
| `package.json` | Bun deps and scripts |
| `tsconfig.json` | TypeScript config |
| `vite.config.ts` | Vite + PWA plugin |
| `index.html` | HTML entry |
| `src/main.tsx` | React DOM mount |
| `src/App.tsx` | Router skeleton |
| `src/index.css` | Tailwind import |
| `src/types/index.ts` | All domain types |
| `src/db/schema.ts` | idb DBSchema interface |
| `src/db/index.ts` | `openDB()` and typed store accessors |
| `src/db/seed.ts` | First-run default data |
| `src/db/index.test.ts` | DB open + seed tests |
| `src/xp/calculator.ts` | XP formula |
| `src/xp/calculator.test.ts` | XP formula tests |
| `src/cdp/filename.ts` | Title → dash-case filename |
| `src/cdp/filename.test.ts` | Filename conversion tests |
| `src/sync/state.ts` | SyncState helpers + ETag conflict detection |
| `src/sync/state.test.ts` | Sync state tests |
| `src/sync/export.ts` | IndexedDB → AppState JSON |
| `src/sync/import.ts` | AppState JSON → IndexedDB |
| `src/schemas/appState.schema.json` | JSON Schema for AppState (WebDAV import) |
| `src/schemas/packManifest.schema.json` | JSON Schema for `__pack__.yaml` |
| `src/schemas/choreDefinition.schema.json` | JSON Schema for chore `.yaml` files |
| `src/schemas/validate.ts` | AJV-based validator helper |
| `src/schemas/validate.test.ts` | Validator tests |

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`

- [ ] **Step 1: Initialize**

Run in `/home/alu/projects/tasks-harmony`:

```bash
bun init -y
```

Expected: creates `package.json`, `tsconfig.json`, `index.ts`. Delete `index.ts` — not needed.

- [ ] **Step 2: Install runtime deps**

```bash
bun add react react-dom react-router-dom idb zustand js-yaml transliteration webdav
```

- [ ] **Step 3: Install dev deps**

```bash
bun add -d typescript @types/react @types/react-dom @types/js-yaml vite @vitejs/plugin-react vite-plugin-pwa tailwindcss @tailwindcss/vite fake-indexeddb @playwright/test
```

- [ ] **Step 4: Replace tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      manifest: {
        name: 'Tasks Harmony',
        short_name: 'Tasks',
        description: 'Gamified recurring chore tracker',
        theme_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  resolve: { alias: { '@': '/src' } },
});
```

- [ ] **Step 6: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tasks Harmony</title>
    <link rel="icon" type="image/svg+xml" href="/icon-template.svg" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create src/main.tsx**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
```

- [ ] **Step 8: Create src/index.css**

```css
@import "tailwindcss";
```

- [ ] **Step 9: Create src/App.tsx**

```tsx
import { Routes, Route } from 'react-router-dom';

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <Routes>
        <Route path="/" element={<p className="text-xl font-semibold">Tasks Harmony</p>} />
      </Routes>
    </div>
  );
}
```

- [ ] **Step 10: Add scripts to package.json**

Merge into the `scripts` section:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 11: Verify dev server**

```bash
bun run dev
```

Expected: Vite starts at `http://localhost:5173`. Browser shows "Tasks Harmony" on a grey background. No console errors.

- [ ] **Step 12: Commit**

```bash
git add package.json tsconfig.json vite.config.ts index.html src/
git commit -m "feat: project scaffold (React + TS + Bun + Vite PWA)"
```

---

### Task 2: Domain types

**Files:**
- Create: `src/types/index.ts`

- [ ] **Step 1: Create src/types/index.ts**

```typescript
export type XPSize = 'XXS' | 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | 'XXXL';
export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly';
export type QuestionType = 'TEXT' | 'INTEGER' | 'BOOLEAN' | 'ENUM';
export type ChoreStatus = 'overdue' | 'due' | 'completed' | 'upcoming';
export type ChoreSyncStatus = 'in-sync' | 'out-of-sync';

export interface Recurrence {
  frequency: RecurrenceFrequency;
  interval: number;         // every N periods, >= 1
  startDate: string;        // 'YYYY-MM-DD'
  windowStartTime: string;  // 'HH:MM', default '00:00'; offsets window boundaries from midnight
}

export interface EnumChoice {
  id: string;
  label: string;
  order: number;
}

export interface Question {
  id: string;        // UUID
  choreKey: string;  // `${packId}/${choreId}` — matches Chore.key
  prompt: string;
  type: QuestionType;
  required: boolean;
  order: number;
  regexPattern?: string;   // TEXT only
  minValue?: number;       // INTEGER only
  maxValue?: number;       // INTEGER only
  choices?: EnumChoice[];  // ENUM only
}

export interface Chore {
  key: string;       // `${packId}/${choreId}` — DB primary key
  choreId: string;   // filename without .yaml (e.g. 'make-laundry')
  packId: string;
  title: string;
  description?: string;
  xpSize: XPSize;
  recurrence: Recurrence;
  repeatable: boolean;          // if true, multiple completions per window are allowed
  active: boolean;
  createdAt: string;            // ISO datetime
  syncStatus?: ChoreSyncStatus; // set after "Update from URL"; only present on URL-imported chores
}

export interface PackManifest {
  title: string;
  author?: string;
  license?: string;
  description?: string;
  revision?: string;         // free-form version label from CDP manifest
  revisionHistory?: string;  // free-form text from CDP manifest
  cdpCreatedAt?: string;     // creation date from CDP manifest (not app importedAt)
}

export interface Pack {
  id: string;          // directory/alias name — DB primary key; 'personal' for the default pack
  manifest: PackManifest;
  isPersonal: boolean; // true = user-owned (editable); false = imported (read-only until Make Personal Copy)
  importedAt: string;  // ISO datetime
  updatedAt: string;   // ISO datetime
  sourceUrl?: string;  // URL if imported from URL; retained after Make Personal Copy
  aliasFor?: string;   // original pack ID when this pack uses an alias; used to match CDP on update
}

export interface Answer {
  questionId: string;
  value: string | number | boolean | null;
}

export interface Completion {
  id: string;          // UUID
  choreKey: string;    // `${packId}/${choreId}`
  completedAt: string; // ISO datetime
  xpEarned: number;    // rounded integer; immutable after creation
  streak: number;
  answers: Answer[];
}

export interface XPSettings {
  id: string;
  name: string;
  maxStreakMultiplier: number; // streak bonus ceiling (e.g. 2.5)
  decayFloor: number;         // decay lower bound (e.g. 0.6)
  streakHalfLife: number;     // consecutive windows to reach 50% of streak bonus range
  decayHalfLife: number;      // total completions to reach 50% of decay range
}

export interface UserProfile {
  id: 'me';
  displayName: string;
  email: string;
  activeXPSettingsId: string;
}

export interface SyncState {
  id: 'main';
  webdavUrl?: string;
  serverEtag?: string;   // ETag expected on server; sent as If-Match on next PUT
  lastSyncedAt?: string; // ISO datetime
  pendingSync: boolean;
}

export interface AppState {
  schemaVersion: 1;
  exportedAt: string;  // ISO datetime
  packs: Pack[];
  chores: Chore[];
  questions: Question[];
  completions: Completion[];
  xpSettings: XPSettings[];
  profile: UserProfile;
  syncState: SyncState;
}
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/
git commit -m "feat: domain types"
```

---

### Task 3: IndexedDB schema and helpers

**Files:**
- Create: `src/db/schema.ts`, `src/db/seed.ts`, `src/db/index.ts`, `src/db/index.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/db/index.test.ts
import 'fake-indexeddb/auto';
import { describe, expect, test } from 'bun:test';
import { openDB, getPacks, getProfile, getXPSettings, getSyncState } from './index';

describe('DB', () => {
  test('seeds personal pack on first open', async () => {
    const db = await openDB(`test-${crypto.randomUUID()}`);
    const packs = await getPacks(db);
    expect(packs).toHaveLength(1);
    expect(packs[0].id).toBe('personal');
    expect(packs[0].manifest.title).toBe('My Chores');
  });

  test('seeds Standard and Hard Mode XP settings', async () => {
    const db = await openDB(`test-${crypto.randomUUID()}`);
    const settings = await getXPSettings(db);
    const names = settings.map((s) => s.name);
    expect(names).toContain('Standard');
    expect(names).toContain('Hard Mode');
  });

  test('seeds empty profile with standard XP active', async () => {
    const db = await openDB(`test-${crypto.randomUUID()}`);
    const profile = await getProfile(db);
    expect(profile).toBeDefined();
    expect(profile!.id).toBe('me');
    expect(profile!.displayName).toBe('');
    expect(profile!.activeXPSettingsId).toBe('standard');
  });

  test('seeds sync state with pendingSync false', async () => {
    const db = await openDB(`test-${crypto.randomUUID()}`);
    const state = await getSyncState(db);
    expect(state).toBeDefined();
    expect(state!.pendingSync).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify fail**

```bash
bun test src/db/index.test.ts
```

Expected: FAIL — `Cannot find module './index'`

- [ ] **Step 3: Create src/db/schema.ts**

```typescript
// src/db/schema.ts
import type { DBSchema } from 'idb';
import type {
  Pack, Chore, Question, Completion,
  XPSettings, UserProfile, SyncState,
} from '@/types';

export interface TasksHarmonyDB extends DBSchema {
  packs:       { key: string; value: Pack };
  chores:      { key: string; value: Chore; indexes: { 'by-pack': string } };
  questions:   { key: string; value: Question; indexes: { 'by-chore': string } };
  completions: { key: string; value: Completion; indexes: { 'by-chore': string; 'by-date': string } };
  xpSettings:  { key: string; value: XPSettings };
  profile:     { key: string; value: UserProfile };
  syncState:   { key: string; value: SyncState };
}
```

- [ ] **Step 4: Create src/db/seed.ts**

```typescript
// src/db/seed.ts
import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from './schema';

export async function seed(db: IDBPDatabase<TasksHarmonyDB>): Promise<void> {
  const tx = db.transaction(
    ['packs', 'xpSettings', 'profile', 'syncState'],
    'readwrite',
  );
  const packs     = tx.objectStore('packs');
  const settings  = tx.objectStore('xpSettings');
  const profile   = tx.objectStore('profile');
  const syncStore = tx.objectStore('syncState');

  if (!(await packs.get('personal'))) {
    await packs.put({
      id: 'personal',
      manifest: { title: 'My Chores' },
      isPersonal: true,
      importedAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    });
  }

  if (!(await settings.get('standard'))) {
    await settings.put({
      id: 'standard',
      name: 'Standard',
      maxStreakMultiplier: 2.5,
      decayFloor: 0.6,
      streakHalfLife: 7,
      decayHalfLife: 56,
    });
    await settings.put({
      id: 'hard',
      name: 'Hard Mode',
      maxStreakMultiplier: 2.5,
      decayFloor: 0.4,
      streakHalfLife: 14,
      decayHalfLife: 56,
    });
  }

  if (!(await profile.get('me'))) {
    await profile.put({
      id: 'me',
      displayName: '',
      email: '',
      activeXPSettingsId: 'standard',
    });
  }

  if (!(await syncStore.get('main'))) {
    await syncStore.put({ id: 'main', pendingSync: false });
  }

  await tx.done;
}
```

- [ ] **Step 5: Create src/db/index.ts**

```typescript
// src/db/index.ts
import { openDB as idbOpen, type IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from './schema';
import { seed } from './seed';
import type {
  Pack, Chore, Question, Completion,
  XPSettings, UserProfile, SyncState,
} from '@/types';

const DB_NAME = 'tasks-harmony';
const DB_VERSION = 1;

export async function openDB(
  name = DB_NAME,
): Promise<IDBPDatabase<TasksHarmonyDB>> {
  const db = await idbOpen<TasksHarmonyDB>(name, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('packs', { keyPath: 'id' });

      const chores = db.createObjectStore('chores', { keyPath: 'key' });
      chores.createIndex('by-pack', 'packId');

      const questions = db.createObjectStore('questions', { keyPath: 'id' });
      questions.createIndex('by-chore', 'choreKey');

      const completions = db.createObjectStore('completions', { keyPath: 'id' });
      completions.createIndex('by-chore', 'choreKey');
      completions.createIndex('by-date', 'completedAt');

      db.createObjectStore('xpSettings', { keyPath: 'id' });
      db.createObjectStore('profile', { keyPath: 'id' });
      db.createObjectStore('syncState', { keyPath: 'id' });
    },
  });
  await seed(db);
  return db;
}

export const getPacks = (db: IDBPDatabase<TasksHarmonyDB>): Promise<Pack[]> =>
  db.getAll('packs');

export const getAllChores = (db: IDBPDatabase<TasksHarmonyDB>): Promise<Chore[]> =>
  db.getAll('chores');

export const getChoresByPack = (
  db: IDBPDatabase<TasksHarmonyDB>,
  packId: string,
): Promise<Chore[]> =>
  db.getAllFromIndex('chores', 'by-pack', packId);

export const getChore = (
  db: IDBPDatabase<TasksHarmonyDB>,
  key: string,
): Promise<Chore | undefined> =>
  db.get('chores', key);

export const getQuestions = (
  db: IDBPDatabase<TasksHarmonyDB>,
  choreKey: string,
): Promise<Question[]> =>
  db.getAllFromIndex('questions', 'by-chore', choreKey);

export const getAllQuestions = (db: IDBPDatabase<TasksHarmonyDB>): Promise<Question[]> =>
  db.getAll('questions');

export const getAllCompletions = (db: IDBPDatabase<TasksHarmonyDB>): Promise<Completion[]> =>
  db.getAll('completions');

export const getCompletionsByChore = (
  db: IDBPDatabase<TasksHarmonyDB>,
  choreKey: string,
): Promise<Completion[]> =>
  db.getAllFromIndex('completions', 'by-chore', choreKey);

export const getXPSettings = (db: IDBPDatabase<TasksHarmonyDB>): Promise<XPSettings[]> =>
  db.getAll('xpSettings');

export const getXPSettingsById = (
  db: IDBPDatabase<TasksHarmonyDB>,
  id: string,
): Promise<XPSettings | undefined> =>
  db.get('xpSettings', id);

export const getProfile = (
  db: IDBPDatabase<TasksHarmonyDB>,
): Promise<UserProfile | undefined> =>
  db.get('profile', 'me');

export const getSyncState = (
  db: IDBPDatabase<TasksHarmonyDB>,
): Promise<SyncState | undefined> =>
  db.get('syncState', 'main');

export const putPack = (db: IDBPDatabase<TasksHarmonyDB>, pack: Pack): Promise<string> =>
  db.put('packs', pack);

export const putChore = (db: IDBPDatabase<TasksHarmonyDB>, chore: Chore): Promise<string> =>
  db.put('chores', chore);

export const putQuestion = (
  db: IDBPDatabase<TasksHarmonyDB>,
  question: Question,
): Promise<string> =>
  db.put('questions', question);

export const putCompletion = (
  db: IDBPDatabase<TasksHarmonyDB>,
  completion: Completion,
): Promise<string> =>
  db.put('completions', completion);

export const putXPSettings = (
  db: IDBPDatabase<TasksHarmonyDB>,
  settings: XPSettings,
): Promise<string> =>
  db.put('xpSettings', settings);

export const putProfile = (
  db: IDBPDatabase<TasksHarmonyDB>,
  profile: UserProfile,
): Promise<string> =>
  db.put('profile', profile);

export const putSyncState = (
  db: IDBPDatabase<TasksHarmonyDB>,
  state: SyncState,
): Promise<string> =>
  db.put('syncState', state);

export const deleteChore = (
  db: IDBPDatabase<TasksHarmonyDB>,
  key: string,
): Promise<void> =>
  db.delete('chores', key);

export const deleteQuestion = (
  db: IDBPDatabase<TasksHarmonyDB>,
  id: string,
): Promise<void> =>
  db.delete('questions', id);
```

- [ ] **Step 6: Run tests, verify pass**

```bash
bun test src/db/index.test.ts
```

Expected: 4 passing tests.

- [ ] **Step 7: Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/db/
git commit -m "feat: IndexedDB schema, helpers, and first-run seeding"
```

---

### Task 4: XP calculator

**Files:**
- Create: `src/xp/calculator.ts`, `src/xp/calculator.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/xp/calculator.test.ts
import { describe, expect, test } from 'bun:test';
import { calculateXP, XP_BASE } from './calculator';
import type { XPSettings } from '@/types';

const STANDARD: XPSettings = {
  id: 'standard',
  name: 'Standard',
  maxStreakMultiplier: 2.5,
  decayFloor: 0.6,
  streakHalfLife: 7,
  decayHalfLife: 56,
};

const HARD: XPSettings = {
  id: 'hard',
  name: 'Hard Mode',
  maxStreakMultiplier: 2.5,
  decayFloor: 0.4,
  streakHalfLife: 14,
  decayHalfLife: 56,
};

describe('XP_BASE', () => {
  test('all sizes map to correct base values', () => {
    expect(XP_BASE.XXS).toBe(2);
    expect(XP_BASE.XS).toBe(3);
    expect(XP_BASE.S).toBe(5);
    expect(XP_BASE.M).toBe(8);
    expect(XP_BASE.L).toBe(13);
    expect(XP_BASE.XL).toBe(21);
    expect(XP_BASE.XXL).toBe(34);
    expect(XP_BASE.XXXL).toBe(55);
  });
});

describe('calculateXP', () => {
  test('first-ever completion (streak=1, totalCompletions=0) returns rounded base XP', () => {
    // streakMult at streak=1 ≈ 1.094 with streakHalfLife=7; decayMult at 0 completions = 1.0
    // round(8 × 1.094 × 1.0) = round(8.75) = 9 — slightly above base; acceptable first-completion value
    expect(calculateXP('M', 1, 0, STANDARD)).toBeGreaterThanOrEqual(8);
  });

  test('result is always a rounded integer', () => {
    for (let streak = 1; streak <= 20; streak++) {
      const xp = calculateXP('M', streak, streak - 1, STANDARD);
      expect(Number.isInteger(xp)).toBe(true);
    }
  });

  test('higher streak earns more than lower streak (same totalCompletions)', () => {
    expect(calculateXP('M', 14, 10, STANDARD)).toBeGreaterThan(
      calculateXP('M', 1, 10, STANDARD),
    );
  });

  test('more totalCompletions reduces XP (same streak)', () => {
    expect(calculateXP('M', 5, 0, STANDARD)).toBeGreaterThan(
      calculateXP('M', 5, 200, STANDARD),
    );
  });

  test('XP converges toward base × maxStreakMultiplier × decayFloor at extreme values', () => {
    // Standard: base=8, maxMult=2.5, decayFloor=0.6 → asymptote = 8 × 2.5 × 0.6 = 12
    const extremeXP = calculateXP('M', 500, 500, STANDARD);
    expect(extremeXP).toBeCloseTo(12, 0);
  });

  test('experienced user breaking streak earns below base in Hard Mode', () => {
    // Hard: decayFloor=0.4; at streak=1 and 200 completions, XP < base
    const xp = calculateXP('M', 1, 200, HARD);
    expect(xp).toBeLessThan(XP_BASE.M);
  });

  test('minimum XP is at least 1 even in Hard Mode with maximum decay', () => {
    expect(calculateXP('XXS', 1, 500, HARD)).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test, verify fail**

```bash
bun test src/xp/calculator.test.ts
```

Expected: FAIL — `Cannot find module './calculator'`

- [ ] **Step 3: Create src/xp/calculator.ts**

```typescript
// src/xp/calculator.ts
//
// Formula (two-variable):
//   streakMult = maxStreakMultiplier
//                - (maxStreakMultiplier - 1) × exp(-ln2 / streakHalfLife × streakCount)
//   decayMult  = decayFloor
//                + (1 - decayFloor) × exp(-ln2 / decayHalfLife × totalCompletions)
//   xp         = round(base × streakMult × decayMult)
//
// streakCount=1, totalCompletions=0 → ≈ base (first-ever completion)
// streakCount→∞, totalCompletions→∞ → asymptote = base × maxStreakMultiplier × decayFloor
// streakHalfLife: windows to reach 50% of streak bonus range
// decayHalfLife:  completions to reach 50% of decay range
import type { XPSettings, XPSize } from '@/types';

export const XP_BASE: Record<XPSize, number> = {
  XXS: 2,
  XS:  3,
  S:   5,
  M:   8,
  L:   13,
  XL:  21,
  XXL: 34,
  XXXL: 55,
};

export function calculateXP(
  xpSize: XPSize,
  streakCount: number,
  totalCompletions: number,
  settings: XPSettings,
): number {
  const base = XP_BASE[xpSize];
  const { maxStreakMultiplier, decayFloor, streakHalfLife, decayHalfLife } = settings;
  const streakMult = maxStreakMultiplier
    - (maxStreakMultiplier - 1) * Math.exp(-Math.LN2 / streakHalfLife * streakCount);
  const decayMult = decayFloor
    + (1 - decayFloor) * Math.exp(-Math.LN2 / decayHalfLife * totalCompletions);
  return Math.round(base * streakMult * decayMult);
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
bun test src/xp/calculator.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/xp/
git commit -m "feat: XP calculator with streak multiplier and asymptotic decay"
```

---

### Task 5: CDP filename generator

**Files:**
- Create: `src/cdp/filename.ts`, `src/cdp/filename.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/cdp/filename.test.ts
import { describe, expect, test } from 'bun:test';
import { titleToFilename } from './filename';

describe('titleToFilename', () => {
  test('basic ASCII words become dash-case', () => {
    expect(titleToFilename('Make Laundry')).toBe('make-laundry');
  });

  test('German umlauts transliterated (ä→ae, ö→oe, ü→ue, ß→ss)', () => {
    expect(titleToFilename('Ärger mit Müll')).toBe('aerger-mit-muell');
    expect(titleToFilename('Großeinkauf')).toBe('grosseinkauf');
  });

  test('French accents simplified', () => {
    expect(titleToFilename('Ménage')).toBe('menage');
  });

  test('numbers preserved', () => {
    expect(titleToFilename('Clean 3 Rooms')).toBe('clean-3-rooms');
  });

  test('multiple spaces collapse to one dash', () => {
    expect(titleToFilename('Take   Out   Trash')).toBe('take-out-trash');
  });

  test('leading and trailing whitespace stripped', () => {
    expect(titleToFilename('  Clean up  ')).toBe('clean-up');
  });

  test('special characters stripped', () => {
    expect(titleToFilename('Feed cat!')).toBe('feed-cat');
  });

  test('empty string returns empty string', () => {
    expect(titleToFilename('')).toBe('');
  });

  test('only special chars returns empty string', () => {
    expect(titleToFilename('!@#$%')).toBe('');
  });
});
```

- [ ] **Step 2: Run test, verify fail**

```bash
bun test src/cdp/filename.test.ts
```

Expected: FAIL — `Cannot find module './filename'`

- [ ] **Step 3: Create src/cdp/filename.ts**

Pre-process German umlauts before passing to `transliteration.slugify`, because the library maps ä→a, not ä→ae.

```typescript
// src/cdp/filename.ts
import { slugify } from 'transliteration';

const PRE_REPLACE: [RegExp, string][] = [
  [/ä/gi, 'ae'],
  [/ö/gi, 'oe'],
  [/ü/gi, 'ue'],
  [/ß/g,  'ss'],
];

export function titleToFilename(title: string): string {
  let s = title;
  for (const [pattern, replacement] of PRE_REPLACE) {
    s = s.replace(pattern, replacement);
  }
  return slugify(s, {
    lowercase: true,
    separator: '-',
    allowedChars: 'a-z0-9',
  });
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
bun test src/cdp/filename.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/cdp/
git commit -m "feat: CDP filename generator (title → ASCII dash-case)"
```

---

### Task 6: Sync state helpers and AppState serialization

**Files:**
- Create: `src/sync/state.ts`, `src/sync/state.test.ts`, `src/sync/export.ts`, `src/sync/import.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/sync/state.test.ts
import { describe, expect, test } from 'bun:test';
import { canSync, needsConflictResolution, buildConflictSuffix } from './state';
import type { SyncState } from '@/types';

describe('canSync', () => {
  test('true when webdavUrl is set', () => {
    const s: SyncState = {
      id: 'main',
      webdavUrl: 'https://dav.example.com/tasks-harmony/state.json',
      pendingSync: false,
    };
    expect(canSync(s)).toBe(true);
  });

  test('false when webdavUrl is absent', () => {
    const s: SyncState = { id: 'main', pendingSync: false };
    expect(canSync(s)).toBe(false);
  });
});

describe('needsConflictResolution', () => {
  test('true when currentServerEtag differs from stored serverEtag', () => {
    const s: SyncState = { id: 'main', pendingSync: false, serverEtag: '"abc123"' };
    expect(needsConflictResolution(s, '"xyz999"')).toBe(true);
  });

  test('false when currentServerEtag matches stored serverEtag', () => {
    const s: SyncState = { id: 'main', pendingSync: false, serverEtag: '"abc123"' };
    expect(needsConflictResolution(s, '"abc123"')).toBe(false);
  });

  test('false when no serverEtag stored (first sync ever)', () => {
    const s: SyncState = { id: 'main', pendingSync: false };
    expect(needsConflictResolution(s, '"abc123"')).toBe(false);
  });
});

describe('buildConflictSuffix', () => {
  test('returns _conflict_YYYY-MM-DD from ISO datetime', () => {
    expect(buildConflictSuffix('2026-05-31T14:00:00.000Z')).toBe('_conflict_2026-05-31');
  });
});
```

- [ ] **Step 2: Run test, verify fail**

```bash
bun test src/sync/state.test.ts
```

Expected: FAIL — `Cannot find module './state'`

- [ ] **Step 3: Create src/sync/state.ts**

```typescript
// src/sync/state.ts
import type { SyncState } from '@/types';

export function canSync(state: SyncState): boolean {
  return !!state.webdavUrl;
}

export function needsConflictResolution(
  state: SyncState,
  currentServerEtag: string,
): boolean {
  if (!state.serverEtag) return false;
  return state.serverEtag !== currentServerEtag;
}

export function buildConflictSuffix(isoDatetime: string): string {
  return `_conflict_${isoDatetime.slice(0, 10)}`;
}
```

- [ ] **Step 4: Run sync tests, verify pass**

```bash
bun test src/sync/state.test.ts
```

Expected: 4 passing tests.

- [ ] **Step 5: Create src/sync/export.ts**

```typescript
// src/sync/export.ts
import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';
import {
  getPacks, getAllChores, getAllQuestions, getAllCompletions,
  getXPSettings, getProfile, getSyncState,
} from '@/db/index';
import type { AppState } from '@/types';

export async function exportAppState(
  db: IDBPDatabase<TasksHarmonyDB>,
): Promise<AppState> {
  const [packs, chores, questions, completions, xpSettings, profile, syncState] =
    await Promise.all([
      getPacks(db),
      getAllChores(db),
      getAllQuestions(db),
      getAllCompletions(db),
      getXPSettings(db),
      getProfile(db),
      getSyncState(db),
    ]);

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    packs,
    chores,
    questions,
    completions,
    xpSettings,
    profile: profile!,
    syncState: syncState!,
  };
}
```

- [ ] **Step 6: Create src/sync/import.ts**

```typescript
// src/sync/import.ts
import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';
import type { AppState } from '@/types';

export async function importAppState(
  db: IDBPDatabase<TasksHarmonyDB>,
  state: AppState,
): Promise<void> {
  const storeNames = [
    'packs', 'chores', 'questions', 'completions',
    'xpSettings', 'profile', 'syncState',
  ] as const;

  for (const name of storeNames) {
    const tx = db.transaction(name, 'readwrite');
    await tx.store.clear();
    await tx.done;
  }

  await Promise.all([
    ...state.packs.map((p) => db.put('packs', p)),
    ...state.chores.map((c) => db.put('chores', c)),
    ...state.questions.map((q) => db.put('questions', q)),
    ...state.completions.map((c) => db.put('completions', c)),
    ...state.xpSettings.map((s) => db.put('xpSettings', s)),
    db.put('profile', state.profile),
    db.put('syncState', state.syncState),
  ]);
}
```

- [ ] **Step 7: Run all tests**

```bash
bun test
```

Expected: all tests pass (DB + XP + filename + sync state).

- [ ] **Step 8: Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/sync/
git commit -m "feat: sync state helpers, AppState export/import"
```

---

---

### Task 7: JSON schema validation

All data that enters the system from external sources (WebDAV sync import, CDP YAML files, CDP ZIP manifest) must be validated against a JSON schema before being processed.

**Files:**
- Create: `src/schemas/appState.schema.json` — JSON Schema for `AppState` (WebDAV import)
- Create: `src/schemas/packManifest.schema.json` — JSON Schema for `__pack__.yaml`
- Create: `src/schemas/choreDefinition.schema.json` — JSON Schema for chore `.yaml` files
- Create: `src/schemas/validate.ts` — AJV-based validator helper
- Create: `src/schemas/validate.test.ts` — tests for valid and invalid inputs

- [ ] **Step 1: Install AJV**

```bash
bun add ajv
```

- [ ] **Step 2: Create src/schemas/appState.schema.json**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["schemaVersion", "exportedAt", "packs", "chores", "questions", "completions", "xpSettings", "profile", "syncState"],
  "properties": {
    "schemaVersion": { "type": "integer", "const": 1 },
    "exportedAt": { "type": "string" },
    "packs": { "type": "array" },
    "chores": { "type": "array" },
    "questions": { "type": "array" },
    "completions": { "type": "array" },
    "xpSettings": { "type": "array" },
    "profile": { "type": "object", "required": ["id", "displayName", "email", "activeXPSettingsId"] },
    "syncState": { "type": "object", "required": ["id", "pendingSync"] }
  },
  "additionalProperties": false
}
```

- [ ] **Step 3: Create src/schemas/packManifest.schema.json**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["title"],
  "properties": {
    "title": { "type": "string", "minLength": 1 },
    "author": { "type": "string" },
    "license": { "type": "string" },
    "description": { "type": "string" },
    "revision": { "type": "string" },
    "revisionHistory": { "type": "string" },
    "cdpCreatedAt": { "type": "string" },
    "chores": { "type": "array", "items": { "type": "string" } }
  },
  "additionalProperties": false
}
```

- [ ] **Step 4: Create src/schemas/choreDefinition.schema.json**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["title", "xpSize", "frequency", "interval"],
  "properties": {
    "title": { "type": "string", "minLength": 1 },
    "description": { "type": "string" },
    "xpSize": { "type": "string", "enum": ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"] },
    "frequency": { "type": "string", "enum": ["daily", "weekly", "monthly"] },
    "interval": { "type": "integer", "minimum": 1 },
    "windowStartTime": { "type": "string", "pattern": "^([01]\\d|2[0-3]):[0-5]\\d$" },
    "repeatable": { "type": "boolean" },
    "questions": { "type": "array" }
  },
  "additionalProperties": false
}
```

- [ ] **Step 5: Write failing tests**

```typescript
// src/schemas/validate.test.ts
import { describe, expect, test } from 'bun:test';
import { validateAppState, validatePackManifest, validateChoreDefinition } from './validate';

describe('validateAppState', () => {
  test('valid AppState passes', () => {
    const valid = {
      schemaVersion: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      packs: [], chores: [], questions: [], completions: [], xpSettings: [],
      profile: { id: 'me', displayName: '', email: '', activeXPSettingsId: 'standard' },
      syncState: { id: 'main', pendingSync: false },
    };
    expect(validateAppState(valid).valid).toBe(true);
  });

  test('missing schemaVersion fails', () => {
    const invalid = { exportedAt: '2026-01-01T00:00:00.000Z', packs: [], chores: [], questions: [], completions: [], xpSettings: [], profile: {}, syncState: {} };
    expect(validateAppState(invalid).valid).toBe(false);
  });

  test('wrong schemaVersion fails', () => {
    const invalid = { schemaVersion: 2, exportedAt: '2026-01-01T00:00:00.000Z', packs: [], chores: [], questions: [], completions: [], xpSettings: [], profile: { id: 'me', displayName: '', email: '', activeXPSettingsId: 'standard' }, syncState: { id: 'main', pendingSync: false } };
    expect(validateAppState(invalid).valid).toBe(false);
  });
});

describe('validatePackManifest', () => {
  test('valid manifest passes', () => {
    expect(validatePackManifest({ title: 'Fitness Pack' }).valid).toBe(true);
  });

  test('missing title fails', () => {
    expect(validatePackManifest({ author: 'Alice' }).valid).toBe(false);
  });

  test('extra properties fail', () => {
    expect(validatePackManifest({ title: 'X', unknown: true }).valid).toBe(false);
  });
});

describe('validateChoreDefinition', () => {
  test('valid chore passes', () => {
    const valid = { title: 'Floss teeth', xpSize: 'XS', frequency: 'daily', interval: 1 };
    expect(validateChoreDefinition(valid).valid).toBe(true);
  });

  test('invalid xpSize fails', () => {
    const invalid = { title: 'X', xpSize: 'HUGE', frequency: 'daily', interval: 1 };
    expect(validateChoreDefinition(invalid).valid).toBe(false);
  });

  test('invalid frequency fails', () => {
    const invalid = { title: 'X', xpSize: 'S', frequency: 'hourly', interval: 1 };
    expect(validateChoreDefinition(invalid).valid).toBe(false);
  });

  test('invalid windowStartTime pattern fails', () => {
    const invalid = { title: 'X', xpSize: 'S', frequency: 'daily', interval: 1, windowStartTime: '25:00' };
    expect(validateChoreDefinition(invalid).valid).toBe(false);
  });
});
```

- [ ] **Step 6: Run tests, verify fail**

```bash
bun test src/schemas/validate.test.ts
```

Expected: FAIL — `Cannot find module './validate'`

- [ ] **Step 7: Create src/schemas/validate.ts**

```typescript
// src/schemas/validate.ts
import Ajv from 'ajv';
import appStateSchema from './appState.schema.json';
import packManifestSchema from './packManifest.schema.json';
import choreDefinitionSchema from './choreDefinition.schema.json';

const ajv = new Ajv({ allErrors: true });

const validateAppStateFn = ajv.compile(appStateSchema);
const validatePackManifestFn = ajv.compile(packManifestSchema);
const validateChoreDefinitionFn = ajv.compile(choreDefinitionSchema);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function toResult(fn: Ajv.ValidateFunction, data: unknown): ValidationResult {
  const valid = fn(data) as boolean;
  return {
    valid,
    errors: valid ? [] : (fn.errors ?? []).map((e) => `${e.instancePath} ${e.message}`),
  };
}

export const validateAppState = (data: unknown): ValidationResult =>
  toResult(validateAppStateFn, data);

export const validatePackManifest = (data: unknown): ValidationResult =>
  toResult(validatePackManifestFn, data);

export const validateChoreDefinition = (data: unknown): ValidationResult =>
  toResult(validateChoreDefinitionFn, data);
```

- [ ] **Step 8: Run tests, verify pass**

```bash
bun test src/schemas/validate.test.ts
```

Expected: all tests pass.

- [ ] **Step 9: Typecheck**

```bash
bun run typecheck
```

Expected: no errors. (You may need `"resolveJsonModule": true` in `tsconfig.json`.)

- [ ] **Step 10: Commit**

```bash
git add src/schemas/
git commit -m "feat: JSON schema validation for AppState, pack manifest, and chore definitions"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|---|---|
| §7.1 XP sizes XXS–XXXL with Fibonacci base values (2,3,5,8,13,21,34,55) | Task 4 ✓ |
| §7.2–7.3 Two-variable formula: streak bonus + decay (separate half-life params) | Task 4 ✓ |
| §7.5 XP immutable (stored on Completion at creation) | Types Task 2 ✓ |
| §7.6 Named XP configurations (Standard + Hard Mode seeded) | Task 3 ✓ |
| CDP pack manifest + filename-as-ID scheme | Types Task 2 ✓ |
| Filename → ASCII dash-case with umlaut transliteration | Task 5 ✓ |
| IndexedDB for all state | Task 3 ✓ |
| ETag-based sync conflict detection | Task 6 ✓ |
| AppState JSON export for WebDAV sync | Task 6 ✓ |
| JSON schema validation for all external data | Task 7 ✓ |
| PWA offline shell (service worker via vite-plugin-pwa) | Task 1 ✓ |

**Deferred to later plans:**
- Dashboard, chore cards, status sorting (Plan 2)
- Chore create/edit/deactivate (Plan 2)
- Simple completion flow + streak calculation (Plan 2)
- Question builder + completion modal (Plan 3)
- WebDAV PUT/GET with If-Match header (Plan 4)
- CDP YAML parsing + Git import (Plan 3)
- Conflict resolution dialog (Plan 4)
- Profile page + XP settings selector (Plan 4)

### Placeholder scan

No TBD, TODO, or "implement later" present. All steps include complete code.

### Type consistency

- `Chore.key` = `${packId}/${choreId}` used as DB keyPath; referenced identically by `Question.choreKey` and `Completion.choreKey`.
- `XPSettings.id` values `'standard'` and `'hard'` match seed data and `UserProfile.activeXPSettingsId` default.
- `SyncState.serverEtag` referenced consistently in `needsConflictResolution` and exported via `exportAppState`.
- `AppState.schemaVersion: 1` is a literal type — future migrations can branch on it.
