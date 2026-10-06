<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Recurrence Unit Tests (F-08)

- **Plan**: context/changes/recurrence-unit-tests/plan.md
- **Scope**: Full plan (Phases 1–2 of 2; Phase 2 manual items 2.4 and 2.5 are open until the PR exists, on purpose)
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-06
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Scope and method

- Diff range: `f8c527d..HEAD` (427f0ed, a242d88, 60c207f). Local `main` is stale (55df112), so `git diff main` shows unrelated files; `f8c527d` is `origin/main` and the branch base.
- Changed files: `src/lib/screenings/rules.test.ts` (new), `src/lib/screenings/format.test.ts` (new), `CLAUDE.md`, `README.md`, `context/foundation/roadmap.md` (F-08 → `in-progress`, a valid status per the 10x-roadmap lifecycle), and the change folder. All are planned. No production file changed (`git diff --stat f8c527d..HEAD -- src/ ':!src/**/*.test.ts'` is empty).
- The diff was small (2 test files and 2 doc lines), so the drift and safety/pattern passes ran inline, not in sub-agents.

## Automated verification (re-run by the reviewer)

| Check                                                                   | Result                                                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------------- |
| `npm test`                                                              | PASS: 4 files, 116 tests                                      |
| `npm run lint`                                                          | PASS: no output                                               |
| `npx prettier --check CLAUDE.md README.md src/lib/screenings/*.test.ts` | PASS                                                          |
| `npx astro check`                                                       | PASS: 98 files, 0 errors, 0 warnings, 0 hints                 |
| Mutation `nextDue > currentMonth` → `>=` (`rules.ts:265`)               | PASS: 2 tests fail (due-again boundary, Warsaw-midnight flip) |
| Mutation `date <= today` → `<` (`rules.ts:244`)                         | PASS: 2 tests fail (`awaitingConfirmation` today, Warsaw day) |
| Mutation: drop `planned.has(...)` (`rules.ts:263`)                      | PASS: the precedence test fails                               |
| Extra mutation: `isIsoDate` checks only month 1–12 (`rules.ts:75`)      | **SURVIVES**: 61/61 pass (see F1)                             |
| `git diff src/lib/screenings/rules.ts` after the mutations              | empty                                                         |

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

Notes on the PASS dimensions:

- **Plan adherence:** every planned case is present with the planned values. The factories, imports, `it.each` tables and fixed `Date` literals follow the Phase 1 contract. `format.test.ts` matches the Phase 2 table and the `wording.test.ts` pattern, including the re-probe/re-pin comment. The `CLAUDE.md:53` and `README.md:297` edits match their contracts word for word.
- **Patterns:** the `recs()` `typeof … === "number"` adaptation is recorded in decisions.md. The Node 22 named in the `format.test.ts` comment matches CI's `node-version: 22`.

## Findings

### F1 — Impossible-date test does not pin calendar validity

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/screenings/rules.test.ts:198
- **Detail**: The desired end state says each test fails when the rule it pins changes. The plan picked `2026-02-30` as the impossible-date input, but with today `2026-10-06` that date is already before today, so `date < today` rejects it whatever `isIsoDate` does. `2026-13-01` fails only on the month range. A mutated `isIsoDate` that checks the month range but not the day (`return month >= 1 && month <= 12;`) passes all 61 screenings tests, so nothing pins the day-of-month check. `parseDoneForm` does not use `isIsoDate`, so no other test covers it. This is a flaw in the plan, carried into the code.
- **Fix**: Replace `2026-02-30` with an impossible date inside the accepted window, e.g. `2026-11-31` or `2027-02-29`, so that only the calendar check can reject it.
- **Decision**: ACCEPTED (orchestrator) — `2026-02-30` replaced with `2027-02-29` (inside the today..today+2y window, not a leap year). The month-only `isIsoDate` mutation now fails `rejects the impossible date 2027-02-29` (1 failed, 60 passed); `rules.ts` restored.

### F2 — Missing-entry test name overclaims for plans

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/screenings/rules.test.ts:418 (behaviour at src/lib/screenings/rules.ts:257)
- **Detail**: The test is named "skips a plan or completion whose entry is missing, without hiding the tier item", but only the completion's slug (`exam`) is in a tier. The plan uses slug `ghost`, which no tier holds. In the code, `planned` is built from all plans, including those with a missing entry (`rules.ts:257`), so a plan whose entry is missing _does_ hide its tier item and its completion. The assertions match the plan ("The completion does not hide its tier item"), but the name suggests a guarantee the code does not give. This has little effect in practice, because recommendations come from valid entries.
- **Fix**: Narrow the name to what is asserted (e.g. "skips a plan or completion whose entry is missing; the completion does not hide its tier item"). Pinning or changing the plan-side behaviour is out of scope here (no production changes).
- **Decision**: ACCEPTED (orchestrator) — test renamed to "skips a plan or completion whose entry is missing; the completion does not hide its tier item". No production change. The plan-side behaviour is recorded in `follow-ups/missing-entry-plan.md` for the PR description.

### F3 — Manual item 1.5 ticked by the implementer

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/recurrence-unit-tests/plan.md:282
- **Detail**: Phase 1's manual check says "A reviewer checks…", and the Implementation Note asks for a pause for human confirmation, but 1.5 was ticked in the implementation commit (427f0ed). This review independently confirms both halves. Each `describe`/`it` maps to an item in decisions.md "Test scope" (the follow-up list plus `awaitingConfirmation` and plan sort), and no production file changed. So the tick is correct, but the evidence for it comes from this review, not from a separate reviewer step.
- **Fix**: None needed for the code; optionally cite this review next to 1.5.
- **Decision**: ACCEPTED (orchestrator) — plan.md 1.5 now cites this review ("independently confirmed by impl-review.md F3").
