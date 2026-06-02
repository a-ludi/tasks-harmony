# UC-7 — Edge Cases

Behaviours that protect data integrity and graceful degradation when data is malformed.

---

## Background

- The user has two chores:
  - "Morning run" — a normal daily chore, due today
  - "Broken chore" — a chore with a malformed recurrence record (missing `startDate`)

---

## Scenario: Malformed chore still appears on dashboard

When the user opens the dashboard
Then "Broken chore" appears in the chore list
And it does not crash or blank the page
And "Morning run" also appears normally

---

## Scenario: Malformed chore shows no due/overdue badge

When the user opens the dashboard
Then the "Broken chore" card shows no overdue or due-today indicator
And "Morning run" shows its normal status badge

---

## Scenario: Future timestamp is rejected

Given the system clock is at time T
When a completion is submitted with a timestamp more than 1 second in the future
Then the completion is rejected with an error
And no XP is added

---

## Scenario: Completion with valid timestamp is accepted

Given the system clock is at time T
When a completion is submitted with the current timestamp
Then the completion is recorded successfully
And XP is added to the total
