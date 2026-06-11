# Sprint Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement four independent features: changelog pipeline + conscious releases (#2), Markdown descriptions (#38), PWA splash screen (#30), and GitHub link in nav (#35).

**Architecture:** Feature A (#2) rewires the service worker to use prompt-mode updates, introduces `public/changelog.json` as the authoritative release record, and adds an update notification modal. Feature B (#38) replaces plain text description inputs/displays with Milkdown WYSIWYG. Features C and D are self-contained UI additions.

**Tech Stack:** React, TypeScript, Bun, Vite, vite-plugin-pwa, Milkdown v7, @tailwindcss/typography, Shadcn/ui, Zustand, pwa-asset-generator

---

## Task 1: Changelog pipeline — create `public/changelog.json` and generation script

**Files:**
- Create: `public/changelog.json`
- Create: `src/changelog/format.ts`
- Create: `src/changelog/format.test.ts`
- Create: `scripts/generate-changelog.ts`
- Modify: `package.json` (add `generate-changelog` script)

- [ ] **Step 1: Create `src/changelog/format.ts` with pure formatting functions**

```typescript
export interface ChangelogEntry {
  version: string;
  date: string;
  highlights: string[];
  sections: Record<string, string[]>;
}

const REPO_URL = 'https://github.com/a-ludi/tasks-harmony';

export function isNewer(candidate: string, current: string): boolean {
  const parse = (v: string) => v.split('.').map(Number);
  const c = parse(candidate);
  const cur = parse(current);
  for (let i = 0; i < Math.max(c.length, cur.length); i++) {
    const a = c[i] ?? 0;
    const b = cur[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

export function buildFullChangelog(
  entries: ChangelogEntry[],
  currentVersion: string,
): Array<{ version: string; sections: Record<string, string[]> }> {
  return entries
    .filter((e) => isNewer(e.version, currentVersion))
    .map(({ version, sections }) => ({ version, sections }));
}

function formatEntry(entry: ChangelogEntry): string {
  const lines: string[] = [`## [${entry.version}] — ${entry.date}`, ''];
  for (const [section, items] of Object.entries(entry.sections)) {
    if (items.length === 0) continue;
    lines.push(`### ${section}`, '');
    for (const item of items) lines.push(`- ${item}`);
    lines.push('');
  }
  return lines.join('\n');
}

export function generateChangelogMd(entries: ChangelogEntry[]): string {
  const header = `# Changelog\n\nAll notable changes to this project will be documented in this file.\n\nThe format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),\nand this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).\n\n## [Unreleased]\n\n`;
  const body = entries.map(formatEntry).join('\n');
  const linkDefs = entries
    .map((e) => `[${e.version}]: ${REPO_URL}/releases/tag/v${e.version}`)
    .join('\n');
  return header + body + '\n' + linkDefs + '\n';
}
```

- [ ] **Step 2: Write failing tests for `format.ts`**

Create `src/changelog/format.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test';
import { isNewer, buildFullChangelog, generateChangelogMd } from './format';

const ENTRIES = [
  { version: '0.4.0', date: '2026-06-09', highlights: ['h1'], sections: { Added: ['a1', 'a2'], Changed: ['c1'] } },
  { version: '0.3.0', date: '2026-06-01', highlights: [], sections: { Fixed: ['f1'] } },
  { version: '0.2.0', date: '2026-05-01', highlights: [], sections: { Added: ['a3'] } },
];

describe('isNewer', () => {
  it('returns true for higher patch', () => expect(isNewer('0.4.1', '0.4.0')).toBe(true));
  it('returns false for same version', () => expect(isNewer('0.4.0', '0.4.0')).toBe(false));
  it('returns false for older version', () => expect(isNewer('0.3.9', '0.4.0')).toBe(false));
  it('handles minor bumps', () => expect(isNewer('0.5.0', '0.4.9')).toBe(true));
  it('handles major bumps', () => expect(isNewer('1.0.0', '0.9.9')).toBe(true));
});

