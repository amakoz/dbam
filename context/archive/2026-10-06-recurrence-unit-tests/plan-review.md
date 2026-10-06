<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Recurrence Unit Tests (F-08)

- **Plan**: context/changes/recurrence-unit-tests/plan.md
- **Mode**: Deep (claims verified inline: source read plus a live probe of the real functions; no sub-agent, given the small surface)
- **Date**: 2026-10-06
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | PASS    |

## Grounding

- **Paths: 9/9 ✓.** `src/lib/screenings/{rules,format}.ts`, `src/lib/catalog/{recommend,wording}.test.ts`, `vitest.config.ts`, `CLAUDE.md:53`, `README.md:297`, `context/archive/2026-09-30-record-appointment-date/plan.md` and `context/archive/2026-10-05-unit-test-suite/follow-ups/recurrence-tests.md` all exist. `AGENTS.md` is a symlink to `CLAUDE.md`, so the doc edit covers both.
- **Symbols: 7/7 ✓.** These match the plan:
  - `rules.ts:244` is `date !== null && date <= today`, and `rules.ts:265` is `nextDue > currentMonth`.
  - The signatures at `rules.ts:172-177` and `rules.ts:219-226` match.
  - `Recommendation` is `{ entry, tier, matchedBranch, interval }` and `Recommendations` includes `age` (`recommend.ts:16-34`).
  - The three `dashboard.screenings.done.*` keys exist in `pl.ts` and `en.ts`.
  - `tsconfig.json` includes `**/*`, so `astro check` also type-checks the new test files.
- **Probe: all expected values reproduced ✓.** Every Phase 1 expected value for `warsawToday`, `warsawMonth`, `addYears`, `addMonths`, `parsePlanForm`, `parseDoneForm`, `anchorMonth` and `nextDueMonth` matched when run on Node 22.16.0. All 6 `describeLastDone` strings in the Phase 2 table matched too. The `partitionDashboard` cases were checked by reading the code at `rules.ts:227-284`.
- **Brief↔plan ✓.** The phases, decisions and scope match.
- **Progress↔Phase ✓.** There is one `## Progress` section. Phases 1 and 2 have 1.1–1.5 and 2.1–2.5, with one row per success-criteria bullet. No checkboxes appear outside Progress.

## Findings

### F1 — Precedence fixture can pass with the plan-over-completion skip removed

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — `partitionDashboard`, "Precedence" case
- **Detail**: The plan says the slug must be "in `plans` only, absent from `done`, the tiers and `lastDone`", but it does not say how old the completion is. That choice decides what the test can catch. Two mechanisms enforce precedence:
  - the `planned.has(...)` skip at `rules.ts:263`;
  - `...planned` in `hidden` at `rules.ts:271`.

  Suppose the fixture's completion is already due again. If you delete the `rules.ts:263` skip, the completion goes into `dueAgain`, not `done`. `hidden` still filters the slug out of the tiers through `planned`, so `lastDone` is never set (`rules.ts:276-279`), and the output does not change. The test would pass on a broken rule. This is the "passes for the wrong reason" risk the plan cites from F-03's impl-review F3. The mutation spot-check would not catch it, because it covers only `:244` and `:265`.

- **Fix**: State that the precedence completion is not yet due (for example `2025-10-01` + 24 months) and that its slug is also in tier 1. Deleting `planned.has` at `:263` then puts it into `done`, and deleting `...planned` at `:271` leaves it in the tier, so each mutation fails the test. Optionally add "deleting `planned.has(completion.catalog_slug)` at `rules.ts:263` fails at least one test" as a third mutation bullet under 1.4. If you do, keep the 1.4 title unchanged and add the note in the Phase 1 block.
- **Decision**: ACCEPTED (orchestrator, 2026-10-06). The precedence completion is now not yet due (`2025-10-01` + 24 months) and also in tier 1. A third mutation bullet under Phase 1 Automated Verification deletes `planned.has(...)` at `rules.ts:263`. The Progress 1.4 title is unchanged.

### F2 — DST cases cannot fail under any plausible regression

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — `warsawToday` / `warsawMonth`, "Both DST switches leave the date unchanged"
- **Detail**: The four timestamps are `2026-03-29T00:59:59Z`/`01:00:00Z` and `2026-10-25T00:59:59Z`/`01:00:00Z`. In Warsaw they fall between 01:59 and 03:00 local time, hours from midnight. Under a fixed +1 h, a fixed +2 h or plain UTC, they still give the same calendar date. These cases cannot fail, and they add no signal beyond the CEST and CET midnight cases. A switch-aware regression, such as an offset cached before the switch, shows up only at the first local midnight after the switch.
- **Fix**: Replace them with the first Warsaw midnight after each switch:
  - `2026-03-29T21:59:59Z` → `2026-03-29` and `22:00:00Z` → `2026-03-30` (now CEST);
  - `2026-10-25T22:59:59Z` → `2026-10-25` and `23:00:00Z` → `2026-10-26` (now CET).

  Or drop the DST cases. Either way, scope does not change.

- **Decision**: ACCEPTED (orchestrator, 2026-10-06). The four DST timestamps are replaced with the first Warsaw midnight after each switch (`2026-03-29T21:59:59Z`/`22:00:00Z`, `2026-10-25T22:59:59Z`/`23:00:00Z`). Probed on Node 22.16.0: `2026-03-29`/`2026-03-30` and `2026-10-25`/`2026-10-26`.
