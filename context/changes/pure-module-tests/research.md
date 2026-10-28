---
date: 2026-10-28T10:24:27+01:00
researcher: Amadeusz Kozlowski (Claude worker)
git_commit: 00df7e78112cf243500d4dae55fa619b8feba4c1
branch: feat/pure-module-tests
repository: dbam
topic: "Unit tests for the remaining pure modules (F-19)"
tags: [research, codebase, vitest, password, profile, errors, auth-errors, screenings-format, catalog-scripts]
status: complete
last_updated: 2026-10-28
last_updated_by: Amadeusz Kozlowski (Claude worker)
---

# Research: Unit tests for the remaining pure modules (F-19)

**Date**: 2026-10-28T10:24:27+01:00
**Researcher**: Amadeusz Kozlowski (Claude worker)
**Git Commit**: 00df7e78112cf243500d4dae55fa619b8feba4c1
**Branch**: feat/pure-module-tests
**Repository**: dbam

## Research Question

Roadmap F-19 (`context/foundation/roadmap.md:115-125`, backlog B-11): which behaviours of the remaining pure modules
(`src/lib/password.ts`, `parseProfileForm`/`packYears` in `src/lib/profile.ts`, `src/lib/errors.ts`,
`src/lib/auth-errors.ts`, `scripts/catalog/*` beyond what F-17 #103 covers, and `isIsoDate`, `screeningFormBounds`,
`formatDay`, `formatMonth` directly) should colocated Vitest tests pin, does any of them read the clock, and which
risks (password-policy parity with `supabase/config.toml`, ICU-dependent strings, incidental counts) shape the tests?

## Summary

- **No `src/lib` module in scope reads the clock.** `parseProfileForm` takes `currentYear` (`src/lib/profile.ts:69`),
  `screeningFormBounds` takes `now` (`src/lib/screenings/format.ts:25`); the callers supply `new Date()`
  (`src/pages/api/profile.ts:35`, `src/components/profile/ProfileForm.tsx:64`, `src/pages/dashboard.astro:65`).
  `password.ts`, `errors.ts`, `auth-errors.ts`, `isIsoDate`, `formatDay`, `formatMonth` take no time input. In
  `scripts/catalog/*`, `snapshotFileName` takes `now` (`lib.ts:411`); the one hidden clock is the catalog schema's
  `latestToday()` (`src/lib/catalog/schema.ts:39-41`), harmless with past fixture dates. So F-19 needs **no source
  change**.
- **Runner is ready**: `vitest.config.ts` includes `src/**/*.test.ts` and `scripts/**/*.test.ts` in a `node`
  environment with tsconfig paths; CI runs Node 22 (`.github/workflows/ci.yml:23`, `.nvmrc` = `22.14.0`). No config
  change is needed.
- **Existing coverage to avoid duplicating**: `src/lib/screenings/format.test.ts` covers only `describeLastDone`
  (3 cases, `format.test.ts:13-37`); `src/lib/screenings/rules.test.ts` covers `isIsoDate` only through
  `parsePlanForm` (`rules.test.ts:162-212`); `scripts/catalog/lib.test.ts` covers the five F-17 functions
  `parseSnapshotStatuses`, `findBackwardMoves`, `findReviewWarnings`, `formatReviewWarnings`, `renderReviewSummary`
  (`lib.test.ts:41-245`). `password.ts`, `profile.ts`, `errors.ts`, `auth-errors.ts` have no test file.
- **Password parity can be a real test**: a test can read `supabase/config.toml` with `node:fs` (precedent:
  `src/lib/catalog/rule-entry.test.ts:1,15` reads repo files) and assert `minimum_password_length = 12`
  (`config.toml:175`) equals `PASSWORD_MIN_LENGTH` (`password.ts:6`) and `password_requirements = "letters_digits"`
  (`config.toml:178`). The production dashboard value cannot be checked from a test.
- **ICU strings**: `formatDay`/`formatMonth`/`screeningFormBounds().months` go through `Intl.DateTimeFormat`; probe
  values on local Node v22.16.0 (ICU 77.1) are listed below. Reuse the existing re-probe/re-pin comment
  (`format.test.ts:7-8`), as decided in `context/archive/2026-10-06-recurrence-unit-tests/decisions.md` ("ICU drift").

## Detailed Findings

### `src/lib/password.ts`

