---
date: 2026-10-06T05:45:54Z
researcher: Claude (Opus 5.5) for Amadeusz Kozlowski
git_commit: f8c527d4b9c3497598b03bcd8e336bd095b89b27
branch: feat/recurrence-unit-tests
repository: amakoz/dbam
topic: "What must F-08 unit tests cover in src/lib/screenings/rules.ts and format.ts, and how do they fit the F-03 runner?"
tags: [research, codebase, screenings, recurrence, vitest, i18n, warsaw-time]
status: complete
last_updated: 2026-10-06
last_updated_by: Claude (Opus 5.5)
---

# Research: Recurrence unit tests (F-08)

**Date**: 2026-10-06T05:45:54Z
**Researcher**: Claude (Opus 5.5) for Amadeusz Kozlowski
**Git Commit**: f8c527d4b9c3497598b03bcd8e336bd095b89b27
**Branch**: feat/recurrence-unit-tests
**Repository**: amakoz/dbam

## Research Question

Roadmap F-08 asks for unit tests of the recurrence rules in `src/lib/screenings/rules.ts` (`nextDueMonth`, `addMonths`/`addYears`, `partitionDashboard`, Warsaw midnight, Feb 29) and of `describeLastDone` in `src/lib/screenings/format.ts` (`context/foundation/roadmap.md:188`). This research answers four questions:

- What behaviour do these tests have to pin?
- What inputs do the functions take?
- How do tests fit the existing Vitest setup (F-03)?
- Which expected values, especially locale strings, are known today?

## Summary

- **Fits the runner with no config change.** Both modules are pure: rules.ts says so at `rules.ts:14-16`, and format.ts takes `now`/`t`/`locale` as parameters. The only runtime import in `rules.ts` is `resolveInterval` (`rules.ts:2-9`), and it needs no mocks. `vitest.config.ts` already includes `src/**/*.test.ts` under `environment: "node"` with the `@/` alias (`vitest.config.ts:4-8`). So `src/lib/screenings/rules.test.ts` and `format.test.ts` need no config change.
- **The current code meets all 8 cases.** The case list in `context/archive/2026-09-30-record-appointment-date/plan.md:430-439` has 8 cases. I ran the real functions with `tsx` against this commit, and every case behaves as specified (table below). The probes exposed no bugs. Two consequences:
  - The change can be test-only.
  - F-03's rule still applies as a precedent: "If a test exposes a bug, record it and stop for a decision" (`context/archive/2026-10-05-unit-test-suite/plan.md:55`). It was written for F-03, not restated for F-08.
- **Real signatures differ from the S-03 plan; test the code.**
  - `nextDueMonth(completion, interval)` has no `now` (`rules.ts:172-177`).
  - `partitionDashboard(recommendations, plans, completions, entries, profile, now)` takes 6 arguments (`rules.ts:219-226`). The archived S-03 plan describes a 3-argument `nextDueMonth` and a 4-argument `partitionDashboard`.
- **`describeLastDone` has 3 branches** (`format.ts:51-62`):
  - `last_done_on` → `lastDoneOn`
  - `last_done_month` → `lastDone`
  - neither → `markedIn`, using `anchorMonth(updated_at)`

  Its output depends on ICU. Polish months are genitive in day strings ("5 marca 2026") and nominative in month strings ("marzec 2026"). These strings are pinned below, probed on Node 22.16.0.

- **Two extra cases from S-05, not in the 8-case list:**
  - `awaitingConfirmation`: `date !== null && date <= today` (`rules.ts:244`; S-05 `plan.md:174`).
  - Plan sort order: dated ascending, undated last, `created_at` tie-break (`rules.ts:247-256`).

  S-05 deferred both to "F-03 to cover" (`context/archive/2026-10-05-confirm-exam-and-recurrence/plan.md:333`).

## Detailed Findings

### Functions under test and their behaviour (verified by probe)

All results below come from running the real functions with `npx tsx --tsconfig tsconfig.json` on Node v22.16.0 at commit f8c527d. The probe scripts were in the session scratchpad, not the repo.

