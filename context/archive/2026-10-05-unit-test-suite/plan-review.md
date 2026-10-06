<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Unit Test Suite (F-03) Implementation Plan

- **Plan**: context/changes/unit-test-suite/plan.md
- **Mode**: Deep (claims verified inline, no sub-agent)
- **Date**: 2026-10-06
- **Verdict**: SOUND
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

7/7 paths ✓ (`package.json`, `.github/workflows/ci.yml`, `CLAUDE.md`, `README.md`, `context/foundation/prd.md`, `src/lib/catalog/recommend.ts`, `src/lib/catalog/wording.ts`). 12/12 symbols and line refs ✓ (`evaluateBranch`/`resolveInterval`/`recommend`, the four `describe*`, `createT`, `recommend.ts:73`, `ci.yml:29`, `CLAUDE.md:24-30,52`, `README.md:296,302`, `prd.md:142`, vite 8.3.0 `resolve.tsconfigPaths`). Brief↔plan ✓. Progress↔phase ✓ (Phase 1: 6+1, Phase 2: 5+1).

Verified in this review:

- **Wording table:** all 38 expected strings (19 pl, 19 en) reproduced exactly on Node 22.16.0 by running the real `wording.ts` and `createT` through `tsx`.
- **Collation:** `Intl.Collator("pl")` sorts `Szafa, Śruba, Zebra`, `Intl.Collator("en")` sorts `Śruba, Szafa, Zebra`, and code-point order gives `Szafa, Zebra, Śruba`. The sort-tie case therefore really tests the pl collator.
- **Vitest 5.0.3:** published with peer `vite ^6.4.0 || ^7.0.0 || ^8.0.0` and engines `node ^22.12.0 || …`.
- **Fixture shapes:** `reviewed_by` is `nullish`, so an omitted reviewer is type-valid (`schema.ts:243`). Override `when` fields are all optional (`schema.ts:137-142`). `Branch.age_min` is required (`schema.ts:128`). `Profile.sex` and `Profile.smoking_status` are `string` (`database.types.ts:102-103`).
- **Case expectations:** the `maybe`/`missing`, override-order, launch-gate and deliberate-break (`recommend.ts:73`) cases all produce the outcomes the plan states.
- **`AGENTS.md`:** it is a symlink to `CLAUDE.md`, so the `CLAUDE.md` edit updates both.

## Findings

### F1 — No `lte` case, though the lung program's live rule depends on it

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — §4 Rule-engine tests
- **Detail**: The Desired End State says "a broken eligibility … rule fails the PR". However, the case list exercises only `gte`, `eq` and `in`, so the `lte` arm of `holds()` (`recommend.ts:61-62`) is untested. `lte` is used by a live entry: `catalog/entries/lung-ldct-nfz-program.json` requires `years_since_quitting lte 15` for former smokers, in two of its four branches. A regression from `<=` to `<` would silently drop a former smoker who quit exactly 15 years ago from the NFZ lung program, and no test would fail. The same goes for a null `years_since_quitting` (`factors.ts:46`: "Null unless smoking_status is former") if it were treated as matching.
- **Fix**: Add a **`lte` and null** case to Phase 1's `evaluateBranch` block: a branch requires `years_since_quitting lte 15`; 15 → `"match"` (inclusive), 16 → `"no"`, null → `"no"`. Mention it in Testing Strategy.
- **Decision**: ACCEPTED (orchestrator, 2026-10-06) — `lte`/null case added to Phase 1 §4 and Testing Strategy.

### F2 — Phase 1's CI check needs a PR that only Phase 2 opens

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Manual Verification (Progress 1.7) and its Implementation Note; Phase 2 Implementation Note
- **Detail**: Progress 1.7 ("On the PR, the `ci` job shows the `npm test` step running and passing") and the Phase 1 note ("pause for the manual CI confirmation before Phase 2") both need a PR. The plan opens the PR only after Phase 2 ("then open the PR"). CI runs only on `pull_request` to `main`, `push` to `main` and `workflow_dispatch` (`ci.yml:3-8`), so pushing the branch alone produces no `ci` run. The implementer must either open a PR mid-change, ahead of impl-review in the orchestrated chain (implement → impl-review → PR), or leave 1.7 unchecked and stall at the Phase 1 gate.
- **Fix**: Move the CI-log check into Phase 2's Manual Verification as a step after the PR is open, and drop 1.7 from Phase 1 (renumber Progress to match). Change the Phase 1 note to pause after the automated checks. The local `npm test`, `npm run lint`, `npx astro check` and `npm run build` sequence already proves Phase 1 before any PR exists.
- **Decision**: ACCEPTED (orchestrator, 2026-10-06) — 1.7 dropped from Phase 1; CI-log check is now Phase 2 Manual 2.7, after the PR is open (stage 10); Phase 1 pauses after automated checks.

### F3 — README's scripts list doesn't gain `npm test`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — §2 Docs
- **Detail**: The docs contract edits `README.md:296` (the smoke note) and `:302` (the CI job list). It misses the README's script list, where every `npm run …` command has a bullet (`README.md:58-59`, e.g. `npm run ui:check`). After the change, `npm test` would be the only project script without a bullet there.
- **Fix**: Add a `npm test` bullet (Vitest, colocated `src/**/*.test.ts`) to the README script list next to `npm run ui:check`.
- **Decision**: ACCEPTED (orchestrator, 2026-10-06) — `npm test` bullet added to the README "Available Scripts" contract in Phase 2 §2.

### F4 — ICU drift risk is scoped to a Node major, but CI floats on 22.x

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: plan-brief.md "Open Risks & Assumptions"; Phase 2 §1 Wording tests
- **Detail**: The brief says only "a Node major bump in CI may require re-pinning" the wording strings. But `ci.yml:23` uses `node-version: 22`, which resolves to the newest 22.x on each run, and Node minor releases can ship ICU/CLDR updates (`Intl.ListFormat`, `NumberFormat`, `PluralRules` data). Contributors also run any Node ≥ 22.12 locally. Today's strings are stable, so the risk is small. Still, a wording test could start failing on CI with no code change, and the plan gives no instruction for that case.
- **Fix**: Reword the risk to "a Node update (minor or major) that changes ICU data". Add one line to the CLAUDE.md Testing Guidelines edit: if wording tests fail after a Node update with no code change, re-probe the strings and re-pin them.
- **Decision**: ACCEPTED (orchestrator, 2026-10-06) — risk reworded to "a Node update (minor or major)"; re-probe/re-pin line added to the CLAUDE.md Testing Guidelines contract.
