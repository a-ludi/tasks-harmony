# UC-2b — Repeatable Chore

A chore marked as repeatable allows multiple completions within the same recurrence window.

---

## Background

- The user has two chores:
  - "Drink water" — daily, repeatable, already completed once today
  - "Morning run" — daily, not repeatable, already completed today
- The user's total XP is 30

---

## Scenario: Repeatable completed chore shows "Complete again"

When the user opens the dashboard
Then the "Drink water" card shows status "Completed"
And a "Complete again" button is visible on the "Drink water" card

---

## Scenario: Completing again adds XP a second time

Given the user's XP is 30
When the user clicks "Complete again" on the "Drink water" card
Then the XP counter increases again
And the card remains in the "Completed" state

---

## Scenario: Non-repeatable completed chore has no "Complete again"

When the user opens the dashboard
Then the "Morning run" card shows status "Completed"
And no "Complete again" button is visible on the "Morning run" card
