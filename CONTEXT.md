# Tasks Harmony

A single-user PWA for tracking recurring chores, where completing chores on time earns XP and builds streaks.

## Language

**Chore**:
A recurring task the user has committed to doing on a schedule. Each chore belongs to exactly one Pack. Chores have: a name, optional description (Markdown), XP size (preset or custom integer), frequency, interval, window start time, repeatable flag, optional due period, and an optional score multiplier. A deactivated chore is hidden from the dashboard but visible (greyed out) on its pack page; it can be reactivated from there. When archive mode is active, deactivated chores are referred to as archived chores (see **Archive Mode**).
_Avoid_: Task, habit, todo

**Pack**:
A named group of Chores. Every chore belongs to a pack. Users can create multiple packs; a built-in "personal" pack exists as the default. Each pack has a dedicated page showing a filtered dashboard with that pack's chores.

Pack settings (managed via the Pack Options modal):
- **streak**: when `false`, streak multiplier is fixed at 1 for all chores in the pack and streak counts are hidden (default `true`)
- **decay**: when `false`, decay factor is treated as 1 for all chores (default `true`)
- **defaultXPSize**: pre-fills the XP size field for new chores created in this pack
- **xpTarget**: optional XP goal; a progress bar shows `packXP / xpTarget`; a "Completed" badge replaces it once met
- **targetDate**: optional deadline; a time bar shows elapsed progress toward it; a "Lapsed" badge shows when past
- **allowShiftOnImport**: when `true`, the CDP import dialog shows a date-shift step

Navigation uses a responsive vertical sidebar. Desktop: a fixed left sidebar always visible, containing the XP counter, a Dashboard link, one link per pack, a `+` New Pack button, and a Profile link. Mobile: a compact top bar with a hamburger button that opens the sidebar as a left-side drawer overlay.

Imported packs (those with a `sourceUrl`) show a `↻` refresh button in the sidebar pack list and on the pack page header. Clicking it opens the CDP import dialog, which handles updates.

The pack options modal consolidates: title, description, streak toggle, decay toggle, default XP size, XP target, target date, and allow-shift toggle. Destructive or export actions (Download as CDP, Delete Pack) remain directly in the kebab menu.
_Avoid_: Group, category, collection

**Archive Mode**:
A UI mode toggled via `archiveMode`. When active, the dashboard and pack pages replace the normal chore list with a construction-site banner and a flat alphabetical list of archived (deactivated) chores. Cards are read-only: Complete and quick-answer buttons are disabled, and the card dropdown is reduced to Delete only. Deleting a chore in archive mode opens a Dialog (not `window.confirm`) explaining that completion history is permanently lost but total XP earned is preserved.
_Avoid_: Read-only mode, maintenance mode

**Chore Definition Pack (CDP)**:
A ZIP file containing a `__pack__.yaml` manifest and one `.yaml` file per chore. The pack ID is the name of the root folder inside the ZIP (not stored in the manifest). The manifest contains: display name and optional metadata (author, creation date, license, revision, revision history, streak flag, decay flag, xpTarget, targetDate, allowShiftOnImport). Each chore YAML contains: name, description, XP size, frequency, interval, window start time, repeatable flag, due period, and questions. Start date is not included — it is chosen per chore by the user at import time, defaulting to today. Completion history is excluded.

CDPs can be imported via ZIP upload or publicly accessible URL. The source URL is normalised before fetching: common GitHub, GitLab, and GitHub Enterprise browser URLs (tree/blob views, including `/__pack__.yaml` suffix) are automatically converted to fetchable raw URLs. The stored `sourceUrl` is always in normalised form. After a successful URL import, the app navigates directly to the new pack's page. When `allowShiftOnImport` is `true`, the import flow shows a date-shift step — the user picks a start date and all chore start dates shift by the same delta.

