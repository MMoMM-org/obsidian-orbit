---
title: "Phase 1: Pure Core"
status: completed
version: "1.0"
phase: 1
---

# Phase 1: Pure Core

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Building Block View → Interface Specifications]` — module signatures
- `[ref: SDD/Implementation Examples]` — filter precedence + snippet windowing (traced)
- `[ref: SDD/Risks → Implementation Gotchas]` — char-offset→line, vault-root folder `""`, tag `#` normalization
- `[ref: PRD/Feature 2 & 3]` — filter semantics and context display

**Key Decisions**:
- ADR-2 pure core (no `obsidian` import); ADR-3 new filter (folder-prefix +
  `getAllTags`); ADR-4 ~90-char window; ADR-6 order preserved.

**Dependencies**: none. All three modules are independent and testable in
isolation — they may be built in parallel.

---

## Tasks

This phase delivers the three pure, Obsidian-free modules with full unit tests.
It establishes the parse → filter → snippet capabilities the orchestrator wires
in Phase 2.

- [x] **T1.1 Config parser (`BacklinkBlockConfig`)** `[activity: domain-modeling]` `[parallel: true]`

  1. Prime: Read the config interface + parsing rules `[ref: SDD/Internal API Changes → BacklinkBlockConfig.ts]` and `[ref: PRD/Feature 5]`.
  2. Test (RED): empty block → `{display:"compact", all lists empty, warnings:[]}`;
     `display: context` parsed; whitespace around `:` tolerated; comma lists
     trimmed + de-duped + empties dropped; tags normalized to lowercase with
     leading `#` (accepts `active` and `#active`); folder values `normalizePath`-style
     trimmed with no trailing slash; unknown key → warning (block still parses);
     invalid `display` value → warning + fallback `compact`. Folder
     normalization is explicit: trim, collapse duplicate `/`, strip
     leading/trailing `/`, preserve case, no relative-path resolution, vault root
     = `""` `[ref: SDD/Internal API Changes → normalization rules]`. Tag
     normalization: strip one optional leading `#`, lowercase, re-prefix `#`.
  3. Implement (GREEN): Create `src/codeblock/BacklinkBlockConfig.ts` exporting
     `parseBacklinkBlockConfig(raw): BacklinkBlockConfig` (+ types). No `obsidian`
     import (use a local path-normalize helper; do not import `normalizePath`).
  4. Validate: `npm test` for this module green; lint + typecheck clean.
  5. Success:
     - [ ] Unknown key / bad `display` produce warnings, never throw `[ref: PRD/AC Feature 5]`
     - [ ] Tag + folder values normalized per rules `[ref: SDD/Business Rules 3-4]`

- [x] **T1.2 Folder/tag filter (`backlinkFilter`)** `[activity: domain-modeling]` `[parallel: true]`

  1. Prime: Read the filter contract + traced walkthrough `[ref: SDD/Implementation Examples → Filter precedence]`.
  2. Test (RED): include-folder segment boundary (`Research` matches
     `Research/x`, NOT `Researchers/x`); subfolders included; nested-tag include
     (`#active` matches `#active/now`); across-category AND (folder+tag both
     required); exclude-folder and exclude-tag each override includes; empty
     include lists impose no constraint; subject path dropped (self-link);
     `isExcluded` path dropped; **order of surviving paths preserved**; vault-root
     source (folder `""`) handled.
  3. Implement (GREEN): Create `src/codeblock/backlinkFilter.ts` exporting
     `filterBacklinks(backlinks, subjectPath, config, deps)` with `deps.tagsOf`
     and `deps.isExcluded` injected (no `obsidian` import). Include `inFolder` /
     `hasTag` / `parentFolder` helpers.
  4. Validate: unit tests green; lint + typecheck clean.
  5. Success:
     - [ ] Exclude wins across categories `[ref: PRD/AC Feature 2 — exclude precedence]`
     - [ ] Segment-boundary folder + nested-tag matching `[ref: SDD/Business Rules 3-4]`
     - [ ] Self-link + global exclusion removed, order preserved `[ref: PRD/AC Feature 1,2]`

- [x] **T1.3 Context snippet extractor (`backlinkContext`)** `[activity: domain-modeling]` `[parallel: true]`

  1. Prime: Read the snippet contract + windowing example `[ref: SDD/Implementation Examples → Windowed context snippet]` and `[ref: SDD/Gotchas]` (char offsets).
  2. Test (RED): offset→line mapping at line boundaries; one snippet per link
     line; two links on the **same line** → extractor returns ONE `ContextSnippet`
     centered on the first occurrence with `matchCount = 2` (renderer highlights
     every in-window occurrence of the link text) `[ref: SDD/Internal API Changes → ContextSnippet]`; window
     of ~90 chars/side snapped to word boundaries; `…` prefix/suffix only when
     truncated; link at line start → empty `before`, no leading `…`; link at line
     end → empty `after`.
  3. Implement (GREEN): Create `src/graph/backlinkContext.ts` exporting
     `extractContext(content, links, windowChars): ContextSnippet[]` (no
     `obsidian` import). Precompute line-start offsets; group by line.
  4. Validate: unit tests green; lint + typecheck clean.
  5. Success:
     - [ ] Windowed, word-boundary-trimmed snippets with correct `…` `[ref: PRD/AC Feature 3]`
     - [ ] Same-line links deduped to one line `[ref: PRD/AC Feature 3 — same line]`

- [x] **T1.4 Phase Validation** `[activity: validate]`

  Run `npm test` (all three new suites), `npm run lint`, `npm run typecheck`.
  Verify no module imports `obsidian` (grep). Confirm signatures match the SDD
  Interface Specifications exactly (Phase 2 depends on them).
