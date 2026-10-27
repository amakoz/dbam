# Reminder jobs: shared claim → send → mark runner — Plan Brief

> Full plan: `context/changes/reminders-refactor/plan.md`
> Research: `context/changes/reminders-refactor/research.md`
> Plan review: `context/changes/reminders-refactor/plan-review.md` (F1–F7 decided and applied)

## What & Why

The three daily reminder jobs (appointment, due-screening, follow-up nudge) each hand-copy the same skeleton: gate, claim, send, dry-run stop, mark, log. Two of the three email builders are inline, and no unit test imports any job (F-12 TD-1, TD-7, TD-8).

This plan pins today's behaviour first, then moves the jobs onto one pure, injectable runner and extracts the builders, so the whole pipeline becomes unit-testable. Implementation is parked: the plan is the deliverable for F-13.

## Starting Point

- `chain.ts` already injects the jobs and is tested.
- The jobs themselves read the admin client, `astro:env` and `SITE` directly.
- The research spike showed two things:
  - the jobs can be tested as they are, with the `vi.mock("astro:env/server")` precedent;
  - a shared runner reproduces today's transcript exactly in 42 of 42 scenarios.

## Desired End State

- `runner.ts` holds the one skeleton, pure and tested without `astro:*` mocks.
- Each job file is a small spec plus one call into the runner with `reminderDeps()`. The exported names and signatures are unchanged, so `worker.ts` and `chain.ts` are untouched.
- Both builders are pure modules with copy and privacy tests.
- The phase 1 characterization tests pass, byte-unchanged, after every phase. Each phase's deliberate break proves the tests exercise the new code.

## Key Decisions Made

| Decision              | Choice                                                                                                                               | Why (1 sentence)                                                                                                     | Source       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------ |
| Debt item             | F-12 candidate #1: TD-1 + TD-7 + TD-8                                                                                                | Largest confirmed duplication, TypeScript only, no migration, avoids SD-3                                            | Orchestrator |
| Option                | Guard (A), then shared runner (B); per-job injection (C) rejected                                                                    | Spike-verified behaviour-identical; C has B's churn without the deduplication                                        | Research     |
| Guard style           | Explicit per-invariant expects (I1–I15) plus one `toEqual` transcript per job for `sent`; `result` checked on every non-throwing row | Readable failures, strict where it matters; I15 pins the `sent` that the chain budgets from                          | Orchestrator |
| Guard proof           | Phase 1 break matrix (7 invariant classes) and one deliberate break per later phase                                                  | A green, unchanged test must be shown to exercise the changed code (review F2)                                       | Plan review  |
| Fixed seams           | Same job names and signatures, real `sendEmailBatch` as sender, same error object rethrown (`toBe`)                                  | Keeps dry-run (decided in `email.ts`) and alerts (chain) identical by construction                                   | Orchestrator |
| Rollback unit         | One PR per phase from phase 3; `deps.ts` in phase 3; each job phase removes only its own allow-list line                             | Makes phases 4–6 truly independent; `wrangler rollback` then a revert PR; data written by a faulty run is not undone | Plan review  |
| Builders              | Split: phase 7 (7a) appointment, phase 8 (7b) due                                                                                    | Revert 7a before 4 and 7b before 6, not as one block                                                                 | Plan review  |
| Production check      | Manual row per job phase (next 10:00 run, same fields, no `error`), gating the next phase; CPU row in phase 6                        | CI's dry run never reaches mark                                                                                      | Plan review  |
| Client injection      | `client` is a factory called after both gates, inside the `try`                                                                      | Keeps the config-error behaviour, including budget-0 runs (I14)                                                      | Research     |
| Budget gate           | `budget: number \| undefined`; undefined means no gate                                                                               | The appointment job has no budget gate today                                                                         | Plan         |
| `SITE`                | Baseline on today's build in phase 1; whole-output check in phase 4                                                                  | The research only inferred the inlining                                                                              | Orchestrator |
| `MAX_BATCH_SIZE` move | Kept as phase 2, with the honest reason (a later spec split stays mock-free)                                                         | Cheap and harmless; the runner itself doesn't need it                                                                | Plan review  |
| CPU (I12)             | `due.perf.test.ts` as the gate, plus the phase 6 production row                                                                      | The cold Worker can't be measured in CI                                                                              | Orchestrator |
| TD-5 / a fourth job   | Out of scope; one follow-up line                                                                                                     | Would change the chain wiring and the alert vocabulary                                                               | Orchestrator |

