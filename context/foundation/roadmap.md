---
project: Dbam
version: 6
status: draft
created: 2026-09-26
updated: 2026-10-28
prd_version: 3
main_goal: quality
top_blocker: none
milestone_id: hardening-the-screening-loop
milestone_seq: 3
milestone_status: open
---

# Roadmap: Dbam

> Derived from the owner's milestone description (anchors MS-01–MS-07 below), `context/foundation/backlog.md`, the archived F-13 plan (`context/archive/2026-10-27-reminders-refactor/plan.md`) and `context/domain/domain-distillation.md`, + auto-researched codebase baseline. M-01 was derived from `context/foundation/prd.md` (v3), M-02 from an owner description; see `## Milestone History`.
> Edit-in-place; the next milestone continues this file. Archive only when an independent roadmap replaces it.
> Items below are listed in dependency order. The "At a glance" table is the index. IDs continue from M-02 (F-01–F-15 and S-01–S-09 are in `## Done`).

## Milestone

**M-03: Hardening the screening loop** — Status: open

- **Intent:** The reminder pipeline runs on one tested runner, no user plan or catalog entry vanishes silently, and the remaining guard and copy gaps are closed. The PRD is unchanged (v3).
- **Source materials:** user description (anchors below), recorded 2026-10-28, drawing on `context/foundation/backlog.md`, `context/archive/2026-10-27-reminders-refactor/plan.md` and `context/domain/domain-distillation.md`.
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:**
  - MS-01: The three reminder jobs (appointment reminders, due-screening reminders, follow-up nudges) run on one shared, tested claim → send → mark runner, as planned in F-13, shipped one PR per plan phase.
  - MS-02: A user's plan never disappears: a plan whose catalog entry is missing never hides its screening or its completion.
  - MS-03: A catalog entry cannot silently move backwards or go stale: `catalog:check` refuses a backward status move (only draft → active → retired) and CI flags an entry past its next review date without hiding it from users.
  - MS-04: `CLAUDE.md` states the temporary rule that the orchestrator merges green PRs and how to switch back to human-only merges.
  - MS-05: English copy uses "screening" for the catalog item and "exam" for the user's own; Polish copy ("zalecenia") stays as it is.
  - MS-06: The remaining pure modules have unit tests.
  - MS-07: The date, age and consent rules that only the app enforces today are mirrored as database check constraints, added without breaking existing rows, with database tests.

## Vision recap

Adults 30+ in Poland forget or postpone age-appropriate screenings because nothing prompts them when they become eligible, so exams silently lapse and treatable conditions go undetected. Dbam turns a short profile into an importance-labeled list of due screenings and keeps reminding the user from recommendation → appointment date → confirmed completion → next due date. M-01 shipped that loop, M-02 made it provably safe to change; M-03 hardens it where the architecture review found gaps.

## North star

**S-10: a plan whose catalog entry is missing still shows its screening and its completion** — the only owner-confirmed bug in this milestone and the one user-visible guarantee in its intent ("no user plan vanishes silently"); with `main_goal: quality` it goes first, alongside the long F-16 chain.

> "North star" here means the smallest end-to-end slice whose successful delivery proves the milestone works. It is placed as early as its prerequisites allow; the other items only add value once it is in place.

## At a glance

| ID   | Change ID            | Outcome (user can …)                                                                                                 | Prerequisites | PRD refs | Status   |
| ---- | -------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------- | -------- | -------- |
| F-16 | reminders-runner     | (foundation) the three reminder jobs run on one shared, tested claim → send → mark runner                            | —             | MS-01    | ready    |
| S-10 | missing-entry-plan   | a user whose plan's catalog entry is missing still sees that screening and its completion                            | —             | MS-02    | done     |
| F-17 | catalog-check-guards | (foundation) `catalog:check` refuses backward status moves and warns in CI on entries past their review date         | —             | MS-03    | done     |
| F-18 | merge-rule-docs      | (foundation) `CLAUDE.md` states the temporary orchestrator-merge rule and how to switch back                         | —             | MS-04    | ready    |
| S-11 | en-copy-terms        | an English-language user reads "screening" for a catalog item and "exam" for their own, consistently                 | —             | MS-05    | ready    |
| F-19 | pure-module-tests    | (foundation) the remaining pure modules have unit tests                                                              | F-17          | MS-06    | proposed |
| F-20 | db-check-constraints | (foundation) the app-only date, age and consent rules are also database check constraints, covered by database tests | —             | MS-07    | ready    |

