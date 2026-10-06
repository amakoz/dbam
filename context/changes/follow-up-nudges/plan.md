# Follow-up Nudges (S-07) Implementation Plan

## Overview

An opted-in user gets one email nudge when an exam they planned has had no appointment date for 14 days (FR-011), and one when an appointment date passed 7 days ago without a confirmation (FR-012). Both kinds go out from a third job in the existing daily reminder chain, in one email per user, from what is left of the shared daily email budget. The emails name no exam.

## Current State Analysis

- The FR-011 state is a `screening_plans` row with `appointment_date is null` (`supabase/migrations/20260930093108_screening_records.sql:11-32`). The FR-012 state is a plan dated before today: `confirm_screening_plan` deletes the plan, so a past-dated plan that still exists is unconfirmed (`supabase/migrations/20261005173653_confirm_screening_plan.sql:38-74`).
- Both states can be decided in SQL alone. The S-04 shape fits: one definer `claim_…` that inserts ledger rows and returns one row per user, then one `mark_…_sent` (`supabase/migrations/20260930125726_appointment_reminders.sql:76-153`). S-06's candidates step, TypeScript rules and CPU work are not needed.
- `runReminderChain` hard-codes two jobs: `appointment` → `due(budget)`. The `due` dep is typed `Promise<unknown>`, and its `sent` is ignored (`src/lib/reminders/chain.ts:13-59`). The `ReminderJob` union and `JOB_LABEL` list two jobs (`src/lib/observability.ts:27-33`).
- `REMINDER_EMAIL_DAILY_BUDGET = 93` assumes at most 2 failure alerts a day (`src/lib/email-budget.ts:5-9`). With a third job: 31 × (93 + 1 + 3) = 3,007 > 3,000, so the budget becomes 92.
- The per-user one-email-per-run rule holds within each job only. Nothing de-duplicates across jobs (research.md "Per-user one-email-per-run").
- The opt-in heading and disclosure describe appointment emails only (`src/i18n/en.ts:203-205`, `src/i18n/pl.ts:207-208`).

## Desired End State

On the 10:00 Warsaw run the chain runs appointment → due → follow-up nudge. The nudge job claims up to `92 − appointment.sent − due.sent` users. It skips users who already got an appointment or due email that Warsaw day, and puts users with a past appointment to confirm first. Each user gets one email with up to two count lines ("N past appointments to confirm", "N planned exams without a date"), a `/dashboard` link and the opt-out link. Each (plan, kind, cycle) is nudged at most once. A failed nudge job logs a redacted error event and sends the owner an alert that names it. The profile's opt-in copy describes every email Dbam sends.

Verify with `npx supabase test db`, `npm test`, `npm run lint`, `npx astro check`, `npm run build` and a local dry run of the daily cron.

### Key Discoveries:

- `screening_plans.updated_at` moves on every upsert (trigger `set_updated_at`, `20260927190303_onboarding_profile.sql:77-85`; upsert at `src/pages/api/screenings.ts:122-131`). Clients cannot write it (`screening_records.sql:171-172`). For an undated plan, it is the moment the plan was selected or last re-saved without a date.
- Clearing a passed plan's date (the field starts empty, `src/components/recommendations/ScreeningActions.astro:38-40`) keeps the old `created_at`. That is why FR-011 counts from `updated_at`.
- The S-04 ledger cascades with its plan (`appointment_reminders.sql:54`). Confirm, unplan, mark done and consent withdrawal all delete the plan, so the nudge rows go too.
- Both earlier ledgers carry `sent_at timestamptz` (`appointment_reminders.sql:59`, `20261006155313_due_screening_reminders.sql:21`). That is the "already emailed today" signal.
- The CI `ci` job calls the scheduled handler in dry run against local Supabase (`.github/workflows/ci.yml:66-81`). The nudge claim runs there too, so a broken grant or signature fails the PR.
- `src/i18n/index.ts` imports only the dictionaries, so a pure message builder can use `createT` under Vitest. `src/lib/email.ts` imports `astro:env/server`, so the builder takes only a `type` import from it.
- Every new public table must revoke all service_role privileges. The global guard is `supabase/tests/database/appointment_reminders.test.sql:102-116`.

