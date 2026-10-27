---
project: Dbam
version: 5
status: draft
created: 2026-09-26
updated: 2026-10-27
prd_version: 3
main_goal: speed
top_blocker: time
milestone_id: quality-and-architecture-evidence
milestone_seq: 2
milestone_status: open
---

# Roadmap: Dbam

> Derived from the owner's milestone description (anchors MS-01–MS-08 below) + auto-researched codebase baseline. M-01 was derived from `context/foundation/prd.md` (v3); see `## Milestone History`.
> Edit-in-place; the next milestone continues this file. Archive only when an independent roadmap replaces it.
> Items below are listed in dependency order. The "At a glance" table is the index. IDs continue from M-01 (F-01–F-09 and S-01–S-07 are in `## Done`).

## Milestone

**M-02: Quality and architecture evidence** — Status: open

- **Intent:** The shipped screening loop is guarded by a risk-first test plan and a browser-level suite that exercises it the way a user does; the codebase gets a written architecture review (map, feature research, refactoring plan, domain notes, two-page report); and every pull request gets an automated AI code review from CI at no model cost.
- **Source materials:** user description (anchors below), recorded 2026-10-27 after an audit of `origin/main` at `0d065e6`.
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:**
  - MS-01: A test-plan document names the product's top business risks and maps each one to test layers and quality gates.
  - MS-02: At least one automated suite drives the running app through a browser, as a user would, and guards a concrete risk named in the test plan; it runs in CI.
  - MS-03: A repository map documents the codebase's business capabilities, hot and frozen areas, structure, risk zones and unknowns.
  - MS-04: One feature is researched end to end with the map as input, ending in a feature overview and a technical-debt section whose structural claims are verified.
  - MS-05: A guard-first, phased, independently reversible refactoring plan exists for one debt item found in MS-04 (plan only; implementing it is not required).
  - MS-06: Domain notes under `context/domain/` name the ubiquitous language, subdomains, invariants and model-vs-code drift.
  - MS-07: A two-page architecture report combines MS-03–MS-06 in the owner's own words, defensible line by line.
  - MS-08: Every pull request to `main` gets an AI code review from a visible CI job that leaves a review comment on the PR, using a no-cost model provider.

## Vision recap

Adults 30+ in Poland forget or postpone age-appropriate screenings because nothing prompts them when they become eligible, so exams silently lapse and treatable conditions go undetected. Dbam turns a short profile into an importance-labeled list of due screenings and keeps reminding the user from recommendation → appointment date → confirmed completion → next due date. M-01 shipped that loop; M-02 makes it provably safe to change.

## North star

**S-08: the core screening loop is guarded by a browser-level suite tied to a test-plan risk** — the only mandatory item in this milestone with no existing evidence; with `main_goal: speed` and a fixed external deadline, it goes first.

> "North star" here means the smallest end-to-end slice whose successful delivery proves the milestone works. It is placed as early as its prerequisites allow; the other items only add value once it is in place.

## At a glance

| ID   | Change ID           | Outcome (user can …)                                                                                                      | Prerequisites          | PRD refs | Status   |
| ---- | ------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------- | -------- |
| F-10 | test-plan           | (foundation) a test plan ranks the top business risks and maps each to test layers and quality gates                      | —                      | MS-01    | done     |
| S-08 | e2e-core-loop       | the sign-up → onboarding → due list → plan → confirm path is exercised in a real browser in CI, guarding a test-plan risk | F-10                   | MS-02    | done     |
| S-09 | ai-code-review      | every pull request to `main` gets an AI review comment from a visible CI job, at no model cost                            | —                      | MS-08    | done     |
| F-11 | repo-map            | (foundation) a repository map shows capabilities, hot areas, structure, risk zones and unknowns                           | —                      | MS-03    | done     |
| F-12 | reminders-research  | (foundation) the reminder pipeline is researched end to end with the map as input, with a verified technical-debt section | F-11                   | MS-04    | done     |
| F-13 | reminders-refactor  | (foundation) a guard-first, phased refactoring plan exists for one reminder-pipeline debt item                            | F-12                   | MS-05    | done     |
| F-14 | domain-distillation | (foundation) domain notes name the ubiquitous language, subdomains, invariants and model-vs-code drift                    | —                      | MS-06    | done     |
| F-15 | architecture-report | (foundation) a two-page architecture report combines the map, feature research, refactoring plan and domain notes         | F-11, F-12, F-13, F-14 | MS-07    | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme               | Chain                                     | Note                                                                             |
| ------ | ------------------- | ----------------------------------------- | -------------------------------------------------------------------------------- |
| A      | Risk-first testing  | `F-10` → `S-08`                           | The mandatory gap; goes first under `main_goal: speed`.                          |
| B      | AI code review      | `S-09`                                    | Standalone; once merged, it also reviews every later PR in this milestone.       |
| C      | Architecture review | `F-11` → `F-12` → `F-13`; `F-14` → `F-15` | Read-only documents; `F-14` runs alongside the map chain and joins it at `F-15`. |

