---
date: 2026-10-05T22:03:38+0200
researcher: Claude (Opus 5.5), for Amadeusz Kozlowski
git_commit: 1b719a9b1030c4155cb55481c715a85acfd6852f
branch: feat/unit-test-suite
repository: 10xdevs (Dbam)
topic: "What does a Vitest unit suite for the catalog rules (recommend.ts, wording.ts) need, and how does it fit the repo and CI?"
tags: [research, codebase, vitest, catalog, recommend, wording, ci, f-03]
status: complete
last_updated: 2026-10-05
last_updated_by: Claude (Opus 5.5)
---

# Research: Vitest unit suite for the catalog rules (F-03)

**Date**: 2026-10-05T22:03:38+0200
**Researcher**: Claude (Opus 5.5), for Amadeusz Kozlowski
**Git Commit**: 1b719a9b1030c4155cb55481c715a85acfd6852f
**Branch**: feat/unit-test-suite
**Repository**: 10xdevs (Dbam)

## Research Question

Roadmap F-03 (`context/foundation/roadmap.md:117-128`): "a unit-test runner (Vitest) runs in CI and covers the catalog eligibility, tier and interval rules (`src/lib/catalog/recommend.ts`, `wording.ts`)". What does the codebase already provide, what must be added (runner, config, CI step, docs), which cases are owed from S-02, and what fixtures and inputs do the tests need?

## Summary

- **Both target modules run under plain Vitest in Node, with no Astro runtime.** Their runtime import graph is three files: recommend → factors → profile, and wording → profile. Every other import is `import type` (`src/lib/catalog/recommend.ts:1-4`, `src/lib/catalog/wording.ts:1-5`, `src/lib/catalog/factors.ts:1`). No `astro:*`, `cloudflare:*`, Supabase or clock is involved: `recommend()` takes `currentYear` as a parameter (`recommend.ts:103-108`).
- **The repo has no unit runner.** There are no `*.test.*`/`*.spec.*` files outside `node_modules`, no `test` script (`package.json:5-23`) and no vitest in `node_modules`. The only tests are pgTAP (`supabase/tests/database/*.test.sql`) and the HTTP smoke (`scripts/smoke.mjs`). `CLAUDE.md:52` and `README.md:296` both say "no unit suite is configured yet", so this change must update those lines.
- **Vitest 5.0.3 is compatible with the installed toolchain.** I verified with `npm view` on 2026-10-05:
  - peer `vite ^6.4.0 || ^7.0.0 || ^8.0.0` accepts the installed vite 8.3.0;
  - engines `node ^22.12.0 || ^24.0.0 || >=26.0.0` accepts CI's `node-version: 22` (`.github/workflows/ci.yml:21-24`) and local Node 22.16.0.
- **The `@/*` alias is the one config need.** It lives only in `tsconfig.json:8-10`; `astro.config.mjs` defines no `resolve.alias`. Vite 8 has a native `resolve.tsconfigPaths` option (`node_modules/vite/dist/node/index.d.ts:2723`, default false). A minimal `vitest.config.ts` (from `vitest/config`) can set it, or set a manual alias. `getViteConfig` from `astro/config` exists in Astro 7.3.2 but would load the Cloudflare adapter, so it is unnecessary here.
- **CI:** `npm test` fits in the `ci` job between `ui:check` (`ci.yml:29`) and `build` (`ci.yml:31`). It needs no DB, secrets or `astro sync`.
- **Owed cases:** S-02's plan lists 7 first cases (`context/archive/2026-09-28-screening-recommendations/plan.md:409-416`). Each maps to a specific line in `recommend.ts` (table below). `wording.ts` has no listed cases; its behaviours are inventoried below.

## Detailed Findings

### Rule engine: `src/lib/catalog/recommend.ts`

Exported, testable: `evaluateBranch` (`:70`), `resolveInterval` (`:82`) and `recommend` (`:103`). `tierOf` (`:93-96`) is private and reached through `recommend`.