## What We're NOT Doing

- No repeat nudges for the same cycle, and no escalation: the dashboard keeps showing the state.
- No change to S-04/S-06 cross-job overlap (a user can still get an appointment and a due email the same day). This becomes a follow-up note, `follow-ups/cross-job-overlap.md`.
- No nudges for plans on retired catalog entries, and no check whether the exam is still recommended.
- No exam names, slugs, dates or slug anchors in emails, subjects, links or logs.
- No UI change beyond the opt-in copy strings. No new consent or opt-in column, and no separate opt-out per email kind.
- No cron schedule change, no SQL port of the rules, no change to `roadmap.md` status.
- No special handling for the launch backlog: the budget caps it and the rest roll over.

## Implementation Approach

Copy S-04, not S-06. A migration adds the `follow_up_nudges` ledger and two cron-only definer functions. Their thresholds come in as parameters, like `p_lead_days`. A pure module holds the thresholds and the email builder, so Vitest covers the copy and the no-exam-name rule. The chain becomes three jobs with a budget that flows down. The job module copies `appointment.ts`, with a budget gate like `due-screening.ts`.

## Critical Implementation Details

- **Cycle and re-check.** For `schedule`, `cycle_on` is `(sp.updated_at at time zone 'Europe/Warsaw')::date`, taken at claim time. The return re-checks that the plan is still undated and that its Warsaw `updated_at` date still equals `cycle_on`. A user who re-saves the plan makes the old row stale: it stays unsent and dies with the plan, the way a re-dated S-04 row does. For `confirm`, `cycle_on = appointment_date`, and the return re-checks `sp.appointment_date = r.cycle_on` and `cycle_on <= p_today - p_confirm_after`.
- **Ordering inside the chain.** The nudge job must run after the due job has returned. Then the earlier jobs' `mark_*_sent` calls have committed, and the "emailed today" exclusion sees them. A dry run marks nothing, so the exclusion doesn't apply in dry runs (as intended).

## Phase 1: Ledger and cron-only functions

### Overview

The migration, pgTAP coverage and regenerated types.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<timestamp>_follow_up_nudges.sql` (new, via `npx supabase migration new follow_up_nudges`)

**Intent**: Add the nudge ledger and the claim and mark functions, locked down like the S-04/S-06 ledgers, and update the `screening_plans` table comment so FR-011's "selected at" is `updated_at`. Additive only.

**Contract**:

- Table `public.follow_up_nudges`:
  - `id bigint generated always as identity primary key`;
  - `plan_id bigint not null references public.screening_plans (id) on delete cascade`;
  - `user_id uuid not null references auth.users (id) on delete cascade`;
  - `kind text not null check (kind in ('schedule','confirm'))`;
  - `cycle_on date not null`;
  - `created_at timestamptz not null default now()`;
  - `sent_at timestamptz`;
  - `constraint follow_up_nudges_plan_kind_cycle_unique unique (plan_id, kind, cycle_on)`;
  - a table comment, written as health data (GDPR Art. 9).
- Access: RLS enabled with no policies. `revoke all` from anon, authenticated and service_role, plus truncate/trigger/references, and `maintain` on Postgres 17+ (copy `due_screening_reminders.sql:42-54`).
- `public.claim_follow_up_nudges(p_today date, p_schedule_after int, p_confirm_after int, p_limit int) returns table (user_id uuid, email text, locale text, nudge_ids bigint[], schedule_count int, confirm_count int)`:
  - `security definer`, `set search_path = ''`, `#variable_conflict use_column`;
  - raises `22023` when any argument is null, either threshold is outside 1–90, or `p_limit` is outside 1–100;
  - inserts both kinds `on conflict … do nothing` for plans whose owner has `reminders_enabled`, an active consent and an active catalog entry:
    - `schedule`: `appointment_date is null` and Warsaw `updated_at` date `<= p_today - p_schedule_after`;
    - `confirm`: `appointment_date <= p_today - p_confirm_after`;
  - returns unsent rows grouped per user, re-checking live state:
    - the plan's state still matches the cycle (see Critical Implementation Details);
    - opt-in, consent, active entry and a non-null email;
    - no `appointment_reminders` or `due_screening_reminders` row for that user whose Warsaw `sent_at` date equals `p_today`;
  - order: `order by count(*) filter (where r.kind = 'confirm') > 0 desc, md5(r.user_id::text || p_today::text)`, then `limit p_limit`. Do not order by the `confirm_count` output name: inside an expression plpgsql resolves it to the null OUT variable (plan review F3);
  - counts: `count(*) filter (where r.kind = 'schedule')::int` and `count(*) filter (where r.kind = 'confirm')::int`, because `count` is bigint and `return query` rejects the mismatch;
  - aggregates `array_agg(distinct r.id order by r.id)`;
  - returns nothing that names an exam: no slug, no date.
