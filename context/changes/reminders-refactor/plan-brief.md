# Reminder jobs: shared claim → send → mark runner — Plan Brief

> Full plan: `context/changes/reminders-refactor/plan.md`
> Research: `context/changes/reminders-refactor/research.md`

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
- Each job file is a small spec plus wiring, with the same exported names and signatures, so `worker.ts` and `chain.ts` are untouched.
- Both builders are pure modules with copy and privacy tests.
- The phase 1 characterization tests pass, byte-unchanged, after every phase.

## Key Decisions Made

| Decision            | Choice                                                                                     | Why (1 sentence)                                                                   | Source       |
| ------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ------------ |
| Debt item           | F-12 candidate #1: TD-1 + TD-7 + TD-8                                                      | Largest confirmed duplication, TypeScript only, no migration, avoids SD-3          | Orchestrator |
| Option              | Guard (A), then shared runner (B); per-job injection (C) rejected                          | Spike-verified behaviour-identical; C has B's churn without the deduplication      | Research     |
| Guard style         | Explicit per-invariant expects (I1–I14) plus one `toEqual` transcript per job for `sent`   | Readable failures, strict where it matters                                         | Orchestrator |
| Fixed seams         | Same job names and signatures, real `sendEmailBatch` as sender, same error object rethrown | Keeps dry-run (decided in `email.ts`) and alerts (chain) identical by construction | Orchestrator |
| Phase order         | Tests → `MAX_BATCH_SIZE` move → runner → appointment → nudge → due → builders              | Simplest job first; each job migration revertable on its own                       | Plan         |
| Client injection    | `client` is a factory called after the gates                                               | Keeps the config-error behaviour on skipped and daily runs (I14)                   | Research     |
| Budget gate         | `budget: number \| undefined`; undefined means no gate                                     | The appointment job has no budget gate today                                       | Plan         |
| Specs location      | Specs stay in the job files; wiring in a new `deps.ts`                                     | Fewest files; the runner is the pure, mock-free unit                               | Plan         |
| CPU (I12)           | `due.perf.test.ts` as the gate; production CPU is a manual row                             | The cold Worker can't be measured in CI                                            | Orchestrator |
| `SITE`              | Verified in the built Worker in phase 4, not assumed                                       | The research only inferred the inlining                                            | Orchestrator |
| TD-5 / a fourth job | Out of scope; one follow-up line                                                           | Would change the chain wiring and the alert vocabulary                             | Orchestrator |

## Scope

**In scope:**

- characterization tests of the 3 jobs;
- the `MAX_BATCH_SIZE` move;
- `runner.ts` and `deps.ts`;
- the 3 jobs on the runner;
- 2 extracted builders with tests;
- the `no-console` allow-list update.

**Out of scope:**

- SD-2, SD-3, TD-4, TD-5 and TD-6;
- any SQL or migration;
- changes to the chain, worker, alert, observability, log names and fields, email copy or the CI dry run;
- test-plan Phase 2.

## Architecture / Approach

`worker.ts` → `runReminderChain` → `runAppointmentReminders(run)` / `runDueScreeningReminders(run, {budget})` / `runFollowUpNudges(run, {budget})`.

Each of these becomes `runClaimSendMark(spec, run, budget, reminderDeps())`. The pure runner owns:

- the gates;
- the lazy client;
- `select` → `batchKey` → `deps.send`;
- the dry-run stop;
- mark;
- the log lines;
- log-and-rethrow.

The spec owns the event name, the key prefix, `select` (the due job's candidates chain lives here), ids, message and the mark RPC.

## Phases at a Glance

| Phase                        | What it delivers                                                    | Key risk                                                                 |
| ---------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1. Characterization tests    | The guard: 3 job test files on today's code, no source change       | The mock setup diverges from production wiring (mitigated: same exports) |
| 2. `MAX_BATCH_SIZE` move     | A pure constant for pure modules                                    | None material                                                            |
| 3. Pure runner               | `runner.ts` and tests, with no consumer                             | Contract drift from the specs (mitigated: the phase 4–6 guard)           |
| 4. Appointment on the runner | First job migrated, `deps.ts`, `SITE` verified in the build         | `SITE` not inlined; the phase stops                                      |
| 5. Nudge on the runner       | Second job migrated                                                 | Budget gate and `p_limit` cap regress (guarded)                          |
| 6. Due on the runner         | Third job migrated; the job files drop out of the `no-console` list | Three `none` exits collapse wrongly (guarded); CPU                       |
| 7. Builders                  | 2 pure builders with copy and privacy tests                         | Copy drift (guarded by the pinned transcripts)                           |

**Prerequisites:** the orchestrator un-parks the implementation after M-02 closes. Local Supabase is needed only for the CI dry run, not for the unit tests.
**Estimated effort:** about 2–3 sessions. Phase 1 is the largest; phases 2–7 are small.

## Open Risks & Assumptions

- The characterization mocks replace `createReminderClient` and `fetch`, so the guard proves identical behaviour at those seams, not against a live DB. The CI dry run keeps covering the real wiring.
- The runner's CPU cost is unmeasured until the first production run (manual row 7.5).

## Success Criteria (Summary)

- The phase 1 job tests pass unchanged from phase 2 through phase 7.
- The jobs, the runner and both builders are unit-tested, and the runner and builders need no `astro:*` mocks.
- The first production run after deploy logs the same three job lines, with no new error.
