# Sprint Features Design — 2026-06-11

Issues: #35, #30, #38, #2

---

## #35 — GitHub link in nav menu

A plain anchor link at the bottom of the off-canvas nav menu, below the update button (when present). Text: "View on GitHub". Opens in a new tab. Points to the repository README URL. No icon required (deferred to menu cleanup, issue #39).

---

## #30 — PWA splash screen

**Android/Chrome** — already handled by the existing manifest (`background_color: '#ffffff'`, 512px icon). No changes needed.

**iOS** — requires static `apple-touch-startup-image` PNG assets at specific dimensions per device:

1. Use `pwa-asset-generator` CLI to generate splash PNGs from `icon-template.svg` — white background, icon centred and scaled — at all required iOS sizes.
2. Inject `<link rel="apple-touch-startup-image">` meta tags into `index.html` via `vite-plugin-pwa` config or as static entries.
3. Generated images go in `public/` and are committed to the repo.

---

## #38 — Markdown in descriptions

**Scope:** chore descriptions and pack descriptions — both editing and display.

**Editor:** Milkdown WYSIWYG editor replaces the current plain `<textarea>`. Presets: `commonmark` + `gfm` (commonmark provides the required `doc` node; gfm extends it). Plugins: `history`, `indent`, `block`, `emoji`, `listener`. The editor outputs and stores raw Markdown.

**Toolbar:** A formatting toolbar sits above the editor inside the same `MilkdownProvider`. Buttons dispatch Milkdown commands via `editor.action(callCommand(...))`. Use `onMouseDown` + `e.preventDefault()` on each button so the editor does not lose focus. Buttons are defined as a pure exported `TOOLBAR_ITEMS` array (testable without DOM). Separators visually group related buttons.

Toolbar buttons (in order):

| Label | Title | Command | Payload |
|---|---|---|---|
| B | Bold | `toggleStrongCommand` | — |
| *I* | Italic | `toggleEmphasisCommand` | — |
| ~~S~~ | Strikethrough | `toggleStrikethroughCommand` | — |
| `` ` `` | Inline code | `toggleInlineCodeCommand` | — |
| *(sep)* | | | |
| H1 | Heading 1 | `wrapInHeadingCommand` | 1 |
| H2 | Heading 2 | `wrapInHeadingCommand` | 2 |
| H3 | Heading 3 | `wrapInHeadingCommand` | 3 |
| *(sep)* | | | |
| • | Bullet list | `wrapInBulletListCommand` | — |
| 1. | Ordered list | `wrapInOrderedListCommand` | — |
| > | Blockquote | `wrapInBlockquoteCommand` | — |
| ``` | Code block | `createCodeBlockCommand` | — |

**Display:** Milkdown in read-only mode wherever a description is rendered (chore cards, pack pages, detail views). No toolbar in display mode.

**Storage:** no schema change — descriptions are already plain strings; Markdown is valid plain text.

**Styling:** rendered output uses a scoped `prose` class (Tailwind Typography plugin — `@tailwindcss/typography`, needs to be added as a dependency) for consistent heading/list/link styling without leaking into surrounding UI.

---

## #2 — Conscious Releases

### Changelog pipeline

`changelog.json` is the source of truth — an array of all version entries, newest first:

```json
[
  {
    "version": "0.4.0",
    "date": "2026-06-10",
    "highlights": ["..."],
    "sections": {
      "Added": ["..."],
      "Fixed": ["..."]
    }
  }
]
```

A build script regenerates `CHANGELOG.md` from `changelog.json`. Claude generates highlights during each release (see CLAUDE.md). `changelog.json` is included in the Vite build so the service worker caches it.

### Update detection

`vite-plugin-pwa` changes from `registerType: 'autoUpdate'` to `'prompt'`. The `useRegisterSW` hook exposes a `needRefresh` signal. When triggered, the app fetches `/changelog.json` from the server (cache bypassed) to get the latest version data, compares against `import.meta.env.VITE_APP_VERSION`, and opens the update modal.

### Update modal

Shown automatically when a new version is detected (subject to dismissal rules below).

Content:
- Version number
- Highlights (from the latest release only)
- Expandable full changelog (all `sections` entries for every version between the running version and the latest, inclusive)

Actions:
- **Update now** — calls `updateServiceWorker()` then `location.reload()`
- **Remind me later** — dismisses; re-shows on next calendar day (dismissal date stored in `localStorage`)
- **Ignore update** — stores the dismissed version string in `localStorage`; modal never auto-opens for this version again, but the nav badge and menu button remain visible

### Version-skipping behaviour

If the user is on v1.0.0 and skips v1.1.0, and v1.2.0 is deployed:
- Highlights shown: v1.2.0 only
- Full changelog: all sections from v1.1.0 and v1.2.0 concatenated

### Nav indicators

- **Burger menu icon** — badge dot when an update is available
- **Nav menu footer** — "Update to vX.Y.Z" pill button above the GitHub link; clicking reopens the modal
- Both indicators remain visible even after "Ignore update"

---

## Out of scope

- #33 (Completable chore packs) — deferred
- #36 (No-streak packages) — deferred
- Rollback / downgrade support
- Background silent downloads
- Markdown editor in CDP import flow (descriptions imported from YAML render as Markdown but are not editable inline)