## Baseline

What's already in place in the codebase as of `2026-10-28` (auto-researched on `origin/main` at `e556258`).
Items below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 7 SSR + React 19 islands, Tailwind 4 tokens, shadcn/ui; dashboard, onboarding and profile views (`src/pages/`), design-system check (`npm run ui:check`).
- **Backend / API:** present — form endpoints for auth, consent, profile, screenings and reminders (`src/pages/api/`), all redirect-shaped.
- **Data:** present — Supabase migrations with per-user RLS (`supabase/migrations/`), catalog snapshots from `catalog/entries/`.
- **Auth:** present — Supabase email/password, `PROTECTED_ROUTES` in `src/middleware.ts`, per-user RLS covered by pgTAP.
- **Deploy / infra:** present — Cloudflare Workers, cron triggers for reminders and nudges, CI (`ci`, `smoke`) gating `migrate` + `deploy` on `main`.
- **Observability:** present — structured error events in Workers Logs, failure email for reminder runs (F-07); its production checks are still open (backlog B-02, human).
- **Tests:** partial — Vitest unit tests over catalog, screenings, email and reminders modules, pgTAP access-rule tests, HTTP smoke, a Playwright browser suite (`tests/e2e/`) and a risk-first test plan (`context/foundation/test-plan.md`); the pure modules listed in backlog B-11 and the reminder jobs themselves have no tests.
- **Architecture docs:** present — repository map, reminder-pipeline research, refactoring plan, domain map and glossary, architecture report (M-02).
- **PR review:** present — advisory AI review job on every PR (`.github/workflows/ai-review.yml`).

## Foundations

### F-16: Reminder jobs on one shared runner

