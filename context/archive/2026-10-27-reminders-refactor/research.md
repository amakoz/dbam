---
date: 2026-10-27T20:48:44+01:00
researcher: Claude (Opus 5.5), worker session for reminders-refactor
git_commit: 25f877e
branch: feat/reminders-refactor
repository: amakoz/dbam
topic: "F-13: shared claim → send → mark runner for the three reminder jobs (TD-1 + TD-7 + TD-8), through three lenses, with options ranked and verified by a spike"
tags: [research, reminders, refactor, characterization-tests, vitest, dependency-injection]
status: complete
last_updated: 2026-10-27
last_updated_by: Claude (Opus 5.5), worker session for reminders-refactor
---

# Research: a shared claim → send → mark runner for the reminder jobs

**Date**: 2026-10-27T20:48:44+01:00
**Researcher**: Claude (Opus 5.5), worker session for reminders-refactor
**Git Commit**: 25f877e (worktree clean apart from this change folder)
**Branch**: feat/reminders-refactor
**Repository**: amakoz/dbam

## Research Question

Roadmap M-02 F-13 (PRD MS-05). Take one debt item from F-12 through three read-only lenses:

1. the current shape of the code;
2. the decision history;
3. migration feasibility, including how to keep dry-run and failure-alert behaviour identical.

Then rank 2–3 options and verify the ranking against the code.

The debt item was chosen by the orchestrator (`decisions.md`): F-12 candidate #1, TD-1 + TD-7 + TD-8 (`context/archive/2026-10-27-reminders-research/research.md`, Technical debt). It means extracting the shared claim → send → mark runner with an injected client and sender, so that the three jobs and the two inline email builders become unit-testable.

Out of scope, by the orchestrator's brief:

- any source change;
- implementing the refactor (the plan is the deliverable);
- SD-3;
- any migration.

**Method:**

- I read the three jobs, the chain, the email module, the admin client, the failure alert and the worker myself.
- One sub-agent covered the decision history (the archive, PRs #66/#81/#84/#86, `git log`). I spot-checked its decisive anchors.
- A throwaway spike in the session scratchpad (not in the repo, not committed) answered the feasibility questions by running code against today's modules.

## Summary

- **Recommendation: Option B on top of Option A, guard first.**
  - First pin today's behaviour with characterization tests of the three jobs **as they are**. They run under `vi.mock("astro:env/server")`, a mocked `admin-client` and `vi.stubEnv("SITE")`.
  - Then extract a pure runner, `runClaimSendMark(job, run, budget, deps)`, with three job specs and two extracted builders. Its injected deps are `client()`, `send` and `site`.
  - The spike shows this is behaviour-identical. Over 42 scenarios, the runner produced the same transcript as today's jobs, field for field: result or error, every log line in key order (including `email.ts`'s dry-run line), every RPC call and its arguments, and every Resend request (URL, `Idempotency-Key`, body).
- **F-12 overstated one claim:** "the job runners can't be imported by Vitest as written".
  - **True without mocks.** The spike shows it: an unmocked import fails with `Cannot find package 'astro:env/server'`.
  - **False with the precedent mocks** (`src/lib/email.test.ts:3-8`). All 3 jobs ran in Vitest unchanged.
  - So the guard needs no source change. That is what makes "guard first" possible before any refactor commit.
- **A purity trap the spike caught:** `follow-up-nudge.ts:1` takes `MAX_BATCH_SIZE` as a value from `@/lib/email`, which imports `astro:env/server` (`email.ts:1`).
  - A runner module that copies that import is not mock-free.
  - Fix: move the constant to the pure `email-budget.ts`, the same move S-06 made for `REMINDER_EMAIL_DAILY_BUDGET` (`email-budget.ts:1-2`).
  - With that one change, the spike's job specs ran in Vitest with no `astro:*` mock (purity test passed).
- **Dry-run and failure-alert behaviour stay identical by construction, if three seams are kept fixed:**
  - Jobs keep their exported names and signatures, so `worker.ts:25-30` and `chain.ts` do not change. Alerts, error events, budget arithmetic and the redacted rethrow stay where they are, covered by `chain.test.ts`.
  - The runner keeps today's real `sendEmailBatch` as the injected sender, so the `EMAIL_DRY_RUN` decision stays in `email.ts:79-83`.
  - The runner rethrows the same error object after logging `failed`. Error identity matters to `buildCronErrorEvent` and to the alert.
