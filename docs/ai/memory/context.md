# Context Memory

## Current Focus
Backlinks auto-footer (v1.2) implemented on branch `feat/backlink-footer`
(2026-07-06). Appends the context backlinks view at the end of every note in
reading view AND live preview, gated by new setting `backlinkFooterEnabled`
(default off). NOT yet PR'd; live-preview injection needs a real-Obsidian smoke
test (see below).

## Backlinks footer — added 2026-07-06
- Refactor: extracted `codeblock/BacklinkRenderChild.ts` (shared render/interaction
  base) out of `BacklinkCodeBlock`; both codeblock and footer feed it a config.
- `footer/BacklinkFooter.ts` — settings-derived context config (style/collapse
  left undefined so they inherit live settings); `footer/BacklinkFooterController.ts`
  — reconciles one footer per markdown leaf, injected into the mode's content
  sizer: `.markdown-preview-sizer` (reading) / `.cm-sizer` (source/live preview),
  mirroring Obsidian's native "Backlinks in document". Idempotent reconcile +
  rerender + destroy.
- Wiring in `main.ts`: reconcile on layout-ready / layout-change / active-leaf /
  file-open; debounced rerender on metadata+vault changes; `destroy()` registered
  for clean unload. Toggle in SettingsTab "In-note backlinks" section.
- Footer shows `Backlinks: 0` / `No backlinks.` when empty (deliberate — user must
  see it works), and a `.orbital-backlink-footer` top divider separates it from
  the note body.
- 20 new tests (controller reconciliation + plugin integration). Mock extended:
  Component load/unload/addChild + MarkdownView getMode/contentEl +
  `createMockMarkdownView`. New `footer/` vitest alias.
- **RISK / next:** the sizer injection can't be unit-tested against real Obsidian
  DOM — must smoke-test live in `test/Orbital/` (Hub.md has a footer checklist):
  live-preview `.cm-sizer` persistence across CM6 re-render, mode switch, split
  panes, popout windows, and clean removal on disable.

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
