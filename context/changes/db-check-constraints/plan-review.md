<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Database guards for the app-only rules (F-20)

- **Plan**: context/changes/db-check-constraints/plan.md
- **Mode**: Deep (verification done in-context, no sub-agent)
- **Date**: 2026-10-28
- **Verdict**: REVISE
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

6/6 paths ✓ (`src/lib/consent.ts`, `src/lib/profile.ts`, `src/lib/screenings/rules.ts`, `src/lib/database.types.ts`,
`supabase/tests/database/screening_records.test.sql`, `supabase/tests/database/appointment_reminders.test.sql`; `src/lib/consent.test.ts`
is new, as the plan says), 7/7 symbols ✓ (`HEALTH_DATA_CONSENT_VERSION`, `addYears`, `parsePlanForm`, `parseDoneForm`,
`clear_stale_last_done_on`, Warsaw today at `20261005173653_confirm_screening_plan.sql:46`, `…_set_updated_at` trigger names),
brief↔plan ✓, Progress↔Phase ✓ (2 phases, 6 + 4 rows match the Success Criteria bullets, no checkboxes in phase blocks).

## What was checked and holds

- **Additive-first / Worker rollback.** Every rule the triggers mirror shipped with its feature and never changed:
  `smokingLongerThanAge`, `yearsLimit` and `MIN_AGE` in #35 (`6f1a980`), the plan and done-month windows in #59 (`826f9c2`), and the
  tables they guard were created in those same PRs. So no Worker version that can be rolled back to sends a value the guards refuse. The
  slack directions are right: lower appointment bound −1 day (midnight race), upper +1 day (`addYears` rolls 29 Feb to 1 Mar,
  `rules.ts:93-99`), Warsaw year ≥ the Worker's `getFullYear()` (`profile.ts:69-81`). The DB sum rule `coalesce(smoking_years,0) +
