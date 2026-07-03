---
title: "In-note backlinks codeblock (orbital-backlinks)"
status: draft
version: "1.0"
---

# Product Requirements Document

## Validation Checklist

### CRITICAL GATES (Must Pass)

- [x] All required sections are complete
- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Problem statement is specific and measurable
- [x] Every feature has testable acceptance criteria (Gherkin format)
- [x] No contradictions between sections

### QUALITY CHECKS (Should Pass)

- [x] Problem is validated by evidence (not assumptions)
- [x] Context → Problem → Solution flow makes sense
- [x] Every persona has at least one user journey
- [x] All MoSCoW categories addressed (Must/Should/Could/Won't)
- [x] Every metric has corresponding tracking events
- [x] No feature redundancy (check for duplicates)
- [x] No technical implementation details included
- [x] A new team member could understand this PRD

---

## Output Schema

### PRD Status Report

| Field | Value |
|-------|-------|
| specId | 002-backlink-codeblock |
| title | In-note backlinks codeblock (orbital-backlinks) |
| status | COMPLETE |
| clarificationsRemaining | 0 |
| acceptanceCriteria | 24 |

---

## Product Overview

### Vision
Let Obsidian users see and filter a note's backlinks **inline, inside the note
itself** — via a simple `orbital-backlinks` codeblock — without leaving the
writing surface for the sidebar.

### Problem Statement
Orbital's Relations sidebar answers "what links to this note?" only for the
**currently active** note, in a pane external to the document. Writers who work
*inside* a note — building a map-of-content, an index note, or a hub — cannot
embed that answer where it belongs: in the note. They must context-switch to the
sidebar, which loses their place, cannot be curated per note, and disappears
when the note is shared or exported. There is today no way to say "on *this*
note, show me the backlinks from my Projects folder that carry `#active`,
inline."

### Value Proposition
Unlike the sidebar (transient, active-note-scoped, one global view), an in-note
codeblock is **persistent, per-note, and curatable**: each block travels with
its note, can be filtered independently by folder and tag, and renders in the
document body in both reading view and live preview. It reuses Orbital's own
link graph and native-styled rendering, so it looks and behaves like the rest of
the plugin and Obsidian's core Backlinks pane — no new mental model.

## User Personas

### Primary Persona: The in-context linker
- **Demographics:** Power Obsidian user; comfortable writing markdown and
  codeblocks (e.g. Dataview / dynbedded users); desktop-first but also on mobile;
  maintains a medium-to-large vault with deliberate linking.
- **Goals:** Build hub / map-of-content / index notes that show their incoming
  references inline; understand *why* a note is linked (the surrounding text)
  without leaving the note; keep those views curated (scoped by folder/tag).
- **Pain Points:** The sidebar breaks writing flow and shows an uncurated, global
  list; there is no way to persist a filtered backlinks view on a specific note;
  exported/shared notes lose the sidebar entirely.

### Secondary Personas
None for this phase. (The feature has no authoring role distinct from the reader
— the same user writes the block and reads its output.)

## User Journey Maps

### Primary User Journey: Embedding a curated backlinks view
1. **Awareness:** While building an index/hub note, the user wants "what links
   here?" visible in the note, like they've seen with dynbedded/Dataview blocks.
2. **Consideration:** They know Orbital already provides a Relations sidebar; they
   want the same data but inline and filterable per note.
3. **Adoption:** They type an ```` ```orbital-backlinks ```` fence. An empty block
   immediately renders all backlinks in compact mode — instant payoff, zero config.
4. **Usage:** They add filter lines (`folder:`, `tag:`, `folder-exclude:`,
   `tag-exclude:`) and switch `display: context` to see the surrounding text.
   The block re-renders automatically as links across the vault change.
5. **Retention:** The block persists in the note; every time they open it, it
   reflects the current graph. They add blocks to more hub notes.

### Secondary User Journeys
None for this phase.

## Feature Requirements

### Must Have Features

#### Feature 1: Render the containing note's backlinks in a codeblock
- **User Story:** As an in-context linker, I want to insert an
  ```` ```orbital-backlinks ```` block in a note so that I can see what links to
  this note without opening the sidebar.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given a note contains an empty `orbital-backlinks` block, When it renders
        in reading view **or** live preview, Then the block lists every backlink
        to that note in compact mode.
  - [ ] Given the block renders, Then a header shows the count in the form
        "Backlinks: N".
  - [ ] Given the note links to itself, When backlinks are computed, Then the
        note itself is **not** listed (self-link excluded).
  - [ ] Given a backlink is listed, When the user clicks its title, Then the
        source note opens; When the user mod-clicks (Cmd/Ctrl), Then it opens in
        a new tab (matching the Relations sidebar behavior).
  - [ ] Given the note has no backlinks, Then the block shows a subtle
        "No backlinks." message rather than an empty or broken block.

#### Feature 2: Filter backlinks by folder and tag (include + exclude)
- **User Story:** As an in-context linker, I want to include or exclude backlink
  sources by folder and by tag so that each block shows only the references I
  care about.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given `folder: Projects, Areas`, When backlinks are filtered, Then only
        sources inside `Projects` or `Areas` (or their subfolders) are shown.
  - [ ] Given `folder: Research`, When a source is in `Research/archived`, Then it
        is shown (subfolders match); When a source is in `Researchers/x`, Then it
        is **not** shown (folder match is on path-segment boundaries, so
        `Research` does not match `Researchers`).
  - [ ] Given `tag: #active`, When a source carries `#active` or `#active/now`,
        Then it is shown (nested-tag aware); tags match whether written inline or
        in frontmatter, and config tags work with or without the leading `#`.
  - [ ] Given both an include-folder and an include-tag are set, When a source
        satisfies only one, Then it is **not** shown (across categories = AND).
  - [ ] Given `folder: a/b` and `folder-exclude: a`, When a source is in `a/b`,
        Then it is **not** shown (exclude is evaluated last and always wins).
  - [ ] Given `tag: #active` and `tag-exclude: #draft`, When a source carries both
        `#active` and `#draft`, Then it is **not** shown (tag exclude wins).
  - [ ] Given Orbital's global exclusion settings exclude a path/tag, Then that
        source is omitted regardless of the block's own filters.
  - [ ] Given active filters exclude every backlink, Then the block shows
        "No backlinks matching filters." (distinct from the unfiltered empty state).

#### Feature 3: Choose display mode — compact or context
- **User Story:** As an in-context linker, I want to choose between a bare link
  list and a view that shows the surrounding text so that I can pick quick
  scanning or richer understanding per block.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given no `display` line (or `display: compact`), Then each backlink is a
        single clickable note title, one per source.
  - [ ] Given `display: context`, Then under each source note the block shows the
        text around each link, with the link text highlighted.
  - [ ] Given a context snippet, Then it is a single-line window of roughly 90
        characters on each side of the link (~180 total), with `…` marking
        truncation at word boundaries; context-note groups are always expanded
        (no collapse in this phase).
  - [ ] Given a source note links to the subject on two different lines, When
        rendered in context mode, Then the source appears once with one snippet
        per line.
  - [ ] Given a source note has two links to the subject on the **same** line,
        Then that line is shown once with each occurrence highlighted.
  - [ ] Given `display` has an unrecognized value (e.g. `display: fancy`), Then
        the block falls back to compact and records a warning (see Feature 5).

#### Feature 4: Keep the block current automatically
- **User Story:** As an in-context linker, I want the block to update itself when
  links change so that I never see stale backlinks.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given a rendered block, When another note adds, removes, or edits a link
        to the subject and the change is saved, Then the block re-renders
        (debounced) to reflect it, with no manual refresh.
  - [ ] Given a backlink source is renamed or deleted, Then the block re-renders
        with the updated/removed source.
  - [ ] Given the note is switched from reading to editing view and back, Then the
        block re-renders correctly and no duplicate listeners accumulate.

#### Feature 5: Fail gracefully on bad configuration
- **User Story:** As an in-context linker, I want a mistyped config to warn me
  inline instead of crashing so that I can fix it and keep working.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given the config contains an unknown key or an invalid `display` value,
        When the block renders, Then it still renders (using valid lines +
        defaults) and shows a subtle inline notice naming the problem.
  - [ ] Given any unexpected rendering error, When the block processes, Then it
        shows a contained inline error message and does not break the rest of the
        note's rendering.

### Should Have Features
- **Soft cap in context mode:** to protect responsiveness on notes with very many
  backlinks, context mode renders at most ~50 sources and appends a
  "… and N more" notice; compact mode is uncapped.

### Could Have Features
- Sort/limit options (by title, modified time, link count).
- A per-user default display-mode setting.
- Whole-word / case-sensitivity options for context matching.
- A generic `orbital` block exposing other views (outgoing, unlinked mentions,
  missing links).

### Won't Have (This Phase)
- **2nd-hop / transitive relations** (explicitly excluded by the requester).
- **Configurable subject note** — the block always targets its containing note;
  no way to show a different note's backlinks.
- **Click-to-jump to the exact match offset** — clicking opens the source note
  only (consistent with Obsidian's native Backlinks pane).
- **Collapsible context groups** and **collapse-state persistence**.
- **Inline UI to edit filters** from the rendered output — filters are edited in
  the block's markdown source.
- **Drag-to-link / bulk-link actions** from the block (those live in Orbital's
  other tabs).

## Detailed Feature Specifications

### Feature: Filter backlinks by folder and tag (include + exclude)
**Description:** The block filters the **source** notes (the notes linking to the
subject). Filters are read from optional config lines; any omitted filter imposes
no constraint. Folder filters match on path-segment boundaries and include
subfolders. Tag filters match inline and frontmatter tags and are nested-aware.
Includes narrow the set; excludes remove from it and take precedence.

**User Flow:**
1. User writes filter lines in the block, e.g. `folder: Projects` and
   `tag-exclude: #draft`.
2. System computes the subject's backlinks, then keeps a source only if it passes
   every filter category.
3. System renders the surviving sources (compact or context), or the
   filtered-empty message if none survive.

**Business Rules:**
- Rule 1: A source is shown iff `(no include-folder OR the source is in an
  include-folder) AND (no include-tag OR the source carries an include-tag) AND
  (the source is in no exclude-folder) AND (the source carries no exclude-tag)`.
- Rule 2: Within a category, multiple values are OR'd; across categories they are
  AND'd; any exclude match overrides all includes.
- Rule 3: Folder match = source path equals the folder OR begins with
  `folder + "/"` (segment boundary; `Research` ≠ `Researchers`).
- Rule 4: Tag match = the source's tag equals the filter tag OR begins with
  `filterTag + "/"` (so `#active` matches `#active/now`); the leading `#` is
  optional in config.
- Rule 5: Orbital's global exclusion settings apply on top of, and independently
  of, the block's filters.
- Rule 6: The subject note is never listed as its own backlink.

**Edge Cases:**
- Source in a folder whose name is a prefix of the include folder (`Researchers`
  vs `Research`) → **not** matched.
- Config tag written without `#` (`tag: active`) → normalized and matched as
  `#active`.
- Frontmatter `tags:` given as a bare string vs a list → both handled uniformly.
- All backlinks filtered out → "No backlinks matching filters." (not the bare
  "No backlinks.").
- Duplicate or whitespace-padded filter values (`folder: a,  a , `) → trimmed and
  de-duplicated; empty entries ignored.

## Success Metrics

> Orbital is a local, privacy-respecting Obsidian plugin with **no telemetry**
> (see `PRIVACY.md`); success is measured through public signals and manual
> verification, not in-product analytics. "Tracking events" below are the
> observable outcomes used to validate acceptance, not data collection.

### Key Performance Indicators
- **Adoption:** Feature documented in the README/usage docs and referenced by
  users in GitHub issues/discussions; qualitative reports of use in hub/index
  notes.
- **Engagement:** Blocks continue to render correctly across sessions and vault
  changes (no stale/broken reports).
- **Quality:** Zero crashes/uncaught errors from the block; all acceptance
  criteria covered by passing automated tests; renders correctly in reading view
  **and** live preview, desktop and mobile.
- **Business Impact:** Strengthens Orbital's positioning as an in-note relations
  tool; supports community-directory quality expectations.

### Tracking Requirements
| Event (observable outcome) | What to verify | Purpose |
|----------------------------|----------------|---------|
| Block renders | Compact/context output for a known fixture | Validate Feature 1 & 3 |
| Filter applied | Source in/excluded per rules | Validate Feature 2 |
| Link graph changes | Block re-renders after add/remove/rename/delete | Validate Feature 4 |
| Invalid config | Inline warning shown, block still renders | Validate Feature 5 |
| No listener leak | Listener count stable across view toggles | Validate cleanup |

## Constraints and Assumptions

### Constraints
- Must target Obsidian API `>=1.5.7`, desktop **and** mobile (`isDesktopOnly:
  false`), and satisfy community-directory expectations (no reliance on private
  APIs beyond what Orbital already uses, XSS-safe DOM).
- Must reuse Orbital's existing link graph and native-styled rendering; no new
  heavy dependencies.
- The block's configuration lives in the note's markdown (edited in source, not
  via a settings UI).

### Assumptions
- Backlink **sources are always resolved files** (a backlink is a real note
  containing the link), so folder/tag lookups always succeed.
- Users authoring the block are comfortable with a small, flat, YAML-like config.
- The existing debounce cadence (`refreshDebounceMs`) is an acceptable refresh
  latency, consistent with the rest of the plugin.

## Risks and Mitigations
| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Context mode reads many source files → latency on huge backlink sets | Medium | Medium | Soft cap (~50 sources) with "… and N more"; compact mode uncapped |
| Reliance on Obsidian's non-public CSS classes for native look | Medium | Low | Parallel `orbital-` classes as stable hooks (existing plugin pattern); degrade gracefully if a class changes |
| Listener leaks across view toggles | Medium | Low | Per-block lifecycle cleanup on unload; test that listener count stays stable |
| Filter semantics confuse users (include vs exclude precedence) | Low | Medium | Clear docs + predictable "exclude wins" rule; helpful empty-state copy |
| Mobile parity of tag/rendering APIs | Medium | Low | Reuse APIs already used elsewhere in Orbital; verify on mobile |

## Open Questions
- [ ] None blocking. (Sort order, collapsibility, snippet width, and the context
      cap were resolved during brainstorming/research; remaining items are parked
      in "Could Have".)

---

## Supporting Research

### Competitive Analysis
- **Obsidian core "Backlinks in document":** shows backlinks inline but offers no
  folder/tag filtering and no per-note curation. Orbital's block adds filtering
  and lives in the note's own markdown.
- **dynbedded / Dataview:** general-purpose embed/query blocks; powerful but
  generic and heavier to author. Orbital's block is a focused, zero-config-by-
  default backlinks view reusing the plugin's own graph and styling.

### User Research
- Direct requester input (brainstorming session, 2026-07-03): wants inline
  backlinks via a codeblock, filterable by tag/folder, with a choice between a
  bare link and an unlinked-mentions-style context view; explicitly no 2nd hop.
- Perspective research (Requirements/Technical/UX agents) confirmed feasibility
  against the existing codebase and aligned wording/behavior with the Relations
  sidebar.

### Market Data
Not applicable — feature scoped to the existing Orbital user base; no market
sizing relevant for a free, local Obsidian plugin.
