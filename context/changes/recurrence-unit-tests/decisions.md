# Decisions: recurrence-unit-tests

## 2026-10-06 Test scope

- **Question:** Which functions do the F-08 tests cover? (research.md, Open Questions 1)
- **Options:**
  - (a) the roadmap line only
  - (b) the follow-up note's list plus the two cases missing from it
  - (c) (b) plus `isIsoDate`, `screeningFormBounds` and `formatDay`/`formatMonth`
- **Choice:** (b). The tests cover:
  - the follow-up note's list (`context/archive/2026-10-05-unit-test-suite/follow-ups/recurrence-tests.md`): `warsawToday`/`warsawMonth`, `addMonths`/`addYears`, `parsePlanForm`, `parseDoneForm`, `anchorMonth`, `nextDueMonth`, `partitionDashboard` and `describeLastDone`;
  - ready-to-confirm on or before the appointment day (`awaitingConfirmation`);
  - plan sort order, with the plans fed out of order.

  The three optional functions are out of scope and are listed under "What We're NOT Doing".

- **Evidence:** research.md, Summary and Open Questions 1. Optional functions are smaller and the choice is reversible.
- **Decided by:** orchestrator

## 2026-10-06 PRD testing NFR wording

- **Question:** Should `prd.md:142`, which names only the catalog rules, be extended to the recurrence rules? (research.md, Open Questions 2)
- **Choice:** Leave `prd.md` untouched. Mention the wording as a note for the owner in the PR description.
- **Decided by:** orchestrator

## 2026-10-06 ICU drift

- **Question:** Do the time-zone and date-wording tests need a new drift mechanism? (research.md, Open Questions 3)
- **Choice:** No new mechanism. Reuse the existing re-probe/re-pin comment (`src/lib/catalog/wording.test.ts:8-9`, CLAUDE.md Testing Guidelines).
- **Decided by:** orchestrator

## 2026-10-06 Signatures

- **Question:** The archived S-03 plan describes a 3-argument `nextDueMonth` and a 4-argument `partitionDashboard`. Which signatures do the tests follow?
- **Choice:** Test the real signatures (`rules.ts:172-177`, `rules.ts:219-226`), not the old S-03 plan.
- **Decided by:** orchestrator

## 2026-10-06 Complexity and phases

- **Question:** What are the plan's complexity, question budget and phase structure?
- **Options:**
  - Complexity: (a) LOW with 0 substantive questions, (b) higher, (c) lower.
  - Phases: (a) 2 phases, (b) adjust, (c) merge into 1.
- **Choice:**
  - Complexity: LOW, 0 questions. Research and the pre-answers settle every material decision.
  - Phases: 2. Phase 1 covers the rules tests. Phase 2 covers the `describeLastDone` wording tests, `CLAUDE.md:53` and `README.md:297`.
- **Evidence:** research.md; F-03's phase split (`context/archive/2026-10-05-unit-test-suite/decisions.md`, "Phase split").
- **Decided by:** orchestrator

## 2026-10-06 Bug found by a test

- **Question:** What if a new test exposes a bug in `rules.ts` or `format.ts`?
- **Choice:** Record it here and stop for a decision. Do not fix it in this change.
- **Evidence:** F-03 precedent (`context/archive/2026-10-05-unit-test-suite/plan.md:55`). The research probe found no bug.
- **Decided by:** worker

## 2026-10-06 Mutation spot-check

- **Question:** How do we show the boundary tests can fail?
- **Choice:** Phase 1 temporarily flips `>` at `rules.ts:265` and `<=` at `rules.ts:244`. Each flip must fail a test, and both are reverted.
- **Evidence:** F-03 impl-review F3 (`context/archive/2026-10-05-unit-test-suite/impl-review.md:89`) found a sort test that passed on input order.
- **Decided by:** worker

## 2026-10-06 Plan-review triage (plan-review.md F1–F2)

