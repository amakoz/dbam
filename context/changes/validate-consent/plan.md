# Validate the consent version check Implementation Plan

## Overview

F-20 (`db-check-constraints`) added `health_data_consents_version_format` as `NOT VALID`, so the CI `migrate` job
could not fail on rows already in production. The owner's read-only production query returned zero offending rows
on 2026-10-29, so this change validates the check with one additive migration, pins the validated state in pgTAP
and closes backlog B-18.

## Current State Analysis

- The check is defined in `supabase/migrations/20261028131057_app_rule_checks.sql:151-153` with `not valid`; the
  header (`:23-27`) explains why and points to the follow-up note.
- `supabase/tests/database/app_rules.test.sql:228-231` asserts `convalidated = false` with the description
  "the consent version check is NOT VALID (existing rows not yet validated)". The four behaviour assertions above it
  (`:202-226`) hold whether the check is validated or not. `plan(35)` is at `:7`.
- The app writes only `HEALTH_DATA_CONSENT_VERSION = "2026-09-30"` (`src/lib/consent.ts:10`), which matches the
  pattern.
- CI: `smoke` builds a fresh local stack (`supabase start`) and runs `supabase test db`
  (`.github/workflows/ci.yml:49-54`); `migrate` runs `supabase db push` against production after merge
  (`ci.yml:141`) and gates `deploy` (`ci.yml:146`).
- Backlog B-18 sits under P2 (`context/foundation/backlog.md:50-52`).

## Desired End State

`pg_constraint.convalidated` is `true` for `health_data_consents_version_format` locally, in CI and, after merge, in
production. pgTAP pins that state. B-18 is listed under the backlog's **Done** with a pointer to this change.

### Key Discoveries:

- The migration and the assertion flip must ship together: once the migration exists, the old `false` assertion
  fails in `supabase test db` (`app_rules.test.sql:228-231`).
- `src/lib/database.types.ts` holds no constraint metadata (0 grep hits for "constraint"), so `npm run db:types`
  should produce no diff.
- `VALIDATE CONSTRAINT` takes a `SHARE UPDATE EXCLUSIVE` lock on the table, which does not block reads or row
  writes (PostgreSQL ALTER TABLE docs).

## What We're NOT Doing

- No edit to `20261028131057_app_rule_checks.sql` (already applied in production; its pointer to the archived
  follow-up note stays true).
- No write under `context/archive/` (the follow-up note stays as it is).
- No row rewrite: the owner's query returned zero rows.
- No change to `roadmap.md` (no item carries this Change ID) and no app code change beyond the comment above
  `HEALTH_DATA_CONSENT_VERSION` in `src/lib/consent.ts` (plan review F3).
- No new pgTAP assertion: the existing one flips, `plan(35)` stays.

## Implementation Approach

One phase, one commit: create the migration with `npx supabase migration new validate_consent_version_check`, flip
the assertion, move B-18 to Done, then run the DB gates under the shared DB lock.

## Phase 1: Validate the check

### Overview

Mark the consent version check as validated, pin it in pgTAP and close B-18.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<timestamp>_validate_consent_version_check.sql` (new, timestamp after `20261028131057`)

**Intent**: Validate the check F-20 left `NOT VALID`, so every row, old and new, is guaranteed to match the version
format. A short header comment states why it is safe now (since F-20 the check refuses every new malformed value
for all roles, and the owner's read-only query found zero older ones on 2026-10-29), that `VALIDATE` fails `migrate`
if a row still violates the check, and that it takes only a `SHARE UPDATE EXCLUSIVE` lock. It names the F-20 comments
it supersedes, `20261028131057_app_rule_checks.sql:23-27` and `:148`, which still say `NOT VALID` (plan review F3).
Additive: a Worker rollback is unaffected.

**Contract**: exactly one statement:

```sql
alter table public.health_data_consents validate constraint health_data_consents_version_format;
```

#### 2. pgTAP assertion

**File**: `supabase/tests/database/app_rules.test.sql`

**Intent**: Pin the validated state instead of the not-valid one.

**Contract**: the `is(...)` at `:228-231` expects `true`; its description becomes "the consent version check is
validated (existing rows checked)" or equivalent. `reset role;` before it and `plan(35)` stay.

#### 3. Backlog

**File**: `context/foundation/backlog.md`

**Intent**: Close B-18 in this change, as the backlog header asks (`:3`).

**Contract**: remove the `### B-18 Validate the consent version check` block from P2; add one line at the end of the
`## Done` list: B-18 done in change `validate-consent` (2026-10-29), naming the new migration file.

