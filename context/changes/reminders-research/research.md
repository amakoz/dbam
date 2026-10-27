---
date: 2026-10-27T20:34:17+01:00
researcher: Claude (Opus 5.5), worker session for reminders-research
git_commit: 8529cc8
branch: feat/reminders-research
repository: amakoz/dbam
topic: "Reminder pipeline end to end: trace, test-coverage gaps, blast radius and AST-verified technical debt (F-12, MS-04)"
tags: [research, reminders, cron, supabase, pgtap, technical-debt, ast]
status: complete
last_updated: 2026-10-27
last_updated_by: Claude (Opus 5.5), worker session for reminders-research
---

# Research: the reminder pipeline end to end

**Date**: 2026-10-27T20:34:17+01:00
**Researcher**: Claude (Opus 5.5), worker session for reminders-research
**Git Commit**: 8529cc8 (worktree clean when the research started)
**Branch**: feat/reminders-research
**Repository**: amakoz/dbam

## Research Question

Roadmap M-02 F-12 (PRD MS-04): trace the reminder pipeline end to end, across appointment reminders, due-screening reminders and follow-up nudges: scheduled run → candidate selection → send chain → email. Use the map (`context/map/repo-map.md` + `context/map/evidence/`) as input. Report test-coverage gaps, blast radius and a technical-debt section in which each structural claim is confirmed or refuted by an AST query (or, for SQL, a read-only catalog query against local Supabase). This change is research only and fixes nothing it finds.

Scope was set by the map's unknowns that feed F-12 (`context/map/repo-map.md`, Limitations → Unknowns #2 and #3):

