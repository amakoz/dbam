<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Confirm Exam and Recurrence

- **Plan**: context/changes/confirm-exam-and-recurrence/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-05
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Automated criteria re-run on `106acfa`:

- pgTAP: 5 files, 226 tests, pass
- `db:types`: clean
- lint: pass
- `astro check`: 0 errors
- `ui:check`: pass
- build: pass
- Prettier: pass
- smoke: passed on re-run (see F7)

All manual rows were confirmed by the owner on 2026-10-05. Drift review: every planned item is MATCH or a documented adaptation; no EXTRA changes and no "What We're NOT Doing" violations.

## Findings

### F1 — Worker rollback breaks re-marking a confirmed exam done

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261005173653_confirm_screening_plan.sql:13-18
- **Detail**: The pre-S-05 `done` upsert sends only `{catalog_slug, last_done_month}`, so `ON CONFLICT DO UPDATE` keeps an existing `last_done_on`. After a rollback, re-marking a confirmed exam done fails the new CHECK (`save_failed`) in two cases:
  - with a different month, which the plan's Critical Implementation Details mention;
  - with "don't know" (a null month), which the plan didn't mention.

  The plan accepted the risk, but it is the exact case the "a Worker rollback never undoes a schema change" rule exists for.

- **Fix A ⭐ Recommended**: Add a `BEFORE UPDATE` trigger on `screening_completions` that sets `last_done_on := null` when `last_done_month` changes and `last_done_on` was not changed in the same statement.
  - Strength: Makes old and new Workers equally safe, and keeps the CHECK as the invariant.
  - Tradeoff: One more trigger plus pgTAP cases. The app's explicit `last_done_on: null` becomes belt-and-braces.
  - Confidence: HIGH. The table already uses `set_updated_at` triggers, so the pattern is established.
  - Blind spot: A same-month re-mark on an old Worker would still keep the stale day. It is harmless for recurrence and only affects display.
- **Fix B**: Keep the accepted risk, and fix the plan text to include the null-month case.
  - Strength: No schema change.
  - Tradeoff: A rollback still produces user-visible `save_failed` on confirmed rows.
  - Confidence: MED. It depends on rollbacks staying rare.
  - Blind spot: How long a rollback would last in practice.
- **Decision**: FIXED (Fix A): trigger `clear_stale_last_done_on` in migration `20261005180420_clear_stale_last_done_on.sql`; pgTAP covers the month-only and null-month updates and a day set in the same statement

### F2 — Double-submitted confirm shows "invalid request"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/screenings.ts:69
- **Detail**: On a double click, the second request waits on the first request's row lock, then finds no plan and gets `not_found`, which maps to `invalid_request`. The browser shows the last response, so the user sees an error even though the confirm succeeded. The data stays consistent.
- **Fix**: Map `not_found` to a plain redirect back to the row (`/dashboard#screening-<slug>`, no error). The row then shows its real state ("Done" after a double submit, or the current state for a stale form).
- **Decision**: FIXED: `not_found` redirects to `/dashboard#screening-<slug>` without an error

### F3 — "Cannot backdate" comment overstates the guarantee

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261005173653_confirm_screening_plan.sql:31-33
- **Detail**: Through PostgREST, a user can write `last_done_on` directly (within its month), or insert a past-dated plan (there is no DB date check) and confirm it. Only the app's own flow enforces "today". The impact is nil (owner-only data under RLS and consent, no escalation), but the comment claims more than the database enforces.
- **Fix**: Reword it to "computed here, so the app's confirm flow cannot backdate it". Applied in the follow-up migration, because the original migration is not edited.
- **Decision**: FIXED: accurate `comment on function` in `20261005180420_clear_stale_last_done_on.sql`

### F4 — Confirm without consent shows "save failed"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/screenings.ts:66
- **Detail**: A missing or withdrawn consent, or a retired entry, raises 42501 in the RPC and maps to `save_failed`. The `plan` and `done` branches send a consent-less user to `/onboarding` instead. In practice a consent-less user can't reach the dashboard form, so only a stale tab hits this.
- **Fix**: On an RPC error with code `42501`, redirect to `/onboarding`; keep `save_failed` for other errors.
- **Decision**: FIXED (refined): on 42501, no consent → `/onboarding`; consent present (retired entry) → `screening_not_available`, matching plan/done

### F5 — Function keeps the default service_role EXECUTE grant

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261005173653_confirm_screening_plan.sql:76
- **Detail**: `revoke … from public, anon` leaves Supabase's default EXECUTE for `service_role`. This is harmless (with no `auth.uid()` the function raises, and the user tables are revoked for `service_role`), but it doesn't match the lockdown style in `appointment_reminders`.
- **Fix**: Revoke EXECUTE from `service_role` too, in a follow-up migration, with a pgTAP assertion.
- **Decision**: FIXED: EXECUTE revoked from service_role in `20261005180420_clear_stale_last_done_on.sql`; pgTAP asserts it

### F6 — Smoke "plan for today" can flake across Warsaw midnight

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:60-70,232
- **Detail**: `today` is computed once at startup. The new step plans for exactly that day, so a run that crosses Warsaw midnight gets `invalid_appointment_date`. The script's "never flake around midnight" comment no longer holds for this step.
- **Fix**: Soften the comment to name this one step. Recomputing `today` would break the later `data-last-done-on="<today>"` assertion.
- **Decision**: FIXED: smoke date comment names the one step that can flake

### F7 — Smoke's first run after idle fails with 500 (#68, not S-05)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: N/A (`dashboard sends new user to onboarding`, before any S-05 step)
- **Detail**: On 2026-10-05 smoke failed 2 of 9 runs, each time the first run after idle and on #68's step. Every immediate re-run passed. The failing step reads consent, which S-05 doesn't touch, so this is the "JWT issued at future" issue (#68). Its fix is in PR #72 from the parallel worktree.
- **Fix**: No change here. Merge #72 and rebase.
- **Decision**: ACCEPTED: tracked in #68, fix in PR #72; failed again on the first run after a preview restart during triage, the re-run passed
