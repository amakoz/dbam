# Browser E2E for the Core Loop Implementation Plan

## Overview

Add a Playwright Test suite that drives the rendered app in Chromium against a local production build and local Supabase. It covers test-plan Phase 1: risk #2 (the core loop breaks in a real browser), risk #4 (a confirmed exam is lost or gets a wrong next due date) and risk #1 at browser level (a second user sees another user's data). The suite runs as required CI on every PR inside the existing `smoke` job.

## Current State Analysis

- Only the `playwright` library 1.63.0 is installed, used by `scripts/ui-shots.mjs:25`. There is no `@playwright/test`, no `playwright.config.*`, no e2e folder and no browser install in CI (research §9).
- `scripts/smoke.mjs` posts the same forms over HTTP and pins the `data-*` contract of each dashboard row (`scripts/smoke.mjs:154-267`). It does not exercise hydration, client validation, native form submission or the redirect chain a browser follows.
- Local sign-up with `enable_confirmations = false` starts a session. The browser chain `/api/auth/signup` → `/auth/confirm-email` → `/dashboard` → `/onboarding` is inferred from code (`src/pages/api/auth/signup.ts:33`, `src/pages/auth/confirm-email.astro:8-11`, `src/pages/dashboard.astro:34-38`) and exercised nowhere today.
- Confirm needs `appointment_date <= today (Warsaw)` (`supabase/migrations/20261005173653_confirm_screening_plan.sql:52-55`), and plan dates start at today (`src/lib/screenings/rules.ts:122-134`). A plan dated today therefore lands straight on the confirm prompt (`src/lib/screenings/rules.ts:255`).
- CI `smoke` starts local Supabase, writes `.env`/`.dev.vars`, builds and serves `npm run preview -- --port 4321` in the background. The later scheduled-handler step already reuses that preview (`.github/workflows/ci.yml:40-86`).

## Desired End State