| Function (anchor)                                                                 | Input                                                                                                | Observed result                                                    | Source case                                                        |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `warsawToday` (`rules.ts:52-56`)                                                  | `2026-09-30T23:30:00Z`                                                                               | `2026-10-01`                                                       | record-appointment-date `plan.md:432`                              |
| `warsawToday`                                                                     | `2026-09-30T21:59:59Z` / `22:00:00Z` (CEST, UTC+2)                                                   | `2026-09-30` / `2026-10-01`                                        | boundary                                                           |
| `warsawMonth` (`rules.ts:59-61`)                                                  | `2026-12-31T23:00:00Z` (CET, UTC+1)                                                                  | `2027-01-01`                                                       | year rollover                                                      |
| `warsawToday`                                                                     | `2026-03-29T00:59:59Z` / `01:00:00Z` (spring DST), `2026-10-25T00:59:59Z` / `01:00:00Z` (autumn DST) | date unchanged across each switch                                  | worker probe of the same `Intl` formatter                          |
| `addYears` (`rules.ts:86-91`)                                                     | `2024-02-29`, +2 / +4                                                                                | `2026-03-01` / `2028-02-29`                                        | `plan.md:434` (Feb 29)                                             |
| `addMonths` (`rules.ts:79-83`)                                                    | `2024-03-01` +24                                                                                     | `2026-03-01`                                                       | `plan.md:437`                                                      |
| `addMonths`                                                                       | `2026-11-15` +2 / `2026-01-01` −1                                                                    | `2027-01-01` / `2025-12-01`                                        | day ignored, year crossing                                         |
| `isIsoDate` (`rules.ts:70-76`)                                                    | `2026-02-30` / `2028-02-29`                                                                          | false / true                                                       | —                                                                  |
| `parsePlanForm` (`rules.ts:115-126`), today `2026-10-06`                          | `2026-10-05`, `2026-10-06`, `2028-10-06`, `2028-10-07`                                               | reject, accept, accept, reject (`errors.invalid_appointment_date`) | `plan.md:433`                                                      |
| `parsePlanForm`                                                                   | blank date / `" 2026-10-07 "` / `2026-13-01` / `abc`                                                 | `appointment_date: null` / trimmed and accepted / reject / reject  | —                                                                  |
| `parsePlanForm`                                                                   | slug `Mammo!` or missing                                                                             | `errors.invalid_request`                                           | `SLUG_PATTERN` `rules.ts:25`                                       |
| `parsePlanForm`, today `2024-02-29`                                               | `2026-03-01`                                                                                         | accepted: the upper bound is `addYears` → Mar 1                    | Feb 29 × bounds                                                    |
| `parseDoneForm` (`rules.ts:138-154`), current month `2026-10-01`, birth year 1970 | `3`/blank, blank/`2024`                                                                              | `errors.invalid_done_date`                                         | `plan.md:435` (half-filled)                                        |
| `parseDoneForm`                                                                   | both blank                                                                                           | `last_done_month: null`                                            | —                                                                  |
| `parseDoneForm`                                                                   | `3`/`2024`, `03`/`2024`                                                                              | `2024-03-01`                                                       | —                                                                  |
| `parseDoneForm`                                                                   | `0`, `13`, `123` months; `24` as year                                                                | reject                                                             | —                                                                  |
| `parseDoneForm`                                                                   | `10`/`2026` (current month) / `11`/`2026`                                                            | accept / reject                                                    | upper bound inclusive                                              |
| `parseDoneForm`                                                                   | `1`/`1970` / `12`/`1969`                                                                             | accept / reject                                                    | lower bound is January of the birth year                           |
| `anchorMonth` (`rules.ts:164-166`)                                                | `last_done_month: null`, `updated_at 2026-09-30T23:30:00+00:00`                                      | `2026-10-01`                                                       | `plan.md:436` (blank anchors on `updated_at`) with the Warsaw edge |
| `nextDueMonth` (`rules.ts:172-177`)                                               | `2024-03-01`, `{kind:"months",months:24}` / `{kind:"no_known_interval"}`                             | `2026-03-01` / `null`                                              | `plan.md:437`                                                      |