## Scope

**In scope:**

- characterization tests of the 3 jobs, with the break matrix;
- the `MAX_BATCH_SIZE` move;
- `runner.ts` and `deps.ts`;
- the 3 jobs on the runner;
- 2 extracted builders with tests;
- the `no-console` allow-list, one line per phase.

**Out of scope:**

- SD-2, SD-3, TD-4, TD-5 and TD-6;
- any SQL or migration;
- changes to the chain, worker, alert, observability, log names and fields, email copy or the CI dry run;
- test-plan Phase 2.

## Architecture / Approach

`worker.ts` → `runReminderChain` → `runAppointmentReminders(run)` / `runDueScreeningReminders(run, {budget})` / `runFollowUpNudges(run, {budget})`.

Each of these becomes `runClaimSendMark(spec, run, budget, reminderDeps())`. The pure runner owns:

- `scheduledAt`, computed outside the `try`;
- inside the `try`: the gates, the lazy client, `select` → `batchKey` → `deps.send`, the dry-run stop, mark, and the log lines;
- the `catch`, which logs `failed` and rethrows the same error.

The spec owns the event name, the key prefix, `select` (the due job's candidates chain lives here), ids, message and the mark RPC.

## Phases at a Glance

| Phase                        | What it delivers                                                    | Key risk                                                            |
| ---------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1. Characterization tests    | The guard on today's code, the break matrix and the `SITE` baseline | A vacuous assertion (mitigated: break matrix)                       |
| 2. `MAX_BATCH_SIZE` move     | A pure constant                                                     | None material                                                       |
| 3. Runner and deps           | `runner.ts`, its tests and `deps.ts`, with no consumer              | Contract drift (mitigated: the phase 4–6 guard and breaks)          |
| 4. Appointment on the runner | First job migrated; `SITE` checked against the baseline             | `SITE` differs from the baseline: the phase stops                   |
| 5. Nudge on the runner       | Second job migrated                                                 | Budget gate and `p_limit` cap regress (guarded)                     |
| 6. Due on the runner         | Third job migrated                                                  | Three `none` exits collapse wrongly (guarded); CPU (production row) |
| 7. Appointment builder (7a)  | A pure builder with copy and privacy tests                          | Copy drift (guarded by the pinned transcript)                       |
| 8. Due builder (7b)          | A pure builder with copy and privacy tests; final production check  | Copy drift (guarded)                                                |

**Prerequisites:** the orchestrator un-parks the implementation after M-02 closes. Local Supabase is needed only for the CI dry run, not for the unit tests.
**Estimated effort:** about 3 sessions of work, plus at least three 10:00 Warsaw runs between the job phases (4 → 5 → 6). Phase 1 is the largest.

## Open Risks & Assumptions

- The characterization mocks replace `createReminderClient` and `fetch`, so the guard proves identical behaviour at those seams, not against a live DB. The CI dry run keeps covering the real wiring, and each job phase gets a production row.
- A Worker rollback restores code, not data: a faulty run's claims and marks stay. The production rows exist to catch such a run on its first day.

## Success Criteria (Summary)

- The phase 1 job tests pass unchanged through phase 8, and every phase's deliberate break fails them.
- The jobs, the runner and both builders are unit-tested, and the runner and builders need no `astro:*` mocks.
- Each job's first production run after its move logs the same line with no new error.
