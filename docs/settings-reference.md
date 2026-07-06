# Settings Reference

A deep reference for every Orbital setting, grouped exactly as they appear in
**Settings → Orbital**. For a quick name/type/default table, see
[Configuration](configuration.md); this page adds the effect of each setting and
when you'd want to change it.

## General

These settings appear at the top of the settings tab, above the first heading.

![The settings tab — top settings and the Relations group](../assets/orbital-settings-general-relations.png)

### Default tab

- **Type:** dropdown — Context / Relations / Dangling links / Recent notes
- **Default:** Context
- **Effect:** which tab is shown when the Orbital pane opens.
- **When to change:** pick the tab you open most often so it's there immediately.

### Show counts

- **Type:** toggle
- **Default:** on
- **Effect:** shows item counts on each tab label.
- **When to change:** turn off for a cleaner, label-only tab bar.

### Show status bar item

- **Type:** toggle
- **Default:** on
- **Effect:** shows the Orbital status-bar item with backlink / 2nd-hop counts for the
  active note; clicking it opens the Orbital pane.
- **When to change:** turn off to reclaim status-bar space.

## Context tab

![The Context tab settings group](../assets/settings-context-tab.png)

These settings control the **Context tab** — the first tab, which shows the active
note's backlinks with surrounding context. See the
[Usage guide](usage.md#context-tab) for the tab itself.

### Context amount

- **Type:** dropdown — Compact / Comfortable / Full line / Surrounding lines
- **Default:** Comfortable
- **Effect:** how much surrounding text each backlink snippet shows. **Compact** is a
  tight window (like the code block); **Comfortable** shows the whole sentence; **Full
  line** shows the entire line; **Surrounding lines** adds the dimmed lines before and
  after.
- **When to change:** more context is easier to read in place; less is more scannable.

### Style

- **Type:** dropdown — Dense / Cards
- **Default:** Cards
- **Effect:** the tab's visual style, independent of the code block / footer's own
  style. Also toggleable from the tab's toolbar.

### Sort

- **Type:** dropdown — Recently modified / Mention count / Name
- **Default:** Recently modified
- **Effect:** the order source notes appear in. The tab's sort button cycles through
  these.

### Collapse groups by default

- **Type:** toggle
- **Default:** off
- **Effect:** when on, each source group in the Context tab starts folded. The
  collapse-all toolbar button toggles them.

## Relations

### Second-hop links

- **Type:** toggle
- **Default:** on
- **Effect:** shows related notes two hops away from the active note (notes linked by
  your links or backlinks), deduplicated and excluding notes you already link directly.
- **When to change:** turn off in very large or densely linked vaults to cut noise.

### Second-hop cap

- **Type:** number
- **Default:** 50
- **Effect:** the maximum number of second-hop links displayed. Beyond the cap the list
  is truncated.
- **When to change:** lower it to reduce noise; raise it to see more related notes.

### Show unlinked mentions

- **Type:** toggle
- **Default:** on
- **Effect:** adds an "Unlinked mentions" section to the Relations tab. It scans note
  contents on demand only when you expand it.
- **When to change:** turn off if you don't use it, or to avoid the on-demand scan in
  very large vaults.

### Open unlinked mentions in new tab

- **Type:** toggle
- **Default:** off
- **Effect:** clicking an unlinked mention opens the note in a new tab. (Mod-click
  always opens a new tab regardless of this setting.)
- **When to change:** turn on if you prefer mentions to open alongside the current note.

## In-note backlinks

![The In-note backlinks settings group](../assets/settings-innote-backlinks.png)

The first two settings set the **context-mode defaults** for the `orbital-backlinks`
code block (a block's own `style:` / `collapse:` keys override them); all other
block options — display mode, folder and tag filters — live in the block's markdown
source. The third turns on the automatic footer. See the
[Usage guide](usage.md#in-note-backlinks-orbital-backlinks) for the full syntax.

### Context style

- **Type:** dropdown — Dense / Cards
- **Default:** Dense
- **Effect:** default visual style for context mode — **Dense** (compact list with a
  vertical rule) or **Cards** (one bordered card per source).
- **Override per block:** `style: dense|cards`.

### Collapse context by default

- **Type:** toggle
- **Default:** off (expanded)
- **Effect:** when on, context-mode source groups start folded; click a chevron or
  title to unfold. Fold state is per block and not persisted.
- **Override per block:** `collapse: true|false`.

### Show backlinks footer

- **Type:** toggle
- **Default:** off
- **Effect:** appends the context backlinks view at the end of **every** note, in
  reading view and live preview, separated from the body by a divider. It uses the
  Context style and Collapse settings above, shows `Backlinks: 0` / **No backlinks.**
  on notes with none, and skips notes matched by the Advanced exclusion patterns.
- **When to change:** turn on to see a note's backlinks without adding a code block to
  each note. See [Backlinks footer](usage.md#backlinks-footer).

## Dangling links

![Dangling links and Recent files settings](../assets/orbital-settings-dangling-recent.png)

### Default scope

- **Type:** dropdown — Vault / Folder
- **Default:** Vault
- **Effect:** whether the Dangling links tab lists targets for the whole vault or just
  the active note's folder.
- **When to change:** choose Folder to focus on the area you're currently editing.

### Grouping

- **Type:** dropdown — Target / Source
- **Default:** Target
- **Effect:** groups dangling links by their target (the missing note) or by their
  source file. The source grouping also unlocks per-note deletion.
- **When to change:** use Source when you want to clean up one note at a time.

### New note folder

- **Type:** text (folder path) with folder autocomplete
- **Default:** empty
- **Effect:** the folder where the **Create note** action places new notes. Empty uses
  Obsidian's default location for new notes. Start typing to pick an existing vault
  folder from the suggestion dropdown, or type a path freely.
- **When to change:** set it to route created notes into a specific folder (e.g.
  `Notes/`).

## Recent files

### Recent notes list length

- **Type:** number
- **Default:** 20
- **Effect:** how many recently visited notes the Recent notes tab shows.
- **When to change:** raise it for a longer history; lower it for a shorter list.

## Advanced

![Advanced settings](../assets/orbital-settings-advanced.png)

### Refresh debounce (ms)

- **Type:** number (milliseconds)
- **Default:** 300
- **Effect:** the delay before the Relations tab refreshes after a file change.
  Debouncing prevents flicker when you switch notes rapidly.
- **When to change:** raise it on slower machines or large vaults to reduce churn;
  lower it for snappier updates.

### Exclude path patterns

- **Type:** text area — one pattern per line, plain text or regular expression
- **Default:** empty (nothing excluded)
- **Effect:** files whose path matches any pattern are excluded from Recent notes,
  Relations, and Unlinked mentions. An invalid regex is silently skipped.
- **When to change:** add folders you don't want surfaced, e.g. `Archive/` or
  `Templates/`.

### Exclude tag patterns

- **Type:** text area — one pattern per line, plain text or regular expression
- **Default:** empty (nothing excluded)
- **Effect:** notes carrying a tag that matches any pattern are excluded from Recent
  notes, Relations, and Unlinked mentions. Each tag is matched individually (not as a
  joined blob), and an invalid regex is silently skipped.
- **When to change:** add tags whose notes you want hidden, e.g. `archive` or `private`.

### Debug logging

- **Type:** toggle
- **Default:** off
- **Effect:** emits verbose `[Orbital]` traces to the developer console for diagnostics.
- **When to change:** turn on when reproducing a bug to capture detail for a report
  (see [Troubleshooting](troubleshooting.md)); leave off otherwise.

## See also

- [Configuration](configuration.md) — the at-a-glance name/type/default table.
- [Usage](usage.md) — how these settings play out in each tab.
