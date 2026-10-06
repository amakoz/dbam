<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Unit Test Suite (F-03)

- **Plan**: context/changes/unit-test-suite/plan.md
- **Scope**: Full plan (2 of 2 phases)
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-06
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

Reviewed range: `1b719a9..58ab0d4` (commits 28510fc, 286e2e9, 58ab0d4). Progress is 12 of 13. Row 2.7 (the `ci` job log on the PR) is open on purpose until the PR stage. It is pending, not a gap.

## Verdicts

| Dimension           | Verdict                   |
| ------------------- | ------------------------- |
| Plan Adherence      | WARNING (F2, observation) |
| Scope Discipline    | WARNING (F1)              |
| Safety & Quality    | WARNING (F3, observation) |
| Architecture        | PASS                      |
| Pattern Consistency | PASS                      |
| Success Criteria    | PASS                      |

The overall verdict counts finding severity: there is one WARNING finding, and F2 and F3 are observations. So the result is APPROVED.

## Plan drift summary

| Planned change                                                                                                                                                                             | File(s)                                               | Verdict                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest `^5.0.3` dev dependency, `test: "vitest run"`                                                                                                                                       | `package.json`, `package-lock.json`                   | MATCH                                                                                                                                                                                          |
| Config: `vitest/config`, `resolve.tsconfigPaths: true`, `include: ["src/**/*.test.ts"]`, `environment: "node"`, no plugins                                                                 | `vitest.config.ts`                                    | MATCH (the alias fallback was not needed, as recorded in decisions.md)                                                                                                                         |
| `npm test` placed after `ui:check` and before `astro check` in the `ci` job                                                                                                                | `.github/workflows/ci.yml:30`                         | MATCH                                                                                                                                                                                          |
| Rule-engine cases: inclusive bounds, null `pack_years`, `lte`/null, false beats unknown, `in`, overrides, non-fixed kinds, tiers, sort ties, launch gate, maybe/missing, first branch, age | `src/lib/catalog/recommend.test.ts`                   | MATCH. Every planned case is present. Small additions that stay in scope: a `sex` block (`:104-110`), "carries the resolved interval" (`:213-216`) and a launch-gate `maybe` case (`:276-283`) |
| Wording table, pl and en                                                                                                                                                                   | `src/lib/catalog/wording.test.ts`                     | MATCH. Every row in the plan's table is asserted verbatim                                                                                                                                      |
| Docs: CLAUDE.md commands and Testing Guidelines, README scripts, `:296`, `:302`, PRD `:142`                                                                                                | `CLAUDE.md`, `README.md`, `context/foundation/prd.md` | MATCH                                                                                                                                                                                          |
| Not in plan: F-03 `ready → in-progress` and a prettier re-alignment of the At a glance table                                                                                               | `context/foundation/roadmap.md`                       | EXTRA, benign. It is chain bookkeeping and is recorded in decisions.md under "Roadmap flip left unstaged"                                                                                      |

Nothing from "What We're NOT Doing" was crossed: no `rules.ts` or `format.ts` tests, no coverage or pre-commit hook, no real catalog data, no Astro or DOM environment, and no change to `recommend.ts` or `wording.ts`.

## Success criteria (re-run by the reviewer)

| #            | Command                                                              | Result                                                                                                                |
| ------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1.1          | `npm ls vitest`                                                      | PASS: `vitest@5.0.3`                                                                                                  |
| 1.2 / 2.1    | `npm test`                                                           | PASS: 2 files, 55 tests, 240 ms                                                                                       |
| 1.3          | `age > branch.age_max` → `>=` in `recommend.ts:73`, then `npm test`  | PASS: 1 test failed (`age 69 → match`). After the revert, all 55 pass                                                 |
| 1.4 / 2.2    | `npx astro sync && npm run lint`                                     | PASS: exit 0                                                                                                          |
| 1.5 / 2.3    | `npx astro check`                                                    | PASS: 0 errors. An injected `const _bad: number = "x"` in `recommend.test.ts` was reported as ts(2322), then reverted |
| 1.6          | `npm run build`                                                      | PASS: build complete                                                                                                  |
| 2.4          | `grep -ri "no unit suite" CLAUDE.md README.md`                       | PASS: no matches                                                                                                      |
| 2.5          | `npx prettier --check CLAUDE.md README.md context/foundation/prd.md` | PASS                                                                                                                  |
| 2.6 (manual) | Reviewer read the docs                                               | Evidence in the diff: the CLAUDE.md and README notes match `vitest run` and the `include` glob. Not rubber-stamped    |
| 2.7 (manual) | `ci` job log on the PR                                               | PENDING on purpose, until the PR stage                                                                                |

