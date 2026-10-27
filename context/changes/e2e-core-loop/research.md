---
date: 2026-10-27T20:01:26+0100
researcher: Claude (worker, feat-e2e-core-loop)
git_commit: 159e566e1d9012a0e55a7c121695fd4e70b64f6d
branch: feat/e2e-core-loop
repository: 10xdevs (dbam)
topic: "Browser E2E for the core loop: UI path, local sign-up, CI Supabase, interval oracle, Playwright state"
tags: [research, e2e, playwright, onboarding, dashboard, screenings, ci, catalog]
status: complete
last_updated: 2026-10-27
last_updated_by: Claude (worker, feat-e2e-core-loop)
---

# Research: Browser E2E for the core loop

**Date**: 2026-10-27T20:01:26+0100
**Researcher**: Claude (worker, feat-e2e-core-loop)
**Git Commit**: 159e566e1d9012a0e55a7c121695fd4e70b64f6d
**Branch**: feat/e2e-core-loop
**Repository**: 10xdevs (dbam)

## Research Question

For test-plan Phase 1 (risks #2, #4, #1 at browser level): what is the exact UI path, with labels/selectors, for sign-up → onboarding → due list → plan → confirm; how does sign-up behave locally with `enable_confirmations = false`; how does the CI `smoke` job provision local Supabase so Playwright can reuse it; which catalog entry fields give the next-due-date oracle; and is Playwright already installed?

Scope: done locally, no sub-agents (the change touches at most 3 areas: a new e2e folder + config, `package.json`, `.github/workflows/ci.yml`). No builds or tests were run.

## Summary

- **Path is all server-rendered forms plus three React islands.** Sign-up and the onboarding profile are React islands (`client:load`) with `noValidate` client validation; consent and all dashboard actions (plan, confirm) are plain `<form method="POST">` with no JavaScript. Every step has a translatable visible label (Polish by default) and stable `data-*` attributes already used by the smoke run.
- **Local sign-up signs the user in directly.** With `enable_confirmations = false` (`supabase/config.toml:209`), `/api/auth/signup` redirects to `/auth/confirm-email` (`src/pages/api/auth/signup.ts:33`), which redirects a signed-in user to `/dashboard` (`src/pages/auth/confirm-email.astro:8-11`), which sends a new user to `/onboarding` (`src/pages/dashboard.astro:34-38`). Neither smoke nor ui-shots relies on that auto-session: both sign in explicitly after signing up (`scripts/smoke.mjs:106-120`, `scripts/ui-shots.mjs:241-242`), so the browser chain signup → onboarding is not exercised anywhere today.
- **Plan-for-today is the only way to confirm in one browser run.** The plan form accepts dates from Warsaw today up to 2 years ahead (`src/lib/screenings/rules.ts:122-134`), and confirm needs `appointment_date <= today` in Warsaw (`supabase/migrations/20261005173653_confirm_screening_plan.sql:52-55`). So a plan dated today shows the confirm prompt immediately (`src/lib/screenings/rules.ts:255`), and confirming records `last_done_on = today`. Month-end/leap-day cases cannot be reached through the UI on an arbitrary run day; they stay with the unit tests.
- **Oracle:** for `mammography-nfz-program`, `interval_kind: "fixed"`, `interval_months: 24`, `interval_overrides: []` (`catalog/entries/mammography-nfz-program.json`). Expected next due = the month of the confirmed day + 24 months, rendered as `data-next-due="YYYY-MM"` and the text "Następne badanie: <month> <year>" (`src/components/recommendations/DoneItem.astro:35,49-53`).
- **CI:** the `smoke` job starts local Supabase with the CLI (pinned 2.118.0), writes `.env`/`.dev.vars` from `supabase status -o env`, builds, and serves `npm run preview -- --port 4321` before running smoke (`.github/workflows/ci.yml:40-66`). Playwright can reuse that Supabase and either that preview server or its own `webServer`.
- **Playwright:** only the `playwright` library 1.63.0 is a devDependency (`package.json`, `devDependencies`), imported only by `scripts/ui-shots.mjs:25`. There is no `@playwright/test`, no `playwright.config.*`, no e2e folder. Chromium builds `chromium-1243` and `chromium_headless_shell-1243` are present in this machine's Playwright cache; CI installs no browser today.

## Detailed Findings

### 1. Sign-up (local, confirmations off)

- Page `/auth/signup` renders `SignUpForm` as `client:load` (`src/pages/auth/signup.astro:38`); a signed-in user is redirected to `/dashboard` (`src/pages/auth/signup.astro:10-12`).
- Form: `method="POST" action="/api/auth/signup" noValidate`, client `validate()` blocks submit on errors (`src/components/auth/SignUpForm.tsx:69-78`).
- Fields (label from `src/i18n/pl.ts`, input `id`/`name` from `FormField`, `src/components/forms/FormField.tsx:38-43`):
  - "E-mail" (`pl.ts:269`) → `#email`, `name="email"`.
  - "Hasło" (`pl.ts:273`) → `#password`, `name="password"`.
  - "Powtórz hasło" (`pl.ts:292`) → `#confirmPassword`, `name="confirmPassword"`.
  - Each password field has a toggle button with `aria-label` "Pokaż hasło" (`src/components/forms/PasswordToggle.tsx:16`, `pl.ts:296`). `getByLabel("Hasło")` without `exact: true` may also match "Powtórz hasło" and the "Pokaż hasło" buttons (inference from substring matching; confirm while writing the test).
  - Submit: "Utwórz konto" (`pl.ts:259`); pending text "Tworzenie konta…" (`pl.ts:260`) with the button disabled and `aria-busy` (`src/components/forms/SubmitButton.tsx:14`).
- Password policy: 12+ chars, a letter and a digit (`supabase/config.toml:175,178`; client check `src/lib/password.ts`). The smoke password `Smoke-Test-Passw0rd!` passes it (`scripts/smoke.mjs:16`).
- Endpoint: `supabase.auth.signUp` then `redirect("/auth/confirm-email")` on success (`src/pages/api/auth/signup.ts:23-33`). The confirm-email page states that with confirmations off sign-up starts a session and redirects a signed-in user to `/dashboard` (`src/pages/auth/confirm-email.astro:8-11`). Resulting browser chain (inferred from these three redirects, not observed): `/auth/confirm-email` → `/dashboard` → `/onboarding`.
- Rate limit: `sign_in_sign_ups = 30` per 5 min per IP (`supabase/config.toml:190`). The smoke run makes 3 Supabase auth calls (one signup, two signins; the weak-password step is rejected before Supabase, `scripts/smoke.mjs:100-120`); a two-user e2e run adds 2 signups. Within one CI job that stays under 30.
- Locale: `resolveLocale(cookie lang)` (`src/middleware.ts:47`), Polish default (`src/i18n/pl.ts:1`). ui-shots also sets a `lang=pl` cookie explicitly (`scripts/ui-shots.mjs:234`).

### 2. Onboarding: consent, then profile

- `/onboarding` (protected, `src/middleware.ts:7-10`) shows the consent card when `state === "needs_consent"`, else the profile card; a complete user goes to `/dashboard` (`src/pages/onboarding.astro:24-27,69-136`).
- Consent step (plain form, no island, `src/pages/onboarding.astro:76-109`):
  - Heading h1 "Zgoda na przechowywanie danych o zdrowiu" (`pl.ts:173`).
  - Hidden `version` input (`onboarding.astro:77`) — the browser submits it, so no scraping is needed (smoke/ui-shots scrape it only because they post by hand, `scripts/smoke.mjs:80-86`).
  - Native checkbox `name="consent"` `required`, label text "Wyrażam wyraźną zgodę na przechowywanie i przetwarzanie moich danych o zdrowiu…" (`onboarding.astro:88-97`, `pl.ts:188-189`).
  - Submit "Wyrażam zgodę i przechodzę dalej" (`pl.ts:190`) → `POST /api/consent/grant` → 302 `/onboarding` (`scripts/smoke.mjs:139-143`).
- Profile step: h1 "Kilka pytań o Ciebie" (`pl.ts:191`), `ProfileForm` island `client:load` (`onboarding.astro:115,121`), `noValidate`, client parse blocks submit on errors (`src/components/profile/ProfileForm.tsx:63-71,84`).
  - "Rok urodzenia" (`pl.ts:217`) → `#birth_year` (`ProfileForm.tsx:87-98`).
  - "Płeć przy urodzeniu" fieldset/legend (`pl.ts:220`), radios "Kobieta" / "Mężczyzna" (`pl.ts:222-223`) (`src/components/forms/ChoiceGroup.tsx:19-49`; native `<input type="radio">` wrapped in its `<label>`).
  - "Palenie papierosów" fieldset, radios "Nie, nigdy" / "Tak, obecnie" / "W przeszłości" (`pl.ts:224-227`). Choosing "Tak, obecnie" or "W przeszłości" reveals pack/years fields; "W przeszłości" also reveals years since quitting (`ProfileForm.tsx:77,123-165`). "Nie, nigdy" reveals nothing.
  - Submit "Zapisz i przejdź do panelu" (`pl.ts:238`) → `POST /api/profile` → 302 `/dashboard` (`scripts/smoke.mjs:149-153`).
- Hydration: the profile radios are React-controlled and the conditional fields render only after state changes, so interacting before hydration can lose input. ui-shots waits for `!document.querySelector('astro-island[ssr]')` (`scripts/ui-shots.mjs:188-189`); Playwright's auto-waiting on visible/enabled does not wait for hydration (inference).

### 3. Dashboard: the due list

- Page structure (`src/pages/dashboard.astro`):
  - h1 "Panel" (`dashboard.astro:145`, `pl.ts:33`); status line "N zaplanowane badanie · N badanie czeka na Twoją decyzję" (`dashboard.astro:146-152`, `pl.ts:34-41`).
  - Section "Twoje plany" `aria-labelledby="plans-heading"` (`dashboard.astro:170-206`); empty text "Nic jeszcze nie zaplanowano…" (`pl.ts:131-132`).
  - Tier sections `aria-labelledby="tier-<n>-heading"` and `data-tier-section=<n>` (`src/components/recommendations/TierSection.astro:20,37`), headings "Ważne – umów się teraz" / "Warto zaplanować" / "Porozmawiaj z lekarzem" (`pl.ts:51-53`).
  - Section "Wykonane" `aria-labelledby="done-heading"`, rendered only when there are done records (`dashboard.astro:236-254`, `pl.ts:133`).
  - Section "Twój profil" with a `<dl>` of birth year, sex, smoking (`dashboard.astro:126-131,277-303`).
- Tier row (`src/components/recommendations/RecommendationItem.astro:51-92`): `<li id="screening-<slug>" data-slug data-tier>`, h3 = `name_pl` (`:59`), "Jak często: co 2 lata" (`:62`, `pl.ts:58,60`).
- Fixture: a woman born 1970 is 56 in 2026; mammography (`female`, 45–74) is in tier 1 (`evidence_level: 3` → tier 1, `src/lib/catalog/recommend.ts:96-100`). Smoke asserts `data-slug="mammography-nfz-program" data-tier="1"` for that fixture (`scripts/smoke.mjs:154-167`). Mammography `name_pl`: "Mammografia w programie profilaktyki raka piersi".

### 4. Plan an exam

- Each tier row has a `<details>` panel (`src/components/recommendations/ScreeningActions.astro:66-131`), no JavaScript:
  - `<summary>` text "Zaplanuj lub oznacz jako wykonane" + sr-only ": <name>" (`:67-70`, `pl.ts:134`). Whether Playwright's `getByRole` exposes `<summary>` with a role is not verified here; `getByText` scoped to the row works regardless (see Open Questions).
  - Plan form: legend "Zaplanuj badanie" (`pl.ts:136`), label "Termin wizyty" (`pl.ts:138`) for `<input type="date" id="screening-<slug>-date" name="appointment_date" min=<today> max=<today+2y>>` (`ScreeningActions.astro:79-90`), submit "Dodaj do planów" (`:94-96`, `pl.ts:141`). "Termin wizyty" appears once per row, so it must be scoped to the row.
- Endpoint redirects to `/dashboard?saved=plan#screening-<slug>` with the slug in a one-shot flash cookie (`src/pages/dashboard.astro:78-96`; `scripts/smoke.mjs:169-175`).
- Business result: the row moves to "Twoje plany" as `<li id="screening-<slug>" data-plan data-slug data-appointment="YYYY-MM-DD" [data-awaiting-confirmation] data-saved="success">` (`src/components/recommendations/PlanItem.astro:36-44`), with a `role="status"` note "Zapisano w Twoich planach." (`src/components/recommendations/SavedNote.astro:14`, `pl.ts:164`). The tier row for that slug disappears (`src/lib/screenings/rules.ts:282-287`; smoke `scripts/smoke.mjs:190-198`). The saved note shows on the first render only (`dashboard.astro:93-96`; smoke `:185-189`).
- A plan dated in the future shows "Termin: <d MMMM yyyy>" (`PlanItem.astro:63-67`, `pl.ts:143`); a plan dated today (or earlier) shows the confirm form instead (`PlanItem.astro:50-61`), because `awaitingConfirmation = date !== null && date <= today` (`rules.ts:255`).
- Bounds: plan date from Warsaw today to today + 2 years inclusive (`rules.ts:122-134`, `src/lib/screenings/format.ts:25-35`).

### 5. Confirm

- Planned row with `awaitingConfirmation`: text "Czy badanie odbyło się <d MMMM yyyy>?" (`PlanItem.astro:54-56`, `pl.ts:146`), button "Tak, potwierdzam" + sr-only ": <name>" (`PlanItem.astro:57-60`, `pl.ts:147`); hidden `intent=confirm`, `slug` (`:52-53`).
- Endpoint: `rpc("confirm_screening_plan", { p_slug })`; `confirmed` → `?saved=confirm`, `not_due` → `?error=appointment_not_passed` (`src/pages/api/screenings.ts:76-97`).
- SQL: deletes the caller's plan where `appointment_date <= today (Warsaw)` and upserts the completion with `last_done_month = date_trunc('month', done_on)` and `last_done_on = done_on` (`supabase/migrations/20261005173653_confirm_screening_plan.sql:38-74`). "Today" is computed in SQL (`:46`).
- Business result: the row moves to "Wykonane" as `<li id="screening-<slug>" data-done data-slug data-next-due="YYYY-MM" data-last-done-on="YYYY-MM-DD">` (`src/components/recommendations/DoneItem.astro:31-38`), with badge "Wykonane", "Ostatnio wykonane: <d MMMM yyyy>" (`DoneItem.astro:48`, `format.ts:56-57`, `pl.ts:155`), "Następne badanie: <MMMM yyyy>" (`DoneItem.astro:49-53`, `pl.ts:157`) and saved note "Potwierdzono badanie i oznaczono je jako wykonane." (`pl.ts:168`). It is not in "Twoje plany" or the tier (`rules.ts:268-287`; smoke `scripts/smoke.mjs:258-267`).
- A done record goes to "Wykonane" only while `nextDue > currentMonth` (`rules.ts:276-280`); with a 24-month interval and a done month of the current month that holds.
- Display formats: `formatDay` = `Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" })`, `formatMonth` = `{ month: "long", year: "numeric", timeZone: "UTC" }` (`format.ts:38-45`). Probed on Node v22.16.0: `pl` gives "27 października 2026" and "październik 2028". The browser renders server HTML, so the server's ICU produces these strings (the test's own `Intl` may differ only if its ICU differs; noted in the repo's wording-test guidance in `CLAUDE.md`, Testing Guidelines).

### 6. Next-due oracle from the catalog

- Fields in `catalog/entries/<slug>.json`: `interval_kind` (`fixed | no_known_interval | per_program | shared_decision`), `interval_months`, `interval_overrides[]` (`{ when, months }`), plus `eligibility[]` (`sex`, `age_min`, `age_max`, `requires[]`) and `evidence_level` for tier. Resolution: non-`fixed` → no interval; else the first matching override's `months`, else `interval_months` (`src/lib/catalog/recommend.ts:86-94`).
- Next due month = anchor month + months (`src/lib/screenings/rules.ts:180-185`); anchor = `last_done_month` (the month of the confirmed day) (`rules.ts:172-174`).
- Mammography: `fixed`, `24`, overrides `[]`, eligibility `female 45–74` with no `requires` → for any fixture in range the expected next due is `YYYY+2-MM` of the confirm day. An independent oracle: read the JSON, assert `interval_kind === "fixed"` and `interval_overrides.length === 0`, then compute `year*12 + month - 1 + interval_months` by hand (not via `addMonths` from `rules.ts`).
- Other fixed entries that a 1970 female fixture would hit have overrides keyed on factors the profile doesn't collect or on age: e.g. `blood-pressure-measurement` 36 with `age_min: 40` override → 12; `cervical-screening-nfz-program` 60 with an HIV override (inspected via a summary of all 20 entries). Mammography is the simplest oracle (no overrides).
- The app reads intervals from the `screening_catalog` table (`src/lib/catalog/read.ts:35`), which is loaded from the JSON entries by generated snapshot migrations; `npm run catalog:check` in CI keeps them in sync (`.github/workflows/ci.yml:26`, CLAUDE.md hard rule on catalog rows). So the JSON is a valid oracle for the local DB as long as `catalog:check` is green.

### 7. Second user (risk #1 at browser level)

- Dashboard and profile data come from `getOnboardingState(supabase, user.id)` and `getUserScreenings(supabase, user.id)` on the SSR client (`src/pages/dashboard.astro:29-45`), with RLS behind it (pgTAP in `supabase/tests/database/`).
- The app header shows no email or user name (`src/components/AppHeader.astro:15-16,25,49`: nav links, title, sign-out only), so "profile" isolation is visible via the "Twój profil" summary (`dashboard.astro:126-131`) and the prefilled `/profile` form (`src/pages/profile.astro:25-31`).
- For the absence check to mean anything, user B must be eligible for A's exam (e.g. also female in 45–74), otherwise mammography is absent from B's page by eligibility, not by isolation (inference from `recommend.ts:116-128`). Distinguish B by birth year (e.g. 1975 vs A's 1970) so the profile summary shows whose data it is.
- Expected for B: "Twoje plany" shows the empty text, no "Wykonane" section, mammography appears only as a tier-1 row, and the profile summary shows B's year.

### 8. CI: how the `smoke` job provisions local Supabase

`.github/workflows/ci.yml:28-90`:

1. `supabase/setup-cli@v1` with `version: 2.118.0` (`:38-40`), `npm ci` (`:41`).
2. `supabase start -x studio,imgproxy,mailpit,edge-runtime,logflare,vector,realtime,storage-api,postgres-meta,supavisor`, then `supabase status -o env | grep -E '^(API_URL|ANON_KEY|SECRET_KEY)=' > supabase.env` (`:42-45`). Migrations (including catalog snapshots) are applied by `supabase start`.
3. `supabase test db` (pgTAP) (`:46-47`).
4. Writes `.env` with `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SECRET_KEY`, `EMAIL_DRY_RUN=true`, and copies it to `.dev.vars` (`:48-52`).
5. `npm run build`, then `npm run preview -- --port 4321 &`, a curl wait loop (60 × 1 s), and `BASE_URL=http://localhost:4321 npm run smoke` (`:53-58`).
6. Scheduled-handler dry run against the same preview (`:65-84`), then `supabase stop --no-backup` under `if: always()` (`:85-86`).

The `ci` job has no Supabase (`:12-26`). Two reuse options for the plan: (a) add Playwright steps to `smoke` after step 5 (reuses Supabase and the running preview; adds browser install + test time to the `smoke` gate), or (b) a separate job repeating steps 1–2 and 4 (parallel, but a second Supabase start). Neither is decided here. The roadmap names the constraint: the job must not slow `smoke` enough to hurt deploys (`context/foundation/roadmap.md`, S-08 Risk).

Locally, worker sessions must use `$DBAM_PORT` (never 4321) and the shared DB lock for anything that writes to local Supabase (worker protocol; `README.md:433-438` for ui-shots). `astro preview` on the Cloudflare adapter reads `.dev.vars` (`.github/workflows/ci.yml:48-52` copies `.env` there for that reason).

### 9. Playwright installation state

- `package.json` devDependencies: `"playwright": "^1.63.0"`; installed `node_modules/playwright` is 1.63.0. No `node_modules/@playwright` directory, no `playwright.config.*`, no e2e folder (checked with `ls` at repo root).
- `playwright` is imported only by `scripts/ui-shots.mjs:25` (decision: `context/archive/2026-10-06-ui-verification-script/decisions.md:86-93` — library, not `@playwright/test`; Chromium only via `npx playwright install chromium --only-shell`; no lifecycle script).
- This machine's cache `~/Library/Caches/ms-playwright` holds `chromium-1243`, `chromium_headless_shell-1243`, `ffmpeg-1011`. CI installs no browser today (no `playwright install` in `.github/workflows/ci.yml`).
- `@playwright/test` must match the `playwright` version (same release line) to share the browser build; adding it is `/10x-e2e-setup`'s job.
- Tooling scope: Vitest includes only `src/**/*.test.ts` (`vitest.config.ts`), so `*.spec.ts` outside `src/` is not picked up by `npm test`. ESLint lints `**/*.{js,jsx,ts,tsx}` with `projectService: true` (`eslint.config.js:20,43`) and `tsconfig.json` includes `**/*`, so a new `playwright.config.ts` and spec files are type-checked by lint and `astro check`.

## Code References

- `src/pages/api/auth/signup.ts:23-33` — signUp, redirect to `/auth/confirm-email`.
- `src/pages/auth/confirm-email.astro:8-11` — signed-in user → `/dashboard` (confirmations off).
- `src/components/auth/SignUpForm.tsx:78-142` — sign-up fields and submit.
- `src/pages/onboarding.astro:69-136` — consent card / profile card switch.
- `src/components/profile/ProfileForm.tsx:84-180` — profile fields, conditional smoking fields, submit.
- `src/components/forms/ChoiceGroup.tsx:19-63` — native radios in a fieldset with legend.
- `src/pages/dashboard.astro:170-303` — plans, tiers, done, profile sections.
- `src/components/recommendations/ScreeningActions.astro:66-131` — plan/done panel.
- `src/components/recommendations/PlanItem.astro:36-87` — planned row, confirm form.
- `src/components/recommendations/DoneItem.astro:31-70` — done row, next due.
- `src/lib/screenings/rules.ts:122-134,172-185,230-296` — plan bounds, next due, partition.
- `supabase/migrations/20261005173653_confirm_screening_plan.sql:38-74` — confirm function.
- `src/lib/catalog/recommend.ts:86-100` — interval resolution, tier mapping.
- `catalog/entries/mammography-nfz-program.json` — `interval_months: 24`, no overrides.
- `.github/workflows/ci.yml:28-86` — `smoke` job.
- `scripts/smoke.mjs:154-267` — HTTP-level assertions for the same steps (data attributes to mirror).
- `scripts/ui-shots.mjs:53-110,177-190` — local-only guards, hydration wait.

## Architecture Insights

- Every core-loop row exposes a stable contract already pinned by smoke: `id="screening-<slug>"`, `data-plan`/`data-done`/`data-tier`, `data-appointment`, `data-last-done-on`, `data-next-due`, `data-saved`. A row locator by `id` or by its h3 name, plus user-visible text assertions, avoids CSS classes (test-plan Risk #2 anti-pattern).
- All dashboard mutations are POST + 302 + full page render, so after each click the test can wait on navigation to `/dashboard` and assert the rendered result; no client state to poll.
- "Today" lives in two places: Warsaw today in the app (`rules.ts:55-64`) and in SQL (`confirm_screening_plan.sql:46`). The test must compute the expected day as Warsaw today, like smoke does (`scripts/smoke.mjs:62-70`); a run that crosses Warsaw midnight between plan and confirm can flake (smoke documents the same, `:60-61`).
- Local-only guards are a project convention: smoke refuses a non-local `BASE_URL` (`scripts/smoke.mjs:8-14`), ui-shots also refuses a non-local `SUPABASE_URL` and port 4321 in worker sessions (`scripts/ui-shots.mjs:61-110`). The e2e config should follow it (test-plan §4 row "e2e": must refuse a non-local base URL).

## Historical Context (from prior changes)

- `context/archive/2026-10-06-ui-verification-script/decisions.md:86-93` — Playwright packaging: library only, Chromium via explicit install, no postinstall. Still accurate for `package.json` today. A test runner was explicitly out of scope there (`plan.md:53`), not rejected for later changes.
- `context/archive/2026-10-05-confirm-exam-and-recurrence/` — introduced `confirm_screening_plan` and the "today in SQL" rule (migration `20261005173653`, follow-up `20261005180420_clear_stale_last_done_on.sql`).
- `context/foundation/roadmap.md` S-08 — outcome, "never against production", and the CI-time constraint.
- `context/foundation/test-plan.md` §2–§4 — risks #1/#2/#4, anti-patterns (CSS selectors, fixed sleeps, URL-only asserts, oracle via the production date helper).

## Related Research

- `context/archive/2026-10-06-ui-verification-script/research.md` — Playwright library use and local guards for ui-shots.

## Open Questions

1. CI placement: Playwright steps inside `smoke` (reuse Supabase + preview on 4321) vs a separate job. Trade-off is gate time vs a second Supabase start. For `/10x-plan` (or `/10x-e2e-setup`).
2. `webServer`: let Playwright start `astro preview` itself (locally on `$DBAM_PORT`, after a build with local `.dev.vars`) or point at an already running server via `BASE_URL`. ui-shots chose the latter (needs `astro dev` for the kitchen sink); e2e has no dev-only page, so a production preview fits the test-plan ("local build").
3. Confirm with Playwright MCP or a first spec run: (a) whether `<summary>` is reachable by role or needs `getByText` within the row; (b) exact `getByLabel` matches for "Hasło" vs "Powtórz hasło"/"Pokaż hasło"; (c) the signup → confirm-email → dashboard → onboarding chain lands on `/onboarding` in a real browser (inferred from code, not observed).
4. Plan step coverage: plan for today only (one step to the confirm prompt), or plan a future date first (asserting "Termin: …"), then change it to today via "Zmień termin lub oznacz jako wykonane" → "Zapisz termin" (`pl.ts:135,142`) before confirming. Both are reachable in the UI.
