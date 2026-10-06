# Follow-up: recurrence unit tests

F-03 (`unit-test-suite`) added the Vitest runner and covered the catalog rule engine (`src/lib/catalog/recommend.ts`, `wording.ts`). It deliberately left S-05's recurrence logic untested (plan.md, "What We're NOT Doing"). This note records that deferral so it is not lost. Adding a roadmap slice for it is a human decision (impl-review F1, Fix B); the roadmap was not edited.

## Why it matters

S-05 is done and its due-date logic has no unit tests. S-06 (due-screening-reminder) and S-07 read those due dates, so this gap is worth closing before or alongside S-06.

## Scope

Pure functions that take "now" (or a month/day string) as a parameter, so they fit the existing runner (`npm test`, colocated `src/**/*.test.ts`, `environment: "node"`) with no config change.

- `src/lib/screenings/rules.ts`
  - `nextDueMonth`
  - `addMonths` / `addYears`
  - `partitionDashboard`
  - `warsawToday` / `warsawMonth` (Warsaw-midnight edge)
  - `anchorMonth`, `parsePlanForm`, `parseDoneForm` (date bounds, half-filled month/year)
- `src/lib/screenings/format.ts`
  - `describeLastDone`

## Candidate cases

From `context/archive/2026-09-30-record-appointment-date/plan.md:430-439`:

- Warsaw midnight edge: 23:30 UTC on 30 Sep is 1 Oct in Warsaw.
- Date bounds: today and today + 2 years are accepted; the days before and after are rejected.
- Feb 29 + 2 years rolls to Mar 1.
- A half-filled month/year is rejected.
- A blank done date anchors on the `updated_at` month.
- The due-again boundary: March 2024 + 24 months is due from 1 March 2026.
- Precedence: a plan beats a completion.
- No-interval completions never return to the tiers.

Add `describeLastDone` wording cases in both locales, pinned the same way as `src/lib/catalog/wording.test.ts`.

## Next step

A human decides whether this becomes a roadmap item (for example a foundation item with prerequisite F-03, ordered before S-06) or a GitHub issue. The F-03 PR description links this file.
