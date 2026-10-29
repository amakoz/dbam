---
date: 2026-10-29T18:19:43+01:00
researcher: Claude (worker, validate-consent)
git_commit: a5bf2b7208de495e93bb38969eb05df26441c803
branch: feat/validate-consent
repository: amakoz/dbam
topic: "Validate the NOT VALID check health_data_consents_version_format (B-18)"
tags: [research, codebase, supabase, migrations, pgtap, health-data-consents]
status: complete
last_updated: 2026-10-29
last_updated_by: Claude (worker, validate-consent)
---

# Research: Validate the NOT VALID check health_data_consents_version_format (B-18)

**Date**: 2026-10-29T18:19:43+01:00
**Researcher**: Claude (worker, validate-consent)
**Git Commit**: a5bf2b7208de495e93bb38969eb05df26441c803
**Branch**: feat/validate-consent
**Repository**: amakoz/dbam

## Research Question

What does the follow-up of F-20 (B-18) need: one additive migration that runs
`alter table public.health_data_consents validate constraint health_data_consents_version_format;`
and a flip of the pgTAP assertion "the consent version check is NOT VALID" to `convalidated = true`?
Which files, tests and CI steps does it touch, and what can go wrong?

## Summary

The change touches 2 files plus the change folder and the backlog entry:

1. A new migration under `supabase/migrations/` (timestamp after `20261028131057`) with the one `VALIDATE` statement
   and a header comment in the style of the F-20 migration.
2. `supabase/tests/database/app_rules.test.sql:228-231`: the `is(... convalidated ..., false, ...)` assertion becomes
   `true` with a new description. The test count stays `plan(35)` (`app_rules.test.sql:7`) — one assertion is replaced,
   none added.

No type regeneration is needed: validating a constraint changes no column (`src/lib/database.types.ts` has 0 matches for "constraint" or "version_format", grep). No app code reads the
constraint. The owner's precondition is met: the read-only production query returned zero rows on 2026-10-29
(change.md Notes). The remaining risk is a malformed row inserted into production between that query and the
`migrate` job; since F-20 every new row is checked by the constraint itself, so such a row can only predate F-20's
migration — and the query covered those.

## Detailed Findings

### The constraint today

- Added `not valid` in `supabase/migrations/20261028131057_app_rule_checks.sql:151-153`:
  `check (consent_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(\.[0-9]+)?$') not valid`.
- The migration header explains why it was left NOT VALID and points to the follow-up
  (`20261028131057_app_rule_checks.sql:23-27`). That migration is already applied in production and must not be
  edited; its pointer to `context/archive/.../follow-ups/validate-consent.md` stays true after this change.
- In the inspected `supabase/migrations/` and `supabase/tests/` trees, `health_data_consents_version_format` appears
  at `20261028131057_app_rule_checks.sql:152` and `app_rules.test.sql:208,214,229` only (grep).

### The pgTAP test

- `supabase/tests/database/app_rules.test.sql:202-226` — four behaviour assertions (two refused inserts with the
  constraint's exact error message, two accepted inserts). These hold for a valid or not-valid check alike and need
  no change.
- `supabase/tests/database/app_rules.test.sql:228-231` — `reset role;` then
  `is((select convalidated from pg_constraint where conname = 'health_data_consents_version_format'), false, 'the consent version check is NOT VALID (existing rows not yet validated)')`.
  This is the one assertion to flip to `true`. After the new migration, the local `supabase start` / `db reset` path
  applies the VALIDATE, so the current assertion would fail — the flip and the migration must land together.
- `plan(35)` at `app_rules.test.sql:7` is unchanged by a one-for-one replacement.

### Rows already in the table

- The app writes `HEALTH_DATA_CONSENT_VERSION = "2026-09-30"` (`src/lib/consent.ts:10`), matching the pattern. The
  follow-up note lists the historical values `2026-09-27`, `2026-09-28`, `2026-09-30`, all matching.
- `authenticated` holds `insert (user_id, consent_version, locale)` on the table
  (`supabase/migrations/20260927190303_onboarding_profile.sql:46`) — the Q-05 direct-write path that motivated F-20.
  Since `20261028131057` that path is checked on insert.
- Local/CI data: `supabase start` builds a fresh database from migrations; the pgTAP fixtures insert rows only after
  all migrations are applied, so the VALIDATE scans an empty table locally and in the CI `smoke` job.
- Production: owner's read-only query on 2026-10-29 returned zero rows (change.md Notes; query text in the follow-up
  note §1).

