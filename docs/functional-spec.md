# Tasks Harmony — Functional Specification

**Goal:** Tasks Harmony gamifies recurring chores (household tasks, training, habits, etc.). The user earns XP for completing chores on time; streaks and a plateau curve reward consistency without runaway scaling. Chores can require structured data entry on completion.

**Scope:** This document captures every behavioural requirement from the original design spec and all implementation plans, with bugs integrated as edge cases. Technology choices, library names, and deployment details are intentionally excluded.

---

## Glossary

| Term | Meaning |
|---|---|
| **Chore** | A recurring task the user has committed to doing on a schedule. |
| **Pack** | A named group of chores; every chore belongs to a pack. |
| **Completion** | A single instance of marking a chore as done. |
| **Window** | The time interval defined by a recurrence rule in which one completion is expected. |
| **Streak** | The count of consecutive windows in which the chore was completed. |
| **XP** | Experience points earned per completion; amounts vary by chore size and streak. |
| **XP Settings** | A named configuration of the XP formula (multipliers, decay floor). |
| **Question** | A structured field attached to a chore that must be filled in on each completion. |
| **Score Multiplier** | An optional per-chore feature that scales XP by a user-entered number at completion time. |
| **Due Period** | An optional per-chore setting that delays `due` status until near the end of the window. |
| **CDP** | Chore Definition Pack — a ZIP file containing a pack manifest and chore definitions. |
| **Sync Key** | A post-quantum key bundle used for encrypting and authenticating sync data. |

---

## 1. Navigation

### 1.1 Sidebar layout

**As the user, I want a persistent navigation sidebar, so that I can switch between views without losing context.**

- The sidebar is always visible on desktop (viewport ≥ 768 px), fixed on the left with the main content beside it.
- On mobile, the sidebar is hidden behind a hamburger button in the top bar. Tapping the button opens the sidebar as a left-side drawer overlay; tapping any link or the backdrop closes it.
- The sidebar contains, top to bottom:
  - **Profile** link at the top
  - XP counter (total XP earned to date)
  - **Dashboard** link (all chores, unfiltered)
  - **Packs** section: one link per pack (pack title), each with a `+` New Pack button at the end
  - Footer: conditional update pill (when an update is available), app version and date

### 1.2 XP in mobile header

**As the user, I want to see my XP on mobile without opening the sidebar, so that progress is always visible.**

- The compact mobile top bar shows the XP total as a pill between the title and the right edge.

### 1.3 Update notifications

**As the user, I want to know when a new version is available, so that I can choose to update.**

- When a new app version is detected, an update modal opens automatically (subject to dismissal rules).
- The modal shows: version number, highlights for the new release, and an expandable full changelog for all versions between the running version and the latest.
- Actions: **Update now** (reloads to new version), **Remind me later** (dismisses; re-shows on the next calendar day), **Ignore update** (stores the dismissed version; modal never auto-opens for this version again, but the nav badge and pill remain).
- The sidebar footer shows an "Update to vX.Y.Z" pill that always reopens the modal, even after "Ignore update".

---

## 2. Profile

### 2.1 Viewing stats

**As the user, I want to see my progress summary, so that I know how much I have accomplished.**

- The profile page shows: display name, total XP earned to date, and the name of the active XP settings configuration.

### 2.2 Updating personal info

**As the user, I want to set my display name and email, so that the app feels personal.**

- Changes take effect immediately on save.
- If the new email address is not valid, the update is rejected and the original email is preserved.
- A dismissible success alert confirms the change.

### 2.3 Choosing XP settings

**As the user, I want to select which XP formula configuration applies to me, so that I can tune the difficulty.**

- The profile shows which XP settings configuration is currently active (see §10.6).

### 2.4 App settings

**As the user, I want to control display preferences from the profile page, so that they are easy to find.**

- **Dark mode:** a toggle switches between light and dark themes. The preference persists in `localStorage`. On first use, it defaults to the OS colour scheme preference.
- **Sync button:** triggers a manual sync and shows the last-synced timestamp.

### 2.5 About section

**As the user, I want to see app metadata and external links in one place.**

- The profile page's About section shows: app title, short description, version and build date, author, and a "View on GitHub" link.

### 2.6 Sync key management

**As the user, I want to back up and restore my sync key, so that I can protect my data and use the app on multiple devices.**

- **Export sync key:** downloads `tasks-harmony-sync-key.json` containing the key bundle.
- **Import sync key:** file picker; a confirmation dialog warns that importing a new key will make existing server data inaccessible (local data is unaffected).
- See §13 for full sync behaviour.

---

## 3. Dashboard

### 3.1 Chore card overview

