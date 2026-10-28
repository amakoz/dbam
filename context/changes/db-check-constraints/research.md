---
date: 2026-10-28T13:53:08+0100
researcher: Claude (worker, feat-db-check-constraints)
git_commit: e726a69
branch: feat/db-check-constraints
repository: dbam (10xdevs)
topic: "Which app-only rules (past-date window, age floor, consent version) can be mirrored in the database, and in what form"
tags: [research, supabase, migrations, pgtap, check-constraints, triggers, screening-plans, profiles, consent]
status: complete
last_updated: 2026-10-28
last_updated_by: Claude (worker, feat-db-check-constraints)
---

# Research: mirroring the app-only rules in the database (F-20)

**Date**: 2026-10-28T13:53:08+0100
**Researcher**: Claude (worker, feat-db-check-constraints)
**Git Commit**: e726a69
**Branch**: feat/db-check-constraints
**Repository**: dbam (10xdevs)

## Research Question

Roadmap F-20 (M-03, backlog B-17, `context/foundation/roadmap.md:128-138`): the rules enforced today only in the API
routes — the appointment-date window, the done-month window, the age floor and the consent version — should also be
enforced by the database and covered by pgTAP. Which can be plain `CHECK` constraints, which cannot and why, what
form fits the rest, and what does that mean for existing production rows (`NOT VALID` + `VALIDATE` or not), the
additive-first rule, `db:types` and the existing pgTAP fixtures?

Scope: 4 tables (`health_data_consents`, `profiles`, `screening_plans`, `screening_completions`), their migrations,
the 3 API routes that write them, and `supabase/tests/database/*.sql`. No sub-agents: the change touches 3 modules
(migrations, pgTAP, and read-only checks of `src/lib` / `src/pages/api`).

## Summary

1. **The brief's premise needs one correction.** Postgres 17.6 (local stack) _accepts_ a `CHECK` that calls
   `current_date`; only generated columns and index expressions are rejected as "not immutable" (probe below). The
   reason not to use one is the documented assumption that a `CHECK` is immutable: it is re-evaluated on every
   `UPDATE` of the row and on dump/restore, so a rule relative to "today" turns a valid row invalid as time passes.
   The Postgres docs name a trigger as the tool for a "one-time check at row insertion", and note that pg_dump
   restores triggers after data (Context7 `/websites/postgresql/17`, ddl-constraints §5.5.1 notes).
2. **Rule-by-rule verdict** (details in the table under Detailed Findings):
   - Appointment date window (R-05): **cannot** be a `CHECK` — relative to Warsaw "today", and plans legitimately
     age into the past (`confirm_screening_plan` only confirms plans dated today or earlier,
     `20261005173653_confirm_screening_plan.sql:53-56`). Form: `BEFORE INSERT OR UPDATE` trigger, checked only when
     the date is set or changed.
   - Done-month window (R-08): **cannot** be a `CHECK` — the upper bound is relative to now and the lower bound reads
     `profiles.birth_year` (another table). Form: same trigger style.
   - Age floor (R-40): **cannot** be an honest `CHECK` (relative to the current year). Form: trigger. (Being monotone
     in time, a `CHECK` would never flip from true to false, but it still breaks the immutability contract.)
   - Consent version (R-37): **can** be a plain `CHECK` (immutable), but only as a format or a known-values list.
     "Equals the current version" cannot be mirrored without coupling every consent-text bump to a migration, and a
     "current only" rule would refuse a rolled-back Worker that still sends the previous version.
3. **Existing rows and `NOT VALID`:** triggers never look at existing rows, so the question only arises for the
   consent `CHECK`. Every version the app has ever written is well formed (`2026-09-27`, `2026-09-28`,
   `2026-09-30`, from `git log -p src/lib/consent.ts`), but production data cannot be inspected from here. Each
   migration file is applied in one transaction by `supabase db push`, so a violating row fails the CI `migrate` job
   cleanly and blocks `deploy` (`.github/workflows/ci.yml:141`; Supabase CLI `migration-apply.ts` via Context7
   `/supabase/cli`). `NOT VALID` avoids that; a validated constraint needs a read-only prod check first (Q2).
4. **Additive-first holds** as long as the database is never stricter than any Worker version still deployable: the
   three numeric rules are unchanged since they were introduced (`MAX_APPOINTMENT_YEARS_AHEAD = 2`, `MIN_AGE = 18`,
   one `+` line each in history), and a version list must keep every past version.