### CI path

- `smoke` job: `supabase start` (`.github/workflows/ci.yml:49-52`) applies all migrations, then `supabase test db`
  (`ci.yml:53-54`) runs the pgTAP suite — this is where the flipped assertion is proven.
- `migrate` job: `supabase db push --db-url "$SUPABASE_DB_URL" --skip-vault --yes` (`ci.yml:141`), runs after merge
  to `main` and before `deploy` (`ci.yml:146`, `needs: [ci, smoke, migrate]`). If a production row violated the
  check, `VALIDATE` would raise `23514` here, the push would fail and `deploy` would not run; the Worker would stay on
  the previous version, which does not depend on this migration.

### Lock and rollback

- `ALTER TABLE ... VALIDATE CONSTRAINT` takes a `SHARE UPDATE EXCLUSIVE` lock on the table (PostgreSQL docs,
  ALTER TABLE; from memory, Context7 not consulted — Postgres is not in the CLAUDE.md Context7 list). It does not
  block reads or row writes.
- The migration is additive in effect: it only marks an existing check as validated. A Worker rollback is unaffected,
  since no Worker version writes a value the check refuses (F-20 header, `20261028131057_app_rule_checks.sql:4-5`).

## Code References

- `supabase/migrations/20261028131057_app_rule_checks.sql:23-27` — why the check is NOT VALID, pointer to follow-up
- `supabase/migrations/20261028131057_app_rule_checks.sql:146-153` — the constraint definition
- `supabase/tests/database/app_rules.test.sql:7` — `plan(35)`
- `supabase/tests/database/app_rules.test.sql:202-226` — consent version behaviour assertions (unchanged)
- `supabase/tests/database/app_rules.test.sql:228-231` — the `convalidated = false` assertion to flip
- `src/lib/consent.ts:10` — the version the app writes
- `.github/workflows/ci.yml:49-54` — smoke job: local Supabase + pgTAP
- `.github/workflows/ci.yml:141` — migrate job: `supabase db push` to production
- `context/foundation/backlog.md:50-52` — B-18 entry

## Architecture Insights

- Migrations carry a long header comment stating intent, scope and rollback safety (F-20 migration lines 1-27); the
  new migration should follow suit, briefly.
- pgTAP assertions describe the schema state they pin; flipping a description together with the value keeps the
  test self-explanatory.
- Backlog items move to **Done** with a pointer when resolved (`context/foundation/backlog.md:3`); per the worker
  protocol the backlog/roadmap edits belong in the archive commit, not the implement phase.

## Historical Context (from prior changes)

- `context/archive/2026-10-28-db-check-constraints/follow-ups/validate-consent.md` — the follow-up spec. Its claims:
  - "new rows are checked, rows already in production are not scanned" — supported (`not valid`, migration line 153).
  - "VALIDATE takes only a SHARE UPDATE EXCLUSIVE lock and fails the migrate job if a row still violates the check" —
    consistent with the CI path above (`ci.yml:141`); lock level from PostgreSQL docs (memory).
  - "run the query again right before merging it" — still a step for the owner; this research cannot run it.
  - the assertion text "the consent version check is NOT VALID" — supported (`app_rules.test.sql:230`).

## Related Research

- `context/archive/2026-10-28-db-check-constraints/` (F-20) — the change that introduced the constraint.

## Open Questions

- Owner step: re-run the read-only query from the follow-up note §1 just before the PR merges (the follow-up asks for
  it; the 2026-10-29 run already returned zero rows). A planning decision, not a research gap: whether the plan lists
  this as a Manual Progress row.
