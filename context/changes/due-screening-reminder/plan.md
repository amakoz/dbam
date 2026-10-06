# Due-screening reminder (S-06) Implementation Plan

## Overview

An opted-in user gets one email when one or more of their done or confirmed exams fall due again because the repeat interval has run out. They don't have to re-enter anything. The work extends the S-04 daily reminder run with a second job. That job reads minimal per-user inputs through a `SECURITY DEFINER` function and decides what is due with the same pure rules the dashboard uses, which F-08 tests. It records each reminder in a new ledger keyed per (user, slug, due month) and sends through the existing Resend batch path. It shares the daily email budget with appointment reminders, and appointment reminders go first.

## Current State Analysis

- Whether something is due exists only in TypeScript:
  - `recommend` (`src/lib/catalog/recommend.ts:103`) decides eligibility and tier.
  - `resolveInterval` (`:82-90`) picks the interval for the profile.
  - `anchorMonth` and `nextDueMonth` (`src/lib/screenings/rules.ts:164-177`) give the due-again month.
  - `partitionDashboard` (`:219-285`) puts a due-again completion back in its tier and fills `lastDone`.
- Nothing about due status is stored (S-05 decision, `context/archive/2026-10-05-confirm-exam-and-recurrence/plan-brief.md:76`).
- The S-04 job (`src/lib/reminders/appointment.ts:37-88`) works like this:
  - It runs only at 10:00 Warsaw time (`isDailySendRun`).
  - It makes one definer RPC to claim reminders, sends one Resend batch, then makes one RPC to mark them sent.
  - It sends to the account email. Emails and logs never name an exam.
- `service_role` holds no privileges on user tables (`supabase/migrations/20260930125726_appointment_reminders.sql:167-168`). A pgTAP guard enforces this for every non-catalog public table (`supabase/tests/database/appointment_reminders.test.sql:102-116`).
- `scheduled()` (`src/worker.ts:17-42`) runs the heartbeat and the appointment job in parallel.
- The failure alert and its email are hard-wired to `"appointment-reminder"`:
  - `src/lib/observability.ts:26` and `:155-185`;
  - `src/worker.ts:34`;
  - the idempotency key `dbam-reminder-failure:<cron>:<ts>` has no job in it.
- Email quota: Resend free allows 100 emails a day (README:282).
  - The heartbeat sends 1 a day (`src/lib/heartbeat.ts`).
  - The appointment job claims up to 100 users (`MAX_BATCH_SIZE`, `src/lib/email.ts:12-13`).
- Workers Free allows 10 ms CPU and 50 subrequests per cron run. S-04 uses 4 subrequests.

## Desired End State

On the 10:00 Warsaw run:

1. The appointment job runs first, as today, and reports how many emails it sent.
2. The due job picks candidate users. A candidate has reminders on, an active consent and an email address, and holds a completion of an active fixed-interval entry. That completion must have no plan and no sent reminder for its current anchor month. Its anchor plus the shortest interval the entry can resolve to must be at or before the current Warsaw month.
3. For each candidate, the job runs `recommend` and `partitionDashboard` with the Warsaw "now". The due items are the tier items in `lastDone`, each with its `nextDueMonth`.
4. The job claims ledger rows for those items, for at most `REMINDER_EMAIL_DAILY_BUDGET − appointmentSent` users.
5. It sends one email per user. The email gives only a count, a dashboard link and an opt-out link.
6. It marks the rows sent.

Users left over are picked up by the next daily run. A retried run gives the same candidates, rows and batch key.

A failed due job gets the same handling as a failed appointment job:

- one redacted `error` event;
- a failure email to the owner whose subject names the job;
- the run is rethrown so it shows as failed.

Verify with `npm test`, `npx supabase test db` and a local dry run through `/cdn-cgi/local/scheduled`.

### Key Discoveries:

- `partitionDashboard` sets `lastDone` only for tier items whose completion is due again and has no plan (`rules.ts:257-279`). That makes it the "dashboard still recommends it" source of truth.
- `recommend` uses `locale` only for sorting (`recommend.ts:134-139`), so the cron can pass `"pl"`.
- The dashboard passes `now.getFullYear()` (`src/pages/dashboard.astro:52`). The cron must use the Warsaw year instead.
- Collected rule inputs are `birth_year`, `sex`, `smoking_status`, `pack_years` and `years_since_quitting` (`src/lib/catalog/factors.ts:28-46`, `recommend.ts:70-79`).
- Completions are deleted by the user (RLS policy, `20260930093108_screening_records.sql:162`) and by withdrawal (`:207`). A ledger FK to `screening_completions` with `on delete cascade` keeps the ledger clean.
- `REMINDER_JOB` is a module constant used in the email body and subject (`observability.ts:26,169,181`).

