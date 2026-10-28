<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Catalog check guards Implementation Plan

- **Plan**: context/changes/catalog-check-guards/plan.md
- **Mode**: Quick
- **Date**: 2026-10-28
- **Verdict**: SOUND
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | PASS    |
| Plan Completeness     | PASS    |

## Grounding

6/6 paths ✓ (`scripts/catalog/{lib,check,migration}.ts`, `catalog/README.md`, `CLAUDE.md`, `vitest.config.ts`), 6/6 symbols ✓ (`findDeletedSlugs`, `parseSnapshotSlugs`, `listSnapshots` oldest first, `renderSnapshotSql` row layout, `warsawToday`, `CATALOG_STATUSES`), brief↔plan ✓, Progress↔Phase ✓ (1.1–1.4, 2.1–2.7).

The riskiest claim was checked directly. The plan's row-start regex, run against all 3 committed snapshots, matches each of the 20 manifest slugs exactly once (19 active, 1 draft in every snapshot). The parse holds and history has no backward moves. `warsawToday`'s import chain (`rules.ts` → `recommend`/`factors`/`profile`) has no `astro:` virtual modules, so `check.ts` can import it under `tsx` before `astro sync` runs in CI. A past `next_review_due` passes the schema (`checkReviewStamp` checks only `reviewed_by`/`last_reviewed`), so the overdue break in 2.4 is feasible.

## Findings

### F1: No path to undo a wrong retirement

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW (quick decision; the fix is obvious and narrowly scoped)
- **Dimension**: Blind Spots
- **Location**: Phase 2 §3 Docs (Lifecycle: "Retired is final … the check has no override")
- **Detail**: After this change, retired → active fails `catalog:check` against every committed snapshot, and the check has no override. A merge to `main` deploys only when `ci` is green. If the owner ever needs to reverse a mistaken retirement, the only way is to edit the guard in `scripts/catalog/lib.ts`. The README would say only that this is "outside this tooling", so the next agent has nothing to follow. Q-02 makes this an acceptable trade-off. The gap is only in the docs.
- **Fix**: Add one sentence to the README Lifecycle section naming the escape path, for example: "a reversal needs a code change to the guard in `scripts/catalog/lib.ts`, recorded as an owner decision". This keeps the check override-free.
- **Decision**: FIXED

### F2: Small test gaps in the warning output

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW (quick decision; the fix is obvious and narrowly scoped)
- **Dimension**: Plan Completeness
- **Location**: Testing Strategy (`formatReviewWarnings`, `renderReviewSummary`) and Critical Implementation Details ("Warnings print before the outcome … on both the failing and the passing path")
- **Detail**: Testing Strategy has no case for `renderReviewSummary` and none for the singular `entry` form when n = 1. The annotation template also reads "entr(y|ies) need review", so the singular would come out as "1 … entry need review". No break check covers the failing path printing the warnings (2.3 demotes, 2.4 warns, and neither does both). That path is the one place a warning could get mixed into `problems` and change the exit code. The brief names that as Phase 2's key risk.
- **Fix**: Add unit cases for `renderReviewSummary` (heading plus one bullet per entry, `[]` handling) and for `formatReviewWarnings` with one warning (singular, "needs"). In break check 2.3, also set a past `next_review_due` and assert that the `warning:` line prints and the exit code is still 1 because of the demotion alone.
- **Decision**: FIXED
