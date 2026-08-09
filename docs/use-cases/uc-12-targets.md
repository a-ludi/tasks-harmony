# Use Case 12 — Targets

Targets turn a repeating chore into a finite collection challenge. When a chore has at least one question, the user can pre-define a list of **Targets** — named answer sets representing items to collect. The goal is to complete every target exactly once. A progress bar tracks how many have been done, and an optional set-completion bonus awards extra XP when the last target is first completed.

---

## Background

- The user is Lars
- Lars has a chore "Ride the tram to all terminal stations" — size M, weekly, with one question "Terminal Station?" (ENUM: Northgate, Southgate, Eastgate, Westgate, Harbour)
- The chore has no completions yet when the scenarios begin (unless stated otherwise)

---

## Scenario T1: Define targets on a new chore

Given Lars has created the "Ride the tram" chore with the "Terminal Station?" question
When Lars opens ChoreFormModal to edit the chore
Then a "Targets" section appears below the Questions section
When Lars clicks "Add target"
Then TargetFormModal opens at Step 1
And since there are no existing completions, Step 1 shows no import options
When Lars clicks "Skip — enter manually"
Then Step 2 shows an answer field for "Terminal Station?"
When Lars types "Northgate" and clicks "Save"
Then a target row "Northgate" appears in the Targets section
When Lars repeats this for Southgate, Eastgate, Westgate, and Harbour
Then five target rows are listed
When Lars sets the set-completion bonus to 50 XP and saves the chore
Then the chore is saved with five targets and a 50 XP bonus

---

## Scenario T2: Add targets to a chore that already has completions (import flow)

Given Lars has already completed the chore once with Terminal Station? = "Northgate"
And that completion has no linked target
When Lars opens ChoreFormModal and clicks "Add target"
Then TargetFormModal opens at Step 1
And Step 1 shows the unlinked "Northgate" completion as an importable row
When Lars clicks the "Northgate" row to import it
Then Step 2 opens pre-filled with Terminal Station? = "Northgate"
When Lars clicks "Save"
Then a "Northgate" target is added and the existing completion is linked to it
And the target is shown as already completed in the Targets list

---

## Scenario T3: Complete a target via TargetPickerModal

Given the chore has five targets (Northgate completed, four pending)
When Lars opens the chore card and clicks "Complete"
Then TargetPickerModal opens instead of the standard CompletionModal
And Step 1 shows a TargetsTable with five rows
And the "Northgate" row is greyed out (already done)
And the four pending rows are interactive
When Lars clicks the "Southgate" row and then "Complete"
Then a new completion is recorded with Terminal Station? = "Southgate" linked to the Southgate target
And the progress bar updates to 2 / 5

---

## Scenario T4: Complete a target when the answer field needs filling

Given the "Eastgate" target has no pre-filled answer for a second question "Notes?" (TEXT, optional)
When Lars picks "Eastgate" in TargetPickerModal and clicks "Complete"
Then Step 2 opens showing the "Notes?" answer field
When Lars types "Nice view from up top" and clicks "Save"
Then the completion is recorded with Terminal Station? = "Eastgate" and Notes? = "Nice view from up top"

---

## Scenario T5: Set-completion celebration on the last target

Given four of five targets are completed
When Lars opens TargetPickerModal and picks the last pending target "Harbour"
And clicks "Complete"
Then the completion is recorded
And a celebration screen appears showing:
  - A trophy graphic and a confetti burst
  - The total target count (5 targets)
  - The bonus XP earned (50 XP)
When Lars dismisses the screen
Then the celebration does not appear again on future completions of the same chore

---

## Scenario T6: Progress bar on ChoreCard

Given the chore has five targets with two completed
When Lars views the chore card on the dashboard
Then the card shows a progress bar with label "2 / 5"
And the bar is partially filled
When all five targets are completed
Then the progress bar is replaced by a green "Completed" pill

---

## Scenario T7: Targets toggle on ChorePage

Given the chore has five targets, three completed and two pending
When Lars opens the chore detail page
Then the completion history shows three real completion rows
And a "Show targets" toggle is visible
When Lars clicks "Show targets"
Then two additional greyed-out rows appear in the history, one for each pending target
And the toggle label changes to "Hide targets"
When Lars clicks "Hide targets"
Then the greyed-out rows disappear and only real completion rows remain

---

## Scenario T8: Remove all targets from a chore

Given the chore has five targets and three linked completions
When Lars opens ChoreFormModal
And deletes all five target rows
And saves the chore
Then the chore no longer has any targets
And the three previously linked completions remain in history as plain completions (no target link)
And the bonus XP already awarded for those completions is preserved
And the progress bar no longer appears on the chore card

---

## Scenario T9: Mutual exclusivity with Quick Answer Sets

Given the chore has one or more targets defined
When Lars opens ChoreFormModal
Then the "Quick Answer Sets" section is not shown
When Lars removes all targets and saves
Then the "Quick Answer Sets" section becomes visible again
And no Quick Answer Set data is lost
