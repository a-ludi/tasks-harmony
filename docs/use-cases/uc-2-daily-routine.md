# UC-2 — Daily Routine

The user opens the app during a normal day and works through their chore list.

---

## Background

- The user has four chores:
  - "Take vitamins" — daily, due yesterday, not completed (overdue)
  - "Floss teeth" — daily, due today, not completed (due)
  - "Read book" — daily, due today, already completed today
  - "Monthly budget review" — monthly, next window starts in 20 days (upcoming)
- The user's total XP is 50

---

## Scenario: Chores are grouped and ordered correctly

When the user opens the dashboard
Then the chores appear in this order:
  1. "Take vitamins" with status "Overdue"
  2. "Floss teeth" with status "Due"
  3. "Read book" with status "Completed"
  4. "Monthly budget review" with status "Upcoming"

---

## Scenario: Each card shows required fields

When the user opens the dashboard
Then the "Floss teeth" card shows:
  - The chore name
  - The XP value
  - The current streak count
  - The recurrence cadence
  - A status badge

---

## Scenario: Complete a due chore

When the user clicks "Complete" on the "Floss teeth" card
Then the card status changes to "Completed" without a full page reload
And the XP counter in the navigation bar increases
And the user's scroll position is preserved

---

## Scenario: Completed chore has no Complete button

When the user opens the dashboard
Then the "Read book" card does not show a "Complete" button

---

## Scenario: Overdue chore can still be completed

When the user clicks "Complete" on the "Take vitamins" card
Then the card status changes to "Completed"
And XP is added to the total

---

## Scenario: Upcoming chore has no Complete button

When the user opens the dashboard
Then the "Monthly budget review" card does not show a "Complete" button
