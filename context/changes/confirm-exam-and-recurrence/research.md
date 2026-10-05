---
date: 2026-10-05T19:22:19+02:00
researcher: Claude (Opus 5.5) for Amadeusz Kozlowski
git_commit: 55df112dc1e102ac5f1bf1acce0e4169ebde551a
branch: main
repository: amakoz/dbam
topic: "S-05 confirm-exam-and-recurrence: what exists today and where confirming a past appointment plugs in"
tags: [research, codebase, screening-plans, screening-completions, dashboard, recurrence, reminders]
status: complete
last_updated: 2026-10-05
last_updated_by: Claude (Opus 5.5)
---

# Research: S-05 confirm exam and recurrence

**Date**: 2026-10-05T19:22:19+02:00
**Researcher**: Claude (Opus 5.5) for Amadeusz Kozlowski
**Git Commit**: 55df112dc1e102ac5f1bf1acce0e4169ebde551a
**Branch**: main
**Repository**: amakoz/dbam

## Research Question

For roadmap slice S-05 (`confirm-exam-and-recurrence`; PRD US-03, FR-008, FR-009; issue #23), what do the data layer, endpoint and dashboard already do for plans, completions and recurrence, which prior decisions constrain the slice, and where would "confirm the exam happened on its recorded appointment date" plug in?

## Summary

- **Most of US-03 already shipped in S-03.** Marking an exam done (optional month/year) converts a plan into a completion, hides the exam until `last_done_month + interval` and returns it to its tier afterwards. Exams with no fixed interval stay in "Done" with a "no set interval" note instead of being dropped (`src/lib/screenings/rules.ts:163-176,248-258`, `src/components/recommendations/DoneItem.astro:47-52`). Issue #23 records this narrowing. The roadmap S-05 body (`context/foundation/roadmap.md:177`) still lists those outcomes and is stale.
- **What S-05 actually adds:** a "passed appointment" state and a one-click confirm that uses the plan's own `appointment_date`. Today a plan whose date has passed renders exactly like a future plan (`src/components/recommendations/PlanItem.astro:47-51`). On this inspected path nothing in `rules.ts` or `PlanItem.astro` compares the plan date with today. Its re-date form prefills the past date with `min=today`, so the browser blocks resubmitting it unchanged (inferred from HTML `min`, not tested; `ScreeningActions.astro:77-87`).
- **Closest existing path:** the `done` branch of `POST /api/screenings` upserts the completion and then deletes the plan as two separate PostgREST calls, not atomically (`src/pages/api/screenings.ts:108-124`). Deleting the plan cascades its S-04 reminder ledger rows (`supabase/migrations/20260930125726_appointment_reminders.sql:54`).
- **Precision gap:** completions store a month only. A CHECK constraint forces `last_done_month` to be the first day of a month (`supabase/migrations/20260930093108_screening_records.sql:48-50`). Confirming a plan dated 2026-10-20 can only store 2026-10-01 unless S-05 adds a column (issue #23 anticipates "an exact-date column additively"). Due-again is evaluated per month (`nextDue > currentMonth`, `rules.ts:254`), so month truncation does not change when the exam reappears on the dashboard.
- **Next due is computed, not stored.** It is calculated in TypeScript at render time from the current profile via `resolveInterval` (`rules.ts:171-176`, `src/lib/catalog/recommend.ts:82-90`). S-06's cron can only reach data through security-definer SQL (`SUPABASE_SECRET_KEY` has no table privileges; `20260930125726_appointment_reminders.sql:167-168`). So whether S-05 stores a next-due value is the main decision it hands to S-06.
- **Intervals:** 8 of the 19 active catalog entries are `fixed`. The other 11 active entries have no computable interval: 4 `no_known_interval`, 6 `per_program`, 1 `shared_decision` (counted from `catalog/entries/*.json` on this commit; the 1 draft entry is `fixed`).

## Detailed Findings

### Data layer

- `screening_plans` (`supabase/migrations/20260930093108_screening_records.sql:11-21`):
  - One row per (user, exam) (`UNIQUE (user_id, catalog_slug)`, :20).
  - `appointment_date date`, nullable. Null means planned with no date.
  - No CHECK on the date, so a past date persists once it passes.
  - Indexed on `appointment_date` (:32).
- `screening_completions` (:38-51):
  - One row per (user, exam) (:46).
  - `last_done_month date`, nullable. Null means "don't know", and due-again then counts from the Warsaw month of `updated_at` (`rules.ts:163-165`).
  - CHECK first-of-month (:48-50).
- RLS (:68-164), the same for both tables:
  - Select and delete: own rows.
  - Insert and update: own rows, plus an active `health_data_consents` row, plus a catalog entry with `status='active'`.
  - Column grants (:169-186) let `authenticated` write only `catalog_slug` and the date column.
  - Timestamps are server-owned via `set_updated_at` (:27-29, :57-59).
- No SQL function or trigger links plans and completions. The only definer function in that migration is `withdraw_health_data_consent()` (:194-216), which deletes both tables. Any new health-data column or table must also be cleared there.
- S-04 ledger `appointment_reminders` (`20260930125726_appointment_reminders.sql`):
  - `plan_id` FK, `on delete cascade` (:54).
  - `UNIQUE (plan_id, appointment_date)`.
  - All privileges revoked from anon, authenticated and service_role (:68-70).
  - `claim_due_appointment_reminders` selects plans with `appointment_date` in `(today, today + lead]` (:103). A plan whose date has passed is therefore never claimed, whether it is kept or deleted.
  - The lead is 3 days (`src/lib/reminders/appointment.ts:18`).
- pgTAP:
  - `supabase/tests/database/screening_records.test.sql` (57 tests): consent gate, active-entry gate, uniqueness, the first-of-month CHECK, forged fields, cross-user isolation, grants, withdrawal.
  - `supabase/tests/database/appointment_reminders.test.sql` (66 tests): includes the `service_role` guard over all `public` tables (:102-116) and the plan-delete cascade.
- Types: `src/lib/database.types.ts:219-289` (both tables), :293-308 (functions). `rules.ts:20-21` aliases the Row types.

### Recurrence logic (TypeScript, `src/lib/screenings/rules.ts`)

- The rules are pure. `now` is passed in, and "today" and the current month are Warsaw calendar values.
- `anchorMonth` (:163-165) returns `last_done_month`, or `warsawMonth(updated_at)` when that is null.
- `nextDueMonth` (:171-176) returns `addMonths(anchor, months)` (`YYYY-MM-01`) for a `months` interval, and null otherwise.
- `partitionDashboard` (:216-274):
  1. Plans come first, dated before undated (:236-245).
  2. A completion with a plan for the same slug is skipped (:252).
  3. A completion goes to "Done" when `nextDue === null || nextDue > currentMonth`. Otherwise it returns to its tier with a "last done" line (:253-258).
- The interval is resolved against the current profile and age (`recommend.ts:82-90`), with overrides: the first match wins (`src/lib/catalog/factors.ts:16-17`).
- `parsePlanForm` (:114-125) accepts dates from Warsaw today to today + 2 years, both inclusive. It rejects past dates with `invalid_appointment_date`.
- `parseDoneForm` (:137-153) takes month and year, both blank or both set, between January of the birth year and the current month.
- Inconsistency, not specific to S-05: `recommend()` receives `now.getFullYear()` (runtime year, not Warsaw) at `src/pages/dashboard.astro:60` and `src/pages/api/screenings.ts:90`. It only matters around New Year.

### Endpoint (`src/pages/api/screenings.ts`)

- Intents: `plan | unplan | done | undone` (:13). Re-dating a plan is `plan` again (an upsert).
- The redirect shape follows the CLAUDE.md non-auth convention:
  - Errors: `fail(code)` → `/dashboard?error=<code>&slug=<slug>#screening-<slug>` (:40-41).
  - Success: `/dashboard?saved=<intent>&slug=…` (:48).
  - Codes in use: `invalid_request`, `save_failed`, `invalid_appointment_date`, `invalid_done_date`, `screening_not_available`.
- Checks run in this order:
  1. `unplan` and `undone` skip consent and recommendation checks (:51-57).
  2. `plan` and `done` require completed onboarding (:61-70).
  3. The exam must be in the user's current tiers, otherwise `screening_not_available` (:84-93).
- Consequence of that last check: a plan whose exam has left the user's tiers, or whose entry was retired, cannot be marked done through the current path. RLS also blocks writes for retired entries.

### Dashboard UI

- All plain Astro with native `<form method=POST>`; there are no React islands on the dashboard.
- `PlanItem.astro`:
  - Shows the date or `noDate` (:47-51).
  - Embeds `ScreeningActions` in planned mode (:53-61) and an `unplan` form (:63-70).
  - Exposes `data-plan data-slug data-appointment` for smoke (:34-41).
- `ScreeningActions.astro`: a `<details>` panel with a plan form (date input, :69-95) and a done form (month/year selects, :97-126).
- `DoneItem.astro`: shows "Last done / Marked done in", plus "Due again: {month}" or `done.noInterval` (:47-52), and an `undone` form.
- `dashboard.astro`:
  - `SAVED_KEYS` (:100-105) and `INVALID_FIELDS` (:107-110) map intents to messages.
  - The success tone is hardcoded for `plan` and `done` (:123). A new intent needs entries in all three places.
  - The S-04 reminders hint (:73) and the status-line plan count (:159) include past-dated plans.
- `src/pages/dev/kitchen-sink.astro` renders `PlanItem`, `DoneItem` and `RecommendationItem` (:331-412). A new state should get a cell there.
- `scripts/ui-check.mjs:12-29` covers `dashboard.astro`, `kitchen-sink.astro` and `src/components/recommendations/*.{astro,ts}`, so every file S-05 touches in the UI is under the no-hardcoded-values rule.
- i18n:
  - Existing keys: `dashboard.screenings.{plan,done,saved}.*` (`src/i18n/pl.ts:136-164`, `src/i18n/en.ts:132-160`).
  - Error keys: `pl.ts:325-333`, `en.ts:321-329`.
  - There is no key for a passed appointment or for confirming one.

### Smoke coverage (`scripts/smoke.mjs:168-272`)

- Covers, for mammography: plan, plan rendering, reminders, saved banner, past-date rejection, draft-slug rejection, done, undone, done in January 2020 (due again), and an undated plan.
- No step covers a past-dated plan. The API rejects past dates, so a smoke step would need seeding.
- Seeding through the API is not possible without a test-only path; through the database it needs a privileged path, which smoke does not have today. Not investigated further.

## Code References

- `supabase/migrations/20260930093108_screening_records.sql:11-51` - plans and completions tables, first-of-month CHECK
- `supabase/migrations/20260930093108_screening_records.sql:68-186` - RLS policies and column grants
- `supabase/migrations/20260930093108_screening_records.sql:194-216` - withdrawal function (must clear any new health-data storage)
- `supabase/migrations/20260930125726_appointment_reminders.sql:52-70,81-135` - ledger table, cascade, claim window
- `src/pages/api/screenings.ts:13,84-93,108-124` - intents, tier check, done = upsert completion then delete plan
- `src/lib/screenings/rules.ts:114-176,216-274` - form parsers, anchor and next-due, dashboard partition
- `src/lib/catalog/recommend.ts:82-90` - `resolveInterval`
- `src/components/recommendations/PlanItem.astro:31-70` - plan row, no past-date branch
- `src/components/recommendations/ScreeningActions.astro:69-126` - plan and done forms
- `src/components/recommendations/DoneItem.astro:47-68` - due-again and no-interval display
- `src/pages/dashboard.astro:49-73,100-123,159` - data load, saved/invalid maps, hint, status count
- `scripts/smoke.mjs:168-272` - screening smoke steps
- `supabase/tests/database/screening_records.test.sql`, `appointment_reminders.test.sql:102-116` - pgTAP and the service_role guard

## Architecture Insights

- Health-data writes go through the user's own SSR client under RLS. The cron reads only through security-definer functions, because `service_role` is revoked on user tables. A value S-06 must read has to be reachable from SQL.
- Recurrence lives in pure TypeScript keyed on Warsaw calendar months. Intervals are resolved per render against the current profile, so a profile change (e.g. age crossing an override) moves next-due without any write.
- Writes favour "never lose the user's data" over atomicity: the completion is written before the plan is deleted.
- One row per (user, exam) with overwrite, and no history (S-03 decision).

## Historical Context (from prior changes)

- `context/archive/2026-09-30-record-appointment-date/plan.md:76`: S-03 explicitly excluded an exact-date confirm flow ("narrowed S-05"). Marking a plan done takes month/year like any other done.
- `context/archive/2026-09-30-record-appointment-date/plan.md:77-83`: S-03 decisions that still bind S-05:
  - No history.
  - No past-dated appointment entry.
  - No plans or done marks for "may apply" entries.
  - `recommend()` semantics unchanged.
- `context/archive/2026-09-30-record-appointment-date/plan.md:98`: "S-04/S-07 read plans; S-06 reads completions."
- `context/archive/2026-09-30-record-appointment-date/research.md:151-154`:
  - S-05 needs a record that can be marked confirmed, whose date becomes the last-done date.
  - S-06 needs the last confirmed date per (user, exam) readable by the cron.
  - S-07 (FR-012) needs the appointment date plus S-05's confirmed marker.
- `context/archive/2026-09-30-appointment-reminder/plan.md:36,44,461`: S-04 constraints S-06 inherits:
  - Workers Free: 10 ms CPU and 50 subrequests per run; S-04 uses 4 subrequests.
  - At most 100 users per run.
  - No exam names in email, subject or logs.
  - "S-06 will revisit" volumes.
- `context/archive/2026-09-30-appointment-reminder/research.md:131` and `context/archive/2026-09-27-onboarding-profile/follow-ups/review-fixes.md:11`: whether existing users must re-consent after a consent-text change is still undecided. This only matters if S-05 changes what data is stored or shared.
- `context/archive/2026-09-28-screening-catalog-v1/research.md:107`: the cervical interval depends on the type of the last test, which "S-05 introduces". The shipped entry is a fixed 60 months (`catalog/entries/cervical-screening-nfz-program.json:18-32`). S-05 records no test type, so this stays unmodelled.

Historical claims checked against current code:

| Claim                                                                                | Verdict                                                                                                                   |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Roadmap S-05 "reappears as due … no known interval is surfaced" (`roadmap.md:177`)   | Contradicted as S-05 scope: S-03 shipped it (`rules.ts:253-258`, `DoneItem.astro:47-52`). Supported as product behaviour. |
| Issue #23 title "Confirm or mark exam done"                                          | Partial: "mark done" shipped in S-03; "confirm" is open.                                                                  |
| PRD US-03 "a future recurrence reminder is scheduled automatically" (`prd.md:76-79`) | Partial: next due is computed and shown; the email is S-06 (#24).                                                         |

## Related Research

- `context/archive/2026-09-30-record-appointment-date/research.md`
- `context/archive/2026-09-30-appointment-reminder/research.md`
- `context/archive/2026-09-28-screening-catalog-v1/research.md`

## Open Questions

These are product and design choices for `/10x-plan`. None blocks planning, but each changes the contract.

1. **Exact date or month?** Truncate the confirmed date into `last_done_month` (no migration, dashboard behaviour identical) or add an additive exact-date column (e.g. `last_done_on`) for S-06/S-07 and future history.
2. **Delete or keep the plan on confirm?**
   - Deleting reuses the `done` path and the ledger cascade. An unconfirmed past appointment is then simply `screening_plans.appointment_date < today`, which S-07 can query directly.
   - Keeping the plan needs a `confirmed_at` column and changes to `partitionDashboard`.
3. **Store next-due for S-06?** Either S-05 persists a next-due value, or S-06 reimplements `resolveInterval` (with overrides and the current profile) in SQL. A stored value goes stale when the profile changes; a computed one costs cron CPU. The choice can be deferred to S-06 only if S-05 leaves the data S-06 needs readable.
4. **When can a plan be confirmed?** US-03 says the date "has passed" (`prd.md:75`). Is the appointment day itself (Warsaw today) allowed?
5. **Tier check on confirm:** should confirm skip `screening_not_available` (`api/screenings.ts:84-93`), so a plan whose exam has left the user's tiers can still be closed? RLS still blocks retired entries.
6. **Didn't happen / different date:** the user can already re-date (future only) or use month/year "mark done". Does the passed state need a "it didn't happen" action (unplan or re-date)?
7. **Passed state on the dashboard:** a new "awaiting confirmation" group or a badge on the plan row. Should the S-04 reminders hint and the status count exclude past plans? The UI files overlap with issue #67 (`dashboard.astro`, `kitchen-sink.astro`, possibly `saved.ts`), which is open in the parallel worktree.
8. **Smoke coverage of a passed plan:** a passed plan cannot be created through the API, so plan how the test seeds one (pgTAP-only coverage, a seed step in CI, or rules-level unit tests once F-03 exists).
9. **Housekeeping:** fix the stale roadmap S-05 body (`roadmap.md:177`) and the issue #23 title when planning settles scope.
