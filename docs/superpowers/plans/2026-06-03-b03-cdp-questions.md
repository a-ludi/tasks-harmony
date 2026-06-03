# B03: Questions Included in CDP Export/Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Include a chore's questions in its CDP export YAML and parse them back during import, so questions survive the CDP round-trip.

**Architecture:** Each chore YAML file gains an optional `questions` array. `buildCDPZip` receives questions and serialises them per chore. `fetchCDP` returns `questions` alongside `pack` and `chores`. The `importCDP` and `updateCDP` store actions persist the imported questions via `putQuestion`. The `PackDashboard` export call is updated to pass the filtered question list. The `choreDefinition.schema.json` already allows `questions: { type: "array" }`.

**Question YAML structure per chore file:**

```yaml
questions:
  - id: "uuid"
    type: TEXT
    prompt: "How long did it take?"
    required: true
    order: 0
    regexPattern: "^\\d+$"         # TEXT only, optional
  - id: "uuid2"
    type: INTEGER
    prompt: "Minutes?"
    required: false
    order: 1
    minValue: 0                    # optional
    maxValue: 240                  # optional
  - id: "uuid3"
    type: BOOLEAN
    prompt: "Was it difficult?"
    required: false
    order: 2
  - id: "uuid4"
    type: ENUM
    prompt: "Effort level?"
    required: true
    order: 3
    choices:
      - id: "choice-uuid"
        label: "Low"
        order: 0
  - id: "uuid5"
    type: MULTIPLIER
    prompt: "Units?"
    required: true
    order: 4
    xpPerUnit: 2.5
    multiplierAnswerType: integer
```

`choreKey` is never stored in the YAML — it is derived from `${packId}/${choreId}` on import.

**Tech Stack:** TypeScript, `js-yaml`, `fflate`, Zustand, `idb`.

---

### Task 1: Update cdp-export to serialise questions

**Files:**
- Modify: `src/cdp/cdp-export.ts`
- Modify: `src/cdp/cdp-export.test.ts`

- [ ] **Step 1: Write a failing test for question serialisation**

In `src/cdp/cdp-export.test.ts`, add a new describe block (keep existing tests):

```ts
import { describe, it, expect } from 'bun:test';
import { buildCDPZip } from './cdp-export';
import { unzipSync, strFromU8 } from 'fflate';
import jsYaml from 'js-yaml';
import type { Pack, Chore, Question, UserProfile } from '@/types';

// --- existing test fixtures (keep as-is) ---

const PACK: Pack = {
  id: 'my-pack', manifest: { title: 'My Pack' }, isPersonal: false,
  importedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};
const CHORE: Chore = {
  key: 'my-pack/clean', choreId: 'clean', packId: 'my-pack', title: 'Clean',
  xpSize: 'S',
  recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
  repeatable: false, active: true, createdAt: '2026-01-01T00:00:00Z',
};
const PROFILE: UserProfile = { id: 'me', displayName: 'Alice', email: 'alice@example.com', activeXPSettingsId: 'default' };

describe('buildCDPZip — question serialisation', () => {
  it('includes questions array in the chore YAML when questions are provided', () => {
    const question: Question = {
      id: 'q-1', choreKey: 'my-pack/clean', prompt: 'How long?', required: true, order: 0, type: 'TEXT',
    };
    const zipBytes = buildCDPZip(PACK, [CHORE], [question], PROFILE);
    const files = unzipSync(zipBytes);
    const choreYaml = strFromU8(files['my-pack/clean.yaml']);
    const parsed = jsYaml.load(choreYaml) as Record<string, unknown>;
    expect(Array.isArray(parsed.questions)).toBe(true);
    const qs = parsed.questions as Array<Record<string, unknown>>;
    expect(qs[0].id).toBe('q-1');
    expect(qs[0].type).toBe('TEXT');
    expect(qs[0].prompt).toBe('How long?');
  });

  it('omits questions key when no questions exist for the chore', () => {
    const zipBytes = buildCDPZip(PACK, [CHORE], [], PROFILE);
    const files = unzipSync(zipBytes);
    const choreYaml = strFromU8(files['my-pack/clean.yaml']);
    const parsed = jsYaml.load(choreYaml) as Record<string, unknown>;
    expect(parsed.questions).toBeUndefined();
  });

  it('does not include choreKey in the serialised question', () => {
    const question: Question = {
      id: 'q-2', choreKey: 'my-pack/clean', prompt: 'Minutes?', required: false, order: 0, type: 'INTEGER',
    };
    const zipBytes = buildCDPZip(PACK, [CHORE], [question], PROFILE);
    const files = unzipSync(zipBytes);
    const choreYaml = strFromU8(files['my-pack/clean.yaml']);
    const parsed = jsYaml.load(choreYaml) as Record<string, unknown>;
    const qs = parsed.questions as Array<Record<string, unknown>>;
    expect(qs[0].choreKey).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests — expect fail**

```bash
bun test --isolate src/cdp/cdp-export.test.ts
```

Expected: FAIL — `buildCDPZip` signature doesn't accept `questions` yet.

- [ ] **Step 3: Update cdp-export.ts**

Replace the full contents of `src/cdp/cdp-export.ts`:

```ts
import { zipSync, strToU8 } from 'fflate';
import jsYaml from 'js-yaml';
import type { Pack, Chore, Question, UserProfile } from '@/types';