- Contract: `PASSWORD_MIN_LENGTH = 12` (`password.ts:6`); `passwordIssues(password)` returns, in this order,
  `"too_short"` when the code-point count (`Array.from(password).length`) is below 12 (`password.ts:14`) and
  `"needs_letter_and_digit"` when there is no ASCII letter or no ASCII digit (`password.ts:15`).
- Callers: `src/pages/api/auth/signup.ts:15` (server gate), `src/components/auth/SignUpForm.tsx:46`,
  `src/components/forms/PasswordRules.tsx:13`.
- Probed (local Node, copy of `password.ts`):
  - `""` → `["too_short", "needs_letter_and_digit"]` (order pinned by `password.ts:12-16`)
  - `"abcdefghij1"` (11) → `["too_short"]`; `"abcdefghijk1"` (12) → `[]` (boundary inclusive)
  - `"abcdefghijkl"` → `["needs_letter_and_digit"]`; `"123456789012"` → `["needs_letter_and_digit"]`
  - `"ABCDEFGHIJK1"` → `[]` (upper case counts as a letter)
  - `"ąęśćżźółńąęś1"` → `["needs_letter_and_digit"]` (non-ASCII letters are not letters, mirroring Supabase
    `letters_digits`, comment `password.ts:3-4`)
  - 11 emoji + `"a1"` (13 code points, 24 UTF-16 units) → `[]`. The case that tells code points from UTF-16 units:
    5 emoji + `"abcde1"` is 11 code points but 16 UTF-16 units → `["too_short"]` (derived from `password.ts:13-14`,
    not probed).
- Parity with Supabase: `supabase/config.toml:175` `minimum_password_length = 12`, `:178`
  `password_requirements = "letters_digits"`. CLAUDE.md "Hard rules" requires the three to change together.

### `src/lib/profile.ts` — `parseProfileForm`, `packYears`

- `packYears(p, y) = Math.round(p * y * 100) / 100` (`profile.ts:64-66`), mirroring the generated column
  `pack_years numeric generated always as (packs_per_day * smoking_years)`
  (`supabase/migrations/20260927190303_onboarding_profile.sql:61`). Probed: `packYears(0.1, 3)` → `0.3` (float noise
  rounded away), `packYears(1.33, 3)` → `3.99`, `packYears(0.5, 20)` → `10`, `packYears(10, 100)` → `1000`.
- `parseProfileForm(form, currentYear)` rules (`profile.ts:69-143`); probed with `currentYear = 2026`:
  - birth year: blank → `birthYearRequired` (`:75-76`); non-digits, age > 120 or a future year → `birthYearInvalid`
    (`:77-78`); age < 18 → `birthYearTooYoung` (`:79-80`). Probed: 2008 (18) ok, 2009 → too young, 1906 (120) ok,
    1905 → invalid, `"abc"` → invalid, `" 1980 "` is trimmed (`:50`) and accepted.
  - sex not in `female|male` → `sexRequired` (`:88`); status not in `never|current|former` →
    `smokingStatusRequired` (`:95-96`).
  - `never`: smoking fields are dropped to `null` even when submitted (probed: `packs_per_day: "5"` → `null`).
  - packs per day: decimal comma accepted, rounded to 2 decimals (`:58-61`); must be > 0 and ≤ 10 (`:99`). Probed:
    `"0,555"` → `0.56`; `"10.01"` and `"0"` → `packsPerDayInvalid`.
  - smoking years: integer 1..min(age, 100), or 1..100 when the birth year is invalid (`:85`, `:103-106`). Probed:
    `"0"` and `"101"` → `smokingYearsInvalid`.
  - `former`: years since quitting blank or > limit → `yearsSinceQuittingInvalid` (`:109-111`); smoking years +
    years since quitting > age → `smokingLongerThanAge`, set on `smoking_years` (`:112-119`). Probed (born 1980,
    age 46): 30 + 16 ok (equal is allowed), 30 + 17 → `{ smoking_years: "profile.errors.smokingLongerThanAge" }`.
  - All field errors accumulate in one result (probed: 4 and 5 errors at once); `current` keeps
    `years_since_quitting: null`.
- DB bounds the parser mirrors (`onboarding_profile.sql:55-60`): `birth_year` 1900–2100, `packs_per_day` >0 ≤10
  `numeric(4,2)`, `smoking_years` 1–100, `years_since_quitting` 0–100.
- Fixture helper precedent: `form(fields)` builds `FormData` in `src/lib/screenings/rules.test.ts:116-120`.
  Node 22 provides `FormData` globally; no environment change.