- **Question:** How should the two plan-review findings be resolved? The verdict was SOUND, with 1 warning and 1 observation.
- **Options:** accept or reject each finding.
- **Choice:** Both accepted.
  - **F1:** the `partitionDashboard` precedence fixture uses a completion that is not yet due (`2025-10-01` + 24 months) and whose slug is also in tier 1. A third mutation bullet requires that deleting `planned.has(completion.catalog_slug)` at `rules.ts:263` fails at least one test. The Progress 1.4 title is unchanged.
  - **F2:** the four DST timestamps inside the switch hour are replaced with the first Warsaw midnight after each switch: `2026-03-29T21:59:59Z` → `2026-03-29`, `22:00:00Z` → `2026-03-30`; `2026-10-25T22:59:59Z` → `2026-10-25`, `23:00:00Z` → `2026-10-26`.
- **Evidence:**
  - F1: with an already-due completion, deleting the `rules.ts:263` skip routes the record to `dueAgain`, and `hidden` still filters the slug through `planned` (`rules.ts:271`), so the output does not change.
  - F2: instants inside the switch hour fall on the same calendar date under a fixed offset or plain UTC, so they cannot fail. The post-switch midnights were probed on Node 22.16.0.
- **Decided by:** orchestrator

## 2026-10-06 Phase 1 mutation results

- **Question:** Did the Phase 1 mutation spot-check go red on each flip?
- **Choice:** Yes. Each edit was worktree-only and restored with `git checkout -- src/lib/screenings/rules.ts`; `git diff` on `rules.ts` is empty.
  - `nextDue >= currentMonth` (`rules.ts:265`): 2 tests fail (due-again boundary, Warsaw-midnight flip).
  - `date < today` (`rules.ts:244`): 2 tests fail (`awaitingConfirmation` today, Warsaw "today").
  - delete `planned.has(...)` (`rules.ts:263`): the precedence test fails.
  - Extra, beyond the plan: deleting `...planned` from `hidden` (`rules.ts:271`), removing `planViews.sort`, and dropping the `created_at` tie-break each fail the precedence or sort test.
- **Adaptation:** `recs()` checks `typeof e.interval_months === "number"` rather than `!== null`, because `interval_months` is `number | null | undefined` on `CatalogEntry`.
- **Decided by:** worker

## 2026-10-06 Implementation review

- **Question:** How is the implementation review run and where does the report go?
- **Choice:** The review ran inline (2 test files and 2 doc lines, so no sub-agents). The report is at `impl-review.md` in the change root, as the orchestrator asked. The orchestrator triages it; the worker decided nothing. One extra mutation (`isIsoDate` checking only the month range) survived, which is F1.
- **Decided by:** orchestrator (report path, no triage), worker (inline review)

## 2026-10-06 Impl-review triage (impl-review.md F1–F3)

- **Question:** How should the three implementation-review findings be resolved? The verdict was APPROVED, with 1 warning and 2 observations.
- **Options:** accept or reject each finding.
- **Choice:** All three accepted.
  - **F1:** the impossible-date input `2026-02-30` is replaced with `2027-02-29`, which lies inside the accepted window (today `2026-10-06` to today + 2 years) so only the calendar check can reject it.
  - **F2:** the missing-entry test is renamed to what it asserts ("skips a plan or completion whose entry is missing; the completion does not hide its tier item"). No production change. The plan-side behaviour (a missing-entry plan still hides its tier item and completion, `rules.ts:257`) goes to `follow-ups/missing-entry-plan.md` for the PR description.
  - **F3:** plan.md 1.5 cites the impl review as the independent confirmation.
- **Evidence:** F1: with `isIsoDate` mutated to check only the month range, `rejects the impossible date 2027-02-29` fails (1 failed, 60 passed); before the fix the same mutation passed 61/61. `rules.ts` restored, `git diff` empty.
- **Decided by:** orchestrator
