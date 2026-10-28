<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Catalog check guards Implementation Plan

- **Plan**: context/changes/catalog-check-guards/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-28
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Evidence

- **Diff** (`de5ef64..b976418`): `scripts/catalog/{lib,check,migration}.ts`, the new `scripts/catalog/lib.test.ts`, `catalog/README.md`, `CLAUDE.md`, and the change folder. Every planned file is in the diff, and every changed file was planned. I gathered the evidence in context, without sub-agents: 5 code files, about 430 lines.
- **Drift**: every contract matches the plan: function signatures, message texts, the explicit `STATUS_RANK`, the strict row-start regex, one annotation, and warnings printed on both paths and never added to `problems`. There is one extra beyond the plan: `parseSnapshotStatuses` also treats a manifest slug that is not `[a-z0-9-]+` as unreadable (`lib.ts:300`). It is logged in `decisions.md` ("Implementation notes") and covered by a test, so it is benign and not a finding.
- **Re-run automated checks**:
  - 1.1 / 2.1 `npm test`: 22 files, 448 tests pass.
  - `npm run lint`: exit 0.
  - `npx astro sync && npx astro check`: 0 errors, 0 warnings.
  - 1.4 / 2.2 `npm run catalog:check`: `catalog:check passed: 20 entries, matches …165522_screening_catalog_snapshot.sql, 0 review warning(s)`.
  - 2.3 demotion break (colonoscopy → draft, plus blood-pressure due `2026-01-01`): `catalog:check` printed the `warning:` line, then the single `moves back from "active"` problem, and exited 1. `catalog:migration` exited 1 and wrote no file.
  - 2.4 overdue break: `catalog:migration` wrote a snapshot. `GITHUB_ACTIONS=true GITHUB_STEP_SUMMARY=… catalog:check` exited 0, with one `warning:` line, one `::warning … 1 active catalog entry needs review: blood-pressure-measurement` line, `1 review warning(s)` and the summary file written. The snapshot was deleted and the entries restored; `git status` is clean.
  - 2.5 `npx prettier --check catalog/README.md CLAUDE.md`: pass.
- **Manual**: 2.6 (the PR's `ci` log) and 2.7 (the owner proofreads the README) are unchecked. That is correct: they need the PR run and a human (`decisions.md`). Nothing is marked done without evidence.

## Findings

### F1 — "Never delete an entry" now sits under "Review dates"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW (quick decision; the fix is obvious and narrowly scoped)
- **Dimension**: Plan Adherence
- **Location**: catalog/README.md:17-31
- **Detail**: The new `### Allowed moves` and `### Review dates` subsections were placed between the Lifecycle bullets and the `**Never delete an entry.**` paragraph. That paragraph's text is unchanged, as the plan required, but it now renders as the last paragraph of "Review dates", a subsection about warnings. `CLAUDE.md`'s catalog hard rule sends readers to this README, and the never-delete rule is now filed under the wrong heading.
- **Fix**: Move the two `###` subsections below the "Never delete an entry" paragraph, so the paragraph closes the Lifecycle section as before. This is a text move only, with no wording change.
- **Decision**: FIXED

### F2 — Unit test pins the number of active catalog entries

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW (quick decision; the fix is obvious and narrowly scoped)
- **Dimension**: Safety & Quality
- **Location**: scripts/catalog/lib.test.ts:209
- **Detail**: The annotation-cap test builds its warnings from the real active entries and asserts `toHaveLength(19)`, and again at `:211`. Catalog content changes routinely, for example the owner activating the draft `lung-ldct-nfz-program`. Such a change would turn `npm test` red in an entry-only PR that touches no code, and the PR author would have to edit a script test. The plan's "19 warnings" was meant to show the cap (more than 10 entries due on one day), not to fix the catalog size.
- **Fix**: Build the 19 warnings synthetically, for example `Array.from({ length: 19 }, (_, i) => ({ slug: \`entry-${i}\`, kind: "overdue", due: "2027-09-29" }))`. Keep the "exactly one `::warning`, 19 `warning:` lines" assertions.
- **Decision**: FIXED

### F3 — Step-summary write can still change the exit code

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW (quick decision; the fix is obvious and narrowly scoped)
- **Dimension**: Safety & Quality
- **Location**: scripts/catalog/check.ts:54
- **Detail**: `fs.appendFileSync(summaryFile, …)` is unguarded. If the write throws (bad path or a read-only file), `catalog:check` crashes with exit 1 even though the run has only warnings. That contradicts the plan's invariant "the exit code never changes because of warnings". On GitHub runners the path is always writable, so the risk is theoretical.
- **Fix**: Wrap the append in `try/catch` and print a one-line `warning: could not write $GITHUB_STEP_SUMMARY` instead of throwing.
- **Decision**: FIXED