coalesce(years_since_quitting,0) ≤ age` is never stricter than `profile.ts:100-119` (for current smokers `years_since_quitting` is null).
- **Trigger role checks.** `current_user` inside a security-invoker function is `authenticated` for PostgREST and for
  `confirm_screening_plan` (security invoker, `…173653:40-41`), so the confirm flow is checked. `withdraw_health_data_consent` is security
  definer, so its writes are skipped, but it only deletes plus `withdrawn_at` (`20260930093108_screening_records.sql:194-213`). Not using
  the JWT role is correct, because pgTAP keeps claims after `reset role`. EXECUTE on trigger functions is not checked when they fire,
  so the revoke is safe (precedent: `set_updated_at`).
- **Fixtures.** The plan's list is complete. `screening_records.test.sql:157,166,268` (in research's list) match zero rows, so row
  triggers never fire. `screening_confirm.test.sql:99-106` (yesterday) passes with the slack, and `:197` uses UTC `current_date`, which is
  never later than Warsaw today. `follow_up_nudges.test.sql:416-427` confirms a plan dated 2026-01-01 as `authenticated`. That already
  proves an aged plan still confirms through the new completion trigger. Profile fixtures (1970/1971/1980, smoking 20+5) pass the age
  rules. The reminders toggle is a plain `.update()` of `reminders_enabled`/`reminders_locale` (`src/pages/api/reminders.ts:27-31`),
  so `UPDATE OF birth_year, …` does not fire.
- **NOT VALID mechanics.** No existing row is scanned, so `migrate` cannot fail on production data. Consent fixtures (`'2026-09-27'`) are
  well formed. `onboarding_profile.test.sql:38` (`update … consent_version = 'forged'`) still gets `42501`, because the privilege check
  runs before any CHECK.

## Findings

### F1 — pgTAP never refuses an UPDATE to an invalid value

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 §2 — New pgTAP file (contract cases)
- **Detail**: Every "rejected" case in the contract is an INSERT. The only UPDATE cases are accepted ones: an aged plan re-saved
  unchanged or cleared to null, and the reminder toggle. A trigger that returns `new` for every `tg_op = 'UPDATE'`, or that gets the
  `is distinct from old` test backwards, passes all listed cases. A PostgREST `PATCH` of an existing row is the same Q-05 vector as an
  insert, and the "insert or changed" logic is the newest code here. So every trigger needs a refused UPDATE: a plan re-dated to
  today − 2, a done record's month moved to next month and its `last_done_on` to a later day, a profile's `birth_year` moved under 18
  and `smoking_years` raised above the age. The upsert path (`insert … on conflict do update`, which the plan's Critical Implementation
  Details rely on) has no case either.
- **Fix A ⭐ Recommended**: Add one refused UPDATE per trigger (plan, completion month, completion day, profile age, profile smoking sum)
  and one upsert case. The upsert case uses `on conflict … do update` on an aged plan with an invalid new date and is refused.
  Bump `plan(n)` to match.
  - Strength: Pins the branch the plan itself calls subtle ("changed only applies to the UPDATE branch"). Each case is one statement in
    the existing fixture.
  - Tradeoff: About 6 more assertions in `app_rules.test.sql`.
  - Confidence: HIGH — the gap follows directly from the contract list.
  - Blind spot: None significant.
- **Decision**: PENDING

### F2 — Rejection cases can pass on the wrong rule

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §1 (completion trigger) and §2 (cases)
- **Detail**: All new and existing static checks raise `23514` (first-of-month, `last_done_on_in_month`, `birth_year between`, smoking
  1–100). `throws_ok(…, '23514', null, …)` therefore can't tell which rule refused a row. Three cases are affected:
  (a) "`last_done_on` later than today rejected". On the last day of a month, today + 1 falls in next month, so the case either
  breaks `last_done_on_in_month` or needs next month's `last_done_month`. The day rule is then never what refuses it, unless the
  trigger checks the day before the month. (b) The upper appointment bound's slack is not pinned. "+2 years accepted" and
  "+2 years +2 days rejected" both pass if the `+ 1` is dropped, so the 29-Feb decision (`decisions.md`, "Appointment upper bound")
  goes untested. (c) "−17 rejected" and the smoking cases would also pass on a static check if fixture values drift.
- **Fix**: Have the trigger messages name the rule and assert them (`throws_ok(sql, '23514', '<message>', desc)`). In
  `validate_screening_completion`, check `last_done_on ≤ today` before the month bounds. Build the "later day" case with
  `last_done_month = date_trunc('month', today + 1)` so it fails the day rule on every calendar day. Add "today + 2 years + 1 day
  accepted".
- **Decision**: PENDING

### F3 — NOT VALID check can block a user's consent withdrawal

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 §1 (consent `NOT VALID` check), Phase 2 §3 (follow-up note), Migration Notes
- **Detail**: A `NOT VALID` CHECK is still evaluated on every UPDATE of an old row. `withdraw_health_data_consent` runs
  `update … set withdrawn_at = now()` on the caller's active consent (`20260930093108_screening_records.sql:209-211`). For a row whose
  `consent_version` is malformed, that update raises `23514`, which rolls back the whole function, so the user cannot withdraw
  (GDPR Art. 7(3)). Such a row is plausible exactly under Q-05: the insert policy checks only `user_id` and `withdrawn_at`
  (`20260927190303_onboarding_profile.sql:31-34`), so a direct client could already have stored `'forged'`. The research names this
  consequence ("Migration mechanics", last bullet). The plan's Migration Notes, migration header and follow-up note don't. The
  follow-up note only says "what to do with an offending row" before `VALIDATE`, while the risk starts at deploy.
- **Fix A ⭐ Recommended**: Keep `NOT VALID`. Add the withdrawal consequence to the migration header, Migration Notes and the follow-up
  note. The follow-up note gets the remedy (rewrite the offending `consent_version` as `postgres` before that user withdraws, or before
  `VALIDATE`). The PR's "Manual checks for the human" asks the owner to run the read-only query soon after merge, not only before the
  later `VALIDATE`.
  - Strength: No design change; the owner's query (already planned in 2.4) closes the window, and git history shows only well-formed
    versions from the app.
  - Tradeoff: The window between deploy and the owner's query stays open; the remedy is manual.
  - Confidence: HIGH — CHECK semantics on UPDATE are documented Postgres behaviour; the withdraw code is read above.
  - Blind spot: Production contents are unknown until the owner runs the query.
- **Fix B**: Enforce the consent format with a `BEFORE INSERT` trigger instead of a CHECK, so updates of old rows are never checked.
  - Strength: Withdrawal can never be blocked, whatever production holds.
  - Tradeoff: Loses the immutable, declarative CHECK and the later `VALIDATE` path the orchestrator chose (`decisions.md`, research Q2/Q3).
    It's a fourth trigger function to maintain, and the guard does not apply to non-client roles unless it is scoped differently.
  - Confidence: MEDIUM — reverses an orchestrator decision.
  - Blind spot: Whether the orchestrator wants the check to apply to every role (a CHECK does, the trigger pattern here does not).
- **Decision**: PENDING

### F4 — No forward-fix story if a guard refuses valid production writes

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Migration Notes
- **Detail**: Migration Notes cover rollback of the Worker only. If a trigger has a bug that refuses an API-valid write (time zone,
  leap day, month boundary: the cases smoke can't hit on the day CI runs), a Worker rollback doesn't help. Users get `save_failed`
  until a forward migration lands through a full PR cycle (`ci` + `smoke`, then `migrate`). The roadmap outcome also says "check
  constraints" while the plan delivers triggers for four of five rules. That is justified in research, but a reader of F-20 will
  expect it explained.
- **Fix**: Add two lines to Migration Notes. (1) The recovery is a forward migration that drops the faulty trigger alone (the three
  triggers are independent). (2) The PR description says why the date and age rules are triggers rather than CHECKs (link
  `research.md` Summary §1).
- **Decision**: PENDING

### F5 — Follow-up note breaks the `follow-ups/` convention and isn't tracked after archive

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §3 — VALIDATE follow-up note
- **Detail**: Earlier changes keep follow-ups in a `follow-ups/` subfolder and list them in the PR
  (`context/archive/2026-10-06-recurrence-unit-tests/follow-ups/missing-entry-plan.md`, `context/archive/2026-10-06-follow-up-nudges/follow-ups/`).
  The plan writes `follow-up-validate-consent.md` at the change-folder root. After `/10x-archive` the note sits in an immutable
  archive folder, and nothing on the roadmap (`## Backlog Handoff`, `roadmap.md:167`) points at the `VALIDATE` that still has to happen.
- **Fix**: Write it as `context/changes/db-check-constraints/follow-ups/validate-consent.md` and list it under the PR's follow-ups.
  Either add a one-line Backlog Handoff entry in the archive commit or record in `decisions.md` why the owner tracks it elsewhere.
- **Decision**: PENDING