export function buildCDPZip(
  pack: Pack,
  chores: Chore[],
  questions: Question[],
  profile: UserProfile,
): Uint8Array {
  const active = chores.filter((c) => c.active);
  const choreFilenames = active.map((c) => `${c.choreId}.yaml`);

  const files: Record<string, Uint8Array> = {
    [`${pack.id}/__pack__.yaml`]: strToU8(buildPackYaml(pack, choreFilenames, profile)),
  };
  for (const chore of active) {
    const choreQuestions = questions.filter((q) => q.choreKey === chore.key);
    files[`${pack.id}/${chore.choreId}.yaml`] = strToU8(buildChoreYaml(chore, choreQuestions));
  }

  return zipSync(files);
}

function buildAuthor(profile: UserProfile): string | undefined {
  const name = profile.displayName.trim();
  const email = profile.email.trim();
  if (name && email) return `${name} <${email}>`;
  if (name) return name;
  if (email) return `<${email}>`;
  return undefined;
}

function buildPackYaml(pack: Pack, choreFilenames: string[], profile: UserProfile): string {
  const data: Record<string, unknown> = { title: pack.manifest.title };
  const author = buildAuthor(profile);
  if (author) data.author = author;
  if (pack.manifest.license) data.license = pack.manifest.license;
  if (pack.manifest.description) data.description = pack.manifest.description;
  data.createdAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  data.chores = choreFilenames;
  return jsYaml.dump(data);
}

function buildChoreYaml(chore: Chore, questions: Question[]): string {
  const data: Record<string, unknown> = {
    title: chore.title,
    xpSize: chore.xpSize,
    frequency: chore.recurrence.frequency,
    interval: chore.recurrence.interval,
    windowStartTime: chore.recurrence.windowStartTime,
    repeatable: chore.repeatable,
  };
  if (chore.description) data.description = chore.description;
  if (questions.length > 0) {
    data.questions = questions.map((q) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { choreKey: _ck, ...rest } = q as Question & { choreKey: string };
      return rest;
    });
  }
  return jsYaml.dump(data);
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
bun test --isolate src/cdp/cdp-export.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/cdp/cdp-export.ts src/cdp/cdp-export.test.ts
git commit -m "feat: include questions in CDP chore YAML export"
```

---

### Task 2: Update cdp-import to parse questions

**Files:**
- Modify: `src/cdp/cdp-import.ts`
- Modify: `src/cdp/cdp-import.test.ts`

- [ ] **Step 1: Write a failing test for question parsing**

In `src/cdp/cdp-import.test.ts`, add a describe block (mock-based test for the parsing logic):

```ts
import { describe, it, expect } from 'bun:test';
import { parseChoreQuestions } from './cdp-import';
import type { Question } from '@/types';