## What We're NOT Doing

- No reminder when a screening is due for the first time (aged into it, profile edit, new catalog entry). See `follow-ups/first-time-eligibility.md`.
- No repeat or escalation when the user doesn't act. S-07 owns nudges.
- No exam names, slugs or due months in subjects, bodies, links or log lines (S-04 rule, B-01).
- No SQL port of the eligibility or interval rules, and no stored due column. The SQL candidate filter only narrows the search: it never excludes a truly due item, and TypeScript makes the final call.
- No reminders for exams in `maybe`, exams no longer recommended, or entries without a fixed interval.
- No change to the cron schedule, the heartbeat, or the S-04 email text.
- No UI change. The `/profile#reminders` opt-in already covers every reminder kind (S-04 `plan.md:45`).
- No `roadmap.md` status change (worker protocol).

## Implementation Approach

The selection is set-based in SQL and the decision is made in TypeScript:

1. A definer function `get_due_screening_candidates` returns, per candidate user, the five rule-input profile fields and the candidate completions (slug, `last_done_month`, `updated_at`). It returns no email, no names and no exact days.
2. The pure function `dueScreeningItems` in `src/lib/screenings/due.ts` runs the existing rules on that data.
3. A second definer function `claim_due_screening_reminders` takes the chosen items. It re-checks opt-in, consent, email and that the completion still exists. It inserts the ledger rows idempotently and returns, per user, the email, locale and unsent row ids for those items.
4. `mark_due_screening_reminders_sent` stamps the rows, as in S-04.

The job runs after the appointment job in `scheduled()`, so it can use the remaining budget.

## Critical Implementation Details

- **Candidate filter must stay a superset.** The filter compares the SQL anchor plus `least(interval_months, min(override months))` with the current month. The real interval is always one of those values, so every truly due completion passes. The SQL anchor must match `anchorMonth`: `coalesce(last_done_month, date_trunc('month', updated_at at time zone 'Europe/Warsaw')::date)`.
- **Ledger exclusion is per anchor, not per due month.** The ledger stores `anchor_month`. A completion is excluded only while a sent row has the same anchor. If the exclusion were "any sent row with a later due month", it would hide forever an exam the user re-dated to an earlier month.
- **Starvation.** Candidates that TypeScript rejects (no longer recommended, longer real interval) come back on later days. The candidate order `md5(user_id::text || p_today::text)` rotates them daily. It is deterministic within a day, so a retried run keeps the same Resend idempotency key.
- **Order inside `scheduled()`.** The due job awaits the appointment job's sent count. If the appointment job rejects, the due job logs `skipped` with `reason: "no-budget"` and does nothing. The quota use is unknown, and its users roll to the next day. The heartbeat keeps running in parallel.
- **CPU.** Worker CPU is the JSON decode, plus `recommend` (about 19 entries) and `partitionDashboard` for at most 100 candidates, plus one SHA-256. Network waits don't count. Production CPU per run is a manual check.

## Phase 1: Ledger and cron-only functions

### Overview

