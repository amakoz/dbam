---
date: 2026-10-06T22:26:19+02:00
researcher: Amadeusz Kozlowski (Claude worker)
git_commit: ea360ee2ff6677aea8266c70cabc9cc725d6710e
branch: feat/follow-up-nudges
repository: 10xdevs (Dbam)
topic: "S-07 follow-up nudges (FR-011, FR-012) on the S-04/S-06 reminder pipeline"
tags: [research, codebase, reminders, cron, screening-plans, resend, s-07]
status: complete
last_updated: 2026-10-06
last_updated_by: Amadeusz Kozlowski (Claude worker)
---

# Research: S-07 follow-up nudges on the existing reminder pipeline

**Date**: 2026-10-06T22:26:19+02:00
**Researcher**: Amadeusz Kozlowski (Claude worker)
**Git Commit**: ea360ee2ff6677aea8266c70cabc9cc725d6710e
**Branch**: feat/follow-up-nudges
**Repository**: 10xdevs (Dbam)

## Research Question

Roadmap S-07 (`context/foundation/roadmap.md:275-286`): an opted-in user gets (a) a nudge when a selected exam has no
appointment date after some days (FR-011, `context/foundation/prd.md:127-128`) and (b) a follow-up asking them to
confirm completion once an appointment date has passed unconfirmed (FR-012, `prd.md:129-131`). Build on S-06 and S-04
without a second pipeline. Recommend: day thresholds (with evidence), how nudges share the daily email budget and the
per-user one-email-per-run rule (priority order), ledger/dedupe keys, and whether the emails stay free of exam names.

## Summary

Both nudge states are already in the schema and are decidable in SQL alone, so S-07 needs no TypeScript rule
evaluation and none of S-06's candidate/CPU machinery:

- FR-011 state = a `screening_plans` row with `appointment_date is null` (`supabase/migrations/20260930093108_screening_records.sql:16-25`).
- FR-012 state = a `screening_plans` row with `appointment_date < today` — confirming deletes the plan
  (`supabase/migrations/20261005173653_confirm_screening_plan.sql:53-56`), so a surviving past-dated plan is by
  definition unconfirmed (S-05 chose this model: `context/archive/2026-10-05-confirm-exam-and-recurrence/plan-brief.md:29`).

**Recommendations** (the orchestrator decides; owner delegated the threshold unknown, `roadmap.md:284`):

| Topic            | Recommendation                                                                                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-011 threshold | **14 days** after the plan last became undated (`updated_at`, see "Anchor" below), one nudge per undated cycle                                                         |
| FR-012 threshold | **7 days** after `appointment_date`, one follow-up per (plan, appointment date), no repeat                                                                             |
| Pipeline         | **One** new job, `follow-up-nudge`, third in `runReminderChain`, S-04-style single `claim_…` + `mark_…_sent` definer functions; both nudge kinds in one email per user |
| Priority         | appointment → due-screening → follow-up nudge; inside the nudge job, users with a confirm item before users with only schedule items                                   |
| Per-user rule    | the nudge job skips any user who already got an S-04 or S-06 email in this Warsaw day (they roll to the next day)                                                      |
| Budget           | job gets `budget − appointment.sent − due.sent`; lower `REMINDER_EMAIL_DAILY_BUDGET` 93 → **92** for the third failure alert                                           |
| Ledger           | one table `follow_up_nudges(plan_id → screening_plans on delete cascade, kind in ('schedule','confirm'), cycle_on date, …)`, `unique (plan_id, kind, cycle_on)`        |
| Exam names       | **stay out** of subject, body and logs (same rule as S-04/S-06); email carries counts, a `/dashboard` link and the opt-out link                                        |
| Opt-in copy      | update `profile.reminders.heading`/`disclosure` (pl, en): it still describes appointment emails only, which S-06 already outgrew                                       |

## Detailed Findings

### Data the nudges read

- `screening_plans`: `appointment_date date` nullable ("planned, no date yet" = FR-011 state), `created_at`,
  `updated_at` (trigger), `unique (user_id, catalog_slug)`, no status column
  (`20260930093108_screening_records.sql:11-32`). The table comment names `created_at` as the FR-011 "selected at" (`:24-25`).
