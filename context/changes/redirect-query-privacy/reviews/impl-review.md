<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Redirect Query Privacy

- **Plan**: context/changes/redirect-query-privacy/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-06
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

Reviewed commits 549de58 (p1), 2160c30 (p2) and bf0f637 (epilogue) against the plan as amended by the plan-review triage (526be1a) and `decisions.md`. Inline review, no sub-agents (7 source/doc files).

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Success criteria

- 1.1 `npm test`: pass (6 files, 160 tests, includes `flash.test.ts`).
- 1.2 `npm run lint`: pass.
- 1.3 `npx astro check`: 0 errors/warnings/hints. `npm run build` not rerun (implementer ran it at 549de58; CI reruns it).
- 1.4 `npm run ui:check`: pass (34 files).
- 1.5 smoke: not rerun here (needs the shared DB lock and a dev server; implementer recorded a pass at 549de58; CI `smoke` reruns it).
- 1.6 `grep -rn "slug=" src/pages scripts` (excluding `data-slug`): no hits.
- 2.1 Prettier check on the changed Markdown: pass.
- 1.7–1.9 checked with headless-Chromium evidence in the Progress rows (per plan-review F1/F3 decisions); 2.2 open, post-merge, human, non-blocking (decided).

## Findings

### F1 — Stale-confirm redirect sets the flash instead of clearing it

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/api/screenings.ts:94
- **Detail**: Plan §3 says the `:81` redirect uses the builder "and clear[s] the cookie"; `toDashboard(null, slug)` sets `screening_flash=<slug>` because the slug is known. Harmless: with no `saved`/`error` in the query the dashboard places nothing on a row (`dashboard.astro` gating) and consumes the cookie on that render. The only cost is one extra cookie carrying the slug for one render.
- **Fix**: Either accept as is (record in the plan's Progress note), or call `clearFlash()` and `context.redirect(dashboardLocation(null, slug))` at that site.
- **Decision**: PENDING

### F2 — Row-level invalid check in smoke is not row-specific

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:228
- **Detail**: `bodyIncludes: 'aria-invalid="true"'` passes on any invalid control. Today only the flash-named row can render it (`invalidFieldFor` gates on `itemErrorSlug`), so the step does prove the cookie reached the dashboard, but a future page-level form error would make it pass without row placement.
- **Fix**: Optional: also assert the row's open panel (e.g. a `data-slug="${mammography}"`-anchored string), as the save-confirmation step does.
- **Decision**: PENDING
