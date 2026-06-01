# Tasks Harmony

A single-user PWA for tracking recurring chores, where completing chores on time earns XP and builds streaks.

## Language

**Chore**:
A recurring task the user has committed to doing on a schedule. Each chore belongs to exactly one Pack. A deactivated chore is hidden from the dashboard but visible (greyed out) on its pack page; it can be reactivated from there.
_Avoid_: Task, habit, todo

**Pack**:
A named group of Chores. Every chore belongs to a pack. Users can create multiple packs; a built-in "personal" pack exists as the default. Packs can be exported as ZIP file downloads (producing a CDP). Imported packs come from CDPs. The pack's ID is derived from the folder name containing `__pack__.yaml` (dash-case ASCII). An imported pack may be given a user-defined alias, which becomes its effective pack ID within the installation (`${alias}/${choreId}`) to avoid collisions. The mapping between alias and original pack ID is retained to support future updates from the source CDP. Each pack has a dedicated page; the dashboard shows all chores from all packs with the pack name visible on each card. Navigation uses a burger menu with responsive off-canvas rendering. Nav order: Profile (top), Dashboard, then a Packs section listing each pack. A "+" icon next to the Packs heading opens an auxiliary menu with: Create Personal, Import from ZIP, Import from URL. Personal packs are fully editable (chores and metadata). Imported packs are read-only — chore definitions cannot be edited until the user triggers "Make Personal Copy", which detaches the pack from its source (removes URL, in-sync state, and Update from URL), converts it to a personal pack, and enables full editing. The pack retains its ID/alias after conversion.
_Avoid_: Group, category, collection

**Chore Definition Pack (CDP)**:
A ZIP file containing a `__pack__.yaml` manifest and one `.yaml` file per chore. The pack ID is the name of the root folder inside the ZIP (not stored in the manifest). The manifest contains: display name and optional metadata (author, creation date, license, revision, revision history — all free-form and manual). Each chore YAML contains: name, description, XP size, frequency, interval, window start time, repeatable flag, and questions. Start date is not included — it is chosen per chore by the user at import time, defaulting to today. CDPs can be imported via ZIP upload or publicly accessible URL; the source URL is stored if provided. User-created Packs can be exported as CDPs (ZIP download). On re-import of a matching pack ID via ZIP upload, the user chooses: Update (additive — new/changed chores applied, chores absent from the new CDP left untouched, completions unaffected) or Alias (import as a new separate pack under a different ID). Replace (full sync — chores absent from the new CDP are deactivated) is defined but out of scope for v1 as it requires a deactivated-chores UI.

"Update from URL" (available per-pack when a source URL is stored) re-fetches from the known URL; only Update is offered — Alias is not available because the pack identity is already established by the URL.

Each chore imported via URL carries an **in-sync / out-of-sync** state, determined after the last "Update from URL" fetch by comparing the fetched definition against the local one. Out-of-sync chores have pending changes not yet applied. This state is not available for ZIP-imported chores. If the pack was imported via URL, a per-pack "Update from URL" button re-fetches the source and triggers the same flow.
_Avoid_: Pack (that's the in-app concept after import), template

**Window**:
The time interval in which one Completion of a Chore is expected, defined by the chore's recurrence rule (frequency + interval + start date + window start time). Frequency is daily, weekly, or monthly — daily is the smallest unit. The window start time (default 00:00) offsets window boundaries from midnight, allowing chores with late-night natural completion times (e.g., a daily chore with window start 18:00 runs 18:00→18:00, so a completion at 00:30 falls in the previous evening's window).
_Avoid_: Period, slot, due date

**Streak**:
The count of consecutive Windows in which a Chore was completed. Resets to 1 (not 0) when a Window is missed. For repeatable chores, a window counts as completed if it contains at least one Completion.
_Avoid_: Combo, run, chain

**Completion**:
A single recorded instance of marking a Chore done. Stores the XP earned, streak count, and any Question answers — all immutable after creation. A non-repeatable Chore allows at most one Completion per Window; a repeatable Chore allows unlimited Completions per Window, each earning XP independently. Streak for repeatable chores counts consecutive windows with at least one completion. On the dashboard, a repeatable chore that has been completed at least once in the current window shows as Completed with a "Complete again" button.
_Avoid_: Entry, record, log

**Total Completions**:
The count of previous Completions for a specific Chore, not including the one currently being recorded. Used as the decay input in the XP formula. Scoped per-chore, not global.
_Avoid_: Completion count, history length

**XP** (Experience Points):
Integer points earned per Completion. Calculated at completion time and stored immutably on the Completion record.
_Avoid_: Points, score, experience

**Base XP**:
The XP a Chore would earn at streak=1 and total_completions=0 (first-ever completion, no history). Determined solely by the Chore's XP size. Scale (Fibonacci): XXS→2, XS→3, S→5, M→8, L→13, XL→21, XXL→34, XXXL→55.
_Avoid_: Default XP, raw XP

**XP Settings**:
A named configuration of the XP formula parameters (maxStreakMultiplier, decayFloor, streakApproachRate, decayApproachRate). One configuration is active at a time. Changing the active configuration does not retroactively alter recorded XP.
_Avoid_: XP config, difficulty settings, multiplier settings

**Question**:
A structured data field attached to a Chore, presented as a form on each Completion. Has a type (TEXT, INTEGER, BOOLEAN, ENUM), a required flag, and type-specific constraints.
_Avoid_: Field, prompt, form field

**Schema Validation**:
All data originating from external files (JSON or YAML) must be validated against a JSON schema before further processing. This applies to: the AppState JSON blob pulled from WebDAV, CDP `__pack__.yaml` manifests, and CDP chore `.yaml` files. The AJV library enforces schemas at the boundary; invalid data throws with a descriptive error before any record is written to IndexedDB.
_Avoid_: Runtime type assertions, silent coercion of unknown data

**Sync**:
The process of writing the full app state as a single JSON blob to a WebDAV endpoint and reading it back. Protected by ETag-based optimistic concurrency (If-Match header). Triggered manually by the user; not automatic.
_Avoid_: Backup, upload, save