- **Outcome:** (foundation) the archived F-13 plan is implemented: characterization tests pin today's three jobs, a pure claim → send → mark runner with production dependencies replaces their copied loop, and the appointment and due builders are extracted. Shipped as 7 PRs from one change folder, one per plan phase as the plan's Migration Notes require: phases 1+2 together, then 3, 4, 5, 6, 7 and 8 each alone. Done when the last phase merges and the change is archived.
- **Change ID:** reminders-runner
- **PRD refs:** MS-01
- **Unlocks:** a tested reminder pipeline for every later reminder change (the backlog's appointment-budget and catalog-status drift, D-01/D-05, both land in these jobs)
- **Prerequisites:** —
- **Parallel with:** S-10, F-17, F-18, S-11, F-19, F-20
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Every merge deploys to the production cron, so each phase is its own rollback unit; the characterization tests (phases 1+2) land first and must stay green through every later phase. It touches only the reminder modules, so it runs beside every other item.
- **Status:** ready

### F-17: Catalog check guards

- **Outcome:** (foundation) `catalog:check` fails on a backward status move (anything other than draft → active → retired), the allowed transitions are documented in `catalog/README.md`, and CI prints a warning (never a failure, never hiding the entry from users) for every entry past its `next_review_due`. Covers backlog B-14 and B-15 in one change.
- **Change ID:** catalog-check-guards
- **PRD refs:** MS-03
- **Unlocks:** F-19 (the catalog-script tests cover the new guards once); closes drift D-02 and D-08
- **Prerequisites:** —
- **Parallel with:** F-16, S-10, F-18, S-11, F-20
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The transition check needs the previous status of each entry; reading it from the wrong baseline would either block legitimate first activations or let a demotion through. The review-date warning must stay advisory so a stale date never blocks a deploy.
- **Status:** done

### F-18: Merge rule in CLAUDE.md

- **Outcome:** (foundation) `CLAUDE.md` states that, while production is a test environment, the orchestrator may merge green PRs, and how the owner switches back to human-only merges. Covers backlog B-03.
- **Change ID:** merge-rule-docs
- **PRD refs:** MS-04
- **Unlocks:** consistent merge instructions for every agent that reads only `CLAUDE.md`
- **Prerequisites:** —
- **Parallel with:** F-16, S-10, F-17, S-11, F-19, F-20
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Docs-only, but it sits beside the hard rule "never run `gh pr merge`" — the wording must make clear which agent may merge and that workers still never do.
- **Status:** ready

### F-19: Unit tests for the remaining pure modules

- **Outcome:** (foundation) the pure modules backlog B-11 lists (password policy, profile-form parsing and pack-years, error-code mapping, the catalog scripts, and the date and format helpers tested only indirectly today) have colocated unit tests in the existing runner.
- **Change ID:** pure-module-tests
- **PRD refs:** MS-06
- **Unlocks:** a safety net for later changes to those modules
- **Prerequisites:** F-17
- **Parallel with:** F-16, S-10, F-18, S-11, F-20
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sequenced after F-17 because both edit the catalog scripts; writing their tests before the guards land would mean rewriting them. Tests pin current behaviour only — a bug they reveal goes to the backlog, not into this change.
- **Status:** proposed

### F-20: Database check constraints for app-only rules

- **Outcome:** (foundation) an additive migration mirrors the past-date window, the age floor and the consent version — today enforced only in the API routes — as database check constraints, with database tests for each. Covers backlog B-17.
- **Change ID:** db-check-constraints
- **PRD refs:** MS-07
- **Unlocks:** a database that rejects a direct write the API would refuse
- **Prerequisites:** —
- **Parallel with:** F-16, S-10, F-17, F-18, S-11, F-19
- **Blockers:** —
- **Unknowns:** —
- **Risk:** A constraint that existing production rows violate fails the CI `migrate` job and blocks every deploy; a date window relative to "today" cannot be a plain check constraint. The plan must check existing data first and pick a form that validates new writes only where needed.
- **Status:** ready

## Slices

### S-10: A plan with a missing catalog entry stays visible

- **Outcome:** a user whose plan points to a catalog entry the dashboard cannot load still sees that screening's tier item and its completion; the plan never hides them. The F-08 test's expectation is updated to the fixed behaviour. Covers backlog B-04.
- **Change ID:** missing-entry-plan
- **PRD refs:** MS-02
- **Prerequisites:** —
- **Parallel with:** F-16, F-17, F-18, S-11, F-19, F-20
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The dashboard partition rule decides where every exam shows; the fix must keep "each exam shows in one place" for every other plan, so the existing partition tests stay the guard.
- **Status:** done

### S-11: English copy says "screening" and "exam" consistently

- **Outcome:** an English-language user reads "screening" for a catalog item and "exam" for their own planned or done one, everywhere in the app; Polish copy is unchanged. Covers backlog B-16.
- **Change ID:** en-copy-terms
- **PRD refs:** MS-05
- **Prerequisites:** —
- **Parallel with:** F-16, S-10, F-17, F-18, F-19, F-20
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Copy only, but strings pinned by the wording tests or asserted by the e2e suite change with it; update those in the same change.
- **Status:** ready

## Backlog Handoff

| Roadmap ID | Change ID            | Suggested issue title                                      | Ready for `/10x-plan` | Notes                                                                               |
| ---------- | -------------------- | ---------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------- |
| F-16       | reminders-runner     | Implement the reminder-runner refactoring plan (F-13)      | yes                   | Plan exists in the archive; 7 PRs (phases 1+2, then 3–8 each alone). Pair with S-10 |
| S-10       | missing-entry-plan   | A plan with a missing catalog entry must not hide its exam | yes                   | North star; parallel with F-16                                                      |
| F-17       | catalog-check-guards | `catalog:check`: forward-only status, review-date warning  | yes                   | Pair with F-20                                                                      |
| F-18       | merge-rule-docs      | `CLAUDE.md`: temporary orchestrator-merge rule             | yes                   | Docs-only; fits any gap                                                             |
| S-11       | en-copy-terms        | EN copy: "screening" vs "exam"                             | yes                   | —                                                                                   |
| F-19       | pure-module-tests    | Unit tests for the remaining pure modules                  | no                    | Needs F-17                                                                          |
| F-20       | db-check-constraints | DB check constraints for app-only date/age/consent rules   | yes                   | Pair with F-17; takes the shared DB lock                                            |

## Open Roadmap Questions

1. **What's the insight/differentiator?** (#26) Why hasn't a personal screening-nudge + NFZ-queue-watcher been built already? — Owner: user. Block: none (positioning only; from PRD Open Questions).
2. **What must be in place before public launch?** (#27) A medical reviewer signs off the catalog, a data-protection impact assessment (DPIA) covers server-stored health data, and a short memo records why the app is informational, not a medical device. Until then the catalog's 19 active entries carry the owner's non-medical review stamp (`reviewed_by = "owner (non-medical review)"`, 2026-09-29), which is not medical sign-off; S-02 shows only stamped entries, and `catalog:check` + pgTAP reject an active entry without a stamp (see `context/changes/screening-recommendations/change.md`). A POZ doctor's sign-off is still required before public launch. — Owner: user. Block: none (launch gate, not a planning gate).

3. **When and how does the automated AI catalog update run?** (#28) The plan is an AI job that periodically updates the screening catalog. The PRD has no requirement for it yet, and its updates must not reach users before medical review (they should land as drafts pending sign-off). — Owner: user. Block: none (not in this milestone's scope; needs a PRD requirement before it can become a slice).

## Parked

- **NFZ queue-watcher** — Why parked: PRD §Non-Goals, deferred to v2+.
- **Medicine tracker** — Why parked: PRD §Non-Goals, separate domain, deferred to v2+.
- **In-app appointment booking** — Why parked: PRD §Non-Goals; the app only records a date the user enters.
- **Family / shared accounts** — Why parked: PRD §Non-Goals; single user per account for v1.
- **Optional follow-up profiling (FR-010)** — Why parked: nice-to-have; M-01 kept to must-have FRs under `main_goal: speed`, and no later milestone has taken it up.
- **AI at runtime (LLM-generated recommendations, "ask about this exam" chatbot)** — Why parked: research decision; rules are deterministic and the profile is never sent to an AI model. A chatbot is v2 and would get only the exam ID.
- **AI PR review bot (CodeRabbit)** — Why parked: owner decision (2026-10-05); superseded on 2026-10-27 by S-09, a review job inside CI, because CodeRabbit runs as a GitHub app outside the pipeline and shows no CI job or logs.
- **Automated post-deploy verification of the reminder dispatch path** (#57) — Why parked: user decision (2026-09-29, F-02). With many PRs merging, a `deploy` step that sends a real email on every `main` deploy is noise, and cron changes take up to 15 min to propagate, which is longer than the current post-deploy retry window. Revisit once reminders reach real users. Likely shape: a secret-protected trigger endpoint the `deploy` job calls, or a send-log check. See `context/changes/reminder-dispatch-path/research.md` §E.
- **Shared AI-toolkit package on a registry** — Why parked: an alternative to S-09 for showing team-level AI tooling; one of the two is enough for MS-08-style evidence, and S-09 reuses the existing CI.
- **F-07 production checks (backlog B-02)** — Why parked: owner decision (2026-10-28); dashboard and production steps only a human can do, so they stay a backlog item, not a slice.

## Milestone History

- **M-01: First screening loop** (`first-screening-loop`) — closed 2026-10-27. A user signs up, consents, sees due screenings by importance tier, plans and confirms exams, and gets opt-in reminders and nudges that keep the cycle going (F-01–F-09, S-01–S-07, all done; source: `context/foundation/prd.md` v3, every must-have FR covered).
- **M-02: Quality and architecture evidence** (`quality-and-architecture-evidence`) — closed 2026-10-28. The core loop is guarded by a risk-first test plan and a browser-level suite in CI, every PR gets an advisory no-cost AI review, and the codebase has a repository map, reminder-pipeline research, a refactoring plan, a domain map and a two-page architecture report (F-10–F-15, S-08, S-09, all done; source: owner description, anchors MS-01–MS-08).

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
- **F-15: (foundation) a two-page architecture report summarises the map, the feature research, the refactoring plan and the domain notes, written and checked by the owner so every claim can be defended.** — Archived 2026-10-28 → `context/archive/2026-10-27-architecture-report/`. Lesson: —.
- **S-10: a user whose plan points to a catalog entry the dashboard cannot load still sees that screening's tier item and its completion; the plan never hides them. The F-08 test's expectation is updated to the fixed behaviour. Covers backlog B-04.** — Archived 2026-10-28 → `context/archive/2026-10-28-missing-entry-plan/`. Lesson: —.
- **F-17: (foundation) `catalog:check` fails on a backward status move (anything other than draft → active → retired), the allowed transitions are documented in `catalog/README.md`, and CI prints a warning (never a failure, never hiding the entry from users) for every entry past its `next_review_due`. Covers backlog B-14 and B-15 in one change.** — Archived 2026-10-28 → `context/archive/2026-10-28-catalog-check-guards/`. Lesson: —.
