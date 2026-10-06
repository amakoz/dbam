# Decisions — ui-verification-script (F-05)

## 2026-10-06 Where screenshots go and how a PR shows them

- **Question:** research Open Question 1. A gitignored folder is invisible to a GitHub reviewer, and the CLI can't upload images.
- **Options:**
  - (a) gitignored only;
  - (b) gitignored by default plus a way to write chosen shots into a change folder;
  - (c) a CI artifact.
- **Choice:** (b). The default output is a gitignored folder. An `--out <dir>` flag lets a worker write shots into `context/changes/<id>/screenshots/` when a PR needs images. Uploading images to GitHub is out of scope.
- **Evidence:** `context/archive/2026-09-30-ui-refactor/reviews/impl-review.md:88-96`; `context/changes/dashboard-tier-polish/screenshots/` precedent.
- **Decided by:** orchestrator

## 2026-10-06 Fixture model

- **Question:** research Open Question 2.
- **Choice:** a fresh user per run, using the same flow as `scripts/smoke.mjs` (sign up, consent, profile through the app's endpoints).
- **Evidence:** `scripts/smoke.mjs:101-153`; no `supabase/seed.sql`; `service_role` has no user-table privileges.
- **Decided by:** orchestrator

## 2026-10-06 Dashboard data

- **Question:** research Open Question 3.
- **Choice:** add one plan and one done record through the app's own endpoints (`/api/screenings`), so the plan and done rows appear on the dashboard.
- **Decided by:** orchestrator

## 2026-10-06 Local-only guard and DB lock

- **Question:** research Open Question 4.
- **Choice:**
  - Refuse a non-local `BASE_URL` and a non-local `SUPABASE_URL`.
  - Callers take the shared DB lock, like smoke, and the docs say so.
- **Decided by:** orchestrator

## 2026-10-06 Screenshot matrix

- **Question:** research Open Question 5.
- **Choice:**
  - The 16 base PNGs (4 views × light/dark × 1440/390) plus the onboarding steps.
  - Full-page capture.
  - An `--only <view>` filter.
- **Decided by:** orchestrator

## 2026-10-06 Docs and agent wiring

- **Question:** research Open Question 6.
- **Choice:** README and CLAUDE.md are updated in this PR. The orchestrator updates its own skill after merge.
- **Decided by:** orchestrator

## 2026-10-06 Dev toolbar and lint globals

- **Choice:**
  - Hide the Astro dev toolbar with Playwright's screenshot `style` option, not app config.
  - Extend the `scripts/**/*.mjs` lint globals only as the script needs.
  - Manual checks that need the PR belong to the PR stage.
- **Decided by:** orchestrator

## 2026-10-06 "Onboarding steps" = consent step + profile step

- **Question:** how many onboarding shots count as "the onboarding steps"?
- **Options:**
  - (a) consent step and profile step, 4 PNGs each, 20 PNGs in total;
  - (b) add the withdrawn and error variants too.
- **Choice:** (a). The onboarding view yields `onboarding-consent-*` and `onboarding-profile-*`. With dashboard, profile and kitchen-sink that is 20 PNGs.
- **Evidence:** `src/pages/onboarding.astro:69-111` (consent) and `:121` (profile island) are the two states a new user passes through. The withdrawn and error alerts are variants of those cards.
- **Decided by:** worker

## 2026-10-06 File names and widths

- **Choice:**
  - Names: `<view>-<desktop|mobile>-<light|dark>.png`, where desktop is 1440px and mobile is 390px.
  - Views: `onboarding-consent`, `onboarding-profile`, `dashboard`, `profile`, `kitchen-sink`.
  - Default folder: `ui-shots/` at the repo root (gitignored).
  - Existing files are overwritten; nothing is deleted.
- **Evidence:** the naming matches the auth-ui-redesign screenshots convention (`context/archive/2026-10-05-auth-ui-redesign/plan.md:481,503`).
- **Decided by:** worker

## 2026-10-06 `--only` values and kitchen-sink-only runs

- **Choice:**
  - `--only` takes `onboarding | dashboard | profile | kitchen-sink`. It can be repeated; an unknown value exits 2 with usage.
  - When only `kitchen-sink` is selected, no fixture user is created, because the page needs no sign-in. Such a run writes nothing to the database and needs no DB lock.
- **Evidence:** `src/middleware.ts:5-13` (kitchen sink not protected).
- **Decided by:** worker

## 2026-10-06 Playwright packaging

- **Choice:**
  - `playwright` (library, not `@playwright/test`) as a devDependency, imported only from `scripts/ui-shots.mjs`.
  - Chromium only, installed explicitly with `npx playwright install chromium --only-shell`; no lifecycle script.
  - A missing browser exits 1 with that hint.
- **Evidence:** `playwright@1.63.0` has no npm scripts; browsers are not downloaded on install (playwright.dev/docs/library); `deploy` runs `npm ci` (`.github/workflows/ci.yml:131`).
- **Decided by:** worker

## 2026-10-06 One browser context, theme by media emulation

- **Choice:**
  - One context per run, so one session.
  - Per shot, `page.emulateMedia({ colorScheme })` and `page.setViewportSize`.
  - A `lang=pl` cookie, `deviceScaleFactor: 1`, and `reducedMotion: "reduce"`.
  - Fixture HTTP calls go through `context.request` (shares the cookie jar) with an `Origin` header, like smoke.
- **Evidence:** `src/styles/global.css:4-5` (theme = `prefers-color-scheme`); `scripts/smoke.mjs:51` (Origin header on form POSTs).
- **Decided by:** worker

## 2026-10-06 Done record exam

- **Choice:** the plan goes on `mammography-nfz-program`, dated 30 days after Warsaw today. The done record goes on `cervical-screening-nfz-program` for last calendar month (Warsaw).
- **Evidence:**
  - Both exams are active and fit the smoke fixture (woman born 1970): `catalog/entries/mammography-nfz-program.json` (women 45–74), `catalog/entries/cervical-screening-nfz-program.json` (women 25–64).
  - Two different exams are needed, because a plan and a done record on the same exam replace each other (`scripts/smoke.mjs:255-269`).
- **Decided by:** worker

## 2026-10-06 Where the guard reads SUPABASE_URL

- **Choice:**
  - Check `process.env.SUPABASE_URL`, `.dev.vars` and `.env` at the repo root. Every value found must have hostname `localhost` or `127.0.0.1`.
  - If no value is found anywhere, refuse, because locality can't be shown.
  - Refusals exit 2, like smoke.
- **Evidence:** the dev server reads `.dev.vars`; Node tooling reads `.env` (`CLAUDE.md` Security & Configuration).
- **Decided by:** worker

## 2026-10-06 No CI job, no unit tests

- **Choice:**
  - No CI step: the kitchen sink 404s under CI's preview server, and a browser download would run on every job.
  - No Vitest case: Vitest covers `src/**/*.test.ts` only.
  - Verification is a real run against a local dev server plus the refusal paths.
- **Evidence:** `.github/workflows/ci.yml:60-65`; `vitest.config.ts:7`; F-05 outcome (`context/foundation/roadmap.md:148`).
- **Decided by:** worker

## 2026-10-06 Plan-review triage (`plan-review.md`, F1–F5)

- **Question:** which plan-review findings to apply.
- **Choice:** all five accepted.
  - **F1:**
    - The docs spell out `BASE_URL=http://127.0.0.1:$DBAM_PORT` for workers and tell readers to open only the paths the run printed.
    - The summary line prints `BASE_URL`.
    - The script refuses port 4321 when `DBAM_CHANGE` is set.
  - **F2:** a warm-up pass (GET each selected path plus `/auth/signin`, wait for `networkidle`, ignore results) before the checked run. The residual risk is named.
  - **F3:** each fixture step prints one `fixture: …` line.
  - **F4:** `SUPABASE_URL` parsing is specified (anchored, comment-safe, quotes stripped, unparseable → exit 2). The shell-env limitation is noted.
  - **F5:** the header wording is now "unlike the other `scripts/*.mjs`, it has a dependency".
- **Evidence:** `context/changes/ui-verification-script/plan-review.md`
- **Decided by:** orchestrator

## 2026-10-06 Phase 1 implementation adaptations

- **Question:** what the plan left open while writing `scripts/ui-shots.mjs`.
- **Choice:**
  - Printed paths are relative to the current directory, except a `--out` folder outside it, which prints absolute (a `../../..` path can't be opened with a file reader).
  - No lint globals were added: the `page.waitForFunction` readiness check is a string expression, so `document` never appears in the script.
  - `astro dev` (Astro 7) daemonizes and binds `::1` only, so `http://127.0.0.1:$DBAM_PORT` needs `npx astro dev --port $DBAM_PORT --host 127.0.0.1` (stop it with `npx astro dev stop`). Phase 2 docs state this.
  - `.astro/` types must exist for lint (`npx astro sync`) in a fresh worktree.
- **Evidence:** full run exit 0, 20 PNGs, 6 `fixture:` lines; the opened shots show the planned and done rows, the reminders hint, no dev toolbar, and 390px width without overflow.
- **Decided by:** worker
