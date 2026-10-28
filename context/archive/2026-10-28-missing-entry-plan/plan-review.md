<!-- PLAN-REVIEW-REPORT -->

# Plan Review: A plan with a missing catalog entry stays visible

- **Plan**: context/changes/missing-entry-plan/plan.md
- **Mode**: Deep (claims verified inline against the code, no sub-agent: the change touches 3 modules or fewer)
- **Date**: 2026-10-28
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | PASS    |

## Grounding

Grounding: 8/8 paths ✓ (`rules.ts`, `rules.test.ts`, `due.test.ts`, `dashboard.astro`, `kitchen-sink.astro`, `PlanItem.astro`, `DoneItem.astro`, `api/screenings.ts`; `UnavailableItem.astro` is new), 6/6 symbols ✓ (`partitionDashboard` skip at `rules.ts:249,274`, `planned` at `:268`, `view.entry.slug` at `dashboard.astro:99-100,187-189,248`, F-08 test at `rules.test.ts:418`, cron guard `due.test.ts:121`, `ui:check` glob `src/components/recommendations/*.astro`), brief↔plan ✓, Progress↔Phase ✓ (1.1–1.5, 2.1–2.5).

Verified risky claims:

- Remove and undo work for a draft entry: the delete policies check only `user_id` (`supabase/migrations/20260930093108_screening_records.sql:113-115,162-164`), and the API deletes with no catalog check (`src/pages/api/screenings.ts:64-71`). ✓
- Only `dashboard.astro` and `due.ts:43` call `partitionDashboard`. The cron reads `tiers`/`lastDone` only, so moving a missing-entry completion from "skipped" to `done` doesn't change its due items. ✓
- `hidden` is built from `done.map(({ entry }) => entry.slug)` (`rules.ts:283`). With a null-entry union member this must switch to `completion.catalog_slug`. The plan's "its slug joins `hidden`" covers it, and `astro check` would catch a miss. ✓
- No smoke or e2e assertion can see the new row: smoke matches `data-plan data-slug=…` on real slugs only (`scripts/smoke.mjs:182-315`). ✓

## Findings

### F1 — The unavailable plan row hides the appointment date that reminder emails still send

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 1 §3 (Unavailable row component), Desired End State
- **Detail**: The unavailable plan row has "one neutral line" and no date, and it is still sorted by a date the user can't see. Under Q-01 the appointment reminder keeps going out for such a plan (`claim_due_appointment_reminders` never joins the catalog, domain-distillation D-01). The email gives only the date and says "See the details in your Dbam dashboard" (`src/i18n/en.ts:299-303`). A user with two dated plans, one of them unavailable, gets an email naming a date that no row on the dashboard shows. The plan is visible, but the one fact the user arranged with the clinic (`PlanItem.astro:11-12`) is gone. For done rows, the same applies to "last done", which `describeLastDone` already formats with no entry. The orchestrator's decision (a) limits the _actions_, not the information shown.
- **Fix A ⭐ Recommended**: Render the existing date line on the unavailable row: `dashboard.screenings.plan.date` / `plan.noDate` for a plan, `describeLastDone(completion, t, locale)` for a done record. Keep the neutral note below it. Add `plan.appointment_date` / `completion` to the props (or pass the view).
  - Strength: The row matches the email and keeps the user's own data. It reuses existing keys and helpers (`PlanItem.astro:63-67`, `DoneItem.astro:48`), needs no entry, and adds no query.
  - Tradeoff: One more prop and line. Manual check 2.4 should also look at the date line.
  - Confidence: HIGH — both helpers read only the record's own fields.
  - Blind spot: Whether the orchestrator meant "one neutral line" as a hard limit. Decision (a) in `decisions.md` doesn't say so.
- **Fix B**: Keep the row as planned and record in `decisions.md` that the date is deliberately hidden, with the email mismatch accepted.
  - Strength: No scope change. The row stays minimal.
  - Tradeoff: The user can't tell which plan an appointment email refers to.
  - Confidence: MED — acceptable only if such plans are rare until F-17 lands.
  - Blind spot: How often draft demotion happens in production.
- **Decision**: APPLIED — Fix A: the unavailable row renders `plan.date`/`plan.noDate` or `describeLastDone`, with the neutral note below (plan.md Phase 1 §3, 2.4; brief).

### F2 — Several unavailable rows have identical headings and button names

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §3 (sr-only name on the button)
- **Detail**: Every unavailable row's `h3` is "Exam not available", and its button reads "Remove from plans: Exam not available" (or "Undo: …"). With two missing-entry records, a screen-reader user hears two identical controls and can't tell which one they would remove. The slug can't be shown, so the name gives no way to tell them apart.
- **Fix**: Add the row's date (see F1) to the sr-only span, e.g. "Remove from plans: Exam not available, appointment 12 November 2026". Or accept the duplicates and note it in `decisions.md`.
- **Decision**: APPLIED — the button's sr-only span carries the generic name plus the row's date line (plan.md Phase 1 §3).

### F3 — The dashboard wiring of the fix has only a manual check

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Testing Strategy, Phase 2 Manual 2.5
- **Detail**: The rule is unit-tested, but nothing automated proves that `dashboard.astro` renders `UnavailableItem` or keys `itemSlugs`/`errorFor` by `catalog_slug`. The union type makes `astro check` force the `entry === null` branch, which lowers the risk. A wrong `itemSlugs` key, or a missing `data-plan`, would still pass every gate. Check 2.5 is the only end-to-end proof of the bug fix (B-04), and it runs once, by hand.
- **Fix**: Keep it as is, but make 2.5 also trigger a failed remove (or check the anchor `#screening-<slug>` after removing) so the `itemSlugs` change is exercised once. Record in the PR that 2.5 was run.
- **Decision**: APPLIED — 2.5 also checks the `#screening-<slug>` anchor or a failed remove, and the PR records that 2.5 ran (plan.md 2.5, Manual Testing Steps).

### F4 — The screenshot criterion doesn't say a dev server must be running

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 Automated 2.3
- **Detail**: `ui:shots` needs `npx astro dev --host 127.0.0.1 --port $DBAM_PORT` (the kitchen sink answers 404 on a build, `scripts/ui-shots.mjs:180-181`), and a fresh worktree needs `npx astro sync` first. The criterion lists only the shots command.
- **Fix**: Prefix 2.3 with "against `npx astro dev --host 127.0.0.1 --port $DBAM_PORT` (stop it afterwards)".
- **Decision**: APPLIED — 2.3 now starts with the `npx astro dev --host 127.0.0.1 --port $DBAM_PORT` server line (plus `astro sync` on a fresh worktree; stop it afterwards).
