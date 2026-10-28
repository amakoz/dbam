# Decisions: missing-entry-plan

## 2026-10-28 Scope of the fix

- Question: fix only the `planned` set, or also render the missing-entry plan and done record?
- Options: (a) render the missing-entry plan and done record on the dashboard and build `planned` only from plans that have an entry; (b) the `planned` fix plus a test only.
- Choice: (a).
- Evidence: owner answer to Q-02, "a user's plan must never disappear" (`context/domain/domain-distillation.md:262`). The `planned`-only fix changes no output users see (research.md Summary 1–3).
- Decided by: orchestrator.

## 2026-10-28 Label for a row whose entry is missing

- Question: a generic label, or a best-effort name read by a new names-only query?
- Options: (a) one generic, neutral pl/en label with no new query; (b) a names-only query, falling back to (a).
- Choice: (a).
- Evidence: users can't read a draft row at all, because the catalog's access rules hide it (`supabase/migrations/20260928153742_screening_catalog.sql:65-67`).
- Decided by: orchestrator.

## 2026-10-28 Actions on a row whose entry is missing

- Question: which actions should the row offer?
- Options: (a) only "remove plan" or "undo done", plus a short neutral line saying the exam isn't available right now, with no tier badge and no diagnosis wording; (b) every action, letting the failing ones return `screening_not_available`.
- Choice: (a).
- Evidence: confirm, plan and done all fail for an entry that isn't active (`src/pages/api/screenings.ts:81-89,130-133`).
- Decided by: orchestrator.

## 2026-10-28 Planning complexity, question budget, phase split

- Complexity: LOW. One pure rule, two rendering components, i18n keys and a kitchen-sink sample. No migration, no API or RLS change.
- Question budget: 1, for the conflict described in the next entry. Everything else is settled above or can be derived from the code.
- Phase split: 2 phases. (1) The partition rule and its unit tests. (2) Dashboard rendering, i18n, a kitchen-sink sample and a UI shot check.
- Decided by: worker (delegated by orchestrator).

## 2026-10-28 What `planned` holds (supersedes the `planned` part of "Scope of the fix")

- Question: should `planned`, the set that hides a slug's done record, tier item and maybe item, hold every plan, or only plans that have an entry?
- Options: (a) every plan, with or without an entry, as `rules.ts:268` builds it today; (b) only plans that have an entry.
- Choice: (a). The missing-entry plan row is now where its exam shows, so "plan wins" and one row per exam still hold. Under (b), an entry moved back to draft that has both a plan and a done record would show two rows.
- Evidence: `src/lib/screenings/rules.ts:222-224,240,268,273`; `context/foundation/roadmap.md:151`.
- Decided by: orchestrator (corrects its earlier answer 1).

## 2026-10-28 Phase split revised

- Change: the rule and its rendering move into Phase 1 together. Making `PlanView`/`DoneView` entries nullable breaks `dashboard.astro` (`view.entry.slug`, `dashboard.astro:186-189,248`), so a rule-only phase would leave `astro check` and lint red.
- New split: (1) partition rule, unit tests, the unavailable-row component, i18n keys and dashboard wiring, with every gate green; (2) a kitchen-sink sample and a `ui:shots --only kitchen-sink` visual check.
- Decided by: worker.

## 2026-10-28 How missing-entry records are represented

- Choice: `plans`/`done` hold a union. A record with an entry keeps today's `PlanView`/`DoneView`. A record without one is `{ plan, entry: null }` or `{ completion, entry: null }`. A missing-entry done record always lands in `done`: with no interval it can't be due again, matching how a no-interval record is treated.
- Alternatives rejected: (i) making `entry` nullable on `PlanView`/`DoneView`, which pushes null checks into `PlanItem`/`DoneItem` and the kitchen-sink fixtures; (ii) a separate `unavailable` list, which would leave the row out of the "Your plans" date order.
- Decided by: worker.

## 2026-10-28 Plan-review triage (plan-review.md)

- F1 (warning, an unavailable plan row hides the date that reminder emails still send): Fix A. The row shows `plan.date`/`plan.noDate` or `describeLastDone`, with the neutral note below. The component now takes the "no entry" view as its prop. Evidence: Q-01 appointment emails keep going out (`domain-distillation.md:215`); the email names only the date (`src/i18n/en.ts:299-303`).
- F2 (identical accessible names): fixed. The sr-only button text includes the row's date line.
- F3 (the dashboard wiring has only a manual check): fixed. Check 2.5 also exercises the `#screening-<slug>` anchor or a failed remove, and the PR records that 2.5 ran.
- F4 (the screenshot check doesn't mention the dev server): fixed. Check 2.3 starts with the `npx astro dev --host 127.0.0.1 --port $DBAM_PORT` line.
- Decided by: orchestrator.

## 2026-10-28 Existing partition tests narrowed, not rewritten

- Question: the plan says existing partition tests stay unchanged, but `plans`/`done` are now unions, so `result.done[0].nextDue` and `slugsOf(result.plans)` stop type-checking.
- Options: (a) add a `withEntry()` narrowing helper in the test file and wrap those reads; (b) cast.
- Choice: (a). Assertions and expected values are untouched; only the accessor is narrowed.
- Evidence: `npx astro check` flagged 7 errors in `rules.test.ts` after the type change.
- Decided by: worker.

## 2026-10-28 Manual check 2.5 run locally

- Ran on the local stack under the DB lock: a fresh user with a mammography plan (2026-12-10) and a colonoscopy completion (2025-03), both catalog rows set to `draft`. The dashboard showed two "Badanie niedostępne" rows with their date lines; `#screening-mammography-nfz-program` resolved to the plan row; "Usuń z planów" redirected to `?saved=unplan#screening-…` with no error alert and no plan row left; "Cofnij oznaczenie" did the same (`?saved=undone`). Both rows were gone from the DB. Catalog status restored to `active`; lock released; dev server stopped. A failed-remove error on the row was not exercised (anchor-resolves branch of the plan's either/or).
- Decided by: worker.

## 2026-10-28 Impl-review triage (verdict APPROVED, 2 observations)

- F1 (`data-done` on the unavailable done row): accepted, no code change. An unavailable done row carries `data-done` like `DoneItem`; tell the two apart with `data-unavailable`. Smoke's `bodyExcludes: "data-done"` / `"data-plan"` steps use no missing-entry records, so they are unaffected.
- F2 (error path unchecked, 2.5 PR note open): fixed. The kitchen-sink unavailable done fixture now passes `error={t("errors.save_failed")}`, so the alert renders in the committed shots; confirmed once in light and dark. The "Manual check 2.5 run locally" entry above is pasted into the PR description.
- Decided by: orchestrator (findings), worker (applied).

## 2026-10-28 Archive before the PR merges

- Archive ran on the feature branch before the PR exists, as the orchestrator asked. Warnings: the plan's 5 SHAs (10be458, d9e479f and the 2.x rows) are not yet in `origin/main` history, because the PR is unmerged and a squash merge will leave them dangling; no repoint is offered because there is no merged implementation PR to map them to. Manual row 2.5's PR-description part is covered by the PR, which pastes the "Manual check 2.5 run locally" entry. The impl-review report moved to `reviews/impl-review.md` so archive's coverage check finds it.
- Decided by: worker (delegated by orchestrator).