**As the user, I want to see all active chores on a single page, so that I know exactly what needs doing and when.**

- Each card shows: name, description (truncated to approximately two lines), effective XP value, current streak count, recurrence cadence, status badge, and the pack name.
- Cards are grouped and sorted: **Overdue** first, then **Due**, then **Completed**, then **Upcoming**.
- Status badges are visually distinct for each state.
- Edge case: a chore whose recurrence data is malformed (e.g., missing a start date) must still appear on the dashboard — it must not crash the page or be silently hidden.

### 3.2 Live XP counter

**As the user, I want my total XP to update the moment I complete a chore, so that progress feels immediate.**

- The XP counter in the sidebar (and mobile header pill) updates in place — no full page reload is required.

### 3.3 Partial card update

**As the user, I want completing a chore to update only that card, so that I don't lose my scroll position.**

### 3.4 Compact mode

**As the user, I want a compact view, so that I can see more chores at once.**

- A toggle in the dashboard toolbar switches compact mode on and off. The preference persists in `localStorage`.
- In compact mode, each card shows only: name, status badge, streak count, and complete button. Description, recurrence label, and XP preview are hidden.
- Card spacing is reduced in compact mode.

### 3.5 Chore details navigation

**As the user, I want to tap a chore card to see full details, so that I can review its history without leaving the dashboard.**

- Tapping the body of a chore card (excluding the action buttons) navigates to the Chore Details Page for that chore.

---

## 4. Pack Management

### 4.1 Viewing a pack

**As the user, I want a dedicated page for each pack, so that I can focus on one collection of chores.**

- `/packs/:packId` shows the pack's chores in the same format as the dashboard (filtered to that pack).
- If `:packId` does not match any pack, the route redirects to `/`.

### 4.2 Pack header

**As the user, I want to see pack info and actions at the top of the pack page, so that management is in one place.**

- The pack header shows: pack title (with an inline rename button), XP earned in this pack, and a kebab menu.
- The kebab menu contains: **Options…**, **Download as CDP**, **Delete Pack** (hidden for the personal pack).
- Imported packs (with a source URL) also show a `↻` refresh button in the header (see §12.5).

### 4.3 Pack progress

**As the user, I want to see my progress toward pack goals, so that I know how close I am.**

- If the pack has an `xpTarget`: an amber XP progress bar shows `packXP / xpTarget`. A "Completed" badge replaces it once `packXP ≥ xpTarget`.
- If the pack has a `targetDate`: a blue time progress bar shows the proportion of time elapsed between the earliest chore start date and the target date. A "Lapsed" badge replaces it once the target date has passed without meeting the XP goal (or when no XP goal is set).

### 4.4 Creating a pack

**As the user, I want to create a new pack, so that I can organise chores by theme.**

- The `+` button in the sidebar opens a New Pack dialog with a pack name field.
- On confirm: the pack is created (ID derived by slugifying the name; numeric suffix appended if the ID already exists), and the app navigates to the new pack's page.
- The default personal pack cannot be deleted; its title can be renamed.

### 4.5 Pack options

**As the user, I want to configure pack-level settings in one place, so that management is not scattered.**

- The Options modal has three sections:
  - **Details:** title (editable), description (Markdown editor, optional).
  - **Scoring:** streaks enabled toggle, decay enabled toggle, default XP size input, XP target input, target date input.
  - **Import:** allow shift on import toggle.
- Changes are saved on confirm.

### 4.6 Deleting a pack

**As the user, I want to delete a pack, so that I can remove packs I no longer need.**

- Empty packs: a simple confirmation dialog; pack is deleted immediately.
- Non-empty packs: a `PackDeletionDialog` shows each chore with a Move/Delete toggle. Move is the default; the global target pack selector at the top applies to all chores simultaneously. Auto-resolved collision names (using numeric suffix) are shown inline for chores being moved that would collide.
- On confirm: each chore is either deleted (questions deleted, completions preserved under a new UUID-format key) or moved (atomic transaction with key rewrite).
- After all chores are processed, the pack record is deleted.

---

## 5. Chore Management

### 5.1 Creating a chore

**As the user, I want to create a chore without leaving the dashboard, so that setup is fast.**

- I fill in: name, optional description (Markdown editor), pack (select, defaults to personal or current pack), XP size (preset scale or custom integer), recurrence frequency (daily / weekly / monthly), interval (every N periods), and start date.
- The start date field is labelled **"First Due Date"** — it represents the end of the first window (when the chore is first due). The stored `startDate` is computed as `firstDueDate − interval` so the first window opens one period before.
- The start date defaults to today when not specified.
- Questions can be added during chore creation (same builder as in edit mode).
- Edge case: if the form has validation errors, they are shown inline and no chore is created.