### `src/lib/errors.ts` and `src/lib/auth-errors.ts`

- `errorMessageKey(code)` → `errors.<code>` when `isMessageKey` finds it, else `"errors.unknown"`
  (`errors.ts:7-10`). `isMessageKey` uses `Object.hasOwn(pl, key)` (`src/i18n/index.ts:29-31`); codes such as
  `__proto__`, `constructor` and free text fall back to `errors.unknown`. (Corrected after plan review F4: the looked-up
  keys are `errors.__proto__`/`errors.constructor`, which are not inherited names, so these cases do not exercise
  `Object.hasOwn`.)
- `authErrorCode({ code? })` passes `code` through only when `errors.auth.<code>` exists, else `"unknown"`
  (`auth-errors.ts:8-10`); `authErrorMessageKey(code)` = `errorMessageKey("auth." + code)` (`auth-errors.ts:13-15`).
  Edge: `authErrorMessageKey("unknown")` → `errors.auth.unknown` does not exist in `pl.ts` (14 `errors.auth.*` keys,
  `pl.ts:339-355`), so it falls back to `"errors.unknown"`.
- Observed (not a bug to fix here): `errorMessageKey("auth.invalid_credentials")` resolves to the auth message on a
  non-auth page because the prefix is plain concatenation (`errors.ts:8`). Pinning it is optional.
- Tests should pick 1–2 named keys (e.g. `invalid_credentials`, `not_configured`), not count keys — the key set
  grows with each feature.
- Callers: `src/pages/api/auth/signin.ts:21`, `signup.ts:30` (`authErrorCode`); `src/pages/auth/{signin,signup}.astro`
  (`authErrorMessageKey`); `dashboard.astro:119`, `onboarding.astro:31`, `profile.astro:41` (`errorMessageKey`).

### `src/lib/screenings/rules.ts` — `isIsoDate`

- Regex `^\d{4}-\d{2}-\d{2}$` then a UTC round-trip check (`rules.ts:78-84`). Expected from source:
  `2026-02-30`, `2026-02-29`, `2026-13-01`, `2026-00-10`, `2026-1-01`, `" 2026-01-01"` → false; `2028-02-29`,
  `2026-12-31` → true. `0000-01-01` → true (setUTCFullYear(0) round-trips) — an incidental behaviour; pin only if
  the plan wants it, otherwise leave out. Not probed: the module imports runtime code through the `@/` alias, so the
  plan's first test run is the probe.

### `src/lib/screenings/format.ts` — `screeningFormBounds`, `formatDay`, `formatMonth`

- `screeningFormBounds(now, birthYear, locale)` (`format.ts:25-35`): `minDate = warsawToday(now)`,
  `maxDate = addYears(today, 2)` (`MAX_APPOINTMENT_YEARS_AHEAD`, `rules.ts:28`), `years` = current Warsaw year down to
  `birthYear` (empty when `birthYear` > current year, via `Math.max(…, 0)`), `months` = 12 entries with `value` 1–12
  and locale month names.
  Boundary cases from source: `now = 2026-12-31T23:30:00Z` is already `2027-01-01` in Warsaw, so `minDate`
  `2027-01-01`, `maxDate` `2029-01-01`, `years[0]` 2027; a Warsaw today of `2028-02-29` gives `maxDate`
  `2030-03-01` (Feb 29 rollover, `rules.ts:93-99`).
- `formatDay`/`formatMonth` use `timeZone: "UTC"` (`format.ts:39,44`), so no day shift. Probed on Node v22.16.0,
  ICU 77.1:
  - `formatDay("2026-10-12")`: pl `12 października 2026`, en `October 12, 2026`; `formatDay("2028-02-29", "pl")`
    `29 lutego 2028`.
  - `formatMonth("2026-10-01")`: pl `październik 2026`, en `October 2026`.
  - month labels pl: `styczeń … grudzień`; en: `January … December`.
- Doc drift (observed, not in scope to fix): the JSDoc example `"12 October 2026"` (`format.ts:37`) does not match the
  `en` output `October 12, 2026` (en-US order).
- Callers: `PlanItem.astro:55,65`, `UnavailableItem.astro:33`, `DoneItem.astro:51`,
  `src/lib/reminders/appointment.ts:56` (`formatDay` in reminder emails), `dashboard.astro:65`,
  `kitchen-sink.astro:54`.