Add the additive migration with the ledger table, the three definer functions and the grants. Add pgTAP coverage and regenerate the types.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<timestamp>_due_screening_reminders.sql` (create with `npx supabase migration new due_screening_reminders`)

**Intent**: A ledger of due-screening reminders plus the cron-only functions that select candidates, claim rows and mark them sent. The migration only adds objects; it alters and drops nothing.

**Contract**:

- **Table `public.due_screening_reminders`**
  - Columns: `id bigint generated always as identity primary key`, `user_id uuid not null`, `catalog_slug text not null`, `anchor_month date not null`, `due_month date not null`, `created_at timestamptz not null default now()`, `sent_at timestamptz`.
  - Checks: both months are the first of a month, and `due_month > anchor_month`.
  - `unique (user_id, catalog_slug, due_month)`.
  - FK `(user_id, catalog_slug) references public.screening_completions (user_id, catalog_slug) on delete cascade`.
  - An index on `(user_id, catalog_slug, anchor_month)`.
  - A comment marking it as GDPR Art. 9 data.
  - RLS on, no policies, `revoke all ... from anon, authenticated, service_role`.
- **`get_due_screening_candidates(p_today date, p_limit int)`**
  - Returns `table (user_id uuid, birth_year smallint, sex text, smoking_status text, pack_years numeric, years_since_quitting smallint, completions jsonb)`. Use the column types the `profiles` table has.
  - Each element of `completions` is `{catalog_slug, last_done_month, updated_at}`.
  - `security definer`, `set search_path = ''`, `stable`.
  - Raises `22023` when `p_today` is null or `p_limit` is not between 1 and 100.
  - Applies the candidate rules from "Desired End State" step 2 and the Critical Implementation Details.
  - Groups completions per user, orders by `md5(user_id::text || p_today::text)` and limits to `p_limit` users.
- **`claim_due_screening_reminders(p_items jsonb)`**
  - `p_items` is an array of `{user_id, catalog_slug, anchor_month, due_month}`, with 1 to 1000 elements; otherwise it raises `22023`.
  - Inserts with `on conflict do nothing`, and only for items whose completion exists and whose user still has reminders on, an active consent and an email address. An item whose completion is gone is skipped, not an FK error.
  - Returns `table (user_id uuid, email text, locale text, reminder_ids bigint[])`: the unsent rows matching exactly the given items, grouped per user, ordered by user. It never returns other unsent rows the user has.
  - `security definer`, `set search_path = ''`.
- **`mark_due_screening_reminders_sent(p_ids bigint[]) returns integer`**: the same shape as `mark_appointment_reminders_sent`.
- **Grants**: `revoke execute ... from public, anon, authenticated` and `grant execute ... to service_role` on all three functions.

#### 2. pgTAP tests

**File**: `supabase/tests/database/due_screening_reminders.test.sql` (new; fixtures modelled on `appointment_reminders.test.sql:1-60`)

**Intent**: Pin the access rules and the selection predicate at the data level.

**Contract**: cases for:

- **Access**
  - The ledger has RLS on and no privileges for anon, authenticated or service_role.
  - The functions are executable by service_role only; anon and authenticated get `42501`.
  - The existing guard in `appointment_reminders.test.sql` still passes with the new table.
- **Candidates**
  - Excluded: a user who is opted out, has withdrawn consent, or has no email.
  - Excluded: a completion that has a plan, belongs to a retired or non-fixed entry, or has a sent row for the same anchor.
  - Included: a completion with an unsent row (a failed send retries).
  - Included: a completion re-dated to a new anchor after a sent row.
  - Override boundary: with base 36 and override 12, the user is a candidate at anchor + 12 months but not at anchor + 11.
  - The "don't know" anchor comes from `updated_at` in Warsaw time.
  - `p_limit` is honoured, and the order is stable for the same `p_today`.
- **Claim**
  - Claiming twice returns the same ids.
  - Opt-out, withdrawn consent or a deleted completion between candidates and claim gives no row.
  - Only the given items are returned.
- **Mark**: stamps only unsent rows.
- **Cascade**: deleting a completion removes its ledger rows.
- **Arguments**: invalid arguments raise `22023`.

#### 3. Generated types

**File**: `src/lib/database.types.ts`

**Intent**: Regenerate after the migration so the RPCs are typed.

**Contract**: `npm run db:types`, with the output committed.

### Success Criteria:

#### Automated Verification:

- Migration applies on the shared local stack (DB lock held): `npx supabase migration up`
- pgTAP passes, old and new files: `npx supabase test db`
- Types regenerated and committed with no further diff: `npm run db:types && git diff --exit-code src/lib/database.types.ts`

#### Manual Verification:

- Reviewer confirms the migration only adds objects (no `alter`/`drop` on existing objects) and revokes service_role on the new table

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets. The matching `- [ ]` checkboxes live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Pure due-item rule

### Overview

Narrow the rule functions' input types, then add one pure function that turns a candidate into due items using the dashboard rules. Cover it with Vitest.

### Changes Required:

#### 1. Narrow rule input types

**File**: `src/lib/catalog/recommend.ts`, `src/lib/catalog/factors.ts`, `src/lib/screenings/rules.ts`

**Intent**: Let the cron pass only the fields the rules read, instead of building fake full rows. The dashboard callers compile unchanged.

**Contract**:

- Export `RuleProfile = Pick<Profile, "birth_year" | "sex" | "smoking_status" | "pack_years" | "years_since_quitting">`. `FactorSource.column` becomes `keyof RuleProfile`.
- `evaluateBranch`, `resolveInterval` and `recommend` accept `RuleProfile`.
- `partitionDashboard` becomes generic over the completion type: `C extends Pick<ScreeningCompletion, "catalog_slug" | "last_done_month" | "updated_at">`. `DoneView` and `lastDone` carry `C`.
- No behaviour change. The existing `recommend.test.ts`, `rules.test.ts` and `format.test.ts` stay green without edits.

#### 2. Due items

**File**: `src/lib/screenings/due.ts` (new)

**Intent**: The single place that turns one candidate's inputs into due-reminder items. It does this by calling `recommend` → `partitionDashboard` → `anchorMonth`/`nextDueMonth`, so the email agrees with what the dashboard shows.

**Contract**:

```ts
export interface DueCandidate {
  profile: RuleProfile;
  completions: Pick<ScreeningCompletion, "catalog_slug" | "last_done_month" | "updated_at">[];
}
export interface DueItem {
  slug: string;
  anchorMonth: string;
  dueMonth: string;
} // YYYY-MM-01
/** Items the dashboard would show as "due again" in a tier at `now` (Warsaw), with no plans. */
export function dueScreeningItems(candidate: DueCandidate, entries: CatalogEntry[], now: Date): DueItem[];
```

- It uses the Warsaw year (from `warsawToday(now)`), not `now.getFullYear()`.
- It passes an empty plans list; the SQL has already excluded planned slugs.
- Its output is sorted by slug.

#### 3. Unit tests

**File**: `src/lib/screenings/due.test.ts` (new)

**Intent**: Pin when an email fires, as F-08 did for the dashboard.

**Contract**: cases for:

- A confirmed exam whose interval has elapsed gives one item with the right anchor and due month.
- The month before the due month gives none.
- An entry without a fixed interval gives none.
- A user who has aged out of eligibility (no longer recommended) gives none.
- An exam that falls into `maybe` (uncollected factor) gives none.
- An age override applies: blood pressure at 40+ uses 12 months, not 36.
- A "don't know" completion anchors on the Warsaw month of `updated_at`.
- At the New Year boundary, 2026-12-31T23:30Z counts as Warsaw year 2027 for eligibility.
- A completion whose entry is missing from `entries` gives none.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including `due.test.ts` and the unchanged F-03/F-08 suites: `npm test`
- Type check passes: `npx astro check`
- Lint passes: `npm run lint`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets. The matching `- [ ]` checkboxes live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Due job, shared budget and failure alerts

### Overview

Add the cron job and run it after the appointment job on the remaining budget. Generalise the failure event and alert to cover both reminder jobs. Add the email copy and update the README.

### Changes Required:

#### 1. Shared budget and errors

**File**: `src/lib/email.ts`, `src/lib/reminders/appointment.ts`, `src/lib/reminders/errors.ts` (new)

**Intent**: Keep both reminder jobs inside Resend's 100/day quota, with appointments first.

**Contract**:

- Add `REMINDER_EMAIL_DAILY_BUDGET = 97` to `src/lib/email.ts`: Resend free 100/day, minus 1 heartbeat, minus 2 possible failure alerts.
- `runAppointmentReminders` claims `p_limit = REMINDER_EMAIL_DAILY_BUDGET` and returns `{ outcome, sent }`. `sent` is 0 unless the outcome is `sent`.
- Move `ReminderDatabaseError` to `src/lib/reminders/errors.ts`, with `step: "candidates" | "claim" | "mark"`. The appointment job imports it from there.

#### 2. Due job

**File**: `src/lib/reminders/due-screening.ts` (new)

**Intent**: Implement the run flow from "Desired End State". It mirrors `appointment.ts`: the same gate, dry-run handling, log style and error rules.

**Contract**:

- Signature: `runDueScreeningReminders({ cron, scheduledTime }, { budget }): Promise<{ outcome: "none" | "skipped" | "dry-run" | "sent"; sent: number }>`.
- If `budget <= 0`, it logs `skipped` with `reason: "no-budget"`.
- Run flow:
  1. Candidates are `get_due_screening_candidates(warsawToday, MAX_BATCH_SIZE)`.
  2. The `completions` jsonb is validated with a zod schema. A malformed row throws `ReminderDatabaseError("candidates", "invalid")`.
  3. The catalog comes from `getActiveCatalog(adminClient)`.
  4. `dueScreeningItems` runs per candidate. The job keeps the first `budget` users that have at least one item.
  5. It calls `claim_due_screening_reminders`, then `sendEmailBatch` with the key `dbam-due-screening-reminder:<sha256 of sorted ids>`, then `mark_due_screening_reminders_sent`.
- Log line: `{event: "due-screening-reminder", outcome, cron, scheduledAt, candidates, due, sent}`. It holds counts only. A failure logs `error` with the name and whitelisted details only.
- Email: `email.dueScreeningReminder.*` keys with a plural body over the number of due items. It links to `/dashboard` and `/profile#reminders` and never contains a slug or exam name.

