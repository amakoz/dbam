# Unit Test Suite (F-03) Implementation Plan

## Overview

Add Vitest as the project's unit-test runner and run it in CI's `ci` job. The first suite covers the catalog eligibility, tier and interval rules in `src/lib/catalog/recommend.ts` and their user-facing wording in `src/lib/catalog/wording.ts`, including the seven cases S-02 deferred to this change. This delivers roadmap F-03 (#49) and the PRD's testing NFR (`context/foundation/prd.md:142`).

## Current State Analysis

- There is no unit runner:
  - no `test` script (`package.json:5-23`);
  - no `*.test.*`/`*.spec.*` files outside `node_modules`;
  - no vitest installed.
- The only automated tests are pgTAP (`supabase/tests/database/*.test.sql`) and the HTTP smoke (`scripts/smoke.mjs`), both in CI's `smoke` job.
- Both target modules are pure:
  - The runtime import graph is recommend → factors → profile, and wording → profile. Every other import is `import type` (`recommend.ts:1-4`, `wording.ts:1-5`, `factors.ts:1`).
  - Neither loads `astro:*`, `cloudflare:*` or Supabase.
  - `recommend()` takes `currentYear` (`recommend.ts:103-108`).
  - `createT(locale)` builds in plain Node (`src/i18n/index.ts:40-53`).
- The `@/*` alias exists only in `tsconfig.json:8-10`; `astro.config.mjs` has no `resolve.alias`.
- Installed: vite 8.3.0, which has a native `resolve.tsconfigPaths` option (`node_modules/vite/dist/node/index.d.ts:2723`). Vitest 5.0.3 lists peer `vite ^6.4.0 || ^7.0.0 || ^8.0.0` and engines `node ^22.12.0 || ^24.0.0 || >=26.0.0`, which match the installed vite and CI's Node 22 (`.github/workflows/ci.yml:21-24`).
- `tsconfig.json:3` includes `**/*`, and the type-checked ESLint config has no `files` filter (`eslint.config.js:16-40`). So new `src/**/*.test.ts` files and a root `vitest.config.ts` are already type-checked and type-linted.
- `CLAUDE.md:52` ("No unit suite is configured yet") and `README.md:296` ("no unit suite is configured yet") are stale once this lands. The same goes for `README.md:302` (the `ci` job's step list) and the PRD's "until then …" clause (`prd.md:142`).

## Desired End State

- `npm test` runs `vitest run` over `src/**/*.test.ts` and passes locally on Node 22.
- CI's `ci` job runs `npm test` on every PR and push to `main`. A broken eligibility, tier, interval or wording rule fails the PR.
- `src/lib/catalog/recommend.test.ts` covers the seven S-02 cases plus:
  - `lte` and null on `years_since_quitting`;
  - the launch gate;
  - `maybe`/`missing`;
  - the first matching branch;
  - non-fixed interval kinds;
  - the computed age.
- `src/lib/catalog/wording.test.ts` pins the full pl and en strings for all four `describe*` functions.
- `CLAUDE.md`, `README.md` and the PRD describe the suite instead of its absence.

Verify with `npm test`, `npm run lint`, `npx astro check`, and the green `ci` job on the PR.

### Key Discoveries:

- S-02's first cases: `context/archive/2026-09-28-screening-recommendations/plan.md:409-416`. Each maps to a line in `recommend.ts`; see the table in `research.md`.
- The schema rejects an active entry with a null reviewer (`src/lib/catalog/schema.ts:193-200`), and its `accessed` check reads the clock. Fixtures are therefore typed factories, not parsed.
- `Profile` has 13 required columns, with `sex` and `smoking_status` typed as `string` (`src/lib/profile.ts:29`). A factory with overrides keeps tests short.
- Wording outputs were probed on Node 22.16.0 with the real `createT`; the expected strings below are those outputs.
- Polish collation differs from code-point order: `Intl.Collator("pl")` sorts `Szafa < Śruba < Zebra`, while a naive sort puts `Śruba` last. That makes it a real test of the collator tie-break.

## What We're NOT Doing

- **Recurrence logic in `src/lib/screenings/rules.ts`** (`nextDueMonth`, `addMonths`/`addYears`, `partitionDashboard`, Warsaw-midnight and Feb 29 cases in `context/archive/2026-09-30-record-appointment-date/plan.md:430-439`) and `src/lib/screenings/format.ts` (`describeLastDone`). These are deferred to a follow-up change that reuses this runner. The F-03 outcome names only `recommend.ts` and `wording.ts` (`roadmap.md:119`).
- **Other pure modules:** `password.ts`, `parseProfileForm`/`packYears`, `errors.ts`, `auth-errors.ts`, `scripts/catalog/*`. Each has candidate cases in archived plans; they are not part of F-03.
- **Coverage, pre-commit and test tooling:** no coverage provider or threshold, no `coverage/` output, no Vitest run in the husky pre-commit hook, no watch-mode workflow docs.
- **Real catalog data:** no tests over `catalog/entries/*.json` or `loadEntries()`. `npm run catalog:check` already validates them in CI.
- **Astro integration:** no `getViteConfig`, no DOM or React component tests, no `jsdom`/`happy-dom` environment.
- **Behaviour changes:** no change to `recommend.ts` or `wording.ts`. If a test exposes a bug, record it and stop for a decision rather than fixing it in this change.

## Implementation Approach

Phase 1 installs the runner and proves it end to end on the rule engine: config, script, CI step and `recommend.test.ts`. Phase 2 adds the wording tests and updates the docs. Tests import `describe`/`it`/`expect` explicitly from `"vitest"` (no globals, so no `vitest/globals` types) and use `import type` for types (`verbatimModuleSyntax`). Fixtures come from two small factories (`profile()`, `entry()`) defined in each test file, with minimal valid defaults and per-test overrides. They are typed as `Profile` and `CatalogEntry`, so the type checker still guards their shape.

## Critical Implementation Details

- **Alias fallback.** If `resolve.tsconfigPaths: true` does not resolve `@/*` under Vitest 5 (unexercised; see research Open Question 7), replace it with an explicit `resolve.alias` mapping `@` to `<repo>/src`, e.g. via `fileURLToPath(new URL("./src", import.meta.url))`. Do not add `vite-tsconfig-paths`.
- **Strict lint in tests.** `strictTypeChecked` forbids `!` non-null assertions. Read results through checks that narrow, e.g. `expect(tiers[1]).toHaveLength(1)` and then destructure, or `toMatchObject`/`toEqual` on whole arrays. Don't disable rules per file.

## Phase 1: Vitest runner, CI step and rule-engine tests

### Overview

Install Vitest, configure it for the `@/*` alias and the colocated test glob, add `npm test`, run it in CI's `ci` job, and cover `recommend.ts`.

### Changes Required:

#### 1. Dependency and script

**File**: `package.json`, `package-lock.json`

**Intent**: Add Vitest as a dev dependency and expose a single non-watch test command for local and CI use.

**Contract**:

- `devDependencies.vitest` at `^5.0.3`, installed with `npm install -D vitest@^5.0.3` so the lockfile updates.
- `scripts.test = "vitest run"`.

#### 2. Vitest config

**File**: `vitest.config.ts` (new, repo root)

**Intent**: Resolve `@/*` like the TS project does, and limit discovery to colocated unit tests so Vitest never scans `dist/`, `.astro/` or `node_modules`.

**Contract**:

- `defineConfig` from `vitest/config`.
- `resolve.tsconfigPaths: true`, with the alias fallback above if needed.
- `test.include: ["src/**/*.test.ts"]`.
- `test.environment: "node"`.
- No Astro, Tailwind or Cloudflare plugins.

#### 3. CI step

**File**: `.github/workflows/ci.yml`

**Intent**: Fail a PR whose rule or wording change breaks a unit test, early and without a database.

**Contract**: Add `- run: npm test` to the `ci` job immediately after `- run: npm run ui:check` (`ci.yml:29`) and before `npx astro check`. The `smoke`, `migrate` and `deploy` jobs are unchanged.

#### 4. Rule-engine tests

**File**: `src/lib/catalog/recommend.test.ts` (new)

**Intent**: Pin the eligibility, tier and interval semantics documented in `src/lib/catalog/factors.ts:6-17`, starting with the S-02 cases. All cases use `currentYear = 2026`.

**Contract**: One `describe` block per exported function: `evaluateBranch`, `resolveInterval`, `recommend`. Required cases:

- **Inclusive age bounds** (`evaluateBranch`; branch `age_min: 50, age_max: 69`):
  - birth_year 1976 (age 50) → `"match"`;
  - 1977 (49) → `"no"`;
  - 1957 (69) → `"match"`;
  - 1956 (70) → `"no"`;
  - a branch without `age_max` at age 100 → `"match"`.
- **Null `pack_years` is false** (branch requires `pack_years gte 20`):
  - profile `pack_years: null` → `"no"`;
  - 20 → `"match"` (inclusive `gte`);
  - 19 → `"no"`.
- **`lte` and null** (branch requires `years_since_quitting lte 15`, the live rule in `catalog/entries/lung-ldct-nfz-program.json`):
  - 15 → `"match"` (inclusive `lte`);
  - 16 → `"no"`;
  - null → `"no"`.
- **False beats unknown:**
  - branch requires `smoking_status eq "current"` and `hypertension eq true` (uncollected):
    - profile `never` → `"no"`;
    - profile `current` → `"unknown"`;
  - a branch with `sex: "male"` on a female profile plus an uncollected condition → `"no"`.
- **`in` on `smoking_status`** (`["current","former"]`): `current` → `"match"`, `former` → `"match"`, `never` → `"no"`.
- **First matching override wins; unknown overrides are skipped** (`resolveInterval`): fixed entry, `interval_months: 60`, overrides in this order:
  1. `{when: {requires: [hiv_or_immunosuppression eq true]}, months: 12}`;
  2. `{when: {age_min: 40}, months: 24}`;
  3. `{when: {age_min: 30}, months: 36}`.

  Expected:
  - age 45 → `{kind: "months", months: 24}`;
  - age 35 → `36`;
  - age 25 → `60`, the fallback.

- **Non-fixed kinds:** `shared_decision`, `no_known_interval` and `per_program` each return `{kind}`.
- **Tier mapping** (`recommend`): entries with `evidence_level` 3, 2 and 1, all eligible, land in `tiers[1]`, `tiers[2]` and `tiers[3]`, and each `Recommendation.tier` matches its tier.
- **Sort ties**, within one tier:
  - burden_weight 5 sorts before 2 regardless of name;
  - at equal burden, `locale "pl"` orders `name_pl` `Szafa`, `Śruba`, `Zebra` (input given as `Zebra`, `Śruba`, `Szafa`);
  - `locale "en"` sorts by `name_en`, not `name_pl`. Use entries whose pl and en name orders differ.
  - The same ordering applies to `maybe`.
- **Launch gate:**
  - entries with status `draft`, status `retired`, `active` with `reviewed_by: null`, and `active` with `reviewed_by` omitted never appear in `tiers` or `maybe`;
  - an active entry with a reviewer and the same eligibility does appear.
- **`maybe` and `missing`:** one entry, female profile aged 55 who currently smokes, with three branches:
  - A: `age_min 50`, requires `family_history_crc_first_degree eq true` and `smoking_status eq "current"`;
  - B: `age_min 40, age_max 49`, requires `bmi gte 25`;
  - C: `sex male, age_min 40`, requires `hypertension eq true`.

  It lands in `maybe` (not in any tier) with `missing` equal to `[[family_history_crc_first_degree eq true]]`. Only branch A is unknown, and the collected smoking condition is excluded.

- **First matching branch:**
  - an entry with two matching branches yields `matchedBranch` equal to the first in document order;
  - an entry with one matching and one unknown branch is in a tier, not in `maybe`.
- **Age:** `recommend(...).age === currentYear − birth_year`.

### Success Criteria:

#### Automated Verification:

- Vitest is installed and the lockfile updated: `npm ls vitest` shows `vitest@5.x`
- Unit tests pass: `npm test`
- A deliberate break is caught: changing `age > branch.age_max` to `age >= branch.age_max` in `recommend.ts:73` makes `npm test` fail; revert and confirm it passes again
- Lint passes, including the test file and `vitest.config.ts`: `npm run lint`
- Type check passes and covers the test file: `npx astro check` (also confirm a deliberate type error in `recommend.test.ts` is reported, then revert)
- Build is unaffected: `npm run build`

**Implementation Note**: Phase 1 has no manual step. Once the automated checks pass, pause before Phase 2. The CI check needs an open PR, and CI runs only on PRs and pushes to `main` (`ci.yml:3-8`), so it moves to Phase 2's Manual Verification.

---

## Phase 2: Wording tests and docs

### Overview

Pin the user-facing rule wording in both locales and replace the "no unit suite" notes.

### Changes Required:

#### 1. Wording tests

**File**: `src/lib/catalog/wording.test.ts` (new)

**Intent**: Catch regressions in the phrases users read: plural forms, list joining, negation, enum labels and number formatting. Use full expected strings in pl and en, built with the real `createT(locale)`. Avoid formatted numbers of 5+ digits, which use a non-breaking space.

**Contract**: One `describe` per function, with each case asserted in both locales. Expected strings were probed on Node 22.16.0:

| Call                                                                                                   | pl                                                                                                                                    | en                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `describeCondition({factor:"pack_years",op:"gte",value:20})`                                           | `paczkolata ≥ 20`                                                                                                                     | `pack-years ≥ 20`                                                                                                                              |
| `describeCondition({factor:"bmi",op:"gte",value:25.5})`                                                | `BMI ≥ 25,5`                                                                                                                          | `BMI ≥ 25.5`                                                                                                                                   |
| `describeCondition({factor:"hypertension",op:"eq",value:true})`                                        | `lekarz rozpoznał u Ciebie nadciśnienie tętnicze`                                                                                     | `a doctor has diagnosed you with high blood pressure`                                                                                          |
| `describeCondition({factor:"hypertension",op:"eq",value:false})`                                       | `nie jest tak, że lekarz rozpoznał u Ciebie nadciśnienie tętnicze`                                                                    | `it is not the case that a doctor has diagnosed you with high blood pressure`                                                                  |
| `describeCondition({factor:"smoking_status",op:"in",value:["current","former"]})`                      | `palenie papierosów: tak, obecnie lub w przeszłości`                                                                                  | `smoking: yes, currently or in the past`                                                                                                       |
| `describeCondition({factor:"smoking_status",op:"eq",value:"never"})`                                   | `palenie papierosów: nie, nigdy`                                                                                                      | `smoking: no, never`                                                                                                                           |
| `describeBranch({sex:"female",age_min:45,age_max:74,requires:[]})`                                     | `kobiety i wiek 45–74 lat`                                                                                                            | `women and age 45–74`                                                                                                                          |
| `describeBranch({age_min:50,requires:[]})`                                                             | `wiek od 50 lat`                                                                                                                      | `age 50 or older`                                                                                                                              |
| `describeBranch({sex:"male",age_min:65,age_max:75,requires:[smoking_status in ["current","former"]]})` | `mężczyźni, wiek 65–75 lat i palenie papierosów: tak, obecnie lub w przeszłości`                                                      | `men, age 65–75, and smoking: yes, currently or in the past`                                                                                   |
| `describeInterval` months 12 / 24 / 60                                                                 | `co roku` / `co 2 lata` / `co 5 lat`                                                                                                  | `every year` / `every 2 years` / `every 5 years`                                                                                               |
| `describeInterval` months 1 / 2 / 6                                                                    | `co miesiąc` / `co 2 miesiące` / `co 6 miesięcy`                                                                                      | `every month` / `every 2 months` / `every 6 months`                                                                                            |
| `describeInterval` kinds shared_decision / no_known_interval / per_program                             | `ustalasz z lekarzem` / `brak ustalonego odstępu` / `według zasad programu`                                                           | `decide with your doctor` / `no set interval` / `set by the program`                                                                           |
| `describeMissing([[family_history_crc_first_degree eq true], [bmi gte 25, hypertension eq true]])`     | `Twój rodzic, rodzeństwo lub dziecko chorowało na raka jelita grubego lub BMI ≥ 25 i lekarz rozpoznał u Ciebie nadciśnienie tętnicze` | `a first-degree relative (parent, sibling or child) had colorectal cancer or BMI ≥ 25 and a doctor has diagnosed you with high blood pressure` |

The interval rows together exercise the Polish `_one`/`_few`/`_many` plural keys and the `months % 12` years/months switch (`wording.ts:124-126`).

#### 2. Docs

**File**: `CLAUDE.md`, `README.md`, `context/foundation/prd.md`

**Intent**: Replace the "no unit suite" notes with how to run and where to add unit tests.

**Contract**:

- **`CLAUDE.md`, "Build, Test, and Development Commands" (`:24-30`):** add a `npm test` bullet (Vitest, colocated `src/**/*.test.ts`, run in CI's `ci` job).
- **`CLAUDE.md`, "Testing Guidelines" (`:52`):** replace "No unit suite is configured yet." with a sentence covering:
  - the Vitest suite and its colocated `*.test.ts` convention;
  - pure modules taking "now"/`currentYear` as a parameter;
  - adding a case when changing catalog rules or their wording;
  - if wording tests fail after a Node update with no code change, re-probe the strings and re-pin them.

  Keep the existing pgTAP and smoke sentences. `AGENTS.md` is a symlink to `CLAUDE.md`, so it needs no separate edit.

- **`README.md`, "Available Scripts" (`:52-64`):** add a `npm test` bullet (Vitest, colocated `src/**/*.test.ts`) next to `npm run ui:check` (`:59`).
- **`README.md:296`:** reword "no unit suite is configured yet" to point at `npm test`.
- **`README.md:302`:** add the unit tests to the `ci` job's step list.
- **`prd.md:142`:** drop the "until then …" clause so the NFR states the rule logic is covered by unit tests (F-03, #49).

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including the wording suite: `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- No stale "no unit suite" note remains: `grep -ri "no unit suite" CLAUDE.md README.md` returns nothing
- Markdown is formatted: `npx prettier --check CLAUDE.md README.md context/foundation/prd.md`

#### Manual Verification:

- The `CLAUDE.md` and `README.md` testing notes read correctly and match how `npm test` actually runs
- After the PR is open (stage 10 of the orchestrated chain), the `ci` job shows the `npm test` step running and passing

**Implementation Note**: After automated verification passes, pause for the manual doc check. The CI-log check is done only after impl-review, once the PR is open (never merge).

---

## Testing Strategy

### Unit Tests:

- `recommend.test.ts`:
  - the seven S-02 cases: inclusive bounds, null `pack_years`, false beats unknown, `in` on `smoking_status`, first matching override skipping unknown overrides, tier mapping, sort ties;
  - plus `lte` and null on `years_since_quitting` (15 → match, 16 → no, null → no), the launch gate, `maybe`/`missing`, first matching branch, non-fixed kinds and age.
- `wording.test.ts`: full pl and en strings for the four `describe*` functions (table in Phase 2).

### Integration Tests:

- Unchanged: CI `smoke` (pgTAP, HTTP smoke, scheduled handler) still asserts the dashboard for the smoke fixture end to end.

### Manual Testing Steps:

1. On the PR, open the `ci` job log and confirm the `npm test` step lists both test files and passes.
2. Read the updated `CLAUDE.md` Testing Guidelines and `README.md` notes.

## Performance Considerations

The suite is pure in-process logic with a few dozen cases, so it should add seconds to the `ci` job. There is no DB, network or build dependency.

## Migration Notes

None: no schema, data or runtime change. The Worker bundle is unaffected because Vitest is a dev dependency and test files are never imported by app code. A rollback is a plain revert.

## References

- Research: `context/changes/unit-test-suite/research.md`
- Decisions: `context/changes/unit-test-suite/decisions.md`
- S-02 deferred cases: `context/archive/2026-09-28-screening-recommendations/plan.md:409-416`
- Rule semantics: `src/lib/catalog/factors.ts:6-17`
- Code under test: `src/lib/catalog/recommend.ts:44-142`, `src/lib/catalog/wording.ts:85-139`
- Roadmap F-03: `context/foundation/roadmap.md:117-128`; PRD NFR: `context/foundation/prd.md:142`
- Deferred follow-up cases: `context/archive/2026-09-30-record-appointment-date/plan.md:430-439`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Vitest runner, CI step and rule-engine tests

#### Automated

- [x] 1.1 Vitest is installed and the lockfile updated: `npm ls vitest` shows `vitest@5.x`
- [x] 1.2 Unit tests pass: `npm test`
- [x] 1.3 A deliberate break is caught: changing `age > branch.age_max` to `age >= branch.age_max` in `recommend.ts:73` makes `npm test` fail; revert and confirm it passes again
- [x] 1.4 Lint passes, including the test file and `vitest.config.ts`: `npm run lint`
- [x] 1.5 Type check passes and covers the test file: `npx astro check` (also confirm a deliberate type error in `recommend.test.ts` is reported, then revert)
- [x] 1.6 Build is unaffected: `npm run build`

### Phase 2: Wording tests and docs

#### Automated

- [ ] 2.1 Unit tests pass, including the wording suite: `npm test`
- [ ] 2.2 Lint passes: `npm run lint`
- [ ] 2.3 Type check passes: `npx astro check`
- [ ] 2.4 No stale "no unit suite" note remains: `grep -ri "no unit suite" CLAUDE.md README.md` returns nothing
- [ ] 2.5 Markdown is formatted: `npx prettier --check CLAUDE.md README.md context/foundation/prd.md`

#### Manual

- [ ] 2.6 The `CLAUDE.md` and `README.md` testing notes read correctly and match how `npm test` actually runs
- [ ] 2.7 After the PR is open (stage 10 of the orchestrated chain), the `ci` job shows the `npm test` step running and passing
