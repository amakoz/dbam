# Database guards for the app-only rules (F-20) — Plan Brief

> Full plan: `context/changes/db-check-constraints/plan.md`
> Research: `context/changes/db-check-constraints/research.md`

## What & Why

The API refuses past appointment dates, done months in the future or before the birth year, under-18 profiles and
malformed consent versions, but the database accepts all of them. A client that writes through PostgREST directly
(Q-05, accepted for now) could store them. This change makes the database refuse what the API refuses (roadmap
F-20, backlog B-17).

## Starting Point

The rules live in `parsePlanForm`, `parseDoneForm` (`src/lib/screenings/rules.ts`), `parseProfileForm`
(`src/lib/profile.ts`) and `api/consent/grant.ts`. The tables have only static checks (birth year 1900–2100,
first-of-month, day-in-month); `appointment_date` and `consent_version` have none.

## Desired End State

A write by `authenticated`/`anon` that breaks any of the rules fails with 23514; the app's own writes, the confirm
flow, the cron and rows already stored keep working. pgTAP covers each rule at its boundary, and no test fixture
breaks as the calendar moves on.

## Key Decisions Made

| Decision                           | Choice                                                                              | Why (1 sentence)                                                                                                        | Source              |
| ---------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Form of the "today"-relative rules | `BEFORE INSERT/UPDATE` triggers, not `CHECK`                                        | Postgres assumes a `CHECK` is immutable and re-checks it on every update and restore; plans age into the past by design | Research            |
| Roles checked                      | `authenticated`, `anon` only                                                        | The threat is a client reaching PostgREST; cron fixtures write as `postgres` around a fake today                        | Orchestrator        |
| Slack                              | Appointment lower bound today − 1; upper bound +2 years +1 day; Warsaw year for age | The database must never be stricter than the API (midnight race, 29 Feb clamping, UTC vs Warsaw year)                   | Orchestrator / Plan |
| When a trigger checks              | On insert or when the rule's value changes                                          | Aged plans stay deletable and confirmable; the reminder toggle never re-checks age                                      | Plan                |
| Consent check                      | Format `YYYY-MM-DD[.N]`, `NOT VALID`                                                | Immutable, no upkeep per version bump, never fails `migrate` on unknown production rows                                 | Orchestrator        |
| VALIDATE                           | Later: follow-up note + owner runs a read-only prod query                           | Workers never touch production                                                                                          | Orchestrator        |
| Adjacent rules                     | Smoking years + years since quitting ≤ age; last exam day ≤ today                   | Same rows, same date/age rule family                                                                                    | Orchestrator        |
| Missing profile on a done record   | Skip the birth-year lower bound                                                     | The API always has a profile; pgTAP fixtures do not                                                                     | Plan                |
| Cron fixture dates                 | Seed as `postgres` instead of rewriting to the real date                            | Claim functions take "today" as a parameter; role of the seed write is irrelevant to them                               | Plan                |

## Scope

**In scope:**

- One additive migration: 3 trigger functions + triggers, 1 `NOT VALID` check
- New `app_rules.test.sql`; calendar-independent fixtures in `screening_records` and `appointment_reminders`
- `consent.test.ts` guarding the constant's format; comments in `consent.ts`, `profile.ts`, `rules.ts`
- Follow-up note for `VALIDATE`

**Out of scope:**

- `VALIDATE CONSTRAINT`, an upper age bound, "current consent version only", API/UI/i18n changes, a new table,
  updating the domain distillation, roadmap status

## Architecture / Approach

Security-invoker plpgsql trigger functions (`search_path = ''`, EXECUTE revoked from every API role) compute Warsaw
"today" as `confirm_screening_plan` does, return early for non-client roles and unchanged values, and raise
`check_violation` with a message that carries no row values. The API stays the first line and maps any write error
to `save_failed`, so users see no difference.

## Phases at a Glance

| Phase                              | What it delivers                                                | Key risk                                                                |
| ---------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1. Database guards and pgTAP       | Migration, `app_rules.test.sql`, fixture fixes, types unchanged | A bound stricter than the API; a fixture that still depends on the date |
| 2. App-side guard, notes and smoke | `consent.test.ts`, comments, VALIDATE note, local smoke         | Smoke under the shared DB lock                                          |

**Prerequisites:** local Supabase stack up; shared DB lock for every DB step.
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- Production consent rows are assumed well formed (all three versions the app ever wrote are); `NOT VALID` makes
  this safe until the owner's query confirms it.
- Workers run in UTC (inference); the Warsaw-year age check is looser or equal either way.

## Success Criteria (Summary)

- A direct client write that the API would refuse is refused by the database, for every rule listed.
- `npx supabase test db`, `npm test` and smoke pass; the migration cannot fail `migrate` on existing rows.
- The owner has the query and the one-line migration to validate the consent check later.
