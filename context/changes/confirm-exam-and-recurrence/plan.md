# Confirm Exam and Recurrence Implementation Plan

## Overview

S-05 (PRD US-03, FR-008, FR-009; issue #23). When a planned exam's appointment day arrives, the user confirms that the exam happened with one click. One database call records the exact day as the last-done date and deletes the plan (and with it any S-04 reminder rows). The due-again logic shipped in S-03 then hides the exam until `interval` months later and returns it to its tier.

## Current State Analysis

S-03 already shipped most of US-03 (research: `context/changes/confirm-exam-and-recurrence/research.md`, Summary):

- **Mark done:** "Mark done" (optional month/year) turns a plan into a completion. The endpoint upserts the completion, then deletes the plan in a second PostgREST call (`src/pages/api/screenings.ts:108-124`). The two calls are not atomic.
- **Due again:** `partitionDashboard` keeps a completion in "Done" until `nextDueMonth` (`last_done_month` + interval months, from the 1st) and then returns the exam to its tier (`src/lib/screenings/rules.ts:163-176,248-258`). Exams with no fixed interval stay in "Done" with a "no set interval" note (`DoneItem.astro:48-52`). 11 of the 19 active catalog entries have no fixed interval.

What is missing:

- **No passed-appointment state.** A plan whose date has passed renders like a future one (`PlanItem.astro:47-51`). Its change-date form prefills the past date with `min=today` (`ScreeningActions.astro:77-87`), so it can't be resubmitted unchanged.
- **Completions store a month only.** A CHECK forces the first day of the month (`20260930093108_screening_records.sql:48-50`), so the exact appointment day would be lost.
- **The reminders hint counts any dated plan**, including passed ones (`dashboard.astro:73`). S-04 only sends for dates after today (`20260930125726_appointment_reminders.sql:103`).

## Desired End State

On the appointment day or later (Warsaw calendar), the plan's row in "Your plans" shows "Did the exam take place on {date}?" with a primary "Yes, confirm" button. Confirming removes the plan and adds a completion with `last_done_month` = that month and `last_done_on` = that day. The row moves to "Done" with "Last done: 20 October 2026" and "Due again: {month}", or with the no-interval note. A plan with a future date or no date cannot be confirmed: the endpoint and the function both reject it. Verified by pgTAP (the function), smoke (plan for today → confirm → done; confirming a future plan → error) and manual checks of a past-dated plan.

### Key Discoveries:

- A plan dated today can be created through the API (`parsePlanForm` accepts `date >= today`, `rules.ts:121`). That makes the confirm happy path smoke-testable without seeding.
- `service_role` has no table privileges (`20260930125726_appointment_reminders.sql:167-168`). Smoke is HTTP-only. So a plan dated days ago can only be created in pgTAP (as `authenticated`: RLS has no date check) or by hand with local psql.
- Deleting a plan cascades its `appointment_reminders` rows (`20260930125726_appointment_reminders.sql:54`). The claim only selects `appointment_date > today` (:103), so passed plans are never emailed anyway.
- Column grants are explicit: `authenticated` may write only `catalog_slug` and the date column (`20260930093108_screening_records.sql:168-173`). A PostgREST upsert sets every payload column, so any column the app writes needs an UPDATE grant.
- `describeLastDone` (`src/lib/screenings/format.ts:48-56`) renders the "last done" line on both `DoneItem` and the tier row (`RecommendationItem`, via the `lastDone` map). Changing it there covers both without touching `RecommendationItem.astro`, which #67 is editing.

## What We're NOT Doing

- No stored next-due date and no SQL interval resolution. S-05 keeps computing next due in TypeScript at render time; S-06 (#24) decides how its cron reads it.
- No "it didn't happen" intent. A passed plan keeps "change date" (future dates) and "remove".
- No confirm with a different day than the recorded one. The user can change the date or use month/year "mark done".
- No tier or eligibility check on confirm. RLS still requires consent and an active catalog entry.
- No separate "to confirm" dashboard section, no change to the status-line plan count, and no change to tier rows or `RecommendationItem.astro` (issue #67's territory).
- No history: still one completion per (user, exam), overwritten on save.
- No reminder or nudge emails: those are S-06 and S-07. No consent-text change, because no new data leaves the app.
- No unit-test runner (F-03, #49).
- No modelling of cervical-cytology intervals by test type.

## Implementation Approach

The contract lives in the database:

- An additive `last_done_on` column whose month must equal `last_done_month`.
- A `confirm_screening_plan(slug)` function. It runs **as the caller** (security invoker), so the existing RLS policies (own rows, active consent, active catalog entry) and column grants still apply. It reads the plan's date on the server, checks it against Warsaw today, upserts the completion and deletes the plan in one transaction.

The endpoint becomes a thin `confirm` intent that maps the function's result to the existing redirect shape. The dashboard derives "awaiting confirmation" in the pure rules module and renders it inline on the plan row.

## Critical Implementation Details

- **Mark-done must clear `last_done_on`.** Otherwise re-marking an exam done in another month violates the new CHECK, and in the same month it would keep a stale exact day. The `done` upsert therefore sends `last_done_on: null`, which needs an UPDATE grant on that column.
- **Rollback window:** if the Worker is rolled back after users have confirmed exams, the old `done` code doesn't send `last_done_on`. Re-marking such an exam done in a different month then fails with `save_failed` until the user undoes and re-marks it. This is accepted: the schema stays additive and the failure is visible, not silent.
- **Warsaw "today" in SQL** is `(now() at time zone 'Europe/Warsaw')::date`, the same calendar `warsawToday` uses in TypeScript. The function takes no date parameter, so a client can't backdate "today".

## Phase 1: Database — exact-day column and confirm function

### Overview

An additive migration plus regenerated types and a pgTAP file. Nothing in the app calls the function yet, so a Worker on old code keeps working unchanged.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<timestamp>_confirm_screening_plan.sql` (create with `npx supabase migration new confirm_screening_plan`)

**Intent**:

- Store the exact day of a confirmed exam next to its month.
- Give the app one atomic, RLS-respecting call that turns a passed plan into a completion.

**Contract**:

- `screening_completions.last_done_on date` (nullable). Null means the day is unknown: month-only mark done, or an existing row.
- CHECK `last_done_on is null or last_done_month = date_trunc('month', last_done_on::timestamp)::date`. This also forbids a day with a null month.
- Grants to `authenticated`: `insert (last_done_on)` and `update (last_done_on)`, alongside the S-03 column grants. No other grant changes. No new table, so the `service_role` guard (`appointment_reminders.test.sql:102-116`) is unaffected.
- `public.confirm_screening_plan(p_slug text) returns text`:
  - `language plpgsql`, `security invoker`, `set search_path = ''`, fully qualified names.
  - Raises `42501` when `auth.uid()` is null.
  - Locks the caller's plan for `p_slug` (`for update`) and returns:
    - `'not_found'` when there is no such plan for the caller;
    - `'not_due'` when its `appointment_date` is null or after Warsaw today;
    - otherwise it upserts the completion (`on conflict (user_id, catalog_slug) do update` of `last_done_month` and `last_done_on`), deletes the plan, and returns `'confirmed'`.
  - RLS violations (no active consent, retired entry) propagate as errors.
- `revoke execute … from public, anon; grant execute … to authenticated`. Follow the withdraw function's style (`20260930093108_screening_records.sql:194-216`).

#### 2. Types

**File**: `src/lib/database.types.ts`

**Intent**: Regenerate with `npm run db:types` so `ScreeningCompletion` carries `last_done_on` and the RPC is typed.

**Contract**: `Tables.screening_completions.Row.last_done_on: string | null`; `Functions.confirm_screening_plan` with `Args: { p_slug: string }` and `Returns: string`.

#### 3. pgTAP

**File**: `supabase/tests/database/screening_confirm.test.sql` (new; fixtures modelled on `screening_records.test.sql:7-27`)

**Intent**: Cover the new column, its grants and every branch of the function, using plans dated relative to Warsaw today.

**Contract**:

- Grants: `anon` cannot execute the function; `authenticated` can; column privileges on `last_done_on`.
- CHECK: rejects a day outside its month and a day with a null month; accepts null.
- Function as user A with consent:
  - a plan dated yesterday → `confirmed`. The completion has the month and day, the plan is gone, and its ledger rows are gone.
  - a plan dated today → `confirmed`.
  - a plan dated tomorrow → `not_due`, plan kept.
  - an undated plan → `not_due`.
  - an unknown slug → `not_found`.
  - an existing completion is overwritten (upsert), including a previously null `last_done_on`.
- Isolation: user B confirming A's slug → `not_found`, and A's plan is untouched.
- Gates:
  - Without consent (after withdrawal or never given), the function errors.
  - A plan for a retired entry errors on the completion write. Insert that plan as postgres, because RLS blocks it as the user.
- Mark-done compatibility: an update setting `last_done_month` to another month together with `last_done_on = null` succeeds.

### Success Criteria:

#### Automated Verification:

- Migration applies on a clean local database: `npx supabase db reset`
- pgTAP passes, including the new file: `npx supabase test db`
- Types regenerated and committed: `npm run db:types` leaves `git diff --exit-code src/lib/database.types.ts` clean after commit
- Lint and type check pass: `npm run lint` and `npx astro check`

#### Manual Verification:

- In local psql as a test user, `select public.confirm_screening_plan('<slug>')` on a past-dated plan returns `confirmed`, and the row in `screening_completions` shows the expected month and day

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. The local Supabase is shared with the `10xdevs-second` worktree: check that the other session isn't mid-run before `supabase db reset`.

---

## Phase 2: Confirm on the dashboard

### Overview

The `confirm` intent, the passed-plan state on the plan row, the exact day on "last done" lines, the reminders-hint fix, translations, kitchen-sink cells and smoke steps.

### Changes Required:

#### 1. Endpoint

**File**: `src/pages/api/screenings.ts`

**Intent**:

- Add a `confirm` intent that calls the function. Like `unplan`/`undone`, it needs no profile, recommendation or tier check.
- Make `done` clear the exact day.

**Contract**:

- `INTENTS` gains `"confirm"`.
- Handled right after the `unplan`/`undone` branch (`:51-57`):
  1. A missing slug → `fail("invalid_request")`.
  2. Call `supabase.rpc("confirm_screening_plan", { p_slug: slug })`.
  3. Map the result: `confirmed` → `succeed(slug)` (`?saved=confirm`); `not_due` → `fail("appointment_not_passed")`; `not_found` → `fail("invalid_request")`; an RPC error → `fail("save_failed")`.
- The `done` upsert payload adds `last_done_on: null` (`:109-115`).
- Update the header comment (`:10-11`) to list the new intent.

#### 2. Rules

**File**: `src/lib/screenings/rules.ts`

**Intent**: Mark plans whose appointment day has arrived, keeping the module pure (`now` is a parameter).

**Contract**:

- `PlanView` gains `awaitingConfirmation: boolean`: true when `appointment_date !== null && appointment_date <= warsawToday(now)`. It is set in `partitionDashboard`.
- Plan ordering is unchanged: dated ascending, so passed plans come first.
- Update the module comment (`:14`), which still names only S-03.

#### 3. Plan row and actions panel

**Files**: `src/components/recommendations/PlanItem.astro`, `src/components/recommendations/ScreeningActions.astro`

**Intent**:

- When `awaitingConfirmation` is set, show the confirm prompt and a primary submit button posting `intent=confirm`, before the panel.
- Stop prefilling a passed date the browser would reject.

**Contract**:

- `PlanItem`:
  - adds `data-awaiting-confirmation` on the `<li>` when set (smoke hook);
  - adds a plain `<form method="POST" action="/api/screenings">` with hidden `intent=confirm` and `slug`, and a default-variant `Button` labelled `dashboard.screenings.confirm.submit` with an sr-only exam name;
  - shows the prompt `dashboard.screenings.confirm.prompt` with `{date}` from `formatDay`.
- Future plans render exactly as today.
- `ScreeningActions`: the date input's `defaultValue` is `planned.appointmentDate` only when it is `>= bounds.minDate`, otherwise empty.
- Use tokens and existing primitives only. Both files are under `ui:check`.

#### 4. Done display

**Files**: `src/lib/screenings/format.ts`, `src/components/recommendations/DoneItem.astro`

**Intent**: Show the exact day when it is known, on the "Done" row and on the tier row's "last done" line.

**Contract**:

- `describeLastDone` uses `dashboard.screenings.done.lastDoneOn` with `{date: formatDay(last_done_on)}` when `last_done_on` is set. Otherwise it keeps the current month or "marked in" texts. Its `Pick<>` gains `last_done_on`.
- `DoneItem` adds `data-last-done-on={completion.last_done_on ?? ""}` (smoke hook).

#### 5. Dashboard page

**File**: `src/pages/dashboard.astro`

**Intent**: Wire the new feedback and limit the reminders hint to dates a reminder can still be sent for.

**Contract**:

- `SAVED_KEYS.confirm = "dashboard.screenings.saved.confirm"`, with a success tone (`:123` gains `confirm`).
- `showRemindersHint` counts only plans with `appointment_date > warsawToday(now)`.
- No change to `TIER_STYLES` or the tier sections (issue #67).

#### 6. Translations

**Files**: `src/i18n/pl.ts`, `src/i18n/en.ts`

**Intent**: Add the new strings in both languages, informational wording only (no diagnosis, nothing implying the app booked anything).

**Contract**:

- New keys:
  - `dashboard.screenings.confirm.prompt` ({date}), e.g. "Czy badanie odbyło się {date}?" / "Did the exam take place on {date}?"
  - `dashboard.screenings.confirm.submit`: "Tak, potwierdzam" / "Yes, confirm"
  - `dashboard.screenings.saved.confirm`
  - `dashboard.screenings.done.lastDoneOn` ({date})
  - `errors.appointment_not_passed`: the appointment day hasn't come yet.
- Both files get the same key set.

#### 7. Kitchen sink

**File**: `src/pages/dev/kitchen-sink.astro`

**Intent**: Render the new states for visual review.

**Contract**: One `PlanItem` cell with a past date (awaiting confirmation), and one `DoneItem` cell with `last_done_on` set. Add them next to the existing cells (`:331-412`).

#### 8. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Prove confirm end to end over HTTP and that mark-done clears the day.

**Contract**: Add steps to the screening sequence (mammography), after the "draft slug" step and before "done last month is saved":

1. Confirming the existing plan (dated today + 30) → `302` to `/dashboard?error=appointment_not_passed`.
2. Plan the exam for Warsaw today → `saved=plan`.
3. The dashboard shows `data-plan` with `data-awaiting-confirmation` for mammography.
4. Confirm → `302` to `/dashboard?saved=confirm`.
5. The dashboard shows `data-done` for mammography with `data-last-done-on="<today>"` and no `data-plan`.

Then extend the existing "done last month" dashboard assertion to require `data-last-done-on=""`. Smoke computes "today" in Warsaw the same way it already builds `today + 30` and `lastMonth`.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Design-system check passes: `npm run ui:check`
- Build passes: `npm run build`
- Smoke passes against the local preview: `npm run smoke`
- pgTAP still passes: `npx supabase test db`

#### Manual Verification:

- A plan seeded with a date 3 days ago (local psql) shows the confirm prompt in Polish and English; Confirm moves it to "Done" with the exact day and the right "due again" month
- On that passed plan, "change date" opens with an empty date field and accepts a future date
- Confirming an exam with no fixed interval (e.g. HIV) shows the no-interval note in "Done"
- The reminders hint no longer appears when the only dated plan is in the past (reminders off)
- Kitchen-sink cells look right in light and dark themes on mobile and desktop widths

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Port 4321 and the local Supabase are shared with the `10xdevs-second` worktree.

---

## Phase 3: Docs and roadmap cleanup

### Overview

Bring the docs and the roadmap in line with what S-03 and S-05 actually deliver.

### Changes Required:

#### 1. README

**File**: `README.md`

**Intent**: Mention confirming a passed appointment in the product intro (`:3`) and the smoke description (`:281`).

**Contract**: Prose only.

#### 2. Roadmap

**File**: `context/foundation/roadmap.md`

**Intent**: Fix the stale S-05 body and backlog row.

**Contract**:

- S-05 Outcome (`:177`): drop the outcomes S-03 shipped and keep "confirm on the recorded date; next due computed from it".
- Backlog row (`:223`): title becomes "Confirm a passed appointment and schedule next due date".
- Status fields are left to the lifecycle skills.

#### 3. Issue #23

**Intent**: Retitle to match the narrowed scope.

**Contract**: `gh issue edit 23 --title "[S-05] Confirm a passed appointment and schedule next due date"`.

### Success Criteria:

#### Automated Verification:

- Formatting passes on changed docs: `npx prettier --check README.md context/foundation/roadmap.md`

#### Manual Verification:

- Issue #23 title and roadmap S-05 text read correctly

---

## Testing Strategy

### Unit Tests:

- None: no runner exists yet (F-03, #49). `awaitingConfirmation` and the `describeLastDone` branch are pure functions, ready for F-03 to cover.

### Integration Tests:

- pgTAP (`screening_confirm.test.sql`): the function's branches (past, today, future, undated, unknown, other user, no consent, retired), atomicity (completion written, plan and ledger rows deleted), upsert over an existing completion, the CHECK and the grants.
- Smoke: future-plan rejection, plan-for-today confirm, the done row with the exact day, and mark-done clearing it.

### Manual Testing Steps:

1. Locally, seed a plan dated 3 days ago (psql as `postgres`, inserting with the test user's id). Open `/dashboard`, confirm, and check "Done", "Last done: <day>" and "Due again".
2. Seed a passed plan for an exam with no fixed interval and confirm it; expect the no-interval note.
3. With reminders off and only a passed dated plan, the reminders hint is hidden.
4. Switch to English and repeat step 1's checks.

## Performance Considerations

Confirm is one RPC instead of two PostgREST calls. The dashboard adds one string comparison per plan. No effect on the cron.

## Migration Notes

The migration is additive (a nullable column, a CHECK that existing rows satisfy because their `last_done_on` is null, grants and a new function). It runs in the CI `migrate` job before deploy. A Worker rollback leaves the column and function unused, except for the mark-done case in Critical Implementation Details. Run `npm run db:types` after the migration and commit the result.

## References

- Research: `context/changes/confirm-exam-and-recurrence/research.md`
- Roadmap: `context/foundation/roadmap.md` S-05; issue #23
- S-03 plan: `context/archive/2026-09-30-record-appointment-date/plan.md`
- S-04 plan (ledger, claim window): `context/archive/2026-09-30-appointment-reminder/plan.md`
- Grants and withdrawal pattern: `supabase/migrations/20260930093108_screening_records.sql:165-216`
- Done path to mirror: `src/pages/api/screenings.ts:108-124`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database — exact-day column and confirm function

#### Automated

- [x] 1.1 Migration applies on a clean local database
- [x] 1.2 pgTAP passes, including the new file
- [x] 1.3 Types regenerated and committed
- [x] 1.4 Lint and type check pass

#### Manual

- [ ] 1.5 Local psql confirm of a past-dated plan returns confirmed with the expected month and day

### Phase 2: Confirm on the dashboard

#### Automated

- [ ] 2.1 Lint passes
- [ ] 2.2 Type check passes
- [ ] 2.3 Design-system check passes
- [ ] 2.4 Build passes
- [ ] 2.5 Smoke passes against the local preview
- [ ] 2.6 pgTAP still passes

#### Manual

- [ ] 2.7 Seeded past plan shows the prompt in Polish and English and confirms into Done with the exact day
- [ ] 2.8 Change date on a passed plan opens empty and accepts a future date
- [ ] 2.9 Confirming a no-interval exam shows the no-interval note
- [ ] 2.10 Reminders hint hidden when the only dated plan is past
- [ ] 2.11 Kitchen-sink cells look right in both themes and widths

### Phase 3: Docs and roadmap cleanup

#### Automated

- [ ] 3.1 Formatting passes on changed docs

#### Manual

- [ ] 3.2 Issue #23 title and roadmap S-05 text read correctly
