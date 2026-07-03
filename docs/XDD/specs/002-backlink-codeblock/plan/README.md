---
title: "In-note backlinks codeblock (orbital-backlinks)"
status: draft
version: "1.0"
---

# Implementation Plan

## Validation Checklist

### CRITICAL GATES (Must Pass)

- [x] All `[NEEDS CLARIFICATION: ...]` markers have been addressed
- [x] All specification file paths are correct and exist
- [x] Each phase follows TDD: Prime → Test → Implement → Validate
- [x] Every task has verifiable success criteria
- [x] A developer could follow this plan independently

### QUALITY CHECKS (Should Pass)

- [x] Context priming section is complete
- [x] All implementation phases are defined with linked phase files
- [x] Dependencies between phases are clear (no circular dependencies)
- [x] Parallel work is properly tagged with `[parallel: true]`
- [x] Activity hints provided for specialist selection `[activity: type]`
- [x] Every phase references relevant SDD sections
- [x] Every test references PRD acceptance criteria
- [x] Integration & E2E tests defined in final phase
- [x] Project commands match actual project setup

---

## Output Schema

### PLAN Status Report

| Field | Value |
|-------|-------|
| specId | 002-backlink-codeblock |
| title | In-note backlinks codeblock (orbital-backlinks) |
| status | COMPLETE |
| totalTasks | 12 (9 deliverable + 3 phase-validation) |
| parallelTasks | 3 |
| clarificationsRemaining | 0 |

---

## Specification Compliance Guidelines

### How to Ensure Specification Adherence

1. **Before Each Phase**: Read the phase Context Priming gate.
2. **During Implementation**: Reference the cited SDD sections in each task.
3. **After Each Task**: Run the task's Validate step (tests, lint, typecheck).
4. **Phase Completion**: Run the phase-validation task.

### Deviation Protocol

When implementation requires changes from the specification:
1. Document the deviation with clear rationale in the phase file.
2. Obtain approval before proceeding.
3. Update `solution.md` when the deviation improves the design.
4. Record all deviations for traceability.

## Metadata Reference

- `[parallel: true]` — Tasks that can run concurrently
- `[ref: document/section]` — Links to specifications
- `[activity: type]` — Activity hint for specialist agent selection

---

## Context Priming

*GATE: Read all files in this section before starting any implementation.*

**Specification**:
- `docs/XDD/specs/002-backlink-codeblock/requirements.md` — Product Requirements (5 features, 24 ACs)
- `docs/XDD/specs/002-backlink-codeblock/solution.md` — Solution Design (modules, ADRs, EARS criteria)
- `docs/ideas/2026-07-03-backlink-codeblock.md` — Source idea (context)
- `docs/ai/memory/decisions.md` — native-CSS + pure-core patterns to mirror

**Reference code (read before Phase 2)**:
- `src/graph/relations.ts`, `src/graph/unlinkedMentions.ts` — pure-core style
- `src/links/MentionLinkService.ts` — cachedRead + native search-result rendering
- `src/view/panels/RelationsPanel.ts` — clickable titles, mod-click, hover-link, empty-state wording
- `src/main.ts` — deps factory + event wiring + registration site
- `src/graph/LinkGraphIndex.ts` — `backlinksOf(path)`

**Key Design Decisions** (from SDD ADRs):
- **ADR-1**: Own codeblock processor, not Obsidian internals — community-safe.
- **ADR-2**: Pure core (`config`/`filter`/`context`) + `MarkdownRenderChild` adapter.
- **ADR-3**: New filter engine (folder-prefix + `getAllTags`), NOT `ExclusionMatcher`.
- **ADR-4**: Context = single-line ~90-char/side window; groups always expanded.
- **ADR-5**: Soft cap ~50 sources in context mode ("… and N more").
- **ADR-6**: Default order = index order (`backlinksOf`), no sort in v1.

**Implementation Context**:
```bash
# Testing
npm test                 # vitest run (unit + jsdom integration)
npm run test:watch       # vitest watch

# Quality
npm run lint             # eslint src/ && stylelint styles.css
npm run typecheck        # tsc --noEmit

# Full build (typecheck + esbuild production)
npm run build
```

---

## Implementation Phases

Each phase is defined in a separate file. Tasks follow red-green-refactor:
**Prime** (context), **Test** (red), **Implement** (green), **Validate** (refactor + verify).

- [ ] [Phase 1: Pure Core](phase-1.md)
- [ ] [Phase 2: Rendering & Plugin Wiring](phase-2.md)
- [ ] [Phase 3: Integration, Docs & Validation](phase-3.md)

---

## Plan Verification

| Criterion | Status |
|-----------|--------|
| A developer can follow this plan without additional clarification | ✅ |
| Every task produces a verifiable deliverable | ✅ |
| All PRD acceptance criteria map to specific tasks | ✅ |
| All SDD components have implementation tasks | ✅ |
| Dependencies are explicit with no circular references | ✅ |
| Parallel opportunities are marked with `[parallel: true]` | ✅ |
| Each task has specification references `[ref: ...]` | ✅ |
| Project commands in Context Priming are accurate | ✅ |
| All phase files exist and are linked from this manifest | ✅ |