- **Decision history:**
  - No shared runner was ever proposed or rejected. The duplication was copied on purpose each time: S-06 "mirrors `appointment.ts`" (`2026-10-06-due-screening-reminder/plan.md:306`), and S-07 says "Copy S-04, not S-06" (`2026-10-06-follow-up-nudges/plan.md:44`).
  - Only the nudge builder was extracted, because S-07 was the first change that wanted Vitest over its email copy (`2026-10-06-follow-up-nudges/decisions.md:21`).
  - PRs #66, #81, #84 and #86 have no review comments (sub-agent: `gh pr view --comments` and `pulls/<n>/comments` were empty).
- **Rollback:** the change is TypeScript only. There is no migration and no `wrangler.jsonc` change, so a Worker rollback reverts every phase.

## Detailed Findings

### Lens 1: current shape

**The three runners share one skeleton** (F-12 TD-1, AST Q1; re-read here):

| Step                         | `appointment.ts`                                       | `due-screening.ts`                                                                                                         | `follow-up-nudge.ts`                                            |
| ---------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| send gate                    | `isDailySendRun` `:38-41`                              | `:35-38`                                                                                                                   | `:30-33`                                                        |
| budget gate                  | none                                                   | `budget <= 0` → `reason: "no-budget"` `:39-42`                                                                             | `:34-37`                                                        |
| client                       | `createReminderClient()` `:43`, after the gate         | `:46`                                                                                                                      | `:39`                                                           |
| select                       | claim RPC `:44-51`                                     | candidates RPC `:48-54` → `parseCandidateRows` `:55` → catalog read `:61` → `collectClaimItems` `:62` → claim RPC `:68-75` | claim RPC `:40-48` with `min(budget, MAX_BATCH_SIZE)`           |
| "none"                       | `:53-56`                                               | 3 exits (`:56-59`, `:63-66`, `:76-79`), each logging `candidates`                                                          | `:50-53`                                                        |
| send                         | `sendEmailBatch` plus `batchKey(prefix, ids)` `:58-62` | `:81-85`                                                                                                                   | `:55-60`                                                        |
| dry-run stop (before mark)   | `:63-67`                                               | `:86-90`                                                                                                                   | `:61-65`                                                        |
| mark                         | `:69-72`                                               | `:92-95`                                                                                                                   | `:67-70`                                                        |
| log `sent`                   | `:73`                                                  | `:96-103`                                                                                                                  | `:71`                                                           |
| catch: log `failed`, rethrow | `:75-79`                                               | `:105-109`                                                                                                                 | `:73-77`                                                        |
| builder                      | private `buildMessage` `:82-100`                       | private `buildMessage` `:113-127`                                                                                          | exported `buildNudgeMessage(row, site)` (`nudge-message.ts:22`) |
| log helper                   | `:102-104`                                             | `:129-131`                                                                                                                 | `:80-82`                                                        |

The jobs differ in these ways, and only these, within the inspected bodies:

- the event name and the key prefix;
- whether a budget gate exists;
- the select step: the due job has 4 extra steps and an extra `candidates` field in every log line after the select;
- the ids field (`reminder_ids` vs `nudge_ids`);
- the builder;
- the mark RPC name.

**Coupling to the Astro runtime:**

- `admin-client.ts:2` reads `SUPABASE_URL`/`SUPABASE_SECRET_KEY` from `astro:env/server`.
- `email.ts:1` reads `EMAIL_DRY_RUN`, `EMAIL_FROM` and `RESEND_API_KEY`.
- The three jobs read `import.meta.env.SITE` (`appointment.ts:88`, `due-screening.ts:115`, `follow-up-nudge.ts:56`).
- `chain.ts:4-6`, `nudge-message.ts:4-6`, `errors.ts:1` and `candidates.ts` are already pure by design.

**Consumers of the job functions:**

