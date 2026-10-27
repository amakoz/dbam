# Browser E2E for the Core Loop — Plan Brief

> Full plan: `context/changes/e2e-core-loop/plan.md`
> Research: `context/changes/e2e-core-loop/research.md`

## What & Why

Test-plan Phase 1 (roadmap S-08) adds a Playwright suite that clicks through the real app in Chromium. It guards risk #2 (the core loop breaks in a browser while the HTTP smoke run stays green), risk #4 (a confirmed exam is lost or gets a wrong next due date) and risk #1 at browser level (a second user sees another user's data).

## Starting Point

Only the `playwright` library (1.63.0, for `ui:shots`) is installed: no test runner, config or specs. `scripts/smoke.mjs` posts the same forms over HTTP, but it skips hydration, client validation and the browser's redirect chain. The sign-up → onboarding auto-session chain is exercised nowhere.

## Desired End State

`npm run test:e2e` runs three specs against a local production preview and local Supabase: the seed, the core loop and two-user isolation. It refuses any non-local base URL or Supabase URL. The required CI `smoke` job runs it on every PR, reusing its Supabase and preview, and uploads traces only on failure.

## Key Decisions Made

| Decision       | Choice                                                                        | Why (1 sentence)                                                                 | Source            |
| -------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------- |
| CI placement   | Steps inside `smoke`, after the smoke step, `BASE_URL=http://localhost:4321`  | Only `ci` + `smoke` gate `main`; reuse avoids a second Supabase start            | Orchestrator      |
| CI time bound  | Chromium shell only, cache on version, `workers: 1`, retries 1 in CI          | Roadmap risk "don't slow smoke"; split into its own job if > ~4 min              | Orchestrator      |
| Server         | `BASE_URL` if set, else `webServer` build + preview on `E2E_PORT`/`DBAM_PORT` | Same config for CI and local worktrees; never port 4321 in worker sessions       | Orchestrator      |
| Safety guard   | Refuse non-local `BASE_URL` **and** non-local `SUPABASE_URL` at config load   | e2e signs up real users; a local preview built on production secrets would too   | Orchestrator/Plan |
| Auth           | Fresh `e2e-<random>@example.com` per test via the UI; no setup project        | Sign-up is part of risk #2; a stored session would skip it                       | Orchestrator/Plan |
| Plan step      | Plan for Warsaw today, then confirm                                           | The only date that is both plannable and confirmable in one run                  | Orchestrator      |
| Oracle         | Mammography JSON: assert fixed + no overrides, add 24 months by hand          | Expected value must not come from the production date helper                     | Orchestrator      |
| Fixture age    | Female, born current year − 50 (B: − 55)                                      | Mammography (45–74) stays eligible every year; B eligible so absence = isolation | Orchestrator/Plan |
| Runner version | `@playwright/test` pinned exactly to 1.63.0                                   | Shares the browser build with `playwright` 1.63.0                                | Orchestrator      |
| Agent wiring   | None under `.claude/`; `npx -y @playwright/cli` / Playwright MCP ad hoc       | Only `.claude/settings.json` is tracked                                          | Orchestrator      |

## Scope

**In scope:**

- `@playwright/test`, `playwright.config.ts`, `.gitignore` lines, `test:e2e` script
- Seed, core-loop and isolation specs plus a UI-only support module
- CI steps in `smoke`, `test-stack.md`, CLAUDE.md/README lines, test-plan §4/§6.3/§6.6

**Out of scope:**

- Rescheduling via "Zmień termin", month-end/leap-day dates (unit layer)
- Forged-identifier writes, reminder recipients, privacy outputs (test-plan Phases 2–3)
- A separate CI job, branch protection, visual diffs, roadmap status

## Architecture / Approach

Playwright Test drives Chromium against `astro preview` (workerd) on a local build that reads `.dev.vars` pointing at local Supabase. Specs use role/label/text locators scoped to dashboard sections and rows. They wait for island hydration before typing, and assert visible text plus the existing `data-*` row attributes. Shared helpers perform each step through the UI only, and the oracle reads the catalog JSON.

## Phases at a Glance

| Phase                 | What it delivers                                             | Key risk                                                 |
| --------------------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| 1. Setup and seed     | Runner, guarded config, seed "sign-up reaches onboarding"    | Astro 7 preview daemonizing; hydration races             |
| 2. Core loop (#2, #4) | Click-through to a confirmed exam with oracle next-due date  | Warsaw-midnight flake; workerd vs Node ICU strings       |
| 3. Isolation (#1)     | Two contexts; B sees none of A's plans, done record, profile | Fixture eligibility making absence meaningless (guarded) |
| 4. CI wiring and docs | Required check in `smoke`, docs and cookbook                 | Added minutes on the `smoke` gate                        |

**Prerequisites:** local Supabase running, `.dev.vars` pointing at it, Chromium shell installed, DB lock for every local run, `$DBAM_PORT` free.
**Estimated effort:** ~1–2 sessions across 4 phases.

## Open Risks & Assumptions

- The signup → confirm-email → dashboard → onboarding chain is inferred from code; the seed confirms it first.
- Polish date strings are computed in Node and rendered in workerd; a mismatch fails loudly, and the `data-*` attributes stay the exact-value check.
- A run crossing Warsaw midnight between plan and confirm can flake (same as smoke).

## Success Criteria (Summary)

- A fresh user's full loop passes in Chromium locally and in the PR's `smoke` job, with the done row showing the catalog-implied next due month.
- User B's dashboard and profile show none of user A's data.
- Each risk spec goes red under a deliberate break, and the PR records the added CI minutes.
