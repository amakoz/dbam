---
project: Dbam
version: 3
status: draft
created: 2026-09-26
updated: 2026-09-29
prd_version: 2
main_goal: speed
top_blocker: decisions
milestone_id: first-screening-loop
milestone_seq: 1
milestone_status: open
---

# Roadmap: Dbam

> Derived from `context/foundation/prd.md` (v2) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-01: First screening loop** — Status: open

- **Intent:** A user can sign up, complete onboarding, see screenings due for their profile, record and confirm an exam, and get opt-in email reminders that keep the exam cycle going — the PRD's primary success criterion, end to end.
- **Source materials:** `context/foundation/prd.md` (v2); catalog and compliance research in `context/foundation/screening-catalog-research.md` (resolves the catalog-source and AI-consent decisions)
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:** FR-001–FR-009, FR-011, FR-012 (all must-have FRs); US-01, US-02, US-03. FR-010 (nice-to-have) is parked.

## Vision recap

Adults 30+ in Poland forget or postpone age-appropriate screenings because nothing prompts them when they become eligible, so exams silently lapse and treatable conditions go undetected. Dbam turns a short profile into an importance-labeled list of due screenings and keeps reminding the user from recommendation → appointment date → confirmed completion → next due date. It never books appointments and never states or implies a diagnosis.

## North star

**S-02: User sees the screenings due for their profile, grouped by importance tier** — the first moment the product delivers its promise; with `main_goal: speed`, everything else in the milestone only matters if this list is right.

> "North star" here means the smallest end-to-end slice whose successful delivery proves the product works — it is placed as early as its Prerequisites allow, because every reminder and recurrence slice builds on this list.

## At a glance

| ID   | Change ID                   | Outcome (user can …)                                                                                      | Prerequisites | PRD refs                                          | Status   |
| ---- | --------------------------- | --------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------- | -------- |
| F-01 | screening-catalog-v1        | (foundation) curated screening catalog with eligibility, importance, and interval                         | —             | FR-004, FR-009, Business Logic                    | done     |
| F-02 | reminder-dispatch-path      | (foundation) a scheduled job in production delivers an email                                              | —             | FR-007, FR-009, FR-011, FR-012                    | ready    |
| S-01 | onboarding-profile          | user signs in, consents to health-data storage, completes a minimal profile, and lands on their dashboard | —             | US-01, FR-001, FR-002, FR-003, NFR (privacy)      | done     |
| S-02 | screening-recommendations   | user sees due screenings grouped by importance tier, or an explanatory empty state                        | S-01, F-01    | US-01, FR-004, Guardrail (no diagnosis)           | ready    |
| S-03 | record-appointment-date     | user picks a recommended exam and records an appointment date booked elsewhere                            | S-02          | US-02, FR-005                                     | proposed |
| S-04 | appointment-reminder        | user opts in or out of reminders and gets an email as an appointment approaches                           | S-03, F-02    | US-02, FR-006, FR-007                             | proposed |
| S-05 | confirm-exam-and-recurrence | user confirms an exam happened (or marks one already done) and sees its next due date                     | S-03, F-01    | US-03, FR-008, FR-009, Success Criteria (Primary) | proposed |
| S-06 | due-screening-reminder      | user gets an email when a screening becomes due again                                                     | S-04, S-05    | US-03, FR-009, Success Criteria (Primary)         | proposed |
| S-07 | follow-up-nudges            | user gets nudged to log a missing date or confirm a past appointment                                      | S-04, S-05    | FR-011, FR-012                                    | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                       | Chain                             | Note                                                                                            |
| ------ | --------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| A      | Profile and recommendations | `S-01` → `S-02` → `S-03`          | Shortest path to the north star; `S-02` also joins Stream B at `F-01`.                          |
| B      | Catalog and recurrence      | `F-01` → `S-05`                   | Catalog built from Polish NFZ programs and society guidelines; `S-05` joins Stream A at `S-03`. |
| C      | Reminders                   | `F-02` → `S-04` → `S-06` / `S-07` | Proves the delivery path early; `S-04` joins A at `S-03`, `S-06`/`S-07` join B at `S-05`.       |

