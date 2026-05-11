# Tasks Harmony — Design Spec

**Date:** 2026-05-11

## Overview

Tasks Harmony is a multi-user web application that gamifies recurring chores (household tasks, training, taxes, etc.). Each user manages their own independent chore pool. Users earn XP by completing chores; streak bonuses and decay multipliers create a dynamic reward curve. Chores may require structured data entry on completion.

---

## Architecture & Infrastructure

**Stack:**
- Django 5.x + Gunicorn, PostgreSQL 16
- HTMX for partial page updates (card swaps, modals)
- Alpine.js — included in base template from the start; unused in Phase 1, activated in Phase 2 for optimistic offline UI
- Bootstrap 5 for styling
- WhiteNoise for static file serving in development; nginx can replace it in production

**Docker Compose:**
- `docker-compose.yml` — base config with `db` (PostgreSQL 16) and `web` (Gunicorn) services
- `docker-compose.override.yml` — dev overrides: `runserver`, volume mounts, debug settings

**Django app structure:**
- `accounts` — authentication and user profiles
- `chores` — ChoreDefinition, ChoreInstance, recurrence, completion, questions
- `xp` — XP formula, XPSettings model, calculation logic

---

## Data Model

### accounts app

**Profile** (one-to-one with Django's built-in `User`)
- `total_xp` — running integer sum of all earned XP
- `xp_settings` → `XPSettings` FK — which formula configuration applies to this user

### xp app

**XPSettings** — named formula configuration, managed centrally in Django admin
- `name` — e.g. "Standard", "Hard Mode"
- `max_streak_multiplier` — default `2.0`
- `streak_approach_rate` — controls how fast streak bonus approaches max (exponential rate constant); default `0.1`
- `decay_approach_rate` — controls how fast decay approaches floor (exponential rate constant); default `0.05`
- `decay_floor` — default `0.5`

Multiple XPSettings rows can exist; users are assigned to one via `Profile.xp_settings`. A "Standard" row is created in a data migration and serves as the default for new users.

### chores app

**ChoreDefinition** — the reusable blueprint (shareable in the future)
- `creator` → `User` FK
- `name`, `description`
- `xp_size` — choice field using cleaned Fibonacci scale:
  XXS=0.5, XS=1, S=2, M=3, L=5, XL=8, XXL=13, XXXL=21
  Final XP is rounded to the nearest integer at completion time.
- `recurrence` — iCalendar RRULE string via `django-recurrence`, supporting presets (daily/weekly/monthly), custom intervals (every N days/weeks/months), and day-of-week schedules, in any combination

**ChoreInstance** — execution context, one per user per definition
- `definition` → `ChoreDefinition` FK
- `owner` → `User` FK
- `streak_count` — consecutive completions within their respective windows; updated lazily at completion time (reset to 1 if the previous window was missed, incremented otherwise)
- `last_completed_at` — used for streak break detection and window status computation
- `is_active` — soft-pause/removal flag

Creating a chore automatically creates the creator's ChoreInstance. Future sharing means other users get their own ChoreInstance pointing to the same ChoreDefinition.

**Question** — ordered per ChoreDefinition
- `definition` → `ChoreDefinition` FK
- `order` — display order
- `text` — question prompt
- `required` — boolean
- `type` — `TEXT` / `INTEGER` / `BOOLEAN` / `ENUM`
- `regex_pattern` — optional, TEXT only
- `min_value`, `max_value` — optional integers, INTEGER only

**QuestionChoice** — for ENUM questions
- `question` → `Question` FK
- `label`, `order`

**ChoreCompletion**
- `instance` → `ChoreInstance` FK
- `completed_at` — client-submitted timestamp (see Completion Flow)
- `xp_earned` — stored at completion time; immutable even if formula settings later change

**CompletionAnswer**
- `completion` → `ChoreCompletion` FK
- `question` → `Question` FK
- `text_value`, `integer_value`, `boolean_value`, `enum_value` → `QuestionChoice` FK
  Only the column matching the question type is populated.

---

## XP System

### Formula

Both modifiers are functions of `ChoreInstance.streak_count`:

```
streak_mult  = max_mult − (max_mult − 1) × e^(−k_streak × streak_count)
decay_mult   = decay_floor + (1 − decay_floor) × e^(−k_decay × streak_count)
effective_xp = round(base_xp × streak_mult × decay_mult)
```

- At `streak_count = 0`: both multipliers are `1.0`; user earns exactly base XP.
- As streak grows: `streak_mult` climbs toward `max_mult` (default 2.0); `decay_mult` falls toward `decay_floor` (default 0.5). XP rises early then stabilises.
- On streak break: `streak_count` resets to `0`; both multipliers snap back to `1.0`.

### Implementation

`xp.calculate_xp(base_xp: Decimal, streak_count: int, settings: XPSettings) -> int` — a pure function with no Django ORM dependencies. Easy to unit-test in isolation.

### Ledger

`Profile.total_xp` is updated transactionally on each completion. `ChoreCompletion.xp_earned` provides an immutable historical record.

---

## Recurrence & Window Logic

Recurrence is stored as an RRULE string on `ChoreDefinition`. Window logic is computed server-side:

- **Due window**: the interval `[last_occurrence, next_occurrence)` based on the recurrence rule and current datetime.
- **Status** of a ChoreInstance:
  - **Overdue** — the due window has closed without a completion since its start (prominent highlight)
  - **Due** — currently within the due window, not yet completed (highlighted)
  - **Completed** — `last_completed_at` falls within the current window
  - **Upcoming** — next window has not yet opened

**Streak break detection** — on every completion, the server checks whether `last_completed_at` falls within the previous window. If not, `streak_count` resets to `1` before XP is computed.

---

## Dashboard & Completion Flow

### Dashboard

A single page listing all active ChoreInstances for the authenticated user. Each card shows: name, current effective XP, streak count, recurrence cadence, and status. Cards are sorted/grouped by status (overdue first, then due, then completed, then upcoming).

### Completion — no questions

The "Complete" button fires an HTMX POST to `/chores/{instance_id}/complete/`. The server:
1. Validates the submitted `completed_at` timestamp (see below).
2. Detects streak break; updates `streak_count` and `last_completed_at`.
3. Computes and stores `xp_earned`; updates `Profile.total_xp` transactionally.
4. Creates `ChoreCompletion`.
5. Returns an HTML fragment replacing the chore card with its new state.

### Completion — with questions

The "Complete" button fires an HTMX GET that loads a question form in a modal. On submit, the server validates all answers (required check, regex, integer range, enum membership) and, if valid, runs the same completion steps above plus creates `CompletionAnswer` rows. Returns the updated card fragment and an out-of-band swap closing the modal.

### Client-submitted timestamp

Every completion POST includes a `completed_at` field (ISO 8601, client-generated, injected via `hx-vals` or a hidden input). The server validates:
- Not in the future.
- Not older than `COMPLETION_TIMESTAMP_MAX_AGE_HOURS` (default: `48`, set in `settings.py`).

Invalid timestamps return a 400. This prepares Phase 2 offline sync — queued completions replay with the original offline timestamp.

---

## Chore Management

Users create, edit, and deactivate chores through standard Django form views (rendered server-side, submitted via HTMX for inline feedback where useful).

**Create chore** — form covering ChoreDefinition fields (name, description, xp_size, recurrence) plus an inline question builder. The question builder allows adding, reordering, and removing questions; each question shows type-specific constraint fields (regex for TEXT, min/max for INTEGER, choice list for ENUM). On save, both the ChoreDefinition and the owner's ChoreInstance are created in a single transaction.

**Edit chore** — same form, editing the ChoreDefinition. Changes to xp_size or recurrence take effect from the next completion; historical ChoreCompletions are unaffected.

**Deactivate chore** — sets `ChoreInstance.is_active = False`; the instance no longer appears on the dashboard.

---

## Offline Support

### Phase 1 — View-only offline

- Service worker caches the app shell (base HTML, Bootstrap, HTMX, Alpine.js) on install.
- Dashboard and visited chore detail pages are cached with a network-first strategy.
- When offline: cached pages are served; the "Complete" button is hidden or disabled.
- App is installable as a PWA (web manifest + icons).

### Phase 2 — Full offline completion

Implemented as a separate milestone after a manual review gate.

When the user completes a chore offline:

1. Alpine.js intercepts the HTMX POST and immediately updates the card to "completed" state (optimistic UI).
2. The pending completion (instance ID, `completed_at`, answers) is stored in IndexedDB.
3. On reconnect, the Background Sync API (or an `online` event handler in the SW) replays queued completions.
4. The server applies idempotency checks (duplicate instance ID + `completed_at`) and reconciles streak/XP.
5. The dashboard refreshes (HTMX poll or server-sent event) once sync completes.

---

## Testing

Tests are organised into three layers: unit, integration, and end-to-end. Each test is linked to the spec section it covers. The stack is pytest + pytest-django for unit/integration, Playwright for end-to-end and offline.

### Unit tests

**XP System**
- `calculate_xp` at `streak_count=0` returns exactly `base_xp`
- `calculate_xp` with rising streak approaches but never exceeds `max_streak_multiplier × base_xp`
- `calculate_xp` with high streak approaches but never goes below `decay_floor × base_xp`
- Net XP at infinite streak converges to `max_streak_multiplier × decay_floor × base_xp`
- Custom `streak_approach_rate`, `decay_approach_rate`, `max_streak_multiplier`, `decay_floor` values are respected

**Recurrence & Window Logic**
- Status `due`: current time falls within the open window, no completion in window
- Status `overdue`: window has closed, no completion recorded
- Status `completed`: `last_completed_at` falls within current window
- Status `upcoming`: next window has not yet opened
- Streak break detection: `last_completed_at` outside the previous window → `streak_count` resets to `1`
- No streak break: `last_completed_at` inside the previous window → `streak_count` increments

**Answer validation (Completion Flow)**
- TEXT answer with invalid regex pattern is rejected
- INTEGER answer outside `min_value`/`max_value` range is rejected
- Required question with no answer is rejected
- ENUM answer referencing a choice not belonging to the question is rejected
- Optional question with no answer passes validation

**Timestamp validation (Completion Flow)**
- Timestamp in the future is rejected with 400
- Timestamp older than `COMPLETION_TIMESTAMP_MAX_AGE_HOURS` is rejected with 400
- Valid timestamp within bounds is accepted

### Integration tests

**Data Model**
- Creating a chore creates both `ChoreDefinition` and owner's `ChoreInstance` in one transaction; partial failure leaves neither
- Deactivating a `ChoreInstance` removes it from the dashboard query
- `XPSettings` "Standard" row exists after running migrations

**XP System**
- `Profile.total_xp` equals the sum of all `ChoreCompletion.xp_earned` for that user
- `ChoreCompletion.xp_earned` is not recalculated when `XPSettings` change after the fact

**Dashboard**
- Dashboard response includes cards for all four statuses when each is present
- Overdue cards appear before due cards before completed cards before upcoming cards

**Completion — no questions (Completion Flow)**
- POST to `/chores/{id}/complete/` returns an HTML fragment (not a full page)
- `ChoreCompletion` row is created with the client-submitted `completed_at`
- `ChoreInstance.streak_count` increments on consecutive in-window completions
- `ChoreInstance.streak_count` resets to `1` after a missed window
- `Profile.total_xp` increases by `xp_earned` atomically

**Completion — with questions (Completion Flow)**
- HTMX GET to the question modal URL returns a form containing all questions for the chore
- Valid answers create `CompletionAnswer` rows with correct typed columns populated
- Submission with a validation error returns the form with error messages and creates no `ChoreCompletion`

**Chore Management**
- Create form saves `ChoreDefinition` + `ChoreInstance` and redirects to dashboard
- Edit form updates `ChoreDefinition` fields; existing `ChoreCompletion` records are unaffected
- Inline question builder correctly creates, reorders, and removes `Question` and `QuestionChoice` rows

### End-to-end tests (Playwright)

**Dashboard (Dashboard & Completion Flow)**
- All four card states render with visually distinct styling (overdue, due, completed, upcoming)
- No full page reload occurs when completing a chore (assert via `page.on("framenavigated")`)
- Completing a chore with no questions: card transitions to "completed" state inline
- Completing a chore with questions: modal opens, answers submitted, modal closes, card updates

**Chore Management**
- Full create flow: fill form including question builder, submit, chore appears on dashboard
- Edit flow: change name and xp_size, confirm card on dashboard reflects new values

**Phase 1 offline (Offline Support)**
- Using Playwright's `context.set_offline(True)`, assert the dashboard is served from cache
- Assert the "Complete" button is absent or disabled when offline

**Phase 2 offline (Offline Support)**
- Using Playwright's `context.set_offline(True)`, complete a chore while offline
- Assert the card immediately shows "completed" state (optimistic UI)
- Assert the pending completion is present in IndexedDB
- Restore connectivity with `context.set_offline(False)`
- Assert the completion POST is replayed and the server records a `ChoreCompletion`
- Assert the dashboard refreshes to reflect the synced state
