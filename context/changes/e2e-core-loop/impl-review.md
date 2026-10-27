<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Browser E2E for the Core Loop

- **Plan**: `context/changes/e2e-core-loop/plan.md`
- **Scope**: Full plan (Phases 1–3 complete; Phase 4 reviewed except rows 4.3–4.5, which are left open on purpose until the PR's CI `smoke` run)
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-27
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Evidence

Verification ran inline, without sub-agents: 21 changed files, 7 of them code or config.

- **Product-side break reverted**: `git diff origin/main -- src/ supabase/` is empty, and `git log origin/main..HEAD -- src supabase catalog` lists no commits. The worktree is clean. `decisions.md` records the break (`interval.months - 12` → red on "Następne badanie", 2027 vs 2028), its revert and a green cold rerun.
- **No production imports**: the imports in `tests/e2e/**` are `@playwright/test`, `node:fs`, `node:path` and `./support/*`. The oracle reads `catalog/entries/*.json` and does the month arithmetic itself (`support/core-loop.ts:83-87`). I planted throwaway spec files to test the ESLint ban (`eslint.config.js:115-131`). It rejects `@/lib/screenings/rules`, `@/lib/catalog/recommend`, `../../src/lib/screenings/rules` and `astro:env/server` (1 hit each), and the files were removed afterwards.
- **Local-only guard** (`tests/e2e/support/local-only.ts`), via `npx playwright test --list`:
  - `BASE_URL=https://example.com` → refused, exit 1.
  - `http://127.0.0.1.evil.test:4331` → refused, because the parsed hostname is compared.
  - `BASE_URL=http://127.0.0.1:4321` with `DBAM_CHANGE` set → refused.
  - `SUPABASE_URL=https://abc.supabase.co` in the environment → refused.
  - A local `BASE_URL` → 3 tests listed.
  - A missing `SUPABASE_URL` is refused by code inspection (`:52-56`). I didn't run it, because that would mean moving `.env`/`.dev.vars`.
  - The fallback port 4321 in a worker session is also refused, because the check runs on the resolved `baseURL`.
- **`ci.yml`** matches the revised plan:
  - The e2e steps sit after "Exercise scheduled handler (dry run)" and before `supabase stop`.
  - A step with `id: pw` reads the version, and the `actions/cache@v4` key is `ms-playwright-${{ runner.os }}-<version>`.
  - On a cache miss it runs `install --with-deps --only-shell chromium`; on a hit, `install-deps chromium`.
  - The step `id: e2e` runs `BASE_URL=http://localhost:4321 npm run test:e2e`.
  - `upload-artifact@v4` runs with `if: failure() && steps.e2e.outcome == 'failure'` and `retention-days: 7`.
  - A failing `playwright test` exits non-zero, which fails `smoke`.
- **Automated rows rerun here**:
  - `npm run lint` passed (exit 0).
  - `npm test` passed: 14 files, 238 tests, no e2e spec collected.
  - `npx astro check` reported 0 errors.
  - The workflow YAML parses.
  - The Prettier check on the four docs passed.
  - The full `npm run test:e2e` run from a cold server on `$DBAM_PORT` under the DB lock passed (3 tests, 42 s). Afterwards the lock was released and the port was free.
- **Not run here**: the deliberate breaks (2.2, 3.2), which rely on `decisions.md`, and rows 4.3–4.5, which are open on purpose.

## Findings

### F1 — CI comment says both checks always report, but e2e is skipped when the cron check fails

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `.github/workflows/ci.yml:89-91` (also plan Phase 4 §1, "both checks always report")
- **Detail**: The new steps have the default `if: success()`. When "Exercise scheduled handler (dry run)" exits 1, the e2e steps are skipped, so a PR that breaks both shows only the cron failure. The other direction does work: an e2e failure no longer hides the cron check. The order is the one the plan chose (plan-review F3). Only the claim is too strong.
- **Fix**: Change the comment (and the plan sentence) to "it runs after the cron check so that check sees no e2e users". Alternatively, give the e2e steps `if: ${{ !cancelled() }}` together with a condition that the preview is up, if both results matter on one run.
- **Decision**: PENDING

### F2 — User A sits exactly on colonoscopy's lower age bound, with the year taken from different clocks

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `tests/e2e/support/core-loop.ts:55-57`; `tests/e2e/isolation.spec.ts:25,39`
- **Detail**: `eligibleBirthYear(0)` takes the year from Warsaw's calendar, which makes A exactly 50. The server computes age as `now.getFullYear() - birth_year` (`src/pages/dashboard.astro:53`, `src/lib/catalog/recommend.ts:112`), using the runtime clock: UTC in workerd. Colonoscopy's `age_min` is 50. In the first hour of January 1 in Warsaw (still December 31 UTC), the server sees A as 49. Colonoscopy then drops out of A's tiers, and `planExam(pageA, COLONOSCOPY, null)` fails. Mammography (45–74) and user B (55) are unaffected. The window is about one hour a year.
- **Fix**: Make A 51 and B 56, either with `eligibleBirthYear(1)`/`(6)` in the isolation spec or with a base of 51 in the helper. That keeps both exams eligible, away from any bound.
- **Decision**: PENDING

### F3 — Isolation's deliberate break went red on the eligibility precondition, not on the isolation assertions

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: plan criterion 3.2; `decisions.md` ("Phase 3 break: … red (B's tier rows missing in A's session)")
- **Detail**: Criterion 3.2 expects the break to "fail on the plans/done checks". The recorded failure came from the first assertion: in A's session mammography is a done row, not a tier row. So the assertions that carry risk #1 never went red: "Twoje plany" is empty, there is no "Wykonane" region, there is no "Ostatnio wykonane" text, and the profile year is B's. They would fail in A's session too, but that isn't shown.
- **Fix**: Rerun the break with the two tier-row preconditions skipped (only in the temporary copy), and record which isolation assertion fails first. Alternatively, reword 3.2 to say the break proved the precondition only.
- **Decision**: PENDING

### F4 — Progress rows carry no commit SHAs

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `context/changes/e2e-core-loop/plan.md` `## Progress`
- **Detail**: The Progress convention says to append ` — <commit sha>` when a step lands. None of the 18 checked rows has one, even though each phase landed in its own commit (`7735a1e`, `0df4623`, `d70435b`, `7f05515`). `change.md` still says `status: plan_reviewed`; this review stamps it `impl_reviewed`.
- **Fix**: Add the phase SHAs to the checked rows. Ship the edit in the next commit (the archive or PR-stage commit), not in a commit of its own.
- **Decision**: PENDING
