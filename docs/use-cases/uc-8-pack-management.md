# UC-8 — Pack Management

The user creates packs, configures their settings, and exports one as a CDP.

---

## Background

- The user has one pack: "Personal" (the default)
- The user's display name is "Alice" and email is "alice@example.com"

---

## Scenario: Create a new pack

When the user clicks the "+" button in the sidebar Packs section
Then a "New Pack" dialog opens with a name field
When the user enters "Morning Routines"
And clicks "Create"
Then the dialog closes
And the app navigates to `/packs/morning-routines`
And "Morning Routines" appears in the sidebar

---

## Scenario: Pack page shows only that pack's chores

Given the "Morning Routines" pack has chores "Brush teeth" and "Make bed"
And the "Personal" pack has chore "Floss"
When the user navigates to the "Morning Routines" pack page
Then only "Brush teeth" and "Make bed" are shown
And "Floss" is not shown

---

## Scenario: Pack options — configure streak and decay

When the user opens the pack options for "Morning Routines"
And disables "Streaks enabled"
And disables "Decay enabled"
And clicks "Save"
Then chore cards in "Morning Routines" no longer show streak counts
And XP earned in "Morning Routines" uses streak multiplier = 1 and decay factor = 1

---

## Scenario: Pack XP progress bar

Given "Morning Routines" has an XP target of 500
And the user has earned 200 XP in the pack
When the user navigates to the pack page
Then an amber progress bar shows "200 / 500 XP"

---

## Scenario: XP target reached

Given "Morning Routines" has an XP target of 200
And the user earns a completion that brings total to 200
When the user views the pack page
Then a "Completed" badge replaces the progress bar

---

## Scenario: Export pack as CDP

Given "Morning Routines" has two active chores
When the user clicks "Download as CDP" from the pack kebab menu
Then a ZIP file "morning-routines.zip" is downloaded
And the ZIP contains `morning-routines/__pack__.yaml`
And the manifest includes `author: "Alice <alice@example.com>"`
And the manifest includes a `createdAt` timestamp
And deactivated chores are excluded

---

## Scenario: Delete a non-empty pack

Given "Morning Routines" has two chores: "Brush teeth" and "Make bed"
When the user clicks "Delete Pack" from the pack kebab menu
Then a disposition dialog opens showing both chores with Move/Delete toggles
When the user sets "Brush teeth" to Delete
And leaves "Make bed" set to Move (targeting "Personal")
And clicks "Confirm"
Then "Morning Routines" is deleted
And "Make bed" appears in the "Personal" pack
And "Brush teeth" no longer exists
And any completions for "Brush teeth" are preserved in XP history
