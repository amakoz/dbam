# A plan with a missing catalog entry stays visible — Implementation Plan

## Overview

Roadmap S-10 (backlog B-04, owner answer Q-02: "a user's plan must never disappear"). Today the dashboard silently drops a plan or done record whose catalog entry it cannot load. After this change such a record renders in its usual section, "Your plans" or "Done", as a neutral "exam not available" row. The row has only a remove/undo action and no tier badge. "Each exam shows in one place" keeps holding for every slug.

## Current State Analysis

- `partitionDashboard` skips a plan with no entry (`src/lib/screenings/rules.ts:248-249`) and a completion with no entry (`rules.ts:273-274`). `planned` is built from every plan (`rules.ts:268`) and hides that slug's done record, tier item and maybe item (`rules.ts:274,282,287,293`).
- On the dashboard, a missing-entry slug can have no tier item (recommendations come from `catalog` ⊆ `entries`, `src/pages/dashboard.astro:53,60`). So what the user actually loses is the plan row and the done row (research.md Summary 1–2).
- "Missing" means the entry is in `draft` (hidden from users by RLS, `supabase/migrations/20260928153742_screening_catalog.sql:65-67`) or fails `CatalogEntrySchema` (`src/lib/catalog/read.ts:14-27`). Deleting it is blocked by the FKs (`…20260930093108_screening_records.sql:15,41`). Retired entries already render (`read.ts:50`).
- Only `unplan`/`undone` can succeed for such a record (`src/pages/api/screenings.ts:64-71`). Confirm, plan and done fail for an entry that isn't active (`screenings.ts:81-89,130-133`).
- F-08's test `skips a plan or completion whose entry is missing; the completion does not hide its tier item` (`src/lib/screenings/rules.test.ts:418-430`) pins the skip.
- The cron caller passes no plans (`src/lib/screenings/due.ts:43`) and already has the guard `gives none for a completion whose entry is missing` (`src/lib/screenings/due.test.ts:121`).

## Desired End State

- A plan whose entry is missing shows in "Your plans", in the usual date order. It reads as a generic "exam not available" row showing its own appointment date line ("Appointment: …" / "Date not set yet"), the one fact the reminder email still names (Q-01). Below the date sits a neutral note, then a "Remove from plans" button. It has no tier badge, date panel or confirm form.
- A done record whose entry is missing shows in "Done" the same way: its "Last done: …" line (`describeLastDone`), the neutral note, and the "Undo" button only. It is never treated as due again.
- For any slug, a plan (with or without an entry) still wins over its done record, tier item and maybe item, so every exam shows in exactly one place.
- The cron's due-again items are unchanged.
- Verify with `npm test` (updated and new partition cases), `npx astro check`, `npm run lint`, `npm run ui:check`, and a kitchen-sink screenshot of the new row in light and dark.

### Key Discoveries:

- `planned` stays as it is (all plans), per the orchestrator decision in `decisions.md`, "What `planned` holds" (`rules.ts:268`).
- `PlanItem`/`DoneItem` both need `entry` for the name, anchor and forms (`src/components/recommendations/PlanItem.astro:32-39`, `DoneItem.astro:28-34`). A separate component avoids threading null checks through them.
- The dashboard reads `view.entry.slug` for the error, saved and anchor lookups (`dashboard.astro:98-102,186-189,248`). `plan.catalog_slug` / `completion.catalog_slug` hold the same value for every row.
- The flash slug is health data and is never rendered as text (`dashboard.astro:78-80`). The new row may carry the slug only in `id`, `data-slug` and hidden inputs, as existing rows do.
- `src/components/recommendations/*.astro`, `dashboard.astro` and `kitchen-sink.astro` are on the `ui:check` list (`scripts/ui-check.mjs:14,20,28`) and in the lint-staged glob. A new component in that folder is covered automatically.

## What We're NOT Doing

- No names-only catalog query and no real name for the missing entry. The label is generic (decision 2).
- No change to the API, RLS, migrations or pgTAP tests. Remove and undo already work (`screenings.ts:64-71`).
- No change to appointment reminders for such plans (Q-01: they are intended) and no change to the cron's due-again or nudge selection.
- No guard against backward catalog moves: that is F-17 (`roadmap.md:91`).
- No edits to `context/domain/domain-distillation.md` drift rows and no `roadmap.md` status flip. `/10x-archive` sets `done`.
- No new e2e test. Seeding a draft-demoted entry needs a catalog write that the e2e oracle doesn't do; the pure rule is covered in Vitest and the markup in the kitchen sink.