describe('parseChoreQuestions', () => {
  it('returns an empty array when questions field is absent', () => {
    expect(parseChoreQuestions(undefined, 'pack-a/clean')).toEqual([]);
  });

  it('returns an empty array when questions is an empty list', () => {
    expect(parseChoreQuestions([], 'pack-a/clean')).toEqual([]);
  });

  it('injects choreKey into each question and preserves all fields', () => {
    const raw = [{ id: 'q-1', type: 'TEXT', prompt: 'How?', required: true, order: 0 }];
    const result = parseChoreQuestions(raw, 'pack-a/clean');
    expect(result).toHaveLength(1);
    expect(result[0].choreKey).toBe('pack-a/clean');
    expect(result[0].type).toBe('TEXT');
  });

  it('handles ENUM questions with choices', () => {
    const raw = [{
      id: 'q-2', type: 'ENUM', prompt: 'Effort?', required: true, order: 0,
      choices: [{ id: 'c-1', label: 'Low', order: 0 }],
    }];
    const result = parseChoreQuestions(raw, 'pack-a/clean') as Question[];
    const q = result[0];
    if (q.type !== 'ENUM') throw new Error('Expected ENUM');
    expect(q.choices?.[0].label).toBe('Low');
  });
});
```

- [ ] **Step 2: Run tests — expect fail**

```bash
bun test --isolate src/cdp/cdp-import.test.ts
```

Expected: FAIL — `parseChoreQuestions` not exported.

- [ ] **Step 3: Update cdp-import.ts**

Replace the full contents of `src/cdp/cdp-import.ts`:

```ts
import jsYaml from 'js-yaml';
import type { Pack, Chore, Question, XPSize, RecurrenceFrequency } from '@/types';
import { validatePackManifest, validateChoreDefinition } from '@/schemas/validate';

interface PackYaml {
  title: string;
  author?: string;
  license?: string;
  description?: string;
  chores: string[];
}

interface ChoreYaml {
  title: string;
  description?: string;
  xpSize: XPSize;
  frequency: RecurrenceFrequency;
  interval: number;
  windowStartTime?: string;
  repeatable?: boolean;
  questions?: unknown[];
}

export function parseChoreQuestions(
  raw: unknown[] | undefined,
  choreKey: string,
): Question[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.map((q) => ({ ...(q as object), choreKey })) as Question[];
}