- Clients cannot write `created_at`/`updated_at`: grants cover only `catalog_slug`, `appointment_date` (`:171-172`).
- A plan is created/updated by an upsert on `user_id,catalog_slug` (`src/pages/api/screenings.ts:122-131`), so
  `created_at` survives an edit and `updated_at` moves on every upsert (the trigger fires on each UPDATE). Inferred
  from the upsert shape and trigger; no test asserts `created_at` survival.
- Selecting without a date is allowed (`src/lib/screenings/rules.ts:127-128`); a date must be today … today + 2 years
  (`rules.ts:130`), so a past-dated plan can be re-dated only into the future.
- Confirm: `confirm_screening_plan(p_slug)` deletes the plan when `appointment_date <= today` (Warsaw) and upserts the
  completion (`20261005173653_confirm_screening_plan.sql:38-74`). S-04 ledger rows cascade (`:32-33`). Completion RLS
  requires an active catalog entry, so a plan on a retired entry cannot be confirmed (`:31-37`, S-03 write policies
  `screening_records.sql:76-110`).
- Dashboard: `awaitingConfirmation = date !== null && date <= today` (`rules.ts:255`), rendered with confirm actions
  in `PlanItem.astro:50-61`. The confirm prompt already shows on the appointment day. Plans on retired entries are
  still shown (`src/pages/dashboard.astro:45-50`).

**Anchor pitfall (FR-011).** On a passed plan the change-date field starts empty
(`src/components/recommendations/ScreeningActions.astro:38-40`); submitting it turns the plan into an undated one that
keeps its original `created_at`. Counting FR-011 from `created_at` would nudge that user on the next run, the day after
they acted. Counting from `updated_at` (Warsaw date) avoids it: for an undated plan, `updated_at` is when it was
selected or last re-saved without a date, both of which are "the user just touched this plan". Recommendation: anchor
on `(updated_at at time zone 'Europe/Warsaw')::date` and store it as `cycle_on`; update the table comment at
`screening_records.sql:24-25` in the S-07 migration (`comment on table` is additive).

### The pipeline S-07 plugs into

- Cron `"0 8,9 * * *"`; only the 10:00 Warsaw run sends (`src/lib/schedule.ts:8-15`), each job checks
  `isDailySendRun` itself (`src/lib/reminders/appointment.ts:38`, `due-screening.ts:35`).
- `scheduled()` runs the heartbeat and `runReminderChain` with `Promise.allSettled` (`src/worker.ts:20-43`).
- `runReminderChain` (`src/lib/reminders/chain.ts:27-59`): appointment first; budget `max(0, 93 − sent)` (`:34-36`);
  appointment failure → budget 0 (`:33,37-39`); due runs always (`:41-45`); one error event + one alert per failed
  job, first failure rethrown redacted (`:47-58`).
- Two-job assumptions to widen: `ReminderChainDeps` fixed `appointment`/`due` fields and `due: … Promise<unknown>`
  (`chain.ts:13-19`), `ReminderJob` union and `JOB_LABEL` (`src/lib/observability.ts:27-33`), `worker.ts:24-28`,
  `chain.test.ts` (asserts order `["appointment","due"]`), `observability.test.ts:18`, the admin-client header
  ("five reminder functions", `src/lib/reminders/admin-client.ts:5-8`), README run-log note (~`README.md:303`).
- S-04 job: single definer `claim_due_appointment_reminders(p_today, p_lead_days, p_limit)` inserts ledger rows
  `on conflict do nothing` and returns one row per user with email, locale and ids, re-checking opt-in, consent and
  date (`20260930125726_appointment_reminders.sql:76-135`); `mark_appointment_reminders_sent` (`:138-153`).
  `APPOINTMENT_REMINDER_LEAD_DAYS = 3` (`appointment.ts:22`).