User-created packs can be exported as CDPs (ZIP download). The export embeds `author` (composed from the user's display name and email) and `createdAt` timestamp in the manifest. Only active chores are included.

On re-import of a matching pack ID via ZIP upload, the user chooses: Update (additive — new/changed chores applied, absent chores untouched) or Alias (import as a new separate pack). "Update from URL" (per-pack when a source URL is stored) re-fetches from the known URL and applies the additive update.
_Avoid_: Pack (that's the in-app concept after import), template

**Window**:
The time interval in which one Completion of a Chore is expected, defined by the chore's recurrence rule (frequency + interval + start date + window start time). Frequency is daily, weekly, or monthly — daily is the smallest unit. The window start time (default 00:00) offsets window boundaries from midnight, allowing chores with late-night natural completion times (e.g. a daily chore with window start 18:00 runs 18:00→18:00).

If a chore has a **Due Period**, the chore's status is `upcoming` until `windowEnd − duePeriod`; only inside that final segment does status become `due`. Without a due period, the full window counts as `due` from the moment it opens.
_Avoid_: Period, slot, due date

**Streak**:
The count of consecutive Windows in which a Chore was completed. Resets to 1 (not 0) when a Window is missed. For repeatable chores, a window counts as completed if it contains at least one Completion. When the chore's pack has `streak: false`, streak counts are not shown and the streak multiplier is fixed at 1.
_Avoid_: Combo, run, chain

**Completion**:
A single recorded instance of marking a Chore done. Stores the XP earned, streak count, and any Question answers. A non-repeatable Chore allows at most one Completion per Window; a repeatable Chore allows unlimited Completions per Window, each earning XP independently. Streak for repeatable chores counts consecutive windows with at least one completion. On the dashboard, a repeatable chore that has been completed at least once in the current window shows as Completed with a "Complete again" button.

`completedAt` and answers can be amended after creation (see **Amend completion**); XP is recalculated on amendment. Streak stored on a completion is not recalculated when an existing completion is amended.
_Avoid_: Entry, record, log

**Log past completion**:
A user action that records a Completion in a past Window that has no completion yet. Accessible from the split-button dropdown on `CompleteButton` (disabled when no eligible past windows exist). Opens a modal with a window selector (lists eligible past windows as date ranges), a `completedAt` picker, and the answers form. XP and streak are computed the same way as a regular completion, but using the caller-supplied timestamp. Store action: `recordRetroactiveCompletion(choreKey, { completedAt, answers })`.
_Avoid_: Back-fill, retroactive entry

**Amend completion**:
A user action that edits an existing Completion's `completedAt` timestamp (constrained to within the completion's original window) and/or answers. Accessible via the Edit button on each row of the completion history table (`CompletionsTable`) on the Chore page. XP is recalculated and overwritten on save; streak stored on the completion is not recalculated. Store action: `amendCompletion(id, { completedAt, answers })`.
_Avoid_: Edit completion, update completion, correct completion

**Total Completions**:
The count of previous Completions for a specific Chore, not including the one currently being recorded. Used as the decay input in the XP formula. Scoped per-chore, not global.
_Avoid_: Completion count, history length

**XP** (Experience Points):
Integer points earned per Completion. Calculated at completion time and stored on the Completion record. Recalculated and overwritten when a completion is amended.
_Avoid_: Points, score, experience

**Base XP**:
The XP a Chore would earn at streak=1 and total_completions=0 (first-ever completion, no history), before any multipliers. Determined by the Chore's XP size. Preset scale (Fibonacci): XXS→2, XS→3, S→5, M→8, L→13, XL→21, XXL→34, XXXL→55. A custom positive integer can be entered instead of a preset size.
_Avoid_: Default XP, raw XP

**Score Multiplier**:
An optional per-chore feature that scales earned XP by a user-entered number at completion time. Configured via a collapsible "Score Multiplier" section in the chore form: enable toggle, prompt text, Repetition Factor (positive integer ≥ 1), and answer type (integer or float). The XP formula with a score multiplier becomes: `round(base × (answer ÷ repetitionFactor) × streak_mult × decay_mult)`. At most one score multiplier per chore. The chore form renders a live formula display showing all active factors (base, answer/repetition factor, streak, decay). The streak factor is displayed as a percentage range (e.g. `100%–250%`) rather than a raw multiplier range (e.g. `1–2.5`), consistent with how the decay factor is displayed.
_Avoid_: Weight, multiplier question, MULTIPLIER type

**Due Period**:
An optional per-chore setting that delays the transition from `upcoming` to `due` status until near the end of the recurrence window. Expressed as a value and unit (minutes, hours, days, weeks, or months; unit must be ≤ the chore's frequency unit). Omitting the field preserves the default behaviour (full window = due from window open). Exported in CDP chore YAML.
_Avoid_: Grace period, buffer

**XP Settings**:
A named configuration of the XP formula parameters (maxStreakMultiplier, decayFloor, streakApproachRate, decayApproachRate). One configuration is active at a time. Changing the active configuration does not retroactively alter recorded XP.
_Avoid_: XP config, difficulty settings, multiplier settings

**Question**:
A structured data field attached to a Chore, presented as a form on each Completion. Has a type (TEXT, INTEGER, BOOLEAN, ENUM), a required flag, and type-specific constraints. Questions can be added during chore creation (not only after the chore exists).
_Avoid_: Field, prompt, form field

**Schema Validation**:
All data originating from external files (JSON or YAML) must be validated against a JSON schema before further processing. This applies to: the AppState JSON blob pulled from the sync server, CDP `__pack__.yaml` manifests, and CDP chore `.yaml` files. The AJV library enforces schemas at the boundary; invalid data throws with a descriptive error before any record is written to IndexedDB.
_Avoid_: Runtime type assertions, silent coercion of unknown data

**Sync**:
The process of keeping the full app state consistent across devices via the app server. Sync is end-to-end encrypted — the server stores opaque ciphertext and never sees plaintext app data. Sync runs automatically: a pull happens at startup, and a debounced push (10 s delay) fires after every write. Authentication uses a post-quantum challenge-response protocol (ML-DSA-87 signatures). Encryption uses a KEM-based hybrid scheme (ML-KEM-1024 for key encapsulation, AES-256-GCM for the blob). The user's sync identity and key are stored in a dedicated IndexedDB `credentials` store, separate from app state, and are never included in app state exports. App state exports default to encrypted format using the same key.
_Avoid_: Backup, upload, save, WebDAV

**Sync Key**:
A post-quantum key bundle (ML-KEM-1024 + ML-DSA-87) generated once per installation. Determines the user's `syncId` (a 64-char hex string derived from both public keys) that identifies the encrypted blob on the server. Can be exported to a JSON file for backup or multi-device setup and imported to restore access or align multiple devices to the same blob.
_Avoid_: Encryption key, API key, password