#### 3. Worker wiring

**File**: `src/worker.ts`

**Intent**: Run the heartbeat in parallel with a sequential reminder chain: the appointment job first, then the due job on `REMINDER_EMAIL_DAILY_BUDGET − appointment.sent`.

**Contract**:

- If the appointment job rejects, the due job runs with `budget: 0`, so it logs a skip.
- Each failed job still gets one `buildCronErrorEvent` line.
- Each failed reminder job (`appointment-reminder`, `due-screening-reminder`) gets `sendReminderFailureAlert`.
- The first failure is rethrown, redacted.
- Update the header comment.

#### 4. Generalised failure event and alert

**File**: `src/lib/observability.ts`, `src/lib/failure-alert.ts`, `src/lib/observability.test.ts`

**Intent**: A failed due job alerts the owner like a failed appointment job does, and both can fail in the same run without colliding.

**Contract**:

- Export `type ReminderJob = "appointment-reminder" | "due-screening-reminder"`.
- `buildReminderFailureEmail({ job, error, cron, scheduledTime })`:
  - The subject is `Dbam: <appointment|due-screening> reminder run failed`.
  - The body has `Job: <job>`.
  - The key is `dbam-reminder-failure:<job>:<cron>:<ts>`.
- `sendReminderFailureAlert(run, job, error)`.
- Tests (the privacy gate, per `lessons.md`):
  - The leaky-error case runs through the due job's alert email and cron event and asserts that the address and SQL are absent.
  - The two jobs' keys differ for the same run.
  - The "mark" duplicate warning appears for both jobs.