Local Node pin `.nvmrc` = 22.14.0 meets Vitest 5's `^22.12.0` engine requirement.

## Findings

### F1 — Deferred recurrence tests are not tracked anywhere

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: context/changes/unit-test-suite/plan.md ("What We're NOT Doing"), context/foundation/roadmap.md:123
- **Detail**: The plan defers the `src/lib/screenings/rules.ts` recurrence cases and `format.ts`'s `describeLastDone` "to a follow-up change that reuses this runner". The cases are `nextDueMonth`, `addMonths`/`addYears`, `partitionDashboard`, Warsaw midnight and Feb 29, listed at `context/archive/2026-09-30-record-appointment-date/plan.md:430-439`. No roadmap item, GitHub issue or follow-ups file records that change. `grep` over `roadmap.md` finds no entry for it. Meanwhile the F-03 block still says "**Unlocks:** safer changes to S-05's recurrence logic" (`roadmap.md:123`). S-05 is done and its recurrence logic stays untested after this change. The two upcoming slices that read due dates, S-06 (due-screening-reminder) and S-07, build on that logic.
- **Fix A ⭐ Recommended**: Add a foundation item to `roadmap.md` (for example F-08 `recurrence-unit-tests`: "unit tests cover `rules.ts` recurrence and `describeLastDone`", prerequisite F-03, before S-06), and reword F-03's "Unlocks" to "the runner for recurrence tests (F-08)".
  - Strength: The deferral becomes visible to `/10x-roadmap` and the orchestrator, which pick the next slice. The cases already exist in the archived plan, so the item is cheap to plan.
  - Tradeoff: It touches the roadmap, which the orchestrator or a human usually owns. A worker should not commit that edit without approval.
  - Confidence: HIGH — the roadmap is the source the orchestrator reads for the next slice.
  - Blind spot: There might be a GitHub issue outside the repo already. Not checked; that would need `gh issue list`.
- **Fix B**: Record it only as `context/changes/unit-test-suite/follow-ups/recurrence-tests.md` and in the PR description.
  - Strength: It stays inside this change's folder, so the roadmap is not touched.
  - Tradeoff: Once the change is archived, the note sits under `context/archive/` where slice selection won't see it.
  - Confidence: MEDIUM — it depends on someone reading the archived change.
  - Blind spot: None significant.
- **Decision**: PENDING

### F2 — Roadmap F-03 block keeps a stale risk note and a dead path

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/roadmap.md:127
- **Detail**: Phase 2 dropped the PRD's "until then it is covered by smoke checks, pgTAP and manual test profiles" clause (`prd.md:142`). It did not touch the matching roadmap Risk bullet: "until F-03 lands the branch-evaluation edge cases rely on smoke, pgTAP and manual test profiles". That bullet also points at `context/changes/screening-recommendations/plan.md`, which no longer exists. The file was archived to `context/archive/2026-09-28-screening-recommendations/plan.md`. The plan missed this mirror of the PRD clause; the implementation followed the plan.
- **Fix**: At close-out, when F-03 flips to `done`, reword the Risk to "—" or "Resolved by F-03", and repoint the path to `context/archive/2026-09-28-screening-recommendations/plan.md`.
- **Decision**: PENDING

### F3 — The en assertion in the maybe-sort test passes on input order, not names

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/catalog/recommend.test.ts:250-256
- **Detail**: In "sorts maybe by burden weight, then by name in the locale", `low` and `tie-b` both have `burden_weight: 2` and `name_en: "Aaa"`. Under `en`, the collator returns 0 for that pair, so `["high", "low", "tie-b", "tie-a"]` holds only because `Array.prototype.sort` is stable and `low` comes first in the input. If the input order changed, the test would fail with no code change. And a regression that sorted `en` by `name_pl` would still order `low` before `tie-b`, because `Aaa < Bcd`. The en `tie-a`/`tie-b` order does still catch that regression, so coverage is not lost. Only the `low`/`tie-b` pair is fragile.
- **Fix**: Give `tie-b` a distinct `name_en`, for example `"Bbb"`. The en order stays `low (Aaa) < tie-b (Bbb) < tie-a (Zzz)` and the expected arrays don't change.
- **Decision**: PENDING
