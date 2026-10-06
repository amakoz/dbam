# Recurrence Unit Tests (F-08) Implementation Plan

## Overview

Add Vitest unit tests for the screening date and recurrence rules in `src/lib/screenings/rules.ts` and for `describeLastDone` in `src/lib/screenings/format.ts`. S-03 and S-05 shipped these rules without tests, and S-06 (the due-screening reminder) will read the due dates they compute. The tests pin today's behaviour first. This is roadmap F-08 (`context/foundation/roadmap.md:187-199`).

## Current State Analysis

- F-03 (#77) added the runner, which needs no change:
  - `vitest.config.ts:3-9` sets `environment: "node"`, `include: ["src/**/*.test.ts"]` and `resolve.tsconfigPaths: true`.
  - `npm test` is `vitest run` (`package.json:13`) and runs in CI's `ci` job.
- `src/lib/screenings/` holds `format.ts`, `read.ts` and `rules.ts`, and no test files.
- Both modules are pure and take "now", `t` and `locale` as parameters (`rules.ts:14-16`, `format.ts:51-55`).
  - The only runtime import in `rules.ts` is `resolveInterval` (`rules.ts:2-9`), and it needs no mocks.
- I probed the real functions at commit f8c527d (research.md, "Functions under test"). All 8 source cases (`context/archive/2026-09-30-record-appointment-date/plan.md:430-439`) behave as specified, as do the two cases S-05 added: ready-to-confirm and plan sort order. No probe exposed a bug.

## Desired End State

- `src/lib/screenings/rules.test.ts` and `src/lib/screenings/format.test.ts` exist, pass under `npm test` locally and in CI, and cover the agreed scope (decisions.md, "Test scope").
- Each test fails when the rule it pins is changed. Phase 1's mutation spot-check verifies this for the two most delicate comparisons.
- `CLAUDE.md` and `README.md` no longer describe the unit tests as covering only catalog rules.

### Key Discoveries:

- **Real signatures differ from the archived S-03 plan, so the tests follow the code:**
  - `nextDueMonth(completion, interval)` takes 2 arguments (`rules.ts:172-177`).
  - `partitionDashboard(recommendations, plans, completions, entries, profile, now)` takes 6 (`rules.ts:219-226`).
- **What `partitionDashboard` reads:**
  - `recommendations.tiers[n][].entry.slug`, `recommendations.maybe[].entry.slug` and `recommendations.age` (`rules.ts:232,264,276,282`).
  - The interval comes from `resolveInterval(entry, profile, recommendations.age)` (`rules.ts:264`).
- **Due-again is a strict comparison:** a record stays in Done only while `nextDue > currentMonth` (`rules.ts:265`). An exam whose next due month equals the current month is already due.
- **`awaitingConfirmation`** is `date !== null && date <= today` (`rules.ts:244`).
- **Plan sort order** (`rules.ts:247-256`): dated plans ascending, undated plans last, with `created_at` ascending breaking ties.
- **Fixture convention (F-03):** typed inline factories in each test file. No `CatalogEntrySchema` parse and no `catalog/entries/*.json` (`context/archive/2026-10-05-unit-test-suite/decisions.md:46-52`).
  - The `profile()` and `entry()` factories at `src/lib/catalog/recommend.test.ts:10-67` are file-local.
  - `resolveInterval` overrides look like `{ when: { age_min: 40 }, months: 24 }` (`recommend.test.ts:167-171`).
- **Wording convention:** call the real `createT(locale)` and pin full sentences in a `Record<Locale, string>`, asserted in both locales (`src/lib/catalog/wording.test.ts:3,11,58-62`). The re-probe/re-pin comment is at `wording.test.ts:8-9`.
- **Polish date case** (probed on Node 22.16.0):
  - `formatDay` gives the genitive, "5 marca 2026".
  - `formatMonth` gives the nominative, "marzec 2026" (`format.ts:38-45`).
- **Sort-test lesson:** F-03's impl-review F3 (`context/archive/2026-10-05-unit-test-suite/impl-review.md:89`) found a sort test that passed on input order. The sort fixtures here must arrive out of order.

## What We're NOT Doing

- **No direct tests for `isIsoDate`, `screeningFormBounds`, `formatDay` or `formatMonth`** (decisions.md, "Test scope"). `isIsoDate` is exercised indirectly through `parsePlanForm`, and `formatDay`/`formatMonth` through `describeLastDone`.
- **No change to production code** in `src/lib/screenings/`, `src/lib/catalog/` or elsewhere. If a test exposes a bug, record it in decisions.md and stop for a decision; do not fix it here. This is the F-03 precedent at `context/archive/2026-10-05-unit-test-suite/plan.md:55`.
- **No edit to `context/foundation/prd.md`.** The PRD testing-line wording (`prd.md:142` names only catalog rules) goes into the PR description as a note for the owner (decisions.md, "PRD testing NFR wording").
- **No new ICU-drift mechanism:** no Node pin change and no snapshot tooling. The tests reuse the re-probe/re-pin comment (decisions.md, "ICU drift").
- **No shared test-helper module, and no refactor of the factories in `recommend.test.ts`.**
- **No change to the Vitest config, CI, coverage or pre-commit hooks.**
- **No tests for `read.ts`** (database I/O), the Astro components or `src/lib/reminders/`.

## Implementation Approach

The work is two colocated test files, following F-03's conventions:

- explicit `import { describe, expect, it } from "vitest"` and `import type` for types;
- a `describe` per function, with `it.each` tables for boundaries;
- fixed `Date` literals for "now" (no fake timers);
- small typed factories local to the file.

Phase 1 pins the rules. Phase 2 pins the locale-dependent wording, which is the part exposed to ICU drift, then updates the two stale doc lines. All expected values below come from the research probe (research.md). If a value disagrees when run, re-check the probe before suspecting the code.

## Phase 1: Rules tests

### Overview

Pin the Warsaw calendar helpers, the date arithmetic, the two form parsers, the due-again rules and `partitionDashboard` in one new test file.

### Changes Required:

#### 1. Rules test file

**File**: `src/lib/screenings/rules.test.ts` (new)

**Intent**: Cover every function and case in the agreed scope, with the expected values listed below, so a change to any of these rules fails a named test.

**Contract**: Imports come from `@/lib/screenings/rules`, with `CatalogEntry`, `Profile` and `Recommendations` as types.

The file has five local factories:

- `entry(overrides)`: a full typed `CatalogEntry`, copied in shape from `recommend.test.ts:35-67`. Default: fixed, 24 months, no overrides.
- `profile()`: a full typed `Profile`.
- `plan(slug, appointment_date, created_at?)`: a `ScreeningPlan`.
- `done(slug, last_done_month, updated_at?)`: a `ScreeningCompletion` with `last_done_on: null`.
- `recs(tier1Entries, { maybe?, age? })`: a `Recommendations`. Each tier item is `{ entry, tier: 1, matchedBranch: entry.eligibility[0], interval }`.

Cases, grouped by `describe`:

- `warsawToday` / `warsawMonth`:
  - `2026-09-30T21:59:59Z` → `2026-09-30`; `22:00:00Z` → `2026-10-01` (CEST midnight). `23:30:00Z` → `2026-10-01` is the source case.
  - `2026-12-31T22:59:59Z` → `2026-12-31`; `23:00:00Z` → `2027-01-01` (CET midnight). `warsawMonth` of the latter is `2027-01-01`.
  - The first Warsaw midnight after each DST switch uses the new offset:
    - Spring (now CEST): `2026-03-29T21:59:59Z` → `2026-03-29`; `22:00:00Z` → `2026-03-30`.
    - Autumn (now CET): `2026-10-25T22:59:59Z` → `2026-10-25`; `23:00:00Z` → `2026-10-26`.

    A timestamp inside the switch hour cannot fail under a fixed offset or plain UTC, so it is not used (plan-review F2).
- `addYears`: `2024-02-29` +2 → `2026-03-01`; +4 → `2028-02-29`.
- `addMonths`:
  - `2024-03-01` +24 → `2026-03-01`.
  - `2026-11-15` +2 → `2027-01-01` (the day is ignored and the year rolls over).
  - `2026-01-01` −1 → `2025-12-01`.
- `parsePlanForm`, with today `2026-10-06` and slug `mammography`:
  - `2026-10-05` → `errors.invalid_appointment_date`.
  - `2026-10-06` and `2028-10-06` are accepted.
  - `2028-10-07` → `errors.invalid_appointment_date`.
  - A blank date → `appointment_date: null`.
  - `" 2026-10-07 "` is trimmed and accepted.
  - `2026-02-30` and `2026-13-01` → `errors.invalid_appointment_date`.
  - A slug `Mammo!` or a missing slug → `errors.invalid_request`.
  - With today `2024-02-29`, `2026-03-01` is accepted and `2026-03-02` is rejected (the Feb 29 upper bound).
- `parseDoneForm`, with current month `2026-10-01` and birth year 1970:
  - Both blank → `last_done_month: null`.
  - `3`/blank and blank/`2024` → `errors.invalid_done_date` (half-filled).
  - `3`/`2024` and `03`/`2024` → `2024-03-01`.
  - Months `0`, `13` and `123`, and year `24` → invalid.
  - `10`/`2026` is accepted; `11`/`2026` is rejected (current month inclusive).
  - `1`/`1970` is accepted; `12`/`1969` is rejected (January of the birth year inclusive).
  - A bad slug → `errors.invalid_request`.
- `anchorMonth`:
  - `last_done_month: null` with `updated_at 2026-09-30T23:30:00+00:00` → `2026-10-01`: a blank done date anchors on the Warsaw month, not the UTC month.
  - A set `last_done_month` wins over `updated_at`.
- `nextDueMonth`:
  - `2024-03-01` with `{ kind: "months", months: 24 }` → `2026-03-01`.
  - A blank month with the late-UTC `updated_at` above and 12 months → `2027-10-01`.
  - Each of `no_known_interval`, `shared_decision` and `per_program` → `null`.
- `partitionDashboard`, with now `2026-10-06T10:00:00Z` (Warsaw month `2026-10-01`) unless stated:
  - **Precedence:** a plan beats a completion. The slug is in tier 1 of the recommendations and has a plan and a not-yet-due completion (`2025-10-01` + 24 months). It appears in `plans` only, absent from `done`, the tiers and `lastDone`.

    The completion must not be due yet. Otherwise deleting the `planned.has(...)` skip at `rules.ts:263` changes nothing: the record lands in `dueAgain`, and `hidden` still filters the slug through `planned` (plan-review F1). With a not-yet-due record, that deletion puts the slug in `done`, and deleting `...planned` from `hidden` at `rules.ts:271` leaves it in the tier, so either mutation fails the test.

  - **Not yet due:** a not-yet-due completion (`2025-10-01` + 24 months) is in `done` with `nextDue 2027-10-01`, and hidden from its tier and from `maybe`.
  - **Due-again boundary:** a completion with `2024-10-01` + 24 months (`nextDue == currentMonth`) leaves `done`, stays in its tier and is in `lastDone`.
  - **Source case across Warsaw midnight:** `2024-03-01` + 24 months is still in `done` at now `2026-02-28T22:59:59Z` and due again at `2026-02-28T23:00:00Z` (Warsaw 1 March).
  - **No interval:** a `no_known_interval` completion from `2000-01-01` stays in `done` with `nextDue null` and never appears in the tiers.
  - **`awaitingConfirmation`:** true for an appointment yesterday and for one today; false for tomorrow and for an undated plan. The today case also runs at now `2026-10-05T22:30:00Z` (Warsaw 6 October), so it pins the Warsaw "today".
  - **Plan sort:** plans fed out of order (undated, later date, earlier date, undated older, and two same-date plans with different `created_at`) come back as: dated ascending, same-date by `created_at`, then undated oldest first.
  - **Missing entry:** a plan or completion whose slug is missing from `entries` is skipped. The completion does not hide its tier item.
  - **Interval by age:** one fixed entry (36 months, override `{ when: { age_min: 40 }, months: 12 }`) and a completion from `2025-09-01`. With `recs(..., { age: 45 })` it is due again, in its tier with `lastDone`. With `age: 35` it stays in `done` with `nextDue 2028-09-01`. Only `recommendations.age` differs; the profile is the same.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint passes on the new file: `npm run lint`
- Type check passes: `npx astro check`
- Mutation spot-check:
  - Changing `nextDue > currentMonth` to `>=` at `rules.ts:265` fails at least one test.
  - Changing `date <= today` to `<` at `rules.ts:244` fails at least one test.
  - Deleting `planned.has(completion.catalog_slug)` at `rules.ts:263` fails at least one test (plan-review F1; Progress 1.4 keeps its title).
  - All three edits are reverted, and `git diff src/lib/screenings/rules.ts` is empty.

#### Manual Verification:

- A reviewer checks that each `describe`/`it` name maps to an item in the agreed scope (decisions.md, "Test scope") and that no production file changed.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Wording tests and docs

### Overview

Pin `describeLastDone` in pl and en, then update the two doc lines that describe the unit tests as covering only catalog rules.

### Changes Required:

#### 1. Format test file

**File**: `src/lib/screenings/format.test.ts` (new)

**Intent**: Pin the full user-facing sentence of each `describeLastDone` branch in both locales, so a template, formatter or anchor change shows up as a failing string.

**Contract**: The file:

- calls the real `createT(locale)` from `@/i18n`;
- uses a `Record<Locale, string>` expected table and `it.each`;
- loops over `["pl", "en"]`, the same pattern as `wording.test.ts:11,58-62`;
- carries the re-probe/re-pin comment copied in substance from `wording.test.ts:8-9`, naming Intl date formatting and the Europe/Warsaw time zone.

Inputs are plain `Pick<ScreeningCompletion, "last_done_month" | "last_done_on" | "updated_at">` objects. Expected strings (probed on Node 22.16.0):

| Branch       | Input                                                         | pl                                     | en                          |
| ------------ | ------------------------------------------------------------- | -------------------------------------- | --------------------------- |
| `lastDoneOn` | `last_done_on 2026-03-05`, `last_done_month 2026-03-01`       | `Ostatnio wykonane: 5 marca 2026`      | `Last done: March 5, 2026`  |
| `lastDone`   | `last_done_month 2026-03-01`, `last_done_on null`             | `Ostatnio wykonane: marzec 2026`       | `Last done: March 2026`     |
| `markedIn`   | both null, `updated_at 2026-02-28T23:30:00Z` (Warsaw 1 March) | `Oznaczone jako wykonane: marzec 2026` | `Marked done in March 2026` |

#### 2. Contributor docs

**File**: `CLAUDE.md`

**Intent**: Stop the Testing Guidelines from saying the unit tests cover only the catalog. Ask for a case when the screening date or recurrence rules change.

**Contract**: Edit the Testing Guidelines paragraph (`CLAUDE.md:53`):

- The "(today: …)" parenthesis also names the screening date and recurrence rules and `describeLastDone` in `src/lib/screenings/`.
- The "Add a case when you change …" sentence also covers those rules.
- The re-probe/re-pin sentence stays as it is.

**File**: `README.md`

**Intent**: Keep the smoke-test note accurate about what the unit tests cover.

**Contract**: In the note at `README.md:297`, "the catalog rules are covered by the Vitest unit tests" becomes the catalog and screening recurrence rules. No other README section changes.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including both new files: `npm test`
- Lint and formatting pass: `npm run lint && npx prettier --check CLAUDE.md README.md`
- Type check passes: `npx astro check`

#### Manual Verification:

- After the PR is open, the CI `ci` job log shows `rules.test.ts` and `format.test.ts` running and passing.
- The PR description includes the note for the owner that `prd.md:142` (testing NFR) names only the catalog rules while F-08 cites it.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `rules.test.ts`:
  - Warsaw midnight edges in CEST and CET, and the first midnight after each DST switch.
  - Feb 29 in `addYears` and in the plan-date upper bound.
  - Inclusive bounds of both forms; half-filled done dates.
  - The blank-date anchor on the Warsaw month of `updated_at`.
  - The due-again boundary at `nextDue == currentMonth`, including across Warsaw midnight.
  - Plan-over-completion precedence; no-interval completions; `awaitingConfirmation` on and before the day.
  - Plan sort with out-of-order input; missing entries; interval resolution by `recommendations.age`.
- `format.test.ts`: the three `describeLastDone` branches in pl and en.

### Integration Tests:

- None added. pgTAP and `npm run smoke` already cover the database rules and HTTP flows, and stay unchanged.

### Manual Testing Steps:

1. Read the test names against decisions.md, "Test scope".
2. Confirm that `git diff main --stat` lists only the two new test files, `CLAUDE.md`, `README.md` and the change folder.
3. After the PR opens, check that the CI `ci` job ran the new files.

## Performance Considerations

Negligible. The tests are pure and in-memory, and add well under a second to `npm test`.

## Migration Notes

Not applicable: no schema, data or runtime change.

## References

- Research: `context/changes/recurrence-unit-tests/research.md`
- Decisions: `context/changes/recurrence-unit-tests/decisions.md`
- Source cases: `context/archive/2026-09-30-record-appointment-date/plan.md:430-439` and `context/archive/2026-10-05-unit-test-suite/follow-ups/recurrence-tests.md`
- S-05 deferral: `context/archive/2026-10-05-confirm-exam-and-recurrence/plan.md:174,333`
- Test patterns: `src/lib/catalog/recommend.test.ts:10-67,166-188`, `src/lib/catalog/wording.test.ts:8-11,58-62`
- Roadmap: `context/foundation/roadmap.md:187-199`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Rules tests

#### Automated

- [x] 1.1 Unit tests pass: `npm test` — 427f0ed
- [x] 1.2 Lint passes on the new file: `npm run lint` — 427f0ed
- [x] 1.3 Type check passes: `npx astro check` — 427f0ed
- [x] 1.4 Mutation spot-check: flipping `>` at `rules.ts:265` and `<=` at `rules.ts:244` each fails a test; both reverted — 427f0ed

#### Manual

- [x] 1.5 Test names map to the agreed scope and no production file changed — 427f0ed (independently confirmed by impl-review.md F3)

### Phase 2: Wording tests and docs

#### Automated

- [x] 2.1 Unit tests pass, including both new files: `npm test` — a242d88
- [x] 2.2 Lint and formatting pass: `npm run lint && npx prettier --check CLAUDE.md README.md` — a242d88
- [x] 2.3 Type check passes: `npx astro check` — a242d88

#### Manual

- [ ] 2.4 CI `ci` job log shows `rules.test.ts` and `format.test.ts` running and passing
- [ ] 2.5 PR description carries the PRD testing-line note for the owner
