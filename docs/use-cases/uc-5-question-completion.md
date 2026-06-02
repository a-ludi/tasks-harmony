# UC-5 — Completing a Chore with Questions

The user completes a chore that requires structured data entry via a modal.

---

## Background

- The user has a due chore "Workout log" with four questions:
  - "Notes" — TEXT, optional, regex `^\w+.*` (must start with a word character)
  - "Duration (minutes)" — INTEGER, required, min 1, max 300
  - "Stretched?" — BOOLEAN, required
  - "Intensity" — ENUM, required, choices: "Low", "Medium", "High"

---

## Scenario: Tapping Complete opens the question modal

When the user clicks "Complete" on the "Workout log" card
Then a modal opens containing all four questions

---

## Scenario: Modal is scrollable on small viewports

Given the device viewport is narrow (e.g. 375px wide)
When the question modal is open
Then the modal content is scrollable and no questions are cut off

---

## Scenario: Submit valid answers

When the user fills in:
  | Question              | Answer  |
  | Notes                 | Great   |
  | Duration (minutes)    | 45      |
  | Stretched?            | Yes     |
  | Intensity             | Medium  |
And clicks "Submit"
Then the modal closes
And the "Workout log" card updates to status "Completed" without a page reload
And XP is added to the total

---

## Scenario: Required field left blank blocks submission

When the user leaves "Duration (minutes)" blank
And clicks "Submit"
Then an inline error appears on "Duration (minutes)"
And the modal stays open
And no completion is created

---

## Scenario: Optional field can be left blank

When the user leaves "Notes" blank and fills in all required fields
And clicks "Submit"
Then the completion is accepted

---

## Scenario: TEXT answer failing regex blocks submission

When the user enters "  " (spaces only) in the "Notes" field
And fills in all other required fields
And clicks "Submit"
Then an inline error appears on "Notes" indicating the pattern was not matched
And no completion is created

---

## Scenario: INTEGER answer below minimum blocks submission

When the user enters "0" in "Duration (minutes)"
And clicks "Submit"
Then an inline error appears on "Duration (minutes)"
And no completion is created

---

## Scenario: INTEGER answer above maximum blocks submission

When the user enters "301" in "Duration (minutes)"
And clicks "Submit"
Then an inline error appears on "Duration (minutes)"
And no completion is created

---

## Scenario: Invalid ENUM answer blocks submission

Given the "Intensity" question has choices "Low", "Medium", "High"
When an answer outside those choices is submitted (e.g. via programmatic input)
Then the submission is rejected
And no completion is created
