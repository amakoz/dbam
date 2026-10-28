# Unit tests for the remaining pure modules (F-19) Implementation Plan

## Overview

Add colocated Vitest tests for the pure modules backlog B-11 lists (roadmap F-19, `context/foundation/roadmap.md:115-125`):
the password policy, profile-form parsing and pack-years, error-code mapping, the date and format helpers that are
tested only indirectly today, and the pure parts of the catalog scripts. Tests only: no production source changes.

## Current State Analysis

- The F-03 runner is ready: `vitest.config.ts` runs `src/**/*.test.ts` and `scripts/**/*.test.ts` in the `node`
  environment with tsconfig paths; CI uses Node 22 (`.nvmrc` 22.14.0). No config change is needed.
- `src/lib/password.ts`, `src/lib/profile.ts`, `src/lib/errors.ts` and `src/lib/auth-errors.ts` have no tests.
- `src/lib/screenings/format.test.ts` covers only `describeLastDone`. `rules.test.ts` reaches `isIsoDate` only
  through `parsePlanForm`. `screeningFormBounds`, `formatDay` and `formatMonth` have no direct tests.
- `scripts/catalog/lib.test.ts` covers the five F-17 functions. The other pure exports of `lib.ts` and all of
  `draft-core.ts` have no tests.
- No module in scope reads the clock in a way the tests can't control. `parseProfileForm` takes `currentYear`,
  `screeningFormBounds` takes `now` and `snapshotFileName` takes `now`. The catalog schema's `latestToday()`
  (`src/lib/catalog/schema.ts:39-41`) only rejects future `accessed` dates, and the fixtures use past ones
  (research.md, Summary).

## Desired End State

`npm test` runs new or extended test files covering every function named in the F-19 outcome, all green on Node 22,
with no change to any non-test file under `src/` or `scripts/`. If the password policy in `src/lib/password.ts` and
`supabase/config.toml` drift apart, a test fails in CI.

### Key Discoveries:

- Password policy: 12+ code points (`Array.from`), an ASCII letter and an ASCII digit (`src/lib/password.ts:6-17`).
  Its local Supabase twin is `supabase/config.toml:175,178`.
- `parseProfileForm` rules and probed outputs: research.md, "`src/lib/profile.ts`". `FormData` helper precedent:
  `src/lib/screenings/rules.test.ts:116-120`.
- `errorMessageKey` looks up `` `errors.${code}` `` (`src/lib/errors.ts:8`) through `isMessageKey`
  (`src/i18n/index.ts:29-31`), so any code without a translation falls back to `errors.unknown`. The `__proto__` and
  `constructor` cases are free-text fallbacks; they do not guard `Object.hasOwn` (plan review F4).
- Intl output probed on Node v22.16.0 / ICU 77.1: research.md, "`src/lib/screenings/format.ts`". Re-pin comment
  precedent: `src/lib/screenings/format.test.ts:7-8`.
- Catalog fixtures clone real entries (`scripts/catalog/lib.test.ts:20-26`). `renderSnapshotSql` output must not be
  pinned whole (F-17 froze its format, `context/archive/2026-10-28-catalog-check-guards/plan.md:40`).
- `draft-core.ts` imports the Anthropic SDK as types only (`scripts/catalog/draft-core.ts:1-5`), so fixtures are
  plain objects cast to the SDK types, with no network or key.

## What We're NOT Doing

- **No production source change.** No file outside `*.test.ts` under `src/` or `scripts/` changes. If a test exposes
  a bug, record it in `decisions.md` and as a backlog note, leave the test pinning current behaviour or skip that
  case, and stop for a decision (`roadmap.md:125`).
- **No tests for the catalog disk readers or Prettier renderers** (`loadEntries`, `listSnapshots`,
  `newestMigrationVersion`, `renderJsonSchema`, `renderEntryFile`). `catalog:check` covers them in CI (decisions.md,
  "Catalog scope"). `lib.test.ts` keeps using `loadEntries()` as its fixture source.
- **No tests for `scripts/catalog/draft.ts` helpers, `check.ts`, `migration.ts`, `schema.ts`.** These are CLI wiring,
  and testing the helpers would mean moving code (decisions.md, "Excluded `draft.ts` helpers").
