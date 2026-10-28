# Backlog: findings for later

> Findings raised during changes that are not roadmap slices yet. Each one is a candidate slice, a decision for the owner, or an agent-workflow fix.
> Edit in place: when an item becomes a roadmap slice or is resolved, move it to **Done** with a pointer. Started 2026-10-06 from the orchestrated run of F-03, F-05, F-06, F-07 and F-08 (#77–#81).

**Priority**

- **P1**: do before S-06 / S-07 ship to real users.
- **P2**: decide or do soon; it affects correctness or the agent flow.
- **P3**: do when convenient.

**Owner:** _human_ means a decision or a production/dashboard step; _agent_ means a change an orchestrated worker can do once the owner approves it.

## P1

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

## P2

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

### B-18 Validate the consent version check

- **What / Next:** F-20 left `health_data_consents_version_format` `NOT VALID`; _Human:_ run the read-only query, then _Agent:_ one `VALIDATE` migration — see `context/archive/2026-10-28-db-check-constraints/follow-ups/validate-consent.md`.

## P3

### B-12 Hard guard for error-message reads

- **What:** the `error.message` grep gate is only a heuristic (see `lessons.md`, "Grep gates are heuristics"). An ESLint `no-restricted-syntax` rule for `.message` reads and `{ message }` destructuring under `src/lib/**` and `src/pages/**`, with `observability.ts` exempt, would make it a real guard.
- **Next:** _Agent:_ optional; the privacy unit tests are the guard today.

### B-13 `ui:shots` coverage gaps

- **What:** no English-locale pass, no withdrawn or error onboarding variants, no CI artifact (the kitchen sink returns 404 under CI's preview server).
- **Next:** _Agent:_ extend when a UI change needs it.

## Before public launch

Owner answers of 2026-10-28 that wait for the launch gate (roadmap Open Roadmap Question 2; `roadmap.md` is not edited here):

- **Q-04** appointment-reminder cap of 92 users/day: accepted for now; revisit before launch (paid Resend plan or rotate order).
- **Q-09** medical reviewer, DPIA, MDR memo: no public launch planned, gate items not started.
- **Q-10** re-consent on a material consent-text change and consent proof after account deletion: deferred to the launch gate (legal advice then).

## Done

- Agent-workflow fixes from the 2026-10-06 run are applied in the orchestrator skill (local, gitignored):
  - a spawn retry and agent-name state;
  - `DBAM_ROLE` for reviewer panes;
  - a `prompt` subcommand that confirms submission;
  - merge-not-rebase for pushed branches;
  - the merge policy setting;
  - `astro dev --host 127.0.0.1`;
  - PR-stage manual checks.
- B-01 Health data in Cloudflare invocation-log URLs: done as roadmap F-09 (owner-approved 2026-10-06). The screening slug moved from the `/dashboard` redirect query to a short-lived `HttpOnly` flash cookie; the URL keeps only the `?saved=`/`?error=` code and the `#screening-<slug>` fragment. Change: `context/archive/2026-10-06-redirect-query-privacy/`. Still open, human, non-blocking: after deploy, check in Workers Observability that new `/dashboard` invocation entries carry no `slug=` (and whether the query string is kept at all).
- B-08 Usage limit and interruptions in orchestrated runs: done in the local orchestrator skill (a `spawn-worker.sh wait` subcommand), recorded in `context/changes/agent-docs-mcp/decisions.md`.
- B-10 Noisy SHA write-back commits: fixed by the worker protocol (bookkeeping is committed with the phase), recorded in `context/changes/agent-docs-mcp/decisions.md`.
- B-03 `CLAUDE.md` merge rule is out of date: became roadmap F-18 (`merge-rule-docs`), M-03, 2026-10-28.
- B-04 A plan with a missing catalog entry hides its screening: became roadmap S-10 (`missing-entry-plan`), M-03, 2026-10-28.
- B-11 Unit tests for the remaining pure modules: became roadmap F-19 (`pure-module-tests`), M-03, 2026-10-28.
- B-14 Catalog entries move forward only and B-15 Flag catalog entries past `next_review_due` in CI: became one roadmap item, F-17 (`catalog-check-guards`), M-03, 2026-10-28.
- B-16 Unify EN copy: screening vs exam: became roadmap S-11 (`en-copy-terms`), M-03, 2026-10-28.
- B-17 Mirror app-only date/age rules as DB check constraints: became roadmap F-20 (`db-check-constraints`), M-03, 2026-10-28.