| S-02 case (`plan.md:409-416`)                           | Code under test        | Observed behaviour                                                                                                                                           |
| ------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Inclusive `age_min`/`age_max`                           | `recommend.ts:72-73`   | `age < age_min` → no and `age > age_max` → no, so age == bound matches. Age = `currentYear - birth_year` (`:109`). An absent `age_max` means no upper bound. |
| Null `pack_years` treated as false                      | `recommend.ts:48-49`   | A collected factor with a null profile value returns `"no"` before the operator runs, for any op.                                                            |
| False beats unknown                                     | `recommend.ts:76-77`   | Any `"no"` in `requires` → `"no"`, else any `"unknown"` → `"unknown"`. Sex (`:71`) and age (`:72-73`) fail fast before conditions run.                       |
| `in` on `smoking_status`                                | `recommend.ts:57-58`   | Matches only when `value` is an array and the profile value is a string in it.                                                                               |
| First matching override wins, unknown overrides skipped | `recommend.ts:85-86`   | `find(... === "match")`, so an `"unknown"` override is skipped and the next one is tried. With no match it falls back to `interval_months`.                  |
| Tier mapping                                            | `recommend.ts:93-96`   | evidence_level ≥3 → tier 1, ==2 → tier 2, any other value → tier 3. The schema restricts evidence_level to integers 1–3 (`schema.ts:230`).                   |
| Sort ties                                               | `recommend.ts:134-139` | `burden_weight` descending, then `Intl.Collator(locale)` on `name_pl` (pl) or `name_en` (en). This applies within each tier and within `maybe`.              |

Other behaviours visible in the code:

- **Launch gate (`:114`).** An entry is skipped when `status !== "active"` or `reviewed_by` is null or undefined.
- **Interval kinds.** A non-fixed `interval_kind` returns `{ kind }` (`:83`). A fixed kind with null months returns `no_known_interval` (`:88`); the code comment calls this unreachable for validated entries.
- **Matched branch.** `matchedBranch` is the first branch in document order that returns `"match"` (`:117-123`).
- **`maybe` (`:126-130`).** An entry lands here only when no branch matches and at least one is `"unknown"`. `missing` holds one array per unknown branch, filtered to conditions on uncollected factors.
- **Mismatched operators (`holds`, `:53-64`).** `gte`/`lte` with a non-number on either side, or `in` with a non-array value, gives `false` → `"no"`.

### Wording: `src/lib/catalog/wording.ts`

Exported: `describeCondition` (`:85`), `describeBranch` (`:110`), `describeInterval` (`:122`) and `describeMissing` (`:130`). Each takes a `Translate`. A real one comes from `createT(locale)` (`src/i18n/index.ts:40-53`), which builds in plain Node: `pl.ts` has no imports and `en.ts` imports only a type.

- **Boolean factor.** `eq false` wraps the phrase in `factor.negation` (`:89-92`): pl "nie jest tak, że {condition}", en "it is not the case that {condition}".
- **Number factor.**
  - An `in` op is treated as `eq` (`:95`).
  - The value is formatted with `Intl.NumberFormat(locale)` (`:97`), so pl renders 20.5 as "20,5".
  - A non-number value renders as "".
- **Enum factor (`:100-105`).**
  - Labels come from `SMOKING_STATUS_LABEL_KEYS` (`src/lib/profile.ts:23-27`). They are joined with a disjunction `Intl.ListFormat`, then the whole string is lowercased.
  - Checked on Node 22.16: en gives "yes, currently or in the past".
  - An unlisted value passes through raw.
  - A scalar `eq` value is wrapped in an array.
- **`describeBranch` (`:110-119`).**
  - Joins sex, then age (`rule.ageFrom` when `age_max` is absent, otherwise `rule.ageRange`), then conditions, with a conjunction ListFormat.
  - Checked on Node 22.16: pl gives "kobiety, wiek 45–74 lat i x".
  - It reads `branch.requires.map`, so `requires` must be present. The schema requires it (`schema.ts:130`).
