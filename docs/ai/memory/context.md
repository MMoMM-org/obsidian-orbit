# Context Memory

## Context tab (v1.3) — added 2026-07-06, on branch feat/context-tab
New sidebar tab showing the ACTIVE note's backlinks with surrounding context —
the first tab and the default. Reuses the codeblock/footer rendering.
- `graph/backlinkContext.ts`: ContextAmount windowing (compact 90 / comfortable
  180 / fullLine = whole line) + optional surrounding-lines (leadLine/trailLine).
  ContextAmount/ContextSort types live in types/index.
- `codeblock/backlinkContextRender.ts`: shared group/snippet DOM builder
  extracted from BacklinkRenderChild (which now delegates to it); adds dimmed
  lead/trail lines. Injected open/hover/register callbacks per host.
- `view/panels/ContextPanel.ts`: active-note panel + toolbar (collapse-all ·
  sort[recent/mentions/name] · dense/cards · search-by-name). Toolbar state is
  view-owned (OrbitalView `_context*` fields, seeded from settings; overrides
  win for the session). Amount comes from settings.
- TabBar: Context first + per-tab Lucide icons (links-coming-in / waypoints /
  unlink / history); OrbitalView.onResize → setNarrow(<320px) = icon-only.
  `defaultTab` is now actually honored as the initial tab (was unwired) and
  defaults to "context".
- Settings: contextTabAmount (comfortable) / contextTabStyle (cards) /
  contextTabSort (recent) / contextTabCollapse (off); "Context tab" settings
  section; Context added to Default-tab dropdown. Settings onChange calls
  `_refreshOrbitalPanels()` to repaint the open tab live.
- Status-bar click now opens the pane on its current/default tab (was: forced
  Relations). `_openRelations` → `_openOrbital`.
- Gotcha: Lucide "arrow-down-a-z" isn't in Obsidian's icon set (blank) → used
  "case-sensitive" for name-sort.
- 797 tests pass; docs done (usage #context-tab, settings-reference, config,
  screenshots tab-content.png + settings-context-tab.png). Mockup parked on
  branch design/context-tab-mockup (pushed to origin, not merged).
- **Next:** live-verified by user; PR feat/context-tab → main.

## Current Focus
Backlinks auto-footer (v1.2) implemented on branch `feat/backlink-footer`
(2026-07-06). Appends the context backlinks view at the end of every note in
reading view AND live preview, gated by new setting `backlinkFooterEnabled`
(default off). NOT yet PR'd; live-preview injection needs a real-Obsidian smoke
test (see below).

## Backlinks footer — added 2026-07-06 (reworked same day)
- Refactor: extracted `codeblock/BacklinkRenderChild.ts` (shared render/interaction
  base) out of `BacklinkCodeBlock`; both codeblock and footer feed it a config.
- `footer/BacklinkFooter.ts` — settings-derived context config (style/collapse
  left undefined so they inherit live settings); self-registers with the manager
  on load, removes its own element on unload.
- **Mechanism (v2, after the sizer approach failed):** the first cut injected the
  footer into `.cm-sizer` — but Obsidian gives `.cm-content` a ~half-viewport
  `padding-bottom` (scroll-past-end), so the footer sat a huge dynamic gap below
  the text; reading view showed nothing (rebuilt/padded preview). Root-caused live
  via DevTools (`cm-content paddingBottom=361px`). Retired
  `BacklinkFooterController` (sizer injection) entirely.