## Baseline

What's already in place in the codebase as of `2026-10-27` (auto-researched on `origin/main` at `0d065e6`, user-confirmed).
Items below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 7 SSR + React 19 islands, Tailwind 4 tokens, shadcn/ui; dashboard, onboarding and profile views (`src/pages/`), design-system check (`npm run ui:check`).
- **Backend / API:** present — form endpoints for auth, consent, profile, screenings (plan/unplan/done/undone/confirm) and reminders (`src/pages/api/`), all redirect-shaped.
- **Data:** present — Supabase migrations with RLS per user (`supabase/migrations/`), catalog snapshots from `catalog/entries/`.
- **Auth:** present — Supabase email/password, `PROTECTED_ROUTES` in `src/middleware.ts`, per-user RLS covered by pgTAP.
- **Deploy / infra:** present — Cloudflare Workers at a public `workers.dev` URL, cron triggers for reminders and nudges, CI (`ci`, `smoke`) gating `migrate` + `deploy` on `main`.
- **Observability:** present — structured error events in Workers Logs, failure email for reminder runs (F-07).
- **Tests:** partial — Vitest unit tests (catalog rules, recurrence, reminders), pgTAP access-rule tests, an HTTP-level smoke run of the main flows; Playwright is installed only for screenshots (`npm run ui:shots`), with no browser assertions. There is no test-plan document.
- **Architecture docs:** partial — per-change `research.md` in `context/archive/`; no repository map, no `context/domain/`, no architecture report.
- **PR review:** partial — the `/10x-impl-review` agent runs locally inside the change chain; no CI job reviews pull requests.

## Foundations

### F-10: Test plan

- **Outcome:** (foundation) a test plan ranks the product's top 5–7 business risks (mined from the PRD, this roadmap and the archived changes) and maps each risk to classic test layers and agent-side quality gates, naming which existing suites already cover it and which risk needs a browser-level suite.
- **Change ID:** test-plan
- **PRD refs:** MS-01
- **Unlocks:** S-08 (which risk the browser suite guards); quality gates for every later change
- **Prerequisites:** —
- **Parallel with:** S-09, F-11, F-14
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Strategy only — it must cite existing unit, pgTAP and smoke coverage instead of re-planning it, or the rollout duplicates work already in CI.
- **Status:** done

### F-11: Repository map

- **Outcome:** (foundation) a repository map, organised by business capability (onboarding and consent, recommendations, exam records, reminders and nudges, catalog curation), ranks areas by criticality and change activity, and lists risk zones, a first-day reading list and explicit unknowns.
- **Change ID:** repo-map
- **PRD refs:** MS-03
- **Unlocks:** F-12 (the map is research input), F-15
- **Prerequisites:** —
- **Parallel with:** F-10, S-09, F-14
- **Blockers:** —
- **Unknowns:** —
- **Risk:** A single-owner repo has a thin "people" signal; the map should say so as an unknown instead of inventing ownership.
- **Status:** done

### F-12: Reminder pipeline research

- **Outcome:** (foundation) the reminder pipeline (scheduled run → candidate selection → send chain → email, across appointment reminders, due-screening reminders and nudges) is traced end to end with the map as input, with test-coverage gaps, blast radius and a technical-debt section whose structural claims are confirmed or refuted by AST queries.
- **Change ID:** reminders-research
- **PRD refs:** MS-04
- **Unlocks:** F-13, F-15
- **Prerequisites:** F-11
- **Parallel with:** F-14
- **Blockers:** —
- **Unknowns:**
  - Is the reminder pipeline the right feature? It is the area that grew most in M-01 (three jobs on one cron path); if the map ranks another capability hotter, switch to it before research starts. — Owner: user. Block: no.