- `warsawToday` keeps a one-entry module cache keyed by `now.getTime()` (`rules.ts:52-63`); harmless across tests.

### `scripts/catalog/*`

Read by one sub-agent (scope: `scripts/catalog/lib.ts`, `draft-core.ts`, `check.ts`, `migration.ts`, `draft.ts`,
`schema.ts`); the claims below were spot-checked in the main context (`schema.ts:39-41,159`, `lib.ts:146-166`,
`draft-core.ts:411-438`, `draft.ts:150-151,397`, `catalog-check-guards/plan.md:40,44`).

**Setup facts**

- `draft-core.ts:1-5` imports `@anthropic-ai/sdk` as `import type` only; the SDK is a devDependency
  (`package.json:52`), so tests need no network or key. Fixtures need casts (`as BetaContentBlock`) because the SDK
  block types carry required fields.
- **Hidden clock (no source change needed):** `CatalogEntrySchema` rejects a source `accessed` date later than
  `latestToday()` = `Date.now()` + 14 h (`src/lib/catalog/schema.ts:39-41,159`). It reaches `validateEntry` and
  `planWrites`. Fixtures that clone real entries with past `accessed` dates (the F-17 pattern, `lib.test.ts:20-26`)
  are unaffected, so making it injectable is not required for F-19.
- F-17 kept `renderSnapshotSql` output frozen (`context/archive/2026-10-28-catalog-check-guards/plan.md:40`) and
  left the rest of the catalog scripts to F-19, "extends the same test file" (`:44`).
- `check.ts` (1-70), `migration.ts` (1-47), `schema.ts` (1-14) are CLI wiring with top-level side effects.
  `draft.ts` holds unexported pure helpers (`parseCount` :111, `localToday` :172, `withWebBudget` :279,
  `usageLines` :339, `failureMessage` :348, `planLines` :368) but runs top-level code from :397 (argv, API client), so
  it cannot be imported by a test; testing them means moving them to `draft-core.ts` — a source change outside
  "tests only". Recommended: leave out, note in the plan.

**`lib.ts` exports not yet covered** (pure unless marked)

- `displayPath(file)` :30 — repo-relative path with `/`.
- `formatIssuePath(path)` :39-46 — `[]` → `"(entry)"`; `["eligibility",0,"requires",1,"factor"]` →
  `"eligibility[0].requires[1].factor"`; `[0,"slug"]` → `"[0].slug"`.
- `validateEntry(label, fileSlug, raw)` :51-66 — real entry → ok; slug ≠ file name → problem
  `slug: "<s>" does not match the file name (expected "<f>")` (:62); `{}` → problems prefixed `label: `. Zod message
  text is library-owned: assert the prefix, not the full message.