## Implementation Approach

Keep the rule pure and change its output type. `plans` and `done` become unions of today's views and a new "no entry" view. The dashboard branches on `entry === null` and renders a new `UnavailableItem.astro` for those rows. `planned` keeps every plan, so the one-place rule is unchanged for every slug. Existing partition tests stay as the guard (roadmap risk, `roadmap.md:151`). F-08's test changes to the new expectation, and new cases pin the same-slug and narrower-entries behaviour.

## Phase 1: Missing-entry records render on the dashboard

### Overview

Change the partition rule and its types, update and extend the unit tests, add the unavailable-row component and its i18n keys, and wire the dashboard. Every gate is green at the end of the phase.

### Changes Required:

#### 1. Partition rule and view types

**File**: `src/lib/screenings/rules.ts`

**Intent**: Stop dropping records whose entry is missing. Return them as "no entry" views in `plans` and `done` so the dashboard can render them, and keep `planned` built from every plan.

**Contract**:

- New exported types: `UnavailablePlanView { plan: ScreeningPlan; entry: null }` and `UnavailableDoneView<C extends DueCompletion = ScreeningCompletion> { completion: C; entry: null }`.
- `DashboardPartition.plans: (PlanView<E> | UnavailablePlanView)[]` and `DashboardPartition.done: (DoneView<C, E> | UnavailableDoneView<C>)[]`. `PlanView`/`DoneView` themselves are unchanged.
- Plan loop: a plan with no entry is pushed as `{ plan, entry: null }` and sorted with the others by the existing date / `created_at` comparator.
- Completion loop: `planned.has(slug)` still skips first. A completion with no entry is then pushed to `done` as `{ completion, entry: null }`, never to `dueAgain`/`lastDone`, and its slug joins `hidden`.
- `planned = new Set(plans.map((plan) => plan.catalog_slug))` stays unchanged (decisions.md).
- Update the JSDoc (`rules.ts:222-229`) and the `plans`/`done` field comments (`rules.ts:211-214`): a record whose entry is missing is kept as a "no entry" view, not skipped.

#### 2. Unit tests

**File**: `src/lib/screenings/rules.test.ts`

**Intent**: Change F-08's pinned expectation to the fixed behaviour and pin the one-place rule for missing-entry records.

**Contract**: Replace the test at `rules.test.ts:418-430` and add cases in the `partitionDashboard` describe:

