# Idea — In-note Backlinks Codeblock (`orbital-backlinks`)

> Status: brainstormed & gap-reviewed — ready for `/xdd`.
> Date: 2026-07-03

## Summary

An in-note codeblock that renders the **containing note's linked backlinks**,
inline in the document (reading view + live preview), à la
[obsidian-dynbedded](https://github.com/MMoMM-org/obsidian-dynbedded) but scoped
to Orbital's own link graph. Backlinks can be **filtered by folder and tag**
(include + exclude) and shown in one of two **display modes**: a compact link
list, or a context view with the line where each link appears (like Obsidian's
native Backlinks pane with "Show context").

Content is **always linked backlinks** — the "context" mode is a richer
*presentation* of the same backlinks, not a switch to unlinked mentions.

Explicitly **not** in scope: 2nd-hop relations.

## Requirements (validated with user)

- Delivery: a fenced codeblock, like dynbedded.
- Subject: the **containing note** (via `ctx.sourcePath`) — not configurable in v1.
- Content: **linked backlinks** only (incoming links). No unlinked mentions, no 2nd-hop.
- Filters: by **folder** and **tag**, both **include and exclude**, filtering the
  *source* notes (the notes that link to the subject).
- Display: user chooses **compact** (link only) or **context** (unlinked-mentions-style
  line snippet).

## Chosen approach

**Approach 1 — codeblock processor on Orbital's own core** (selected over
embedding Obsidian's internal backlink renderer, and over a phased compact-first
build).

Rationale: no dependency on undocumented internals → safe for the community
directory and mobile; a pure, unit-testable core mirroring the existing
`relations.ts` / `unlinkedMentions.ts` pattern; consistent look by reusing the
same native CSS classes the `MentionLinkService` already relies on; DRY with the
existing `LinkGraphIndex`.

Rejected:
- **Embed Obsidian's internal `BacklinkView`** — "free" context rendering, but
  relies on undocumented internals (breaks on updates, directory-submission
  risk, filters/modes hard to inject cleanly).
- **Phased (compact first, context later)** — user wants both modes; this is a
  plan-phasing detail, not a distinct architecture.

## Codeblock syntax

Dedicated block language `orbital-backlinks`, flat keys, comma lists. All lines
optional; an empty block = all backlinks, compact.

````markdown
```orbital-backlinks
display: context        # compact (default) | context
folder: Projects, Areas # only sources inside these folders (or subfolders)
folder-exclude: Archive
tag: #active            # only sources carrying these tags
tag-exclude: #draft
```
````

## Design detail

### 1. Registration & parsing
- `registerMarkdownCodeBlockProcessor("orbital-backlinks", …)` in `main.ts`
  (works in reading view **and** live preview).
- Subject resolved from `ctx.sourcePath`.
- **Lenient parser** (`BacklinkBlockConfig.ts`, pure):
  - Split each line on the first `:`; trim key and value; tolerate whitespace
    around `:`.
  - Comma-split list values, trim each item, drop empties.
  - Unknown keys and invalid `display` values → collected as **warnings**; the
    block still renders (invalid `display` falls back to `compact`).
  - Fatal-only errors (none expected for this flat format) render an inline
    error message instead of throwing. Warnings render as a subtle inline notice.

### 2. Filtering (`backlinkFilter.ts`, pure)
Filters the **source** notes. Kept pure by taking lookups as arguments
(`tagsOf(path) => string[]`, plus the source path itself) — the orchestrator
wires the real Obsidian data, exactly like `relations.ts` takes an `isExcluded`
predicate.

- **This is NOT `ExclusionMatcher`.** `ExclusionMatcher` uses *regex* and only
  reads *frontmatter* tags — wrong tool here. The block uses simple
  folder-prefix and tag matching.
- **Tags:** resolved via Obsidian `getAllTags(cache.getFileCache(file))`, which
  returns **inline AND frontmatter** tags, each with a leading `#`, and
  normalizes the `tags: str` vs `tags: [str, …]` frontmatter variance. Config
  tags accept `#active` or `active` (normalized to leading `#`). Matching is
  **nested-aware**: `#active` matches `#active` and `#active/now`.
