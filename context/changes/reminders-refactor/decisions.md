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
