---
title: "Phase 3: Integration, Docs & Validation"
status: pending
version: "1.0"
phase: 3
---

# Phase 3: Integration, Docs & Validation

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Runtime View]` and `[ref: SDD/Acceptance Criteria]` (EARS)
- `[ref: PRD/Success Metrics → Tracking Requirements]` (observable outcomes)
- `[ref: PRD/User Journey]` (docs narrative)

**Reference code**: existing `test/` layout and obsidian mock
(`test/__mocks__/obsidian.ts`); `README.md`, `docs/usage.md`,
`docs/commands-reference.md`, `docs/settings-reference.md`.

**Key Decisions**: reading-view + live-preview parity; no new settings (docs must
say so); native-class reliance documented.

**Dependencies**: Phase 2 (working block + registration).

---

## Tasks

This phase proves the feature end-to-end, documents it for users, and gates the
whole spec on a green build.

- [ ] **T3.1 End-to-end integration test** `[activity: test]`

  1. Prime: Read `[ref: SDD/Runtime View → sequence]` and the obsidian mock
     capabilities.
  2. Test (RED): drive the registered processor against a small in-memory vault
     fixture — assert compact output for an unfiltered block; assert folder+tag
     include/exclude changes the rendered set (exclude wins); assert `display:
     context` shows windowed highlighted snippets; simulate a metadata `changed`
     event → block re-renders after debounce; simulate `rename`/`delete` → set
     updates; assert unload removes listeners (count stable across
     load→unload→load); assert filtered-empty and warning states.
  3. Implement (GREEN): add `test/codeblock/BacklinkCodeBlock.test.ts` (extend the
     obsidian mock only as needed for `registerMarkdownCodeBlockProcessor`,
     `getAllTags`, `cachedRead`).
  4. Validate: integration suite green; no flakiness across repeated runs.
  5. Success:
     - [ ] Compact + context + filter + live-refresh + cleanup covered `[ref: PRD/AC Feature 1-5]`
     - [ ] Observable outcomes verified `[ref: PRD/Success Metrics → Tracking]`

- [ ] **T3.2 User documentation** `[activity: documentation]`

  1. Prime: Read the current `README.md` feature list and `docs/usage.md`
     structure; `[ref: PRD/User Journey]` for narrative.
  2. Test (RED): documentation checklist — a new user can (a) create the block,
     (b) learn every config key with an example, (c) understand compact vs
     context, (d) know the filter precedence and that there are no settings.
  3. Implement (GREEN): add an "In-note backlinks (`orbital-backlinks`)" section
     to `README.md` and `docs/usage.md` with the syntax block, the four filter
     keys, `display` modes, precedence note (exclude wins), the ~50 context cap,
     and the v1 limitations (no 2nd-hop, no sort, no configurable target). Note in
     `docs/settings-reference.md` that the block has no settings. Reference the
     GitHub issue for the feature if one exists.
  4. Validate: `npm run lint` (markdown untouched by eslint, but keep links
     valid); manual read-through.
  5. Success:
     - [ ] README + usage cover syntax, filters, modes, limits `[ref: PRD/User Journey]`

- [ ] **T3.3 Final validation & spec close-out prep** `[activity: validate]`

  1. Prime: re-read the PRD acceptance criteria and SDD EARS list.
  2. Validate: run the full gate — `npm test`, `npm run lint`, `npm run typecheck`,
     `npm run build`, `npm run test:coverage` (confirm the three pure modules are
     well covered). Walk every PRD acceptance criterion and check it maps to a
     passing test.
  3. Success:
     - [ ] All acceptance criteria demonstrably pass `[ref: PRD/Feature 1-5 + cap]`
     - [ ] `npm run build` green (typecheck + esbuild) `[ref: SDD/Quality Requirements]`
     - [ ] No `console.log`, no `innerHTML`, no `obsidian` import in pure core `[ref: SDD/System-Wide Patterns]`
