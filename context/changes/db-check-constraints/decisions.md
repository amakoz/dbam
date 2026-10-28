# Decisions — db-check-constraints

## 2026-10-28 Which roles the date/age triggers check (research Q1)

- Question: should the now-relative triggers check every role, or only client roles?
- Options: (a) client roles only (`authenticated`, `anon`), with fixture dates written as `authenticated` made relative to now; (b) every role, rewriting all cron fixtures (`postgres`, fake today `2027-03-10`) to the real date.
- Choice: (a), with one day of slack on "no past dates" (the appointment lower bound is Warsaw today − 1).
- Evidence: the threat is a client reaching PostgREST directly (Q-05, `context/domain/domain-distillation.md:265`); cron fixtures write as `postgres` (`research.md`, "pgTAP fixtures"); the slack removes the midnight race between the API's "today" and the database's.
- decided-by: orchestrator

## 2026-10-28 Consent check: NOT VALID (research Q2)

- Question: validate existing rows when adding the consent-version check?
- Options: (a) `NOT VALID` now, `VALIDATE` later after a read-only production query; (b) validate now after the owner runs the query; (c) validate now on git-history evidence.
- Choice: (a). The `VALIDATE` step goes into a follow-up note in this change folder, and the PR's "Manual checks for the human" lists the read-only production query for the owner to run. Workers never run anything against production.
- Evidence: one migration file is one transaction in `supabase db push`, so a violating row would fail `migrate` and block `deploy` (`.github/workflows/ci.yml:141`).
- decided-by: orchestrator

## 2026-10-28 Consent check content (research Q3)

- Choice: the date-format pattern `^[0-9]{4}-[0-9]{2}-[0-9]{2}(\.[0-9]+)?$` (format documented at `src/lib/consent.ts:8`), not a list of known versions or a reference table.
- decided-by: orchestrator

## 2026-10-28 Scope: adjacent rules (research Q4)

- Choice: include the smoking-vs-age bounds (`smoking_years + years_since_quitting ≤ age`, R-40) and `last_done_on ≤ Warsaw today` in the same triggers; they are date/age rules on the same rows, within F-20's outcome.
- decided-by: orchestrator

## 2026-10-28 Complexity, question budget, phase split

- Complexity: LOW. One additive migration on 4 existing tables, one new pgTAP file plus fixture edits in 2 files, a unit test and comments; no API, UI or type change.
- Question budget: 0. Research plus the orchestrator's answers settled every solution decision.
- Phases: 2. (1) the database (migration, pgTAP, `db:types` check) under one DB-lock session; (2) app-side guard and notes (consent-version unit test, comments, VALIDATE follow-up note, local smoke).
- decided-by: worker

## 2026-10-28 Appointment upper bound: one extra day

- Question: the API's upper bound is `addYears(today, 2)`, which rolls 29 Feb to 1 Mar (`src/lib/screenings/rules.ts:93-99`); Postgres `date + interval '2 years'` clamps 29 Feb to 28 Feb. An exact SQL mirror would be one day stricter than the API on that date.
- Options: (a) `(today + interval '2 years')::date + 1`; (b) a leap-day special case.
- Choice: (a). The database stays a backstop that is never stricter than the API; one extra day ahead is harmless.
- decided-by: worker

## 2026-10-28 Trigger shape

- Checks run only when a value is inserted or changed (`tg_op = 'INSERT'` or `is distinct from old`), so a plan whose date has passed can still be deleted or confirmed and untouched columns never re-check. `BEFORE INSERT OR UPDATE OF <rule columns>`, so the reminder toggle (`src/pages/api/reminders.ts:27-31`) does not fire the profile trigger.
- A done record for a user with no profile skips the birth-year lower bound (the API always has a profile, `src/pages/api/screenings.ts:101-110`; pgTAP fixtures do not).
- Errors use `check_violation` (23514) with a message naming the rule and no row values (health data stays out of logs); the API already maps any write error to `save_failed`.
- Age uses the Warsaw calendar year: never stricter than the API's runtime year (`src/pages/api/profile.ts:35`).
- Trigger functions: security invoker, `set search_path = ''`, EXECUTE revoked from `public, anon, authenticated, service_role` (precedent `20260927190303_onboarding_profile.sql:153`, `20261005180420_clear_stale_last_done_on.sql:36`). The completions trigger is named to sort after `…_clear_stale_last_done_on` and `…_set_updated_at`, so it sees the final row.
- decided-by: worker

