# Usage

Orbital puts three sidebar workflows — relations, dangling links, and recent notes —
into a single pane. This page walks through opening the pane and the everyday tasks
you'll repeat.

## First use

Open the pane with the **Orbital: Open** command from the command palette
(`Cmd/Ctrl-P`). It docks in the right sidebar as one pane with three tabs:
**Relations**, **Dangling links**, and **Recent notes**.

![The Relations tab for the active note](../assets/orbital-relations-statusbar.png)

The Relations tab always reflects the **active note** and updates as you switch
notes (debounced, so rapid switching doesn't flicker).

## Common workflows

### Explore a note's relations

The Relations tab groups everything connected to the active note:

- **Outgoing** — links this note makes to others.
- **Backlinks** — notes that link back to this one.
- **2nd hop** — related notes one step further out, deduplicated and excluding notes
  you already link directly.
- **Unlinked mentions** — notes that mention this note's name (or an alias) in plain
  text without linking it. Collapsed by default; expand it to scan on demand.
- **Missing** — unresolved link targets in this note. Use **Manage →** to jump to the
  Dangling links tab pre-filtered to those targets.

Click a row to open it in the current pane; Mod-click (or middle-click) opens it in a
new tab.

### Fix dangling links in bulk

The Dangling links tab lists unresolved link targets. Switch the scope between
**Vault** and the active note's folder, and toggle grouping between **target** and
**source**. The search box to the right of the scope toggle fuzzy-filters the list
by target name or source path as you type.

![Dangling links grouped by target](../assets/orbital-dangling-target.png)

![The same links grouped by source](../assets/orbital-dangling-source.png)

> These actions edit the **dangling link's text inside your notes** — they don't touch
> a target file. There is no target note to begin with (the link is unresolved), so
> **Create note** is the only action that ever creates a file, and nothing here deletes
> a note.

Each row offers four actions — **rename**, **change to alias**, **create note**, and
**delete**:

- **Rename** rewrites every reference to a new target. If the new name matches an
  existing note or spelling, the references merge onto it. A preview shows how many
  occurrences across how many files will change.

  ![The rename preview, with occurrence count and an undo warning](../assets/orbital-dangling-rename.png)

- **Change to alias** replaces the broken link with an alias pointing at an existing
  note you pick from a fuzzy list.

  ![Choosing the existing note to alias to](../assets/orbital-dangling-alias.png)

- **Create note** creates a note for the target (in the folder set in your settings)
  and resolves the references.
- **Delete** unwraps the link, leaving its text as plain text in your notes
  (`[[Inbox]]` → `Inbox`, `[[Inbox|capture]]` → `capture`). It does **not** delete any
  note. From the **source** grouping you can scope this to a single note.

  ![Delete across every file…](../assets/orbital-dangling-delete-target.png)

  ![…or only in one note](../assets/orbital-dangling-delete-source.png)

Every write operation is preview-confirmed and **cannot be undone** — back up your
vault first, as each dialog warns.

### Browse recent notes

The Recent notes tab is a most-recent-first list of opened notes.

![The Recent notes tab](../assets/orbital-recent.png)

Click a row to open it (Mod-click for a new tab), drag a row into an editor to insert
a `[[wikilink]]` at the drop point, remove a single entry with its **×**, or
**Clear list** to empty it. The list length and folder/tag exclusions are configurable
(see below).

### In-note backlinks (`orbital-backlinks`)

An `orbital-backlinks` code block renders the **containing note's** backlinks inline, in reading view and live preview. Drop it anywhere in a note to see which other notes link to it, without opening the Relations sidebar. The block updates automatically as links across the vault change.

#### Creating the block

An empty block works immediately with no configuration:

````markdown
```orbital-backlinks
```
````

#### Config keys

All keys are optional. Omit any key to use its default.

| Key | Values | Default |
|-----|--------|---------|
| `display` | `compact` or `context` | `compact` |
| `folder` | comma-separated folder paths | _(no constraint)_ |
| `folder-exclude` | comma-separated folder paths | _(none)_ |
| `tag` | comma-separated tags (`#` optional) | _(no constraint)_ |
| `tag-exclude` | comma-separated tags (`#` optional) | _(none)_ |
| `style` | `dense` or `cards` (context only) | _(the **Context style** setting)_ |
| `collapse` | `true` or `false` (context only) | _(the **Collapse context by default** setting)_ |

**`display`** — `compact` (default) shows one clickable title per source note. `context` shows the text surrounding each link; see [Display modes](#display-modes) below.

**`style`** — context-mode visual style: `dense` (compact list with a vertical rule) or `cards` (one bordered card per source). Overrides the **Context style** setting for this block. Ignored in compact mode.

**`collapse`** — `true` starts each context group folded; `false` starts them expanded. Overrides the **Collapse context by default** setting for this block. Ignored in compact mode.

**`folder` / `folder-exclude`** — match on path-segment boundaries, subfolders included. `Research` matches `Research/paper.md` but not `Researchers/x.md`. Supply a comma-separated list to match multiple folders.

**`tag` / `tag-exclude`** — nested-tag aware. `tag: #active` matches notes tagged `#active` or `#active/now`. Matches both inline and frontmatter tags. The leading `#` is optional in the config.

Two plugin settings under **Settings → Orbital → In-note backlinks** set the
context-mode defaults (**Context style** and **Collapse context by default**);
every other option lives in the block's markdown source. A block's `style:` /
`collapse:` keys override those settings.

#### Display modes

**Compact** (default): one clickable title per source note, uncapped. Click to open the note; Mod-click (Cmd/Ctrl) opens it in a new tab. Hover with the Page preview core plugin enabled for a preview popover.

**Context**: under each source note the block shows a windowed snippet (~90 characters on each side) of the line where the link appears, with the link text highlighted.

- Each source has a **chevron**; click the chevron or the source title to fold/unfold that group. Start folded with `collapse: true` (or the setting).
- **Click a context line to open** the source note scrolled to that line. Mod-click opens it in a new tab.
- Choose the look with `style: dense` (default) or `style: cards` (or the **Context style** setting).
- If a source note links to the containing note on **two different lines**, you see two snippets under that source.
- If two links to the containing note appear on the **same line**, the line is shown once with both occurrences highlighted.
- Context mode is soft-capped at **50 source notes**; if more exist, a "… and N more" notice appears at the end of the block.

An unrecognised `display`, `style`, or `collapse` value falls back to the default and shows an inline warning.

#### Filter precedence

Multiple values within a key are OR'd — `folder: Projects, Areas` matches sources in either folder.

Filters across different keys are AND'd — `folder: Projects` combined with `tag: #active` shows only sources that are inside Projects **and** carry `#active`.

**Exclude keys always win.** A source matched by `folder-exclude` or `tag-exclude` is hidden regardless of what the include keys say.

Concrete example: a block with `folder: a/b` and `folder-exclude: a` — a source at `a/b/note.md` satisfies the include (it is inside `a/b`), but the exclude wins (it is a subfolder of `a`), so the source is hidden.

Orbital's global exclusion settings (path/tag patterns in **Settings → Orbital → Advanced**) are applied on top of, and independently of, the block's own filters.

#### Limitations

- The block always shows backlinks to the note it lives in; there is no way to target a different note.
- No second-hop (transitive) relations.
- No sort or limit options; sources appear in index order.
- Fold state is per-block and is not persisted across reloads.

#### Example

````markdown
```orbital-backlinks
display: context
folder: Projects, Areas
tag: #active
tag-exclude: #draft
```
````

This block shows backlinks from notes inside `Projects` or `Areas`, tagged `#active` (or any nested tag such as `#active/now`), excluding any that also carry `#draft`. Each source displays the line of text where the link appears, with the link highlighted.

## Tips and shortcuts

- **Mod-click / middle-click** any relation or recent row to open it in a new tab.
- **Hover** a row with the core *Page preview* plugin enabled to get a preview popover.
- **Status bar:** the Orbital item shows backlink / 2nd-hop counts for the active note —
  click it to jump straight to the Relations tab. Toggle it in settings.
- **Manage →** in the Missing section deep-links to the Dangling links tab filtered to
  that target; **Show all** restores the full list.
- Choose the default tab, count badges, exclusions, and more under **Settings → Orbital**.

## See also

- [Configuration](configuration.md) — every setting Orbital exposes.
- [Troubleshooting](troubleshooting.md) — common issues and how to get help.
