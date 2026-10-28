# Database guards for the app-only rules (F-20) Implementation Plan

## Overview

Mirror the rules that today live only in the API routes — the appointment-date window, the done-month window, the
age floor (with the smoking-vs-age bounds), the last-exam day and the consent-version format — in the database, so
a client that writes through PostgREST directly (Q-05) is refused what the API would refuse. Covers roadmap F-20,
backlog B-17. Every rule gets pgTAP coverage.

## Current State Analysis

- The API enforces the rules before writing: `parsePlanForm` (`src/lib/screenings/rules.ts:123-134`), `parseDoneForm`
  (`rules.ts:146-162`), `parseProfileForm` (`src/lib/profile.ts:69-121`), the consent version check
  (`src/pages/api/consent/grant.ts:18-20`).
- The database checks only static bounds: `birth_year between 1900 and 2100`, smoking columns 1–100 / 0–100
  (`supabase/migrations/20260927190303_onboarding_profile.sql:55-60`), first-of-month and day-in-month on
  completions (`20260930093108_screening_records.sql:48-50`, `20261005173653_confirm_screening_plan.sql:15-18`);
  nothing on `appointment_date` or `consent_version`.
- Four of the five rules depend on "today" or on another table, so they cannot be honest `CHECK` constraints:
  Postgres accepts `current_date` in a `CHECK` but assumes it immutable and re-checks it on every update and on
  restore (`research.md`, "Probe"). They become write-time triggers.
- Writers: the API routes and `confirm_screening_plan` (role `authenticated`), `withdraw_health_data_consent`
  (deletes plus `withdrawn_at`), pgTAP fixtures as `postgres`. The cron holds no privileges on these tables
  (`research.md`, "Who writes these tables").

## Desired End State

- A client-role write (`authenticated`/`anon`) of a plan date before Warsaw yesterday or after today + 2 years
  (+1 day), a done month after the current Warsaw month or before January of the user's birth year, a last-exam day
  after Warsaw today, a birth year under 18 (Warsaw year), smoking years plus years since quitting above the age, or
  a consent version not shaped `YYYY-MM-DD[.N]` fails with SQLSTATE 23514.
- Rows that already exist are never re-checked by the triggers; the consent check is `NOT VALID`, with a follow-up
  note describing the read-only production query and the later `VALIDATE`.
- `npx supabase test db` passes with a new `app_rules.test.sql` and with no fixture that will start failing as the
  calendar moves on (no fixed future date written as `authenticated`).
- `src/lib/database.types.ts` is unchanged; a unit test keeps `HEALTH_DATA_CONSENT_VERSION` inside the format.

### Key Discoveries:

- `confirm_screening_plan` turns a plan dated today or earlier into a done record
  (`20261005173653_confirm_screening_plan.sql:53-56`), so plans legitimately age into the past: the plan check must
  fire on insert or on a changed date only.
- "Today" in SQL is `(now() at time zone 'Europe/Warsaw')::date` (`20261005173653_confirm_screening_plan.sql:46`).
- Same-event row triggers fire in name order; completions already have `…_clear_stale_last_done_on` and
  `…_set_updated_at` BEFORE UPDATE triggers (`20261005180420_clear_stale_last_done_on.sql:26-28`,
  `20260930093108_screening_records.sql:57-59`).
- BEFORE row triggers run before RLS `WITH CHECK`, so a trigger error can replace an expected `42501` in a test
  (`supabase/tests/database/screening_records.test.sql:29-32`).
- Trigger functions and `CHECK` constraints are absent from generated types (`src/lib/database.types.ts` lists only
  callable functions, `:408,434`).
- Fixture dates that would break: `screening_records.test.sql:30,45,70,76` (as `authenticated`, from
  2026-11-01 on) and `appointment_reminders.test.sql:194-196,319` (as `authenticated`, from 2027-03-12 on).
  `screening_confirm.test.sql:99-106` inserts plans dated yesterday, which the one-day slack accepts.

## What We're NOT Doing