- **`describeInterval` (`:122-127`).** `months % 12 === 0` uses the `interval.years` plural, otherwise `interval.months`. Non-month kinds use `INTERVAL_KIND_KEYS` (`:74-78`).
  - Polish plural keys: `_one` "co roku", `_few` "co {count} lata", `_many` "co {count} lat", `_other` "co {count} roku" (`src/i18n/pl.ts:59-69`).
  - `t.plural` picks `_${PluralRules.select(n)}` and falls back to `_other` (`src/i18n/index.ts:40-53`).
- **`describeMissing` (`:130-139`).** Joins conditions within a branch with "and" and joins branches with "or".
- **Compile-time guard (`:67`).** A `satisfies` clause makes the type check fail when a factor is added to `factors.ts` without wording. `astro check` already covers that, so it needs no runtime test.

### Fixture inputs

- **`CatalogEntry`.** The type comes from `CatalogEntrySchema` (`schema.ts:206`, types exported `:258-262`), a strict zod object.
  - Required keys: slug, status, name_pl/en, summary_pl/en, how_to_access_pl/en, eligibility (≥1), interval_kind, interval_overrides (may be `[]`), evidence_level, evidence_source, burden_weight, nfz_funded, referral_required, sources (≥1, https url, `accessed` date not in the future).
  - The review fields are nullish (`schema.ts:187-191`), but `checkReviewStamp` (`schema.ts:193-200`) rejects an `active` entry without `reviewed_by`/`last_reviewed`.
  - So a launch-gate fixture (active + null reviewer) can be typed but cannot pass `CatalogEntrySchema.parse`. The schema's `accessed`-not-in-future check also makes parsing clock-dependent.
- **`BranchSchema` (`schema.ts:125-133`).** `age_min` is required; `age_max` and `sex` are optional; `requires` is required (may be empty). The internal `Rule` type in recommend.ts makes `requires` optional (`recommend.ts:37-42`) because interval overrides' `when` omits it.
- **`Profile`.** Defined as `Database["public"]["Tables"]["profiles"]["Row"]` (`src/lib/profile.ts:29`). All 13 columns are required keys. `sex` and `smoking_status` are typed `string`, not unions. A test needs a full literal or a factory.
- **Real catalog entries usable as reference shapes** (`catalog/entries/*.json`):
  - `blood-pressure-measurement`: fixed 36, override `{age_min:40}` → 12.
  - `cervical-screening-nfz-program`: override on the uncollected `hiv_or_immunosuppression`, so it is always skipped today.
  - `abdominal-aortic-aneurysm-ultrasound`: `in ["current","former"]` on smoking_status.
  - `colonoscopy-nfz-program`: one plain branch plus one on the uncollected family history.
  - `psa-shared-decision`: evidence level 1 → tier 3.
  - `lung-ldct-nfz-program`: the only one with `pack_years`. It is a draft without a reviewer.
- **Loader.** `scripts/catalog/lib.ts:82` `loadEntries()` loads and validates the catalog in Node. It pulls in prettier and fs and uses `import.meta.dirname`.

### Toolchain fit

- **tsconfig.** `tsconfig.json:2-4` extends `astro/tsconfigs/strict` (Bundler resolution, `verbatimModuleSyntax`), includes `**/*` and excludes only `dist`. Test files and a root `vitest.config.ts` are therefore in the TS project and need no tsconfig edit. With `verbatimModuleSyntax`, type imports must use `import type`. Importing `describe`/`it`/`expect` from `"vitest"` avoids the need for `vitest/globals` types.
- **`astro check` coverage.** It is expected to type-check `.ts` test files in the project, as it does for `scripts/catalog/*.ts`. **Not verified by running it.**
- **ESLint (`eslint.config.js`).**
  - The type-checked config has no `files` filter (`:16-40`, `projectService: true`, `strictTypeChecked` + `stylisticTypeChecked`), so test files and `vitest.config.ts` are type-linted. Ignores are `.gitignore` (`:114`), `database.types.ts` (`:116`) and `worker-configuration.d.ts` (`:118`).
  - Strict rules that commonly bite test code: `no-non-null-assertion` (e.g. `tiers[1][0]!`), `no-unnecessary-condition`, `no-floating-promises`, `unbound-method`.
  - The `@/lib/reminders/*` import ban (`:83-104`) covers only pages, components, layouts and middleware, so it does not affect tests under `src/lib/**`.