- `worker.ts:25-30` binds them into `runReminderChain`.
- `chain.ts:13-21` types them as `(run[, {budget}]) => Promise<{ sent: number }>`.
- No other module imports the job files (F-12 Q8).
- Nothing outside the jobs reads `outcome` (F-12 Q10).

**What the spike observed about today's behaviour** (spike transcript, 42 scenarios across the 3 jobs). These are the characterization facts a guard should pin:

- **Skips:**
  - A skipped run (proving cron `*/30 * * * *`, or the 11:00 Warsaw run of the daily cron) makes 0 RPC calls and 0 fetches.
  - A missing secret is never reached on a skipped run (`ReminderConfigError` scenario on the proving cron).
- **Dry run:**
  - The job calls the claim (and, for due, the candidates and the catalog read), then makes 0 fetches and 0 mark calls.
  - It logs `email` `{outcome:"dry-run", idempotencyKey, count}`, then `<job>` `{outcome:"dry-run", due:n, sent:0}`.
- **Sent:** claim → 1 fetch to `/emails/batch` with key `^<prefix>:[0-9a-f]{64}$` → mark with the flattened ids in claim order.
- **Failures** (send 500, missing ids in a 200, claim error, mark error, candidates error, invalid candidates, catalog read error, config error):
  - exactly 1 job log line with `outcome:"failed"`, the error name and the whitelisted details;
  - the original error class is rethrown;
  - no mark call on any send failure.
- **Due job:**
  - The catalog read failure surfaces as `DatabaseError` with `operation:"read-catalog"`, not `ReminderDatabaseError` (`catalog/read.ts:78`).
  - A budget of 1 claims 1 item.
- **Nudge job:** a budget of 250 claims with `p_limit: 100`.
- **Privacy:** no log line in any scenario contained `@` or the catalog slug used as fixture input.

### Lens 2: decision history

Sub-agent report, with decisive anchors spot-checked.

**Why the code is copied:**

- S-04 had no unit runner yet: "the Worker job is thin glue" (`2026-09-30-appointment-reminder/plan.md:445`).
- S-06 "mirrors `appointment.ts`: the same gate, dry-run handling, log style and error rules" (`2026-10-06-due-screening-reminder/plan.md:306`). It left the S-04 email text untouched (`:69`).
- S-07 says "Copy S-04, not S-06" (`2026-10-06-follow-up-nudges/plan.md:44`, checked). It extracted only a pure builder: "the job module stays untested by Vitest like the S-04 job and is checked by the local dry run" (`2026-10-06-follow-up-nudges/decisions.md:21`, checked).
- No archive document or PR comment proposes, rejects or defers a shared runner. The sub-agent searched `context/archive` for "shared runner/job/pipeline/skeleton", "factor out" and "abstraction", plus PR comments on #53, #66, #70, #81, #84 and #86.

**Why there is injection:**

- S-06 plan-review F5 required the budget and failure rules to be unit-tested. So `chain.ts` injects its jobs and imports nothing from `astro:*` (`2026-10-06-due-screening-reminder/decisions.md:58`; `chain.ts:4-6`).
- `REMINDER_EMAIL_DAILY_BUDGET` moved to `email-budget.ts` for the same reason (`decisions.md:76`; `email-budget.ts:1-2`).
- Vitest runs without the Astro integration (`vitest.config.ts:1-9`).
- The `vi.mock("astro:env/server")` precedent was added by S-06 impl-review F5 (`email.test.ts:3-8`).