- No `VALIDATE CONSTRAINT` on the consent check in this change (follow-up note; owner runs the production query).
- No check on rows written by `postgres`, `service_role` or security-definer functions; the guards target client
  roles.
- No upper age bound (`MAX_AGE = 120`, `src/lib/profile.ts:14`) in the database: with the Warsaw year it would be
  the one rule stricter than the API around New Year.
- No "consent version equals the current version" rule and no list of known versions (format only).
- No change to API routes, error codes, i18n or UI; no new table (so no `service_role` revoke beyond functions).
- No update to `context/domain/domain-distillation.md` (its drift cells are refreshed by the next distillation run)
  and no `roadmap.md` status change.

## Implementation Approach

One additive migration with three trigger functions and one `NOT VALID` check, then pgTAP: a new file for the rules
and fixture edits in two existing files. Phase 2 adds the app-side guard that keeps the consent constant inside the
database format, updates comments that describe where the rules live, and writes the VALIDATE follow-up note.

## Critical Implementation Details

- **Bounds must never be stricter than the API.** Lower appointment bound is Warsaw today − 1 (midnight race);
  upper bound is `(today + interval '2 years')::date + 1`, because Postgres clamps 29 Feb + 2 years to 28 Feb
  where the API's `addYears` rolls to 1 Mar (`rules.ts:93-99`). Age uses the Warsaw year, which is never behind the
  API's runtime year.
- **Upserts fire BEFORE INSERT first.** PostgREST upserts are `INSERT … ON CONFLICT DO UPDATE`, so the BEFORE
  INSERT trigger sees the full proposed row even when the row exists; the API always sends valid values, so this is
  safe, but the "changed only" test applies to the UPDATE branch only.
- **Role scope** is `current_user in ('authenticated', 'anon')` inside a security-invoker function; do not use
  `auth.uid()` or the JWT role: pgTAP keeps `request.jwt.claims` set after `reset role`.

## Phase 1: Database guards and pgTAP

### Overview

