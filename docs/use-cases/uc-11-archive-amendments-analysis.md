# UC-11 — Archive, Amendments, and Analysis

Covers archiving inactive chores, logging past completions, amending completion records, and analysing completion data in the CompletionsTable.

---

## Background

- The user is Maya
- Maya has a pack "Wellness" containing:
  - "Daily yoga" — size M, daily, interval 1, with a "Mood" question (scale 1–5)
  - "Evening walk" — size S, daily, interval 1
  - "Old meditation" — size XS, daily, interval 1, deactivated (archived)

---

## Scenario A1: Switch to archive mode on the dashboard

When Maya opens the dashboard
And clicks the archive toggle in the toolbar
Then a construction-site banner appears explaining she is viewing archived chores
And the chore list shows only inactive chores in a flat alphabetical list
And "Old meditation" is visible
And "Daily yoga" and "Evening walk" are not shown

---

## Scenario A2: Switch to archive mode on a pack page

When Maya opens the "Wellness" pack page
And clicks the archive toggle
Then the same construction-site banner appears
And only "Old meditation" is shown in the list

---

## Scenario A3: Read-only cards in archive mode

When Maya is in archive mode and views the "Old meditation" card
Then the Complete button is disabled
And the quick-answer button is disabled
And the card dropdown does not contain "Edit" or "Duplicate"

---

## Scenario A4: Delete an archived chore

When Maya is in archive mode
And opens the "Old meditation" card dropdown
And clicks "Delete"
Then a confirmation dialog appears explaining:
  - XP already earned is preserved
  - The completion history will be permanently lost
When Maya clicks "Confirm"
Then "Old meditation" is deleted
And the archive list no longer contains it

---

## Scenario B1: Log a past completion

Given today is 2026-08-09
And "Daily yoga" was not logged on 2026-08-07
When Maya opens the split button dropdown on the "Daily yoga" card
Then "Log past completion" is enabled because at least one eligible past window exists
When Maya clicks "Log past completion"
Then a window selector appears listing closed eligible windows as date ranges
When Maya selects "2026-08-07"
Then the log form opens with `completedAt` pre-set to 2026-08-07
And a "Mood" answer field is shown
When Maya sets mood to 4 and clicks "Save"
Then a new completion is created with `completedAt` 2026-08-07
And XP and streak are computed as if the chore had been completed on that day

---

## Scenario B2: Log past completion with adjusted timestamp

Given today is 2026-08-09
And "Evening walk" was not logged on 2026-08-06
When Maya opens "Log past completion" and selects the window for 2026-08-06
Then the form shows `completedAt` defaulting to 2026-08-06
When Maya changes `completedAt` to 2026-08-06 21:30
And clicks "Save"
Then the new completion is recorded with `completedAt` 2026-08-06 21:30

---

## Scenario B3: Log past completion disabled when no eligible window exists

Given all past windows for "Daily yoga" already have a completion
When Maya opens the split button dropdown on the "Daily yoga" card
Then "Log past completion" is disabled

---

## Scenario C1: Amend a past completion

Given "Daily yoga" has a completion on 2026-08-08 with mood 2 at 07:00
When Maya opens the "Daily yoga" detail page
And finds the 2026-08-08 row in the completion history
And clicks "Edit" on that row
Then the AmendCompletionModal opens pre-filled with:
  - `completedAt`: 2026-08-08 07:00
  - Mood: 2
When Maya changes the mood to 5 and clicks "Save"
Then the completion record is updated with mood 5
And the XP for that completion is recalculated and overwritten
And the streak is unchanged

---

## Scenario C2: Amend completedAt within the window

Given "Daily yoga" has a completion on 2026-08-08 at 07:00
When Maya opens the AmendCompletionModal for that row
And changes `completedAt` to 2026-08-08 19:45
And clicks "Save"
Then the completion's timestamp is updated to 2026-08-08 19:45
And XP is recalculated accordingly

---

## Scenario D1: Sort by a single column

When Maya opens the "Daily yoga" detail page
And clicks the "Mood" column header
Then the completions are sorted ascending by mood
And an ↑¹ badge appears on the "Mood" column header

---

## Scenario D2: Add a secondary sort

Given the completions are sorted ascending by "Mood"
When Maya clicks the "XP earned" column header
Then a ↓² badge appears on the "XP earned" column header
And the completions are sorted first by mood ascending, then by XP earned descending

---

## Scenario D3: Reset sorting

Given two sort criteria are active
When Maya clicks "Reset sorting"
Then all sort badges disappear
And the completions return to their default order

---

## Scenario D4: Group by a column

When Maya clicks "+ Group by"
And selects "Mood"
Then the completions are reorganised into accordion sections, one per mood value
And each section header shows the mood value and a subtotal of XP

---

## Scenario D5: Toggle an accordion group

Given the completions are grouped by "Mood"
When Maya clicks the "Mood: 4" section header
Then the section expands and shows its individual completion rows
When Maya clicks the "Mood: 4" section header again
Then the section collapses

---

## Scenario D6: Export completions as CSV

Given today is 2026-08-09
When Maya clicks "Export ▾"
And selects "Export as CSV"
Then a file download starts with filename `2026-08-09-completions-daily-yoga.csv`
And the file contains ISO-8601 dates and human-readable column headers