## 2026-10-28 Fixtures in appointment_reminders.test.sql

- Question: two writes run as `authenticated` with fixed dates around the fake today `2027-03-10` (`:194-196`, `:319`) and would be refused from 2027-03-12 on.
- Options: (a) run those two writes as `postgres` (explicit `user_id`), keeping the fake today; (b) make the whole file relative to the real date.
- Choice: (a). The claim functions take "today" as a parameter, so the role of the seeding write does not matter to what they test; A's own insert under RLS is already covered by `screening_records.test.sql`. `select plan(…)` counts stay the same (the `lives_ok` stays, under `postgres`).
- decided-by: worker

## 2026-10-28 Plan review triage (REVISE, `plan-review.md`)

- F1 (no refused UPDATE in pgTAP): accepted, Fix A — one refused UPDATE per trigger branch plus an upsert case; `plan(n)` counts them.
- F2 (rejections could pass on the wrong rule): accepted — rule-naming messages asserted in `throws_ok`; the day check runs before the month bounds; the "later day" case uses `date_trunc('month', today + 1)`; "today + 2 years + 1 day accepted" pins the leap-day slack.
- F3 (NOT VALID check can block a withdrawal): accepted, Fix A — keep `NOT VALID`; document the withdrawal consequence in the migration header, Migration Notes and the follow-up; the PR's Manual checks ask the owner to run the read-only query soon after merge.
- F4 (no forward-fix story): accepted — Migration Notes gain the forward-fix and "why triggers" lines; the PR says why triggers, not CHECKs.
- F5 (follow-up location): accepted — `follow-ups/validate-consent.md`, listed in the PR; a one-line `backlog.md` entry in the archive commit.
- decided-by: orchestrator

## 2026-10-28 Implementation notes

- Gate 1.4: two more literal dates in `screening_records.test.sql` (`:157`, `:268`, statements that match zero rows) were also made relative, so the grep heuristic is clean; behaviour unchanged.
- Break checks: a plan trigger that skips every UPDATE turned cases 6–7 red; dropping the +1 day upper slack turned case 5 red; dropping the day rule turned 18–19 red (run in one rolled-back transaction against the local stack). A malformed `HEALTH_DATA_CONSENT_VERSION` turned both `consent.test.ts` cases red.
- Progress 2.4 (owner runs the read-only production query) stays open: it needs production, so it is the PR's "Manual checks for the human" item. `change.md` is set to `implemented` with that one row pending.
- decided-by: worker

## 2026-10-28 Implementation review triage (APPROVED, `impl-review.md`)

- F1 (deliverables outside the diff): accepted — (a) the PR body explains why triggers, not CHECKs, lists `follow-ups/validate-consent.md` and asks the owner to run the read-only query soon after merge; (b) the archive commit adds a one-line `context/foundation/backlog.md` entry for the VALIDATE follow-up.
- F2 (row 1.6 ticked by the implementer): accepted — `plan.md` Phase 1 cites `impl-review.md` F2 as the evidence for Progress 1.6.
- decided-by: orchestrator

## 2026-10-28 Archive with a PR-stage manual row open

- `/10x-archive` warned: Progress 2.4 (owner runs the read-only production consent query) is pending, 0 automated / 1 manual; the review sits at `impl-review.md` (declares phases 1, 2) rather than `reviews/`; the phase SHAs are not in `origin/main` yet (no PR), so nothing is repointed.
- Choice: continue archiving. The PR's "Manual checks for the human" carries 2.4, with the query inline.
- decided-by: orchestrator
