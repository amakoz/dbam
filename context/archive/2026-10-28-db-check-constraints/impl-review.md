<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Database guards for the app-only rules (F-20)

- **Plan**: context/changes/db-check-constraints/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-28
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension           | Verdict                 |
| ------------------- | ----------------------- |
| Plan Adherence      | WARNING (1 observation) |
| Scope Discipline    | PASS                    |
| Safety & Quality    | PASS                    |
| Architecture        | PASS                    |
| Pattern Consistency | PASS                    |
| Success Criteria    | WARNING (1 observation) |

## Scope and evidence

Commits `60f3895` (p1), `e2de957` (p2), `03e47f3` (epilogue) against `origin/main`. Every planned file is in the diff and
nothing outside the plan changed: `supabase/migrations/20261028131057_app_rule_checks.sql`,
`supabase/tests/database/app_rules.test.sql` (35 assertions), fixture edits in `screening_records.test.sql` and
`appointment_reminders.test.sql` (plan counts 57 and 66 unchanged), `src/lib/consent.test.ts`, comment-only edits in `consent.ts`,
`profile.ts` and `screenings/rules.ts`, and `follow-ups/validate-consent.md`. `src/lib/database.types.ts` is unchanged, as planned.

## Focus checks requested by the orchestrator

- **Additive-first.** The migration only adds: 3 `create function`, 3 `create trigger`, and 1 `add constraint … not valid`. It drops
  nothing, alters no column and rewrites no row. Existing rows are not scanned, so `migrate` cannot fail on production data.
- **No service_role grants.** It grants nothing. EXECUTE on the three trigger functions is revoked from
  `public, anon, authenticated, service_role` (migration `:136-138`), and `app_rules.test.sql` asserts it for all three API roles.
  The migration adds no table, so the `service_role` table guard (`appointment_reminders.test.sql:102-116`) still covers every
  user table, and it passes.
- **Worker-rollback safety.** Every bound is no stricter than the API, which this review checked against the code. Appointments
  run from today − 1 to `(today + 2 years)::date + 1`, against `date < today` and `date > addYears(today, 2)` in `rules.ts:131`. Done
  months run from `make_date(birth, 1, 1)` to the current Warsaw month, against `rules.ts:160`. Age is the Warsaw year − `birth_year`
  ≥ 18, and the Warsaw year is never behind the Worker's `getFullYear()`. The smoking rule `coalesce` sum ≤ age matches `profile.ts:100-119`.
  These rules shipped with their tables in #35 (`6f1a980`) and #59 (`826f9c2`) and are unchanged since, so no deployable Worker
  version sends a value the guards refuse. The consent format accepts every version the app has used. The forward-fix path
  (drop one trigger in a new migration) is written in the plan's Migration Notes.
- **Role scope.** `current_user not in ('authenticated', 'anon')` inside default security-invoker functions. That checks PostgREST
  writes and `confirm_screening_plan` (security invoker). `withdraw_health_data_consent` (security definer, deletes plus `withdrawn_at`)
  and the `postgres` fixtures are skipped. The pgTAP "postgres may write a past date" case pins this.
- **Plan-review fixes landed.** Every refusal asserts its rule's message. The day rule is checked before the month bounds, and the
  "tomorrow" case is built in tomorrow's month. "+2 years + 1 day accepted" pins the 29 Feb slack. There is one refused UPDATE per
  rule branch, and the upsert to a past date is refused. The withdrawal consequence of `NOT VALID` is in the migration header and
  the follow-up note.

## Success criteria (re-run by this review, 2026-10-28)

| Row | Command                                                                     | Result                                                       |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1.1 | `npx supabase migration up` (under the DB lock)                             | pass (already applied, nothing pending)                      |
| 1.2 | `npx supabase test db`                                                      | pass — 8 files, 386 tests, `app_rules.test.sql` ok           |
| 1.3 | `npm run db:types` + `git diff --exit-code src/lib/database.types.ts`       | pass — no diff                                               |
| 1.4 | grep for literal appointment dates written as `authenticated` (heuristic)   | pass — none in `screening_records` or `app_rules`            |
| 1.5 | `npm run lint`, `npx prettier --check context/changes/db-check-constraints` | pass                                                         |
| 2.1 | `npm test`                                                                  | pass — 28 files, 600 tests                                   |
| 2.2 | `npm run lint`, `npx astro check`                                           | pass — 0 errors, 0 warnings                                  |
| 2.3 | `BASE_URL=http://127.0.0.1:$DBAM_PORT npm run smoke` (under the DB lock)    | pass — "All smoke steps passed"                              |
| 1.6 | Manual: bounds never stricter than the API                                  | ticked by the implementer; independently confirmed here (F2) |
| 2.4 | Manual: owner runs the read-only production query                           | open on purpose (owner, after merge)                         |

## Findings

### F1 — Three deliverables live outside the diff and depend on later steps

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: plan.md Phase 2 §3 (closing paragraph); `context/changes/db-check-constraints/follow-ups/validate-consent.md:47`
- **Detail**: The plan, after plan-review F3/F4/F5, promises items that no commit can carry yet. (a) The PR description must explain why
  the date and age rules are triggers rather than the roadmap's "check constraints", list `follow-ups/validate-consent.md`, and
  ask the owner to run the query soon after merge. (b) The `/10x-archive` commit must add a one-line `context/foundation/backlog.md`
  entry pointing at the VALIDATE follow-up. `/10x-archive` does not do (b) on its own, so if (b) is skipped, the VALIDATE is
  remembered only inside an immutable archive folder.
- **Fix**: At the PR stage, check (a) in the PR body. At archive, add the `backlog.md` line in the archive commit, as the
  follow-up note says.
- **Decision**: ACCEPTED — (a) in the PR body, (b) the backlog.md line in the archive commit (orchestrator, 2026-10-28)

### F2 — Manual row 1.6 was ticked by the implementing worker

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: plan.md Progress row 1.6 (`— 60f3895`)
- **Detail**: Row 1.6 says "Reviewer reads the migration header and confirms each bound is never stricter than the API". It was
  ticked in the implementation commit, with no record of who reviewed it. This review did the check independently: every bound
  above matches `rules.ts:131,160` and `profile.ts:69-119` with the stated slack. So the tick is correct, but the row's evidence is
  this report, not the commit.
- **Fix**: None needed in code. If you want the row's evidence to point at this review, cite `impl-review.md` on row 1.6.
- **Decision**: ACCEPTED — impl-review.md cited as row 1.6 evidence in plan.md (orchestrator, 2026-10-28)
