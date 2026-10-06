# Backlog: findings for later

> Findings raised during changes that are not roadmap slices yet. Each one is a candidate slice, a decision for the owner, or an agent-workflow fix.
> Edit in place: when an item becomes a roadmap slice or is resolved, move it to **Done** with a pointer. Started 2026-10-06 from the orchestrated run of F-03, F-05, F-06, F-07 and F-08 (#77–#81).

**Priority**

- **P1**: do before S-06 / S-07 ship to real users.
- **P2**: decide or do soon; it affects correctness or the agent flow.
- **P3**: do when convenient.

**Owner:** _human_ means a decision or a production/dashboard step; _agent_ means a change an orchestrated worker can do once the owner approves it.

## P1

### B-01 Health data in Cloudflare invocation-log URLs

- **What:** `/api/screenings` redirects to `/dashboard?saved=<intent>&slug=<slug>`, or on failure `?error=<code>&slug=<slug>` (`src/pages/api/screenings.ts:42,49`). Workers Logs records each request URL, so the slug, which names the screening a user planned or marked done, can sit in logs for 3 days (7 from 2026-12-01).
- **Next:**
  - _Human:_ confirm whether `$workers.event.request.url` keeps the query string (F-07 manual check 3.7).
  - _Agent:_ if it does, add a slice before S-06/S-07 that moves `slug` to a flash cookie or the URL fragment and audits other query params (auth callback `?code=`, `profile.astro` `?reminders=`).
- **Source:** `context/archive/2026-10-06-error-tracking/follow-ups/redirect-slug-leak.md`.

### B-02 F-07 production checks not done yet

- **What:** F-07 (#81) merged with its production checks still open. Until they are done, a failed reminder run may still go unnoticed.
- **Next:** _Human:_
  - create the four saved queries in Workers Observability;
  - confirm the JSON fields are filterable;
  - check whether Custom Alerts work on the Free plan;
  - confirm `REMINDER_TEST_TO` is set in production;
  - confirm an SSR event's `requestId` equals `$metadata.rayId`;
  - confirm the failure email really arrives.
- **Source:** #81 description; `context/archive/2026-10-06-error-tracking/plan.md` Progress 3.3–3.7.

### B-03 `CLAUDE.md` merge rule is out of date

- **What:** `CLAUDE.md` says merging to `main` is human-only. Since 2026-10-06 the owner lets the orchestrator merge green PRs while production is a test environment. Agents that read only `CLAUDE.md` get conflicting instructions.
- **Next:** _Agent:_ a docs PR that states the temporary rule and how to revert it. _Human:_ switch it back when production is ready for users.

## P2

### B-04 A plan with a missing catalog entry hides its screening

- **What:** `partitionDashboard` skips a plan whose catalog entry is missing, but `planned` is built from all plans (`src/lib/screenings/rules.ts:257`). Such a plan still hides that screening's tier item (`:271`) and its completion (`:263`). F-08 pinned the current behaviour without changing it.
- **Next:** _Human:_ decide whether this is a bug. If so, an _agent_ fixes it and the F-08 test's expectation is updated.
- **Source:** `context/archive/2026-10-06-recurrence-unit-tests/follow-ups/missing-entry-plan.md`.

### B-05 F-04 MCP approval in worker sessions

- **What:** project-scoped MCP servers in `.mcp.json` ask for a one-time approval per machine. It is unknown whether that blocks Herdr worker sessions started with `--permission-mode auto`.
- **Next:** _Agent:_ answer this in F-04 research before planning. F-04 is parked: its first step (`/10x-new`) was cut off by the usage limit, so no change folder exists yet.

### B-06 PRD testing line

- **What:** `prd.md:142` (testing NFR) names only the catalog rules, while F-08 covers the recurrence rules and F-07 adds observability tests.
- **Next:** _Human:_ decide whether to reword it. Product docs stay owner-edited.

### B-07 Review the UI screenshots

- **What:** nobody has judged the visual quality of the `kitchen-sink-*` and `profile-mobile-*` shots from F-05 (#80).
- **Next:** _Human:_ `npx playwright install chromium --only-shell`, then `npm run ui:shots` against a local dev server.

### B-09 Workers Logs Free-plan change on 2026-12-01

- **What:** from 2026-12-01 the Free plan allows 0.5 GB/day with 7-day retention, and logging stops at the cap until 00:00 UTC.
- **Next:** _Human:_ re-check log volume after S-06/S-07 add traffic; the README's "Errors and alerts" section has the numbers.

## P3

### B-11 Unit tests for the remaining pure modules

- **What:** not yet covered: `password.ts`, `parseProfileForm`/`packYears`, `errors.ts`, `auth-errors.ts`, `scripts/catalog/*`, and `isIsoDate`, `screeningFormBounds`, `formatDay`, `formatMonth` directly.
- **Next:** _Agent:_ a foundation slice reusing the F-03 runner. Candidate cases are in the archived plans.
- **Source:** "What We're NOT Doing" in `context/archive/2026-10-05-unit-test-suite/plan.md` and `context/archive/2026-10-06-recurrence-unit-tests/plan.md`.

### B-12 Hard guard for error-message reads

- **What:** the `error.message` grep gate is only a heuristic (see `lessons.md`, "Grep gates are heuristics"). An ESLint `no-restricted-syntax` rule for `.message` reads and `{ message }` destructuring under `src/lib/**` and `src/pages/**`, with `observability.ts` exempt, would make it a real guard.
- **Next:** _Agent:_ optional; the privacy unit tests are the guard today.

### B-13 `ui:shots` coverage gaps

- **What:** no English-locale pass, no withdrawn or error onboarding variants, no CI artifact (the kitchen sink returns 404 under CI's preview server).
- **Next:** _Agent:_ extend when a UI change needs it.

## Done

- Agent-workflow fixes from the 2026-10-06 run are applied in the orchestrator skill (local, gitignored):
  - a spawn retry and agent-name state;
  - `DBAM_ROLE` for reviewer panes;
  - a `prompt` subcommand that confirms submission;
  - merge-not-rebase for pushed branches;
  - the merge policy setting;
  - `astro dev --host 127.0.0.1`;
  - PR-stage manual checks.
- B-08 Usage limit and interruptions in orchestrated runs: done in the local orchestrator skill (a `spawn-worker.sh wait` subcommand), recorded in `context/changes/agent-docs-mcp/decisions.md`.
- B-10 Noisy SHA write-back commits: fixed by the worker protocol (bookkeeping is committed with the phase), recorded in `context/changes/agent-docs-mcp/decisions.md`.