### 5.2 Editing a chore

**As the user, I want to edit an existing chore without leaving the dashboard, so that adjustments are quick.**

- The form opens pre-populated with the chore's current values.
- The pack field shows the chore's current pack. A dropdown lets the user move the chore to a different pack; if the target pack already has a chore with the same choreId, the save button is disabled with an inline error.
- Changes to XP size or recurrence take effect from the next completion; historical records are unaffected.
- Edge case: if the form has validation errors, they are shown inline and no change is saved.

### 5.3 Deactivating a chore

**As the user, I want to deactivate a chore, so that it no longer appears on my dashboard.**

- A deactivated chore disappears from the dashboard but is not permanently deleted. It is visible (greyed out) on its pack page and can be reactivated from there.

### 5.4 Duplicating a chore

**As the user, I want to duplicate a chore, so that I can quickly create a similar one.**

- A "Duplicate" action is available from each chore card's action menu on all pages.
- The Duplicate Chore dialog has: a pack selector (defaults to the chore's current pack) and a name input (pre-filled with `"[Original title] (copy)"` for same-pack, or the original title for a different pack).
- An inline error appears if the name would collide with an existing chore in the target pack.
- Actions: Cancel / Duplicate / Duplicate & Edit. "Duplicate & Edit" saves then opens the chore form; if the user cancels the edit, the duplicate remains saved.

### 5.5 Moving chores between packs

**As the user, I want to move a chore to a different pack, so that I can reorganise without recreating chores.**

- Moving is done via the pack field in the edit form. On save, the chore key is rewritten atomically (chore record, all questions, all completions) in a single IndexedDB transaction.
- Collision (target pack already has a chore with the same choreId): the save button is disabled with an inline error. The user must rename the chore before saving.

### 5.6 XP size and custom XP

**As the user, I want to set a custom XP amount, so that I can assign precise values to unusual chores.**

- The XP size selector shows preset sizes with their base XP values (e.g. "S (5 XP)").
- A "Custom…" option replaces the dropdown with a number input (positive integer, min 1).
- The form's live formula display updates as XP size changes.

### 5.7 Window bar

**As the user, I want to visualise the chore window when setting the schedule, so that I can understand how due period relates to the full window.**

- A proportional bar appears below the Due Period field whenever a valid first due date and frequency are set.
- Without a due period: a single yellow "Due" bar spanning the full window, labelled with the window duration.
- With a due period: a gray "Upcoming" segment and a yellow "Due" segment, proportional to `(window − due_period)` and `due_period`, each labelled with its duration.
- Three date anchors are shown below the bar: window open date (left), due-start date (centre, only when a due period is set), and first due date (right).

### 5.8 Score Multiplier section

**As the user, I want to configure a score multiplier, so that the chore's XP scales with how much effort I put in.**

- A collapsible "Score Multiplier" section in the chore form (below XP Size) has:
  - Enable toggle
  - Prompt — the question shown at completion time (required when enabled)
  - Repetition Factor — positive integer ≥ 1 (validation: "Repetition factor must be a whole number of 1 or more")
  - Answer type — integer / float radio

### 5.9 Formula display

**As the user, I want to see how XP is calculated, so that I understand what I am configuring.**

- A read-only formula block in the chore form shows all active factors as labelled blocks separated by operators. `round(...)` wraps the expression when any multiplier is active.
- The streak factor shows `1–N` (N = `maxStreakMultiplier`) and is hidden when the pack has `streak: false`.
- The decay factor shows `F%–100%` (F = `decayFloor × 100`) and is hidden when the pack has `decay: false`.
- The score multiplier factor shows `answer ÷ repetitionFactor` and appears only when the score multiplier is enabled.

---

## 6. Questions — Builder

### 6.1 Question types

Each question has a prompt text, a type, and a required toggle (defaults to **required**):

| Type | Constraints |
|---|---|
| **TEXT** | Optional regex validation pattern |
| **INTEGER** | Optional minimum and maximum values |
| **BOOLEAN** | None |
| **ENUM** | An ordered list of labelled choices |

### 6.2 Building the question list

- Questions can be added during chore creation as well as editing.
- I can add questions one at a time, reorder them using up/down controls, and remove them.
- A newly-added question that is removed before saving is simply discarded; the form can be saved without a count mismatch error.
- For existing (already-saved) questions, removing marks the question for deletion visually (faded, with a "Restore" option) but does not delete until the form is saved. A soft-deleted question cannot be reordered.

### 6.3 ENUM choices

- Choices are managed through an add/remove/reorder list — not a plain text field.
- Each choice has a label. Choices can be reordered.

### 6.4 Regex validation

- The regex pattern is validated at save time; an invalid pattern is rejected immediately.
- Patterns that could cause catastrophic backtracking are also rejected at save time.

---

## 7. Completion Flow — Simple (No Questions, No Score Multiplier)

**As the user, I want to complete a chore with a single tap, so that logging is frictionless.**

- Tapping "Complete" records the completion with the current timestamp.
- XP is calculated and immediately added to my total.
- The card updates in place (no page reload).
- Edge case: a timestamp in the future is rejected.

---

## 8. Completion Flow — With Questions

**As the user, I want to answer structured questions when completing a chore, so that I capture the required data.**

- Tapping "Complete" on a question chore opens a modal with all questions.
- The modal is scrollable on small screens.
- All required questions must be answered; optional questions may be left blank.
- TEXT answers are validated against the question's regex pattern (if set).
- INTEGER answers are validated against the question's min/max bounds (if set).
- ENUM answers must be one of the defined choices for that question.
- If any validation fails: the form displays the errors and no completion is created.
- On success: the modal closes and the card updates.

---

## 9. Completion Flow — With Score Multiplier

**As the user, I want to enter a quantity when completing a score-multiplier chore, so that the XP reflects how much effort I put in.**

- When a chore has a score multiplier, the completion modal shows the multiplier prompt as a number input.
- The input enforces `min = 1`, `step = 1` for integer answer type; `min = 0.0001, step = any` for float.
- Below the input, a hint shows `÷ {repetitionFactor}` to indicate how the answer affects XP.
- The answer must be > 0. A zero or missing answer blocks submission.
- On submit, XP is computed as: `round(base × (answer ÷ repetitionFactor) × streak_mult × decay_mult)`.

---

## 10. XP System

### 10.1 Base XP

**As the user, I want each chore to have a clear effort level, so that harder chores reward more XP.**

- Preset XP sizes map to base XP on a Fibonacci-like scale: XXS→2, XS→3, S→5, M→8, L→13, XL→21, XXL→34, XXXL→55.
- A custom positive integer XP value can be set instead of a preset size.
- Final XP per completion is rounded to the nearest integer.

### 10.2 Streak bonus

**As the user, I want consistent streaks to boost my XP, so that habit-building is rewarded.**

- At streak = 0, I earn exactly the base XP.
- As my streak grows, a multiplier climbs toward a configured maximum (default 2.5×), approaching it asymptotically.
- When the chore's pack has `streak: false`, the streak multiplier is always 1 and streak counts are not shown on cards.

### 10.3 Decay plateau

**As the user, I want the bonus to level off over time, so that the system stays balanced.**

- A decay factor falls toward a configured floor (default 0.6×) as total lifetime completions of that chore grow.
- When the chore's pack has `decay: false`, the decay factor is always 1.

### 10.4 Score multiplier

**As the user, I want to earn XP proportional to my effort, so that doing more is more rewarding.**

- When a chore has a score multiplier enabled, the XP formula is:
  `XP = round(base × (answer ÷ repetitionFactor) × streak_mult × decay_mult)`
- `answer` is the number the user enters at completion time.
- If the chore has no score multiplier, the formula reduces to `round(base × streak_mult × decay_mult)`.

### 10.5 Streak break

**As the user, I want a missed window to reset my streak, so that the system stays fair.**

- If the previous completion was not within the immediately preceding recurrence window, the streak resets to 1 before XP is computed.

### 10.6 Immutable history

**As the user, I want my past XP records to be permanent, so that changes to settings do not retroactively alter what I earned.**

- XP earned is recorded at completion time and never recalculated.

### 10.7 XP configurations

**As the user, I want to choose from named XP formula configurations, so that I can tune the difficulty to my taste.**

- Each configuration has a name (e.g., "Standard", "Hard Mode") and its own values for maximum streak multiplier, decay floor, and half-life rates.
- A "Standard" configuration exists by default and is pre-selected, with `maxStreakMultiplier = 2.5` and `decayFloor = 0.6`.
- The active configuration is shown on the profile page.

---

## 11. Chore Details Page

**As the user, I want to review a chore's full details and completion history, so that I can track my progress for that chore.**

- Navigating to `/chores/:encodedChoreKey` opens the Chore Details Page.
- The page shows: back button, full title and description (no truncation), XP size, recurrence, streak summary, and a completion history table.
- Clicking a chore card's body navigates here.
- The old `/chores/:encodedChoreKey/completions` route redirects to the Chore Details Page.

### 11.1 Completion history table

- Columns: **Completed at** (formatted local date/time), one column per question in question order, **XP earned**.
- Rows are sorted newest-first.
- Empty state: "No completions yet."
- ENUM answers are displayed as the human-readable choice label, not the internal identifier.
- If the stored identifier no longer matches any current choice, the raw value is shown as a fallback.
- BOOLEAN answers are displayed as `true` or `false`.

---

## 12. CDP Import/Export

### 12.1 Importing a CDP (ZIP upload)

**As the user, I want to import a CDP ZIP, so that I can use packs shared by others.**

- The import dialog accepts a ZIP file upload.
- On re-import of a matching pack ID, the user chooses: Update (additive) or Alias (new separate pack under a different ID).

### 12.2 Importing a CDP (URL)

**As the user, I want to import a CDP by URL, so that I don't have to download files manually.**

- The URL is normalised automatically: GitHub, GitLab, and GitHub Enterprise browser URLs (tree/blob views) are converted to raw CDN URLs. A `/__pack__.yaml` suffix is stripped before matching.
- After a successful import, the app navigates directly to the new pack's page.
- The source URL (in normalised form) is stored on the pack for future updates.

### 12.3 Date-shifting on import

**As the user, I want to choose a start date when importing a pack, so that the schedule fits my plans.**

- When a pack has `allowShiftOnImport: true`, the import dialog shows a date-shift step.
- If the pack has a `targetDate`: a two-column grid shows Start Date and Target Date inputs; editing either recomputes the other to preserve the original offset.
- If the pack has no `targetDate`: a single Start Date input is shown.
- All chore start dates are shifted by the same delta.

### 12.4 Exporting a CDP

**As the user, I want to download a pack as a CDP ZIP, so that I can share it with others.**

- The "Download as CDP" action in the pack kebab menu generates and downloads a ZIP in the browser.
- The ZIP structure: `<packId>/<packId>/__pack__.yaml` + one YAML per active chore.
- The manifest includes `author` (composed from the user's display name and email) and `createdAt` (ISO 8601 timestamp of export).
- Only active chores are included; questions and completion history are excluded.

### 12.5 Updating an imported pack

**As the user, I want to update an imported pack from its source URL, so that I get new chores and changes.**

- Imported packs (with a stored source URL) show a `↻` refresh button in the sidebar and on the pack page header.
- Clicking it opens the CDP import dialog, which lists updatable packs and applies the additive update.

---

## 13. Sync

### 13.1 Automatic sync

**As the user, I want my data to sync automatically, so that I don't have to remember to do it.**

- A pull runs at app startup.
- A push is debounced 10 seconds after every write; the page also pushes on unload if there is unsaved state.
- After 3 consecutive push failures, sync stops and a persistent error banner appears: "Sync failed after 3 attempts. [Retry now]." Tapping Retry resets the counter and retries immediately.

### 13.2 First launch

**As the user, I want the app to set up sync automatically, so that I don't have to configure anything.**

- A sync key bundle is generated automatically on first launch.
- A non-blocking notice prompts the user to export and store the key file safely. The app is fully usable without acting on this.

### 13.3 Conflict resolution

- On pull, if the server state is newer than local (by `lastSyncedAt` timestamp): the server state is imported.
- If local is newer: local state is retained and pushed to update the server.
- Last-write-wins; granular merge is not supported.

### 13.4 App state export

**As the user, I want to export my app state, so that I can make a local backup.**

- The export option offers two formats:
  - **Encrypted** (default) — compressed and AES-256-GCM encrypted with the current sync key; produces a `.enc` file.
  - **Plain** — unencrypted JSON.
- Import auto-detects format by file extension.
- The sync key itself is **never** included in exported app state.

---

## Appendix: Edge Case Index

| Edge case | Section |
|---|---|
| Newly-added question removed — no count mismatch on save | §6.2 |
| Saved question removed — soft-delete / restore UI | §6.2 |
| Soft-deleted question excluded from reordering | §6.2 |
| Regex pattern invalid syntax — rejected at save | §6.4 |
| Regex pattern catastrophic backtracking — rejected at save | §6.4 |
| Malformed recurrence — chore still appears on dashboard | §3.1 |
| Future completion timestamp rejected | §7 |
| Question form validation failure — no completion created | §8 |
| Score multiplier answer ≤ 0 — blocks submission | §9 |
| Recurrence start date defaults to today if not specified | §5.1 |
| Move chore — collision with existing choreId blocks save | §5.5 |
| Delete pack — completions preserved under UUID-format key | §4.6 |
| Duplicate & Edit cancelled — duplicate is kept | §5.4 |