5. **The biggest cost is pgTAP fixtures**, not SQL: 3 test files write plans as `authenticated` with fixed calendar
   dates (some 4 days from today) or "yesterday", which a now-relative trigger would refuse (list below). Cron tests
   seed plans as `postgres` around a fake "today" of `2027-03-10`; exempting non-client roles keeps them intact (Q1).
6. **`db:types`:** trigger functions and `CHECK` constraints do not appear in `src/lib/database.types.ts`
   (`set_updated_at` and `clear_stale_last_done_on` are absent; only callable functions such as
   `confirm_screening_plan` are listed, `database.types.ts:408,434`), so no type diff is expected. Run it once
   under the DB lock to confirm.

## Detailed Findings

### Probe: what Postgres accepts

Local stack, `server_version 17.6`, run inside `begin … rollback` on temp tables (no shared state touched):

- `create temp table t (d date check (d >= current_date)); insert into t values (current_date);` → accepted, 1 row.
- `create temp table t2 (d date, g boolean generated always as (d >= current_date) stored)` → `ERROR: generation
expression is not immutable`.

So "immutable expressions only" applies to generated columns and indexes, not to `CHECK`. For `CHECK`, Postgres
_assumes_ immutability and checks only on insert/update (Context7 `/websites/postgresql/17`, ddl-constraints:
"PostgreSQL assumes that CHECK constraints' conditions are immutable … justifies examining CHECK constraints only when
rows are inserted or updated"; and "a custom trigger can be used … pg_dump does not reinstall triggers until after
restoring data").

### Rule inventory (all 4 rules named in the brief, plus 2 adjacent ones)

| Rule (distillation id)                                                                                                        | App enforcement                                                                                                                                                         | DB today                                                                        | Mirror form                                      | Why                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Appointment date: Warsaw today ≤ date ≤ today + 2 y, or null (R-05)                                                           | `parsePlanForm`, `src/lib/screenings/rules.ts:123-134`; today = `warsawToday(now)`, `src/pages/api/screenings.ts:113-116`                                               | none, `appointment_date date` (`20260930093108_screening_records.sql:17`)       | trigger on insert / change of `appointment_date` | relative to now; valid rows become past by design (confirm flow)                     |
| Done month: `birthYear-01-01` ≤ month ≤ current Warsaw month, or null (R-08)                                                  | `parseDoneForm`, `rules.ts:146-162`; `warsawMonth(now)`, `profile.birth_year`, `screenings.ts:116`                                                                      | first-of-month only (`…093108:48-50`); day-in-month (`20261005173653…:15-18`)   | trigger on insert / change of `last_done_month`  | relative to now; lower bound reads `profiles`                                        |
| Age floor: `currentYear − birth_year ≥ 18` (R-40)                                                                             | `parseProfileForm`, `src/lib/profile.ts:77-81`; `currentYear = new Date().getFullYear()`, `src/pages/api/profile.ts:35`                                                 | `birth_year between 1900 and 2100` (`20260927190303_onboarding_profile.sql:55`) | trigger on insert / change of `birth_year`       | relative to now                                                                      |
| Consent version = current constant (R-37)                                                                                     | `src/pages/api/consent/grant.ts:18-20,27-29`; `HEALTH_DATA_CONSENT_VERSION = "2026-09-30"`, `src/lib/consent.ts:9`, format "change date, `.N` suffix", `consent.ts:6-8` | `consent_version text not null` (`…190303:12`)                                  | plain `CHECK` (format or known list), Q3         | immutable once reduced to format/list                                                |
| Adjacent, same row as R-40: `smoking_years ≤ age`, `smoking_years + years_since_quitting ≤ age`, `years_since_quitting ≤ age` | `profile.ts:85,104,110-119`                                                                                                                                             | 1–100 / 0–100 only (`…190303:59-60`)                                            | trigger (same as age floor)                      | relative to now; not named in the roadmap outcome (Q4)                               |
| Adjacent: `last_done_on` ≤ Warsaw today                                                                                       | written only by `confirm_screening_plan` from a date ≤ today (`…173653:46,55,67-70`); the API sends `null` (`screenings.ts:139-141`)                                    | only "within its month" (`…173653:15-18`)                                       | trigger                                          | a direct write could store a later day of the current month; not in the roadmap (Q4) |

Not in scope and unchanged: `MAX_AGE = 120` (`profile.ts:14,77`). A DB mirror of the upper age bound would be the
one rule where a Warsaw-year check is _stricter_ than the app's year (see time zones below), so it should not be
added casually.

### Who writes these tables (determines which writes a trigger sees)

Inspected: `src/**`, `scripts/*.mjs`, `tests/e2e`, `supabase/migrations/*.sql`.

- API routes via the SSR client (role `authenticated`): `profiles` upsert (`src/pages/api/profile.ts:41`), `profiles`
  reminder toggle update (`src/pages/api/reminders.ts:27-31`, columns `reminders_enabled`/`reminders_locale` only),
  `screening_plans` upsert (`screenings.ts:124-131`), `screening_completions` upsert + plan delete
  (`screenings.ts:136-150`), `health_data_consents` insert (`grant.ts:27-29`).
- `confirm_screening_plan` (security invoker, so `authenticated`): deletes a plan dated ≤ Warsaw today and upserts
  the completion with that date's month and day (`…173653:38-74`).
- `withdraw_health_data_consent` (security definer): deletes only, plus `withdrawn_at` update
  (`…093108:194-213`).
- The cron (`service_role`) holds no table privileges on these tables (pgTAP guard,
  `supabase/tests/database/appointment_reminders.test.sql:102-116`) and no migration function updates `profiles`,
  `screening_plans` or `screening_completions` (grep of `supabase/migrations/*.sql` for `insert into` / `update` on
  them: only `…173653:67`).
- `scripts/smoke.mjs` and `scripts/ui-shots.mjs` write only through the API, with plan dates `today` and
  `today + 30` (`smoke.mjs:171,246`, `ui-shots.mjs:256`); the past-date case expects the API's
  `invalid_appointment_date` redirect (`smoke.mjs:224-225`) and never reaches the database.

### Trigger design facts the plan can rely on

- Error path: any write error already maps to `save_failed` (`screenings.ts:131,141,148`, `profile.ts:42-44`,
  `grant.ts:31-33`, the last except `23505`). A trigger raising `check_violation` (`23514`) changes nothing a user
  sees, since the API rejects the same input first.
- Firing order: same-event row triggers fire in name order. `screening_completions` already has
  `screening_completions_clear_stale_last_done_on` and `screening_completions_set_updated_at` (BEFORE UPDATE,
  `…180420:26-28`, `…093108:57-59`); a validating trigger named after them (e.g. `…_validate_…`) sees the final row.
- BEFORE row triggers run before RLS `WITH CHECK`, so a trigger error can replace an expected `42501` in a test
  (relevant to `screening_records.test.sql:29-32`, below).
- Privileges: precedent revokes EXECUTE on trigger functions from `public, anon, authenticated`
  (`…190303:153`) and from `service_role` for new functions (`…180420:34-36`); `set_updated_at` still fires on
  `authenticated` writes, which existing pgTAP updates exercise (`onboarding_profile.test.sql:53-56`).
- "Today" in SQL: precedent is `(now() at time zone 'Europe/Warsaw')::date` (`…173653:46`); `now()` is fixed per
  transaction, which keeps pgTAP deterministic within a file.
- The trigger can read `profiles.birth_year` under the caller's RLS: the select policy is own-row only, no consent
  condition (`…190303:94-96`). A user can have completions without a profile in pgTAP (`screening_confirm` and
  `screening_records` never insert one), so the plan must decide what a missing profile means (skip the lower
  bound is the non-breaking choice).

### Time zones and races (app vs DB "now")

- Appointment lower bound: the app's "today" is computed before the write; if Warsaw midnight passes between the
  app's check and the DB statement, a date the app accepted (`today`) is one day before the DB's today and would be
  refused. This is the only bound where the DB side moves stricter with time. A one-day slack on the lower bound
  removes the race (Q1 option).
- Upper bounds (`today + 2 y`, current month) and the age floor only loosen as the DB clock advances.
- Profile year: the API uses `new Date().getFullYear()` (`profile.ts:35`), which is the runtime's local year.
  _Inference, not verified in-repo:_ Workers run in UTC, so between 23:00/22:00 UTC on 31 Dec and midnight UTC the
  app's year is one behind Warsaw's. A DB age floor using the Warsaw year is then looser than or equal to the app's
  (`birth_year ≤ year − 18` loosens as `year` grows), so it never refuses an app-accepted profile.

### pgTAP fixtures a now-relative trigger would break

Writes as `authenticated` (would be checked under any trigger design):

- `screening_confirm.test.sql:99-106` — inserts plans dated Warsaw yesterday (`test-a`, `test-e`, `test-f`) to
  test confirmation: fails immediately under a lower bound.
- `screening_records.test.sql` (role `authenticated` from :26 to :176): `'2026-11-01'` at :30 (expects `42501`; a
  trigger error would pre-empt it once that date passes) and :45, `'2026-12-15'` at :70, `'2027-01-01'` at :157,
  `'2026-12-01'` at :268 (after `set local role authenticated` at :255). Time bombs from 2026-11-02 onward.
- `appointment_reminders.test.sql:194-196` (`'2027-03-10'…'2027-03-14'`) and :319 (`'2027-03-12'`), as
  `authenticated`: break from 2027-03-11 onward.

Writes as `postgres` (after `reset role` or before any role switch) around a fake today of `2027-03-10`, passed
explicitly to the cron functions: `appointment_reminders.test.sql:37,366-368`, `follow_up_nudges.test.sql:66,351,358,416`,
`screening_confirm.test.sql:227,239,284` (dated yesterday), `due_screening_reminders.test.sql:57-81`. A trigger that
applies to every role would make these time bombs too, and would force rewriting the cron fixtures to be relative
to the real date.

Unaffected: profile fixtures use birth years 1970/1971/1980 (`onboarding_profile.test.sql:17,43-44,54`,
`appointment_reminders.test.sql:146,151`); completion fixtures use past months `2020-01-01`, `2020-04-01`,
`2024-03-01`, `2026-03-01`; consent fixtures use `'2026-09-27'` (16 occurrences) — well formed, and in the
known-version list.

Plan counts to bump when cases are added: `onboarding_profile` 33, `screening_records` 57, `screening_confirm` 50
(`select plan(…)` lines).

### Migration mechanics

- Additive-first: new triggers and a new `CHECK` are additive; a Worker rollback (previous version) sends only values
  that the previous code accepted, and the three numeric rules have not changed since their introduction
  (`rules.ts:28`, `profile.ts:13`, one `+` line each in `git log -p`). The consent version changed three times
  (`2026-09-27` in #35, `2026-09-28` in #37, `2026-09-30` in #59), so a list must keep all three.
- `supabase db push` applies each pending file inside one transaction and records history only after it succeeds
  (Context7 `/supabase/cli`, `apps/cli/src/command-internal/migration-apply.ts`), so a failed `ADD CONSTRAINT`
  leaves production untouched and the `migrate` job red (`ci.yml:141`), which blocks `deploy`.
- `NOT VALID` (Context7 `/websites/postgresql/17`, `sql-altertable`): the constraint is enforced for new inserts and
  updates at once, existing rows are not scanned; `VALIDATE CONSTRAINT` later takes only `SHARE UPDATE EXCLUSIVE`.
  At this table size the lock is irrelevant; the value is in not failing `migrate` on an unknown production row.
  `NOT VALID` followed by `VALIDATE` in the _same_ file gives no protection, because both run in one transaction.
- Consent rows: clients have no `UPDATE` on `health_data_consents` at all (`20260928061623…:6`), and the withdraw
  function only sets `withdrawn_at`; a `CHECK` on `consent_version` is in practice checked on insert, and on that
  update for rows already present (a `NOT VALID` constraint is checked on updates of old rows too). Consequence:
  under `NOT VALID`, a malformed old row would make `withdraw_health_data_consent` fail for that one user, since its
  `update … set withdrawn_at` re-checks the row (`…093108:209-211`).
- No new table is needed by any option except a `consent_versions` reference table, which would need the
  `service_role` revoke (CLAUDE.md hard rule; guard at `appointment_reminders.test.sql:109-116`). Not recommended.

## Code References

- `src/lib/screenings/rules.ts:28,123-134,146-162` – appointment and done-month windows
- `src/lib/profile.ts:13-14,69-121` – age floor, smoking-vs-age bounds
- `src/lib/consent.ts:6-9` – consent version constant and format
- `src/pages/api/screenings.ts:101-150` – profile prerequisite, parse, upserts
- `src/pages/api/profile.ts:35-44` – profile upsert, year source
- `src/pages/api/consent/grant.ts:16-33` – version check and insert
- `supabase/migrations/20260927190303_onboarding_profile.sql:9-17,53-72,94-153` – consent and profile tables, RLS, grants
- `supabase/migrations/20260930093108_screening_records.sql:11-59,68-186` – plans, completions, RLS, grants
- `supabase/migrations/20261005173653_confirm_screening_plan.sql:13-18,38-74` – `last_done_on`, confirm function
- `supabase/migrations/20261005180420_clear_stale_last_done_on.sql:12-36` – BEFORE UPDATE trigger precedent
- `supabase/tests/database/*.test.sql` – fixtures listed above
- `.github/workflows/ci.yml:141` – `supabase db push` in `migrate`

## Architecture Insights

- The repo already uses the "now is computed in SQL" pattern once, deliberately, and documents it as _not_ a
  database invariant (`20261005180420_clear_stale_last_done_on.sql:38-41`). F-20 would turn three such rules into
  write-time invariants for client roles; the migration comment should say so in the same voice.
- Every `profiles`-gated rule in the API runs after `getOnboardingState` (`screenings.ts:101-110`), so a profile
  always exists for API writes to completions; only pgTAP fixtures create completions without one.
- The threat model is Q-05: a client with a session reaching PostgREST directly (`context/domain/domain-distillation.md:265`).
  That client is always the `authenticated` role, which supports scoping the triggers to client roles.

## Historical Context (from prior changes)

- `context/archive/2026-09-30-record-appointment-date/plan-brief.md:37` – "Today (Warsaw) to today + 2 years,
  inclusive; no past dates … Past exams go through 'mark done' instead": supported, still the app rule.
- `context/archive/2026-09-30-record-appointment-date/plan-brief.md:44` – "New text + version bump, no re-consent":
  supported; re-consent after launch is open (Q-10, `domain-distillation.md`).
- `context/archive/2026-10-05-confirm-exam-and-recurrence/research.md:31` – the first-of-month `CHECK` is the only
  date `CHECK` on completions: supported, plus `last_done_on_in_month` added later (`…173653:15-18`).
- `context/domain/domain-distillation.md:131-192` rows R-05, R-08, R-37, R-40 and ranking #8 (:251) – each "DB
  today" cell matches the migrations as read above.
- `context/foundation/roadmap.md:137` – risk "a date window relative to 'today' cannot be a plain check constraint":
  supported in effect (it must not be one), though Postgres would accept it syntactically (probe above).

## Related Research

- `context/archive/2026-09-30-record-appointment-date/research.md` – table and RLS patterns reused here.
- `context/archive/2026-10-05-confirm-exam-and-recurrence/research.md` – completions date columns.

## Open Questions

1. **Which roles do the triggers check?** (a) client roles only (`current_user in ('authenticated', 'anon')`),
   with fixed and past fixture dates written as `authenticated` rewritten relative to `now()` — recommended, it
   matches the Q-05 threat model and keeps the cron fixtures (`postgres`, fake today `2027-03-10`) intact;
   (b) every role, rewriting all cron fixtures and test helpers to the real date. Sub-choice: one-day slack on the
   appointment lower bound to remove the midnight race (recommended) or exact parity with the app.
2. **Consent `CHECK`: validated or `NOT VALID`?** (a) `NOT VALID` now, `VALIDATE` in a later change after a
   read-only production query (`select consent_version, count(*) from health_data_consents group by 1`) — never
   blocks `deploy`; (b) validated now, with the owner running that query before merge; (c) validated now on the
   git-history evidence alone.
3. **Consent `CHECK` content?** (a) format `^\d{4}-\d{2}-\d{2}(\.\d+)?$` (`consent.ts:8`), no upkeep; (b) the
   known list `('2026-09-27','2026-09-28','2026-09-30')`, which needs a migration with every version bump and fails
   every grant with `save_failed` if one is forgotten; (c) a reference table (needs `service_role` revoke).
4. **Scope:** roadmap names the age floor; include the smoking-vs-age bounds (same row, R-40) and `last_done_on ≤
today` in the same triggers, or leave them out?
