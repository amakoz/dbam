# Decisions — e2e-core-loop

## 2026-10-27 Research without sub-agents

- **Question:** Dispatch research sub-agents?
- **Options:** (a) up to 2 sub-agents; (b) none.
- **Choice:** (b) none. The change touches at most 3 areas (new e2e folder + config, `package.json`, `.github/workflows/ci.yml`), the orchestrator's rule for 3 modules or fewer.
- **Evidence:** orchestrator prompt; scope listed in `research.md` § Research Question.
- **Decided by:** worker

## 2026-10-27 Oracle fixture exam

- **Question:** Which catalog entry to plan and confirm in the e2e run?
- **Options:** (a) `mammography-nfz-program`; (b) another tier-1 fixed-interval entry.
- **Choice:** (a), recommended to the plan. It is tier 1 for the existing smoke fixture (female, 1970), `interval_kind: fixed`, `interval_months: 24` and has no overrides, so the oracle needs no override logic. User B must also be eligible for it, so its absence on B's page proves isolation, not eligibility.
- **Evidence:** `catalog/entries/mammography-nfz-program.json`; `scripts/smoke.mjs:154-167`; `src/lib/catalog/recommend.ts:86-100`.
- **Decided by:** worker (recommendation; final choice in `/10x-plan`)

## 2026-10-27 Planning: complexity, questions, phases

