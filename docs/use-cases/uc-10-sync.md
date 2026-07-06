# UC-10 — Sync

The user relies on automatic sync to keep data consistent across devices and uses key management to set up a second device.

---

## Background

- The user has the app installed on Device A
- On first launch, a sync key bundle was generated automatically

---

## Scenario: Sync happens automatically on startup

When the user opens the app
Then the app silently pulls the latest state from the server
And if the server state is newer than local: it is imported
And if local is newer: local state is pushed to the server

---

## Scenario: Data is synced after a write

When the user completes a chore
Then the app queues a push
And approximately 10 seconds later the push is sent to the server automatically
And the sync status on the profile page shows the updated "Last synced" timestamp

---

## Scenario: Sync error banner appears after repeated failures

Given the sync server is unreachable
When the user completes three chores (triggering three consecutive failed pushes)
Then a persistent banner appears: "Sync failed after 3 attempts. [Retry now]"
And automatic sync pauses

---

## Scenario: Manual retry clears the error banner

When the user taps "Retry now" in the sync error banner
Then the app immediately attempts a push
And on success: the banner disappears
And automatic sync resumes

---

## Scenario: Export sync key for backup

When the user opens the profile page
And clicks "Export sync key"
Then a file "tasks-harmony-sync-key.json" is downloaded
And the file contains the ML-KEM and ML-DSA key bundle in base64url encoding

---

## Scenario: Import sync key on a second device

Given the user has exported the key file from Device A
When the user opens the profile page on Device B
And clicks "Import sync key"
And selects the key file
Then a confirmation dialog warns that importing will make existing Device B server data inaccessible
When the user confirms
Then Device B uses the imported key bundle
And the next startup pull downloads Device A's data
And both devices are now syncing to the same blob

---

## Scenario: Encrypted app state export

When the user exports the app state
Then the default format is "Encrypted" (.enc file)
And the file is compressed and AES-256-GCM encrypted with the current sync key
And the sync key itself is not included in the export

---

## Scenario: Sync key is not included in app state export

When the user exports the app state in either Plain or Encrypted format
Then the exported file does not contain the sync key bundle
And importing that file on another device does not grant sync access