- **No pins on incidental behaviour:** `isIsoDate("0000-01-01")`, `forbiddenSourceReason("a/../../x")`, the
  cross-namespace `errorMessageKey("auth.<code>")` lookup (decisions.md, "Incidental behaviour").
- **No tests that pin counts or whole generated text:** no full snapshot SQL, JSON schema, `toStrictToolSchema` of the
  real schema or `buildUserMessage` prompt; no real entry, factor or `errors.auth.*` key counts; no exact Zod
  messages.
- **No fix to the `formatDay` JSDoc example** (`format.ts:37` says "12 October 2026"; `en` outputs "October 12,
  2026"). That is a doc drift, out of scope for a tests-only change.
- **No Vitest config, CI, coverage, pre-commit, i18n or `roadmap.md` status change.** No shared test-helper module.

## Implementation Approach

Three phases, one commit each, one PR. Each phase adds or extends at most four test files and has its own green
gate. Tests follow the house style: `describe` per function, `it.each` tables with `$field` titles, `@/` imports,
expected values written as literals derived from the source rules and the research probes. Each phase ends with a
deliberate-break check: temporarily alter one source line, see the new tests fail, then revert. This proves the tests
assert behaviour rather than pass vacuously.

## Critical Implementation Details

- **ICU-dependent strings** (`formatDay`, `formatMonth`, `screeningFormBounds().months`): pin both `pl` and `en`,
  and reuse the re-probe/re-pin comment from `format.test.ts:7-8`. Assert month labels by spot values (first, the
  October/`październik` entry, last) plus length 12, not by a full 24-string fixture.
- **`warsawToday` cache** (`rules.ts:52-63`) is keyed by `now.getTime()`, so tests may call it in any order.
- **`renderSnapshotSql` assertions** use `toContain`, line regexes and `parseSnapshotSlugs` round-trips, never a
  golden copy.

## Phase 1: Form and error-code modules

### Overview

New test files for the password policy (with a `config.toml` parity check), profile-form parsing and pack-years, and
the two error-code mappers.

### Changes Required:

#### 1. Password policy

**File**: `src/lib/password.test.ts` (new)

**Intent**: Pin the sign-up policy and make drift from local Supabase Auth fail CI.

**Contract**:

- `passwordIssues` table: `""` → `["too_short", "needs_letter_and_digit"]` (order matters); 11 chars with a letter and
  a digit → `["too_short"]`; 12 chars → `[]` (inclusive boundary); letters only and digits only →
  `["needs_letter_and_digit"]`; upper case counts as a letter; Polish letters only plus a digit
  (`"ąęśćżźółńąęś1"`) → `["needs_letter_and_digit"]`; 5 emoji + `"abcde1"` (11 code points, 16 UTF-16 units) →
  `["too_short"]`; 11 emoji + `"a1"` → `[]`.
- Parity: read `supabase/config.toml` (repo root via `path.resolve(import.meta.dirname, "../..")`, as
  `scripts/catalog/lib.ts:20` does) and match `^minimum_password_length\s*=\s*(\d+)\s*$` and
  `^password_requirements\s*=\s*"([^"]+)"` with the `m` flag. Expect `Number(match) === PASSWORD_MIN_LENGTH` and
  `"letters_digits"`. A missing line fails the test. The test comment names the third side, the production
  dashboard, which stays manual (CLAUDE.md hard rule).

#### 2. Profile form

**File**: `src/lib/profile.test.ts` (new)

**Intent**: Pin the onboarding/profile validation that `POST /api/profile` relies on, at the boundaries the
onboarding plan listed (`context/archive/2026-09-27-onboarding-profile/plan.md:415`).

**Contract** (`currentYear = 2026`, a local `form(fields)` helper like `rules.test.ts:116-120`):

- `packYears`: `(0.1, 3)` → `0.3`; `(1.33, 3)` → `3.99`; `(0.5, 20)` → `10`.
- Birth year: blank → `birthYearRequired`; `"abc"`, `1905` (age 121) and `2027` → `birthYearInvalid`; `2009` (17) →
  `birthYearTooYoung`; `2008` (18) and `1906` (120) accepted; `" 1980 "` trimmed.
- Sex and status: missing or unknown → `sexRequired` / `smokingStatusRequired`.
- `never` drops submitted smoking fields to `null`; `current` keeps `years_since_quitting: null`.
- Packs per day: `"0,5"` → `0.5`; `"0,555"` → `0.56`; `"10"` accepted; `"0"`, `"10.01"`, `"abc"` →
  `packsPerDayInvalid`.
- Smoking years: `"0"` → invalid; above the age → invalid; with an invalid birth year, `"100"` accepted against the
  column limit and `"101"` → invalid (the field error, alongside the birth-year error).
- `former` (born 1980, age 46): years since quitting blank → `yearsSinceQuittingInvalid`; `"0"` accepted; 30 + 16
  accepted (equal to age); 30 + 17 → `smoking_years: "profile.errors.smokingLongerThanAge"`.
- Errors accumulate: one submission with several bad fields returns every field error at once (`toEqual` on the
  whole `errors` object).
- A success case asserts the whole `{ ok: true, value }` object.

#### 3. Error-code mapping

**Files**: `src/lib/errors.test.ts` (new), `src/lib/auth-errors.test.ts` (new)

**Intent**: Pin "a translated code or the generic message, never raw text" for both mappers.

**Contract**:

- `errorMessageKey`: a known code (`"invalid_request"`) → `"errors.invalid_request"`. Free-text fallbacks: an unknown
  code, free text with spaces, `""`, `"__proto__"` and `"constructor"` → `"errors.unknown"`.
- `authErrorCode`: `{ code: "invalid_credentials" }` → the same code; `{ code: "not_configured" }` (a local code) → the
  same code; `{}`, `{ code: "" }` and an untranslated Supabase code (`"bad_jwt"`) → `"unknown"`.
- `authErrorMessageKey`: `"invalid_credentials"` → `"errors.auth.invalid_credentials"`; `"unknown"` and free text →
  `"errors.unknown"`.
- Use named keys only; never count keys.

### Success Criteria:

#### Automated Verification:

- New tests pass: `npx vitest run src/lib/password.test.ts src/lib/profile.test.ts src/lib/errors.test.ts src/lib/auth-errors.test.ts`
- Full unit suite passes: `npm test`
- Lint passes: `npm run lint`
- Deliberate break: setting `PASSWORD_MIN_LENGTH` to 11 fails the boundary and parity tests; changing `MIN_AGE` to 17 fails the age cases; both reverted
- No non-test source change: `git diff --name-only origin/main -- src scripts | grep -v '\.test\.ts$'` prints nothing

**Implementation Note**: After this phase is green, commit it and continue to Phase 2 in the same run (chained
stages); there is no manual verification.

---

## Phase 2: Screening date and format helpers

### Overview

Direct tests for `isIsoDate`, `screeningFormBounds`, `formatDay` and `formatMonth`, which the recurrence change left
out (`context/archive/2026-10-06-recurrence-unit-tests/decisions.md`, "Test scope").

### Changes Required:

#### 1. `isIsoDate`

**File**: `src/lib/screenings/rules.test.ts` (extend)

**Intent**: Pin the calendar-date check that guards appointment dates.

**Contract**: a `describe("isIsoDate")` table: `2026-12-31`, `2028-02-29` → true; `2026-02-29`, `2026-02-30`,
`2026-04-31`, `2026-13-01`, `2026-00-10`, `2026-01-00`, `2026-1-01`, `" 2026-01-01"`, `"2026-01-01T00:00"`, `""` →
false.

#### 2. Form bounds and date wording

**File**: `src/lib/screenings/format.test.ts` (extend)

**Intent**: Pin the Plan/Done form limits and the date strings shown on the dashboard and in reminder emails
(`src/lib/reminders/appointment.ts:56`).

**Contract**:

- `screeningFormBounds`:
  - `now = 2026-10-06T10:00:00Z`, birth year 1980: `minDate` `2026-10-06`, `maxDate` `2028-10-06`, `years` from
    2026 down to 1980 (first, last, length 47).
  - Warsaw new year: `now = 2026-12-31T23:30:00Z` gives `minDate` `2027-01-01`, `maxDate` `2029-01-01` and
    `years[0]` 2027.
  - Leap day: `now = 2028-02-29T10:00:00Z` gives `maxDate` `2030-03-01`.
  - A birth year after the current year gives `years` `[]`.
  - `months`: 12 entries with values 1–12; spot labels pl `styczeń`, `październik`, `grudzień` and en `January`,
    `October`, `December`.
- `formatDay`: `2026-10-12` → pl `12 października 2026`, en `October 12, 2026`; `2028-02-29` → pl `29 lutego 2028`.
  `2026-01-01` → en `January 1, 2026` (UTC formatting, no shift). This case guards only in a time zone west of UTC,
  so the Phase 2 deliberate break runs it under `TZ=America/New_York` (plan review F5).
- `formatMonth`: `2026-10-01` → pl `październik 2026`, en `October 2026`.
- The file's existing re-probe/re-pin comment covers the new strings; extend it if it names `describeLastDone` only.

### Success Criteria:

#### Automated Verification:

- Extended tests pass: `npx vitest run src/lib/screenings/rules.test.ts src/lib/screenings/format.test.ts`
- Full unit suite passes: `npm test`
- Lint passes: `npm run lint`
- Deliberate break: dropping the round-trip check in `isIsoDate` fails the `2026-02-30` case; deleting the `timeZone` option in `formatDay` makes `TZ=America/New_York npx vitest run src/lib/screenings/format.test.ts` fail; both reverted
- No non-test source change: `git diff --name-only origin/main -- src scripts | grep -v '\.test\.ts$'` prints nothing

**Implementation Note**: Commit and continue to Phase 3.

---

## Phase 3: Catalog script pure functions

### Overview

Extend `scripts/catalog/lib.test.ts` with the uncovered pure `lib.ts` exports and add `draft-core.test.ts` for the
drafter core. This covers the catalog-v1 candidates (`context/archive/2026-09-28-screening-catalog-v1/plan.md:485-491`):
determinism, SQL escaping, deleted-slug detection, refusal, missing tool call, duplicate slug, invalid entry, status
forced to `draft`.

### Changes Required:

#### 1. Generator and checker helpers

**File**: `scripts/catalog/lib.test.ts` (extend; reuse `entry()`, `snapshot()` and `BASE_A`/`BASE_B`)

**Intent**: Pin the generator's escaping and determinism and the deleted-slug guard without freezing the full SQL.

**Contract**:

- `displayPath(path.join(REPO_ROOT, "catalog", "x.json"))` → `"catalog/x.json"`; `entryFilePath("x")` →
  `path.join(ENTRIES_DIR, "x.json")`.
- `formatIssuePath`: `[]` → `"(entry)"`; `["eligibility", 0, "requires", 1, "factor"]` →
  `"eligibility[0].requires[1].factor"`; `[0, "slug"]` → `"[0].slug"`.
- `validateEntry`: a real entry with its own slug → `{ ok: true }`; the same entry with another file slug → exactly the
  problem `label: slug: "<slug>" does not match the file name (expected "<other>")`; `{}` → `ok: false`, with every
  problem starting `label: ` (Zod text not pinned).
- `renderSnapshotSql`:
  - `[]` throws.
  - A text value `O'Brien \ $$` renders as `'O''Brien \ $$'`.
  - A NUL in a text value throws (hand-built cast entry).
  - A non-integer number column throws `expected an integer`.
  - jsonb columns render with `::jsonb`.
  - Output starts with the `SNAPSHOT_HEADER` lines.
  - Input order `[B, A]` and `[A, B]` give byte-identical output.
  - The `do update set` list has no `slug = excluded.slug` line.
- `parseSnapshotSlugs`: SQL without a manifest → `null`; a rendered snapshot → its slugs sorted. Injection: render a
  snapshot whose entry text contains `\n-- catalog-slug: injected` and assert `toEqual` on the full sorted list of the
  real slugs. Any extra slug fails, whatever its spelling, since the manifest is read before `insert into` only (plan
  review F2).
- `findDeletedSlugs`: all slugs present → `[]`; a slug missing from the files and shipped by two snapshots → exactly
  one message naming `catalog/entries/<slug>.json` and the first snapshot; a snapshot body without a manifest → its
  `no "-- catalog-slug:" manifest` message.
- `snapshotFileName(new Date("2026-01-02T03:04:05.678Z"))` → `"20260102030405_screening_catalog_snapshot.sql"`.

#### 2. Drafter core

**File**: `scripts/catalog/draft-core.test.ts` (new)

**Intent**: Pin the pure half of `catalog:draft`: tool schema shaping, prompt assembly, response parsing, write
planning and output sanitising.

**Contract** (fixtures are plain objects cast to the SDK types; synthetic inputs, never real `FACTORS` counts):

- `toStrictToolSchema`:
  - Drops `pattern`, `minLength` and `$schema`; keeps `format: "date"` and drops another format.
  - Sets `additionalProperties: false` on objects, also on a node with `properties` but no `type`.
  - Recurses into `items` and `anyOf`.
  - Throws on a non-object node.
  - A walk over `toStrictToolSchema(z.toJSONSchema(CatalogEntrySchema))` finds no `pattern` and no object without
    `additionalProperties: false`.
- `buildSubmitToolInputSchema`: top-level `type: "object"`, `required: ["entries"]`, `additionalProperties: false`;
  the entries `items` equal `toStrictToolSchema(input)`.
- `renderTemplate`:
  - A repeated placeholder is filled everywhere.
  - A missing value throws `no value for {{Y}}`; an unused value throws `no placeholder for Z`.
  - `{{lower}}` and `{{toString}}` are left as is: the placeholder pattern is upper case only (`draft-core.ts:134`).
  - A value keyed `toString` (`renderTemplate("x", { toString: "y" })`) throws `no placeholder for toString` (plan
    review F1).
- `renderFactorVocabulary` (two synthetic factors): an enum factor's row lists its values, and the collected flag
  reads `yes`/`no`.
- `renderExistingEntries`: `[]` → `"(none yet)"`; a slug-only entry and a named entry with status, each one line.
- `buildUserMessage`: `maxEntries` 1 → `1 entry`, 2 → `2 entries`; `<source_document` present only with a source,
  with its label in `path="…"`; assert lines, not the whole text.
- `extractSubmittedEntries`:
  - Refusal with `stop_details: null` → null category and explanation.
  - `max_tokens` and `pause_turn` stop reasons.
  - Text-only `end_turn` → `no_tool_call` with the trimmed text.
  - A tool call with another name is ignored.
  - Two `submit_entries` calls → concatenated entries, `calls: 2`.
  - An extra input key → `schema_errors` starting `submit_entries call 1:`.
  - A `tool_use` before the last fallback block is ignored.
- `planWrites`:
  - A valid `active` entry is planned as `draft` with `DRAFT_FIELDS` applied.
  - A non-object → invalid with `slug: null`.
  - An existing slug → `skipExisting`.
  - The same slug twice → the second is invalid, `was already submitted earlier in this run`.
  - An invalid entry keeps its `index`.
- `continuationContent`:
  - Without a fallback → an equal copy, not the same array.
  - With one → `thinking`, `redacted_thinking` and `tool_use` before the boundary dropped, and blocks after it kept.
  - Before the boundary, a `server_tool_use` answered by a block with its `tool_use_id` (a `web_search_tool_result`)
    is kept, and one without an answer is dropped (`draft-core.ts:349-357`, plan review F3).
- `fallbackHops`: two fallback blocks → two `{ from, to }` hops.
- `sumUsage`: `[]` → zeros with `requests: 0`; null cache and server-tool fields count as 0.
- `terminalSafe`: ESC, `\r`, DEL and a C1 character removed; `\t`, `\n`, `zażółć` and an emoji kept.
- `forbiddenSourceReason`: `""`, `"../x"`, `"/etc/x"`, `"C:x"`, `"\\x"` → `"must be a file inside the repository"`;
  `"a/.env.local"`, `"a\\.dev.vars"` → the env-file message; `"docs/x.md"` → `null`.

Exact expected strings and shapes come from the cited source lines in research.md ("`draft-core.ts`"). Where a
case's exact output isn't settled there, the implementer reads the source line and pins what it does.

### Success Criteria:

#### Automated Verification:

- Catalog tests pass: `npx vitest run scripts/catalog`
- Full unit suite passes: `npm test`
- Lint passes: `npm run lint`
- Catalog guard still passes: `npm run catalog:check`
- Deliberate break: removing the `'` doubling in `quote` (`scripts/catalog/lib.ts:152`) fails the escaping case; dropping the `DRAFT_FIELDS` spread in `planWrites` fails the draft-status case; both reverted
- No non-test source change: `git diff --name-only origin/main -- src scripts | grep -v '\.test\.ts$'` prints nothing

---

## Testing Strategy

### Unit Tests:

- Phase 1: password policy and its `config.toml` parity; profile-form boundaries, decimal comma, accumulation;
  error-code fallbacks including inherited property names.
- Phase 2: calendar validity, Warsaw-midnight and leap-day form bounds, pl/en date strings.
- Phase 3: SQL escaping and determinism, manifest parsing, deleted-slug guard, drafter response parsing and write
  planning, terminal sanitising, source-path refusal.

### Integration Tests:

- None added. `npm run catalog:check` (Phase 3 gate) still covers the generator against the committed snapshots.

### Manual Testing Steps:

1. None. Every criterion is a command; the deliberate-break checks stand in for a human look at the tests.

## Performance Considerations

None: pure, in-memory tests. The `config.toml` read and `loadEntries()` fixture read are single small file reads.

## Migration Notes

Not applicable: no schema, data or runtime change.

## References

- Research: `context/changes/pure-module-tests/research.md`
- Decisions: `context/changes/pure-module-tests/decisions.md`
- Prior test changes: `context/archive/2026-10-05-unit-test-suite/plan.md`,
  `context/archive/2026-10-06-recurrence-unit-tests/plan.md`, `context/archive/2026-10-28-catalog-check-guards/plan.md`
- Test style precedent: `src/lib/screenings/rules.test.ts:116-177`, `scripts/catalog/lib.test.ts:1-40`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Form and error-code modules

#### Automated

- [x] 1.1 New tests pass: `npx vitest run src/lib/password.test.ts src/lib/profile.test.ts src/lib/errors.test.ts src/lib/auth-errors.test.ts`
- [x] 1.2 Full unit suite passes: `npm test`
- [x] 1.3 Lint passes: `npm run lint`
- [x] 1.4 Deliberate break: setting `PASSWORD_MIN_LENGTH` to 11 fails the boundary and parity tests; changing `MIN_AGE` to 17 fails the age cases; both reverted
- [x] 1.5 No non-test source change: `git diff --name-only origin/main -- src scripts | grep -v '\.test\.ts$'` prints nothing

### Phase 2: Screening date and format helpers

#### Automated

- [ ] 2.1 Extended tests pass: `npx vitest run src/lib/screenings/rules.test.ts src/lib/screenings/format.test.ts`
- [ ] 2.2 Full unit suite passes: `npm test`
- [ ] 2.3 Lint passes: `npm run lint`
- [ ] 2.4 Deliberate break: dropping the round-trip check in `isIsoDate` fails the `2026-02-30` case; deleting the `timeZone` option in `formatDay` makes `TZ=America/New_York npx vitest run src/lib/screenings/format.test.ts` fail; both reverted
- [ ] 2.5 No non-test source change: `git diff --name-only origin/main -- src scripts | grep -v '\.test\.ts$'` prints nothing

### Phase 3: Catalog script pure functions

#### Automated

- [ ] 3.1 Catalog tests pass: `npx vitest run scripts/catalog`
- [ ] 3.2 Full unit suite passes: `npm test`
- [ ] 3.3 Lint passes: `npm run lint`
- [ ] 3.4 Catalog guard still passes: `npm run catalog:check`
- [ ] 3.5 Deliberate break: removing the `'` doubling in `quote` (`scripts/catalog/lib.ts:152`) fails the escaping case; dropping the `DRAFT_FIELDS` spread in `planWrites` fails the draft-status case; both reverted
- [ ] 3.6 No non-test source change: `git diff --name-only origin/main -- src scripts | grep -v '\.test\.ts$'` prints nothing