To probe `partitionDashboard` (`rules.ts:219-285`), I set now to `2026-03-01T10:00:00Z` (current Warsaw month `2026-03-01`). The inputs were 5 tier-1 recommendations a–e, plans `a` (`2026-03-01`), `e` (undated) and `x` (no entry), and completions:

- `a`: 2024-03
- `b`: 2024-03
- `c`: 2000-01, no fixed interval
- `d`: 2024-04

Observed:

- `plans` = `[a (awaitingConfirmation true), e (false)]`. The plan for `x` is dropped because its entry is missing (`rules.ts:238`). The dated plan sorts before the undated one.
- The plan for `a` hides its completion. `a` is in neither `done` nor `lastDone`, so a plan beats a completion (`plan.md:438`, `rules.ts:263`).
- `b`: next due `2026-03-01` equals the current month, so `b` is due again. It stays in tier 1 and appears in `lastDone` (`rules.ts:265` uses `>`).
- `c` stays in `done` with `nextDue: null` despite a 2000 completion, so a no-interval completion never returns to the tiers (`plan.md:439`).
- `d`: next due `2026-04-01` is later than the current month, so `d` is in `done` and hidden from the tiers.

### Inputs and fixtures

- **Types:**
  - `Recommendations = { tiers: Record<Tier, Recommendation[]>; maybe; age }` (`src/lib/catalog/recommend.ts:30-34`). `partitionDashboard` reads only `tiers[n][].entry.slug`, `maybe[].entry.slug` and `age` (`rules.ts:232,264,276,282`).
  - `Interval` is `{kind:"months";months}` or `{kind:"shared_decision"|"no_known_interval"|"per_program"}` (`recommend.ts:14`).
- **`resolveInterval(entry, profile, age)`** (`recommend.ts:82-90`):
  - A non-`fixed` `interval_kind` returns `{kind}`.
  - A `fixed` kind returns `{kind:"months"}` with `interval_months`, unless an `interval_overrides` item evaluates to `match`; then that item's months win.
  - In `partitionDashboard`, `age` comes from `recommendations.age`, not from the profile (`rules.ts:264`).
- **Row types:**
  - `screening_completions`: `catalog_slug, created_at, id, last_done_month|null, last_done_on|null, updated_at, user_id` (`src/lib/database.types.ts:220-228`).
  - `screening_plans`: `appointment_date|null, catalog_slug, created_at, id, updated_at, user_id` (`database.types.ts:258-265`).
  - Both are re-exported as `ScreeningCompletion`/`ScreeningPlan` (`rules.ts:21-22`).
- **`describeLastDone`** takes a `Pick` of `last_done_month | last_done_on | updated_at` (`format.ts:52`), so tests can pass plain objects.
- **Existing factories:** `profile()` (`src/lib/catalog/recommend.test.ts:10`), `aged()` (`:30`) and `entry()` (`:35`, an active fixed 12-month entry with `slug "test-entry"`) are file-local and not exported. No shared test-helper module exists. Existing tests use synthetic entries only and never load `catalog/entries/*.json`; F-03 ruled out real catalog data (`unit-test-suite/plan.md:51-56`).

### Test conventions (F-03)

- **Imports:** `import { describe, expect, it } from "vitest"` explicitly, with no globals (`recommend.test.ts:1`). `import type` is used for types.
- **Structure:** a top-level `describe("<fnName>")`, with `it.each` tables for parameterised cases (`recommend.test.ts:166-188`).
- **"Now":** passed as a parameter (`const YEAR = 2026`, `recommend.test.ts:7`). No test uses fake timers or touches `Date`/time zones today. A `Date` literal such as `new Date("2026-10-06T12:00:00Z")` follows the "pass now as a parameter" rule (`CLAUDE.md`, Testing Guidelines).
- **Wording tests:**
  - They call the real `createT(locale)`, pin full sentences in a `Record<Locale,string>` and assert both locales (`src/lib/catalog/wording.test.ts:3,11,58-62`).
  - The comment at `wording.test.ts:8-9` says to re-probe and re-pin after a Node update. The same rule is in CLAUDE.md Testing Guidelines.
  - F-03 chose full strings over substrings (`context/archive/2026-10-05-unit-test-suite/decisions.md:36-45`).