- the reminder SQL contracts vs profiles, consents, plans and completions;
- whether withdrawal clears the reminder tables (test-plan risk #5);
- the claim that coverage is limited to pgTAP.

The orchestrator decided the feature choice: the reminder pipeline is risk zone #1 in the map (`decisions.md`).

**Evidence files** (all in this change folder):

| Kind | Query file                                                                                                            | Raw output                   | Run against                                                                         |
| ---- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------- |
| AST  | `queries/ast-queries.mjs.txt` (TypeScript 6.0.3 compiler API from `node_modules`, run with `node` from the repo root) | `queries/ast-output.txt`     | HEAD 8529cc8                                                                        |
| SQL  | `queries/catalog-queries.sql`, read-only (`begin transaction read only … rollback`), run under the shared DB lock     | `queries/catalog-output.txt` | local Supabase on 127.0.0.1:54322, last migration `20261006204148_follow_up_nudges` |

Query IDs below (`Q1`–`Q10` for AST, `S1`–`S13` for SQL) refer to the `## Qn` / `## Sn` headers in those outputs.

## Summary

- **The pipeline is one daily run.** It has three sequential jobs on a shared email budget.
  - The cron is `0 8,9 * * *` (`wrangler.jsonc:15-17`). `isDailySendRun` lets only the 10:00 Warsaw run through (`src/lib/schedule.ts:13-15`).
  - `scheduled()` runs the heartbeat and `runReminderChain` concurrently (`src/worker.ts:23-31`).
  - The chain runs appointment → due-screening → nudge. Each job's `sent` is subtracted from the 92-email budget (`src/lib/reminders/chain.ts:36-56`, `src/lib/email-budget.ts:9`).
- **Each job follows the same skeleton:** gate → claim RPC → one Resend batch with an idempotency key → mark RPC.
  - Only the due job adds a candidates RPC and a decision step in TypeScript (`src/lib/reminders/due-screening.ts:48-66`).
  - Recipient selection and dedupe live entirely in 7 SECURITY DEFINER plpgsql functions callable only by `service_role` (S1).
- **Risk #5 (withdrawal):** on the inspected live schema, withdrawal clears all three reminder ledgers. It does so only through FK cascades: the function deletes none of them by name (S5, S6, S11).
  - All 4 selecting functions also re-check active consent themselves (S4, S12).
  - Gap: no pgTAP test asserts that `due_screening_reminders` is empty after `withdraw_health_data_consent()` (grep over `supabase/tests/database/`, see Coverage).
- **Coverage is not limited to pgTAP, but the jobs themselves are untested** (Q7). There are unit tests for:
  - the chain (`chain.test.ts`);
  - candidate parsing and selection (`candidates.test.ts`);
  - the nudge message (`nudge-message.test.ts`);
  - the email retry, the batch send and the observability modules.

  No unit test imports `appointment.ts`, `due-screening.ts`, `follow-up-nudge.ts`, `worker.ts`, `schedule.ts`, `heartbeat.ts`, `failure-alert.ts` or `admin-client.ts`. CI's dry run of the scheduled handler checks only `"outcome":"ok"` (`.github/workflows/ci.yml:72-87`). No dry run ever calls a mark RPC (each job returns before mark on `dryRun`, e.g. `appointment.ts:63-67`).

- **Technical debt: 17 claims checked, 15 confirmed, 2 refuted** (table in Technical debt).
  - Strongest: the same claim → send → mark skeleton is hand-copied into all 3 job runners (Q1). It sits next to 2 of 3 email builders inlined and untested (Q2, Q7).
  - On the SQL side: the consent and opt-in predicates are copied 8 times each across 4 functions (S12), and Postgres records **0** dependencies from any reminder function to the tables it reads (S2).
  - Refuted: the map's caution that the generated types may be stale does not hold for the RPC names (Q9). The map's reminders boundary claim holds (Q8).

## Detailed Findings

### 1. Trigger and dispatcher

- **Cron and send gate:**
  - `wrangler.jsonc:15-17` declares `"crons": ["0 8,9 * * *"]`.
  - `DAILY_CRON` repeats that string (`src/lib/schedule.ts:8`).
  - `isDailySendRun(cron, scheduledTime)` is true only when `cron === DAILY_CRON` and the Warsaw hour is 10 (`schedule.ts:13-15`), so exactly one of the two UTC runs sends in both CET and CEST.
  - `warsawHour` throws if the hour is NaN (`schedule.ts:25-27`).
  - `PROVING_CRON = "*/30 * * * *"` (`schedule.ts:6`) is not in wrangler today. Only the heartbeat reacts to it (`src/lib/heartbeat.ts:58-67`).
- **`scheduled()`** (`src/worker.ts:21-45`) runs `Promise.allSettled([runHeartbeat(run), runReminderChain(run, {appointment, due, nudge, alert})])`.
  - It logs a heartbeat failure itself (`:33-39`). The chain logs its own failures.
  - It rethrows one redacted error, preferring the heartbeat's (`:40-44`).
- **`runReminderChain`** (`src/lib/reminders/chain.ts:30-70`):
  - It awaits the three jobs in order, each in its own `try`.
  - `dueBudget = max(0, 92 − appointment.sent)` (`:39`), and `nudgeBudget = max(0, dueBudget − due.sent)` (`:47`).
  - When a job throws, every later job keeps its initial budget of 0 (`:36`, `:44`). They then log `skipped`/`no-budget`, so one failure stops all later sending for that day.
  - Afterwards it logs one cron error event and awaits one alert per failure, in order (`:58-65`), then rethrows `redactError(failures[0].error)` (`:66-69`).

### 2. The three jobs (TypeScript)

| Step       | Appointment (`appointment.ts:29-80`)                                                        | Due screening (`due-screening.ts:29-110`)                                                                                                                                                                                                                                                      | Nudge (`follow-up-nudge.ts:24-78`)                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Gate       | `isDailySendRun` (`:38`); **no budget gate**                                                | `isDailySendRun` (`:35`) + `budget <= 0` (`:39`)                                                                                                                                                                                                                                               | `isDailySendRun` (`:30`) + `budget <= 0` (`:34`)                                                                       |
| Candidates | —                                                                                           | RPC `get_due_screening_candidates {p_today, p_limit: DUE_CANDIDATE_LIMIT=50}` (`:48-51`), `parseCandidateRows` (`candidates.ts:56-61`), `getActiveRuleCatalog` (direct `.from("screening_catalog")`, `src/lib/catalog/read.ts:76-80`), `collectClaimItems(…, budget)` (`candidates.ts:77-114`) | —                                                                                                                      |
| Claim      | RPC `claim_due_appointment_reminders {p_today, p_lead_days: 3, p_limit: 92}` (`:44-48`)     | RPC `claim_due_screening_reminders {p_today, p_items}` (`:68-72`)                                                                                                                                                                                                                              | RPC `claim_follow_up_nudges {p_today, p_schedule_after: 14, p_confirm_after: 7, p_limit: min(budget, 100)}` (`:40-45`) |
| Send       | `sendEmailBatch` with key `batchKey("dbam-appointment-reminder", ids)` (`:58-62`)           | same, prefix `dbam-due-screening-reminder` (`:81-85`)                                                                                                                                                                                                                                          | same, prefix `dbam-follow-up-nudge` (`:55-60`)                                                                         |
| Dry run    | return before mark (`:63-67`)                                                               | (`:86-90`)                                                                                                                                                                                                                                                                                     | (`:61-65`)                                                                                                             |
| Mark       | RPC `mark_appointment_reminders_sent {p_ids}` (`:69`)                                       | RPC `mark_due_screening_reminders_sent` (`:92`)                                                                                                                                                                                                                                                | RPC `mark_follow_up_nudges_sent` (`:67`)                                                                               |
| Failure    | `catch` logs `failed` with the error name and whitelisted details, then rethrows (`:75-79`) | (`:105-109`)                                                                                                                                                                                                                                                                                   | (`:73-77`)                                                                                                             |
| Message    | private `buildMessage` (`:82-100`)                                                          | private `buildMessage` (`:113-127`)                                                                                                                                                                                                                                                            | exported `buildNudgeMessage` (`nudge-message.ts:22-38`)                                                                |

- **Send path** (`src/lib/email.ts`):
  - `sendEmailBatch` rejects batches outside 1–100 messages with a `RangeError` (`:76-77`).
  - It returns `{dryRun: true}` when `EMAIL_DRY_RUN` is set (`:79-83`), and posts to Resend with an `Idempotency-Key` and a 10 s timeout (`:122-134`).
  - `withRateLimitRetry` retries a 429 exactly once (`src/lib/email-retry.ts:21-32`). Every other non-2xx throws `EmailSendError` without retry (`email.ts:136-141`).
- **No release step exists.** A failed send or mark leaves the claimed rows unmarked, and the next claim returns them again. This holds because each claim's return step selects `sent_at is null` rows (`supabase/migrations/20260930125726_appointment_reminders.sql:123`).
- **A dry run still runs the claim, and the claim inserts ledger rows** (`appointment_reminders.sql:99-109`). Those rows stay unsent, so the comment "never consume reminders" (`appointment.ts:64`) holds. "Marks nothing" does not mean "writes nothing".

### 3. The SQL side

**Functions** (S1):

- All 7 pipeline RPCs are `plpgsql`, `SECURITY DEFINER`, `search_path=""`, with EXECUTE granted to `service_role` only. These are the 3 claim functions, `get_due_screening_candidates` and the 3 `mark_*` functions.
- `screening_anchor_month` is executable by `postgres` only.

**Ledgers and dedupe keys** (S9):

| Ledger                    | Unique key                              |
| ------------------------- | --------------------------------------- |
| `appointment_reminders`   | `(plan_id, appointment_date)`           |
| `due_screening_reminders` | `(user_id, catalog_slug, anchor_month)` |
| `follow_up_nudges`        | `(plan_id, kind, cycle_on)`             |

- "Claim" means: insert missing rows with `on conflict do nothing`, then return the unsent rows that are still valid.
- There is no lease column, and no function uses `for update skip locked` (S4 `skip_locked = f` for all 9 rows).

**What each function reads** (S3, from live `prosrc`):

| Function                                                           | Tables named in its body                                                                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `claim_due_appointment_reminders`                                  | appointment_reminders, health_data_consents, profiles, screening_plans                                                   |
| `get_due_screening_candidates` and `claim_due_screening_reminders` | due_screening_reminders, health_data_consents, profiles, screening_catalog, screening_completions, screening_plans       |
| `claim_follow_up_nudges`                                           | the above minus completions, plus both other ledgers (the "already emailed today" check, `follow_up_nudges.sql:136-145`) |

All of these also read `auth.users` (S4).

**Recipient predicates, counted per live function** (S12):

| Function                          | consent | opt-in | email | active entry |
| --------------------------------- | ------- | ------ | ----- | ------------ |
| `claim_due_appointment_reminders` | 2       | 2      | 1     | **0**        |
| `claim_due_screening_reminders`   | 2       | 2      | 2     | 2            |
| `claim_follow_up_nudges`          | 3       | 3      | 1     | 3            |
| `get_due_screening_candidates`    | 1       | 1      | 1     | 1            |
| **total**                         | **8**   | **8**  | **5** | **6**        |

- The appointment claim names no catalog table at all (S3), so a plan whose catalog entry is retired still gets an appointment reminder. The nudge claim excludes such a plan (`follow_up_nudges.sql:82`).
- The appointment and nudge insert steps skip the email check (`appointment_reminders.sql:99-109`). Their return steps apply it.

**Column contract:** a rename or drop of any of these breaks a function at run time, and no migration or catalog check notices it (S2: 0 `pg_depend` rows).

- **profiles:**
  - `user_id`, `reminders_enabled`, `reminders_locale`: all 3 claim functions.
  - `birth_year`, `sex`, `smoking_status`, `pack_years`, `years_since_quitting`: `get_due_screening_candidates` only (`20261006155313_due_screening_reminders.sql:110-115`).
- **health_data_consents:** `user_id`, `withdrawn_at`.
- **screening_plans:**
  - `id`, `user_id`, `catalog_slug`, `appointment_date`.
  - **`updated_at`**, as the anchor of the "schedule" nudge (`follow_up_nudges.sql:79`, `:84`).
- **screening_completions:** `user_id`, `catalog_slug`, `last_done_month`, `updated_at`.
- **screening_catalog:** `slug`, `status`, `interval_kind`, `interval_months`, `interval_overrides` (`due_screening_reminders.sql:124`, `:143-149`).
- **auth.users:** `id`, `email`.

**Grants** (S7):

- `service_role` holds table privileges on exactly one public table: `SELECT` on `screening_catalog`.
- This is the second access path of the pipeline, a direct table read by the due job (`catalog/read.ts:77`) next to the definer RPCs.

### 4. Withdrawal and test-plan risk #5

- **The live `withdraw_health_data_consent()`** (S11; last defined at `supabase/migrations/20260930093108_screening_records.sql:194-213`) does four things:
  - deletes `screening_plans`;
  - deletes `screening_completions`;
  - deletes `profiles`;
  - stamps `health_data_consents.withdrawn_at`.
- **Per-user tables** (S5): 7 public tables carry `user_id`. The withdraw body names 4 of them and none of the 3 ledgers.
- **How the ledgers are cleared** (S6):

  | Ledger                    | Cascade path                                                              |
  | ------------------------- | ------------------------------------------------------------------------- |
  | `appointment_reminders`   | `plan_id` → screening_plans, cascade                                      |
  | `follow_up_nudges`        | `plan_id` → screening_plans, cascade                                      |
  | `due_screening_reminders` | composite → screening_completions, cascade (it has no FK to `auth.users`) |

  All three are therefore cleared, and only through cascades.

- **Second guard:** every selecting function re-checks active consent in both its insert and return steps (S12; anchors in section 3). The deleted profile also removes `reminders_enabled`.
- **Verdict:** protected today, structurally fragile.
  - A future per-user table keyed only on `user_id → auth.users` would survive withdrawal, because withdrawal does not delete the `auth.users` row.
  - No test enumerates all per-user tables after one withdrawal.
- **Residual from the archive:** a profile or plan save that races the withdrawal can land afterwards (`context/archive/2026-09-27-onboarding-profile/follow-ups/review-fixes.md:10`). This was accepted because the cron re-checks consent (`context/archive/2026-09-30-appointment-reminder/plan.md:49`).

### 5. Test coverage

**Unit tests (Vitest, Q7):**

| Module                                                                                                                                                     | Coverage                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `chain.ts`                                                                                                                                                 | covered (`chain.test.ts`, budget arithmetic, order, failures, redaction)                       |
| `candidates.ts`                                                                                                                                            | covered (`candidates.test.ts`; also timed by `src/lib/screenings/due.perf.test.ts:8`)          |
| `nudge-message.ts`                                                                                                                                         | covered (`nudge-message.test.ts`, incl. "names no exam")                                       |
| `email.ts`                                                                                                                                                 | partial: the 429 and 500 paths only, mocked with `EMAIL_DRY_RUN: false` (`email.test.ts:4-10`) |
| `email-retry.ts`, `observability.ts`                                                                                                                       | covered                                                                                        |
| `batch-key.ts`                                                                                                                                             | imported only by the perf test, which checks timing, not the key                               |
| `worker.ts`, `appointment.ts`, `due-screening.ts`, `follow-up-nudge.ts`, `admin-client.ts`, `errors.ts`, `schedule.ts`, `heartbeat.ts`, `failure-alert.ts` | **no test imports them**                                                                       |

Consequences:

- The CET/CEST gate in `isDailySendRun`, both inline `buildMessage` bodies (including the "never name an exam" rule) and the claim → send → mark order have no unit test.
- The job runners can't be imported by Vitest as written, because each pulls in `astro:env` through `admin-client.ts` and `email.ts` (the agent trace; `chain.ts:4-6` states the same reason for injecting the jobs).

**CI dry run** (`.github/workflows/ci.yml:72-87`):

- It curls `/cdn-cgi/local/scheduled` for each cron with time `1790841600000` (10:00 Warsaw) and greps `"outcome":"ok"`.
- That proves only that nothing threw.
- No mark RPC runs, because every job returns on `dryRun` before mark.
- Inference, not run: `supabase/config.toml:65` points at `./seed.sql`, and that file does not exist (`ls supabase/`). With an empty local DB, the due job stops at "0 candidates" (`due-screening.ts:56-59`), so `claim_due_screening_reminders` and `getActiveRuleCatalog` are not reached in that step.

**pgTAP, by recipient rule** (from the SQL trace; anchors in `supabase/tests/database/`). Opt-out, double claim, mark idempotency, grants and cascades on direct delete are covered for all three ledgers. These are not:

| Gap                                                                                                                                                                                                                  | Risk   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Withdrawal through `withdraw_health_data_consent()` then `due_screening_reminders` empty. The only withdrawal ledger assertions are `appointment_reminders.test.sql:398-404` and `follow_up_nudges.test.sql:437-442` | #5     |
| One withdrawal followed by a check of every per-user table                                                                                                                                                           | #5     |
| `claim_due_screening_reminders` insert step with withdrawn consent (the return step is covered)                                                                                                                      | #3, #5 |
| Appointment claim with a user without email; "no profile" for due and nudge                                                                                                                                          | #3     |
| A whole-run empty case ("an empty run sends nothing and reports it"): only per-user zero rows are asserted, and the due claim _rejects_ `[]`                                                                         | #3     |
| Appointment reminder for a plan whose catalog entry is retired: no test pins the current (unguarded) behaviour                                                                                                       | #3     |

**Not covered by any layer:** the TypeScript job code against a real local DB. Test-plan Phase 2 ("Reminder recipient integration", `context/foundation/test-plan.md:71`) is `not started`.

### 6. Blast radius

**Importers of the pipeline** (Q8):

- Outside `src/lib/reminders/`, the only importers are `src/worker.ts:5-8` and one test (`src/lib/screenings/due.perf.test.ts:7-8`).
- No `.astro` file mentions `lib/reminders`.
- The ESLint rule bans the import from pages, components, layouts and middleware only (`eslint.config.js:91-112`), not from other `src/lib` modules.

**Changes elsewhere that break the pipeline:**

| Change                                                                                                                                      | What breaks                                                                                           | Caught by                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rename or drop a column listed in §3 (profiles, consents, plans, completions, catalog, auth.users)                                          | a claim or candidates RPC at the next 10:00 run                                                       | pgTAP only. Postgres records no dependency (S2), and TypeScript sees only RPC signatures                                                          |
| Any write that bumps `screening_plans.updated_at` (the `set_updated_at` trigger fires on every update, S10)                                 | resets the 14-day "schedule" nudge clock for that plan                                                | nothing; it is the designed anchor (`follow_up_nudges.sql:182-185`), but any future plan column inherits it                                       |
| Change the shape of `get_due_screening_candidates`' result                                                                                  | `parseCandidateRows` throws `ReminderDatabaseError("candidates","invalid")` and the run fails         | `candidates.test.ts` covers the parser, not the SQL shape. The generated type cannot describe it (Q9: `completions: Json`, non-null `pack_years`) |
| Edit `wrangler.jsonc` crons without `DAILY_CRON`                                                                                            | every job logs `skipped`, and only the heartbeat throws `UnknownCronError`                            | CI dry run (all `ok`, so not caught)                                                                                                              |
| Raise `REMINDER_EMAIL_DAILY_BUDGET` above 100                                                                                               | the appointment claim raises `22023`, since `p_limit` must be 1..100 (`appointment_reminders.sql:95`) | nothing ties the two (Q6). `chain.test.ts:41` pins `92`                                                                                           |
| `src/lib/screenings/{rules,due,format}.ts`, `src/lib/catalog/{read,schema}.ts`, the i18n keys `email.*Reminder.*` / `email.followUpNudge.*` | job output or rules                                                                                   | `rules.test.ts`, `due.test.ts` and `nudge-message.test.ts` cover parts. The appointment and due email text are untested                           |
| `ReminderJob` / `JOB_LABEL` (`src/lib/observability.ts:27-33`)                                                                              | alert label and key. The per-job log event names do not follow (Q4)                                   | type check for chain only                                                                                                                         |

**Outward reach of a pipeline fault:**

- real emails to users through Resend: a wrong or duplicate send;
- the owner alert (`src/lib/failure-alert.ts`);
- the shared daily budget: a failure in one job zeroes the others.

## Technical debt (structural claims, verified)

Each claim names its query. "Confirmed" means the query output shows the structure; "refuted" means it shows the opposite. Impact is stated only where code or tests support it.

| ID    | Claim                                                                                                        | Query                     | Verdict                                      | Evidence (raw output)                                                                                                                                                                                                                                                                                                                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------------ | ------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TD-1  | The three job runners each hand-implement the same pipeline skeleton instead of sharing one                  | Q1                        | **confirmed**                                | The longest common ordered step sequence of `runAppointmentReminders`, `runDueScreeningReminders` and `runFollowUpNudges` is the full skeleton `gate > log > client > rpc:claim > log > send > key > log > rpc:mark > log`. All 3 wrap the whole body in one `try` whose `catch` logs and rethrows the caught error. The due job inserts 4 extra steps (`rpc:get > parse > catalog > decide`) |
| TD-2  | The per-job `log` helper is copy-pasted                                                                      | Q2                        | **confirmed**                                | 3 private `log` declarations (`appointment.ts:102`, `due-screening.ts:129`, `follow-up-nudge.ts:80`), 1 distinct body after masking string literals                                                                                                                                                                                                                                           |
| TD-3  | The per-job outcome types are the same type three times, and nothing outside the job modules reads `outcome` | Q3, Q10                   | **confirmed**                                | `AppointmentReminderOutcome`, `DueScreeningOutcome` and `FollowUpNudgeOutcome` are all `"dry-run" \| "none" \| "sent" \| "skipped"`. The only non-job reads of a job result are `.sent` at `chain.ts:38` and `:46`                                                                                                                                                                            |
| TD-4  | The job-name vocabulary is not type-linked: a rename of `ReminderJob` would not reach the log event names    | Q4                        | **confirmed**                                | The 3 literals in `chain.ts:41/49/55` are contextually typed `ReminderJob`. The log event literals at `appointment.ts:103`, `due-screening.ts:130` and `follow-up-nudge.ts:81` have contextual type `none`, and the `JOB_LABEL` keys are `string`                                                                                                                                             |
| TD-5  | The chain is hard-wired to exactly three jobs; there is no job list                                          | Q5                        | **confirmed**                                | `ReminderChainDeps` = `appointment, due, nudge, alert`. `runReminderChain` has 4 `try` statements (3 jobs + 1 in the failure loop) and its only loop iterates over `failures`. Adding a job edits `chain.ts`, `worker.ts:25` and `observability.ts:27-33`                                                                                                                                     |
| TD-6  | The batch-size cap (`MAX_BATCH_SIZE = 100`) is applied inconsistently across jobs                            | Q6                        | **confirmed**                                | Only the nudge claim caps with `Math.min(budget, MAX_BATCH_SIZE)` (`follow-up-nudge.ts:44`). The appointment claim passes `REMINDER_EMAIL_DAILY_BUDGET` raw (`appointment.ts:47`), and the due job relies on `DUE_CANDIDATE_LIMIT` and `budget` (`due-screening.ts:50`, `:62`). It is safe today only because 92 ≤ 100. No test ties the two constants                                        |
| TD-7  | Two of three email builders are inline and untestable; the third was extracted and is tested                 | Q2, Q7                    | **confirmed**                                | `buildMessage` is non-exported in `appointment.ts:82` and `due-screening.ts:113` (2 distinct bodies), and no test imports either module. `buildNudgeMessage` is exported (`nudge-message.ts:22`) and imported by `nudge-message.test.ts:4`. Under lessons.md "privacy tests are the guard", the "never name an exam" rule is guarded for 1 of 3 emails                                        |
| TD-8  | The job orchestrators, the send gate, the heartbeat and the failure alert have no unit tests                 | Q7                        | **confirmed**                                | 9 pipeline modules show `NO TEST IMPORTS IT`: worker, admin-client, errors, appointment, due-screening, follow-up-nudge, schedule, heartbeat, failure-alert                                                                                                                                                                                                                                   |
| TD-9  | Map claim: only `src/worker.ts` imports `src/lib/reminders` (the boundary holds)                             | Q8                        | **refuted as a debt** (the boundary holds)   | Non-test importers: `worker.ts:5-8` only. One test, `due.perf.test.ts:7-8`. 0 `.astro` mentions                                                                                                                                                                                                                                                                                               |
| TD-10 | Map limitation: `database.types.ts` may be stale relative to the reminder RPCs                               | Q9                        | **refuted for RPC names**                    | All 9 `.rpc("…")` names in `src` are declared in `Database["public"]["Functions"]`. Column staleness was not checked: `npm run db:types` was not run                                                                                                                                                                                                                                          |
| TD-11 | The candidates contract is hand-kept, because the generated type cannot express it                           | Q9 + `candidates.ts:8-16` | **confirmed**                                | Generated `Returns` has `completions: Json`, `pack_years: number` (non-null), `sex: string`. The hand-written `CandidateRow` has `pack_years: number \| null`, literal unions and typed completions, and the guard is `parseCandidateRows`                                                                                                                                                    |
| SD-1  | The reminder functions' table dependencies are invisible to Postgres itself, not only to imports and lint    | S1, S2                    | **confirmed**                                | 11 functions, all `plpgsql`/`sql` with `sql_standard_body = f`. `pg_depend` rows from them to any relation: **0**. A migration that renames a column they use succeeds, and the failure shows only at run time or in pgTAP                                                                                                                                                                    |
| SD-2  | The recipient predicates are re-implemented in each function                                                 | S12                       | **confirmed**                                | In the live bodies: consent `withdrawn_at is null` ×8, opt-in `reminders_enabled` ×8, `email is not null` ×5, active entry ×6, across 4 functions (2+2+3+1 consent, 2+2+3+1 opt-in)                                                                                                                                                                                                           |
| SD-3  | The copies have already drifted: the appointment claim lacks the active-entry check the other jobs apply     | S3, S12                   | **confirmed**                                | `claim_due_appointment_reminders`: active-entry checks 0, catalog refs 0. Nudge claim: 3 / 3                                                                                                                                                                                                                                                                                                  |
| SD-4  | The three `mark_*` functions are one function written three times                                            | S13                       | **confirmed**                                | Identical md5 `091b18fc…` of each body with the table name masked                                                                                                                                                                                                                                                                                                                             |
| SD-5  | Withdrawal does not name the reminder ledgers; protection rests on FK cascades                               | S5, S6, S11               | **confirmed**                                | `named_by_withdraw = f` for all 3 ledgers. Cascade paths in §4                                                                                                                                                                                                                                                                                                                                |
| SD-6  | Claims take no lock or lease; the only guard against a concurrent double send is Resend's idempotency key    | S4, S9                    | **confirmed** (structure); impact unverified | `skip_locked = f` for every function. The ledgers have no lease column. Whether two send runs can overlap in production (a manual trigger or Cloudflare retry) was not checked. `isDailySendRun` allows one send run per day by schedule. Resend keys last 24 h (`context/archive/2026-09-30-appointment-reminder/plan.md:35`)                                                                |

**Candidates for F-13**, one debt item to plan guard-first. This is a ranking of the evidence, not a decision:

1. **TD-1 + TD-7 + TD-8: extract the shared claim → send → mark runner with injected client and sender.**
   - It removes the largest confirmed duplication.
   - It makes the three jobs and both inline email builders unit-testable for the first time (the "guard" is characterization tests over today's behaviour, including dry-run and failure).
   - It touches TypeScript only, and a Worker rollback reverts it fully.
   - `chain.ts` already shows the injection pattern (`chain.ts:4-6`, `:13-21`).
2. **SD-2 + SD-3: one SQL helper for "eligible reminder recipient"** (consent, opt-in, email, active entry).
   - It also forces a decision on SD-3, a product question: should a retired entry stop appointment reminders?
   - It is riskier: a production migration, and the CLAUDE.md rule that schema changes are not undone by a rollback.
3. **SD-5: a pgTAP guard that enumerates every table with `user_id` and asserts it is empty after one withdrawal.**
   - It is a test, not a refactor, so it is better done as test-plan Phase 2 than as F-13.

## Code References

- `src/worker.ts:21-45`: `scheduled()`, heartbeat ∥ chain, redacted rethrow
- `src/lib/reminders/chain.ts:30-70`: job order, budget arithmetic, failure loop
- `src/lib/reminders/appointment.ts:29-80`, `due-screening.ts:29-110`, `follow-up-nudge.ts:24-78`: the three runners
- `src/lib/reminders/candidates.ts:56-61`, `:77-114`: candidate guard and claim-item selection
- `src/lib/email.ts:69-105`, `:112-143`: batch send, dry run, Resend post
- `src/lib/schedule.ts:13-28`: the 10:00 Warsaw gate
- `supabase/migrations/20260930125726_appointment_reminders.sql:81-159`: appointment claim and mark, grants
- `supabase/migrations/20261006155313_due_screening_reminders.sql:87-255`: candidates, claim, mark
- `supabase/migrations/20261006204148_follow_up_nudges.sql:56-173`: nudge claim (incl. the cross-ledger "emailed today" check), mark
- `supabase/migrations/20260930093108_screening_records.sql:194-216`: final `withdraw_health_data_consent()`
- `.github/workflows/ci.yml:72-87`: the scheduled-handler dry run

## Architecture Insights

- **The database is the decision-maker and the dedupe guard.** TypeScript sequences calls, renders emails and spends the budget.
  - The due job is the exception. Its eligibility rules exist only in TypeScript (`src/lib/screenings/due.ts`), so SQL returns a superset and re-checks the TS decision at claim time (`context/archive/2026-10-06-due-screening-reminder/decisions.md:13-17`).
- **Idempotency has two layers:** the ledger's unique key and `sent_at`, then Resend's `Idempotency-Key` over the sorted claimed ids (`src/lib/reminders/batch-key.ts:1-7`). Mark happens only after Resend accepts.
- **Privacy is enforced by construction.** Emails carry counts and links, logs carry counts and error names (`appointment.ts:12-18` comment), and `ReminderDatabaseError` carries SQLSTATE only (`errors.ts:3-13`).
- **The map's "SQL coupling, low confidence" edges are now confirmed** from the live catalog (S3): reminders → exam-records (plans, completions, cascades), reminders → onboarding-consent (profiles, consents, the 3 `reminders_*` profile columns, S8), reminders → catalog (screening_catalog).

## Historical Context (from prior changes)

- **Why three jobs:**
  - `context/archive/2026-09-30-appointment-reminder/plan.md:54-65`: S-04 put selection in SQL behind claim and mark.
  - `context/archive/2026-10-06-due-screening-reminder/decisions.md:13-17`: S-06 adds a candidates step, because the rules stay in TypeScript.
  - `context/archive/2026-10-06-follow-up-nudges/plan-brief.md:26`: S-07 is SQL-decidable, so it has no candidates step.
- **Budget:** 97 → 93 → 92 to fit Resend's 3,000 a month with heartbeat and alerts (`context/archive/2026-10-06-due-screening-reminder/decisions.md:43,59`). Candidate limit 50 from the cold-CPU budget (`:65-69`).
- **Still open:**
  - cross-job overlap: appointment and due emails can both reach one user on one day (`context/archive/2026-10-06-follow-up-nudges/follow-ups/cross-job-overlap.md:5,13`);
  - first-time eligibility: needs a product decision (`context/archive/2026-10-06-due-screening-reminder/follow-ups/first-time-eligibility.md:3-5`);
  - the withdrawal race residual (`context/archive/2026-09-27-onboarding-profile/follow-ups/review-fixes.md:10`);
  - unchecked production-verification rows (`context/archive/2026-10-06-due-screening-reminder/plan.md:502-505`, `context/archive/2026-10-06-follow-up-nudges/plan.md:373-376`).

  None of the first two is in `context/foundation/backlog.md` (grep).

- **Stale comment:** `src/lib/failure-alert.ts:5` says "(appointment or due-screening)". The chain also alerts for the nudge job (`chain.ts:55`).

## Related Research

- `context/map/repo-map.md`: risk zone #1 and Unknowns #2–#3, which this document answers.
- `context/map/evidence/3-structure.md`: the import graph that Q8 re-checks.
- `context/foundation/test-plan.md`: risks #3 and #5, and Phase 2 "Reminder recipient integration" (`:71`).

## Open Questions

- **Product, owner:** should a retired catalog entry stop appointment reminders, as it stops nudges (SD-3)?
- **Unverified:** whether two send runs can overlap in production (SD-6 impact): a manual trigger, a Cloudflare retry or a long-running chain.
- **Unverified:** column-level staleness of `database.types.ts`. Needs `npm run db:types` and a diff, which was out of scope (no file changes).
- **Not inspected:**
  - RLS policy bodies (they hold 8 more consent-predicate copies by grep, `20260927190303_onboarding_profile.sql:104,115`; `20260930093108_screening_records.sql:80,94,105,129,143,154`);
  - production cron and secret settings (`EMAIL_DRY_RUN`, `REMINDER_TEST_TO`);
  - whether workerd's `AbortSignal.timeout` error passes `instanceof Error`.
- **Coverage is inferred, not measured:** it comes from imports (Q7) and test names. No coverage report was run.