#### 4. Consent version comment

**File**: `src/lib/consent.ts`

**Intent**: The comment above `HEALTH_DATA_CONSENT_VERSION` (`:8-9`) sends readers only to the F-20 migration,
whose comments still say `NOT VALID`; name the new migration too (plan review F3). Comment-only, no behaviour change.

**Contract**: the comment names both `supabase/migrations/20261028131057_app_rule_checks.sql` (adds the check) and
the new `<timestamp>_validate_consent_version_check.sql` (validates it).

### Success Criteria:

#### Automated Verification:

- Migration applies to the local stack under the DB lock: `npx supabase migration up`
- All pgTAP files pass, including the flipped assertion: `npx supabase test db`
- Generated types unchanged after `npm run db:types`: `git diff --exit-code src/lib/database.types.ts`
- Changed Markdown is formatted: `npx prettier --check context/foundation/backlog.md context/changes/validate-consent/*.md`

#### Manual Verification:

- The PR's "Manual checks for the human" lists the read-only production query from the follow-up note §1; the owner re-runs it right before merge and reports zero rows
- The PR's "Manual checks for the human" asks the owner to confirm the `migrate` job on `main` passes after merge

**Implementation Note**: The two manual rows are PR checklist items, not local gates; the phase is done once the
automated rows pass and the PR lists them. Row 1.5 is a non-blocking extra check, not a merge gate: under the current
merge policy, manual checks in the PR body don't block auto-merge (plan review F1).

Shared-stack effect (plan review F2): after gates 1.1–1.3 the shared local Supabase keeps the validated constraint,
so every other worktree still on `main`'s `app_rules.test.sql` fails the one `convalidated = false` assertion in
`npx supabase test db` until this PR lands and it merges `origin/main`. Log this in `decisions.md` and in the final
report so the orchestrator can warn other workers. If gate 1.3 shows a diff outside this change, check what other
worktrees applied to the stack before treating it as red; if `migration up` refuses an out-of-order migration, another
worktree has applied a later one.

---

## Testing Strategy

### Integration Tests:

- `npx supabase test db` on the local stack with the new migration applied: the flipped assertion proves the
  validated state; the four behaviour assertions still refuse malformed versions and accept dated ones.
- CI `smoke` repeats it on a fresh stack.

### Manual Testing Steps:

1. Owner runs the read-only query from the follow-up note §1 in the production SQL editor right before merge; expect
   zero rows. Non-blocking: auto-merge does not wait for it.
2. After merge, owner confirms the `migrate` job on `main` passed.

## Migration Notes

A CHECK constraint, even `NOT VALID`, is enforced for every role on every INSERT and UPDATE. Since F-20's migration
reached production (#106, 2026-10-28) no malformed `consent_version` can be written, and the owner's 2026-10-29 query
found zero older ones. `VALIDATE` can therefore fail only if the constraint was dropped or altered by hand in
production. If it does, it raises `23514`, `migrate` fails and `deploy` does not run; the Worker stays on the
previous version, and a red `migrate` on `main` blocks every later deploy until it is fixed. Remedy: the follow-up
note §2 (rewrite the row with the owner, record it), then re-run the job.

## References

- Research: `context/changes/validate-consent/research.md`
- Follow-up note: `context/archive/2026-10-28-db-check-constraints/follow-ups/validate-consent.md`
- F-20 migration: `supabase/migrations/20261028131057_app_rule_checks.sql:151-153`
- Decisions: `context/changes/validate-consent/decisions.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Validate the check

#### Automated

- [ ] 1.1 Migration applies to the local stack under the DB lock: `npx supabase migration up`
- [ ] 1.2 All pgTAP files pass, including the flipped assertion: `npx supabase test db`
- [ ] 1.3 Generated types unchanged after `npm run db:types`: `git diff --exit-code src/lib/database.types.ts`
- [ ] 1.4 Changed Markdown is formatted: `npx prettier --check context/foundation/backlog.md context/changes/validate-consent/*.md`

#### Manual

- [ ] 1.5 The PR's "Manual checks for the human" lists the read-only production query from the follow-up note §1; the owner re-runs it right before merge and reports zero rows
- [ ] 1.6 The PR's "Manual checks for the human" asks the owner to confirm the `migrate` job on `main` passes after merge
