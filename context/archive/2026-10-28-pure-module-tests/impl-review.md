<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Unit tests for the remaining pure modules (F-19)

- **Plan**: context/changes/pure-module-tests/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-28
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 1 observation

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

- **Commits**: `d9b774b` (p1), `9c90edf` (p2), `40803be` (p3), `cea2d37` (epilogue), on top of `45bb906` (research, plan, plan-review fixes). Progress shows 16/16 rows `[x]` with SHAs.
- **Diff vs plan**: 8 test files under `src/` and `scripts/` (4 new, 4 extended). Each one is listed in the plan's "Changes Required", and every planned file is present. The only other changes are under `context/changes/pure-module-tests/`, and no production source file changed.
- **Plan adherence**: every contract bullet in Phases 1–3 has a matching case. All five plan-review fixes (F1–F5) are in the code: `{{toString}}` is pinned as left as is, and a `{ toString: "y" }` value throws; the manifest-injection case uses `toEqual` on the sorted slugs; `continuationContent` covers answered and unanswered `server_tool_use` blocks and `redacted_thinking`; the `__proto__`/`constructor` cases are labelled "Free-text fallbacks"; and the TZ deliberate break was run. The code goes slightly beyond the contract, all within the functions in scope: `formatMonth("2026-01-01")`, `formatDay` in en for 29 February, `.env`/`.dev.vars` in `forbiddenSourceReason`, and malformed `properties`/`anyOf` throw cases. None of these pins a count, a whole generated text or an incidental behaviour listed under "What We're NOT Doing".
- **Patterns**: the new files follow the house style: a `describe` per function, `it.each` tables with `$field` titles, `@/` imports, and catalog fixtures cloned from real entries (`lib.test.ts`). The `form()` helper copies `rules.test.ts:116-120`. SDK fixtures are plain objects cast to the SDK types, so no network call or API key is needed. The `config.toml` read resolves from `import.meta.dirname`, the same way as `scripts/catalog/lib.ts:20`.

## Success criteria (re-run 2026-10-28)

| Check                                                                                      | Result                                                                 |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| 1.1 `npx vitest run src/lib/{password,profile,errors,auth-errors}.test.ts`                 | ✅ 57 passed                                                           |
| 2.1 `npx vitest run src/lib/screenings/rules.test.ts src/lib/screenings/format.test.ts`    | ✅ 88 passed                                                           |
| 3.1 `npx vitest run scripts/catalog`                                                       | ✅ 105 passed                                                          |
| 1.2 / 2.2 / 3.2 `npm test`                                                                 | ✅ 27 files, 598 tests passed                                          |
| 1.3 / 2.3 / 3.3 `npm run lint`                                                             | ✅ exit 0                                                              |
| 3.4 `npm run catalog:check`                                                                | ✅ 20 entries, matches the committed snapshot, 0 review warnings       |
| 1.5 / 2.5 / 3.6 `git diff --name-only origin/main -- src scripts \| grep -v '\.test\.ts$'` | ✅ prints nothing                                                      |
| 2.4 (spot re-run) delete `timeZone` in `formatDay`, run under `TZ=America/New_York`        | ✅ red: 4 failures (3 × `formatDay`, 1 × `describeLastDone`), reverted |
| 3.5 (spot re-run) drop the `DRAFT_FIELDS` spread in `planWrites`                           | ✅ red: "writes a new entry as a draft …", reverted                    |

The other deliberate breaks (1.4, the `isIsoDate` half of 2.4, the `quote` half of 3.5) were not re-run. Each is backed by an exact-value case that the change would break: `abcdefghij1` → `["too_short"]` together with the parity test, `2009` → `birthYearTooYoung`, `2026-02-30` → false, and `'O''Brien \ $$'`. The worktree was clean after both re-runs. There are no Manual rows.

## Findings

### F1 — The "no shift" date cases guard only in a west-of-UTC process

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/screenings/format.test.ts (`formatDay` `2026-01-01` case); vitest.config.ts
- **Detail**: Nothing pins `TZ` for Vitest, so tests run in the host zone: UTC in CI and Europe/Warsaw locally. Dropping `timeZone: "UTC"` from `formatDay` or `formatMonth` changes the output only in zones west of UTC. The re-run above shows these tests go red under `TZ=America/New_York`, but CI would stay green after such a regression. The plan accepted this at plan review (F5: a one-off deliberate break), so this is a residual gap, not drift. The existing header comment in `format.test.ts` ("Node 22 with the Europe/Warsaw time zone") also describes a zone that nothing sets.
- **Fix**: Leave it for this tests-only change. As a backlog note: pin a west-of-UTC zone for the unit run (e.g. `process.env.TZ` in `vitest.config.ts`, or `TZ=…` in the `test` script) so the existing cases guard in CI. Confirm first that the Warsaw-based `rules.test.ts` cases don't depend on the host zone.
- **Decision**: DEFER — recorded as `follow-ups/pin-test-tz.md` and listed in the PR body's follow-ups (orchestrator, 2026-10-28)