- `npm run test:e2e` runs three spec files in Chromium: the seed (sign-up reaches onboarding), the core loop (#2 + #4) and two-user isolation (#1). It runs against `BASE_URL` when set, or else against a preview it builds and starts on `$E2E_PORT`/`$DBAM_PORT`. It refuses any non-local base URL or Supabase URL.
- The CI `smoke` job runs the suite after the smoke step, against the same Supabase and preview on 4321. It uploads the report and traces only on failure.
- `context/foundation/test-stack.md` records the E2E setup. CLAUDE.md, README and test-plan §4/§6.3 describe how to run and extend the suite.
- Verify: `npm run test:e2e` is green locally (under the DB lock) and in the PR's `smoke` job, and each risk spec has gone red under a deliberate break.

### Key Discoveries:

- Every row exposes a stable contract: `id="screening-<slug>"`, `data-plan`/`data-done`/`data-tier`, `data-appointment`, `data-last-done-on`, `data-next-due` (`src/components/recommendations/PlanItem.astro:36-44`, `DoneItem.astro:31-38`, `RecommendationItem.astro:51-58`). Sections are labelled by their headings (`src/pages/dashboard.astro:170,237,277`; `TierSection.astro:37`).
- React islands (`SignUpForm`, `ProfileForm`) need hydration before input. Wait for `!document.querySelector('astro-island[ssr]')` (`scripts/ui-shots.mjs:188-189`).
- Oracle: `catalog/entries/mammography-nfz-program.json` has `interval_kind: "fixed"`, `interval_months: 24`, `interval_overrides: []` and eligibility `female 45–74`. The confirm records `last_done_month` = month of the appointment day (`confirm_screening_plan.sql:64-67`).
- `astro preview` on Astro 7 moves itself to a background daemon when it detects an agent. `ASTRO_PREVIEW_BACKGROUND=1` keeps it in the foreground for `webServer` (`.claude/skills/10x-e2e-setup/references/playwright-setup-templates.md:73-89`).
- ESLint applies `react-hooks` rules to every `.ts` file (`eslint.config.js:42-58`). A Playwright fixture callback parameter named `use` is reported as a hook call.

## What We're NOT Doing

- Rescheduling a plan via "Zmień termin" (follow-up note only, decided by the orchestrator).
- Month-end and leap-day next-due cases: the UI can only plan and confirm "today" (unit tests in `src/lib/screenings/` own them).
- Forged-identifier writes, reminder recipients and privacy output paths (test-plan Phases 2–3).
- A separate CI job or a branch-protection change. A split is a follow-up only if the added time exceeds ~4 min.
- A shared test user, `auth.setup.ts` or `storageState`: each test signs up its own user, because sign-up is part of risk #2.
- `playwright-cli` agent wiring under `.claude/` (only `.claude/settings.json` is tracked). Exploration uses `npx -y @playwright/cli` or the Playwright MCP ad hoc.
- Pixel or visual snapshot diffs (test-plan §7).
- `roadmap.md` status changes.

## Implementation Approach

Phase 1 runs `/10x-e2e-setup`, adapted to this repo: exact-pinned `@playwright/test`, a config with local-only guards, `BASE_URL`-or-`webServer`, no auth setup project, and a seed that proves the sign-up → onboarding chain. Phases 2 and 3 run `/10x-e2e` once per risk group. Shared UI steps (sign up, consent, profile) and the oracle live in a small support module, so both specs drive the same path. Phase 4 wires the suite into the `smoke` job and documents it. Locators are role/label/text first, scoped to the row or section. A `data-testid` is added only if a step has no accessible locator.

## Critical Implementation Details

- **Local-only guard runs at config load.** `playwright.config.ts` must refuse, before any server starts or test runs, a `BASE_URL` whose host is not `localhost`/`127.0.0.1`. It must also refuse a `SUPABASE_URL` that is not local, read from the environment and from `.dev.vars*`/`.env*` at the repo root (excluding `.env.example`), mirroring `scripts/ui-shots.mjs:70-110`. Otherwise a local preview built against production secrets would sign up real users.
- **Warsaw "today".** The test computes the plan date as today in `Europe/Warsaw` once, at test start, like `scripts/smoke.mjs:62-70`. A run that crosses Warsaw midnight between plan and confirm can flake; document it in the spec, as smoke does.
- **Oracle independence.** The specs never import from `src/lib/screenings` or `src/lib/catalog`. The expected month is year/month arithmetic on the JSON's `interval_months`, after asserting `interval_kind === "fixed"` and `interval_overrides.length === 0`. Expected display strings come from the test's own `Intl.DateTimeFormat("pl", …)`. The server renders in workerd and the test runs in Node, so if their ICU output ever differs, the spec reports it as a failure rather than hiding it. Also assert `data-next-due`/`data-last-done-on` as the exact-value check.
- **Lint.** Name a `test.extend` fixture's callback parameter something other than `use` (or avoid custom fixtures), or `react-hooks/rules-of-hooks` fails the `ci` job.

## Phase 1: Playwright setup and seed (`/10x-e2e-setup`)

### Overview

Install the runner, create the config with local-only guards, write and green one seed spec, and record the setup in `test-stack.md`.

### Changes Required:

#### 1. Runner dependency and script

**File**: `package.json`, `package-lock.json`

**Intent**: Add the test runner on the same release as the existing `playwright` library, so both share the cached Chromium build. Add a script for the suite.

**Contract**: devDependency `"@playwright/test": "1.63.0"` (exact, matching `node_modules/playwright` 1.63.0); script `"test:e2e": "playwright test"`. No `postinstall` and no browser download on install (keeps the decision in `context/archive/2026-10-06-ui-verification-script/decisions.md:86-93`).

#### 2. Playwright config

**File**: `playwright.config.ts`

**Intent**: One Chromium project against a local production preview, safe by construction.

**Contract**:

- `testDir: "tests/e2e"`, Chromium only, `workers: 1`, `fullyParallel: false`, `retries: process.env.CI ? 1 : 0`, `trace: "on-first-retry"`, `screenshot: "only-on-failure"`, reporters `list` + `html` (`open: "never"`).
- `PORT = E2E_PORT ?? DBAM_PORT ?? 4321`. `baseURL = BASE_URL ?? http://127.0.0.1:${PORT}`.
- `webServer` only when `BASE_URL` is unset: `npm run build && npm run preview -- --port ${PORT} --host 127.0.0.1`, `url: baseURL`, `reuseExistingServer: !process.env.CI`, `env: { ASTRO_PREVIEW_BACKGROUND: "1" }`, a generous build timeout.
- The local-only guards (Critical Implementation Details) run at config load and throw with a message naming the offending source. The guard may live in a small module under `tests/e2e/support/` that the config imports.
- No `setup` project and no `storageState`.

#### 3. Ignore Playwright output

**File**: `.gitignore`

**Intent**: Keep reports, traces and CLI scratch out of git.

**Contract**: add `playwright-report/`, `test-results/`, `playwright/.auth/`, `.playwright-cli/`.

#### 4. Seed spec

**File**: `tests/e2e/seed.spec.ts`

**Intent**: The exemplar for later specs: a fresh user signs up through the rendered form and lands on the consent step. This proves the auto-session redirect chain (risk #2, first step) that no existing check exercises.

**Contract**: provenance comment `risk #2`. Unique email `e2e-<random>@example.com`, a policy-compliant password. Wait for hydration, then fill "E-mail", "Hasło", "Powtórz hasło" (exact labels) and click "Utwórz konto". Assert the URL path is `/onboarding` **and** the heading "Zgoda na przechowywanie danych o zdrowiu" is visible. Polish via the default locale (or a `lang=pl` cookie in the context).

#### 5. Test stack record

**File**: `context/foundation/test-stack.md`

**Intent**: The `## E2E` section `/10x-e2e` reads instead of scanning.

**Contract**: the fields of `.claude/skills/10x-e2e-setup/references/test-stack-e2e-schema.md`. `auth setup project: none — each test signs up a fresh user through the UI`, `storageState: none`, `browser CLI: npx -y @playwright/cli (no agent wiring)`, seed `tests/e2e/seed.spec.ts` — protects risk #2 (sign-up reaches onboarding). Port line notes `E2E_PORT`, then `DBAM_PORT`, then 4321.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes with the new config and spec
- `npx astro check` passes
- `npm test` still collects only `src/**/*.test.ts` (no e2e spec picked up)
- The config refuses `BASE_URL=https://example.com` and a non-local `SUPABASE_URL` before starting a server (exit non-zero, message names the source)
- Seed is green from a cold server under the DB lock: `npm run test:e2e -- tests/e2e/seed.spec.ts` (nothing listening on the port beforehand)

#### Manual Verification:

- Review `tests/e2e/seed.spec.ts` as the pattern later specs copy (role/label locators, no sleeps, asserts what the user sees)

**Implementation Note**: After this phase's automated verification passes, continue to Phase 2 (the orchestrator chains phases; manual rows go to the PR's Manual checks).

---

## Phase 2: Core loop E2E — risks #2 and #4 (`/10x-e2e`)

### Overview

A fresh user clicks through sign-up → consent → profile → due list → plan for today → confirm. Each step asserts its business result, and the done row shows the next due date the catalog implies.

### Changes Required:

#### 1. Shared steps and oracle

**File**: `tests/e2e/support/` (e.g. `core-loop.ts`)

**Intent**: One implementation of the UI steps and the oracle, used by both risk specs.

**Contract**: helpers that drive the UI only (no direct HTTP posts, no Supabase client): `signUp(page)`, `grantConsent(page)`, `completeProfile(page, { birthYear })` (sex "Kobieta", smoking "Nie, nigdy", submit "Zapisz i przejdź do panelu"), `warsawToday()`. `eligibleBirthYear(offset)` = current year − 50 − offset, so mammography (45–74) stays eligible. `mammographyOracle(doneDay)` reads `catalog/entries/mammography-nfz-program.json`, asserts the fixed/no-override shape, and returns `name_pl`, the expected `YYYY-MM` next-due value and the expected Polish strings for "Ostatnio wykonane: …" and "Następne badanie: …".

#### 2. Core loop spec

**File**: `tests/e2e/core-loop.spec.ts`

**Intent**: Guard risk #2 (each step's business result is visible) and risk #4 (the confirmed exam lands in "Wykonane" on the appointment day with the catalog-implied next due date, and stays there after a reload).

**Contract**: provenance `risk #2, risk #4`. Assertions, in order:

- After the profile: path `/dashboard`, h1 "Panel"; the "Ważne – umów się teraz" section has the mammography row; "Twoje plany" shows its empty text.
- Plan: open the row's "Zaplanuj lub oznacz jako wykonane", fill "Termin wizyty" (scoped to the row) with Warsaw today, click "Dodaj do planów". The "Twoje plany" section now holds the mammography row with status "Zapisano w Twoich planach." and "Czy badanie odbyło się <today, long pl>?". The tier-1 section no longer holds it.
- Confirm: click "Tak, potwierdzam" in that row. The "Wykonane" section holds the row with status "Potwierdzono badanie i oznaczono je jako wykonane.", "Ostatnio wykonane: <today>", "Następne badanie: <oracle month>", `data-last-done-on=<today>` and `data-next-due=<oracle YYYY-MM>`. Neither "Twoje plany" (empty text back) nor tier 1 holds it.
- Reload `/dashboard`: the done row and its dates are unchanged.

### Success Criteria:

#### Automated Verification:

- `npm run test:e2e -- tests/e2e/core-loop.spec.ts` is green under the DB lock
- Deliberate break turns it red, then reverts green: changing the oracle's interval input (e.g. 24 → 12 months) fails on the next-due assertion
- `npm run lint` and `npx astro check` pass
- `grep -rn "src/lib" tests/e2e` finds no import of production modules (heuristic for oracle independence)

#### Manual Verification:

- Trace or report review: each step's assertion targets visible text or a row attribute, not a CSS class or a bare URL

**Implementation Note**: Continue to Phase 3 after the automated rows pass.

---

## Phase 3: Two-user isolation — risk #1 at browser level (`/10x-e2e`)

### Overview

User A ends with a confirmed exam and an open plan. User B, in a separate browser context, sees none of it and sees only B's own profile.

### Changes Required:

#### 1. Isolation spec

**File**: `tests/e2e/isolation.spec.ts`

**Intent**: Guard risk #1 in the browser: per-user data stays per-user across the dashboard and profile pages.

**Contract**: provenance `risk #1`. Two `browser.newContext()` sessions.

- **A**: born `eligibleBirthYear(0)`. Plans mammography for today and confirms it (shared helpers), and plans one more eligible exam without a date, so A holds both a done record and a plan. Pick a fixed-interval tier entry eligible for the fixture; its `name_pl` is read from its catalog JSON.
- **B**: also female and eligible for both exams, born `eligibleBirthYear(5)`. On `/dashboard`: "Twoje plany" shows its empty text, there is no "Wykonane" section, and both exams appear only as tier rows. The "Twój profil" summary shows B's year and not A's. On `/profile` the "Rok urodzenia" field holds B's year.
- A's context, reloaded after B, still shows A's done row and plan.

### Success Criteria:

#### Automated Verification:

- `npm run test:e2e -- tests/e2e/isolation.spec.ts` is green under the DB lock
- Deliberate break turns it red, then reverts green: B's assertions run in A's context (same session) and fail on the plans/done checks
- Full suite `npm run test:e2e` is green under the DB lock
- `npm run lint` and `npx astro check` pass

#### Manual Verification:

- Confirm B's fixture is eligible for A's exams (absence is due to isolation, not eligibility)

**Implementation Note**: Continue to Phase 4 after the automated rows pass.

---

## Phase 4: CI wiring and docs

### Overview

Run the suite as part of the required `smoke` job, keep the added time bounded, and document the command.

### Changes Required:

#### 1. `smoke` job steps

**File**: `.github/workflows/ci.yml`

**Intent**: Gate every PR on the browser suite without a second Supabase start or a branch-protection change.

**Contract**: in `smoke`, right after "Run smoke test against production preview":

- `actions/cache` on `~/.cache/ms-playwright`, keyed on the runner OS and the installed `@playwright/test` version (from `package-lock.json`).
- `npx playwright install --with-deps --only-shell chromium`.
- `BASE_URL=http://localhost:4321 npm run test:e2e` (the preview started by the smoke step; `CI` is set by Actions, so retries = 1).
- `actions/upload-artifact` of `playwright-report/` and `test-results/` with `if: failure()`.

The scheduled-handler step and `supabase stop` stay after it. A short comment states why it lives in `smoke` (only `ci` + `smoke` gate `main`).

#### 2. Docs

**File**: `CLAUDE.md`, `README.md`, `context/foundation/test-plan.md`

**Intent**: Make the command and its rules discoverable.

**Contract**:

- CLAUDE.md, Build/Test commands: a `npm run test:e2e` line: local build + local Supabase only, refuses non-local URLs, worker sessions take the DB lock and use `$DBAM_PORT`, one-time `npx playwright install chromium --only-shell`.
- README: a short "Browser E2E" subsection with the same rules plus the CI placement.
- test-plan §4: e2e row becomes Playwright Test 1.63.0. §6.3: location, pattern (fresh user per test, UI-only steps, oracle from catalog JSON, role/label locators), reference spec `tests/e2e/core-loop.spec.ts`, run command. §6.6: a Phase 1 note naming the follow-ups (rescheduling flow; split into its own required job if the added time exceeds ~4 min). Leave the §3 Status column to the orchestrator.

### Success Criteria:

#### Automated Verification:

- Workflow YAML parses: `node -e "require('yaml').parse(require('fs').readFileSync('.github/workflows/ci.yml','utf8'))"` exits 0 (`yaml` is already in `node_modules` as a transitive dependency)
- `npx prettier --check CLAUDE.md README.md context/foundation/test-plan.md context/foundation/test-stack.md` passes
- PR `smoke` job runs the e2e step and it passes

#### Manual Verification:

- PR description records the measured minutes the e2e steps add to `smoke` (cold and, if available, cached run); if > ~4 min, the follow-up is noted in `decisions.md`
- On a failing run, the Playwright report artifact is uploaded (check once if a failure occurs; not forced)

**Implementation Note**: Open the PR after this phase; manual rows go to the PR's Manual checks list.

---

## Testing Strategy

### Unit Tests:

- None added. Date and recurrence edge cases stay in `src/lib/screenings/*.test.ts`.

### Integration Tests:

- The three Playwright specs above, against local build + local Supabase.

### Manual Testing Steps:

1. Read the seed and core-loop specs as the pattern for future e2e tests.
2. Check the PR's `smoke` job timing and the e2e step output.

## Performance Considerations

`workers: 1`, Chromium headless shell only, browser cache keyed on version. Expected added time is the browser install (cached after the first run, except OS deps) plus three specs of a few seconds each. Auth rate limit: `sign_in_sign_ups = 30` per 5 min per IP (`supabase/config.toml:190`). Smoke makes 3 auth calls and the suite 4 sign-ups (seed 1, core loop 1, isolation 2), up to 4 more if CI retries every spec once, which stays under it.

## Migration Notes

None: no schema or data changes. Rollback is reverting the workflow steps.

## References

- Research: `context/changes/e2e-core-loop/research.md`
- Decisions: `context/changes/e2e-core-loop/decisions.md`
- Test plan: `context/foundation/test-plan.md` §2–§6
- Patterns: `scripts/smoke.mjs:60-70,154-267`, `scripts/ui-shots.mjs:53-110,177-190`
- Setup skill references: `.claude/skills/10x-e2e-setup/references/`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Playwright setup and seed

#### Automated

- [ ] 1.1 `npm run lint` passes with the new config and spec
- [ ] 1.2 `npx astro check` passes
- [ ] 1.3 `npm test` still collects only `src/**/*.test.ts`
- [ ] 1.4 Config refuses a non-local BASE_URL and SUPABASE_URL before starting a server
- [ ] 1.5 Seed is green from a cold server under the DB lock

#### Manual

- [ ] 1.6 Review the seed spec as the pattern later specs copy

### Phase 2: Core loop E2E — risks #2 and #4

#### Automated

- [ ] 2.1 `core-loop.spec.ts` is green under the DB lock
- [ ] 2.2 Deliberate break of the oracle interval turns it red, then green again
- [ ] 2.3 `npm run lint` and `npx astro check` pass
- [ ] 2.4 No production module imported from `tests/e2e`

#### Manual

- [ ] 2.5 Assertions target visible text or row attributes, not CSS classes or bare URLs

### Phase 3: Two-user isolation — risk #1 at browser level

#### Automated

- [ ] 3.1 `isolation.spec.ts` is green under the DB lock
- [ ] 3.2 Deliberate break (B's checks in A's session) turns it red, then green again
- [ ] 3.3 Full suite `npm run test:e2e` is green under the DB lock
- [ ] 3.4 `npm run lint` and `npx astro check` pass

#### Manual

- [ ] 3.5 B's fixture is eligible for A's exams

### Phase 4: CI wiring and docs

#### Automated

- [ ] 4.1 Workflow YAML is valid
- [ ] 4.2 Prettier check passes on the edited docs
- [ ] 4.3 PR `smoke` job runs the e2e step and it passes

#### Manual

- [ ] 4.4 PR description records the minutes e2e adds to `smoke`
- [ ] 4.5 Report artifact uploads on a failing run