- **Folders:** normalized via `normalizePath`, trailing slashes stripped. Match
  is on **segment boundaries** — folder `a` matches `a/x` and `a` itself, but
  **not** `ab/x`. (Match = source path === folder OR starts with `folder + "/"`.)
- **Precedence:** a source is shown iff
  `(no include-folder OR in an include-folder) AND (no include-tag OR has an
  include-tag) AND (not in any exclude-folder) AND (has no exclude-tag)`.
  Within a category → OR; across categories → AND; **exclude is evaluated last
  and always wins** (so `folder=a/b` + `folder-exclude=a` on a source in `a/b`
  → hidden).
- Orbital's global exclusions (`_isExcluded`) still apply on top.
- **Self-link excluded**: `sourcePath !== subjectPath`.
- Backlink sources are always **resolved** files (a backlink is a real note
  containing the link), so folder/tag lookups are always evaluable — no
  unresolved-source fallback needed.

### 3. Rendering
- **compact**: a count header (e.g. "3 backlinks") + a list of clickable note
  links using native `tree-item` classes → click opens the note.
- **context**: per source note, the **line(s)** containing the link, with each
  link occurrence highlighted, using the same native `search-result` classes as
  `MentionLinkService` (inherits theme + native Backlinks-pane look).
  - Link positions from `metadataCache.getFileCache(src).links`; line text from
    `vault.cachedRead(src)`.
  - Multiple links on the **same line** → the line is shown **once**, each
    occurrence highlighted. Distinct lines → one snippet row each.
- **Empty state**: subtle "No backlinks" text (accounting for active filters).
- **XSS-safe**: all snippet/user text inserted via `textContent` / `createSpan`
  — never `innerHTML` (per Orbital's obsidian-plugin conventions).
- Native CSS class names are internal (not public API) but Orbital already
  depends on them in `MentionLinkService`; keep `orbital-`-prefixed classes
  alongside as stable style/test hooks (same documented pattern).

### 4. Live refresh
- One `MarkdownRenderChild` per block instance, owning its **own** debouncer
  (cadence from `settings.refreshDebounceMs`), cleaned up on unload.
- Re-renders on the existing signals: `metadataCache.on("changed")`, vault
  `create`/`delete`/`rename`, and index rebuild.
- No `file-open` handling — a block reflects its **own** containing note, not the
  active note.
- On source **rename**, the index's `renameFile` + repaint path already maps old
  → new; the re-render pulls fresh backlinks and fresh cache.

### 5. Module layout
Pure core split from the Obsidian-facing orchestrator (mirrors
`relations.ts` / `unlinkedMentions.ts`):

- `src/codeblock/BacklinkBlockConfig.ts` — pure parser: raw string → typed
  config + warnings/errors.
- `src/codeblock/backlinkFilter.ts` — pure filter over source paths given the
  config + tag/folder lookups.
- `src/graph/backlinkContext.ts` — pure snippet extraction: `(content,
  linkPositions) → snippet lines`.
- `src/codeblock/BacklinkCodeBlock.ts` — async `MarkdownRenderChild`
  orchestrator (resolves subject, pulls backlinks from `LinkGraphIndex`, wires
  the pure modules, renders, hooks events).
- Registration wired in `src/main.ts`.
- Unit tests for the three pure modules.

## Accepted limitations (v1)
- `context` mode reads whole source files via `cachedRead` (same as
  `MentionLinkService`); no chunked/paginated read for very large files.
- Reliance on native CSS class names (mitigated by the parallel `orbital-`
  hooks, consistent with existing code).

## Parking lot (out of scope for v1)
- 2nd-hop relations (explicitly excluded by user).
- Configurable target note (other than the containing note).
- Click jumps to the match offset (existing mentions feature also doesn't jump).
- Sort / limit options (by name, mtime, max N).
- A generic `orbital` block for other views (outgoing / mentions / missing).
- A setting for the default display mode.
- Whole-word / case-sensitivity options for context.

## Open questions resolved in gap review
- Tag matching = `getAllTags` (inline + frontmatter), **not** `ExclusionMatcher`.
- Folder/exclude precedence = **exclude wins**.
- Folder match on **segment boundaries** (no `a` → `ab` false match).
- Multiple links per line dedupe to one highlighted line.
- Backlink sources always resolved → filters always evaluable.
- XSS handled via `textContent`/`createSpan`.
