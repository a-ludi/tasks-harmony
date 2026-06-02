# UC-6 — Profile

The user views their progress summary and updates their personal information and XP configuration.

---

## Background

- The user has:
  - Display name: "Alice"
  - Email: "alice@example.com"
  - Total XP: 240
  - Active XP configuration: "Standard"
- The app also has a "Hard Mode" XP configuration available

---

## Scenario: Profile page shows required stats

When the user navigates to `/profile`
Then the page shows:
  - Display name "Alice"
  - Total XP 240
  - Active configuration "Standard"

---

## Scenario: Update display name successfully

When the user changes the display name to "Alice B."
And clicks "Save"
Then a dismissible success alert appears
And the displayed name updates to "Alice B."

---

## Scenario: Success alert can be dismissed

When a success alert is shown after saving
And the user dismisses it
Then the alert disappears

---

## Scenario: Invalid email is rejected

When the user changes the email to "not-an-email"
And clicks "Save"
Then an inline error appears on the email field
And the email is not updated
And the original email "alice@example.com" is still shown

---

## Scenario: Valid email is accepted

When the user changes the email to "alice.b@example.com"
And clicks "Save"
Then a success alert appears
And the displayed email updates to "alice.b@example.com"

---

## Scenario: Switch XP configuration

When the user selects "Hard Mode" as the active configuration
And clicks "Save"
Then the profile shows "Hard Mode" as the active configuration
And future completions use the Hard Mode formula
