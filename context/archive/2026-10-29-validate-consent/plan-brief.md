# Validate the consent version check — Plan Brief

> Full plan: `context/changes/validate-consent/plan.md`
> Research: `context/changes/validate-consent/research.md`

## What & Why

F-20 added the consent version format check as `NOT VALID`, so rows already in production were not scanned and the
CI `migrate` job could not fail on them. The owner's read-only production query found zero offending rows on
2026-10-29, so the check can now be validated (backlog B-18).

## Starting Point

`health_data_consents_version_format` is `NOT VALID` (`supabase/migrations/20261028131057_app_rule_checks.sql:151-153`)
and pgTAP pins `convalidated = false` (`supabase/tests/database/app_rules.test.sql:228-231`). B-18 is open under P2.

## Desired End State

The check is validated locally, in CI and in production after merge; pgTAP pins `convalidated = true`; B-18 is under
the backlog's **Done**.

## Key Decisions Made

| Decision            | Choice                                                                                            | Why (1 sentence)                                                                          | Source         |
| ------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------- |
| SQL                 | One `alter table … validate constraint …`                                                         | Fixed by the follow-up note; additive, only a `SHARE UPDATE EXCLUSIVE` lock               | Research       |
| Row rewrite         | None                                                                                              | Owner's production query returned zero rows                                               | Research       |
| Test                | Flip the existing assertion, keep `plan(35)`                                                      | One-for-one replacement; behaviour assertions already cover the format                    | Research       |
| Phases              | One phase, one commit                                                                             | The old `false` assertion fails as soon as the migration exists                           | Plan           |
| Backlog             | Move B-18 from P2 to Done in this change                                                          | The backlog header asks for a Done line with a pointer                                    | Plan           |
| Production steps    | PR "Manual checks for the human"                                                                  | Query re-run before merge and the `migrate` result need the owner                         | Plan           |
| Query re-run        | Non-blocking extra check, not a merge gate                                                        | Auto-merge does not wait for PR manual checks; since F-20 no malformed row can be written | Plan review F1 |
| Shared local stack  | Leave the validated constraint applied; log it and report it                                      | Restoring by hand-written SQL is easy to get wrong; the window closes when the PR lands   | Plan review F2 |
| Stale F-20 comments | New migration names `app_rule_checks.sql:23-27, :148`; `consent.ts` comment names both migrations | A reader following the pointer finds the current state                                    | Plan review F3 |

## Scope

**In scope:** new migration; pgTAP assertion flip; backlog B-18 move to Done; the comment above
`HEALTH_DATA_CONSENT_VERSION` in `src/lib/consent.ts`.

**Out of scope:** editing the F-20 migration or the archived follow-up note; row rewrites; roadmap; app behaviour.

## Architecture / Approach

`npx supabase migration new validate_consent_version_check` with one `VALIDATE` statement and a short header; the
`smoke` job proves it on a fresh stack, `migrate` applies it to production after merge.

## Phases at a Glance

| Phase                 | What it delivers                                   | Key risk                                                     |
| --------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| 1. Validate the check | Migration, flipped pgTAP assertion, backlog update | A malformed row added before merge fails `migrate` (`23514`) |

**Prerequisites:** owner's zero-row query (done 2026-10-29); shared DB lock for the local gates.
**Estimated effort:** one short session.

## Open Risks & Assumptions

- Since F-20 the check refuses every new malformed value for all roles, and the 2026-10-29 query found zero older
  ones, so `VALIDATE` can fail only if the constraint was dropped or altered by hand. If it does, `migrate` fails with
  `23514`, `deploy` does not run, and a red `migrate` on `main` blocks every later deploy until the follow-up note §2
  remedy is applied. The owner's pre-merge query re-run is a non-blocking extra check, not a merge gate.
- The shared local Supabase keeps the validated constraint after the gates: other worktrees on `main` fail the one
  `convalidated = false` pgTAP assertion until this PR lands and they merge `origin/main`.

## Success Criteria (Summary)

- `npx supabase test db` passes with `convalidated = true`.
- The `migrate` job on `main` passes after merge.
- B-18 is listed under Done.
