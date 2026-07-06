# UC-1 — First Day

A brand-new user opens the app for the first time and creates their first chore.

---

## Background

- The app database is empty (no chores, no completions)
- The user navigates to `/`

---

## Scenario: Empty state is shown on first visit

When the user opens the dashboard
Then the heading "Dashboard" is visible
And the text "No chores yet." is visible
And a "+ New Chore" button is visible

---

## Scenario: Create a valid chore

When the user clicks "+ New Chore"
Then a chore creation form opens
When the user fills in:
  | Field           | Value   |
  | Name            | Floss   |
  | XP size         | S       |
  | Frequency       | Daily   |
  | Interval        | 1       |
And clicks "Save"
Then the form closes
And a card for "Floss" appears on the dashboard
And the card shows status "Due"

---

## Scenario: First Due Date defaults to today

When the user opens the chore creation form
Then the "First Due Date" field is pre-filled with today's date

---

## Scenario: Questions can be added during creation

When the user opens the chore creation form
And adds a TEXT question with prompt "Notes"
And clicks "Save"
Then the chore is created with the "Notes" question attached
And completing the chore opens the question modal

---

## Scenario: Name is required

When the user opens the chore creation form
And submits the form without entering a name
Then an inline validation error appears on the name field
And no chore is created

---

## Scenario: Interval must be a positive integer

When the user opens the chore creation form
And enters "0" in the interval field
And submits the form
Then an inline validation error appears on the interval field
And no chore is created

---

## Scenario: Upcoming chore does not show as Due

When the user creates a chore with a first due date in the future
Then the card appears on the dashboard with status "Upcoming"
And no "Complete" button is shown
