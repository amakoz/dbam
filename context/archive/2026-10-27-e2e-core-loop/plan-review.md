<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Browser E2E for the Core Loop

- **Plan**: `context/changes/e2e-core-loop/plan.md`
- **Mode**: Deep (claims verified inline, no sub-agent)
- **Date**: 2026-10-27
- **Verdict**: REVISE
- **Findings**: 0 critical, 4 warnings, 3 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

8/8 paths ✓ (`package.json`, `.github/workflows/ci.yml`, `.gitignore`, `catalog/entries/mammography-nfz-program.json`, `scripts/ui-shots.mjs`, `src/components/recommendations/DoneItem.astro`, `.claude/skills/10x-e2e-setup/references/test-stack-e2e-schema.md`, `node_modules/yaml`). 7/7 symbols ✓: mammography `fixed`/24/no overrides/female 45–74, `sign_in_sign_ups = 30` (`supabase/config.toml:190`), confirm stores `last_done_on` + month (`confirm_screening_plan.sql:64-67`), `data-next-due = nextDue.slice(0, 7)` (`DoneItem.astro:35`), `ASTRO_PREVIEW_BACKGROUND` in the setup template, vitest `include: ["src/**/*.test.ts"]`, tsconfig `include: ["**/*"]` (so `astro check` and type-checked lint do cover `tests/e2e`). UI strings ✓ in `src/i18n/pl.ts`. Undated plans are accepted (`parsePlanForm`, `rules.ts:127-128`). Brief↔plan ✓. Progress↔Phase ✓ (4 phases, 6/5/5/5 rows, no checkboxes in phase bodies).

