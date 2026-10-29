<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Validate the consent version check

- **Plan**: context/changes/validate-consent/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1
- **Date**: 2026-10-29
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Evidence

- **Diff vs plan** (`origin/main...HEAD`, commits `964b8db`, `3e83af6`, `5f35746`): all four planned changes are
  there and match the plan, with nothing extra.
  - New migration `20261029172839_validate_consent_version_check.sql`: one `VALIDATE` statement, a header that names
    the F-20 comments it supersedes.
  - `app_rules.test.sql:229-230`: the assertion now expects `true` with a new description; `plan(35)` and
    `reset role;` are unchanged.
  - `backlog.md`: B-18 removed from P2, and a Done line added that names the migration.
  - `src/lib/consent.ts:9-10`: a comment-only edit naming both migrations, which plan-review F3 allowed.
  - The F-20 migration and `context/archive/` are untouched.
- **Plan-review triage carried out**: F1 (Migration Notes and Implementation Note restated), F2 (shared-stack effect
  logged in `decisions.md`) and F3 (header pointer and comment) are all in the code and the plan. The skipped
  deliberate-break check is recorded in `decisions.md` with its reason. The assertion read `false` on `main` before
  this migration and reads `true` after it, so it does tell the two states apart.
- **Gates re-run in this review** (under the DB lock, 2026-10-29):
  - 1.1 `npx supabase migration up`: `applied: []`, the migration was already on the stack.
  - 1.2 `npx supabase test db`: `Files=8, Tests=386, Result: PASS`.
  - 1.3 `npm run db:types` + `git diff --exit-code src/lib/database.types.ts`: no diff.
  - 1.4 `npx prettier --check …`: clean.
  - On the shared stack, `pg_constraint.convalidated` is `t`, and `eslint src/lib/consent.ts` passes.
- **Manual rows**: 1.5 and 1.6 are still open on purpose. They are checklist items for the PR and for production
  after merge. Neither is ticked without evidence.

## Findings

### F1 — Migration header names the wrong error for a dropped constraint

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261029172839_validate_consent_version_check.sql:6-8 (same wording in plan.md
  Migration Notes)
- **Detail**: The header says `VALIDATE` "fails (23514) … only if the constraint was dropped or altered by hand in
  production", and points to the follow-up note's row-rewrite remedy. Only the "altered" case gives `23514`: the check
  is dropped, malformed rows are written, then it is re-added `NOT VALID`, and the rewrite fixes those rows. If the
  constraint was dropped and never re-added, `VALIDATE` fails with `42704` (constraint does not exist) instead, and a
  row rewrite does not help. Behaviour is unaffected. The comment only misleads someone working out why `migrate`
  failed, and the migration has not reached production yet, so the comment can still change.
- **Fix**: Reword the header to give both outcomes: `23514` if the check was re-added `NOT VALID` over malformed rows
  (remedy: the follow-up note §2), or `42704` if it no longer exists (remedy: re-create it from
  `20261028131057_app_rule_checks.sql:151-153` first). Mirror this in plan.md Migration Notes, or leave the comment
  as it is because the case is so unlikely.
- **Decision**: ACCEPTED — migration header and plan.md Migration Notes now give both outcomes (23514 and 42704).