#### 5. Copy and docs

**File**: `src/i18n/pl.ts`, `src/i18n/en.ts`, `README.md`

**Intent**: Email text in both locales, and docs that describe the new job.

**Contract**:

- Keys `email.dueScreeningReminder.subject` / `greeting` / `body_one|few|many|other` (`{count}`) / `dashboard` / `optOut`. They carry the same no-exam-name comment as the appointment keys.
- README "Cron" and "Errors and alerts":
  - a `due-screening-reminder` log line per run;
  - the shared 97/day budget with appointments first;
  - the alert now covers both reminder jobs.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including the new observability cases: `npm test`
- Lint passes: `npm run lint`
- Type check and build pass: `npx astro check && npm run build`
- Local dry run shows `due-screening-reminder` `dry-run` with `due: 1` and no slug, email or subject in any line
- Local dry run with the appointment job failing: the due job logs `skipped` / `no-budget` and the alert dry-run line appears

#### Manual Verification:

- PR Manual checks (production, after merge): an opted-in test account with a completion past its interval receives one due-screening email at 10:00 Warsaw, with no exam name in the subject or body
- PR Manual checks (production): the second daily run sends nothing new for that account (ledger dedupe)
- PR Manual checks (production): Workers Logs for the scheduled invocation show CPU time under 10 ms and no "exceeded CPU" outcome
- PR Manual checks (production): the `due-screening-reminder` log line holds counts only

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets. The matching `- [ ]` checkboxes live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- `src/lib/screenings/due.test.ts`: when an item is due, including the boundaries (due month, override, aged out, maybe, Warsaw year, missing entry).
- `src/lib/observability.test.ts`: leak-guard cases for the due job's event and alert; distinct alert keys per job.
- The existing `recommend.test.ts`, `rules.test.ts` and `format.test.ts` stay unchanged and green after the type narrowing.

### Integration Tests:

- `supabase/tests/database/due_screening_reminders.test.sql`: grants, the candidate predicate (superset with the override boundary), claim idempotency and re-validation, mark, cascade.

### Manual Testing Steps:

1. Local dry run (DB lock held): seed an opted-in user with consent and a `dental-check-up` completion 7 months back, start `npx astro dev --host 127.0.0.1 --port $DBAM_PORT` with `EMAIL_DRY_RUN=true`, and call `/cdn-cgi/local/scheduled?cron=0+8,9+*+*+*&time=<today 08:00Z in ms>`. Expect one `dry-run` with `due: 1` (criterion 3.4). For 3.5, make the appointment claim fail (a stubbed RPC error in the working tree, never committed) and repeat.
2. Re-mark the exam done this month and run again. Expect `none`.
3. Plan the same exam and run again. Expect `none`, because the plan excludes it.
4. Production checks from the PR Manual checks list.

## Performance Considerations

- Subrequests per run: heartbeat 1, appointment 3, due job 5 (candidates, catalog, claim, batch, mark). That is 9 of 50.
- CPU: about 100 candidates × (`recommend` over about 19 entries + `partitionDashboard`), plus a zod parse and one SHA-256. This is expected to fit in 10 ms. It is verified in production from the invocation's CPU time, because local `wrangler dev` does not enforce the cap. If it does not fit, lower the candidate limit (a constant) before anything else.
- Quota: at most 97 reminder emails a day in total. Overflow rolls to the next day through the random-per-day candidate order.

## Migration Notes

The migration adds a table, three functions and grants, and nothing else. A Worker rollback leaves them unused and harmless. The new table revokes service_role, so the existing guard in `appointment_reminders.test.sql` keeps passing. Run `npm run db:types` and commit the result. Production gets the migration only through the CI `migrate` job.

## References

- Research: `context/changes/due-screening-reminder/research.md`
- Decisions: `context/changes/due-screening-reminder/decisions.md`
- Follow-up: `context/changes/due-screening-reminder/follow-ups/first-time-eligibility.md`
- S-04 job and ledger pattern: `src/lib/reminders/appointment.ts:37-120`, `supabase/migrations/20260930125726_appointment_reminders.sql:52-159`
- Dashboard rules: `src/lib/screenings/rules.ts:164-285`, `src/lib/catalog/recommend.ts:70-142`
- Privacy gate lesson: `context/foundation/lessons.md` ("Grep gates are heuristics")

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Ledger and cron-only functions

#### Automated

- [ ] 1.1 Migration applies on the shared local stack (DB lock held): `npx supabase migration up`
- [ ] 1.2 pgTAP passes, old and new files: `npx supabase test db`
- [ ] 1.3 Types regenerated and committed with no further diff: `npm run db:types && git diff --exit-code src/lib/database.types.ts`

#### Manual

- [ ] 1.4 Reviewer confirms the migration only adds objects (no `alter`/`drop` on existing objects) and revokes service_role on the new table

### Phase 2: Pure due-item rule

#### Automated

- [ ] 2.1 Unit tests pass, including `due.test.ts` and the unchanged F-03/F-08 suites: `npm test`
- [ ] 2.2 Type check passes: `npx astro check`
- [ ] 2.3 Lint passes: `npm run lint`

### Phase 3: Due job, shared budget and failure alerts

#### Automated

- [ ] 3.1 Unit tests pass, including the new observability cases: `npm test`
- [ ] 3.2 Lint passes: `npm run lint`
- [ ] 3.3 Type check and build pass: `npx astro check && npm run build`
- [ ] 3.4 Local dry run shows `due-screening-reminder` `dry-run` with `due: 1` and no slug, email or subject in any line
- [ ] 3.5 Local dry run with the appointment job failing: the due job logs `skipped` / `no-budget` and the alert dry-run line appears

#### Manual

- [ ] 3.6 PR Manual checks (production, after merge): an opted-in test account with a completion past its interval receives one due-screening email at 10:00 Warsaw, with no exam name in the subject or body
- [ ] 3.7 PR Manual checks (production): the second daily run sends nothing new for that account (ledger dedupe)
- [ ] 3.8 PR Manual checks (production): Workers Logs for the scheduled invocation show CPU time under 10 ms and no "exceeded CPU" outcome
- [ ] 3.9 PR Manual checks (production): the `due-screening-reminder` log line holds counts only
