# UC-9 — Score Multiplier

The user configures a score multiplier on a chore so that XP scales with how many sets or units they complete.

---

## Background

- The user is editing a chore called "Push-ups"
- XP size: M (8 XP base)
- Active XP settings: Standard (maxStreakMultiplier = 2.5, decayFloor = 0.6)

---

## Scenario: Enable score multiplier

When the user opens the edit form for "Push-ups"
And enables the Score Multiplier section
And enters "How many sets?" as the prompt
And sets Repetition Factor to 3
And selects "Integer" as the answer type
And clicks "Save"
Then the chore is saved with a score multiplier configured

---

## Scenario: Formula display reflects score multiplier

When the score multiplier is enabled with Repetition Factor 3
Then the formula display shows:
  `XP = round(8 × answer ÷ 3 × 1–2.5 × 60%–100%)`
And the decay and streak factors are shown as ranges

---

## Scenario: Completing a score-multiplier chore

Given "Push-ups" has a score multiplier with prompt "How many sets?" and Repetition Factor 3
When the user clicks "Complete" on the "Push-ups" card
Then the completion modal shows a number input labelled "How many sets?"
And a hint below the input shows "÷ 3"

---

## Scenario: Earning XP with score multiplier

Given streak = 1 (multiplier ≈ 1), total completions = 0 (decay ≈ 1), Repetition Factor = 3
When the user enters 6 in the answer input
And clicks "Submit"
Then XP earned is round(8 × (6 ÷ 3) × 1 × 1) = 16

---

## Scenario: Zero or missing answer is rejected

When the user leaves the score multiplier answer blank
And clicks "Submit"
Then an inline error appears
And no completion is created

---

## Scenario: Pack with streak disabled hides streak factor

Given the "Push-ups" chore is in a pack with `streak: false`
When the user views the formula display
Then the streak factor is not shown
And the formula shows: `XP = round(8 × answer ÷ 3 × 60%–100%)`