- **Risk:** Research-only; it must not drift into fixing what it finds.
- **Status:** done

### F-13: Reminder pipeline refactoring plan

- **Outcome:** (foundation) one debt item from F-12 is explored through three read-only lenses (current shape, decision history, migration feasibility), the options are ranked and verified, and the chosen option becomes a guard-first, phased, independently reversible plan with characterization tests as the safety harness.
- **Change ID:** reminders-refactor
- **PRD refs:** MS-05
- **Unlocks:** F-15
- **Prerequisites:** F-12
- **Parallel with:** F-14
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The plan is the deliverable; implementing it is parked so it cannot destabilise the production reminder runs before the milestone closes.
- **Status:** done

### F-14: Domain distillation

- **Outcome:** (foundation) `context/domain/` holds a domain map (ubiquitous language with sources in docs and code, subdomains classified as core / supporting / generic, aggregate candidates and their invariants with enforcement status, model-vs-code drift, a ranked fix list) and a compact glossary for agents.
- **Change ID:** domain-distillation
- **PRD refs:** MS-06
- **Unlocks:** F-15; a shared vocabulary for later changes
- **Prerequisites:** —
- **Parallel with:** F-10, S-09, F-11, F-12, F-13
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The Polish domain terms (badanie, przesiew, termin) and their English code names must both appear in the glossary, or agents keep translating them inconsistently.
- **Status:** done

### F-15: Architecture report

- **Outcome:** (foundation) a two-page architecture report summarises the map, the feature research, the refactoring plan and the domain notes, written and checked by the owner so every claim can be defended.
- **Change ID:** architecture-report
- **PRD refs:** MS-07
- **Unlocks:** the milestone's closing review
- **Prerequisites:** F-11, F-12, F-13, F-14
- **Parallel with:** S-08, S-09
- **Blockers:**
  - The report-generation prompt is not part of the installed toolkit packs (checked 2026-10-27); take it from the lesson page or write the report from the four artifacts by hand.
- **Unknowns:** —
- **Risk:** A one-shot generated report is easy to produce and hard to defend; the owner edits it after reading the four inputs.
- **Status:** proposed

## Slices

### S-08: Browser-level suite for the core loop

- **Outcome:** a browser-level suite, run in CI against a local build and local Supabase, signs up a fresh user, completes onboarding, sees the due list, plans an exam and confirms it, and asserts the business outcome at each step, guarding the risk F-10 ranks highest among those that cross auth, routing, API and database. It fails when that risk materialises.
- **Change ID:** e2e-core-loop
- **PRD refs:** MS-02
- **Prerequisites:** F-10
- **Parallel with:** S-09, F-11, F-12, F-13, F-14
- **Blockers:** —
- **Unknowns:**
  - Which risk does the suite guard? F-10 decides; the expected candidates are "a completed exam is lost or not rescheduled" and "one user sees another user's health data". — Owner: user. Block: no.
- **Risk:** It must never run against production (it signs up users, like the full smoke run), and the CI job must not slow the `smoke` gate enough to push deploys past the post-deploy retry window.
- **Status:** done

### S-09: AI code review in CI

- **Outcome:** every pull request to `main` triggers a visible CI job that sends the PR title, body and diff to a review agent, which posts a scored review comment on the PR (and an `ai-cr:passed` / `ai-cr:failed` label). The job logs show the review, and the model provider costs nothing.
- **Change ID:** ai-code-review
- **PRD refs:** MS-08
- **Prerequisites:** —
- **Parallel with:** F-10, S-08, F-11, F-12, F-13, F-14, F-15
- **Blockers:**
  - The owner creates a free model-provider account and adds its API key as a repository secret. — Owner: user.
- **Unknowns:**
  - Resolved (2026-10-27): GitHub Models (free through the workflow token) was retired on 2026-07-30, and CodeRabbit runs outside CI, so it shows no pipeline job. Default: a no-cost model through OpenRouter (`:free` variants: 20 requests/min, 50/day without purchased credits, enough for one review per PR). The model is a job input, so a Gemini free-tier key is a drop-in fallback.
  - Is the review a merge gate or advisory? Default: advisory label only, because free models are rate-limited and can be unavailable, and a provider outage must not block a release. — Owner: user. Block: no.
- **Risk:** Free providers may log prompts. The repo is public, so the diff is already public; the job must still never send secrets, `.env` files or generated files. Fork PRs get no secrets, so the job skips them cleanly instead of failing.
- **Status:** done