describe('buildFullChangelog', () => {
  it('returns all entries newer than current version', () => {
    const result = buildFullChangelog(ENTRIES, '0.2.0');
    expect(result).toHaveLength(2);
    expect(result[0].version).toBe('0.4.0');
    expect(result[1].version).toBe('0.3.0');
  });
  it('returns empty array when already on latest', () => {
    expect(buildFullChangelog(ENTRIES, '0.4.0')).toHaveLength(0);
  });
  it('excludes current version from result', () => {
    const result = buildFullChangelog(ENTRIES, '0.3.0');
    expect(result.map((e) => e.version)).toEqual(['0.4.0']);
  });
});

describe('generateChangelogMd', () => {
  it('includes version header for each entry', () => {
    const md = generateChangelogMd(ENTRIES);
    expect(md).toContain('## [0.4.0] — 2026-06-09');
    expect(md).toContain('## [0.3.0] — 2026-06-01');
  });
  it('includes section items', () => {
    const md = generateChangelogMd(ENTRIES);
    expect(md).toContain('### Added');
    expect(md).toContain('- a1');
  });
  it('omits empty sections', () => {
    const md = generateChangelogMd([{ version: '1.0.0', date: '2026-01-01', highlights: [], sections: { Added: [], Fixed: ['f1'] } }]);
    expect(md).not.toContain('### Added');
    expect(md).toContain('### Fixed');
  });
  it('includes link definitions at the bottom', () => {
    const md = generateChangelogMd(ENTRIES);
    expect(md).toContain('[0.4.0]: https://github.com/a-ludi/tasks-harmony/releases/tag/v0.4.0');
  });
});
```

- [ ] **Step 3: Run tests and verify they fail**

```bash
bun test --isolate src/changelog/format.test.ts
```

Expected: all tests FAIL (format.ts is empty/missing)

- [ ] **Step 4: Run tests again to verify they pass**

```bash
bun test --isolate src/changelog/format.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Create `scripts/generate-changelog.ts`**

```typescript
import { readFileSync, writeFileSync } from 'fs';
import { generateChangelogMd, type ChangelogEntry } from '../src/changelog/format';

const entries: ChangelogEntry[] = JSON.parse(readFileSync('public/changelog.json', 'utf-8'));
writeFileSync('CHANGELOG.md', generateChangelogMd(entries));
console.log('CHANGELOG.md regenerated from public/changelog.json');
```

- [ ] **Step 6: Create `public/changelog.json` with the existing release history**