The asked-for focus areas: CI wiring is covered by F3, F5 and F6 (a failing e2e does fail `smoke`: the step's non-zero exit fails the job, and with `retries: 1` only a fail-then-pass stays green). The non-local guard is covered by F4. Oracle independence is covered by F1.

## Findings

### F1 — Oracle-independence gate is a grep that misses the `@/` alias

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details → Oracle independence; Phase 2 success criterion 2.4
- **Detail**: The only check that the specs never import production date helpers is `grep -rn "src/lib" tests/e2e`. The repo resolves `@/*` to `./src/*` (`tsconfig.json` `paths`), and Playwright Test honours tsconfig `paths`, so `import { warsawToday, addMonths } from "@/lib/screenings/rules"` compiles, runs and passes the grep. `warsawToday` and `addMonths` are exactly the helpers the support module re-implements (`src/lib/screenings/rules.ts:55,87`), so this is the likely slip. The plan itself labels the grep a heuristic, and `context/foundation/lessons.md` ("Grep gates are heuristics") says a heuristic must not be the gate. No other gate exists, and it would only run once, in Phase 2, not on later edits.
- **Fix**: Add an ESLint block in `eslint.config.js` for `files: ["tests/e2e/**", "playwright.config.ts"]` with `no-restricted-imports` patterns `@/*`, `**/src/**` and `astro:*` (message: "e2e specs must not import production code; the oracle reads catalog JSON"). `npm run lint` in the `ci` job then enforces it on every PR. Keep the grep as a heuristic widened to `grep -rnE "from ['\"](@/|[./]*src/)" tests/e2e`, and make criterion 2.4 "lint rule rejects a planted `@/lib/screenings/rules` import, then passes".
- **Decision**: ACCEPTED — ESLint `no-restricted-imports` block for `tests/e2e/**` and `playwright.config.ts` (`@/*`, `**/src/**`, `astro:*`); widened grep kept as a heuristic (orchestrator)

### F2 — Deliberate breaks mutate the test, not the product

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 2 criterion 2.2; Phase 3 criterion 3.2; Desired End State ("each risk spec has gone red under a deliberate break")
- **Detail**: Phase 2 breaks the oracle's own input (24 → 12), and Phase 3 runs B's assertions in A's context. Both show the assertion is live, but neither shows the spec catches the regression it guards: a wrong next due date produced by the app (risk #4) or a cross-user leak (risk #1). A spec that asserted `data-next-due` against a value derived the same wrong way would still pass 2.2. A second trap: the config sets `reuseExistingServer: !process.env.CI`, so a product-side break checked against a preview that is still running from before the edit tests the stale build and stays green.
- **Fix A ⭐ Recommended**: Make 2.2 a product-side break: change `nextDueMonth` (`src/lib/screenings/rules.ts:184`, e.g. `interval.months - 12`), run from a cold server (nothing on the port, so `webServer` rebuilds), and expect red on `data-next-due` and "Następne badanie"; then revert and re-run green. Keep 3.2 test-side, but say in the plan why: a product-side isolation break needs an RLS migration, which is out of scope, and pgTAP already covers RLS.
  - Strength: Proves the risk #4 spec would catch the regression it is there for, not just that its oracle is wired.
  - Tradeoff: One extra build per break run (~1 min locally).
  - Confidence: HIGH — `nextDueMonth` is the single computation behind both `data-next-due` and the "Następne badanie" text (`rules.ts:275`, `DoneItem.astro:35,50`).
  - Blind spot: None significant.
- **Fix B**: Keep both breaks test-side and reword the Desired End State to "each risk spec's assertions are shown to be live".
  - Strength: No rebuild and no product edit to revert.
  - Tradeoff: The suite's ability to catch a real risk #4 regression stays unproven.
  - Confidence: MED — honest wording, weaker evidence.
  - Blind spot: Test-plan rollout may expect product-side breaks.
- **Decision**: ACCEPTED Fix A — product-side break of `nextDueMonth` from a cold server, reverted and never committed; 3.2 stays test-side with the RLS-migration reason stated (orchestrator)

### F3 — e2e steps placed before the scheduled-handler step

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 4 §1 (`smoke` job steps)
- **Detail**: The plan inserts the e2e steps right after "Run smoke test against production preview" and leaves "Exercise scheduled handler (dry run)" after them (`.github/workflows/ci.yml:64-84`). That step has the default `if: success()`, so any e2e failure, flaky or real, skips the cron check, and a PR that breaks both shows only the e2e failure. It also changes the cron run's input: the handler calls the real reminder and nudge jobs against local Supabase at a pinned 2026-10-01 time, and would now see e2e users holding today-dated confirmed records and an undated plan (isolation user A), which the follow-up nudges (S-07) read.
- **Fix**: Insert the e2e steps after "Exercise scheduled handler (dry run)" and before `supabase stop`. The preview and Supabase are still up there, the handler keeps its current inputs, and both checks always report.
- **Decision**: ACCEPTED — e2e steps after "Exercise scheduled handler (dry run)", before `supabase stop` (orchestrator)

### F4 — Local-only guard drops the worker-session port-4321 refusal

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Critical Implementation Details → Local-only guard; Phase 1 §2 and criterion 1.4
- **Detail**: The plan says the guard mirrors `scripts/ui-shots.mjs:70-110`, but it only lists the host checks. `ui-shots.mjs:62-64` also refuses port 4321 when `DBAM_CHANGE` is set, the rule CLAUDE.md and the worker protocol state ("never use 4321"). Under this plan, `BASE_URL=http://127.0.0.1:4321 npm run test:e2e` in a worker session runs against the human's dev server, and the `PORT` fallback reaches 4321 whenever `E2E_PORT`/`DBAM_PORT` are unset. The contract also doesn't say to compare `new URL(...).hostname` (not a string prefix) or to refuse when no `SUPABASE_URL` is found anywhere, both of which `ui-shots` does (`:56-61`, `:91-95`). Criterion 1.4 covers only the two host cases.
- **Fix**: State in the guard contract: hostname via `new URL()` against `["localhost", "127.0.0.1"]`; refuse when no `SUPABASE_URL` is found; refuse port 4321 when `DBAM_CHANGE` is set, applied to the resolved `baseURL` (from `BASE_URL` or the fallback). Extend 1.4 with the 4321-in-worker case. CI is unaffected (`DBAM_CHANGE` unset, `BASE_URL=http://localhost:4321`, `.env`/`.dev.vars` hold the local `API_URL`).
- **Decision**: ACCEPTED — `new URL()` hostname in [localhost, 127.0.0.1], refuse a missing `SUPABASE_URL`, refuse port 4321 on the resolved baseURL when `DBAM_CHANGE` is set; 1.4 extended (orchestrator)

### F5 — Browser-cache key and install cost left vague

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 §1; Performance Considerations
- **Detail**: "Keyed on the installed `@playwright/test` version (from `package-lock.json`)" doesn't say how the key is built. `hashFiles('package-lock.json')` would invalidate the cache on every dependency bump, which defeats the version key. `--with-deps` runs `apt-get` on every run, cache hit or not, which is usually the larger part of the added minutes that the ~4 min split threshold depends on. Action versions aren't pinned either (the workflow uses `@v4` elsewhere).
- **Fix**: Spell out a step `id: pw` that runs `echo "version=$(node -p "require('@playwright/test/package.json').version")" >> "$GITHUB_OUTPUT"`, then use `actions/cache@v4` with key `ms-playwright-${{ runner.os }}-${{ steps.pw.outputs.version }}`. Run `npx playwright install --with-deps --only-shell chromium` on a miss and `npx playwright install-deps chromium` on a hit. Use `actions/upload-artifact@v4`. Report the install and test times separately in the PR (criterion 4.4).
- **Decision**: ACCEPTED — version via step output, `actions/cache@v4`, `--with-deps --only-shell chromium` on miss / `install-deps chromium` on hit, `actions/upload-artifact@v4`; PR reports install and test minutes (orchestrator)

### F6 — Failure-artifact condition is too broad and misses flaky runs

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 4 §1 (`upload-artifact` with `if: failure()`); Phase 1 §2 (`retries`, `trace`)
- **Detail**: `if: failure()` also fires when pgTAP, build or smoke fail before e2e runs, which uploads nothing and adds a "no files found" warning. With `retries: 1`, a test that fails once and passes on retry leaves the job green and uploads nothing, so the first attempt's screenshot is lost. `trace: "on-first-retry"` records the passing retry, not the failure. Locally (`retries: 0`) no trace is ever recorded.
- **Fix**: Give the e2e step `id: e2e` and upload with `if: failure() && steps.e2e.outcome == 'failure'`, `retention-days: 7`. Consider `trace: "retain-on-failure"` in place of `on-first-retry`, so the failing attempt keeps its trace both in CI and locally. Note in §6.3 that Playwright's "flaky" lines in the log are the signal for a fail-then-pass.
- **Decision**: ACCEPTED — upload only when `steps.e2e.outcome == failure`, `retention-days: 7`, `trace: retain-on-failure` (orchestrator)

### F7 — Isolation spec leaves the second exam unnamed

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §1 (A's second exam)
- **Detail**: "Pick a fixed-interval tier entry eligible for the fixture" leaves the choice to the implementer, and the eligibility check (3.5) is manual only. A fixed interval doesn't matter for an undated plan. What matters is that the exam is a tier row for both A (age 50) and B (age 55).
- **Fix**: Name `colonoscopy-nfz-program` (age 50–65 with no other requirement, `fixed`/120, no overrides): it is eligible for both fixtures. Have the spec assert that B sees it as a tier row, which makes 3.5 automatic.
- **Decision**: ACCEPTED — `colonoscopy-nfz-program` as A’s second exam; spec asserts B sees it as a tier row, 3.5 now automated (orchestrator)