- `renderSnapshotSql(entries)` :177-211 — `[]` throws (:178); `'` doubled, `\` and `$$` literal (`quote` :150-153);
  NUL throws (:151, reachable only with a hand-built cast entry since the schema rejects NUL); jsonb columns as
  `'…'::jsonb` (:158); `null`/`undefined` → `null`; booleans → `true`/`false`; non-integer number throws
  `<col>: expected an integer` (:165); output independent of input order (catalog-v1 "determinism" candidate);
  starts with `SNAPSHOT_HEADER`. Assert with `toContain`/line regexes, not a golden full SQL.
- `parseSnapshotSlugs(sql)` :217-221 — no manifest → `null`; round-trip of `renderSnapshotSql` → sorted slugs;
  a `-- catalog-slug:` line after `insert into ` is ignored (:218).
- `findDeletedSlugs(fileSlugs, snapshots)` :251-271 — snapshot without a manifest → a `no "-- catalog-slug:"
manifest` message; a slug missing from the files → one message even when two snapshots ship it (:262); all
  present → `[]`.
- `snapshotFileName(now)` :411-417 — clock is a parameter; `2026-01-02T03:04:05.678Z` →
  `20260102030405_screening_catalog_snapshot.sql` (UTC).
- `entryFilePath(slug)` :437 — `path.join(ENTRIES_DIR, "<slug>.json")`.
- Disk readers with an injectable `dir` (not pure): `loadEntries(dir)` :82-124 (missing dir, `.hidden` ignored,
  non-`.json` file, invalid JSON, sorted output), `listSnapshots(dir)` :229, `newestMigrationVersion(dir)` :241.
  Testable with a temp dir and no source change; see Open Question 1.
- Prettier-dependent (reads `.prettierrc`): `renderJsonSchema()` :427, `renderEntryFile(entry)` :432. If tested,
  assert `JSON.parse(out)` round-trip and trailing `\n`, not formatted text; `catalog:check` already compares them
  with the committed files.

**`draft-core.ts` — no tests today; no I/O** (`draft-core.ts:13-14`)

- `toStrictToolSchema` :83-112 — drops `pattern`/`minLength`/`$schema` (:87), keeps `format: "date"`, drops other
  formats (:101), forces `additionalProperties: false` on objects (:103-110), recurses `properties`/`items`/`anyOf`/
  `allOf`/`$defs`, throws on non-object node (:84), array `properties` (:69), object `anyOf` (:74). For the real
  schema, walk nodes (no `pattern`, every object closed) instead of snapshotting.
- `buildSubmitToolInputSchema` :115-128 — `{ type: "object", required: ["entries"], additionalProperties: false }`,
  `items` = `toStrictToolSchema(x)`.
- `renderTemplate` :137-148 — repeated placeholder filled; missing value throws `no value for {{Y}}`; unused value
  throws `no placeholder for Z`; `{{lower}}` left as is (:134); `{{toString}}` is also left as is (corrected after plan review F1: the pattern is upper case only); a `toString`
  value key throws `no placeholder for toString` (`Object.hasOwn`, :140).
- `renderFactorVocabulary` :151-157, `renderExistingEntries` :167-176 (`[]` → `"(none yet)"`), `buildUserMessage`
  :188-207 (`1 entry` vs `2 entries`, `<source_document path="…">` only with a source) — use synthetic inputs, not
  the real `FACTORS` count; assert lines, not the whole prompt.
- `extractSubmittedEntries` :236-278 — refusal (null `stop_details` → null category/explanation), `max_tokens`,
  `pause_turn`, text-only `end_turn` → `no_tool_call`, foreign tool name ignored, two calls concatenated
  (`calls: 2`), extra key → `schema_errors` (`submit_entries call 1: …`, strictObject :223), `tool_use` before the
  last fallback block ignored (:226-229). Covers catalog-v1 candidates "refusal" and "missing tool call".
- `planWrites` :308-332 — status forced to `draft` with null review fields (`DRAFT_FIELDS` :281, :315); non-object
  → invalid with `slug: null`; existing slug → `skipExisting`; duplicate in one run → `was already submitted