## Backlog Handoff

| Roadmap ID | Change ID           | Suggested issue title                                | Ready for `/10x-plan` | Notes                                                          |
| ---------- | ------------------- | ---------------------------------------------------- | --------------------- | -------------------------------------------------------------- |
| F-10       | test-plan           | Risk-first test plan with quality gates              | yes                   | Run `/10x-test-plan` (writes the plan, then drives its phases) |
| S-08       | e2e-core-loop       | Browser E2E suite for the core screening loop in CI  | no                    | Needs F-10; `/10x-e2e-setup`, then `/10x-e2e`                  |
| S-09       | ai-code-review      | AI code review job on every PR (free model)          | yes                   | Run `/10x-new ai-code-review`, then research → plan            |
| F-11       | repo-map            | Repository map by business capability                | yes                   | Run `/10x-repo-map`                                            |
| F-12       | reminders-research  | Feature research: reminder pipeline, with map        | no                    | Needs F-11                                                     |
| F-13       | reminders-refactor  | Refactoring plan for one reminder-pipeline debt item | no                    | Needs F-12                                                     |
| F-14       | domain-distillation | Domain distillation and agent glossary               | yes                   | Run `/10x-domain-distillation`                                 |
| F-15       | architecture-report | Two-page architecture report                         | no                    | Needs F-11–F-14                                                |

## Open Roadmap Questions

