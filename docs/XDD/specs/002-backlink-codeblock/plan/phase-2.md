---
title: "Phase 2: Rendering & Plugin Wiring"
status: pending
version: "1.0"
phase: 2
---

# Phase 2: Rendering & Plugin Wiring

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Runtime View]` — primary flow, sequence, error handling, render() algorithm
- `[ref: SDD/Cross-Cutting → User Interface & UX]` — CSS classes, mod-click, hover-link, wireframes
- `[ref: SDD/Internal API Changes → BacklinkCodeBlock.ts + registration]`
- `[ref: PRD/Feature 1,3,4,5]` and Should-have cap

**Reference code**: `src/links/MentionLinkService.ts` (cachedRead + native
`search-result` rendering), `src/view/panels/RelationsPanel.ts` (click/mod-click,
`hover-link`, empty-state), `src/main.ts` (`_buildRelationsDeps` pattern,
`registerMarkdownCodeBlockProcessor` site), `styles.css`.

**Key Decisions**: ADR-1 own rendering; ADR-4 always-expanded context; ADR-5 cap
50 + "… and N more"; per-block debouncer + `MarkdownRenderChild` cleanup.

**Dependencies**: Phase 1 (all three pure modules and their exact signatures).

---

## Tasks

This phase delivers the visible feature: a working `orbital-backlinks` block that
renders compact/context, filters, refreshes live, and fails gracefully.

- [ ] **T2.1 Orchestrator + compact render + live refresh (`BacklinkCodeBlock`)** `[activity: frontend-ui]`

  1. Prime: Read `[ref: SDD/Runtime View → render() algorithm]` and the
     `MarkdownRenderChild` lifecycle notes; review `RelationsPanel` click/hover.
  2. Test (RED) (jsdom + obsidian mock): parses config once on load; resolves
     subject via `sourcePath`; pulls `backlinksOf`; wires `filterBacklinks` with
     `tagsOf = getAllTags(getFileCache(file)) ?? []` and global `isExcluded`;
     renders "Backlinks: N" header + compact clickable rows; click opens note,
     mod-click (`Keymap.isModEvent`) opens new tab; hover fires `hover-link`;
     empty → "No backlinks."; filtered-empty → "No backlinks matching filters.";
     parser warnings shown as inline notice; a metadata/vault change triggers a
     **debounced** re-render; toggling load/unload does not leak listeners.
  3. Implement (GREEN): Create `src/codeblock/BacklinkCodeBlock.ts` extending
     `MarkdownRenderChild`. Own debouncer (`settings.refreshDebounceMs`, trailing);
     subscribe via `this.registerEvent` to `metadataCache.on("changed")` and
     `vault.on("create"|"delete"|"rename")`; `this.register(() => debouncer.cancel())`.
     XSS-safe DOM (`createSpan`/`textContent`). Wrap `render()` body so any throw
     yields a contained inline error.
  4. Validate: unit/jsdom tests green; lint + typecheck clean.
  5. Success:
     - [ ] Compact list + header + click/mod-click/hover `[ref: PRD/AC Feature 1]`
     - [ ] Two distinct empty states `[ref: PRD/AC Feature 2 — filtered empty]`
     - [ ] Debounced live refresh; no listener leak `[ref: PRD/AC Feature 4]`
     - [ ] Bad config → inline warning, no crash `[ref: PRD/AC Feature 5]`

- [ ] **T2.2 Context-mode rendering + soft cap** `[activity: frontend-ui]`

  1. Prime: Read `[ref: SDD/UI → Context wireframe]`, `[ref: SDD/Gotchas]`
     (filter `getFileCache().links` to links resolving to the subject), and
     `MentionLinkService` snippet rendering.
  2. Test (RED): for `display: context`, per surviving source read `cachedRead`,
     collect only link positions that resolve to the subject, call
     `extractContext(…, 90)`, render source group (native `search-result` classes
     + `.orbital-backlink-*` hooks) with highlighted match; two links on one line
     → one row, both highlighted; two lines → two rows; groups always expanded;
     **> 50 survivors → render first 50 + "… and N more"**; a `cachedRead`
     rejection skips only that source.
  3. Implement (GREEN): Add context-render path to `BacklinkCodeBlock` (resolve
     link→subject via `getFirstLinkpathDest`/`resolvedLinks`; highlight via
     `search-result-file-matched-text`).
  4. Validate: tests green; lint + typecheck clean.
  5. Success:
     - [ ] Windowed highlighted snippets, always expanded `[ref: PRD/AC Feature 3]`
     - [ ] Soft cap with "… and N more" `[ref: PRD/Should-have cap]`
     - [ ] One source read failing does not abort the block `[ref: SDD/Error Handling]`

- [ ] **T2.3 Registration, deps factory & styles** `[activity: integration]`

  1. Prime: Read `_buildRelationsDeps` and the `registerView`/command block in
     `src/main.ts`; review existing `.orbital-*` rules in `styles.css`.
  2. Test (RED): registering the processor mounts a `BacklinkCodeBlock` for an
     `orbital-backlinks` fence (covered via the Phase 3 integration test);
     `_buildBacklinkDeps()` returns the wired deps (index, app, getSettings,
     isExcluded).
  3. Implement (GREEN): In `main.ts.onload()` add
     `registerMarkdownCodeBlockProcessor("orbital-backlinks", (src, el, ctx) =>
     ctx.addChild(new BacklinkCodeBlock(el, src, ctx.sourcePath, this._buildBacklinkDeps())))`
     and a private `_buildBacklinkDeps()` factory (mirror the Relations cast
     pattern). Add `.orbital-backlink-item|group|snippet|count|empty|notice`
     rules to `styles.css` using theme tokens only (stylelint clean).
  4. Validate: `npm run build` (typecheck + esbuild) succeeds; `npm run lint`
     (eslint + stylelint) clean.
  5. Success:
     - [ ] Block renders in reading view AND live preview `[ref: PRD/AC Feature 1]`
     - [ ] Styles use theme tokens, stylelint passes `[ref: SDD/UI → Design System]`

- [ ] **T2.4 Phase Validation** `[activity: validate]`

  Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`. Verify
  against the SDD Runtime View and the Feature 1/3/4/5 acceptance criteria.