export async function fetchCDP(
  baseUrl: string,
): Promise<{ pack: Pack; chores: Chore[]; questions: Question[] }> {
  const manifestUrl = `${baseUrl}/__pack__.yaml`;
  const manifestRes = await fetch(manifestUrl);
  if (!manifestRes.ok)
    throw new Error(`Failed to fetch pack manifest from ${manifestUrl}: ${manifestRes.status}`);
  const manifestRaw = jsYaml.load(await manifestRes.text()) as PackYaml;

  const manifestValidation = validatePackManifest(manifestRaw);
  if (!manifestValidation.valid)
    throw new Error(`CDP manifest is invalid: ${manifestValidation.errors.join('; ')}`);
  if (!manifestRaw.title) throw new Error('CDP manifest is missing required field: title');
  if (!Array.isArray(manifestRaw.chores) || manifestRaw.chores.length === 0)
    throw new Error('CDP manifest is missing required field: chores (must be a non-empty list)');

  const urlPath = baseUrl.replace(/\/$/, '');
  const packId = urlPath.substring(urlPath.lastIndexOf('/') + 1);
  const today = new Date().toISOString().substring(0, 10);
  const now = new Date().toISOString();

  const allQuestions: Question[] = [];

  const chores: Chore[] = await Promise.all(
    manifestRaw.chores.map(async (filename: string) => {
      const choreUrl = `${baseUrl}/${filename}`;
      const choreRes = await fetch(choreUrl);
      if (!choreRes.ok)
        throw new Error(`Failed to fetch chore file ${filename} from ${choreUrl}: ${choreRes.status}`);
      const choreRaw = jsYaml.load(await choreRes.text()) as ChoreYaml;

      const choreValidation = validateChoreDefinition(choreRaw);
      if (!choreValidation.valid)
        throw new Error(`Chore file ${filename} is invalid: ${choreValidation.errors.join('; ')}`);

      const choreId = filename.replace(/\.yaml$/, '');
      const choreKey = `${packId}/${choreId}`;

      allQuestions.push(...parseChoreQuestions(choreRaw.questions, choreKey));

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
      } satisfies Chore;
    }),
  );

  const pack: Pack = {
    id: packId,
    manifest: {
      title: manifestRaw.title,
      author: manifestRaw.author,
      license: manifestRaw.license,
      description: manifestRaw.description,
    },
    isPersonal: false,
    importedAt: now,
    updatedAt: now,
    sourceUrl: baseUrl,
  };

  return { pack, chores, questions: allQuestions };
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
bun test --isolate src/cdp/cdp-import.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/cdp/cdp-import.ts src/cdp/cdp-import.test.ts
git commit -m "feat: parse questions from CDP chore YAML files on import"
```

---

### Task 3: Update store importCDP and updateCDP to persist questions

**Files:**
- Modify: `src/store/index.ts`

- [ ] **Step 1: Update importCDP in the store**

In `src/store/index.ts`, find the `importCDP` action. Replace it:

```ts
importCDP: async (baseUrl) => {
  const { db } = get();
  if (!db) throw new Error('Database not initialised');
  const { pack, chores, questions } = await fetchCDP(baseUrl);
  await putPack(db, pack);
  for (const chore of chores) await putChore(db, chore);
  for (const question of questions) await putQuestion(db, question);
  const [updatedPacks, updatedChores, updatedQuestions] = await Promise.all([
    getPacks(db), getAllChores(db), getAllQuestions(db),
  ]);
  set({ packs: updatedPacks, chores: updatedChores, questions: updatedQuestions });
},
```

- [ ] **Step 2: Update updateCDP in the store**

Find the `updateCDP` action. Replace it:

```ts
updateCDP: async (packId) => {
  const { db, packs } = get();
  if (!db) throw new Error('Database not initialised');
  const pack = packs.find((p) => p.id === packId);
  if (!pack) throw new Error(`Pack '${packId}' not found in store`);
  if (!pack.sourceUrl) throw new Error(`Pack '${packId}' has no sourceUrl — cannot update`);
  const { pack: updatedPack, chores: updatedChores, questions: updatedQuestions } = await fetchCDP(pack.sourceUrl);
  for (const chore of updatedChores) await putChore(db, chore);
  for (const question of updatedQuestions) await putQuestion(db, question);
  const refreshedPack: Pack = { ...updatedPack, importedAt: pack.importedAt, updatedAt: new Date().toISOString() };
  await putPack(db, refreshedPack);
  const [finalPacks, finalChores, finalQuestions] = await Promise.all([
    getPacks(db), getAllChores(db), getAllQuestions(db),
  ]);
  set({ packs: finalPacks, chores: finalChores, questions: finalQuestions });
},
```

- [ ] **Step 3: Run typecheck + full test suite**

```bash
bun run typecheck && bun test
```

Expected: exits 0, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/store/index.ts
git commit -m "feat: persist imported questions from CDP in store importCDP and updateCDP"
```

---

### Task 4: Update PackDashboard to pass questions to buildCDPZip

**Files:**
- Modify: `src/components/packs/PackDashboard.tsx`

- [ ] **Step 1: Subscribe to questions and pass them to buildCDPZip**

In `src/components/packs/PackDashboard.tsx`, add the `questions` store subscription:

```ts
const allQuestions = useAppStore((s) => s.questions);
```

Update `handleExport` to pass the filtered questions:

```ts
function handleExport() {
  if (!pack || !profile) return;
  const packQuestions = allQuestions.filter((q) =>
    packChores.some((c) => c.key === q.choreKey),
  );
  const zipBytes = buildCDPZip(pack, packChores, packQuestions, profile);
  const blob = new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${pack.id}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
```

- [ ] **Step 2: Run typecheck + full suite**

```bash
bun run typecheck && bun test
```

Expected: exits 0, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/packs/PackDashboard.tsx
git commit -m "fix: pass questions to buildCDPZip in PackDashboard export"
```
