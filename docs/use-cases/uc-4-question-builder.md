# UC-4 — Setting Up a Chore with Questions

The user attaches structured questions to a chore so that each completion requires data entry.

---

## Background

- The user is creating a new chore called "Workout log"
- The chore form is open

---

## Scenario: Add one question of each type

When the user adds a TEXT question with prompt "Notes"
And adds an INTEGER question with prompt "Duration (minutes)" and minimum 1
And adds a BOOLEAN question with prompt "Stretched?"
And adds an ENUM question with prompt "Intensity" and choices "Low", "Medium", "High"
And clicks "Save"
Then the chore is created with four questions attached

---

## Scenario: Reorder questions with up/down controls

Given the chore form has questions: "Notes", "Duration", "Stretched?", "Intensity"
When the user moves "Intensity" up twice
Then the order becomes: "Notes", "Intensity", "Duration", "Stretched?"

---

## Scenario: Remove a newly-added question before saving

Given the user has added a new TEXT question "Mood"
When the user removes "Mood"
Then "Mood" disappears from the question list immediately
And the form can be saved without a count mismatch error

---

## Scenario: Soft-delete a saved question

Given the chore already has a saved question "Notes"
When the user marks "Notes" for deletion
Then "Notes" appears faded with a "Restore" option
And it is not removed until the user clicks "Save"

---

## Scenario: Restore a soft-deleted question

Given the user has marked "Notes" for deletion
When the user clicks "Restore" on "Notes"
Then "Notes" returns to its normal appearance
And it is saved normally when the form is submitted

---

## Scenario: Soft-deleted question is excluded from reordering

Given "Notes" is marked for deletion and "Duration" is above it
When the user tries to move "Duration" down
Then "Notes" is skipped and "Duration" moves past only active questions

---

## Scenario: Invalid regex is rejected at save

When the user adds a TEXT question with regex pattern "["
And clicks "Save"
Then an error is shown indicating the regex pattern is invalid
And the chore is not saved

---

## Scenario: Catastrophically-backtracking regex is rejected at save

When the user adds a TEXT question with regex pattern "(a+)+"
And clicks "Save"
Then an error is shown indicating the regex pattern is unsafe
And the chore is not saved

---

## Scenario: ENUM choices are managed as a list

When the user adds an ENUM question
Then choices are added and removed via individual controls, not a plain text field
And choices can be reordered
