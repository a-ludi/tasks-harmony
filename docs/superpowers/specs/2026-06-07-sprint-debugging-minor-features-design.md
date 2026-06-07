# Sprint Design: Debugging & Minor Features

**Date:** 2026-06-07
**Issues:** #25 (Browser matrix for PWA test), #28 (Repetition Factor), #29 (Chore Details Page)
**Sequence:** #25 and #28 in parallel, then #29

---

## #25 — Browser Matrix for E2E Tests

### Goal

Validate PWA installability across browsers by running the e2e suite in parallel per browser in CI.

### `pwa-installability.spec.ts`

Three-tier logic based on `browserName`:

- **Firefox**: `test.skip` — Firefox does not support PWAs.
- **All non-Firefox browsers (Chromium, WebKit)**: Prerequisite checks using `page.request.get()` against the URLs the browser actually receives:
  1. Find `<link rel="manifest">` in the DOM and extract its `href`.
  2. `page.request.get(manifestHref)` — expect HTTP 200, parse JSON.
  3. Assert required fields: `name`, `start_url`, `display`, and at least one icon with `sizes` ≥ 192.
  4. For each icon in `manifest.icons`, `page.request.get(icon.src)` — expect HTTP 200 and `content-type: image/png`.
- **Chromium additionally**: After the prerequisite block, open a CDP session, run `Page.getInstallabilityErrors`, filter `in-incognito`, assert no remaining errors.

### `playwright.config.ts`

- Remove `browserName: 'chromium'` from the root `use` block.
- Add a `projects` array with three entries: `chromium`, `firefox`, `webkit`.
- The Chromium project retains its `executablePath` / sandbox flags (`findHeadlessShell`, `--no-sandbox`, etc.).
- Firefox and WebKit projects use `devices['Desktop Firefox']` and `devices['Desktop Safari']` respectively with no special flags.
- No test exclusions in any project.

### `ci.yml`

- Extract a dedicated `e2e` job with a `browser: [chromium, firefox, webkit]` matrix.
- Each leg: `bunx playwright install --with-deps ${{ matrix.browser }}` then `bunx playwright test --project=${{ matrix.browser }}`.
- The `build` job declares `needs: [check, e2e]`.
- The `check` job retains typecheck and unit tests but drops e2e (moved to the matrix job).

### Local verification

Before pushing, install missing browsers locally (`bunx playwright install --with-deps firefox webkit`) and run `bun run test:e2e` to confirm all three projects pass.

---

## #28 — Repetition Factor (replaces Weight)

### Goal

Replace the free-float Weight input on Score Multiplier questions with an integer "Repetition Factor" (≥ 1) that represents how many completions are needed for one full item's worth of XP. The internal `xpPerUnit` field and XP formula are unchanged; `xpPerUnit = 1 / repetitionFactor`.

### Data migration (`DB_VERSION` → 3)

For each `MultiplierQuestion` record in IndexedDB:

- `xpPerUnit < 1`: rewrite as `1 / Math.round(1 / xpPerUnit)` (converts a reduction factor to the nearest valid repetition factor).
- `xpPerUnit ≥ 1`: leave unchanged (legacy boost values are preserved as fractions).

### Component changes

| File | Change |
|---|---|
| `QuestionFormFields.tsx` | Replace Weight input (`min=0.0001, step=any`) with Repetition Factor input (`type=number, min=1, step=1`). Store local `repetitionFactor` state; derive `xpPerUnit = 1 / repetitionFactor` on save. On load: `repetitionFactor = Math.max(1, Math.round(1 / xpPerUnit))`. |
| `choreFormValidation.ts` | Change validation from `xpPerUnit > 0` to `Number.isInteger(repetitionFactor) && repetitionFactor >= 1`. Error: "Repetition factor must be a whole number of 1 or more". |
| `xpPreview.ts` | Update `buildMultiplierXPPreview` to return `÷{repetitionFactor} per unit answered` instead of `×{xpPerUnit}`. |
| `AnswerField.tsx` | Update the inline hint from `× {xpPerUnit}` to `÷ {repetitionFactor}`. |

---

## #29 — Chore Details Page

### Goal

Make the entire chore card clickable, opening a dedicated details page that shows full chore info and the completion history (previously only reachable via a separate "Completions" button).

### New route

`/chores/:encodedChoreKey` → `ChorePage`

The existing `/chores/:encodedChoreKey/completions` becomes a `<Navigate>` redirect to the parent route (preserves bookmarks).

### `ChorePage.tsx`

New page component, following the data-fetching pattern of the existing `CompletionsPage`:

- Reads `encodedChoreKey` from `useParams`, loads chore + completions + questions from the store.
- Renders:
  1. Back button (`useNavigate(-1)`)
  2. Full title and full description (no truncation)
  3. XP size, recurrence, streak summary
  4. Completion history table (moved verbatim from `CompletionsPage`)

### `App.tsx`

- Add `/chores/:encodedChoreKey` route above the existing `/completions` route.
- Replace the `/completions` route with a `<Navigate to={...}>` redirect.

### `ChoreCard.tsx`

- Remove the "Completions" button entirely.
- The card body (excluding the Edit, Duplicate, Archive action buttons) becomes a `<Link>` or gains an `onClick` → `useNavigate` pointing to `/chores/${encodeURIComponent(chore.key)}`.

### `CompletionsPage.tsx`

Delete once its table JSX is moved into `ChorePage` and the redirect is in place.