## Baseline

What's already in place in the codebase as of `2026-09-26` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present (working scaffold) — Astro 7 + React 19 islands, Tailwind 4, shadcn/ui (`astro.config.mjs`, `src/components/ui/button.tsx`). Only starter pages exist (index, placeholder `src/pages/dashboard.astro`, auth forms). User note: works and is ready to build on, but no product UI yet — each slice builds its own screens.
- **Backend / API:** partial — Astro SSR endpoints exist only for auth (`src/pages/api/auth/*.ts`); no domain endpoints.
- **Data:** partial — Supabase configured (`supabase/config.toml`, `src/lib/supabase.ts`); no migrations and no tables yet.
- **Auth:** present — Supabase email/password sign-up, sign-in, sign-out; route protection via `PROTECTED_ROUTES` in `src/middleware.ts`. Confirmation-email callback (`src/pages/api/auth/callback.ts`) merged to `main` (#14).
- **Deploy / infra:** present — Cloudflare Workers (`wrangler.jsonc`); CI runs lint, check, build, smoke, and auto-deploys green `main` (`.github/workflows/ci.yml`). Scheduled triggers: absent (no `triggers` in `wrangler.jsonc`).
- **Observability:** partial — Workers observability enabled (`wrangler.jsonc`), `wrangler tail`, post-deploy health check and read-only smoke; no error tracking.
- **Other:** AI integration absent and not needed at runtime in this milestone (recommendations are rule-based); a scheduled AI job that keeps the screening catalog current is planned but not part of this milestone; outbound user email outside auth absent.

## Foundations

### F-01: Curated screening catalog v1

- **Outcome:** (foundation) a curated catalog of screening types (the static table FR-009's resolution calls for) exists in the app's data — each with eligibility criteria (at least age and sex), an importance tier, and a repeat interval or an explicit "no known interval" marker — each entry carrying its source, publicly readable and free of personal data.
- **Change ID:** screening-catalog-v1
- **PRD refs:** FR-004, FR-009, Business Logic
- **Unlocks:** S-02 (what to recommend and how to tag it), S-05 (next due date from the interval)
- **Prerequisites:** —
- **Parallel with:** F-02, S-01
- **Blockers:** —
- **Unknowns:**
  - Resolved: sources are the NFZ / Ministry of Health programs (breast, cervical, colorectal, lung LDCT) plus "Moje Zdrowie", Polish society guidelines (PTD, PTNT/PTK) for other checks, and USPSTF / EU Council 2022 as the evidence layer — see `context/foundation/screening-catalog-research.md`.
  - A family-medicine (POZ) doctor must sign off each entry before public launch; not needed to plan or build. — Owner: user. Block: no.
- **Risk:** Sequenced first because both the north star and recurrence read from it; Polish programs changed in 2025–2026, so entries must cite current sources, not older summaries.
- **Status:** done

### F-02: Reminder dispatch path

- **Outcome:** (foundation) a scheduled job runs in production on a timer and delivers an email to a test address; the path is exercised in CI or post-deploy verification.
- **Change ID:** reminder-dispatch-path
- **PRD refs:** FR-007, FR-009, FR-011, FR-012
- **Unlocks:** S-04, S-06, S-07; verification path "scheduled email delivery works on Workers in production"
- **Prerequisites:** —
- **Parallel with:** F-01, S-01, S-02
- **Blockers:** —
- **Unknowns:**
  - Is the Workers Paid plan (~$5/mo) acceptable before reminders go live, given the free-tier 10 ms CPU cap on scheduled runs (`infrastructure.md` risk register)? — Owner: user. Block: no.
  - Cron-trigger limit scope (per account vs per Worker) is inconsistently documented — verify in the dashboard. — Owner: team. Block: no.
- **Risk:** The starter has no scheduled work and `tech-stack.md` flags it as the known gap; proving it early and in isolation keeps S-04 from carrying infrastructure risk and product logic at once.
- **Status:** ready

## Slices

### S-01: Onboarding profile

- **Outcome:** user can sign up or sign in, give explicit, separate consent to storing their health data, complete a minimal profile (birth year, sex, smoking history), and land on their dashboard; their profile is visible only to them.
- **Change ID:** onboarding-profile
- **PRD refs:** US-01, FR-001, FR-002, FR-003, NFR (privacy)
- **Prerequisites:** —
- **Parallel with:** F-01, F-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** First slice that stores health data (GDPR Art. 9), so explicit consent and per-user data isolation land here rather than as a separate layer; FR-001/FR-002 are covered by the auth baseline and only need wiring into onboarding.
- **Status:** done

### S-02: Screening recommendations

- **Outcome:** user can open their dashboard and see the screenings currently due for their profile, grouped by importance tier (most important first), each with the rule and source that put it there, or an explanatory empty state when nothing is due — with no wording that states or implies a diagnosis.
- **Change ID:** screening-recommendations
- **PRD refs:** US-01, FR-004, Guardrail (no diagnosis)
- **Prerequisites:** S-01, F-01
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This is the north star. Resolved: recommendations are rule-based over the F-01 catalog and the profile is never sent to an AI model. Output must stay informational (which screenings you are eligible for and when), not individual risk scoring, so the product stays outside medical-device rules.
- **Status:** ready

### S-03: Record appointment date

- **Outcome:** user can select a recommended exam, enter the date of an appointment booked outside the app, and see that date on their dashboard.
- **Change ID:** record-appointment-date
- **PRD refs:** US-02, FR-005
- **Prerequisites:** S-02
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Low technical risk; the product must only record the date and never book or contact a provider (PRD Non-Goals).
- **Status:** proposed

### S-04: Appointment reminder

- **Outcome:** user can opt in to (or out of) reminders and, when opted in, receives an email as a recorded appointment date approaches.
- **Change ID:** appointment-reminder
- **PRD refs:** US-02, FR-006, FR-007
- **Prerequisites:** S-03, F-02
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:**
  - How many days before the appointment should the reminder fire? — Owner: user. Block: no.
- **Risk:** First real user-facing use of the dispatch path; opt-in must gate every send, including the later S-06/S-07 messages.
- **Status:** proposed

### S-05: Confirm exam and recurrence

- **Outcome:** user can confirm that an exam happened on its appointment date, or mark an exam already done with its last date ("never / don't know" allowed); the exam leaves the "due now" list, its next due date is computed from the catalog interval, it reappears as due when that interval elapses, and an exam with no known interval is surfaced to the user instead of silently dropped.
- **Change ID:** confirm-exam-and-recurrence
- **PRD refs:** US-03, FR-008, FR-009, Success Criteria (Primary)
- **Prerequisites:** S-03, F-01
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Closes the loop that makes the product recurring rather than one-shot; depends on correct intervals from F-01.
- **Status:** proposed

### S-06: Due-screening reminder

- **Outcome:** an opted-in user receives an email when a screening becomes due — including when a confirmed exam's repeat interval elapses — without re-entering the exam.
- **Change ID:** due-screening-reminder
- **PRD refs:** US-03, FR-009, Success Criteria (Primary)
- **Prerequisites:** S-04, S-05
- **Parallel with:** S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Completes the primary success criterion; reminders for many users can land on the same dates, which is where the scheduled-run CPU cap from F-02 bites.
- **Status:** proposed

### S-07: Follow-up nudges

- **Outcome:** an opted-in user gets a nudge when a selected exam has no appointment date after some days, and a follow-up asking them to confirm completion once an appointment date has passed unconfirmed.
- **Change ID:** follow-up-nudges
- **PRD refs:** FR-011, FR-012
- **Prerequisites:** S-04, S-05
- **Parallel with:** S-06
- **Blockers:** —
- **Unknowns:**
  - How many days before each nudge fires ("within some days" in FR-011, "some time" in FR-012)? — Owner: user. Block: no.
- **Risk:** These are the safety nets that stop the loop from breaking silently; last in order because they only add value once the main flow exists.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                   | Suggested issue title                                           | Ready for `/10x-plan` | Notes                                           |
| ---------- | --------------------------- | --------------------------------------------------------------- | --------------------- | ----------------------------------------------- |
| F-01       | screening-catalog-v1        | Curate v1 screening catalog (eligibility, importance, interval) | yes                   | #17 · Done; drafter live run (3.3) → #42        |
| F-02       | reminder-dispatch-path      | Prove scheduled email delivery on Workers in production         | yes                   | #18 · Run `/10x-plan reminder-dispatch-path`    |
| S-01       | onboarding-profile          | Onboarding: health-data consent and minimal profile             | yes                   | #19 · Run `/10x-plan onboarding-profile`        |
| S-02       | screening-recommendations   | Dashboard: due screenings grouped by importance tier            | yes                   | #20 · Run `/10x-plan screening-recommendations` |
| S-03       | record-appointment-date     | Record an appointment date for a recommended exam               | no                    | #21 · Needs S-02                                |
| S-04       | appointment-reminder        | Reminder opt-in and appointment-approaching email               | no                    | #22 · Needs S-03, F-02                          |
| S-05       | confirm-exam-and-recurrence | Confirm or mark exam done and schedule next due date            | no                    | #23 · Needs S-03, F-01                          |
| S-06       | due-screening-reminder      | Email when a screening becomes due again                        | no                    | #24 · Needs S-04, S-05                          |
| S-07       | follow-up-nudges            | Nudges for missing dates and unconfirmed appointments           | no                    | #25 · Needs S-04, S-05                          |

## Open Roadmap Questions

1. **What's the insight/differentiator?** (#26) Why hasn't a personal screening-nudge + NFZ-queue-watcher been built already? — Owner: user. Block: none (positioning only; from PRD Open Questions).
2. **What must be in place before public launch?** (#27) A medical reviewer signs off the catalog, a data-protection impact assessment (DPIA) covers server-stored health data, and a short memo records why the app is informational, not a medical device. Until then the catalog's 19 active entries are unreviewed (`reviewed_by` null); S-02 must enforce the gate at render time (see `context/changes/screening-recommendations/change.md`). — Owner: user. Block: none (launch gate, not a planning gate).

3. **When and how does the automated AI catalog update run?** (#28) The plan is an AI job that periodically updates the screening catalog. The PRD has no requirement for it yet, and its updates must not reach users before medical review (they should land as drafts pending sign-off). — Owner: user. Block: none (not in this milestone's scope; needs a PRD requirement before it can become a slice).

## Parked

- **NFZ queue-watcher** — Why parked: PRD §Non-Goals, deferred to v2+.
- **Medicine tracker** — Why parked: PRD §Non-Goals, separate domain, deferred to v2+.
- **In-app appointment booking** — Why parked: PRD §Non-Goals; the app only records a date the user enters.
- **Family / shared accounts** — Why parked: PRD §Non-Goals; single user per account for v1.
- **Optional follow-up profiling (FR-010)** — Why parked: nice-to-have; `main_goal: speed` keeps the milestone on must-have FRs only.
- **AI at runtime (LLM-generated recommendations, "ask about this exam" chatbot)** — Why parked: research decision; rules are deterministic and the profile is never sent to an AI model. A chatbot is v2 and would get only the exam ID.
- **Error tracking beyond Workers observability** — Why parked: no PRD requirement demands it for v1; revisit if reminder runs fail silently.

## Milestone History

## Done

- **S-01: user can sign up or sign in, give explicit, separate consent to storing their health data, complete a minimal profile (birth year, sex, smoking history), and land on their dashboard; their profile is visible only to them.** — Archived 2026-09-28 → `context/archive/2026-09-27-onboarding-profile/`. Lesson: —.
- **F-01: (foundation) a curated catalog of screening types (the static table FR-009's resolution calls for) exists in the app's data — each with eligibility criteria (at least age and sex), an importance tier, and a repeat interval or an explicit "no known interval" marker — each entry carrying its source, publicly readable and free of personal data.** — Archived 2026-09-29 → `context/archive/2026-09-28-screening-catalog-v1/`. Lesson: —.
