# Decisions — reminders-refactor

## 2026-10-27 Debt item to explore

- Question: which F-12 debt item does F-13 take through the three lenses?
- Options: F-12 candidate #1 (TD-1 + TD-7 + TD-8: shared claim → send → mark runner with injected client and sender) vs. other F-12 candidates (incl. ones touching SD-3 or needing a migration).
- Choice: candidate #1 — extract the shared claim → send → mark runner with injected client and sender, making the three jobs and the two inline email builders unit-testable.
- Evidence: `context/archive/2026-10-27-reminders-research/research.md` (TD-1, TD-7, TD-8); largest confirmed duplication, TypeScript only (a Worker rollback reverts it), avoids the open SD-3 product question and any migration.
- decided-by: orchestrator

## 2026-10-27 Research scope and verification method

- Question: how to cover the three lenses within the 2-sub-agent cap, and how to verify the option ranking without touching source.
- Options: (a) 2 sub-agents (current shape + history); (b) 1 sub-agent for decision history, current shape and feasibility read in main context, ranking verified by a scratchpad spike; (c) no spike, ranking by reading only.
- Choice: (b). The spike (scratchpad only, never in the repo) ran 42 scenarios differentially against today's jobs and an Option B runner (identical transcripts) plus a no-mock purity test (44 tests passed).
- Evidence: `research.md` Lens 3; F-12's "can't be imported by Vitest" claim is partial (true only without mocks).
- decided-by: worker

## 2026-10-27 Option ranking for the plan

- Question: which option should `/10x-plan` build on?
- Options: A guard in place (characterization tests + extracted builders); B shared runner with injected deps on top of A; C per-job injection without a shared runner.
- Choice: A then B (guard first, four independently revertable TypeScript phases); A alone is a valid stopping point; C rejected as dominated by B.
- Evidence: `research.md` Lens 3 (spike results, constraints 1–8, invariants I1–I14).
- decided-by: worker

## 2026-10-27 Answers to the research open questions

- Question: research.md Open Questions (transcript gate, cold CPU, SITE inlining, fourth job).
- Choice: (1) explicit per-invariant expects (I1–I14) plus one `toEqual` transcript per job for the `sent` scenario; (2) `due.perf.test.ts` stays the CPU gate, production CPU becomes a Manual row; (3) SITE inlining becomes a build-output verification step (phase 4), not an assumption; (4) TD-5 / a fourth job out of scope, one line in `follow-ups/td-5-job-list.md`.
- Evidence: research.md Open Questions; orchestrator prompt for /10x-plan.
- decided-by: orchestrator

## 2026-10-27 Plan shape and fixed seams

- Question: phase order and seams the refactor must not move.
- Choice: guard-first; characterization tests (no source change) → `MAX_BATCH_SIZE` move → runner → per-job migration → builders. Keep job names/signatures, the real `sendEmailBatch` as injected sender, and the same rethrown error object. Implementation parked; the spike is not kept.
- Evidence: research.md Lens 3 constraints 1–8.
- decided-by: orchestrator

## 2026-10-27 Planning complexity, question budget and phase split

- Question: complexity level, interview budget, phase granularity.
- Options: MEDIUM with 5–7 questions vs settled-input exception with 0 questions; 4 vs 7 phases.
- Choice: MEDIUM complexity, 0 substantive questions (every open decision is settled by research plus the orchestrator's answers); 7 phases — 1 tests, 2 constant, 3 runner without consumer, 4 appointment (+ `deps.ts`, SITE check), 5 nudge, 6 due (+ lint allow-list cleanup), 7 builders — so each job migration reverts on its own.
- Evidence: plan.md Implementation Approach; research.md Lens 1 (due job is the most complex, migrate last).
- decided-by: worker

## 2026-10-27 Runner design details

- Question: details the orchestrator delegated.
- Choice: `client` is a factory called after the gates (I14); `budget: number | undefined`, undefined = no budget gate (appointment); specs stay in the job files with production wiring in a new `src/lib/reminders/deps.ts` called once per run; runner added to the `no-console` allow-list in phase 3, job files removed in phase 6; outcome types kept as aliases of `ReminderOutcome`; characterization harness in `transcript.test-helper.ts` shared by three per-job test files.
- Evidence: research.md I14, `eslint.config.js:77-88`, `chain.ts:13-21`.
- decided-by: worker

## 2026-10-27 Roadmap untouched

- Question: /10x-plan's roadmap sync would flip F-13 to `planning`.
- Choice: skipped — worker protocol forbids roadmap status changes during plan; the orchestrator parks implementation.
- decided-by: orchestrator

## 2026-10-27 Plan-review triage (plan-review.md F1–F7)

- Question: how to resolve the seven plan-review findings.
- Choice: F1 Fix A (deps.ts in phase 3, per-job allow-list lines, builders split 7a/7b, rollback unit and data caveat in Migration Notes); F2 break matrix in phase 1 plus a deliberate break per later phase; F3 I15, result `toEqual`, budget-0 config-error rows, `toBe`, throwing-gate row, `try` placement stated; F4 production Manual row per job phase gating the next, CPU row in phase 6, final check last; F5 SITE baseline in phase 1 and whole-output check in phase 4; F6 keep phase 2 with the honest reason; F7 all three corrections.
- Evidence: `plan-review.md`.
- decided-by: orchestrator

## 2026-10-27 Numbering of the 7a/7b split

- Question: how to number the split builder phase so Progress stays parseable (`<phase>.<index>` rows, `### Phase N:` headings).
- Choice: Phase 7 "Extract the appointment builder (7a)" and Phase 8 "Extract the due-screening builder (7b)"; the old final production row 7.4 becomes 8.5, the old CPU row 7.5 moves to phase 6 (6.7). Phase 1 keeps 1.1–1.5 and appends 1.6–1.12.
- decided-by: worker

## 2026-10-27 Plan re-check nits (plan-review.md "Re-check", APPROVED)

- Question: apply the two optional residual nits R1 and R2?
- Choice: both applied. R1: the Migration Notes revert procedure names the two one-line conflicts (the `eslint.config.js` allow-list hunk when reverting phase 4 or 5 after phase 6; the `follow-up-nudge.ts:1` import when reverting phase 2 after phase 5) and how to resolve them. R2: the phase 4 `SITE` check also greps for the URL in the chunk holding `reminderDeps`.
- Evidence: `plan-review.md` Re-check (R1 verified in a scratch repo by the reviewer).
- decided-by: orchestrator

## 2026-10-27 Archive with all Progress rows open

- Question: archive while every Progress row in `plan.md` is unchecked?
- Choice: yes. Implementation is parked by the roadmap; M-02 delivers the plan only (F-13, PRD MS-05). Every row stays open on purpose for whoever implements the plan later.
- decided-by: orchestrator