- **lint-staged / husky.** The `*.{ts,tsx,astro}` → `eslint --fix` glob (`package.json:70-80`) already covers test files. `.husky/pre-commit` runs only `npx lint-staged`. `ui-check` globs do not touch `src/lib`.
- **`.gitignore`.** No `coverage/` entry; one is needed only if coverage output is enabled.

### CI (`.github/workflows/ci.yml`)

The `ci` job steps (`:25-31`) are, in order: `npm ci`, `catalog:check`, `astro sync`, `lint`, `ui:check`, `astro check`, `build`. A `- run: npm test` step needs only setup-node and `npm ci` (`:21-25`). It does not belong in the `smoke` job, which starts Supabase.

## Code References

- `src/lib/catalog/recommend.ts:44-64`: condition evaluation (`evaluateCondition`, `holds`)
- `src/lib/catalog/recommend.ts:70-79`: `evaluateBranch`, false-beats-unknown
- `src/lib/catalog/recommend.ts:82-90`: `resolveInterval`, first matching override
- `src/lib/catalog/recommend.ts:93-96`: `tierOf`, private
- `src/lib/catalog/recommend.ts:103-142`: `recommend`, launch gate, maybe/missing, sort
- `src/lib/catalog/wording.ts:85-139`: the four `describe*` functions
- `src/lib/catalog/factors.ts:6-17`: documented rule semantics; `:27-120`: FACTORS (3 collected, 14 uncollected)
- `src/lib/catalog/schema.ts:125`, `:187-200`, `:206`, `:230`: Branch, review gate, entry schema, evidence_level
- `src/lib/profile.ts:23-29`: smoking labels, `Profile`
- `src/i18n/index.ts:40-53`: `createT`, `t.plural`
- `src/pages/dashboard.astro:52`, `src/pages/api/screenings.ts:115`: `recommend(catalog, profile, now.getFullYear(), locale)` callers
- `src/lib/screenings/rules.ts:3`, `:264`: S-03/S-05 recurrence consumes `resolveInterval`
- `tsconfig.json:2-10`, `eslint.config.js:16-40`, `package.json:5-23`, `package.json:70-80`, `.github/workflows/ci.yml:25-31`

## Architecture Insights

- The S-02 rule engine was designed to be unit-tested. The header comment says so (`recommend.ts:6-7`), and S-02's plan made it I/O-free "so the future unit suite (F-03) can test it directly" (`context/archive/2026-09-28-screening-recommendations/plan.md:189`). The suite needs no mocks.
- The established pattern for pure modules is to pass "now" in as a parameter. `recommend` takes `currentYear`, and S-03 `rules.ts` takes `now` (`context/archive/2026-09-30-record-appointment-date/research.md:191`). Tests therefore need no fake timers.
- Wording output depends on ICU through `Intl.ListFormat`, `Intl.NumberFormat`, `Intl.PluralRules` and `Intl.Collator`. Exact expected strings are tied to the Node/ICU version in CI (Node 22). Polish plural and collation results quoted here were checked on Node 22.16 only.

## Historical Context (from prior changes)

