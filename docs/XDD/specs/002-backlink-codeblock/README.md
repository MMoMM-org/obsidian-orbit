# Specification: 002-backlink-codeblock

## Status

| Field | Value |
|-------|-------|
| **Created** | 2026-07-03 |
| **Current Phase** | Implemented |
| **Last Updated** | 2026-07-04 |

## Documents

| Document | Status | Notes |
|----------|--------|-------|
| requirements.md | completed | 5 must-have features, 24 acceptance criteria, 0 clarifications |
| solution.md | completed | Pure-core + adapter; 6 ADRs (all confirmed); module signatures + EARS criteria |
| plan/ | completed | 3 phases, 12 tasks (3 parallel); TDD Prime/Test/Implement/Validate |

**Status values**: `pending` | `in_progress` | `completed` | `skipped`

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-03 | Scaffold spec 002 from brainstormed idea | Idea `docs/ideas/2026-07-03-backlink-codeblock.md` was brainstormed + gap-reviewed and is ready for XDD |
| 2026-07-03 | Context snippet = ~90-char window, always-expanded groups | User chose window over surrounding-lines to avoid needing collapse; wide window for sentence context |
| 2026-07-03 | Soft cap ~50 sources in context mode ("… and N more") | Bound cachedRead cost on large backlink sets; compact mode uncapped |
| 2026-07-03 | Default order = index order (backlinksOf), not sorted | Stable/deterministic, matches Relations tab; explicit sort options parked |
| 2026-07-03 | Filter engine is a new pure module, NOT ExclusionMatcher | ExclusionMatcher is regex + frontmatter-only; block needs simple folder-prefix + getAllTags (inline+frontmatter) matching |
| 2026-07-03 | Validation PASS (spec-consistency + code-drift), spec → Ready | Full PRD→PLAN coverage, no contradictions, all code refs accurate; applied 3 clarity fixes (folder-normalization rules, same-line highlight contract via matchCount, explicit across-category AND EARS AC); open: verify getAllTags returns '#'-prefixed inline+frontmatter tags in Phase 1 |
| 2026-07-04 | Implementation complete | All 3 phases shipped on branch feat/backlink-codeblock: 3 pure modules + BacklinkCodeBlock (MarkdownRenderChild) + main.ts registration + styles + docs. 79+21+12 = 112 new tests; full suite 745 green; build/lint/typecheck clean. Every phase passed spec-compliance + code-quality review. No drift. |

## Context

In-note `orbital-backlinks` codeblock: renders the containing note's linked
backlinks inline (reading view + live preview), filterable by folder/tag
(include + exclude), in a compact link list or a context (line-snippet) display
mode. Approach 1 selected — pure core (config parser, filter, context extractor)
+ a `MarkdownRenderChild` orchestrator, mirroring `relations.ts` /
`unlinkedMentions.ts`. 2nd-hop explicitly out of scope. Source idea:
`docs/ideas/2026-07-03-backlink-codeblock.md`.

---
*This file is managed by the xdd-meta skill.*
