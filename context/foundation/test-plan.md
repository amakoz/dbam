# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-10-27

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   team is worried about X, and the failure would surface somewhere in
   <area>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src`, `supabase/migrations`, `supabase/tests`, `scripts` (excluding generated database types, catalog snapshot migrations, docs, `context/archive/`, `dist/`). 24 squash-merged commits in the 30 days to 2026-10-27.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the _evidence that surfaced
this risk_ — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| #   | Risk (failure scenario)                                                                                                                                                                                         | Impact | Likelihood | Source (evidence — not anchor)                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A signed-in user sees or changes another user's health data (profile, exam plans, completions, reminder settings), including by forging another user's exam or identifier in a form post.                       | High   | High       | PRD §Success Criteria → Guardrails ("never exposed to another user"), PRD §NFR; interview Q1; hot-spot dirs `supabase/migrations` (10 changes/30d, each slice added tables), `src/pages/api` (23) |
| 2   | The core loop breaks in a real browser — sign-up → onboarding → due list → plan an exam → confirm it — through broken form wiring, redirects or dashboard sections, while the HTTP-level smoke run stays green. | High   | High       | PRD §Success Criteria → Primary; interview Q4 ("the real browser path"); hot-spot dirs `src/components/recommendations` (26), `src/pages` (21)                                                    |
| 3   | A reminder or nudge job emails the wrong people (opted out, consent withdrawn, exam already confirmed), sends the same message twice, or silently sends nothing.                                                | High   | High       | PRD FR-006, FR-007, FR-011, FR-012; interview Q3; hot-spot dir `src/lib/reminders` (18); roadmap M-01 S-04, S-06, S-07 (three jobs on one schedule)                                               |
| 4   | A confirmed or already-done exam is lost, lands in the wrong dashboard section, or gets a wrong next due date, so the user is never reminded again.                                                             | High   | Medium     | PRD US-03, FR-008, FR-009; archive `2026-10-05-confirm-exam-and-recurrence`; backlog B-04; hot-spot dir `src/lib/screenings` (14)                                                                 |
| 5   | Withdrawing consent leaves health data behind or keeps reminder emails going.                                                                                                                                   | High   | Low        | PRD §NFR (explicit, withdrawable consent); archive `2026-09-27-onboarding-profile` and its consent-withdrawal hardening follow-up                                                                 |
| 6   | Health data (profile answers, exam names, dates, email addresses) leaks into logs, request URLs or alert emails.                                                                                                | High   | Medium     | lessons.md "Grep gates are heuristics; privacy tests are the guard"; archive `2026-10-06-redirect-query-privacy`, `2026-10-06-error-tracking`                                                     |

High-impact, low-likelihood platform failures (Cloudflare or Supabase outage, a cron trigger not firing) belong to observability and alerting (roadmap F-07), not to this test rollout.

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                                                           | Must challenge                                                                                                                       | Context `/10x-research` must ground                                                                                               | Likely cheapest layer                                                                           | Anti-pattern to avoid                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| #1   | User B, signed in, never sees user A's exams or profile on any page, and a write request naming A's exam changes nothing of A's.                                                      | "RLS is tested in SQL, so the app is safe" — the app may use a client or code path that sidesteps the caller's identity.             | Which client each endpoint and page uses, how the caller identity reaches the query, every table holding health data.             | pgTAP for policies (exists) + HTTP-level forged requests; one two-user browser check in Phase 1 | Testing only that a signed-out request is rejected (authentication, not ownership).           |
| #2   | A fresh user can complete the whole loop by clicking through the rendered UI, and each step shows its business result (due list, planned row, confirmed row with next due date).      | "The HTTP smoke run posts the same forms, so the browser path works" — hydration, client validation and redirects are not exercised. | Sign-up confirmation mode locally, the onboarding redirect chain, dashboard sections and their accessible names, local test data. | e2e (browser) against a local build + local Supabase                                            | Selecting by CSS classes, fixed sleeps, asserting only the URL instead of what the user sees. |
| #3   | For each recipient rule (opt-out, withdrawn consent, already confirmed, already sent) exactly the right users get exactly one message, and an empty run sends nothing and reports it. | "The CI dry run reports `ok`, so selection is right" — `ok` proves the handler ran, not who was selected.                            | Candidate selection queries, claim/dedupe mechanism, the dry-run switch, how a run reports its result.                            | integration against local Supabase (pgTAP or Vitest + local DB)                                 | Asserting the job's own return value as the oracle; mocking the database the rules live in.   |
| #4   | Confirming an exam moves it out of "due", shows it as done on the appointment date, and shows the next due date the catalog interval implies, also across month ends and leap days.   | "Unit tests on the date rules cover it" — persistence and dashboard partitioning are separate steps.                                 | The confirm path end to end, where the next due date is computed and displayed, catalog intervals for the fixture exam.           | unit (exists) + one e2e step in Phase 1                                                         | Expected dates computed by calling the production date helper.                                |
| #5   | After withdrawal no health-data rows remain for the user and no later job run selects them.                                                                                           | "The withdraw function deletes rows" — rows added by later slices (reminders, nudges) may not be covered.                            | Every table added since the withdraw function was written, and the jobs' consent check.                                           | pgTAP / integration                                                                             | Checking only the tables that existed when the function was first written.                    |
| #6   | Feeding identifiable input through every log event, redirect and alert email leaves none of it in the output.                                                                         | "A grep found no `message` reads" — the same leak can be spelled another way.                                                        | Every output builder and redirect that carries user-derived values; existing redaction tests.                                     | unit (redaction tests exist) + HTTP-level redirect assertions                                   | Grep gates presented as the guard.                                                            |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name                     | Goal (one line)                                                                                                  | Risks covered        | Test types                 | Status        | Change folder |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------- | -------------------- | -------------------------- | ------------- | ------------- |
| 1   | Browser E2E for the core loop  | Prove a fresh user can finish the loop in a real browser with correct results, and a second user sees none of it | #2, #4, #1 (browser) | e2e                        | change opened | e2e-core-loop |
| 2   | Reminder recipient integration | Prove each job selects exactly the right recipients once, and an empty run sends nothing                         | #3, #5               | integration                | not started   | —             |
| 3   | Isolation and privacy sweep    | Prove forged-identifier writes change nothing and no output path carries identifiable data                       | #1, #6               | integration + unit + pgTAP | not started   | —             |
| 4   | Quality-gates wiring           | Make the e2e suite a required check and turn the gates into agent hooks                                          | cross-cutting        | gates + hooks              | not started   | —             |

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.
Recommendations in this section must be grounded in local manifests/configs
plus the MCP/tools actually exposed in the current session. If a useful docs
or search MCP such as Context7 or Exa.ai is not available, say that instead
of assuming access.

Test-base profile: **meaningful** — Vitest configured with 14 colocated test files (catalog rules, screening rules, reminders, email, observability), 7 pgTAP files for access rules, and a dependency-free HTTP smoke run of the main flows; no browser-level assertions.

| Layer                 | Tool                                           | Version | Notes                                                                         |
| --------------------- | ---------------------------------------------- | ------- | ----------------------------------------------------------------------------- |
| unit                  | Vitest                                         | ^5.0.3  | Colocated `*.test.ts`, `npm test`, CI `ci` job.                               |
| database access rules | pgTAP via Supabase CLI                         | 2.118.0 | `npx supabase test db`, CI `smoke` job, local Supabase.                       |
| HTTP smoke            | `scripts/smoke.mjs` (no dependencies)          | n/a     | Full run local only; production only with `SMOKE_READONLY=1`.                 |
| e2e                   | Playwright Test (`npm run test:e2e`), Chromium | 1.63.0  | Refuses a non-local base URL or Supabase URL, like the smoke run.             |
| visual                | `npm run ui:shots` + `npm run ui:check`        | n/a     | Screenshots for human/agent review and a token check; no pixel diff (see §7). |
| (optional) AI-native  | Playwright MCP — checked: 2026-10-27           | n/a     | For exploring the running app while writing e2e tests; not a CI layer.        |

**Stack grounding tools (current session):**

- Docs: Context7 is registered in `.mcp.json` but not exposed in this session — skipped; checked: 2026-10-27
- Search: web search available — used to confirm free model providers for CI review (not test tooling); checked: 2026-10-27
- Runtime/browser: Playwright MCP available — possible use while writing Phase 1 tests, not in CI; checked: 2026-10-27
- Provider/platform: GitHub via `gh` CLI (no MCP); no Cloudflare or Supabase MCP — not used; checked: 2026-10-27

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate                                   | Where                        | Required?                    | Catches                                                 |
| -------------------------------------- | ---------------------------- | ---------------------------- | ------------------------------------------------------- |
| lint + typecheck + design-token check  | local (pre-commit) + CI `ci` | required                     | syntax, type and design-system drift                    |
| Stop hook: lint on changed files       | agent loop (worker sessions) | required (wired)             | lint errors an agent would hand back                    |
| unit (Vitest)                          | CI `ci`                      | required                     | rule and wording regressions                            |
| access rules (pgTAP)                   | CI `smoke`                   | required                     | policy and grant regressions                            |
| HTTP smoke + scheduled-handler dry run | CI `smoke`                   | required                     | broken flows, broken cron wiring                        |
| e2e on the core loop                   | CI on PR                     | required after §3 Phase 1    | broken user path in a real browser, cross-user exposure |
| recipient-selection integration        | CI on PR                     | required after §3 Phase 2    | wrong or duplicate reminder recipients                  |
| per-edit / end-of-turn agent hooks     | agent loop                   | recommended after §3 Phase 4 | regressions at edit time                                |
| post-deploy health + read-only smoke   | CI `deploy`                  | required                     | environment-specific failures after deploy              |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

- **Location**: next to the module, as `<module>.test.ts` under `src/`.
- **Pattern**: keep logic pure and pass "now" / the current year as a parameter.
- **Reference test**: `src/lib/screenings/rules.test.ts`.
- **Run locally**: `npm test`.

### 6.2 Adding a database access-rule test

- **Location**: `supabase/tests/database/<area>.test.sql`.
- **Pattern**: one case per policy or grant; every new `public` table revokes `service_role` privileges (guarded in `appointment_reminders.test.sql`).
- **Reference test**: `supabase/tests/database/screening_records.test.sql`.
- **Run locally**: `npx supabase test db` against local Supabase.

### 6.3 Adding an e2e test

- **Where:** `tests/e2e/*.spec.ts`, shared UI steps and the oracle in `tests/e2e/support/core-loop.ts`, config `playwright.config.ts`, setup record `context/foundation/test-stack.md`.
- **Pattern:** a fresh user per test (sign up through the form, `e2e-<uuid>@example.com`); steps drive the UI only, no HTTP posts or Supabase client; wait for `astro-island[ssr]` to disappear before typing into an island form; role/label locators scoped to the dashboard section or the row `#screening-<slug>`; assert what the user sees plus the row's `data-*` contract; no sleeps. The oracle reads `catalog/entries/<slug>.json` and computes dates by hand, so specs never import production code (ESLint `no-restricted-imports` on `tests/e2e/**` and `playwright.config.ts`, enforced by `npm run lint` in CI). Name a `test.extend` callback parameter anything but `use` (`react-hooks/rules-of-hooks` applies to every `.ts` file).
- **Reference spec:** `tests/e2e/core-loop.spec.ts` (risks #2, #4); `tests/e2e/isolation.spec.ts` for two browser contexts (risk #1).
- **Run:** `npm run test:e2e` (or `-- tests/e2e/<name>.spec.ts`); local worker sessions take the shared DB lock and use `$DBAM_PORT`. Prove a new spec by a deliberate break: from a cold server so `webServer` rebuilds, never commit the break.
- **CI:** the `smoke` job runs it after the scheduled-handler dry run, with one retry. A `flaky` line in the Playwright log marks a test that failed and then passed on retry: treat it as a failure to investigate.

### 6.4 Adding a test for reminder recipient rules

- TBD — see §3 Phase 2 (exactly-once, right-recipient pattern).

### 6.5 Adding a test for a new write endpoint

- TBD — see §3 Phase 3 (forged-identifier write changes nothing pattern).

### 6.6 Per-rollout-phase notes

(Appended by each rollout phase's final sub-phase.)

**Phase 1 (`e2e-core-loop`):** follow-ups left out on purpose: rescheduling a plan via "Zmień termin", and month-end and leap-day next-due cases through the UI (the UI can only plan and confirm "today"; unit tests in `src/lib/screenings/` own them). The suite shares the `smoke` job; split it into its own required job (a branch-protection change, an owner setting) if it adds more than about 4 minutes there.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Kitchen sink and other dev-only pages** — dev only, 404 in production. Re-evaluate if a dev page ships to production. (Source: Phase 2 interview Q5.)
- **Pixel or visual snapshot diffs** — screenshots for review and the design-token check already cover design drift; snapshots would be noisy. Re-evaluate if a visual regression reaches production unnoticed. (Source: Phase 2 interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-10-27
- Stack versions last verified: 2026-10-27
- AI-native tool references last verified: 2026-10-27

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