- **New: `footer/BacklinkFooterManager.ts`** renders the two mode-native ways so
  the footer HUGS the last line: reading view → `registerMarkdownPostProcessor`
  (append after the note's last content block, detected via `getSectionInfo`);
  live preview/source → `registerEditorExtension` with a CodeMirror block widget
  at `doc.length` (inside content flow, above the scroll-past padding). Uses
  `editorInfoField` for the file; `refreshFooterEffect` (StateEffect) + preview
  `rerender` for the settings toggle (`refreshHosts`).
- Manager is also the footer registry: footers register on load; `refreshAll()`
  re-renders them in place on backlink changes (wired to metadata/vault + a
  layout-ready pass — fixes stale `Backlinks: 0` on first open). `destroy()` on
  unload.
- Footer shows `Backlinks: 0` / `No backlinks.` when empty (deliberate); a
  `.orbital-backlink-footer` top divider separates it from the note body.
- `@codemirror/view` + `@codemirror/state` added as devDependencies (runtime
  externals from Obsidian). Mock extended: **global `HTMLElement.prototype` DOM
  helpers** (parity with Obsidian; raw `createElement` els now have
  `createDiv`/`empty`/etc.), Component load/unload/addChild,
  `registerMarkdownPostProcessor`/`registerEditorExtension`, `editorInfoField`
  stub, `createMockMarkdownView`. New `footer/` vitest alias.
- 13 footer tests (post-processor path + registry + gating + dedupe + teardown).
- **Verified live 2026-07-06:** live preview hugs the last line (no gap), reading
  view shows the footer, count nudged, stale-count gone. Two live gotchas fixed
  and recorded in troubleshooting.md: (1) CM block widgets must come from a
  StateField, not a ViewPlugin; (2) a reading-view section can be post-processed
  before it is attached (`el.parentElement` null) → append into the section
  wrapper as a fallback. Gated `[Orbital footer]` debug logs behind the
  debugLogging setting (console.debug → needs DevTools "Verbose" level).
- **Next:** PR `feat/backlink-footer` → main. Optional deeper live checks: split
  panes, popout windows.

## Earlier: Spec 001-orbit-three-tab-sidebar fully implemented and finalized
(Implemented, 2026-06-19). All 5 phases complete on branch `feat/orbit-tabs`, pushed to origin.

## Phase 5 (final) — done
- T5.1: Manage → deep-link now *filters* the Dangling tab to the target (+ "Show all").
- T5.2: a11y/mobile/perf hardening — panel focus on switch, sibling focus after row
  removal, narrow-mode label collapse, ~100-row truncation + "Show more", bulk-loop
  yield + single progress Notice, ≥44px touch targets.
- T5.3: submission compliance — manifest description + README docs + corrected
  prior-art attribution (mottox2; recent-files = GPL-3.0, not MIT).
- T5.4: 43 end-to-end acceptance tests in test/integration/acceptance.test.ts,
  mapping all 33 PRD ACs 1:1.

## Bug fixed during T5.4
`RecentFilesStore.list()` now slices to `recentListLength` at read time (previously
only capped on write), so lowering the setting shrinks the rendered list without a reload.

## Unlinked mentions feature — added 2026-06-20
New "Unlinked mentions" section in the Relations tab (between 2nd hop and Missing),
replicating Obsidian's Backlinks→Unlinked-mentions plus two improvements: inline
linking (per-note + per-occurrence) and a 🔗 badge when the note already links the
active one. New modules `graph/unlinkedMentions.ts` (pure scanner) and
`links/MentionLinkService.ts` (async, memoized). Default-collapsed, lazy-scanned.
Two settings added (unlinkedMentionsEnabled, unlinkedOpenInNewTab). See
domain.md + decisions.md for rules/rationale.

## Status-bar item — added 2026-06-20
`main.ts` adds a status-bar item (orbit icon + `backlinks/2nd-hop` counts for the
active note) via `addStatusBarItem`; hover tooltip explains it, click opens the
Relations tab (`_openRelations`). Counts come from `computeRelations` (mirror the
tab, honouring 2nd-hop enabled/cap). Updated from `_repaintActivePanel`; setting
`showStatusBar` (default true) with `_refreshStatusBar` to add/remove at runtime.

## State
782 tests pass; lint/typecheck/build clean. Test vault `test/Orbital/` holds a
smoke-test corpus (18 PKM notes + `_Orbit Test Guide.md`) covering every tab/action,
including Zettelkasten unlinked-mention fixtures.
Next: real-vault smoke session for unlinked mentions (lazy scan on a large vault,
link-all/link-one writes, already-linked badge) before community-directory
submission, then PR feat/orbit-tabs → main.