```json
[
  {
    "version": "0.4.0",
    "date": "2026-06-09",
    "highlights": [],
    "sections": {
      "Added": [
        "**Dark mode** — toggle in the sidebar; persisted to `localStorage`; respects OS preference on first visit (#16)",
        "**Compact mode** — dashboard toggle via \"+ New Chore\" button dropdown; hides description, XP, and recurrence fields and tightens card spacing; persisted to `localStorage` (#12)"
      ],
      "Changed": [
        "**Shadcn/ui migration** — all UI components (buttons, cards, dialogs, badges, inputs, selects, dropdowns, switches, tooltips) now use Shadcn/ui primitives with consistent Tailwind v4 CSS variable theming (#6)",
        "**ChoreCard redesign** — uses `CardHeader`/`CardTitle`/`CardDescription`/`CardAction` anatomy; Complete button in the card action slot (top-right); Edit, Duplicate, and Archive moved to a `⋮` dropdown menu",
        "**Dark mode coverage** — all hardcoded gray/white color classes replaced with semantic tokens (`bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`) across all pages and components; ProfilePage migrated to Shadcn `Input` and `Select`"
      ]
    }
  },
  {
    "version": "0.2.0",
    "date": "2026-06-05",
    "highlights": [],
    "sections": {
      "Added": [
        "Move chores between packs via the chore edit modal — select a different pack and save; collision with an existing choreId is caught inline before saving",
        "Safe pack deletion with per-chore disposition dialog — choose to move or delete each chore individually; \"Move all\" / \"Delete all\" shortcuts; auto-resolves name collisions with a numeric suffix shown inline",
        "Duplicate chore — new Duplicate button on every chore card; choose target pack and name; inline collision detection; \"Duplicate & Edit\" opens the edit modal for the new copy immediately",
        "Completion history preserved on pack deletion — completions are never deleted; their `choreKey` is rewritten to a UUID so XP history remains intact",
        "Local git hooks via lefthook — pre-commit runs typecheck, pre-push runs unit tests; hooks auto-install via `bun install`"
      ],
      "Fixed": [
        "PWA icons (`icon-192.png`, `icon-512.png`) are now committed so CI builds include them, fixing the installability check (#25)"
      ],
      "Changed": [
        "`SSH_HOST`, `SSH_USER`, `SSH_PATH` moved from GitHub Actions secrets to repository variables for easier auditing in the Actions UI (#24)",
        "GitHub Actions upgraded: `actions/checkout` → v6, `actions/upload-artifact` → v7, `actions/download-artifact` → v8 (Node.js 24, avoids deprecation warnings) (#22)"
      ]
    }
  },
  {
    "version": "0.1.1",
    "date": "2026-06-04",
    "highlights": [],
    "sections": {
      "Fixed": [
        "**CD pipeline**: `gh release create --skip-existing` is not supported on GitHub Actions runners; replaced with `gh release view ... || gh release create ...`"
      ]
    }
  },
  {
    "version": "0.1.0",
    "date": "2026-06-04",
    "highlights": [],
    "sections": {
      "Added": [
        "**Quick-complete**: Chore cards now show pre-defined answer sets as quick-complete buttons with tooltip previews, configurable per chore in the edit form.",
        "**ZIP backup**: Export and import the full app state as a ZIP archive from the Profile page.",
        "**XP preview in edit mode**: Chore form shows projected XP range (base to max-streak) live as you change the XP size. Score multiplier questions now also show a per-unit weight preview.",
        "**XP per pack**: Pack dashboard header displays total XP earned for that pack; sidebar shows XP earned next to each pack name.",
        "**Personal title bar**: Display name shown in the desktop sidebar and the mobile header alongside the app title.",
        "**Sidebar version footer**: App version and build date shown at the bottom of the sidebar.",
        "**CI/CD via GitHub Actions**: Reusable CI workflow (typecheck, unit tests, E2E tests, production build + artifact upload); CD pipeline creates a GitHub Release and deploys via rsync on every push to `main`."
      ],
      "Changed": [
        "**Sidebar navigation**: Dashboard moved to top-level; pack actions (New Pack, Import Pack) consolidated into a ⋮ overflow menu."
      ],
      "Fixed": [
        "**Sidebar width bounds**: Minimum raised to 200 px; maximum is now dynamic — `max(200 px, 50 vw)` — so the sidebar can fill up to half the viewport on wide screens.",
        "**CDP export now includes questions**: Questions attached to a chore are exported and imported correctly. They are sorted by their `order` field in the YAML and the `order` field is omitted (position in the array is authoritative on import).",
        "**WebDAV URL field**: Input is now full-width so it no longer gets clipped when the sidebar is narrow.",
        "**Score multiplier XP preview**: Weight input in the question form now shows the per-unit preview (was missing, chore questions already had it)."
      ]
    }
  }
]
```

- [ ] **Step 7: Add script to `package.json` and regenerate `CHANGELOG.md`**

In `package.json` `scripts` section, add:
```json
"generate-changelog": "bun run scripts/generate-changelog.ts"
```

Then run:
```bash
bun run generate-changelog
```

Verify `CHANGELOG.md` output matches the previous content (same entries, same format).

- [ ] **Step 8: Commit**

```bash
git add public/changelog.json src/changelog/format.ts src/changelog/format.test.ts scripts/generate-changelog.ts CHANGELOG.md package.json
git commit -m "feat: add changelog.json pipeline and generation script"
```

---

## Task 2: Conscious Releases — service worker prompt mode + update detection hook

**Files:**
- Modify: `vite.config.ts`
- Modify: `tsconfig.json`
- Create: `src/hooks/useUpdateNotification.ts`