Add the migration, cover every rule with pgTAP, make the existing fixtures independent of the calendar, and
confirm generated types do not change. All DB steps run in one session under the shared DB lock.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<timestamp>_app_rule_checks.sql` (create with `npx supabase migration new app_rule_checks`; timestamp after `20261006204148`)

**Intent**: Add write-time guards for the API's date and age rules, scoped to client roles, plus a `NOT VALID`
format check on consent versions. Header comment in the voice of earlier migrations: additive only; why these are
triggers and not `CHECK`s (relative to today, re-checked on update/restore); that existing rows are not re-checked;
that the guards target client roles (Q-05); that the API stays the first line and maps any error to `save_failed`;
that a `NOT VALID` check is still evaluated on every UPDATE of an old row, so a malformed `consent_version` already
in production would make that user's `withdraw_health_data_consent` fail until the row is rewritten (see the
follow-up note) (plan review F3).

**Contract**:

- `public.validate_screening_plan()` + trigger `screening_plans_validate_rules` `BEFORE INSERT OR UPDATE OF appointment_date ON public.screening_plans FOR EACH ROW`: when the role is a client role, the date is not null and (`INSERT` or changed), require `today − 1 ≤ appointment_date ≤ (today + interval '2 years')::date + 1`.
- `public.validate_screening_completion()` + trigger `screening_completions_validate_rules` `BEFORE INSERT OR UPDATE OF last_done_month, last_done_on`: first, when day is not null and (`INSERT` or changed), require `last_done_on ≤ today` (checked before the month bounds, so a later day is refused by the day rule, plan review F2); then, when month is not null and (`INSERT` or changed), require `last_done_month ≤` first of the current Warsaw month and, when the caller's profile exists (`select birth_year from public.profiles where user_id = new.user_id`, read under the caller's RLS), `last_done_month ≥ make_date(birth_year, 1, 1)`. The trigger name must sort after `screening_completions_set_updated_at`.
- `public.validate_profile()` + trigger `profiles_validate_rules` `BEFORE INSERT OR UPDATE OF birth_year, smoking_years, years_since_quitting`: when (`INSERT` or any of the three changed), with `age = Warsaw year − birth_year`, require `age ≥ 18` and `coalesce(smoking_years, 0) + coalesce(years_since_quitting, 0) ≤ age`.
- Each function: `language plpgsql`, security invoker, `set search_path = ''`, fully qualified names, returns `new`, raises `using errcode = 'check_violation'` with a fixed message naming the rule and no values (one distinct message per rule, asserted by pgTAP, plan review F2); EXECUTE revoked from `public, anon, authenticated, service_role`.
- `alter table public.health_data_consents add constraint health_data_consents_version_format check (consent_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(\.[0-9]+)?$') not valid;` with a comment pointing at the follow-up note.

#### 2. New pgTAP file

**File**: `supabase/tests/database/app_rules.test.sql`

**Intent**: One case per rule and boundary, following the existing file layout (`begin`, `plan(n)`, fixtures as
`postgres` — own `test-*` catalog rows and `auth.users` — then `set local role authenticated` with JWT claims,
`rollback`). Dates and years are computed from `now() at time zone 'Europe/Warsaw'`, never literals.

**Contract** — cases (as `authenticated` unless noted). Every refused case asserts the trigger's rule-naming
message, not only `23514` (`throws_ok(sql, '23514', '<message>', desc)`), because the static checks raise `23514`
too (plan review F2):

- Plans: today − 1 accepted; today − 2 rejected (23514); null accepted; today + 2 years accepted; today + 2 years + 1 day accepted (pins the 29-Feb slack); today + 2 years + 2 days rejected; a plan seeded as `postgres` 30 days in the past can be re-saved with its unchanged date and can be cleared to null by its owner; a `postgres` insert of a past date is accepted (role scope).
- Done records: current month accepted; next month rejected; January of the birth year accepted, December of the year before rejected; `last_done_on` = today accepted, a later day rejected (built as `last_done_on = today + 1` with `last_done_month = date_trunc('month', today + 1)`, so only the day rule can refuse it on every calendar day); for a user with consent and no profile, a month in 1950 is accepted (lower bound skipped).
- Profiles: birth year = Warsaw year − 18 accepted, − 17 rejected; `smoking_years` = age accepted, age + 1 rejected; `smoking_years + years_since_quitting` = age + 1 rejected; a profile seeded as `postgres` with an under-age birth year can still toggle reminders as its owner (trigger not fired by other columns).
- Consent: `'2026-09-30'` and `'2026-09-30.2'` accepted (separate users or after withdrawal, to avoid the one-active index); `'forged'` and `'2026-9-30'` rejected (23514); the constraint exists with `convalidated = false`.
- Refused UPDATEs, one per rule branch, by the row's owner (plan review F1): a valid plan re-dated to today − 2; a done record's month moved to next month; a done record's `last_done_on` moved to a later day (built as above); a profile's `birth_year` moved under 18; a profile's `smoking_years` raised so the sum exceeds the age.
- Upsert (plan review F1): `insert … on conflict (user_id, catalog_slug) do update set appointment_date = excluded.appointment_date` on an aged plan with a new date of today − 2 is refused.
- Privileges: none of `anon`, `authenticated`, `service_role` can EXECUTE the three functions.
- `select plan(n)` counts every case above.

#### 3. Fixture edits

**File**: `supabase/tests/database/screening_records.test.sql`

**Intent**: Replace the fixed appointment dates written as `authenticated` (`:30`, `:45`, `:70` and the expected
value at `:76`) with dates relative to Warsaw today, so the file passes on any calendar day. The expected `42501`
at `:29-32` must keep coming from RLS, not from the trigger.

**Contract**: `select plan(57)` unchanged; assertion texts unchanged.

**File**: `supabase/tests/database/appointment_reminders.test.sql`

**Intent**: Run the two plan writes around the fake today `2027-03-10` as `postgres` with an explicit `user_id`
(`:192-197` insert, `:317-320` re-date), keeping the `lives_ok` and the following claim assertions as they are.

**Contract**: `select plan(66)` unchanged; the "A can plan five exams" description may become "A's five plans are
seeded"; claim results unchanged.

#### 4. Generated types

**File**: `src/lib/database.types.ts`

**Intent**: Run `npm run db:types` after applying the migration; no diff is expected (trigger functions and checks
are not exported). Commit only if it changes, and explain the diff in decisions.md.

**Contract**: `git diff --exit-code src/lib/database.types.ts`.

### Success Criteria:

#### Automated Verification:

- Migration applies to the local stack under the DB lock: `npx supabase migration up`
- All pgTAP files pass, including `app_rules.test.sql`: `npx supabase test db`
- Generated types unchanged after `npm run db:types`: `git diff --exit-code src/lib/database.types.ts`
- No literal appointment date is written as `authenticated` in `screening_records.test.sql` or `app_rules.test.sql` (heuristic, review by grep)
- Lint and format pass: `npm run lint` and `npx prettier --check context/changes/db-check-constraints`

#### Manual Verification:

- Reviewer reads the migration header and confirms each bound is never stricter than the API (lower −1 day, upper +1 day, Warsaw year)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual
confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: App-side guard, notes and smoke

### Overview

Keep the consent constant inside the database format, point the code comments at the new guards, write the
VALIDATE follow-up, and run the smoke test locally because a migration changed.

### Changes Required:

#### 1. Consent version unit test

**File**: `src/lib/consent.test.ts` (new)

**Intent**: Fail CI's `ci` job if `HEALTH_DATA_CONSENT_VERSION` is bumped to a value the database check would
refuse, which would otherwise surface only as `save_failed` on every consent grant.

**Contract**: asserts the constant matches `/^\d{4}-\d{2}-\d{2}(\.\d+)?$/` (same pattern as the migration, with a
comment naming the migration file) and that its date part is a real calendar date.

#### 2. Comments

**File**: `src/lib/consent.ts:6-8`, `src/lib/profile.ts:4-5`, `src/lib/screenings/rules.ts:122,142-145`

**Intent**: Say where the database mirrors each rule (the migration's triggers and check) and that the bounds
there are deliberately one day looser, so a later edit of the app rule updates both.

**Contract**: comments only; no behaviour change.

#### 3. VALIDATE follow-up note

**File**: `context/changes/db-check-constraints/follow-ups/validate-consent.md` (new; `follow-ups/` convention, listed in the PR's follow-ups — plan review F5)

**Intent**: Record the read-only production query the owner runs soon after merge, the expected result (only
`YYYY-MM-DD[.N]` values; today's app has written `2026-09-27`, `2026-09-28`, `2026-09-30`), the withdrawal
consequence of an offending row (its owner cannot withdraw consent while the row is malformed, because the `NOT
VALID` check re-checks the `withdrawn_at` update), the remedy (rewrite that row's `consent_version` as `postgres`
before the user withdraws and before `VALIDATE`), and the one-line follow-up migration (`alter table public.health_data_consents validate constraint
health_data_consents_version_format;`) plus the pgTAP assertion to flip (`convalidated = true`).

**Contract**: query `select consent_version, count(*) from public.health_data_consents where consent_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(\.[0-9]+)?$' group by 1;` — expected zero rows.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including `src/lib/consent.test.ts`: `npm test`
- Lint and type check pass: `npm run lint` and `npx astro check`
- Smoke passes locally against the migrated stack under the DB lock: `BASE_URL=http://127.0.0.1:$DBAM_PORT npm run smoke`

#### Manual Verification:

- The PR's "Manual checks for the human" lists the read-only production query from the follow-up note; the owner runs it in the Supabase SQL editor and reports zero rows

The PR description also says why the date and age rules are triggers, not `CHECK`s (link `research.md` Summary §1),
lists `follow-ups/validate-consent.md` under follow-ups, and asks the owner to run the query soon after merge, not
only before the later `VALIDATE` (plan review F3, F4, F5). The `/10x-archive` commit adds a one-line `backlog.md`
entry pointing at the follow-up (F5).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual
confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `src/lib/consent.test.ts`: the consent constant matches the database format and is a real date.

### Integration Tests:

- `app_rules.test.sql`: every rule at its boundary (accepted and refused side), the role scope, the "changed
  only" behaviour on aged rows, the missing-profile case, `NOT VALID` state and function privileges.
- Existing pgTAP files, with calendar-independent fixtures, prove the confirm flow (plans dated yesterday), the
  cron functions and RLS still behave as before.
- `npm run smoke` proves the API paths (plan today and +30 days, mark done, profile edit, consent) pass the guards.

### Manual Testing Steps:

1. Read the migration and compare each bound with `rules.ts` and `profile.ts`.
2. Owner runs the follow-up query against production soon after merge, and again before the follow-up `VALIDATE`
   change.

## Performance Considerations

One indexed primary-key lookup on `profiles` per done-record write; otherwise constant-time checks. Tables are
small; no index needed.

## Migration Notes

Additive: new functions, triggers and a `NOT VALID` check. No existing row is scanned or rewritten, so the CI
`migrate` job cannot fail on production data. A Worker rollback keeps working, because every deployed Worker
version sends only values the API rules accept and those rules have not changed since they were introduced
(`research.md`, "Migration mechanics").

- **Forward fix (plan review F4):** a Worker rollback does not undo a trigger. If a guard refuses a write the API
  accepts (time zone, leap day, month boundary), recovery is a forward migration that drops that one trigger; the
  three triggers and the check are independent, so the others stay.
- **Why triggers (F4):** the roadmap says "check constraints"; four of the five rules are triggers because they
  depend on "today" or on another table (`research.md` Summary §1). The PR description says so.
- **Withdrawal (F3):** the `NOT VALID` consent check is still evaluated on UPDATE of old rows, so a malformed
  `consent_version` already in production would block that user's withdrawal until the row is rewritten. The owner
  runs the read-only query soon after merge; the remedy is in `follow-ups/validate-consent.md`.

## References

- Related research: `context/changes/db-check-constraints/research.md`
- Decisions: `context/changes/db-check-constraints/decisions.md`
- Trigger precedent: `supabase/migrations/20261005180420_clear_stale_last_done_on.sql:12-36`
- Warsaw today in SQL: `supabase/migrations/20261005173653_confirm_screening_plan.sql:46`
- Roadmap item: `context/foundation/roadmap.md:128-138`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database guards and pgTAP

#### Automated

- [x] 1.1 Migration applies to the local stack under the DB lock: `npx supabase migration up` — 60f3895
- [x] 1.2 All pgTAP files pass, including `app_rules.test.sql`: `npx supabase test db` — 60f3895
- [x] 1.3 Generated types unchanged after `npm run db:types`: `git diff --exit-code src/lib/database.types.ts` — 60f3895
- [x] 1.4 No literal appointment date is written as `authenticated` in `screening_records.test.sql` or `app_rules.test.sql` (heuristic, review by grep) — 60f3895
- [x] 1.5 Lint and format pass: `npm run lint` and `npx prettier --check context/changes/db-check-constraints` — 60f3895

#### Manual

- [x] 1.6 Reviewer reads the migration header and confirms each bound is never stricter than the API (lower −1 day, upper +1 day, Warsaw year) — 60f3895

### Phase 2: App-side guard, notes and smoke

#### Automated

- [x] 2.1 Unit tests pass, including `src/lib/consent.test.ts`: `npm test` — e2de957
- [x] 2.2 Lint and type check pass: `npm run lint` and `npx astro check` — e2de957
- [x] 2.3 Smoke passes locally against the migrated stack under the DB lock: `BASE_URL=http://127.0.0.1:$DBAM_PORT npm run smoke` — e2de957

#### Manual

- [ ] 2.4 The PR's "Manual checks for the human" lists the read-only production query from the follow-up note; the owner runs it in the Supabase SQL editor and reports zero rows