- **Question:** Complexity, question budget and phase split for `/10x-plan`.
- **Options:** delegated to the worker by the orchestrator.
- **Choice:** MEDIUM; 0 questions (settled-input exception: the orchestrator's answers plus research resolve every solution decision); 4 phases — (1) `/10x-e2e-setup` setup + seed, (2) `/10x-e2e` core loop #2 + #4, (3) `/10x-e2e` isolation #1, (4) CI wiring + docs.
- **Evidence:** orchestrator prompt; `research.md` Open Questions 1–4.
- **Decided by:** worker (delegated)

## 2026-10-27 CI placement

- **Question:** Separate job or steps in `smoke`? (research Open Question 1)
- **Options:** (a) steps in `smoke` after the smoke step, reusing Supabase and the preview on 4321; (b) a separate job.
- **Choice:** (a). Bound the time: Chromium shell only, `~/.cache/ms-playwright` cache keyed on the Playwright version, `workers: 1`, retries 0 locally / 1 in CI, report + traces uploaded only on failure, measured added minutes recorded in the PR; > ~4 min → follow-up to split into its own required job.
- **Evidence:** only `ci` + `smoke` gate `main` (a separate job needs a branch-protection change, an owner setting); `.github/workflows/ci.yml:28-86`.
- **Decided by:** orchestrator

## 2026-10-27 Web server

- **Question:** Who starts the app? (research Open Question 2)
- **Choice:** `BASE_URL` when set (CI, or a server already running); else `webServer` runs build + `astro preview` on `$DBAM_PORT` (4321 only when unset), `reuseExistingServer`. The config refuses a non-local `BASE_URL`, mirroring `scripts/smoke.mjs:8-14`. `E2E_PORT` is kept as a first-precedence override, per `/10x-e2e-setup`'s schema.
- **Decided by:** orchestrator (`E2E_PORT` precedence: worker)

## 2026-10-27 Selectors and redirect chain

- **Question:** Confirm `<summary>`/label locators and the signup → onboarding chain now? (research Open Question 3)
- **Choice:** Confirm during implementation (seed run, `npx -y @playwright/cli`). Role/label locators first; a minimal `data-testid` only where no accessible locator exists.
- **Decided by:** orchestrator

## 2026-10-27 Plan step coverage

- **Question:** Plan for today only, or plan a future date then reschedule? (research Open Question 4)
- **Choice:** Plan for today, then confirm. Rescheduling via "Zmień termin" is a follow-up note (test-plan §6.6).
- **Decided by:** orchestrator

## 2026-10-27 Fixed choices from the orchestrator

- **Choice:** `@playwright/test` pinned to 1.63.0 (same as `playwright`); unique `e2e-<random>@example.com` per test; female birth year computed from the current year so mammography (45–74) is always eligible; the oracle reads `catalog/entries/mammography-nfz-program.json`, asserts `interval_kind = fixed` and no overrides, and computes the month by hand (never imports `src/lib/screenings`); risk #1 uses two browser contexts; every local e2e run takes the DB lock; no agent wiring under `.claude/` except `.claude/settings.json`.
- **Decided by:** orchestrator

## 2026-10-27 No auth setup project or storageState

- **Question:** `/10x-e2e-setup` defaults to a setup project signing in a stored test user (`E2E_USERNAME`/`E2E_PASSWORD`) and saving `storageState`. Keep it?
- **Options:** (a) keep it; (b) `auth setup project: none`, each test signs up a fresh user through the UI.
- **Choice:** (b). Sign-up is the first step of risk #2, per-test unique emails were fixed by the orchestrator, and a stored session would skip exactly the chain the seed proves. No credentials to keep in an env file.
- **Decided by:** worker

## 2026-10-27 Supabase URL guard

- **Question:** Guard only `BASE_URL`, or also `SUPABASE_URL`?
- **Choice:** Both, at config load. `SUPABASE_URL` is read from the environment and the repo-root `.dev.vars*`/`.env*` files (excluding `.env.example`), like `scripts/ui-shots.mjs:70-110`, because a local preview built on production secrets would sign up real users even with a local `BASE_URL`.
- **Decided by:** worker

## 2026-10-27 Skip playwright-cli agent wiring

- **Question:** `/10x-e2e-setup` step 5 installs a `playwright-cli` command skill into the agent's skill dir.
- **Choice:** Skip it; use `npx -y @playwright/cli` or the Playwright MCP ad hoc. Record `browser CLI: npx -y @playwright/cli (no agent wiring)` in `test-stack.md`.
- **Evidence:** orchestrator rule (only `.claude/settings.json` is tracked under `.claude/`); `.gitignore` `.claude/*`.
- **Decided by:** worker (from the orchestrator's rule)

## 2026-10-27 Isolation fixture and oracle strings

- **Choice:** A ends with mammography confirmed (done) plus a second eligible exam planned without a date, so B's page is checked against both a done record and a plan. B is female, born 5 years before A (current year − 55), eligible for both exams. Expected Polish strings come from the test's own `Intl.DateTimeFormat("pl")`, and `data-next-due`/`data-last-done-on` are asserted as the exact-value check (server ICU in workerd vs test ICU in Node).
- **Decided by:** worker

## 2026-10-27 Roadmap flip skipped

- **Choice:** `/10x-plan` asks to flip S-08 to `planning`; skipped per the worker protocol (`/10x-archive` sets `done`).
- **Decided by:** orchestrator rule

## 2026-10-27 Plan-review triage (F1–F7)

- **Question:** How to resolve `plan-review.md` findings F1–F7 (REVISE, 4 warnings, 3 observations)?
- **Choice:** All accepted.
  - F1: ESLint `no-restricted-imports` block for `tests/e2e/**` and `playwright.config.ts` (patterns `@/*`, `**/src/**`, `astro:*`); the widened grep is a heuristic only.
  - F2: Fix A — Phase 2's deliberate break is product-side (`nextDueMonth` in `src/lib/screenings/rules.ts`, cold server so `webServer` rebuilds, never committed). 3.2 stays test-side because a product-side isolation break needs an RLS migration.
  - F3: e2e steps run after "Exercise scheduled handler (dry run)" and before `supabase stop`.
  - F4: guard uses the `new URL()` hostname against `[localhost, 127.0.0.1]`, refuses a missing `SUPABASE_URL`, and refuses port 4321 on the resolved baseURL when `DBAM_CHANGE` is set; criterion 1.4 extended.
  - F5: cache key from the `@playwright/test` version via a step output; `actions/cache@v4`; `install --with-deps --only-shell chromium` on a miss, `install-deps chromium` on a hit; `actions/upload-artifact@v4`; PR reports install and test minutes.
  - F6: upload only when `steps.e2e.outcome == 'failure'`, `retention-days: 7`; `trace: retain-on-failure`.
  - F7: `colonoscopy-nfz-program` is A's second exam; the spec asserts B sees it as a tier row, so 3.5 became an automated row.
- **Note:** Progress rows 1.4, 2.2, 2.4, 3.5 and 4.4 were retitled and 3.5 moved to Automated before any execution (no row was checked), so the immutable-title rule is not broken in substance.
- **Evidence:** `context/changes/e2e-core-loop/plan-review.md`.
- **Decided by:** orchestrator

## 2026-10-27 Implementation notes

- **Seed stays self-contained:** `seed.spec.ts` keeps its own sign-up steps as the readable exemplar, while `support/core-loop.ts` holds the same steps for the risk specs. Decided by: worker.
- **Phase 2 break:** `nextDueMonth` changed to `interval.months - 12` turned `core-loop.spec.ts` red on "Następne badanie" (got `październik 2027`, expected `październik 2028`) from a cold server; reverted with `git checkout`, rebuilt cold run green. Never committed. Decided by: worker (plan F2).
- **Phase 3 break:** B's assertions run in A's session turned `isolation.spec.ts` red (B's tier rows missing in A's session); temporary spec file deleted. Decided by: worker (plan F2).
- **CI-shaped local run:** `CI=1 BASE_URL=http://127.0.0.1:$DBAM_PORT npm run test:e2e` against a hand-started preview passed 3/3, which covers the `BASE_URL` (no `webServer`) path the `smoke` job uses. Decided by: worker.
- **Not done here:** the PR was not opened, so 4.3 (the `smoke` job runs e2e), 4.4 (measured minutes) and 4.5 (report artifact upload) stay open for the PR stage. Decided by: worker.

## 2026-10-27 Impl-review triage (F1–F4)

- **Choice:** All accepted by the orchestrator.
  - F1: ci.yml comment and plan sentence reworded to "runs after the cron check so that check sees no e2e users"; the default `if` is kept, so a failing cron check skips the e2e steps.
  - F2: `eligibleBirthYear` base 50 → 51, so A is 51 and B 56 (off colonoscopy's `age_min` 50 and the UTC/Warsaw new-year edge).
  - F3: the isolation break rerun in a temporary copy with the two tier-row preconditions skipped failed first on `Twoje plany` showing "Nic jeszcze nie zaplanowano." (A's session holds the colonoscopy plan). Copy discarded.
  - F4: phase SHAs `2863eea`, `f288176`, `d3ba639`, `c41d477` added to the checked Progress rows, shipped in the review-fix commit (the archive skill needs a clean change folder first).
- **Also:** Playwright `timeout` raised to 60 s. The first F3 rerun hit the 30 s default on a loaded machine (the isolation spec took ~20 s) before reaching any assertion. Decided by: worker.
- **Evidence:** `context/changes/e2e-core-loop/impl-review.md`.
- **Decided by:** orchestrator (F1–F4)
- **Rebase:** the branch was rebased onto `origin/main` (never pushed), so the phase SHAs in Progress, this log and the review were remapped: 7735a1e→2863eea, 0df4623→f288176, d70435b→d3ba639, 7f05515→c41d477. Decided by: worker (orchestrator: rebase if never pushed).

## 2026-10-27 Archive with PR-stage rows open, and the F-10 roadmap flip

- **Question:** `/10x-archive` warns that rows 4.3 (`smoke` job runs e2e), 4.4 (measured minutes) and 4.5 (report artifact) are pending and that the phase SHAs are not in `origin/main` yet.
- **Choice:** Continue archiving. The PR's first `smoke` run covers 4.3–4.5 and its description lists them under "Manual checks for the human"; the SHAs reach `main` when the PR merges.
- **Also:** F-10 (test-plan) is set to `done` in `roadmap.md` in the archive commit: its PR #89 merged on 2026-10-27 without the flip.
- **Decided by:** orchestrator