earlier in this run` (:325). Covers catalog-v1 candidates "duplicate slug", "invalid entry", "status forced to
  draft".
- `continuationContent` :345-358, `fallbackHops` :366, `sumUsage` :387-406 (`[]` → zeros; null cache/server-tool
  fields count as 0).
- `terminalSafe` :416-424 — removes C0 except `\t`/`\n`, DEL, C1 (U+0080–9F); keeps `zażółć` and emoji.
- `forbiddenSourceReason` :430-438 — `""`, `"../x"`, `"/etc/x"`, `"C:x"`, `"\\x"` → inside-repo message;
  `.env*` and `.dev.vars` basenames → env message; `docs/x.md` → `null`. `"a/../../x"` passes the function, but the
  only caller passes `path.relative(REPO_ROOT, path.resolve(…))` (`draft.ts:150-151`), which never yields an inner
  `..`; not a bug, pin only if the plan wants it.

**Avoid pinning**: full `renderSnapshotSql`/`renderJsonSchema`/`toStrictToolSchema(real)` output, real entry or
factor counts, exact Zod messages, the whole `buildUserMessage` text.

## Code References

- `vitest.config.ts:1-9` — runner config (node env, `src/**` and `scripts/**` test globs)
- `src/lib/password.ts:6-17` — policy constant and `passwordIssues`
- `supabase/config.toml:175,178` — local Supabase password policy
- `src/lib/profile.ts:53-143` — parsers, `packYears`, `parseProfileForm`
- `src/lib/errors.ts:7-10`, `src/lib/auth-errors.ts:8-15`, `src/i18n/index.ts:29-31` — error-code mapping
- `src/lib/screenings/rules.ts:78-84` — `isIsoDate`
- `src/lib/screenings/format.ts:25-45` — `screeningFormBounds`, `formatDay`, `formatMonth`
- `src/lib/screenings/rules.test.ts:116-120` — `form()` FormData helper precedent
- `src/lib/screenings/format.test.ts:7-8`, `src/lib/catalog/wording.test.ts:8-9` — ICU re-pin comment precedent
- `src/lib/catalog/rule-entry.test.ts:1,15` — precedent for reading repo files in a test

## Architecture Insights

- Tests are colocated `*.test.ts`, use `describe`/`it.each` tables with `$field` names in titles
  (`rules.test.ts:168-177`), and import through the `@/` alias.
- Modules keep "now" as a parameter (CLAUDE.md "Testing Guidelines"); the two `src/lib` functions in scope that need time (`parseProfileForm`, `screeningFormBounds`) already do.
- Precedent for scope discipline: tests pin current behaviour; a bug a test reveals goes to the backlog
  (`roadmap.md:125`), not into the change (`context/archive/2026-10-06-recurrence-unit-tests/plan.md`, "What We're NOT
  Doing").

## Historical Context (from prior changes)

- `context/archive/2026-10-05-unit-test-suite/plan.md` ("What We're NOT Doing"): deferred `password.ts`,
  `parseProfileForm`/`packYears`, `errors.ts`, `auth-errors.ts`, `scripts/catalog/*`; also excluded tests over real
  catalog data and `loadEntries()` because `catalog:check` validates them in CI.
- `context/archive/2026-10-06-recurrence-unit-tests/decisions.md` ("Test scope", "ICU drift"): `isIsoDate`,
  `screeningFormBounds`, `formatDay`/`formatMonth` left out as optional; no new ICU drift mechanism.
- `context/archive/2026-09-27-onboarding-profile/plan.md:415`: `parseProfileForm` boundary candidates — age 17/18/120,
  smoking years + years since quitting exceeding age, decimal comma.
- `context/archive/2026-10-05-auth-ui-redesign/plan.md:589-608` (Phase 8): password policy contract (12 chars, ASCII
  letter + digit, mirrors `letters_digits`; signup redirects with `weak_password`).
- `context/archive/2026-09-27-onboarding-profile/plan.md:92`: `authErrorCode` contract (pass through only translated
  Supabase codes; local codes `not_configured`, `missing_code`, `link_invalid`).
- `context/archive/2026-09-28-screening-catalog-v1/plan.md:485-491`: catalog test candidates — schema refinements,
  generator determinism across runs and input order, SQL escaping of `'` and `$$`, drift detection; drafter core:
  success, refusal, missing tool call, duplicate slug, invalid entry, status forced to `draft`.

## Related Research

- `context/archive/2026-10-05-unit-test-suite/research.md`
- `context/archive/2026-10-06-recurrence-unit-tests/research.md`
- `context/archive/2026-10-28-catalog-check-guards/` (F-17, source of `scripts/catalog/lib.test.ts`)

## Open Questions

1. **Catalog disk readers.** Include `loadEntries`/`listSnapshots`/`newestMigrationVersion` (temp-dir fixtures, no
   source change) and the Prettier-backed `renderJsonSchema`/`renderEntryFile`? Options: (a) pure functions only —
   `lib.ts` pure exports plus all of `draft-core.ts`; (b) (a) plus the three disk readers in a temp dir; (c) (b)
   plus the Prettier renderers. Recommended (a): F-19 names "pure modules" (`roadmap.md:117`), and
   `catalog:check` exercises the readers and renderers on every CI run
   (`context/archive/2026-10-05-unit-test-suite/plan.md`, "What We're NOT Doing"). (b) is cheap if the orchestrator
   wants the error branches of `loadEntries` (`lib.ts:82-124`) pinned.
2. **Password parity check.** Should `password.test.ts` read `supabase/config.toml` and assert
   `minimum_password_length` equals `PASSWORD_MIN_LENGTH` and `password_requirements` is `"letters_digits"`?
   Options: (a) yes, with `node:fs` and a line regex (precedent `rule-entry.test.ts:1,15`); (b) pin `12` only.
   Recommended (a): it turns the CLAUDE.md hard rule (two of its three sides) into a CI failure; the production
   dashboard side stays manual.

Settled without a question (recorded for the plan): no source change is needed for the clock (`src/lib` modules take
`now`/`currentYear`; the catalog schema clock is harmless with past fixture dates); `draft.ts` private helpers are left
out (moving them would be a source change); new files `password.test.ts`, `profile.test.ts`, `errors.test.ts`,
`auth-errors.test.ts`, `scripts/catalog/draft-core.test.ts`, and extensions of `format.test.ts`, `rules.test.ts`,
`scripts/catalog/lib.test.ts` (F-17 plan `:44`); ICU strings reuse the re-pin comment.