- F-08 case, renamed. Plan `ghost` and completion `exam`, `entries = []`, `recs([exam])`. `plans` is one row with `plan.catalog_slug === "ghost"` and `entry === null`. `done` is one row with `completion.catalog_slug === "exam"` and `entry === null`. `tiers[1]` is `[]`, because the done row is now exam's one place.
- Same slug: a plan and a completion on `ghost`, both without an entry. `plans` has one `ghost` row, `done` is `[]`.
- Narrower entries: a plan on `exam` with `entries = []`, `recs([exam], { maybe: [exam] })`. One `plans` row with `entry === null`; `tiers[1]` and `maybe` are `[]`.
- A missing-entry completion with a long-past month (`"2000-01-01"`) stays in `done` (not due again) and `lastDone` is empty.
- Sorting: a missing-entry plan with a date sorts between entry plans by date (reuse the sort test's shape with one slug absent from `entries`).

`src/lib/screenings/due.test.ts:121` stays as it is and must still pass. It is the cron guard.

#### 3. Unavailable row component

**File**: `src/components/recommendations/UnavailableItem.astro` (new)

**Intent**: Render a plan or done record whose catalog entry is missing, without a name, tier, date panel or any action other than remove or undo.

**Contract**:

- Props: `view: UnavailablePlanView | UnavailableDoneView` (a plan when `"plan" in view`), `error?: string | null`, `saved?: SavedFeedback | null`. The slug is `view.plan.catalog_slug` / `view.completion.catalog_slug`.
- `<li id="screening-<slug>" data-slug={slug} data-unavailable>`. Use `data-plan` on a plan row so plan-row selectors keep counting it. Row classes follow `PlanItem`/`DoneItem` (`SAVED_ROW_CLASS` when `saved`).
- Heading: `t("dashboard.screenings.unavailable.name")`.
- Date line (plan-review F1), from the record's own fields only:
  - plan: `t("dashboard.screenings.plan.date", { date: formatDay(appointment_date, locale) })`, or `t("dashboard.screenings.plan.noDate")` when there is no date, as in `PlanItem.astro:63-67`;
  - done: `describeLastDone(completion, t, locale)`, as in `DoneItem.astro:48`.
    Muted, `tabular-nums`, like the existing rows.
- Below the date line, the muted note `t("dashboard.screenings.unavailable.note")`.
- Error alert as in `DoneItem.astro:55-60`.
- One form posting to `/api/screenings` with `intent` `unplan` (plan) or `undone` (done) and a hidden `slug`. The button text reuses `dashboard.screenings.plan.remove` / `dashboard.screenings.done.undo`. Its `sr-only` span carries the generic name and the row's date line (plan-review F2), so two unavailable rows have distinct accessible names. For example, ": Exam not available, Appointment: 12 November 2026" or ": Exam not available, Last done: March 2025". Join the two with the locale's list comma; this needs no new key.
- Tokens and existing `Button`/`Alert` only: no palette classes, literals or arbitrary values (`ui:check`). The slug is never visible text. Header comment in the style of `PlanItem.astro:11-14`.

#### 4. i18n keys

**Files**: `src/i18n/pl.ts`, `src/i18n/en.ts`

**Intent**: A neutral label and note, with no diagnosis wording and no hint about why the entry is missing.

**Contract**: Add next to the other `dashboard.screenings.*` keys:

- `dashboard.screenings.unavailable.name`: PL "Badanie niedostępne", EN "Exam not available".
- `dashboard.screenings.unavailable.note`: PL "To badanie nie jest teraz dostępne w aplikacji.", EN "This exam isn't available in the app right now."

#### 5. Dashboard wiring

**File**: `src/pages/dashboard.astro`

**Intent**: Render the "no entry" views with `UnavailableItem`, and key every row lookup by the record's slug, not `entry.slug`.

**Contract**:

- Plans list (`dashboard.astro:182-191`): `view.entry === null ? <UnavailableItem view={view} …/> : <PlanItem view={view} …/>`. Pass `errorFor`/`savedFor` (and `invalidFieldFor` for `PlanItem`) with `view.plan.catalog_slug`.
- Done list (`dashboard.astro:247-249`): the same, keyed by `view.completion.catalog_slug`.
- `itemSlugs` (`dashboard.astro:98-102`): build plan and done slugs from `plan.catalog_slug` / `completion.catalog_slug`, so a failed remove or undo shows its error on the unavailable row.
- Section visibility is unchanged: "Your plans" always renders and "Done" renders when `done.length > 0`, both of which now include the new rows.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including the rewritten F-08 case and the new missing-entry cases: `npm test`
- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Hardcoded-value check passes over the dashboard and recommendations components: `npm run ui:check`
- Build passes: `npm run build`

**Implementation Note**: After this phase's automated checks pass, go on to Phase 2. Phase 2 holds the visual check for this markup.

---

## Phase 2: Kitchen-sink sample and visual check

### Overview

Add the unavailable row, in both kinds, to the kitchen sink and screenshot it in light and dark. Existing seed data has no missing entries, so the dashboard shots can't show the row.

### Changes Required:

#### 1. Kitchen-sink fixtures

**File**: `src/pages/dev/kitchen-sink.astro`

**Intent**: Show an unavailable plan row in the "Your plans" card and an unavailable done row in the "Done" card, per scheme column.

**Contract**: Extend the per-scheme fixtures (`kitchen-sink.astro:122-198`) with one unavailable plan (with an appointment date) and one unavailable done record (with a last-done month). Slugs carry the scheme suffix, as the existing fixtures do, so ids stay unique. Render them with `UnavailableItem` in the plans list (`kitchen-sink.astro:345`) and the done list (`kitchen-sink.astro:424`). Keep the file `ui:check`-clean.

### Success Criteria:

#### Automated Verification:

- Hardcoded-value check passes: `npm run ui:check`
- Type check and lint pass: `npx astro check && npm run lint`
- Against `npx astro dev --host 127.0.0.1 --port $DBAM_PORT` (on a fresh worktree run `npx astro sync` first; stop the server afterwards), kitchen-sink screenshots are produced (no DB lock needed): `BASE_URL=http://127.0.0.1:$DBAM_PORT npm run ui:shots -- --only kitchen-sink --out context/changes/missing-entry-plan/screenshots`

#### Manual Verification:

- In the kitchen-sink shots (light and dark, 1440 and 390), the unavailable rows show the generic label, their date line ("Appointment: …" / "Last done: …"), the neutral note below it and only the remove/undo button. They have no tier badge, the slug is not visible as text, and the contrast matches neighbouring rows.
- PR Manual check: on a local stack, demote a planned entry to draft (`update screening_catalog set status = 'draft' where slug = …` in local Supabase only). The dashboard then shows that plan as "Exam not available" with its appointment date. After "Remove from plans", the redirect to `#screening-<slug>` lands on the page with no error, and the plan row is gone. Also exercise the `itemSlugs` key once: either make a remove fail and see the error on the unavailable row, or confirm that the anchor resolves to the row before removing it. The PR description records that this check ran and its outcome.

---

## Testing Strategy

### Unit Tests:

- The partition rule: the rewritten F-08 case, same-slug plan + completion without entries, narrower entries hiding the tier and maybe items, a missing-entry completion never due again, and sort order with a missing-entry plan.
- The existing partition tests stay unchanged as the one-place guard (roadmap risk).
- The cron guard `due.test.ts:121` stays green with no edit.

### Integration Tests:

- None new. The API paths used (`unplan`, `undone`) are unchanged and covered by the existing smoke and e2e runs in CI.

### Manual Testing Steps:

1. Open `/dev/kitchen-sink` and check both unavailable rows in each scheme column.
2. Local stack only: put a planned entry into `draft`, reload `/dashboard`, and see the unavailable plan row with its date. Check that `#screening-<slug>` resolves to the row (or that a failed remove shows its error there), remove the row, and restore the entry's status (or run `supabase db reset` under the DB lock). Record the run in the PR.

## Performance Considerations

None. The same loops run with one extra push per missing record, and no query is added.

## Migration Notes

Not applicable: no schema or data change. Rollback is a plain Worker revert.

## References

- Research: `context/changes/missing-entry-plan/research.md`
- Decisions: `context/changes/missing-entry-plan/decisions.md`
- Source follow-up: `context/archive/2026-10-06-recurrence-unit-tests/follow-ups/missing-entry-plan.md`
- Roadmap item: `context/foundation/roadmap.md:143-152`
- Partition rule: `src/lib/screenings/rules.ts:191-296`
- Row components to mirror: `src/components/recommendations/PlanItem.astro`, `DoneItem.astro`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Missing-entry records render on the dashboard

#### Automated

- [ ] 1.1 Unit tests pass, including the rewritten F-08 case and the new missing-entry cases: `npm test`
- [ ] 1.2 Type check passes: `npx astro check`
- [ ] 1.3 Lint passes: `npm run lint`
- [ ] 1.4 Hardcoded-value check passes over the dashboard and recommendations components: `npm run ui:check`
- [ ] 1.5 Build passes: `npm run build`

### Phase 2: Kitchen-sink sample and visual check

#### Automated

- [ ] 2.1 Hardcoded-value check passes: `npm run ui:check`
- [ ] 2.2 Type check and lint pass: `npx astro check && npm run lint`
- [ ] 2.3 Against `npx astro dev --host 127.0.0.1 --port $DBAM_PORT` (on a fresh worktree run `npx astro sync` first; stop the server afterwards), kitchen-sink screenshots are produced (no DB lock needed): `BASE_URL=http://127.0.0.1:$DBAM_PORT npm run ui:shots -- --only kitchen-sink --out context/changes/missing-entry-plan/screenshots`

#### Manual

- [ ] 2.4 In the kitchen-sink shots (light and dark, 1440 and 390), the unavailable rows show the generic label, their date line ("Appointment: …" / "Last done: …"), the neutral note below it and only the remove/undo button. They have no tier badge, the slug is not visible as text, and the contrast matches neighbouring rows.
- [ ] 2.5 PR Manual check: on a local stack, demote a planned entry to draft (`update screening_catalog set status = 'draft' where slug = …` in local Supabase only). The dashboard then shows that plan as "Exam not available" with its appointment date. After "Remove from plans", the redirect to `#screening-<slug>` lands on the page with no error, and the plan row is gone. Also exercise the `itemSlugs` key once: either make a remove fail and see the error on the unavailable row, or confirm that the anchor resolves to the row before removing it. The PR description records that this check ran and its outcome.