### Locale strings for `describeLastDone`

Templates:

| Key                                    | pl (`src/i18n/pl.ts`)                              | en (`src/i18n/en.ts`)                    |
| -------------------------------------- | -------------------------------------------------- | ---------------------------------------- |
| `dashboard.screenings.done.lastDone`   | `"Ostatnio wykonane: {month}"` (`pl.ts:154`)       | `"Last done: {month}"` (`en.ts:150`)     |
| `dashboard.screenings.done.lastDoneOn` | `"Ostatnio wykonane: {date}"` (`pl.ts:155`)        | `"Last done: {date}"` (`en.ts:151`)      |
| `dashboard.screenings.done.markedIn`   | `"Oznaczone jako wykonane: {month}"` (`pl.ts:156`) | `"Marked done in {month}"` (`en.ts:152`) |

These are the real `describeLastDone` outputs on Node 22.16.0 (ICU 77.1, CLDR 47.0), from my probe:

| Input                                                        | pl                                     | en                          |
| ------------------------------------------------------------ | -------------------------------------- | --------------------------- |
| `last_done_on 2026-03-05` (month `2026-03-01`)               | `Ostatnio wykonane: 5 marca 2026`      | `Last done: March 5, 2026`  |
| `last_done_month 2026-03-01`, no day                         | `Ostatnio wykonane: marzec 2026`       | `Last done: March 2026`     |
| neither, `updated_at 2026-02-28T23:30:00Z` (Warsaw: 1 March) | `Oznaczone jako wykonane: marzec 2026` | `Marked done in March 2026` |

`formatDay` and `formatMonth` parse plain dates as UTC midnight and format them in UTC (`format.ts:38-45`), so the strings carry no day shift. The third row checks two things at once: the `markedIn` branch, and that the anchor is the Warsaw month, not the UTC month.

### Callers (why these rules matter downstream)

- **`src/pages/api/screenings.ts:7`** imports `parsePlanForm`, `parseDoneForm`, `warsawToday`, `warsawMonth` and `SLUG_PATTERN`.
- **`src/pages/dashboard.astro:21`** imports `partitionDashboard` and `warsawToday`.
- **`src/components/recommendations/RecommendationItem.astro`** imports `anchorMonth` (`:11`) and calls `describeLastDone` at `:64`.
- **`src/components/recommendations/DoneItem.astro:48`** calls `describeLastDone`.
- **`src/lib/reminders/appointment.ts:52`** (the cron job) uses `warsawToday(new Date(scheduledTime))`. S-06 (the due-screening reminder) is expected to build on these same rules (`roadmap.md:192`).

## Code References

- `src/lib/screenings/rules.ts:52-61`: `warsawToday` and `warsawMonth`, through `Intl.DateTimeFormat("en-GB", {timeZone:"Europe/Warsaw"})` (`:36-41`)
- `src/lib/screenings/rules.ts:70-91`: `isIsoDate`, `addMonths` and `addYears` (Feb 29 → Mar 1)
- `src/lib/screenings/rules.ts:115-154`: `parsePlanForm` and `parseDoneForm`
- `src/lib/screenings/rules.ts:164-177`: `anchorMonth` and `nextDueMonth`
- `src/lib/screenings/rules.ts:219-285`: `partitionDashboard` (precedence, sort, due-again `>` boundary at `:265`)
- `src/lib/screenings/format.ts:25-35`: `screeningFormBounds`, not named in F-08
- `src/lib/screenings/format.ts:51-62`: `describeLastDone`
- `src/lib/catalog/recommend.ts:82-90`: `resolveInterval`
- `src/lib/catalog/recommend.test.ts:10-67`: `profile`/`aged`/`entry` factories to copy
- `src/lib/catalog/wording.test.ts:8-11,58-62`: the pinned-string pattern
- `vitest.config.ts:3-9`: runner config
- `src/i18n/pl.ts:154-156` and `src/i18n/en.ts:150-152`: `describeLastDone` templates

## Architecture Insights

