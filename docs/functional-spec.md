# Tasks Harmony — Functional Specification

**Goal:** Tasks Harmony gamifies recurring chores (household tasks, training, habits, etc.). The user earns XP for completing chores on time; streaks and a plateau curve reward consistency without runaway scaling. Chores can require structured data entry on completion.

**Scope:** This document captures every behavioural requirement from the original design spec and all implementation plans, with bugs integrated as edge cases. Technology choices, library names, and deployment details are intentionally excluded. The application is single-user and runs locally; there is no authentication and no concept of offline or network connectivity.

---

## Glossary

| Term | Meaning |
|---|---|
| **Chore** | A recurring task the user has committed to doing on a schedule. |
| **Completion** | A single instance of marking a chore as done. |
| **Window** | The time interval defined by a recurrence rule in which one completion is expected. |
| **Streak** | The count of consecutive windows in which the chore was completed. |
| **XP** | Experience points earned per completion; amounts vary by chore size and streak. |
| **XP Settings** | A named configuration of the XP formula (multipliers, decay floor). |
| **Question** | A field attached to a chore that must be filled in on each completion. |

---

## 1. Profile

### 1.1 Viewing stats

**As the user, I want to see my progress summary, so that I know how much I have accomplished.**

- The profile page shows: display name, total XP earned to date, and the name of the active XP settings configuration.

### 1.2 Updating personal info

**As the user, I want to set my display name and email, so that the app feels personal.**

- Changes take effect immediately on save.
- If the new email address is not valid, the update is rejected and the original email is preserved.
- A dismissible success alert confirms the change.

### 1.3 Choosing XP settings

**As the user, I want to select which XP formula configuration applies to me, so that I can tune the difficulty.**

- The profile shows which XP settings configuration is currently active.
- See §7.6 for the available configurations.

---

## 2. Dashboard

### 2.1 Chore card overview

**As the user, I want to see all active chores on a single page, so that I know exactly what needs doing and when.**

- Each card shows: name, description (truncated to approximately two lines), effective XP value, current streak count, recurrence cadence, and current status.
- Cards are grouped and sorted: **Overdue** first, then **Due**, then **Completed**, then **Upcoming**.
- Status badges are visually distinct for each state.
- Edge case: a chore whose recurrence data is malformed (e.g., missing a start date, missing a recurrence rule) must still appear on the dashboard — it must not crash the page or be silently hidden.

### 2.2 Live XP counter

**As the user, I want my total XP in the navigation bar to update the moment I complete a chore, so that progress feels immediate.**

- The XP counter updates in place — no full page reload is required.

### 2.3 Partial card update

**As the user, I want completing a chore to update only that card, so that I don't lose my scroll position or have to wait for a full reload.**

---

## 3. Chore Management

### 3.1 Creating a chore

**As the user, I want to create a chore without leaving the dashboard, so that setup is fast.**

- I fill in: name, optional description, XP size (XXS / XS / S / M / L / XL / XXL / XXXL, representing a Fibonacci-like scale of effort), recurrence frequency (daily / weekly / monthly), interval (every N periods), and start date.
- The start date defaults to today when not specified explicitly.
- Edge case: if the form has validation errors, they are shown inline and no chore is created.

### 3.2 Editing a chore

**As the user, I want to edit an existing chore without leaving the dashboard, so that adjustments are quick.**

- The form opens pre-populated with the chore's current values.
- Changes to XP size or recurrence take effect from the next completion; historical records are unaffected.
- Edge case: if the form has validation errors, they are shown inline and no change is saved.

### 3.3 Deactivating a chore

**As the user, I want to deactivate a chore, so that it no longer appears on my dashboard.**

- A deactivated chore disappears from the dashboard but is not permanently deleted.

---

## 4. Questions — Builder

**As the user, I want to attach questions to a chore, so that I have to record structured data on each completion.**

### 4.1 Question types

Each question has a prompt text, a type, and a required toggle (defaults to **required**):

