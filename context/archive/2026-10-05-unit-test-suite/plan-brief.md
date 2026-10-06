# Unit Test Suite (F-03) — Plan Brief

> Full plan: `context/changes/unit-test-suite/plan.md`
> Research: `context/changes/unit-test-suite/research.md`

## What & Why

Add Vitest as the project's unit-test runner, run it in CI, and cover the catalog eligibility, tier and interval rules (`src/lib/catalog/recommend.ts`) and their wording (`wording.ts`). S-02 shipped the rule engine without unit tests by owner decision. Until now, its edge cases relied on smoke, pgTAP and manual test profiles, which the PRD's testing NFR (`prd.md:142`) calls a stopgap.

## Starting Point

There is no unit runner, no `test` script and no test files; only pgTAP and the HTTP smoke run in CI. Both target modules are pure: no `astro:*`, Supabase or clock, and `recommend()` takes `currentYear`. They run under plain Vitest once the `@/*` alias is mapped.

## Desired End State

`npm test` runs Vitest over colocated `src/**/*.test.ts`, and CI's `ci` job runs it on every PR. A change that breaks eligibility, tier, interval or wording behaviour fails the PR. `CLAUDE.md`, `README.md` and the PRD describe the suite instead of its absence.

## Key Decisions Made

| Decision                | Choice                                                        | Why (1 sentence)                                                                                                                                                    | Source              |
| ----------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Runner                  | Vitest 5.0.3, `vitest.config.ts` with `resolve.tsconfigPaths` | Its peer range accepts the installed vite 8.3.0 and Node 22; Vite 8 maps `@/*` natively, without Astro's `getViteConfig` (which would load the Cloudflare adapter). | Research            |
| Scope                   | Only `recommend.ts` and `wording.ts`                          | The F-03 outcome names exactly these files; `rules.ts` recurrence cases are deferred to a follow-up.                                                                | Plan (orchestrator) |
| Location                | Colocated `src/**/*.test.ts`, explicit `include`              | tsconfig and type-aware ESLint already cover `src/**`; the explicit glob keeps Vitest out of `dist/` and `.astro/`.                                                 | Plan (orchestrator) |
| Wording assertions      | Full pl and en strings, no 5+ digit numbers                   | These are user-facing strings and CI pins Node 22; outputs were probed on 22.16.                                                                                    | Plan (orchestrator) |
| Fixtures                | Typed inline factories, not schema-parsed                     | The schema rejects the launch-gate case (active, no reviewer) and checks source dates against the clock.                                                            | Plan (worker)       |
| Coverage and pre-commit | Neither                                                       | No PRD or roadmap requirement asks for them.                                                                                                                        | Plan (worker)       |
| CI placement            | `npm test` in the `ci` job after `ui:check`                   | No DB or secrets needed, so it fails early.                                                                                                                         | Research            |

## Scope

**In scope:**

- Vitest dev dependency, `npm test`, `vitest.config.ts`
- CI `ci` job step
- `recommend.test.ts`: the 7 S-02 cases, plus `lte`/null on `years_since_quitting`, launch gate, `maybe`/`missing`, first matching branch, non-fixed kinds and age
- `wording.test.ts`: all four `describe*` functions in pl and en
- Doc updates: `CLAUDE.md` (incl. the re-pin-after-Node-update line), `README.md` (script list, smoke note, CI list), `prd.md:142`

**Out of scope:**

- `src/lib/screenings/rules.ts` and `format.ts` (follow-up)
- Other pure modules
- Coverage and pre-commit tests
- Real-catalog tests
- DOM/component tests
- Any behaviour change to the rule engine

## Architecture / Approach

Tests import the real modules and the real `createT(locale)`, with no mocks. Inputs come from small `profile()`/`entry()` factories typed as `Profile`/`CatalogEntry`, with per-test overrides. All cases use `currentYear = 2026`. Phase 1 adds the runner, the CI step and the rule-engine tests and is verified locally. Phase 2 pins the wording strings and updates the docs. The CI run is checked once the PR is open.

## Phases at a Glance

| Phase                                           | What it delivers                                       | Key risk                                                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 1. Vitest runner, CI step and rule-engine tests | `npm test` in CI; `recommend.test.ts`                  | `resolve.tsconfigPaths` is unexercised under Vitest 5 (fallback: explicit `resolve.alias`); strict lint forbids `!` in tests |
| 2. Wording tests and docs                       | `wording.test.ts`; `CLAUDE.md`/`README.md`/PRD updated | A Node update (minor or major) that changes ICU data would need the expected strings re-pinned                               |

**Prerequisites:** S-02 done (it is); Node 22 locally.
**Estimated effort:** about 1 session across 2 small phases.

## Open Risks & Assumptions

- `npx astro check` is assumed to type-check `*.test.ts`. Phase 1 confirms it with a deliberate type error.
- The wording strings are tied to Node 22's ICU data, and CI's `node-version: 22` picks up the newest 22.x on each run. A Node update (minor or major) that changes ICU data may require re-pinning them. The CLAUDE.md Testing Guidelines will say to re-probe the strings and re-pin them when wording tests fail after a Node update with no code change.
- The CI-log check (Progress 2.7) waits until the PR is open, after impl-review. Phase 1 is verified locally only.
- If a test exposes a real rule bug, the plan stops for a decision instead of changing `recommend.ts`/`wording.ts`.

## Success Criteria (Summary)

- `npm test` passes locally and in CI's `ci` job, and a deliberately broken age bound makes it fail.
- The seven S-02 cases and the wording in both locales are pinned by tests.
- The docs no longer say "no unit suite is configured yet".