- S-06 job: candidates RPC + TS rules + claim(items) + mark (`src/lib/reminders/due-screening.ts`,
  `20261006155313_due_screening_reminders.sql:87-248`), with `DUE_CANDIDATE_LIMIT = 50` for the 10 ms CPU cap
  (`src/lib/screenings/due.ts:13`; decisions in `context/archive/2026-10-06-due-screening-reminder/decisions.md`).
  S-07 needs no TS rule step, so the S-04 shape (one claim, one mark) is the one to copy; its CPU is email-building and
  one SHA-256 batch key, like S-04.
- Reusable as is: `sendEmailBatch` with dry-run and one 429 retry (`src/lib/email.ts:69`, `src/lib/email-retry.ts:21-32`),
  `batchKey(prefix, ids)` (`src/lib/reminders/batch-key.ts:2-7`), `createReminderClient`, `ReminderDatabaseError`,
  `warsawToday` (`rules.ts:55-64`), `errorName`/`errorDetails`, the `{ outcome, sent }` return and `budget` option.
- Opt-in gate: `profiles.reminders_enabled` (+ `reminders_locale`, `reminders_enabled_at`)
  (`20260930125726_appointment_reminders.sql:9-15`), checked with an active consent in every claim/candidate function
  (`:102-108,121-133`; due `sql:128-132,182,211`). Roadmap: "opt-in must gate every send, including the later
  S-06/S-07 messages" (`roadmap.md:248`).

### Budget and quota

- `REMINDER_EMAIL_DAILY_BUDGET = 93`, justified as 31 × (93 + 1 heartbeat + up to 2 failure alerts) = 2,976 ≤ 3,000/month
  and ≤ 100/day (`src/lib/email-budget.ts:5-9`). The appointment claim takes up to 93 itself and takes no budget
  argument (`appointment.ts:47`).
- One alert per failed job, keyed by job (`observability.ts:194`, `src/lib/failure-alert.ts:13-49`). A third job makes
  3 possible alerts: 31 × (93 + 1 + 3) = 3,007 > 3,000. With 92: 31 × (92 + 1 + 3) = 2,976. Hence the 93 → 92 change
  (the appointment claim limit follows the constant).
- Two jobs (separate S-07 jobs for FR-011 and FR-012) would mean 4 alerts: 31 × (93 + 1 + 4) = 3,038, and a fourth
  batch call per run — another reason for one combined nudge job.

### Per-user one-email-per-run (observed vs stated)

- Observed: each claim groups per user, so the rule holds **within** a job (`appointment sql:111-133`, due claim
  `sql:157-230`). Nothing de-duplicates **across** jobs: on the inspected path a user can receive an appointment email
  and a due email in the same run. The S-06 brief states "one email per user per run" (`archive/…due-screening-reminder/plan-brief.md:25`) without addressing this.
- Recommendation for S-07: the nudge claim excludes users with an `appointment_reminders` or
  `due_screening_reminders` row whose `sent_at` falls on this Warsaw day (both ledgers have `sent_at`:
  `appointment sql:59`, `due sql:21-22`). Nudges are not time-critical, so those users roll to tomorrow. The
  S-04/S-06 overlap stays as is (both are time-relevant and already shipped); flag it as an existing gap, not S-07
  scope.

### Threshold evidence

- PRD intent: FR-011 exists because "users may forget to return and enter the date" (`prd.md:108`); FR-012 because
  "if users forget, the recurrence logic (FR-009) never triggers and the loop silently breaks" (`prd.md:119`).
