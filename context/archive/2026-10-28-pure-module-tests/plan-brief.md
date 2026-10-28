# Unit tests for the remaining pure modules (F-19) — Plan Brief

> Full plan: `context/changes/pure-module-tests/plan.md`
> Research: `context/changes/pure-module-tests/research.md`

## What & Why

Roadmap F-19 (backlog B-11): give the pure modules that still have no direct tests colocated Vitest tests. These are
the password policy, profile-form parsing and pack-years, error-code mapping, the screening date and format helpers,
and the pure parts of the catalog scripts. Later changes to these modules then get a safety net, and drift between
the password policy and local Supabase Auth fails CI.

## Starting Point

The F-03 Vitest runner already covers catalog rules, screening recurrence, email and reminders. The modules above have
no tests, or are tested only indirectly: `isIsoDate` through `parsePlanForm`, and `formatDay`/`formatMonth` through
`describeLastDone`. Only the five F-17 functions in `scripts/catalog/lib.test.ts` are covered there.

## Desired End State

`npm test` covers every function named in the F-19 outcome on Node 22, with no non-test source change. If
`PASSWORD_MIN_LENGTH` or the letters-and-digits rule diverges from `supabase/config.toml`, a test fails.

## Key Decisions Made

| Decision               | Choice                                                                                                        | Why (1 sentence)                                                                                              | Source       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------ |
| Clock injection        | No source change                                                                                              | Functions take `now`/`currentYear`; the schema's clock only rejects future dates, and fixtures use past ones. | Research     |
| Catalog scope          | Pure functions only (rest of `lib.ts`, all of `draft-core.ts`)                                                | F-19 names pure modules; `catalog:check` covers the disk readers and renderers in CI.                         | Orchestrator |
| Password parity        | Test reads `config.toml`, checks length and `letters_digits`                                                  | Turns two of the three sides of the CLAUDE.md hard rule into a CI failure.                                    | Orchestrator |
| ICU strings            | Pin pl and en literals, reuse the re-pin comment                                                              | Same mechanism as the F-03 and recurrence tests; no new drift tooling.                                        | Research     |
| Incidental behaviour   | Keep `__proto__`/`constructor` as free-text fallbacks; skip `0000-01-01`, `a/../../x`, cross-namespace lookup | Pin decided contracts, not accidents.                                                                         | Plan         |
| Generated text         | Structure assertions, no golden SQL/schema/prompt, no counts                                                  | Avoids tests that break on unrelated catalog or key additions.                                                | Research     |
| `draft.ts` helpers     | Out of scope                                                                                                  | Testing them needs a code move, which is a source change.                                                     | Plan         |
| Plan review (F1–F5)    | All five fixed in the plan                                                                                    | Pin what the code does, make each guard able to fail.                                                         | Plan review  |
| Phases                 | 3 phases, one commit each, one PR                                                                             | At most 4 test files per phase, each with its own green gate.                                                 | Plan         |
| Complexity / questions | LOW / 0 further questions                                                                                     | Research and the two orchestrator answers settled every decision.                                             | Plan         |

## Scope

**In scope:**

- `src/lib/{password,profile,errors,auth-errors}.test.ts` (new)
- `isIsoDate` in `rules.test.ts`; `screeningFormBounds`/`formatDay`/`formatMonth` in `format.test.ts`
- the uncovered pure `lib.ts` exports in `scripts/catalog/lib.test.ts`
- `scripts/catalog/draft-core.test.ts` (new)

**Out of scope:**

- any production source change, including the `formatDay` JSDoc example drift
- catalog disk readers and Prettier renderers
- `draft.ts`/`check.ts`/`migration.ts`
- Vitest config, CI, coverage
- `roadmap.md` status

## Architecture / Approach

House style: one `describe` per function and `it.each` tables with literal expected values, taken from the source
rules and the research probes (Node v22.16.0, ICU 77.1). Catalog fixtures clone real entries the way `lib.test.ts`
already does. SDK message fixtures are plain objects cast to the SDK types, which `draft-core.ts` imports as types
only. Each phase ends with a deliberate-break check, which alters a source line, sees the tests fail and reverts it.

## Phases at a Glance

| Phase                                | What it delivers                                                                 | Key risk                                                                                                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Form and error-code modules       | Password (+ `config.toml` parity), profile form, pack-years, error mappers tests | Parity regex brittle to `config.toml` formatting                                                                                                            |
| 2. Screening date and format helpers | `isIsoDate`, form bounds (Warsaw midnight, leap day), pl/en date strings         | ICU output differs between local Node 22.16 and CI Node 22.14; the UTC no-shift guard bites only west of UTC, so its break runs under `TZ=America/New_York` |
| 3. Catalog script pure functions     | Generator escaping/determinism, manifest and deleted-slug guard, drafter core    | SDK type casts in fixtures; pinning too much generated text                                                                                                 |

**Prerequisites:** F-17 merged (it is, #103); local Node 22.
**Estimated effort:** one implement session, 3 phase commits.

## Open Risks & Assumptions

- ICU strings were probed on Node 22.16 / ICU 77.1, and CI runs Node 22.14. The existing `format.test.ts` strings pass
  in CI today. If a new string differs, re-probe and re-pin it, as CLAUDE.md says.
- A test that reveals a bug pins current behaviour, or skips the case. The bug goes into `decisions.md` and the
  backlog, and the work stops for a decision. Nothing is fixed in this change.
- The parity check covers local Supabase only. The production dashboard remains a manual check.

## Success Criteria (Summary)

- `npm test`, `npm run lint` and `npm run catalog:check` are green, and every function named in F-19 has direct cases.
- The deliberate breaks in each phase turn the new tests red.
- `git diff` against `origin/main` shows only `*.test.ts` under `src/` and `scripts/`.
