# Recurrence Unit Tests (F-08) — Plan Brief

> Full plan: `context/changes/recurrence-unit-tests/plan.md`
> Research: `context/changes/recurrence-unit-tests/research.md`

## What & Why

The plan pins the screening date and recurrence rules (`src/lib/screenings/rules.ts`) and the "last done" wording (`describeLastDone` in `format.ts`) with Vitest unit tests. S-03 and S-05 shipped these rules untested, and S-06 (due-screening reminder emails) will act on the due dates they compute. A silent regression there would mean wrong or missing reminders.

## Starting Point

- F-03 (#77) added the Vitest runner and catalog tests. It deliberately deferred this scope.
- `src/lib/screenings/` has no tests.
- Research ran the real functions against all 8 source cases plus the 2 cases S-05 added. All pass, and no bug was found.

## Desired End State

- Two new colocated test files, `rules.test.ts` and `format.test.ts`, run in CI's `ci` job.
- Any change to these rules fails a named test, including:
  - the Warsaw-midnight, Feb 29 and due-again boundaries;
  - plan-over-completion precedence;
  - ready-to-confirm;
  - plan sort order;
  - the pl and en wording.
- `CLAUDE.md` and `README.md` describe the wider coverage.

## Key Decisions Made

| Decision            | Choice                                                                                                                        | Why (1 sentence)                                                                                                | Source                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Scope               | Follow-up note's list, plus ready-to-confirm and plan sort; not `isIsoDate`, `screeningFormBounds`, `formatDay`/`formatMonth` | Covers what S-06 depends on; the excluded functions are small and either indirectly covered or reversible later | Research / orchestrator      |
| Signatures          | Test the real 2-argument `nextDueMonth` and 6-argument `partitionDashboard`                                                   | The archived S-03 plan's signatures are outdated                                                                | Research / orchestrator      |
| PRD testing line    | Leave `prd.md` alone; note it in the PR for the owner                                                                         | A product-doc change is outside a test-only change                                                              | Orchestrator                 |
| ICU drift           | Reuse the re-probe/re-pin comment                                                                                             | The same accepted risk as F-03's wording tests                                                                  | Orchestrator                 |
| Fixtures            | Typed inline factories; no catalog JSON or schema parse                                                                       | F-03 convention (`unit-test-suite/decisions.md:46-52`)                                                          | Plan                         |
| Bug found by a test | Record it and stop for a decision; no fix here                                                                                | F-03 precedent (`unit-test-suite/plan.md:55`)                                                                   | Plan                         |
| Plan-review F1      | The precedence fixture uses a not-yet-due completion that is also in tier 1; a third mutation deletes the `planned.has` skip  | With an already-due completion, removing the skip leaves the output unchanged                                   | Plan review / orchestrator   |
| Plan-review F2      | Test the first Warsaw midnight after each DST switch, not instants inside the switch hour                                     | Instants inside the switch hour cannot fail under any plausible regression                                      | Plan review / orchestrator   |
| Phasing             | 2 phases: rules, then wording and docs                                                                                        | Mirrors F-03; isolates the ICU-sensitive strings                                                                | Plan (orchestrator approved) |

## Scope

**In scope:**

- `warsawToday`/`warsawMonth`, `addMonths`/`addYears`, `parsePlanForm`, `parseDoneForm`, `anchorMonth`, `nextDueMonth`.
- `partitionDashboard`:
  - precedence and the due-again boundary;
  - no-interval completions;
  - `awaitingConfirmation`;
  - sort order with out-of-order input;
  - missing entries;
  - interval resolution by age.
- `describeLastDone` in pl and en (3 branches).
- `CLAUDE.md:53` and `README.md:297` wording.

**Out of scope:**

- Direct tests for `isIsoDate`, `screeningFormBounds`, `formatDay` and `formatMonth`.
- Any production-code change, and `prd.md`.
- Vitest, CI and coverage config.
- A shared test-helper module.
- Tests for `read.ts`, components or reminders.

## Architecture / Approach

Pure-function tests under `environment: "node"`, with "now" passed as fixed `Date` literals that sit on Warsaw-midnight edges, including the first midnight after each DST switch.

- `partitionDashboard` gets small typed factories for entries, plans, completions and recommendations.
- The wording tests use the real `createT` and pin full sentences.
- Phase 1 includes a mutation spot-check. It guards against tests that pass by accident. Each of these must fail a test:
  - flipping the due-again `>`;
  - flipping the ready-to-confirm `<=`;
  - deleting the plan-over-completion skip.

  The precedence fixture uses a not-yet-due completion so that the skip deletion is observable.

## Phases at a Glance

| Phase                     | What it delivers                                                                | Key risk                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1. Rules tests            | `src/lib/screenings/rules.test.ts` covering every rule in scope                 | A test passes for the wrong reason (input order, wrong fixture); the mutation spot-check and out-of-order sort input address it |
| 2. Wording tests and docs | `src/lib/screenings/format.test.ts` (pl/en) plus the CLAUDE.md and README lines | ICU drift on a Node update changes the Polish or English strings; handled by re-probe/re-pin                                    |

**Prerequisites:** F-03 merged (#77, done). No database, secrets or local server needed.
**Estimated effort:** about 1 short session across 2 phases.

## Open Risks & Assumptions

- **Node version drift.** CI floats on Node 22, `.nvmrc` says 22.14.0, and the strings were probed on 22.16.0. A change in ICU or time-zone data could break the pinned strings or Warsaw dates without any code change. This is accepted and documented.
- **Signal value.** The tests pin current behaviour, which the research verified against the specs. They detect regressions; they do not re-validate the product rules.

## Success Criteria (Summary)

- `npm test` passes locally and in CI with both new files. Lint and `astro check` stay green.
- Breaking the due-again or ready-to-confirm comparison, or removing plan-over-completion precedence, fails a test.
- The PR carries the PRD testing-line note for the owner.