- `context/archive/2026-09-28-screening-recommendations/plan.md:65`, `:409-416` and `plan-brief.md:40`: the owner deferred unit tests to F-03 and listed the 7 first cases. _Current verdict: supported._ Each case maps to a code line above.
- `context/archive/2026-09-28-screening-catalog-v1/plan.md:64`, `:485-491`: no unit tests (owner decision). Candidate cases are listed for the schema refinements, `scripts/catalog/lib.ts` (determinism, SQL escaping) and `draft-core.ts`. These are outside F-03's stated outcome.
- `context/archive/2026-09-30-record-appointment-date/plan.md:430-439`: candidate cases for `src/lib/screenings/rules.ts`, including Warsaw midnight, Feb 29 + 2 years and the due-again boundary. These are outside F-03's stated outcome, but the roadmap says F-03 "unlocks safer changes to S-05's recurrence logic" (`roadmap.md:117-128`).
- `context/archive/2026-10-05-confirm-exam-and-recurrence/plan.md:41`, `:333`: S-05 deferred tests to F-03. `awaitingConfirmation` (`rules.ts:219` `partitionDashboard`) and `describeLastDone` (`src/lib/screenings/format.ts:51`) are named as "ready for F-03".
- Plans for ui-refactor (`:429`), appointment-reminder (`:445`), auth-ui-redesign (`:755`), continue-ui-redesign (`:306`) and onboarding-profile (`:415`, `parseProfileForm` boundaries) each also point at F-03.
- PRD: FR-004 (`prd.md:101-106`) covers tiers from evidence level. FR-009 (`prd.md:120-122`) covers the next recurrence from the interval. The NFR (`prd.md:142`) reads "The catalog rule logic (eligibility, importance tier, repeat interval) is covered by unit tests, tracked as roadmap foundation F-03 (#49); until then it is covered by smoke checks, pgTAP and manual test profiles". That "until then" clause becomes stale once this change ships.
- Roadmap: F-03 has status `ready` (`roadmap.md:47`) and backlog issue #49 (`:279`). No roadmap item depends on F-03. F-06 is parallel (`:164`).

## Related Research

- `context/archive/2026-09-28-screening-recommendations/research.md`: S-02 rule-engine research
- `context/archive/2026-09-30-record-appointment-date/research.md`: pure-module "now" convention, `rules.ts`

## Open Questions

These are choices for `/10x-plan`, not missing evidence:

1. **Scope beyond the stated outcome.** F-03 names only `recommend.ts` and `wording.ts`. Archived plans list ready candidates in `screenings/rules.ts` (recurrence), `screenings/format.ts`, `profile.ts` (`parseProfileForm`, `packYears`), `password.ts` and `scripts/catalog/lib.ts`. Options: stay on the catalog rules only, or also add a small set of `rules.ts` recurrence cases, given the roadmap's "unlocks S-05" note.
2. **Test location and naming.** No convention exists (no matches in `context/` or `README.md`). Options: colocated `src/lib/catalog/*.test.ts`, or a `tests/` dir. Also choose an explicit `include` glob versus Vitest defaults. I did not verify whether Vitest 5's default `exclude` skips `dist/` and `.astro/`.
3. **Fixtures.** Options:
   - inline typed factories (independent of catalog churn, can express the launch-gate case);
   - parsing them with `CatalogEntrySchema`, which rejects active + null reviewer and checks `accessed` against the clock;
   - one extra test over the real catalog via `loadEntries()`.
4. **Wording assertions.** Exact strings depend on ICU in CI's Node 22. Options: exact strings pinned to Node 22, or substring and structure assertions.
5. **Coverage and pre-commit.** No requirement in the PRD or roadmap asks for coverage thresholds or for tests in pre-commit.
6. **Docs to update with the change.** `CLAUDE.md:52` (Testing Guidelines: "No unit suite is configured yet"), `README.md:296`, the "Build, Test, and Development Commands" list in CLAUDE.md, and possibly the PRD NFR "until then" sentence (`prd.md:142`) and the F-03 roadmap status.
7. **Unverified mechanics** for implement to confirm:
   - `astro check` reports type errors in `*.test.ts`;
   - `resolve.tsconfigPaths: true` resolves `@/*` under Vitest 5 with Vite 8.3.