**Invariants the refactor must keep** (sources are the sub-agent's, then re-observed in code or by the spike where noted):

| #   | Invariant                                                                                                                                                       | Source                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| I1  | Dry run returns before mark and marks nothing                                                                                                                   | `appointment-reminder/plan.md:64`; `appointment.ts:63-67`; spike                                            |
| I2  | Dry run still runs the claim, so ledger rows are inserted unsent                                                                                                | `appointment_reminders.sql:99-109` (F-12 §2); spike (claim called in dry-run scenarios)                     |
| I3  | `EMAIL_DRY_RUN` is decided in `email.ts` only; the jobs only test `"dryRun" in result`                                                                          | `email.ts:79-83`; `appointment.ts:63`                                                                       |
| I4  | `REMINDER_TEST_TO` is for the heartbeat and the alert, never a reminder recipient                                                                               | `failure-alert.ts:20`; `appointment-reminder/plan.md:7`                                                     |
| I5  | One error event and one alert per failed job, each alert with its own key; later jobs get budget 0; the first failure is rethrown redacted                      | `chain.ts:23-69`; `due-screening-reminder/decisions.md:47`                                                  |
| I6  | Jobs log `failed` and rethrow the same error. They emit no `error` event (the chain and `worker.ts` do)                                                         | `appointment.ts:75-79`; `error-tracking/decisions.md:77-88`                                                 |
| I7  | Logs carry counts, error names and whitelisted token details only: never a message, address, subject or slug                                                    | `observability.ts:1-6,20-56`; `lessons.md` "privacy tests are the guard"                                    |
| I8  | `ReminderDatabaseError(step, code)` with step `candidates`/`claim`/`mark`; `mark` drives the alert's duplicate warning                                          | `errors.ts:3-13`; `observability.ts:187` (sub-agent)                                                        |
| I9  | Emails never name an exam                                                                                                                                       | `due-screening.ts:112`; `nudge-message.ts:13`; sub-agent (Art. 9)                                           |
| I10 | Per-job event names and fields "keep their shape"                                                                                                               | `README.md:357` (checked); saved queries filter on `error`/`failure-alert` only (README:368-375, sub-agent) |
| I11 | Job order appointment → due → nudge, so earlier marks commit before the nudge's "emailed today" check                                                           | `follow-up-nudges/plan.md:49` (checked)                                                                     |
| I12 | Cron CPU cap of 10 ms: no zod or `Intl.Collator` on the cron path; `due.perf.test.ts` budgets the sequence                                                      | `due-screening-reminder/decisions.md:89-92`; `candidates.ts:18-19`; `README.md:316`                         |
| I13 | Idempotency key format `<prefix>:<sha256(sorted ids)>` with the 3 existing prefixes                                                                             | `batch-key.ts:1-7`; `due-screening-reminder/decisions.md:77`                                                |
| I14 | `createReminderClient()` is called after the gate, inside the job's `try`, so a missing secret logs `failed` and alerts, and skipped runs never need the secret | `appointment.ts:37-43`; spike (config-error scenarios)                                                      |

**Open items that intersect this refactor.** All must stay out of scope:

- SD-3 (retired entry vs appointment reminders);
- the cross-job overlap follow-up;
- first-time eligibility;
- TD-6 (the batch cap is inconsistent across jobs; changing it changes RPC arguments);
- backlog B-02 and B-12;
- test-plan Phase 2 "Reminder recipient integration", `not started` (`context/foundation/test-plan.md:71`, checked).

Phase 2 is DB-level recipient selection. The characterization harness here is a unit-level transcript, so the two complement each other and do not overlap.

### Lens 3: migration feasibility

**Options considered:**

| Option                                     | What                                                                                                                                                                                                                                                                               | Debt closed                              | Verdict                                                                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **A. Guard in place**                      | Characterization tests over today's jobs via `vi.mock("astro:env/server")`, a mocked `@/lib/reminders/admin-client`, `vi.stubEnv("SITE")` and a stubbed `fetch`; extract `buildAppointmentMessage`/`buildDueScreeningMessage(row, site)` into pure modules like `nudge-message.ts` | TD-7, TD-8 (jobs part)                   | **Feasible, verified.** Necessary as phase 1 of B. Leaves TD-1/TD-2/TD-3                                                |
| **B. Shared runner with injected deps**    | Pure `runClaimSendMark(job, run, budget, deps)` with `deps = { client: () => SupabaseClient, send, site }` and job specs `{ event, keyPrefix, budgetGate, select, ids, message, mark }`. Job modules keep their exports and signatures and bind the real deps                      | TD-1, TD-2, TD-3, TD-7, TD-8 (jobs part) | **Recommended, verified.** Behaviour-identical over 42 scenarios                                                        |
| **C. Per-job injection, no shared runner** | Each job takes a `deps` parameter but keeps its own skeleton                                                                                                                                                                                                                       | TD-7, TD-8                               | **Rejected:** the same call-site churn as B and no deduplication. Dominated by B (inference from the spike's diff size) |

**Ranking:**

1. **A, then B.** A is the guard and B the refactor. A alone is a valid stopping point if the milestone runs out.
2. **A alone.**
3. **C.**

**What the spike was:**

- Scratchpad only: `vitest.config.ts` with `@` aliased to this worktree's `src`.
- `b/runner.ts` (about 75 lines) and `b/jobs.ts` (3 specs and 2 builders).
- `differential.test.ts`: runs each of 42 scenarios against today's job and the B job and asserts `toEqual` on the transcripts.
- `purity.test.ts`: B with no `astro:*` mock.
- Result: `Test Files 2 passed, Tests 44 passed`.
- `tsc` over `b/*.ts` reported 1 error, `Cannot find module 'astro:env/server'` in `src/lib/email.ts`. The worktree has no `.astro/` because `astro sync` was not run. No error was in the spike files.
- Nothing was written to the repo.

**Keeping dry-run behaviour identical:**

- The runner never reads `EMAIL_DRY_RUN`. It receives `send`, bound to the real `sendEmailBatch` in production wiring, and branches only on `"dryRun" in result`, exactly as today (I1–I3).
- Transcript equality covered the `email` dry-run log line and the absence of mark and fetch.
- `"dry-run"` stays in each job's log line with today's fields: `candidates` (due only), then `due`, then `sent:0`.
- The spike placed the job's extra `fields` between `scheduledAt` and `due` to keep key order. The plan should keep that, because I10 promises shape. JSON key order is not semantically meaningful, but transcript equality is a cheap strict gate.

**Keeping failure-alert behaviour identical:**

- `chain.ts`, `worker.ts`, `failure-alert.ts` and `observability.ts` stay unchanged, so I5 is untouched and `chain.test.ts` keeps guarding it.
- Inside the job, the runner's catch logs `{event, outcome:"failed", cron, scheduledAt, error: errorName(e), ...errorDetails(e)}` and rethrows the same error object (I6).
- The spike matched name, step, code, status and resendError on 5 failure kinds per job (claim, send 500, missing ids, mark, config), 8 for the due job (plus candidates error, invalid candidates, catalog read).

**Constraints the plan must carry:**

1. Move `MAX_BATCH_SIZE` to `email-budget.ts` and re-export it from `email.ts`, as is already done for the budget (`email.ts:4`). Otherwise the runner and spec modules are not mock-free (spike failure above).
2. Keep `client` a factory called after the gates (I14). An eager client would change the config-error behaviour on skipped runs.
3. Wiring location: keep `runAppointmentReminders(run)`, `runDueScreeningReminders(run, {budget})` and `runFollowUpNudges(run, {budget})` exported from today's files, binding real deps there. Then `worker.ts`, `chain.ts` and the `no-restricted-imports` boundary (`eslint.config.js:91-112`) do not change.
4. `eslint.config.js:77-88` lists the job files for `no-console: off`. A runner module that logs must be added there, or it must receive the logger.
5. `import.meta.env.SITE` would be read at wiring time instead of at message-build time. Inference, not run: Astro substitutes `SITE` statically, from `astro.config.mjs:13`, so the value is the same. The plan should confirm it with a `npm run build` grep, or keep `site` read lazily.
6. Characterization tests must feed leaky input (an address in an error message, a slug in a row) and assert absence in every log and email output. That follows lessons.md "privacy tests are the guard" (I7, I9).
7. Keep `due.perf.test.ts` green. The runner adds one generic call layer to the cron path. Not measured: the spike did not time it (I12).
8. Do not touch TD-6, TD-4 or TD-5 in the same phases. Each would change RPC arguments or wiring and break transcript equality.

**Phases a plan can build on** (sketch; each phase is independently revertable, TypeScript only):

1. **Guard:** add characterization tests of today's three jobs (Option A harness) with no source change, so they are green on today's code by construction. Keep the transcript recorder as a test helper.
2. **Extract builders:** move the two `buildMessage` functions to pure modules taking `(row, site)`, with unit tests including the no-exam-name rule. The guard from phase 1 stays green unchanged.
3. **Pure constant:** move `MAX_BATCH_SIZE` into `email-budget.ts`.
4. **Runner:** add `runner.ts` and rewrite the three jobs as specs plus wiring. The phase 1 tests stay green unchanged, and new runner tests run without mocks.

A failure at any phase reverts that phase's commit only.

## Code References

- `src/lib/reminders/appointment.ts:29-104`: job, inline builder, log helper
- `src/lib/reminders/due-screening.ts:29-131`: job with the candidates and catalog steps, inline builder
- `src/lib/reminders/follow-up-nudge.ts:24-82`: job; `:1` value import of `MAX_BATCH_SIZE` from `email.ts`
- `src/lib/reminders/nudge-message.ts:4-38`: the extracted, pure builder pattern to copy
- `src/lib/reminders/chain.ts:4-21`: the injection pattern and job signatures that must not change
- `src/lib/reminders/admin-client.ts:16-24`: client factory and `ReminderConfigError`
- `src/lib/email.ts:1,17,69-105`: `astro:env` import, `MAX_BATCH_SIZE`, `sendEmailBatch` with the dry-run branch
- `src/lib/email-budget.ts:1-9`: the pure-constant precedent
- `src/lib/email.test.ts:3-8`: the `vi.mock("astro:env/server")` precedent
- `src/worker.ts:21-45`: the wiring that should stay unchanged
- `src/lib/observability.ts:20-56`: `errorName` and `errorDetails`, the token rule
- `eslint.config.js:77-88`: the `no-console` allow-list naming the job files
- `vitest.config.ts:1-9`: Vitest without the Astro integration

## Architecture Insights

- The repo's testability pattern is "pure module + thin wiring": `chain.ts`, `nudge-message.ts`, `candidates.ts`, `email-budget.ts` and `observability.ts`. Option B extends the same pattern to the one remaining untested layer. It invents nothing new.
- The runner's natural seam is the select step. The due job's extra logic (candidates → parse → catalog → decide → claim) fits inside `select` returning `{ rows, fields: { candidates } }`, and all three of its "none" exits collapse into the runner's single empty-rows exit with the same log line (spike: "0 candidates", "nothing due yet", "none: empty claim").
- Behavioural equivalence is checkable mechanically. A transcript (result or error, logs, RPC calls, fetches) recorded from a fake client and a stubbed `fetch` is a stronger gate than per-assertion tests, and it costs one helper.

## Historical Context (from prior changes)

- `context/archive/2026-09-30-appointment-reminder/plan.md:445`: "thin glue", no unit runner in S-04.
- `context/archive/2026-10-06-due-screening-reminder/plan.md:306`, `decisions.md:58,76-77,89-92`: the due job mirrors S-04; chain injection; the budget moved to a pure module; batch-key extraction; CPU budget.
- `context/archive/2026-10-06-follow-up-nudges/plan.md:44,49`, `decisions.md:21`: copy S-04; job order; the pure builder as the only tested part.
- `context/archive/2026-10-27-reminders-research/research.md`: TD-1/2/3/7/8 confirmed by AST.

  F-12's sentence "The job runners can't be imported by Vitest as written" is **partial**. It holds without mocks. It is contradicted with `vi.mock("astro:env/server")` plus a mocked admin client (spike). Its other coverage facts (Q7: no test imports the 3 job modules) are **supported**.

## Related Research

- `context/archive/2026-10-27-reminders-research/research.md` (F-12, the parent of this item)
- `context/map/repo-map.md`, risk zone #1

## Open Questions

- **Plan decision: transcript gate vs per-behaviour assertions.** Should phase 1 store transcripts as Vitest inline snapshots (strict, noisier diffs) or as explicit `expect`s per invariant (I1–I14)? Recommendation: explicit assertions for invariants plus one `toEqual` transcript per job for the 3 `sent` scenarios.
- **Not measured:** the CPU cost of the runner layer on a cold Worker (I12). Covered only by keeping `due.perf.test.ts` green and by the open S-06 production CPU check (`due-screening-reminder/decisions.md:82`).
- **Inference, not verified:** that `import.meta.env.SITE` is inlined at build, so reading it at wiring time is equivalent (constraint 5).
- **Not inspected:** whether a future fourth job fits the `select` contract. TD-5, the hard-wired chain, stays out of scope.