Note: pure utility functions (`isNewer`, `buildFullChangelog`) are fully tested in `src/changelog/format.test.ts` from Task 1 — no separate hook test file needed.

- [ ] **Step 1: Change `registerType` to `'prompt'` in `vite.config.ts`**

In `vite.config.ts`, change line:
```typescript
registerType: 'autoUpdate',
```
to:
```typescript
registerType: 'prompt',
```

- [ ] **Step 2: Add `vite-plugin-pwa/client` types to `tsconfig.json`**

In `tsconfig.json`, change `"types": ["bun-types"]` to:
```json
"types": ["bun-types", "vite-plugin-pwa/client"]
```

- [ ] **Step 3: Create `src/hooks/useUpdateNotification.ts`**

```typescript
import { useState, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { isNewer, buildFullChangelog, type ChangelogEntry } from '@/changelog/format';

const IGNORED_KEY = 'tasks-harmony-update-ignored-version';
const REMIND_KEY = 'tasks-harmony-update-remind-date';

function todayISO(): string {
  return new Date().toISOString().substring(0, 10);
}

export interface UpdateState {
  available: boolean;
  version: string | null;
  highlights: string[];
  fullChangelog: Array<{ version: string; sections: Record<string, string[]> }>;
  updateNow: () => void;
  remindLater: () => void;
  ignoreUpdate: () => void;
}

export function useUpdateNotification(): UpdateState {
  const currentVersion = import.meta.env.VITE_APP_VERSION;
  const [available, setAvailable] = useState(false);
  const [latestEntry, setLatestEntry] = useState<ChangelogEntry | null>(null);
  const [fullChangelog, setFullChangelog] = useState<Array<{ version: string; sections: Record<string, string[]> }>>([]);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!needRefresh) return;

    fetch('/changelog.json', { cache: 'no-store' })
      .then((r) => r.json())
      .then((entries: ChangelogEntry[]) => {
        const latest = entries[0];
        if (!latest || !isNewer(latest.version, currentVersion)) return;

        if (localStorage.getItem(IGNORED_KEY) === latest.version) return;

        const remindDate = localStorage.getItem(REMIND_KEY);
        if (remindDate === todayISO()) return;

        setLatestEntry(latest);
        setFullChangelog(buildFullChangelog(entries, currentVersion));
        setAvailable(true);
      })
      .catch(() => {
        // Non-critical — silently ignore fetch failures
      });
  }, [needRefresh, currentVersion]);

  function updateNow() {
    updateServiceWorker(true);
  }

  function remindLater() {
    localStorage.setItem(REMIND_KEY, todayISO());
    setAvailable(false);
  }

  function ignoreUpdate() {
    if (latestEntry) localStorage.setItem(IGNORED_KEY, latestEntry.version);
    setAvailable(false);
  }

  return {
    available,
    version: latestEntry?.version ?? null,
    highlights: latestEntry?.highlights ?? [],
    fullChangelog,
    updateNow,
    remindLater,
    ignoreUpdate,
  };
}
```

- [ ] **Step 4: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts tsconfig.json src/hooks/useUpdateNotification.ts
git commit -m "feat: add conscious releases update detection hook"
```

---

## Task 3: Conscious Releases — UpdateModal component

**Files:**
- Create: `src/components/update/UpdateModal.tsx`

- [ ] **Step 1: Create `src/components/update/UpdateModal.tsx`**

```tsx
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface Props {
  version: string;
  highlights: string[];
  fullChangelog: Array<{ version: string; sections: Record<string, string[]> }>;
  onUpdateNow: () => void;
  onRemindLater: () => void;
  onIgnore: () => void;
}

