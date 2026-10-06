---
date: 2026-10-06T17:33:28+02:00
researcher: Claude (Opus 5.5, worker session)
git_commit: ce431456bed10820e2a849a7551cef9ce0a136b4
branch: feat/due-screening-reminder
repository: 10xdevs (worktree feat-due-screening-reminder)
topic: "S-06 due-screening reminder: how to email an opted-in user when a screening becomes due, reusing the S-04 job"
tags: [research, reminders, cron, recurrence, catalog, observability, supabase]
status: complete
last_updated: 2026-10-06
last_updated_by: Claude (Opus 5.5, worker session)
---

# Research: S-06 due-screening reminder

**Date**: 2026-10-06T17:33:28+02:00
**Researcher**: Claude (Opus 5.5, worker session)
**Git Commit**: ce431456bed10820e2a849a7551cef9ce0a136b4
**Branch**: feat/due-screening-reminder
**Repository**: 10xdevs

## Research Question

What does the codebase already provide for S-06 ("an opted-in user receives an email when a screening becomes due —
including when a confirmed exam's repeat interval elapses — without re-entering the exam"), and what constrains the
design? Constraints from the request: reuse the S-04 reminder job and Resend path (`src/lib/reminders/*`, admin
client), log failures with F-07 error events, no health data in logs or URLs (B-01), and the F-02 scheduled-run CPU
cap.

## Summary

- **"Due" exists only in TypeScript, never in the database.** Eligibility (`recommend`, `src/lib/catalog/recommend.ts:103`),
  the per-profile interval (`resolveInterval`, `:82-90`) and the due-again rule (`nextDueMonth`/`partitionDashboard`,
  `src/lib/screenings/rules.ts:172-177,219-285`) are pure functions; S-05 decided not to store a due date
  (`context/archive/2026-10-05-confirm-exam-and-recurrence/plan-brief.md:76` — "S-06 still has to choose how its cron
  gets next due dates (store vs. SQL interval resolution with overrides)"). This choice is the central design decision
  for the plan.
- **The cron cannot read user data directly.** `service_role` has every privilege revoked on `profiles`, consents,
  plans and completions (`supabase/migrations/20260930125726_appointment_reminders.sql:167-168`); a pgTAP guard fails
  if any non-catalog public table grants it SELECT/INSERT/UPDATE/DELETE/TRUNCATE
  (`supabase/tests/database/appointment_reminders.test.sql:102-116`). S-04 reaches data only through two
  `SECURITY DEFINER` functions executable by service_role (`claim_due_appointment_reminders`,
  `mark_appointment_reminders_sent`, migration `:81-159`). S-06 needs the same shape: a claim function plus a ledger
  table that revokes service_role.
- **Due precision is a month.** A completion is due again from the 1st of `nextDueMonth` (`rules.ts:172-177,265`);
  the exact `last_done_on` day is ignored. So every interval that elapses in a month elapses on the same day — the
  1st — which is the concrete form of the roadmap's "same dates" risk.
- **The binding volume limit is Resend's free quota, not only CPU.** Resend free: 100 emails/day, 3,000/month
  (`context/archive/2026-09-30-appointment-reminder/research.md:59`); a batch holds ≤100 emails (`src/lib/email.ts:12-13`)
  and S-04 claims ≤100 users per run (`src/lib/reminders/appointment.ts:52-56`). Workers Free: 10 ms CPU per cron
  invocation, 50 subrequests (F-02 `research.md:40`; confirmed in [Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/));
  network waits don't count as CPU. S-04 uses 4 of 50 subrequests per run (S-04 `plan.md:461`).
- **Reuse points are clear; two need generalizing.** The run gate (`isDailySendRun`), admin client, `sendEmailBatch`,
  ledger+claim+mark pattern, Resend idempotency key and the "no exam name in email/subject/logs" rule all carry over.
  The failure alert and its event are hard-coded to `"appointment-reminder"` (`src/lib/observability.ts:26`,
  `src/worker.ts:34`), so a third job needs them generalized.

## Detailed Findings

### S-04 job (the reuse target)

- Wiring: `wrangler.jsonc` has one trigger `"0 8,9 * * *"`; `src/worker.ts:17-42` runs `runHeartbeat` and
  `runAppointmentReminders` via `Promise.allSettled`, logs one `buildCronErrorEvent` per failure, emails the owner only
  when the failed job is `appointment-reminder` (`:34-36`), then rethrows `redactError(failures[0])` (`:40`).
- Run flow (`src/lib/reminders/appointment.ts:37-88`): skip unless `isDailySendRun` (10:00 Warsaw, `src/lib/schedule.ts:13-15`);
  one RPC `claim_due_appointment_reminders(p_today=warsawToday(scheduledTime), p_lead_days=3, p_limit=100)` returning
  one row per user (email, locale, `reminder_ids[]`, `appointment_dates[]`); one `sendEmailBatch`; then
  `mark_appointment_reminders_sent(ids)`. No per-user loop in the Worker (S-04 `research.md:192`: a per-user loop does
  not fit the limits).
- Dedup: ledger `appointment_reminders` with `unique (plan_id, appointment_date)` and nullable `sent_at`
  (migration `:52-61`); claim inserts `on conflict do nothing` then returns unsent rows (`:99-133`). Resend
  `Idempotency-Key` = `dbam-appointment-reminder:` + SHA-256 of sorted ids (`appointment.ts:111-116`); Resend keys
  expire after 24 h, so the ledger is the real guard (S-04 `plan-brief.md:30`). `EMAIL_DRY_RUN` marks nothing (`:71-75`).
- Opt-in gate, enforced in SQL: `profiles.reminders_enabled` (default false), a non-withdrawn
  `health_data_consents` row, non-null `auth.users.email` (migration `:12-19,102-108,121-129`). S-04 planned that S-06/S-07
  reuse this same gate (S-04 `plan.md:45`).
- Email: plain text from `buildMessage` (`appointment.ts:90-108`), locale from `reminders_locale`, keys
  `email.appointmentReminder.*` (`src/i18n/en.ts:297-304`, `pl.ts`), links to `/dashboard` and `/profile#reminders`.
  Emails, subjects and logs never name an exam (`appointment.ts:15-16`).
- Recipient: the appointment job sends to the real account email (`appointment.ts:107`); `REMINDER_TEST_TO` is used
  only by the heartbeat and failure alert (`src/lib/failure-alert.ts:18`). The planned `REMINDER_ALLOWED_TO` allowlist
  was dropped before S-04 merged (commit d85fe14).

### Due computation (what S-06 must evaluate)

- `recommend(entries, profile, currentYear, locale)` (`recommend.ts:103-142`): age = `currentYear - birth_year`; only
  active entries with `reviewed_by` count (`:114`); a branch with an uncollected factor is "unknown" → `maybe`, not a
  tier. `locale` only affects sort order, so any locale works for a due check.
- `resolveInterval` (`:82-90`): only `interval_kind = "fixed"` yields months; the first matching `interval_overrides`
  entry wins. Of the 19 active catalog entries inspected in `catalog/entries/*.json`, 8 are `fixed`; 5 of those 8 have
  overrides keyed on `age_min` (blood pressure, Moje Zdrowie) or factors (cervical: immunosuppression; diabetes: bmi,
  hypertension…; eye exam: diabetes). The other 11 (`per_program`, `no_known_interval`, `shared_decision`) never become
  due again on their own.
- `anchorMonth` = `last_done_month ?? warsawMonth(updated_at)` (`rules.ts:164-166`); `nextDueMonth` = anchor + months
  as `YYYY-MM-01`, or null (`:172-177`). In `partitionDashboard`, a completion with a plan for the same slug is skipped
  (`:257,263`); `nextDue === null || nextDue > currentMonth` stays "done", otherwise it is due again and returns to its
  tier (`:265-279`).
- Cases for "becomes due" (inferred from the code above):
  - Confirmed exam / done with month: due from `last_done_month + interval`.
  - Done with "don't know": anchors on the month of `updated_at`.
  - Never done but eligible: no date exists; it is in its tier from the start. "Becoming due" there means becoming
    eligible (age threshold on a year change, profile edit, catalog change). The PRD Success Criterion reads "receives
    an opt-in reminder when a screening becomes due" (`context/foundation/prd.md:32`); US-03 acceptance is about the
    interval elapsing (`prd.md:73-86`). Whether first-time eligibility is in scope is a product decision.
  - Only exams the user is currently recommended reappear on the dashboard (a due-again completion shows only via
    its tier item, `rules.ts:275-279`); a due-again completion whose entry is no longer recommended is in neither list.
- Purity: `rules.ts` and `recommend.ts` take no Astro locals, I/O or i18n; "now" is a `Date` parameter. The dashboard
  passes `now.getFullYear()` (runtime/UTC year, `src/pages/dashboard.astro:52`), not the Warsaw year — a cron should
  derive the year from Warsaw time.
- Inputs a TS evaluation needs per user: the profile factor columns (birth_year, sex, smoking fields; `Profile` is the
  full row, `src/lib/profile.ts:29`), all plans' slugs, completions (`last_done_month`, `updated_at`), and the catalog
  (`getActiveCatalog`, `src/lib/catalog/read.ts:33`; the catalog stays readable by service_role).

### Design options surfaced by the evidence (for /10x-plan to decide)

1. **Port due evaluation to SQL** (claim function computes interval with overrides and the due month). Keeps the
   set-based S-04 shape and Worker CPU near zero, and no health data leaves Postgres. Cost: a second implementation of
   `resolveInterval` overrides (age and factor conditions) that must stay in step with the TS rules and catalog schema;
   F-08 tests cover only the TS side.
2. **Store `next_due_month` at write time** (done/confirm paths compute it in TS). Simple claim query. Cost: the stored
   value goes stale when the profile changes the override (e.g. turning 40 changes blood pressure from 36 to 12 months,
   or a factor edit), unless profile saves recompute it; first-time eligibility still has no date.
3. **Definer function returns per-user inputs, TS evaluates** (reuses `recommend`/`partitionDashboard` exactly). Single
   source of truth. Cost: health/profile rows flow to the Worker (not to logs), and Worker CPU grows per user against the
   10 ms cap — needs a per-run user cap/cursor.

Constraint common to all: a new ledger table (e.g. keyed per user+slug+due month) with RLS on and service_role revoked
(pgTAP guard), plus a pgTAP case for each new function/grant (CLAUDE.md Testing Guidelines).

### Volume and the "same date" risk

- Due dates cluster on the 1st of each month (month precision). With Resend free at 100/day shared with appointment
  reminders, more than ~100 due users on one day cannot all be emailed that day. S-04's answer was "served over following
  days while their dates stay in the window" (S-04 `plan.md:461`); for S-06 a due state persists until acted on, so a
  ledger that only records sends naturally spreads overflow over following days if the claim is capped and ordered.
- Whether batch emails count per email toward the daily quota is not stated by Resend; S-04 assumed they do
  (S-04 `research.md:158`). Rate limit is 10 req/s per team ([Resend quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits)).
- Subrequests: adding a third job adds about 3 (claim, batch send, mark) to S-04's 4, well under 50.

### Observability and privacy (F-07, B-01)

- `src/lib/observability.ts`: events carry names/short tokens only (`TOKEN` regex `:21`), detail whitelist
  `operation, step, code, status, resendError` (`:24`); `buildCronErrorEvent` (`:79-100`), `redactError` (`:114-152`),
  failure email builder (`:155-185`). `REMINDER_JOB = "appointment-reminder"` (`:26`) and the alert subject (`:181`) are
  hard-coded; `worker.ts:34` fires the alert only for that job.
- Lessons (`context/foundation/lessons.md`, "Grep gates are heuristics"): the privacy gate for a new output path is a
  case in `src/lib/observability.test.ts` feeding leaky input, not a grep.
- B-01 (`context/foundation/backlog.md:16-22`): slug in redirect URLs may sit in Workers Logs. S-06 emails link to
  `/dashboard` without a slug, as S-04 does; adding a slug or exam name to links, subjects or log lines would extend
  B-01. B-02 (F-07 production checks) and B-09 (Workers Logs volume after S-06/S-07) are open and owner-side.

## Code References

- `src/worker.ts:17-42` — scheduled() entry, job list, failure handling
- `src/lib/reminders/appointment.ts:37-120` — S-04 claim → batch → mark job, message builder, idempotency key, log line
- `src/lib/reminders/admin-client.ts:14-22` — service-role client
- `src/lib/email.ts:12-13,65-101` — `MAX_BATCH_SIZE`, `sendEmailBatch`
- `src/lib/schedule.ts:6-15` — `DAILY_CRON`, `isDailySendRun`
- `src/lib/catalog/recommend.ts:82-142` — `resolveInterval`, `recommend`
- `src/lib/screenings/rules.ts:164-285` — `anchorMonth`, `nextDueMonth`, `partitionDashboard`
- `src/lib/observability.ts:21-26,79-190` — tokens, whitelist, cron event, redaction, failure email
- `supabase/migrations/20260930125726_appointment_reminders.sql:12-19,52-70,81-168` — opt-in columns, ledger, claim/mark, revokes
- `supabase/migrations/20260930093108_screening_records.sql:11-51` — plans and completions
- `supabase/tests/database/appointment_reminders.test.sql:102-135` — service_role guard and grant checks

## Architecture Insights

- Selection is set-based in SQL; the Worker only formats and sends. Any S-06 option that loops per user in the
  Worker departs from the S-04 pattern and needs an explicit CPU budget.
- service_role reaches user data only through definer functions; new tables revoke it (CLAUDE.md hard rule).
- Business rules are pure TS with injected "now", covered by Vitest (F-03, F-08).

## Historical Context (from prior changes)

- `context/archive/2026-10-05-confirm-exam-and-recurrence/plan-brief.md:76` — S-06 must pick store vs. SQL resolution (supported, still open).
- `context/archive/2026-09-30-appointment-reminder/plan.md:45,461` — S-06 reuses the opt-in gate; ≤100 users per run, "S-06 will revisit" volumes (supported).
- `context/archive/2026-09-29-reminder-dispatch-path/research.md:39-42` — Workers Free enough for F-02 but not S-04/S-06 at scale; 10 ms CPU, 50 subrequests (supported; limits re-checked against Cloudflare docs).
- `context/archive/2026-10-06-recurrence-unit-tests/` — F-08 pinned `rules.ts` behaviour for S-06; follow-up B-04 (plan with missing catalog entry hides its screening) is open.

## Related Research

- `context/archive/2026-09-30-appointment-reminder/research.md`
- `context/archive/2026-10-05-confirm-exam-and-recurrence/research.md`
- `context/archive/2026-09-29-reminder-dispatch-path/research.md`

## Open Questions

1. Due-date source: SQL port, stored `next_due_month`, or TS evaluation over definer-returned inputs (see options).
2. Scope: does "becomes due" include first-time eligibility (never-done tier items), or only elapsed intervals of done/confirmed exams?
3. Cadence: one email per (user, slug, due month), or one digest per user per run; any repeat if the user does not act?
4. Overflow policy when more than the per-run cap (and Resend's 100/day, shared with S-04) are due on the same day.
5. Should a due-again exam that is no longer recommended for the current profile be reminded? (The dashboard does not show it.)
