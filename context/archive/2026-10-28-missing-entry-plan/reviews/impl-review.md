<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: A plan with a missing catalog entry stays visible

- **Plan**: context/changes/missing-entry-plan/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-28
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Evidence

- Diff `origin/main...HEAD` (commits a19ef90, 10be458, d9e479f, c6c00c9). Changed sources: `rules.ts`, `rules.test.ts`, `UnavailableItem.astro` (new), `pl.ts`, `en.ts`, `dashboard.astro`, `kitchen-sink.astro`, plus 4 kitchen-sink PNGs. Every planned file is in the diff, and every source file in the diff is in the plan. I reviewed inline, with no sub-agents, because the source diff is about 270 lines.
- Plan adherence:
  - `partitionDashboard` now pushes `{ plan, entry: null }` / `{ completion, entry: null }` instead of skipping them (`rules.ts:265-271,292-300`).
  - `planned` is still built from every plan (`rules.ts:290`), and `hidden` is keyed by `completion.catalog_slug` (`rules.ts:308`).
  - The dashboard branches on `entry === null` and keys `itemSlugs`/`errorFor`/`savedFor` by the record's own slug (`dashboard.astro:99-102,184-200,256-270`).
  - `UnavailableItem` follows the reviewed contract: generic name, the record's own date line, the neutral note, one remove/undo form, and an sr-only name with the date line.
- One deviation, documented in `decisions.md` ("Existing partition tests narrowed, not rewritten"): existing partition tests read view fields through a `withEntry()` narrowing helper. Assertions and expected values are unchanged.
- Safety: no new query, endpoint or RLS change. The slug appears only in `id`, `data-slug` and the hidden input, never as visible text. Remove/undo rely on the delete policies, which check only `user_id` (`20260930093108_screening_records.sql:113-115,162-164`).
- Automated gates (run now, at HEAD c6c00c9):
  - `npm test`: 340/340 passed.
  - `npm run ui:check`: 35 files, no hardcoded values.
  - `npm run lint`: exit 0.
  - `npx astro check`: 0 errors, 0 warnings, 0 hints.
  - `npm run build`: complete.
  - 2.3 (screenshots): not re-run. The four PNGs are committed.
- Manual:
  - 2.4: confirmed in `screenshots/kitchen-sink-desktop-dark.png`. Both columns show "Badanie niedostępne" with "Termin: 3 grudnia 2026" or "Ostatnio wykonane: marzec 2025", the neutral note and only "Usuń z planów" / "Cofnij oznaczenie". There is no tier badge and no visible slug.
  - 2.5: the run is recorded in `decisions.md` ("Manual check 2.5 run locally"). The PR-description part is pending until the PR stage (F2).

## Findings

### F1 — The unavailable done row also carries `data-done`, which the plan didn't specify

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/recommendations/UnavailableItem.astro:40-41
- **Detail**: The plan names `data-plan` on a plan row "so plan-row selectors keep counting it". The implementation also puts `data-done` on the done row. This mirrors `DoneItem.astro:33` and is harmless today. But smoke asserts `bodyExcludes: "data-done"` / `"data-plan"` on several steps (`scripts/smoke.mjs:265,280,287,300,380`). A future smoke or e2e fixture with a missing-entry record would count these rows as ordinary plan/done rows. Selectors that need to tell them apart must use `data-unavailable`.
- **Fix**: Keep the attribute and add one line to `decisions.md`: "an unavailable done row carries `data-done` like `DoneItem`; tell the two apart with `data-unavailable`".
- **Decision**: ACCEPTED — keep `data-done`; the distinction is recorded in decisions.md ("Impl-review triage").

### F2 — The error path on the unavailable row has no check, and 2.5's PR note is still open

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/missing-entry-plan/plan.md (Progress 2.5); src/components/recommendations/UnavailableItem.astro:52-57
- **Detail**: 2.5 is ticked. The worker took the anchor branch of the plan's either/or, so a failed remove showing its error on the unavailable row was never run. The kitchen sink also has no unavailable row in its error state, so the `Alert` markup in this component has never rendered. 2.5 also requires that "the PR description records that this check ran and its outcome". No PR exists yet, so that part is not done, although the row is `[x]`.
- **Fix**: In the PR stage, paste the "Manual check 2.5 run locally" entry from `decisions.md` into the PR description. Optionally, give the kitchen-sink unavailable done fixture `error={t("errors.save_failed")}` so the error state is screenshotted.
- **Decision**: FIXED — kitchen-sink unavailable done fixture now renders `error={t("errors.save_failed")}` (checked on the kitchen sink: the alert renders in light and dark); the 2.5 outcome goes into the PR description.