- **Dates as strings.** Dates are plain `YYYY-MM-DD` strings compared lexically (`rules.ts:18-19`). "Today" and "this month" are Warsaw calendar values, never `toISOString()`. This makes the Warsaw-boundary cases the core time-zone risk, and they need explicit tests.
- **Months are first-of-month strings.** Due again starts on the first day of `anchor + interval` (`rules.ts:168-177`). An exam whose next due month equals the current month already counts as due (`rules.ts:265`).
- **Bounds share `addYears`.** The plan-date upper bound (`rules.ts:122`) and the form `max` (`format.ts:31`) both use `addYears(today, 2)`, so client and server agree even on 29 Feb.
- **ICU dependence.** Time-zone conversion (`rules.ts:36-41`) and date wording (`format.ts:38-45`) depend on Node's ICU and tz data. Local Node is v22.16.0; `.nvmrc` is `22.14.0`; CI uses `node-version: 22`, which floats (`.github/workflows/ci.yml:23,43,129`). This is the drift risk F-03 already accepted for the wording tests.

## Historical Context (from prior changes)

- **`context/archive/2026-09-30-record-appointment-date/plan.md:430-439`:** the 8 candidate cases. All 8 are supported by the current code (probe above).
  - Its function contract (`:213-246`) is partly outdated. It says `nextDueMonth(completion, interval, now)` and a 4-argument `partitionDashboard`, but the code has 2 and 6 arguments.
  - Its precedence rule (`:246`, "plan, then not-yet-due completion, then tier") is still supported.
- **`context/archive/2026-10-05-confirm-exam-and-recurrence/plan.md:174,205,333`:** S-05 added `awaitingConfirmation` and the `lastDoneOn` branch, and deferred their unit tests to F-03. This is still supported: no test exists (`src/lib/screenings/` holds no `*.test.ts`).
- **`context/archive/2026-10-05-unit-test-suite/plan.md:50`:** F-03 explicitly deferred this recurrence scope. Its `follow-ups/recurrence-tests.md` lists the scope:
  - `warsawToday`/`warsawMonth`
  - `anchorMonth`
  - `parsePlanForm`/`parseDoneForm`
  - `nextDueMonth`, `addMonths`/`addYears`, `partitionDashboard`
  - `describeLastDone`

  It asks for `describeLastDone` cases "pinned the same way as `src/lib/catalog/wording.test.ts`".

- **`context/archive/2026-10-05-unit-test-suite/impl-review.md:89` F3:** a sort test there passed because of input order, not the rule. Lesson for F-08: feed `partitionDashboard` plans in non-sorted order so the sort assertion can fail.
- **`context/foundation/roadmap.md:197`:** calls the follow-up's list "first cases", not a closed list.

## Related Research

- `context/archive/2026-10-05-unit-test-suite/research.md`: runner choice and ICU dependence of wording
- `context/archive/2026-10-05-confirm-exam-and-recurrence/research.md`: S-05 rules analysis

## Open Questions

These are for `/10x-plan`. None blocks it.

1. **Scope beyond the roadmap line.**
   - The roadmap names `nextDueMonth`, `addMonths`/`addYears`, `partitionDashboard`, Warsaw midnight, Feb 29 and `describeLastDone`.
   - The follow-up also lists `warsawToday`/`warsawMonth`, `anchorMonth`, `parsePlanForm` and `parseDoneForm`.
   - Not named anywhere, but pure and cheap to test: `isIsoDate`, `screeningFormBounds`, `formatDay`/`formatMonth`.

   Recommendation: cover the follow-up list plus `awaitingConfirmation` and sort order, and treat the rest as optional.

2. **PRD testing NFR wording.** `prd.md:142` names only the catalog rules, and F-08 cites "NFR (testing)". Extending that line to the recurrence rules is a product-doc decision, outside a test-only change.
3. **ICU drift for Warsaw and date-wording tests.** These tests add `Intl` time-zone and Polish month-case dependencies. Recommendation: reuse the existing re-probe/re-pin comment, with no new mechanism. The `.nvmrc` 22.14.0 vs local 22.16.0 vs CI floating 22 mismatch is pre-existing and was accepted in F-03.
