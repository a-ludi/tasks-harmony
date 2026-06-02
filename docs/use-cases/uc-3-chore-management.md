# UC-3 — Chore Management

The user edits an existing chore and deactivates another.

---

## Background

- The user has two chores:
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

## Scenario: Deactivate a chore

When the user deactivates "Take vitamins"
Then "Take vitamins" disappears from the dashboard
And "Floss teeth" remains visible
