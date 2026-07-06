# UC-3 — Chore Management

The user edits, duplicates, moves, and deactivates chores.

---

## Background

- The user has two packs: "Personal" (the default) and "Morning"
- The "Personal" pack contains:
  - "Floss teeth" — size S, daily, interval 1
  - "Take vitamins" — size XS, daily, interval 1

---

## Scenario: Edit form opens pre-populated

When the user opens the edit form for "Floss teeth"
Then the form fields are pre-filled with the chore's current values:
  - Name: "Floss teeth"
  - XP size: S
  - Frequency: Daily
  - Interval: 1
  - Pack: Personal

---

## Scenario: Save edited chore

When the user opens the edit form for "Floss teeth"
And changes the name to "Floss & rinse"
And clicks "Save"
Then the form closes
And the card on the dashboard now shows "Floss & rinse"

---

## Scenario: Validation errors block save

When the user opens the edit form for "Floss teeth"
And clears the name field
And clicks "Save"
Then an inline validation error appears on the name field
And the chore is not updated
And the form remains open

---

## Scenario: Move chore to another pack

When the user opens the edit form for "Floss teeth"
And selects "Morning" from the pack dropdown
And clicks "Save"
Then "Floss teeth" disappears from the Personal pack page
And "Floss teeth" appears on the Morning pack page

---

## Scenario: Move chore blocked by collision

Given the "Morning" pack already contains a chore named "Floss teeth"
When the user opens the edit form for "Floss teeth" (Personal)
And selects "Morning" from the pack dropdown
Then an inline error appears indicating a collision
And the save button is disabled

---

## Scenario: Duplicate a chore

When the user selects "Duplicate" from the "Take vitamins" card menu
Then a duplicate dialog opens with:
  - Pack: Personal
  - Name: "Take vitamins (copy)"
When the user clicks "Duplicate"
Then a new chore "Take vitamins (copy)" appears in the Personal pack

---

## Scenario: Duplicate & Edit

When the user selects "Duplicate" from the "Take vitamins" card menu
And clicks "Duplicate & Edit"
Then a new chore is created
And the edit form opens pre-populated with the duplicate's values
When the user cancels the edit form
Then the duplicate remains saved

---

## Scenario: Deactivate a chore

When the user deactivates "Take vitamins"
Then "Take vitamins" disappears from the dashboard
And "Floss teeth" remains visible