- External (organised screening programmes, the closest analogue of "selected but not booked"):
  - Canadian breast-screening programmes send a reminder letter **3 weeks** after the invitation if no appointment is
    scheduled ([CPAC, Breast screening in Canada 2021/22](https://www.partnershipagainstcancer.ca/topics/breast-cancer-screening-in-canada-2021-2022/correspondence-follow-up/normal-mammogram/)).
  - Colorectal mailed-outreach trials follow up at **4 weeks** ([NCT02584998](https://clinicaltrials.gov/study/NCT02584998))
    or **6 weeks** (SMS vs letter reminder, [JMIR mHealth 2025](https://doaj.org/article/aec4a64be0b0465a86043b84395b3f6e)).
  - A breast-screening reminder trial sent the reminder about **2 weeks** after the invitation (+4 pp attendance,
    68.2% vs 64.2%; [BJC 2015](https://link.springer.com/10.1038/bjc.2015.451)).
- Booking friction in Poland is low for the main programmes: NFZ mammography needs no referral and online booking
  shows slots up to 90 days ahead ([pacjent.gov.pl](https://pacjent.gov.pl/print/pdf/node/2018)), so two weeks is
  enough time to book a date.
- **FR-011 → 14 days.** Dbam users chose the exam themselves, a stronger intent than an unsolicited invitation, and
  that intent fades. 14 days sits at the short end of the 2–6 week range above, covers two weekends, and avoids
  nagging someone who books within the week. One nudge per undated cycle (no repeat), consistent with S-06's "no
  repeats" (`archive/…due-screening-reminder/decisions.md:27`).
- **FR-012 → 7 days.** The dashboard asks for confirmation from the appointment day itself (`rules.ts:255`), and S-04
  already emailed 1–3 days before the appointment (`appointment.ts:22`). A week lets users who return on their own
  confirm without an email, and still comes soon enough that they remember attending. Confirming needs only the
  attendance, not the results. One follow-up per (plan, appointment date), no repeat; the dashboard keeps the prompt.
- Thresholds as exported constants passed to the claim as parameters, like `p_lead_days`:
  `SCHEDULE_NUDGE_AFTER_DAYS = 14`, `CONFIRM_NUDGE_AFTER_DAYS = 7`.

### Ledger and claim design

- Table `follow_up_nudges`: `id`, `plan_id bigint not null references screening_plans(id) on delete cascade`,
  `user_id`, `kind text check (kind in ('schedule','confirm'))`, `cycle_on date` (FR-011: Warsaw date of the plan's
  `updated_at` at claim time; FR-012: `appointment_date`), `created_at`, `sent_at`;
  `unique (plan_id, kind, cycle_on)`.
  - Cascade with the plan, like S-04 (`appointment sql:52-61`): unplan, confirm, mark done and consent withdrawal all
    delete the plan and so its nudge rows.
  - A re-dated passed plan gets a new `appointment_date`, so a new confirm cycle; an undated plan re-saved without a
    date gets a new `cycle_on`, so a new schedule cycle (at most one nudge per 14 days of inaction after each user
    action).
  - RLS on, no policies, `revoke all` (plus truncate/trigger/references/maintain) from anon, authenticated and
    service_role, as S-06 does (`due sql:42-54`); the global guard at
    `supabase/tests/database/appointment_reminders.test.sql:102-116` fails otherwise.
- `claim_follow_up_nudges(p_today date, p_schedule_after int, p_confirm_after int, p_limit int)`, security definer,
  `search_path = ''`, cron-only (granted to service_role only), same structure as S-04's claim:
  - insert candidates `on conflict do nothing`: opted in, active consent, has an email, catalog entry active;
    `schedule`: `appointment_date is null and updated_at::date (Warsaw) <= p_today − p_schedule_after`;
    `confirm`: `appointment_date <= p_today − p_confirm_after`;
  - exclude users with an S-04/S-06 ledger row sent this Warsaw day;
  - return unsent, still-valid rows grouped per user (email, locale, ids, schedule count, confirm count), ordered
    confirm-first then `md5(user_id || p_today)`, limited to `p_limit` users.
  - Insert only for users that fit the limit (or insert all and return a limited set; S-04 inserts all and returns
    all, which is fine there because its limit is the whole budget). Plan to decide; either keeps unsent rows for the
    next run.
- `mark_follow_up_nudges_sent(p_ids bigint[])` as S-04 (`appointment sql:138-153`).
- Batch key prefix `dbam-follow-up-nudge`.

### Email content

- No exam names: stated for S-04 and S-06 (`appointment.ts:17-19`, `due-screening.ts:21-22,112`; SQL comments
  `appointment sql:79-80`, `due sql:162`) and rooted in GDPR Art. 9 health data going through the email provider and
  inbox previews. Keep it: subject and body give counts ("1 exam is waiting for an appointment date", "please confirm
  1 past appointment"), `t.plural()` keys, a `/dashboard` link (plans list there with confirm actions) and the
  `/profile#reminders` opt-out link. No slug anchors (`#screening-<slug>`, `PlanItem.astro:37`) in links, since a slug names the exam.
- Locale from `coalesce(reminders_locale, 'pl')`, `resolveLocale`/`createT` (as both jobs).

### Opt-in copy is stale

- `profile.reminders.heading` = "Appointment reminders" / "Przypomnienia o wizytach" and the disclosure promises "one
  email 1–3 days before each appointment date" (`src/i18n/en.ts:203-205`, `src/i18n/pl.ts:207-208`). S-06 already
  sends a second email type; S-07 adds a third. Since opt-in "gates every send" (`roadmap.md:248`), the disclosure
  should describe all three (still: never the exam name, Resend, turn off any time). This is copy only; no new
  consent column.

## Code References

- `supabase/migrations/20260930093108_screening_records.sql:11-32,171-172` — plans table, FR-011 state, grants
- `supabase/migrations/20261005173653_confirm_screening_plan.sql:38-74` — confirm deletes the plan
- `supabase/migrations/20260930125726_appointment_reminders.sql:9-15,52-61,76-153` — opt-in, S-04 ledger, claim/mark (pattern to copy)
- `supabase/migrations/20261006155313_due_screening_reminders.sql:12-54` — S-06 ledger and revokes
- `src/lib/reminders/chain.ts:13-59` — job order, budget, alerts
- `src/lib/reminders/appointment.ts:22,38-100` — S-04 job and email
- `src/lib/reminders/due-screening.ts:35-127` — S-06 job and email
- `src/lib/email-budget.ts:5-9` — budget and quota math
- `src/lib/observability.ts:27-33,194` — `ReminderJob`, alert key
- `src/worker.ts:20-43` — scheduled wiring
- `src/lib/screenings/rules.ts:55-64,127-130,255` — `warsawToday`, plan form, `awaitingConfirmation`
- `src/components/recommendations/ScreeningActions.astro:38-40` — empty date on passed plans (anchor pitfall)
- `src/i18n/en.ts:203-205`, `src/i18n/pl.ts:207-208` — opt-in copy

## Architecture Insights

- Every reminder is "definer claim → one Resend batch → definer mark", ledger rows with `sent_at` null retry next run,
  batch key = SHA-256 of ledger ids so a retried run is deduplicated by Resend.
- Ledgers die with their source row (plan or completion) so withdrawal needs no extra code.
- Selection logic in SQL when it is SQL-expressible (S-04); TS only when it needs the catalog rules (S-06). S-07 is
  the S-04 case.

## Historical Context (from prior changes)

- `context/archive/2026-09-30-record-appointment-date/plan-brief.md:34` — an undated plan is the FR-011 state from day one (supported by the schema).
- `context/archive/2026-10-05-confirm-exam-and-recurrence/plan-brief.md:29` — "S-07 finds unconfirmed appointments as plans dated before today" (supported: confirm deletes the plan).
- `context/archive/2026-10-06-due-screening-reminder/decisions.md:27,31` — "S-07 covers nudges"; appointments keep priority, later jobs use the rest of the budget (supported by `chain.ts`).
- `context/archive/2026-10-06-due-screening-reminder/plan-brief.md:25` — "one email per user per run" (partial: true per job, not across jobs).
- `context/archive/2026-09-30-appointment-reminder/plan-brief.md:24` — 1–3 days lead time rationale.

## Related Research

- `context/archive/2026-10-06-due-screening-reminder/research.md`
- `context/archive/2026-09-30-appointment-reminder/research.md`

## Open Questions

None that block planning; all of the above are recommendations for the orchestrator. Notes for `/10x-plan`:

- Production CPU: the nudge job does SQL work plus email building and one hash; the existing perf test covers the due
  job only (`src/lib/screenings/due.perf.test.ts`). A production Workers Logs CPU check fits the PR's manual list.
- Launch backlog: on the first run every existing undated plan older than 14 days and every plan dated ≥ 7 days ago
  qualifies at once; the budget caps it and the rest roll over (no special handling needed at current user numbers).
- S-04/S-06 cross-job overlap (above) is pre-existing; a follow-up note is enough.
