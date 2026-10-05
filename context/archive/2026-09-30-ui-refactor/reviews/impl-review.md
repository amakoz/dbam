<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: UI Refactor — Theme A and Dashboard Redesign

- **Plan**: context/changes/ui-refactor/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-10-05
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 6 warnings, 4 observations

Reviewed against the merged code (squash `e166a2f`, PR #64). Two sub-agents ran: plan drift, and safety/quality/patterns. The automated criteria were re-run on a fresh build served by a preview on 127.0.0.1:4329, because :4321 is held by the other worktree's dev server.

| Criterion | Result |
| --- | --- |
| `npm run lint` | passed |
| `npx astro check` | 0 errors |
| `npm run build` | passed |
| `npm run smoke` | all steps passed |
| `npm run ui:check` | 13 files, 0 hits |
| `/dev/kitchen-sink` in production | 404 |
| Legacy classes in dashboard scope | none |
| `client:` directives in dashboard scope | none |

Approved deviations, verified as described: the 3-column layout, the two saved tones, the extra `TierBadge`/`SavedNote`/`saved.ts` components, and the deferred tier-row polish.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | WARNING |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Findings

### F1 — Button/Input focus ring is ~2:1, below the 3:1 non-text minimum

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/ui/button.tsx:8, src/components/ui/input.tsx:11 (token: src/styles/global.css:32)
- **Detail**: The shadcn defaults `focus-visible:ring-ring/50 focus-visible:ring-[3px]` give a 50% ring that measures about 1.97:1 on `--card` in light mode and 2.17:1 in dark (computed from the oklch tokens). Borderless buttons, i.e. the primary submits and the ghost "Wyloguj się" in AppHeader, rely only on that ring. The hand-written controls use full-strength `ring-ring` at about 4.6:1. The kitchen-sink legend claims every control has a visible ring, so the visual gate missed this.
- **Fix**: In button.tsx and input.tsx, change `focus-visible:ring-ring/50` to `focus-visible:ring-ring`, matching the hand-written controls.
- **Decision**: FIXED — `ring-ring/50` replaced with `ring-ring` in button.tsx and input.tsx.

### F2 — Browsers below the `light-dark()` baseline lose every colour token

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/styles/global.css:12-43, astro.config.mjs:39-45
- **Detail**: Every token is a `light-dark()` value, and `cssTarget` deliberately turns off the polyfill so that the kitchen sink's forced schemes keep working. On Safari or iOS older than 17.5, or Chrome older than 123, every `var(--…)` is invalid: backgrounds turn transparent, borders fall back to `currentColor`, and the primary button loses its fill. The plan accepted Baseline 2024 as matching the PRD's "last two major versions", but that floor is recorded only in the plan.
- **Fix A ⭐ Recommended**: Accept the floor and document it, in CLAUDE.md's UI section and in the README Design system note.
  - Strength: matches the plan's explicit decision and the PRD target, and adds no second copy of the token values.
  - Tradeoff: users on older iOS see a broken palette.
  - Confidence: MED — iOS users update quickly, but there is no analytics on real browser versions.
  - Blind spot: no production traffic data.
- **Fix B**: Add a `@supports not (color: light-dark(#000, #fff))` block in global.css that sets the light values, plus a `prefers-color-scheme: dark` copy.
  - Strength: degrades gracefully on every Tailwind-4-capable browser.
  - Tradeoff: about 30 token values duplicated, which can drift from the main block.
  - Confidence: HIGH — standard progressive-enhancement pattern.
  - Blind spot: `ui:check` does not guard the fallback block against drift.
- **Decision**: FIXED via Fix A — the Baseline 2024 floor is documented in the CLAUDE.md UI section and in the README Design system note.

### F3 — Production sitemap lists the dev-only `/dev/kitchen-sink/`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: astro.config.mjs:16
- **Detail**: `sitemap()` has no filter, so `dist/client/sitemap-0.xml` publishes `https://dbam.amadeuszkozlowski.workers.dev/dev/kitchen-sink/`, a URL that returns 404 in production (confirmed on a fresh build). `/dashboard/`, `/profile/` and `/onboarding/` were already listed before this change.
- **Fix**: `sitemap({ filter: (page) => !page.includes("/dev/") })`.
- **Decision**: FIXED — the sitemap filter in astro.config.mjs excludes `/dev/`.

### F4 — All four font files preloaded on every page

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/layouts/Layout.astro:24-25, astro.config.mjs:19-38
- **Detail**: Both `<Font … preload />` calls have no filter, so every page preloads the latin and latin-ext files of Fraunces (121 KB + 105 KB) and Figtree (20 KB + 10 KB). Fraunces (`font-heading`) is used only on the dashboard, AppHeader and the kitchen sink, so landing, auth, onboarding and profile download about 226 KB they don't use, and the browser logs "preloaded but not used". Fraunces also ships the full 100–900 weight range, but only weight 600 is used.
- **Fix**: Preload only Figtree latin (`preload={[{ subset: "latin" }]}`), drop the Fraunces preload, and narrow Fraunces to `weights: [600]`.
- **Decision**: FIXED — Layout preloads only Figtree latin, Fraunces is no longer preloaded, and Fraunces is limited to weight 600 (its only use: `font-semibold`, 13 places).

### F5 — Manual check 4.6 is ticked but PR #64 has no screenshots

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/ui-refactor/plan.md (Progress 4.6)
- **Detail**: Row 4.6 reads "Screenshots at desktop and 375px in both schemes attached to the PR", but neither the description nor the comments of #64 contain an image. The screenshots were taken locally, but the PR has none to review. The `/10x-ui` gate treats screenshots as review evidence.
- **Fix**: Attach the desktop and 375px screenshots, in light and dark, to #64 as a comment.
- **Decision**: FIXED (owner action) — the owner attaches the screenshots to #64 as a comment; images can't be uploaded from the CLI session.

### F6 — Deferred work is not tracked where the checklist expects it

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/changes/ui-refactor/change.md (Notes), context/changes/ui-refactor/research.md:84 (Additional findings)
- **Detail**:
  - The user deferred the tier-row polish ("still not clean enough"), but it is recorded only in change.md, with no GitHub issue. Follow-ups #61–#63 cover other pages only, so the work can get lost once the change is archived.
  - The research "Additional findings" were never marked resolved or deferred. The starter branding and unused leftovers are deferred to #61 only in the plan's "What We're NOT Doing".
- **Fix**: Open an issue for the tier-row polish, and mark each additional finding in research.md as resolved (with its phase) or deferred (with its issue).
- **Decision**: FIXED — opened #67 for the tier-row polish and linked it from change.md. research.md now marks each additional finding as resolved (with its phase) or deferred (#61, #67).

### F7 — Kitchen-sink forced-scheme columns don't drive `dark:` variants

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/styles/global.css:5, src/pages/dev/kitchen-sink.astro:42-45,256-259
- **Detail**: `@custom-variant dark` is tied to `prefers-color-scheme`, while the kitchen-sink columns force their scheme with `scheme-light`/`scheme-dark`. The shadcn `dark:` utilities (on Input, the outline Button, the ghost hover and the select) therefore follow the OS, not the column. The real dashboard is correct; only the visual gate is slightly off in the column that doesn't match the OS.
- **Fix**: Add a line to the kitchen-sink legend: "`dark:` utilities follow the OS; screenshot each column with the OS set to match."
- **Decision**: FIXED — the kitchen-sink intro now explains that `dark:` utilities follow the system setting and that each column should be screenshotted with the system set to match it.

### F8 — Unmigrated pages shift beyond the body font

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/styles/global.css:12-14, src/components/LanguageSwitcher.astro
- **Detail**: Phase 1 promised "no visible change to unmigrated pages, apart from the body font". In fact:
  - `--radius` going from 0.625 to 0.875rem enlarges `rounded-*` everywhere;
  - `color-scheme: light dark` turns native controls and scrollbars dark on the cosmic pages under a dark OS;
  - the token-based language pill shows light on the dark cosmic pages under a light OS.
  Manual check 1.5 was signed off, and follow-ups #61–#63 will migrate these pages.
- **Fix**: Accept it, and add a note to #61–#63 so their visual baselines account for the shift.
- **Decision**: ACCEPTED — #61, #62 and #63 each got a comment listing the inherited shifts (radius, color-scheme, the language pill).

### F9 — Save-feedback edge cases

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/LanguageSwitcher.astro:13, src/components/recommendations/SavedNote.astro:14, scripts/smoke.mjs:166,189,201,317, src/pages/dashboard.astro (footer)
- **Detail**:
  - The language switcher's `next` keeps `?saved=…&slug=…`, so switching language replays the row highlight and the message.
  - The `role="status"` regions are already present when the page loads, so screen readers probably don't announce the confirmation. This behaviour pre-dates the change.
  - Smoke matches redirects by prefix, so a regression that drops `&slug=` or the row-level confirmation would still pass.
  - The medical disclaimer moved from the top of the recommendations to a muted footer. The plan specified this, but a health page should sign it off consciously.
- **Fix**: Strip `saved`, `error` and `slug` from `next` in LanguageSwitcher, and add one smoke assertion for the full location and the `role="status"` inside `id="screening-<slug>"`. Defer the announcement issue and confirm the disclaimer placement.
- **Decision**: FIXED, in four parts:
  - (a) LanguageSwitcher drops `saved`, `error` and `slug` from `next`.
  - (c) The saved row gets `data-saved="<tone>"`, placed after the existing smoke attributes. Smoke now asserts the full plan redirect (`&slug=…#screening-…`) and has a new step, "dashboard confirms the save on the planned row", that checks `data-saved="success"`.
  - (b) Screen-reader announcement: deferred; it pre-dates the change.
  - (d) The disclaimer in the footer is accepted, as planned.

### F10 — Minor hygiene left by the change

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/i18n/pl.ts:31,47 and en.ts; src/components/ui/badge.tsx:4 vs button.tsx:2; src/components/recommendations/ScreeningActions.astro:35,106-117
- **Detail**:
  - The keys `dashboard.greeting` and `dashboard.recommendations.heading` are now unused.
  - Radix is imported two ways: the `radix-ui` umbrella in badge and label, and `@radix-ui/react-slot` in button. They resolve to the same module, so nothing is duplicated in the bundle.
  - The raw `<select>` duplicates the Input styles with a different ring and invalid state, and its hint is linked only through the fieldset.
  - Field ids `screening-${slug}-date` and similar could, in theory, collide with a slug ending in `-date`. No current slug does.
- **Fix**: Remove the two orphaned keys now; leave the rest for the onboarding/profile follow-up (#63), which will add more form fields.
- **Decision**: FIXED — removed `dashboard.greeting` and `dashboard.recommendations.heading` from pl and en (also unused on main). The select primitive, hint linking, Radix import style and id prefix are recorded on #63.

## Triage summary (2026-10-05)

| Outcome | Findings |
| --- | --- |
| Fixed | F1, F2 (via Fix A), F3, F4, F5 (owner uploads the screenshots), F6 (#67), F7, F9, F10 |
| Accepted | F8 (noted on #61–#63) |
| Deferred | F9(b), screen-reader announcement (pre-dates the change); F10 leftovers on #63 |

Re-verified after the fixes, on a preview at 127.0.0.1:4329:

| Check | Result |
| --- | --- |
| `npm run lint` | passed |
| `npx astro check` | 0 errors |
| `npm run ui:check` | 0 hits |
| `npm run build` | passed |
| Sitemap | no `/dev/` entries |
| Font preloads on `/` | 1 (Figtree latin) |
| `/dev/kitchen-sink` in production | 404 |
| `npm run smoke` | all steps passed, including the new "dashboard confirms the save on the planned row" |