1. **What's the insight/differentiator?** (#26) Why hasn't a personal screening-nudge + NFZ-queue-watcher been built already? — Owner: user. Block: none (positioning only; from PRD Open Questions).
2. **What must be in place before public launch?** (#27) A medical reviewer signs off the catalog, a data-protection impact assessment (DPIA) covers server-stored health data, and a short memo records why the app is informational, not a medical device. Until then the catalog's 19 active entries carry the owner's non-medical review stamp (`reviewed_by = "owner (non-medical review)"`, 2026-09-29), which is not medical sign-off; S-02 shows only stamped entries, and `catalog:check` + pgTAP reject an active entry without a stamp (see `context/changes/screening-recommendations/change.md`). A POZ doctor's sign-off is still required before public launch. — Owner: user. Block: none (launch gate, not a planning gate).

3. **When and how does the automated AI catalog update run?** (#28) The plan is an AI job that periodically updates the screening catalog. The PRD has no requirement for it yet, and its updates must not reach users before medical review (they should land as drafts pending sign-off). — Owner: user. Block: none (not in this milestone's scope; needs a PRD requirement before it can become a slice).

## Parked

- **NFZ queue-watcher** — Why parked: PRD §Non-Goals, deferred to v2+.
- **Medicine tracker** — Why parked: PRD §Non-Goals, separate domain, deferred to v2+.
- **In-app appointment booking** — Why parked: PRD §Non-Goals; the app only records a date the user enters.
- **Family / shared accounts** — Why parked: PRD §Non-Goals; single user per account for v1.
- **Optional follow-up profiling (FR-010)** — Why parked: nice-to-have; `main_goal: speed` keeps the milestone on must-have FRs only.
- **AI at runtime (LLM-generated recommendations, "ask about this exam" chatbot)** — Why parked: research decision; rules are deterministic and the profile is never sent to an AI model. A chatbot is v2 and would get only the exam ID.
- **AI PR review bot (CodeRabbit)** — Why parked: owner decision (2026-10-05); superseded on 2026-10-27 by S-09, a review job inside CI, because CodeRabbit runs as a GitHub app outside the pipeline and shows no CI job or logs.
- **Automated post-deploy verification of the reminder dispatch path** (#57) — Why parked: user decision (2026-09-29, F-02). With many PRs merging, a `deploy` step that sends a real email on every `main` deploy is noise, and cron changes take up to 15 min to propagate, which is longer than the current post-deploy retry window. Revisit once reminders reach real users. Likely shape: a secret-protected trigger endpoint the `deploy` job calls, or a send-log check. See `context/changes/reminder-dispatch-path/research.md` §E.
- **Implementing the reminder-pipeline refactoring (F-13)** — Why parked: M-02 delivers the plan only (MS-05); running it against production reminder jobs belongs in a later milestone, through `/10x-implement`.
- **Shared AI-toolkit package on a registry** — Why parked: an alternative to S-09 for showing team-level AI tooling; one of the two is enough for MS-08-style evidence, and S-09 reuses the existing CI.

## Milestone History

- **M-01: First screening loop** (`first-screening-loop`) — closed 2026-10-27. A user signs up, consents, sees due screenings by importance tier, plans and confirms exams, and gets opt-in reminders and nudges that keep the cycle going (F-01–F-09, S-01–S-07, all done; source: `context/foundation/prd.md` v3, every must-have FR covered).

## Done

- **S-01: user can sign up or sign in, give explicit, separate consent to storing their health data, complete a minimal profile (birth year, sex, smoking history), and land on their dashboard; their profile is visible only to them.** — Archived 2026-09-28 → `context/archive/2026-09-27-onboarding-profile/`. Lesson: —.
- **F-01: (foundation) a curated catalog of screening types (the static table FR-009's resolution calls for) exists in the app's data — each with eligibility criteria (at least age and sex), an importance tier, and a repeat interval or an explicit "no known interval" marker — each entry carrying its source, publicly readable and free of personal data.** — Archived 2026-09-29 → `context/archive/2026-09-28-screening-catalog-v1/`. Lesson: —.
- **S-02: user can open their dashboard and see the screenings currently due for their profile, grouped by importance tier (most important first), each with the rule and source that put it there, or an explanatory empty state when nothing is due — with no wording that states or implies a diagnosis.** — Archived 2026-09-29 → `context/archive/2026-09-28-screening-recommendations/`. Lesson: —.
- **F-02: (foundation) a scheduled job runs in production on a timer and delivers an email to a test address; the path is exercised in CI or post-deploy verification.** — Archived 2026-09-30 → `context/archive/2026-09-29-reminder-dispatch-path/`. Lesson: —.
- **S-03: user can plan a recommended exam, optionally with the date of an appointment booked outside the app, or mark it already done, optionally with the month and year of the last exam, so it leaves the list until it is due again; both planned and done exams are shown on the dashboard.** — Archived 2026-09-30 → `context/archive/2026-09-30-record-appointment-date/`. Lesson: —.
- **S-04: user can opt in to (or out of) reminders and, when opted in, receives an email as a recorded appointment date approaches.** — Archived 2026-10-05 → `context/archive/2026-09-30-appointment-reminder/`. Lesson: —.
- **S-05: user can confirm that an exam happened on its recorded appointment date once that date has passed; its next due date is computed from that date and the catalog interval.** — Archived 2026-10-05 → `context/archive/2026-10-05-confirm-exam-and-recurrence/`. Lesson: —.
- **F-03: (foundation) a unit-test runner (Vitest) runs in CI and covers the catalog eligibility, tier and interval rules (`src/lib/catalog/recommend.ts`, `wording.ts`).** — Archived 2026-10-06 → `context/archive/2026-10-05-unit-test-suite/`. Lesson: —.
- **F-06: (foundation) a committed `.claude/settings.json` (un-ignored in `.gitignore`) adds a Claude Code `Stop` hook that runs ESLint on the files changed against `origin/main` and blocks the turn from ending while errors remain, so worker agents fix lint before reporting `done`. The hook runs only in worker sessions (`DBAM_CHANGE` set), so interactive human sessions are not slowed.** — Archived 2026-10-06 → `context/archive/2026-10-05-agent-stop-hook/`. Lesson: —.
- **F-08: (foundation) unit tests cover the recurrence rules in `src/lib/screenings/rules.ts` (`nextDueMonth`, `addMonths`/`addYears`, `partitionDashboard`, Warsaw midnight, Feb 29) and `describeLastDone` in `src/lib/screenings/format.ts`.** — Archived 2026-10-06 → `context/archive/2026-10-06-recurrence-unit-tests/`. Lesson: —.
- **F-07: (foundation) production errors are visible and alerted using Cloudflare and the existing email path only, on the Workers Free plan with no new data processor: (1) the SSR error path (`src/middleware.ts` / the 500 page) and the scheduled reminder job log one structured JSON error event (error code, route or job name, request id; never health data, emails or profile fields) to Workers Logs; (2) a failed reminder run emails the owner through the existing Resend path (`src/lib/heartbeat.ts`, `REMINDER_TEST_TO`); (3) saved queries for these events in the Workers Observability dashboard, documented in `README.md`.** — Archived 2026-10-06 → `context/archive/2026-10-06-error-tracking/`. Lesson: —.
- **F-05: (foundation) `npm run ui:shots` (Playwright, run as a script, not an MCP server) signs in a seeded fixture user against `BASE_URL`, and screenshots the dashboard, onboarding, profile and kitchen sink in light and dark at 1440px and 390px into a gitignored folder. Agents use it in `/10x-implement` manual-verification gates and attach the paths to PRs.** — Archived 2026-10-06 → `context/archive/2026-10-06-ui-verification-script/`. Lesson: —.
- **F-04: (foundation) a committed `.mcp.json` registers the Context7 MCP server, so every Claude Code session and worker worktree can pull current Astro, Supabase, Cloudflare Workers and Tailwind docs during `/10x-research` and `/10x-plan`; `CLAUDE.md` tells agents when to use it.** — Archived 2026-10-06 → `context/archive/2026-10-06-agent-docs-mcp/`. Lesson: —.
- **S-06: an opted-in user receives an email when a screening becomes due — including when a confirmed exam's repeat interval elapses — without re-entering the exam.** — Archived 2026-10-06 → `context/archive/2026-10-06-due-screening-reminder/`. Lesson: —.
- **F-09: (foundation) no user-derived health data reaches Cloudflare Workers Logs through request URLs: `/api/screenings` stops redirecting to `/dashboard?saved=…&slug=<slug>` and `?error=…&slug=<slug>` (`src/pages/api/screenings.ts:42,49`), the dashboard keeps its confirmation on the right row, and every other query param carrying user-derived values is audited (auth callback `?code=`, `profile.astro` `?reminders=`, any other redirect).** — Archived 2026-10-06 → `context/archive/2026-10-06-redirect-query-privacy/`. Lesson: —. Open human check 2.2: after deploy, confirm new `/dashboard` Workers Logs entries carry no `slug=`.
- **S-07: an opted-in user gets a nudge when a selected exam has no appointment date after some days, and a follow-up asking them to confirm completion once an appointment date has passed unconfirmed.** — Archived 2026-10-06 → `context/archive/2026-10-06-follow-up-nudges/`. Lesson: —.
- **F-11: (foundation) a repository map, organised by business capability (onboarding and consent, recommendations, exam records, reminders and nudges, catalog curation), ranks areas by criticality and change activity, and lists risk zones, a first-day reading list and explicit unknowns.** — Archived 2026-10-27 → `context/archive/2026-10-27-repo-map/`. Lesson: —.
- **F-10: (foundation) a test plan ranks the product's top business risks and maps each to test layers and quality gates.** — Merged 2026-10-27 in PR #89 (change `test-plan`, not archived). Lesson: —.
- **S-08: a browser-level suite, run in CI against a local build and local Supabase, signs up a fresh user, completes onboarding, sees the due list, plans an exam and confirms it, and asserts the business outcome at each step.** — Archived 2026-10-27 → `context/archive/2026-10-27-e2e-core-loop/`. Lesson: —.
- **F-12: (foundation) the reminder pipeline (scheduled run → candidate selection → send chain → email, across appointment reminders, due-screening reminders and nudges) is traced end to end with the map as input, with test-coverage gaps, blast radius and a technical-debt section whose structural claims are confirmed or refuted by AST queries.** — Archived 2026-10-27 → `context/archive/2026-10-27-reminders-research/`. Lesson: —.
- **F-13: (foundation) one debt item from F-12 is explored through three read-only lenses (current shape, decision history, migration feasibility), the options are ranked and verified, and the chosen option becomes a guard-first, phased, independently reversible plan with characterization tests as the safety harness.** — Archived 2026-10-27 → `context/archive/2026-10-27-reminders-refactor/`. Lesson: —.
- **F-14: (foundation) `context/domain/` holds a domain map (ubiquitous language with sources in docs and code, subdomains classified as core / supporting / generic, aggregate candidates and their invariants with enforcement status, model-vs-code drift, a ranked fix list) and a compact glossary for agents.** — Archived 2026-10-27 → `context/archive/2026-10-27-domain-distillation/`. Lesson: —.
- **S-09: every pull request to `main` triggers a visible CI job that sends the PR title, body and diff to a review agent, which posts a scored review comment on the PR (and an `ai-cr:passed` / `ai-cr:failed` label). The job logs show the review, and the model provider costs nothing.** — Archived 2026-10-27 → `context/archive/2026-10-27-ai-code-review/`. Lesson: —.
