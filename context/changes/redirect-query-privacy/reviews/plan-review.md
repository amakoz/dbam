<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Redirect Query Privacy

- **Plan**: context/changes/redirect-query-privacy/plan.md
- **Mode**: Deep (inline verification, no sub-agent: 6 files touched)
- **Date**: 2026-10-06
- **Verdict**: SOUND
- **Findings**: 0 critical, 0 warnings, 3 observations

Reviewed against `decisions.md` (carrier, scope, residuals and clearing method are owner/orchestrator decisions and were not re-litigated).

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | PASS    |
| Plan Completeness     | PASS    |

## Grounding

6/6 paths ✓ (`api/screenings.ts`, `dashboard.astro`, `LanguageSwitcher.astro`, `smoke.mjs`, `ui-shots.mjs`, `README.md`), symbols ✓ (`SLUG_PATTERN`, `AstroCookieSetOptions` exported from `astro`, smoke `storeCookies` drops only on `max-age=0`, `bodyExcludes` supported), line refs ✓ (`dashboard.astro:92,77-79`, `screenings.ts:29,41-49,81`, `smoke.mjs:173,209,216-219`, `README.md:352`), brief↔plan ✓, Progress↔Phase ✓.

Verified claims: the page-level alert carries no `data-saved`, so the "shows once" `bodyExcludes` holds; `aria-invalid` is not an HTML boolean attribute in Astro, so `dateInvalid ? true` renders `aria-invalid="true"`; ui-shots matches by prefix (`/dashboard?saved=plan`) and needs no change; the first `GET /dashboard` after the plan save (`smoke.mjs:176`) would consume the flash, which the plan's reordering handles; pages already set cookies (Supabase session refresh through `Astro.cookies`), so setting/clearing in `dashboard.astro` frontmatter has precedent.

## Findings

### F1 — Manual checks have no owner in a worker run

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Progress 1.7–1.9, 2.2
- **Detail**: 2.2 (production Workers Logs check) can only run after merge and deploy, and decision 5 says the log check doesn't block F-09; as written it leaves Phase 2 permanently open for `/10x-implement` and `/10x-archive`. 1.7–1.9 need a browser.
- **Fix**: Label 2.2 "post-merge, human, non-blocking (B-01 check)"; let the implementer cover 1.7–1.9 with a headless browser run (Playwright, as ui-shots does) or hand them to the orchestrator.
- **Decision**: PENDING

### F2 — Two `/dashboard` redirects bypass the tested builder

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §1, §3 (`screenings.ts:29`, `:81`)
- **Detail**: Both are slug-free today (`:81` is fragment-only), but they stay hand-built strings outside `dashboardLocation`, so the privacy gate doesn't cover them. Lesson "privacy tests are the guard" asks for a case per output path.
- **Fix**: Let `dashboardLocation` accept `null` feedback (→ `/dashboard` + optional fragment), route `:29` and `:81` through it, and add the null-feedback case to `flash.test.ts` (a).
- **Decision**: PENDING

### F3 — Smoke can't see cookie scoping

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §6
- **Detail**: The smoke jar (`smoke.mjs:31-43`) ignores `Path`, `Secure` and `HttpOnly`, so smoke proves the round trip but not that a real browser sends the cookie to `/dashboard` after the POST to `/api/screenings`. That rests on `flash.test.ts` (c) and manual 1.7.
- **Fix**: Keep 1.7 as a real-browser check (don't waive it on a green smoke); no plan edit needed beyond F1.
- **Decision**: PENDING