export function UpdateModal({
  version,
  highlights,
  fullChangelog,
  onUpdateNow,
  onRemindLater,
  onIgnore,
}: Props) {
  const [showFull, setShowFull] = useState(false);

  return (
    <Dialog open>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Update to v{version}</DialogTitle>
        </DialogHeader>

        {highlights.length > 0 && (
          <ul className="space-y-1 text-sm">
            {highlights.map((h, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 text-muted-foreground">•</span>
                <span>{h}</span>
              </li>
            ))}
          </ul>
        )}

        {fullChangelog.length > 0 && (
          <div>
            <button
              className="text-sm text-muted-foreground underline underline-offset-2"
              onClick={() => setShowFull((v) => !v)}
            >
              {showFull ? 'Hide full changelog' : 'Show full changelog'}
            </button>
            {showFull && (
              <div className="mt-3 max-h-60 overflow-y-auto space-y-4 text-sm border rounded-md p-3">
                {fullChangelog.map(({ version: v, sections }) => (
                  <div key={v}>
                    <p className="font-semibold">v{v}</p>
                    {Object.entries(sections).map(([section, items]) =>
                      items.length > 0 ? (
                        <div key={section} className="mt-2">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {section}
                          </p>
                          <ul className="mt-1 space-y-1">
                            {items.map((item, i) => (
                              <li key={i} className="flex gap-2 text-xs">
                                <span className="shrink-0 text-muted-foreground">•</span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" size="sm" onClick={onIgnore}>
            Ignore update
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onRemindLater}>
              Remind me later
            </Button>
            <Button size="sm" onClick={onUpdateNow}>
              Update now
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/update/UpdateModal.tsx
git commit -m "feat: add UpdateModal component for conscious releases"
```

---

## Task 4: Conscious Releases — wire up App and Sidebar

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Add `updateVersion` prop and update pill + GitHub link to `Sidebar.tsx`**

In `src/components/layout/Sidebar.tsx`, update the `Props` interface and add the update pill:

Change the interface at the top:
```typescript
interface Props {
  onClose: () => void;
  onNewPack: () => void;
  updateVersion?: string | null;
  onUpdateClick?: () => void;
}
```

Update the function signature:
```typescript
export default function Sidebar({ onClose, onNewPack, updateVersion, onUpdateClick }: Props) {
```

After the existing `<div className="border-t pt-4 space-y-3">` block (which contains SyncButton and dark mode toggle), and BEFORE the `<footer>` tag, insert:

```tsx
      <div className="border-t pt-4 space-y-3">
        <SyncButton />
        <div className="flex items-center gap-2 px-1">
          <Switch checked={theme === 'dark'} onCheckedChange={toggle} />
          <Label className="text-sm font-normal cursor-pointer" onClick={toggle}>Dark mode</Label>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {updateVersion && (
          <button
            onClick={onUpdateClick}
            className="w-full rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors text-center"
          >
            Update to v{updateVersion}
          </button>
        )}
        <a
          href="https://github.com/a-ludi/tasks-harmony"
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View on GitHub
        </a>
      </div>

      <footer className="mt-auto pt-4 text-xs text-muted-foreground select-none">
        v{import.meta.env.VITE_APP_VERSION} · {import.meta.env.VITE_BUILD_DATE}
      </footer>
```

- [ ] **Step 2: Integrate `useUpdateNotification` into `App.tsx`**

Add imports at the top of `src/App.tsx`:
```typescript
import { useUpdateNotification } from '@/hooks/useUpdateNotification';
import { UpdateModal } from '@/components/update/UpdateModal';
```

Inside the `App` function body, after the existing hooks, add:
```typescript
const update = useUpdateNotification();
const [showUpdateModal, setShowUpdateModal] = useState(false);

// Auto-open modal when update becomes available
useEffect(() => {
  if (update.available) setShowUpdateModal(true);
}, [update.available]);
```

Update the mobile header burger button to show a badge dot when an update is available. Find this block:

```tsx
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-xl text-muted-foreground"
            aria-label="Open menu"
          >
            ☰
          </button>
```

Replace with:
```tsx
          <button
            onClick={() => setSidebarOpen(true)}
            className="relative text-xl text-muted-foreground"
            aria-label="Open menu"
          >
            ☰
            {update.available && (
              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary" />
            )}
          </button>
```

Pass update props to both `<Sidebar>` instances (mobile Sheet and desktop aside). Find each `<Sidebar ... />` and add:
```tsx
updateVersion={update.available ? update.version : null}
onUpdateClick={() => setShowUpdateModal(true)}
```

At the end of the JSX return (just before the closing `</div>`), add the modal and dialog:
```tsx
        {showUpdateModal && update.available && (
          <UpdateModal
            version={update.version ?? ''}
            highlights={update.highlights}
            fullChangelog={update.fullChangelog}
            onUpdateNow={update.updateNow}
            onRemindLater={() => { update.remindLater(); setShowUpdateModal(false); }}
            onIgnore={() => { update.ignoreUpdate(); setShowUpdateModal(false); }}
          />
        )}
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/layout/Sidebar.tsx
git commit -m "feat: wire up conscious releases UI in App and Sidebar"
```

---

## Task 5: Milkdown setup — install deps and create shared components

**Files:**
- Modify: `package.json` (new deps)
- Modify: `src/index.css`
- Create: `src/components/ui/MarkdownEditor.tsx`
- Create: `src/components/ui/MarkdownDisplay.tsx`

- [ ] **Step 1: Install Milkdown and Tailwind Typography packages**

```bash
bun add @milkdown/core @milkdown/react @milkdown/preset-gfm @milkdown/plugin-history @milkdown/plugin-indent @milkdown/plugin-block @milkdown/plugin-emoji @milkdown/plugin-listener @milkdown/theme-nord
bun add @tailwindcss/typography
```

- [ ] **Step 2: Add Tailwind Typography plugin to `src/index.css`**

After the first `@import "tailwindcss";` line in `src/index.css`, add:
```css
@plugin "@tailwindcss/typography";
```

- [ ] **Step 3: Create `src/components/ui/MarkdownEditor.tsx`**

```tsx
import { useEditor, Milkdown, MilkdownProvider } from '@milkdown/react';
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core';
import { nord } from '@milkdown/theme-nord';
import { gfm } from '@milkdown/preset-gfm';
import { history } from '@milkdown/plugin-history';
import { indent } from '@milkdown/plugin-indent';
import { block } from '@milkdown/plugin-block';
import { emoji } from '@milkdown/plugin-emoji';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import '@milkdown/theme-nord/style.css';

interface Props {
  value: string;
  onChange: (value: string) => void;
}

function InnerEditor({ value, onChange }: Props) {
  useEditor((root) =>
    Editor.make()
      .config(nord)
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, value);
        ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
          onChange(markdown);
        });
      })
      .use(gfm)
      .use(history)
      .use(indent)
      .use(block)
      .use(emoji)
      .use(listener)
  );
  return <Milkdown />;
}

export function MarkdownEditor(props: Props) {
  return (
    <MilkdownProvider>
      <div className="milkdown-wrapper rounded-md border border-input focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 min-h-[80px]">
        <InnerEditor {...props} />
      </div>
    </MilkdownProvider>
  );
}
```

- [ ] **Step 4: Create `src/components/ui/MarkdownDisplay.tsx`**

```tsx
import { useEditor, Milkdown, MilkdownProvider } from '@milkdown/react';
import { Editor, rootCtx, defaultValueCtx, editorViewOptionsCtx } from '@milkdown/core';
import { nord } from '@milkdown/theme-nord';
import { gfm } from '@milkdown/preset-gfm';
import { cn } from '@/lib/utils';
import '@milkdown/theme-nord/style.css';

interface Props {
  content: string;
  className?: string;
}

function InnerDisplay({ content }: { content: string }) {
  useEditor((root) =>
    Editor.make()
      .config(nord)
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, content);
        ctx.update(editorViewOptionsCtx, (prev) => ({ ...prev, editable: () => false }));
      })
      .use(gfm)
  );
  return <Milkdown />;
}

export function MarkdownDisplay({ content, className }: Props) {
  if (!content) return null;
  return (
    <MilkdownProvider>
      <div className={cn('prose prose-sm max-w-none dark:prose-invert', className)}>
        <InnerDisplay content={content} />
      </div>
    </MilkdownProvider>
  );
}
```

- [ ] **Step 4: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors. If `@milkdown/theme-nord/style.css` import causes issues, remove the `@milkdown/theme-nord` dependency and the `.config(nord)` call — Milkdown works without a theme (unstyled).

- [ ] **Step 6: Commit**

```bash
git add src/index.css src/components/ui/MarkdownEditor.tsx src/components/ui/MarkdownDisplay.tsx package.json bun.lock
git commit -m "feat: add Milkdown MarkdownEditor and MarkdownDisplay components"
```

---

## Task 6: Markdown in chore descriptions

**Files:**
- Modify: `src/components/chores/ChoreFormModal.tsx`
- Modify: `src/components/dashboard/ChoreCard.tsx`
- Modify: `src/components/chores/ChorePage.tsx`

- [ ] **Step 1: Replace Textarea with `MarkdownEditor` in `ChoreFormModal.tsx`**

Add import at the top:
```typescript
import { MarkdownEditor } from '@/components/ui/MarkdownEditor';
```

Remove the `Textarea` import (if no longer used elsewhere in the file).

Find the description field block:
```tsx
            <div className="space-y-2">
              <Label htmlFor="chore-description">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea id="chore-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Add extra details…" />
            </div>
```

Replace with:
```tsx
            <div className="space-y-2">
              <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <MarkdownEditor value={description} onChange={setDescription} />
            </div>
```

- [ ] **Step 2: Replace description `<p>` with `MarkdownDisplay` in `ChoreCard.tsx`**

Add import at the top:
```typescript
import { MarkdownDisplay } from '@/components/ui/MarkdownDisplay';
```

Find:
```tsx
          {chore.description && (
            <p className="chore-description mb-1 text-sm text-muted-foreground line-clamp-2">{chore.description}</p>
          )}
```

Replace with:
```tsx
          {chore.description && (
            <div className="chore-description mb-1 max-h-10 overflow-hidden">
              <MarkdownDisplay content={chore.description} className="text-sm text-muted-foreground" />
            </div>
          )}
```

- [ ] **Step 3: Replace description `<p>` with `MarkdownDisplay` in `ChorePage.tsx`**

Add import at the top:
```typescript
import { MarkdownDisplay } from '@/components/ui/MarkdownDisplay';
```

Find:
```tsx
      {chore.description && (
        <p className="mb-4 text-sm text-muted-foreground">{chore.description}</p>
      )}
```

Replace with:
```tsx
      {chore.description && (
        <MarkdownDisplay content={chore.description} className="mb-4 text-sm text-muted-foreground" />
      )}
```

- [ ] **Step 4: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/components/chores/ChoreFormModal.tsx src/components/dashboard/ChoreCard.tsx src/components/chores/ChorePage.tsx
git commit -m "feat: use Milkdown WYSIWYG for chore description editing and display"
```

---

## Task 7: Markdown in pack descriptions — store action + PackDashboard

**Files:**
- Modify: `src/store/index.ts`
- Modify: `src/components/packs/PackDashboard.tsx`

- [ ] **Step 1: Add `updatePackDescription` action to the store**

In `src/store/index.ts`, find the store state interface (around where `renamePack` is declared, ~line 50) and add:
```typescript
  updatePackDescription: (packId: string, description: string) => Promise<void>;
```

In the store implementation, after the `renamePack` implementation, add:
```typescript
  updatePackDescription: async (packId, description) => {
    const { db, packs } = get();
    if (!db) throw new Error('DB not initialised');
    const pack = packs.find((p) => p.id === packId);
    if (!pack) throw new Error(`Pack '${packId}' not found`);
    const updated: Pack = {
      ...pack,
      manifest: { ...pack.manifest, description },
      updatedAt: new Date().toISOString(),
    };
    await putPack(db, updated);
    set((state) => ({
      packs: state.packs.map((p) => (p.id === packId ? updated : p)),
    }));
  },
```

- [ ] **Step 2: Add description display and editing to `PackDashboard.tsx`**

Add imports at the top:
```typescript
import { MarkdownEditor } from '@/components/ui/MarkdownEditor';
import { MarkdownDisplay } from '@/components/ui/MarkdownDisplay';
```

In the component state section (alongside `isRenaming`), add:
```typescript
  const updatePackDescription = useAppStore((s) => s.updatePackDescription);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState('');
```

Find the section in the JSX that renders the pack title/rename area and add description display/editing after it. Locate the block ending with `{/* Export / Delete buttons */}` or after the title section. Add:

```tsx
          {/* Pack description */}
          {isEditingDescription ? (
            <div className="mt-3 space-y-2">
              <MarkdownEditor
                value={descriptionValue}
                onChange={setDescriptionValue}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    await updatePackDescription(pack.id, descriptionValue);
                    setIsEditingDescription(false);
                  }}
                >
                  Save
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditingDescription(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 group flex items-start gap-2">
              {pack.manifest.description ? (
                <MarkdownDisplay content={pack.manifest.description} className="flex-1 text-sm text-muted-foreground" />
              ) : (
                <p className="flex-1 text-sm italic text-muted-foreground">No description</p>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => {
                  setDescriptionValue(pack.manifest.description ?? '');
                  setIsEditingDescription(true);
                }}
              >
                Edit
              </Button>
            </div>
          )}
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/store/index.ts src/components/packs/PackDashboard.tsx
git commit -m "feat: add pack description display and editing with Milkdown"
```

---

## Task 8: PWA splash screen (#30)

**Files:**
- Modify: `index.html` (via pwa-asset-generator)
- New files: various PNG splash images in `public/`

- [ ] **Step 1: Run `pwa-asset-generator` to generate iOS splash images and update `index.html`**

```bash
bunx pwa-asset-generator icon-template.svg public/ \
  --splash-only \
  --background "#ffffff" \
  --no-manifest \
  --no-favicon \
  --index ./index.html \
  --padding "20%"
```

This generates PNG splash images at all required iOS device sizes in `public/` and injects `<link rel="apple-touch-startup-image">` meta tags into `index.html`.

- [ ] **Step 2: Verify `index.html` was updated**

Check that `index.html` now contains lines like:
```html
<link rel="apple-touch-startup-image" ...>
```

If the `--index` flag did not update `index.html`, manually copy the generated HTML from the tool's output into `index.html` before the closing `</head>` tag.

- [ ] **Step 3: Add `apple-mobile-web-app-capable` meta tag to `index.html` if missing**

Ensure `index.html` contains (add after the viewport meta tag if absent):
```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
```

- [ ] **Step 4: Run typecheck and build**

```bash
bun run typecheck && bun run build
```

Expected: no errors, splash images appear in `dist/`

- [ ] **Step 5: Commit generated images and index.html**

```bash
git add public/ index.html
git commit -m "feat: add iOS PWA splash screen assets and meta tags"
```

---

## Task 9: GitHub link in nav menu (#35)

**Files:**
- No additional changes needed — the "View on GitHub" link was already added to `Sidebar.tsx` in Task 4, Step 1.

- [ ] **Step 1: Verify the link is present**

Open `src/components/layout/Sidebar.tsx` and confirm it contains:

```tsx
        <a
          href="https://github.com/a-ludi/tasks-harmony"
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View on GitHub
        </a>
```

If it's there from Task 4, this task is already done. If Task 4 was not yet executed, add the link to `Sidebar.tsx` in the footer `<div className="mt-4 space-y-2">` block (without the update pill button — just the `<a>` tag on its own).

- [ ] **Step 2: Commit (if Task 4 was not yet done)**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat: add View on GitHub link to nav menu footer"
```

---

## Post-implementation checklist

- [ ] Run full test suite: `bun run test`
- [ ] Run typecheck: `bun run typecheck`
- [ ] Run E2E smoke test on dashboard: `bunx playwright test --grep "dashboard"`
- [ ] Manual check: open the app in dev mode, trigger `needRefresh` (by editing a file to cause a SW update) and verify the update modal appears
- [ ] Manual check: open on iOS Safari and verify splash screen appears on PWA launch
- [ ] Close issues #2, #35, #38, #30 on GitHub