- `public.mark_follow_up_nudges_sent(p_ids bigint[]) returns integer`: copies `mark_appointment_reminders_sent`.
- `revoke execute … from public, anon, authenticated; grant execute … to service_role` on both functions.
- `comment on table public.screening_plans` restated so that `updated_at` (Warsaw date) is where FR-011 counts from, and `created_at` is the first selection.

#### 2. pgTAP

**File**: `supabase/tests/database/follow_up_nudges.test.sql` (new)

**Intent**: Pin the access rules, the thresholds, dedupe, the cross-job exclusion, ordering and the cascade. Use a fixed `p_today` (for example `2027-03-10`) and explicit `updated_at`/`sent_at` fixture values.

**Contract**: cases at least for:

- table and function access:
  - no table privilege for anon, authenticated or service_role;
  - RLS on;
  - only service_role can execute the functions;
- the `schedule` boundary: 13 days → no row, 14 days → row;
- the `confirm` boundary: 6 days → none, 7 → row;
- a plan dated today or later → nothing;
- opted out, no consent, no email, retired entry → nothing;
- idempotence:
  - a second claim on the same day returns the same ids;
  - after mark, a claim returns nothing;
  - mark returns the count stamped;
- a re-saved undated plan → a new `cycle_on` and a new row, and the stale row is not returned. `screening_plans_set_updated_at` is a BEFORE UPDATE trigger that writes `now()`. Either build the case from INSERT-only fixtures (the trigger doesn't fire on insert), or run `alter table public.screening_plans disable trigger screening_plans_set_updated_at` as postgres inside the rolled-back test and set `updated_at` explicitly. Never compare `now()` with the fixed `p_today` (plan review F2);
- a re-dated plan → a new `confirm` cycle;
- cross-job exclusion: an S-04 or S-06 row sent on `p_today` (Warsaw) excludes the user; one sent the day before doesn't;
- order: a confirm user comes before a schedule-only user, and `p_limit` is respected. Choose the fixture user ids so that the md5 tiebreak alone would put the schedule-only user first; otherwise the case could pass by chance (plan review F3);
- one user with both kinds gets one row with both counts;
- cascade: deleting the plan, confirming it (`confirm_screening_plan`) and withdrawing consent remove the nudge rows;
- invalid arguments raise `22023`.

#### 3. Types

**File**: `src/lib/database.types.ts`

**Intent**: Regenerate with `npm run db:types` (shared DB lock).

**Contract**: the new function signatures and table appear in `Database["public"]`.

### Success Criteria:

#### Automated Verification:

- Migration applies on the shared local stack: `npx supabase migration up` (DB lock held)
- pgTAP passes, including the new file and the global service_role guard: `npx supabase test db`
- Types regenerated and committed: `npm run db:types` leaves no diff after commit
- Lint and type check pass: `npm run lint` and `npx astro check`

**Implementation Note**: Pause after this phase for confirmation before Phase 2.

---

## Phase 2: Nudge job, message, budget and chain

### Overview

The thresholds, the email copy and builder, the budget change, the three-job chain, and the nudge job wired into the Worker, all in one phase. `ReminderChainDeps.nudge` is required, so `src/worker.ts` must pass it in the same phase or `astro check` fails (plan review F1). The pure pieces are covered by Vitest.

### Changes Required:

#### 1. Pure nudge module

**File**: `src/lib/reminders/nudge-message.ts` (new), `src/lib/reminders/nudge-message.test.ts` (new)

**Intent**: Hold `SCHEDULE_NUDGE_AFTER_DAYS = 14` and `CONFIRM_NUDGE_AFTER_DAYS = 7`, and build one nudge email from a claimed row, with no `astro:*` import, so its rules are unit-tested.

**Contract**:

- `buildNudgeMessage(row: { email; locale; schedule_count; confirm_count }, site: string): BatchEmailMessage`, with a type-only import from `@/lib/email`:
  - the body is the greeting, the confirm line only when `confirm_count > 0`, the schedule line only when `schedule_count > 0`, the `/dashboard` link and the `/profile#reminders` opt-out link;
  - the subject is a single fixed string per locale.
- Tests:
  - each kind alone, and both together;
  - plural forms in pl (1, 2, 5) and en (1, 2);
  - links built from `site`;
  - the output contains no catalog slug or exam name: feed a row carrying an extra slug-like field and assert it is absent;
  - the profile disclosure in both locales mentions `14` and `7`, pinned to the constants. The appointment window `1–3` is not pinned: `appointment.ts` imports the admin client, which pulls in `astro:env`.

#### 2. Email copy

**File**: `src/i18n/pl.ts`, `src/i18n/en.ts`

**Intent**: Add the `email.followUpNudge.*` keys, and rewrite the opt-in heading and disclosure to cover every email Dbam sends.

**Contract**:

- `email.followUpNudge.subject`, `.greeting`, `.confirm_one|few|many|other` and `.schedule_one|few|many|other` (with `{count}`), `.dashboard` and `.optOut` with `{url}`.
- `profile.reminders.heading`: a general name such as "Przypomnienia e-mail" / "Email reminders".
- `profile.reminders.disclosure`: names the four occasions and their timings, in this order:
  - 1–3 days before an appointment;
  - when a done exam is due again;
  - 14 days after planning an exam without a date;
  - 7 days after an unconfirmed appointment.

  It also keeps: at most one nudge email a day, never an exam name, sent through Resend, turn off any time.

- The withdrawal sentence "Appointment reminders are switched off too" (`en.ts:198` and its pl twin) becomes "Email reminders…".

#### 3. Budget

**File**: `src/lib/email-budget.ts`

**Intent**: 93 → 92 for the third possible failure alert.

**Contract**: `REMINDER_EMAIL_DAILY_BUDGET = 92`. The doc comment reads 31 × (92 + 1 heartbeat + up to 3 failure alerts) = 2,976. The appointment claim's `p_limit` follows the constant.

#### 4. Chain and job names

**File**: `src/lib/reminders/chain.ts`, `src/lib/reminders/chain.test.ts`, `src/lib/observability.ts`, `src/lib/observability.test.ts`

**Intent**: Run three jobs with a budget that flows down, and give the alert a third job name.

**Contract**:

- `ReminderChainDeps`:
  - `due: (run, { budget }) => Promise<{ sent: number }>`;
  - new `nudge: (run, { budget }) => Promise<{ sent: number }>`.
- Nudge budget: `max(0, budgetAfterAppointment − due.sent)`, and 0 when the due job throws (quota use unknown). The appointment-failure rule is unchanged, so due and nudge both get 0.
- Every failed job logs one error event and sends one alert, and the first failure is rethrown redacted.
- `ReminderJob` gets `"follow-up-nudge"`, and `JOB_LABEL` gets `"follow-up nudge"`.
- Tests:
  - order `["appointment","due","nudge"]`;
  - the nudge budget after both jobs send;
  - due fails → nudge budget 0 with one alert;
  - nudge fails → one alert naming it;
  - all three fail → three alerts with distinct idempotency keys;
  - the budget constant is 92;
  - observability `JOBS` includes the new name, and the privacy cases cover it.

#### 5. Job

**File**: `src/lib/reminders/follow-up-nudge.ts` (new)

**Intent**: Run one daily nudge batch within the given budget, in the same style as the appointment job.

**Contract**: `runFollowUpNudges(run, { budget }): Promise<{ outcome: "none" | "skipped" | "dry-run" | "sent"; sent: number }>`.

- It logs `skipped` when the run is not the daily send run, and `skipped`/`no-budget` when `budget <= 0`.
- It calls `claim_follow_up_nudges` with `p_today: warsawToday(...)`, the two constants and `p_limit: min(budget, MAX_BATCH_SIZE)`. A claim error throws `ReminderDatabaseError("claim", code)`.
- It sends one message per row through `sendEmailBatch` with `batchKey("dbam-follow-up-nudge", ids)`.
- A dry run marks nothing. Otherwise it calls `mark_follow_up_nudges_sent`; a mark error throws `ReminderDatabaseError("mark", code)`.
- Each run logs one JSON line `{ event: "follow-up-nudge", outcome, cron, scheduledAt, due, sent }`. It carries counts and error names only, never an address, subject or slug.
- A header comment explains the job, in the style of `appointment.ts:12-19`.

#### 6. Wiring

**File**: `src/worker.ts`, `eslint.config.js`, `src/lib/reminders/admin-client.ts`

**Intent**: Inject the job into the chain, allow `console` in it, and keep the admin-client header accurate.

**Contract**:

- `nudge: runFollowUpNudges` in `runReminderChain` deps.
- `src/lib/reminders/follow-up-nudge.ts` joins the `no-console` allow-list.
- The header says "seven reminder functions" and lists the nudge claim and mark.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including the new nudge-message and chain cases: `npm test`
- Lint and type check pass: `npm run lint` and `npx astro check`
- Build passes with the job wired into the Worker: `npm run build`

**Implementation Note**: Pause after this phase for confirmation before Phase 3.

---

## Phase 3: Docs and local dry run

### Overview

The README, the follow-up note and a local dry run of the job wired in Phase 2.

### Changes Required:

#### 1. Docs and follow-up

**File**: `README.md`, `context/changes/follow-up-nudges/follow-ups/cross-job-overlap.md` (new)

**Intent**: Document the nudge job and the new budget, and record the pre-existing S-04/S-06 overlap.

**Contract**:

- README:
  - line 3 mentions the nudges;
  - the Scheduled jobs section gets a **Follow-up nudges** paragraph (thresholds, cycles, the emailed-today skip, confirm-first order, how to try it locally) and its log line;
  - "Shared email budget" says 92 and three jobs with 3 alerts;
  - "Runs" lists the `follow-up-nudge` line;
  - the `SUPABASE_SECRET_KEY` row says seven functions;
  - the failure email paragraph names three jobs.
- The follow-up note covers the observation, its impact and an option (the same "emailed today" exclusion in the due claim).

### Success Criteria:

#### Automated Verification:

- Lint, type check and build pass: `npm run lint`, `npx astro check`, `npm run build`
- Unit and pgTAP suites still pass: `npm test` and `npx supabase test db`
- Local dry run (DB lock held, seeded opted-in user with an undated plan 14+ days old and a plan dated 7+ days ago, removed afterwards): the daily `curl` logs `follow-up-nudge` `dry-run` with `due: 1`, and no slug, address or subject in any line; a user with an appointment reminder sent that Warsaw day logs `none`
- `npm run ui:check` passes

#### Manual Verification:

- Production: a seeded opted-in account gets one nudge email at 10:00 Warsaw naming no exam, with both lines when both kinds apply
- Production: the next daily run sends that account no second nudge for the same cycles
- Production: Workers Logs CPU time for the daily scheduled invocation stays under the 10 ms Free-plan cap with the third job
- Profile page shows the new opt-in heading and disclosure in pl and en

**Implementation Note**: The production rows can only run after merge; they go to the PR's Manual checks list.

---

## Testing Strategy

### Unit Tests:

- `nudge-message.test.ts`: kinds, plurals, links, the no-exam-name rule, and the disclosure pinned to the constants.
- `chain.test.ts`: the three-job order, the budget flow, the failure matrix and the budget constant.
- `observability.test.ts`: the third job name in events and alerts, and the privacy cases.

### Integration Tests:

- `follow_up_nudges.test.sql` (pgTAP): access, thresholds, dedupe, cycles, cross-job exclusion, ordering, cascade and validation.
- The CI scheduled-handler dry run exercises the real nudge claim against local Supabase.

### Manual Testing Steps:

1. Locally: seed an opted-in user with consent, an undated plan with `updated_at` 15 days back and a plan dated 8 days back. Run the daily `curl` with `EMAIL_DRY_RUN=true` and see `due: 1`.
2. Insert an `appointment_reminders` row sent today for that user, re-run, and see `none`.
3. In production after merge: check the inbox, the next-day run and Workers Logs CPU.

## Performance Considerations

The job does one RPC, builds at most 92 messages, computes one SHA-256 and makes two more network calls (send and mark). That is the same per-message work as the S-04 job. No candidate or rule step is added. CPU is unmeasured in workerd, so production check 3.7 covers it.

## Migration Notes

Additive: a new table and functions, and a table comment. A Worker rollback leaves an unused table. On the first production run every eligible existing plan qualifies at once. The budget caps the run and the rest roll over (orchestrator: no special handling).

## References

- Research: `context/changes/follow-up-nudges/research.md`
- Decisions: `context/changes/follow-up-nudges/decisions.md`
- Pattern: `supabase/migrations/20260930125726_appointment_reminders.sql:76-153`, `src/lib/reminders/appointment.ts`
- Chain: `src/lib/reminders/chain.ts:27-59`
- S-06 archive: `context/archive/2026-10-06-due-screening-reminder/plan-brief.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Ledger and cron-only functions

#### Automated

- [x] 1.1 Migration applies on the shared local stack — a7e8590
- [x] 1.2 pgTAP passes, including the new file and the global service_role guard — a7e8590
- [x] 1.3 Types regenerated and committed — a7e8590
- [x] 1.4 Lint and type check pass — a7e8590

### Phase 2: Nudge job, message, budget and chain

#### Automated

- [x] 2.1 Unit tests pass, including the new nudge-message and chain cases — f0a733e
- [x] 2.2 Lint and type check pass — f0a733e
- [x] 2.3 Build passes with the job wired into the Worker — f0a733e

### Phase 3: Docs and local dry run

#### Automated

- [x] 3.1 Lint, type check and build pass
- [x] 3.2 Unit and pgTAP suites still pass
- [x] 3.3 Local dry run logs the nudge for a seeded user and none after a same-day reminder
- [x] 3.4 npm run ui:check passes

#### Manual

- [ ] 3.5 Production: one nudge email at 10:00 Warsaw naming no exam
- [ ] 3.6 Production: no second nudge for the same cycles on the next run
- [ ] 3.7 Production: Workers Logs CPU stays under 10 ms with the third job
- [ ] 3.8 Profile page shows the new opt-in heading and disclosure in pl and en