| Type | Constraints |
|---|---|
| **TEXT** | Optional regex validation pattern |
| **INTEGER** | Optional minimum and maximum values |
| **BOOLEAN** | None |
| **ENUM** | An ordered list of labelled choices |

### 4.2 Building the question list

- I can add questions one at a time.
- I can reorder questions using up/down controls.
- I can remove a question before saving — a newly-added question that is removed is simply discarded; no data is left over.
  - Edge case: the count of pending form entries is kept consistent when a new question is removed, so the subsequent save is never rejected for a count mismatch.
- For existing (already-saved) questions, removing marks the question for deletion visually (faded, with a "Restore" option) but does not delete it until the form is saved.
  - Edge case: a question marked for deletion cannot be reordered — it is excluded from ordering operations.

### 4.3 ENUM choices

- Choices are managed through an add/remove/reorder list — not a plain text field.
- Each choice has a label.
- Choices can be reordered.

### 4.4 Regex validation

- The regex pattern is validated at save time; an invalid pattern is rejected immediately.
- Patterns that could cause catastrophic backtracking (severe slowdowns) are also rejected at save time.

---

## 5. Completion Flow — Simple (No Questions)

**As the user, I want to complete a chore with a single tap, so that logging is frictionless.**

- Tapping "Complete" records the completion with the current timestamp.
- XP is calculated and immediately added to my total.
- The card updates in place (no page reload).
- Edge case: a timestamp in the future is rejected.

---

## 6. Completion Flow — With Questions

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

## 7. XP System

### 7.1 Base XP

**As the user, I want each chore to have a clear effort level, so that harder chores reward more XP.**

- XP size maps to a base XP value on a Fibonacci-like scale:
  XXS → 2, XS → 3, S → 5, M → 8, L → 13, XL → 21, XXL → 34, XXXL → 55.
- Final XP per completion is rounded to the nearest integer.

### 7.2 Streak bonus

**As the user, I want consistent streaks to boost my XP, so that habit-building is rewarded.**

- At streak = 0, I earn exactly the base XP.
- As my streak grows, a multiplier climbs toward a configured maximum (default 2.5×), approaching it asymptotically.

### 7.3 Decay plateau

**As the user, I want the bonus to level off over time, so that the system stays balanced.**

- Simultaneously, a decay factor falls toward a configured floor (default 0.6×) as my **total lifetime completions** of that chore grow.
- The result: a new chore earns boosted XP that tapers off as it becomes routine. Long-term maximum converges to roughly `base × max_multiplier × decay_floor`.

### 7.4 Streak break

**As the user, I want a missed window to reset my streak, so that the system stays fair.**

- If the previous completion was not within the immediately preceding recurrence window, the streak resets to 1 before XP is computed.

### 7.5 Immutable history

**As the user, I want my past XP records to be permanent, so that changes to settings do not retroactively alter what I earned.**

- XP earned is recorded at completion time and never recalculated, even if the XP settings change later.

### 7.6 XP configurations

**As the user, I want to choose from named XP formula configurations, so that I can tune the difficulty to my taste.**

- Each configuration has a name (e.g., "Standard", "Hard Mode") and its own values for maximum streak multiplier, decay floor, and half-life rates.
- A "Standard" configuration exists by default and is pre-selected, with `maxStreakMultiplier = 2.5` and `decayFloor = 0.6`.
- The active configuration is shown on the profile page (see §1.3).

---

## Appendix: Edge Case Index

| Edge case | Section |
|---|---|
| Newly-added question removed — no count mismatch on save | §4.2 |
| Saved question removed — soft-delete / restore UI | §4.2 |
| Soft-deleted question excluded from reordering | §4.2 |
| Regex pattern invalid syntax — rejected at save | §4.4 |
| Regex pattern catastrophic backtracking — rejected at save | §4.4 |
| Malformed recurrence — chore still appears on dashboard | §2.1 |
| Future completion timestamp rejected | §5 |
| Question form validation failure — no completion created | §6 |
| Recurrence start date defaults to today if not specified | §3.1 |
