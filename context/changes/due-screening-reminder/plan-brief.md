# Due-screening reminder (S-06) — Plan Brief

> Full plan: `context/changes/due-screening-reminder/plan.md`
> Research: `context/changes/due-screening-reminder/research.md`

## What & Why

When a done or confirmed exam's repeat interval runs out, an opted-in user gets one email, without re-entering the exam. This completes the PRD's primary success criterion (US-03, FR-009): the product reminds people again, not just once.

## Starting Point

S-04 sends appointment reminders from the daily 10:00 Warsaw cron. A definer function claims the reminders, one Resend batch sends them, and a second function marks them sent. "Due again" is computed only in pure TypeScript for the dashboard (`recommend` and `partitionDashboard`, tested in F-08). The cron's service-role key can't read user tables directly.

## Desired End State

The 10:00 run sends appointment reminders first. Then, from the remaining daily email budget, it emails each user who has at least one exam the dashboard now shows as "due again". The email gives a count and a dashboard link and names no exam. Each (user, exam, due month) is reminded at most once. Users over the budget are picked up the next day. A failed run logs a redacted error event and emails the owner with the job's name.

## Key Decisions Made

| Decision         | Choice                                                                                                                                                         | Why (1 sentence)                                                                                           | Source                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------- |
| Due-date source  | Definer function returns minimal inputs; TypeScript runs the dashboard rules                                                                                   | One source of truth: no SQL port and no stored due column                                                  | Research → orchestrator |
| Scope            | Only elapsed repeat intervals of done or confirmed exams                                                                                                       | US-03/FR-009 define the recurrence reminder; first-time eligibility is deferred to a follow-up             | Orchestrator            |
| Cadence          | One email per user per run, no exam names, dedupe per (user, slug, due month), no repeats                                                                      | Same privacy rule as S-04; S-07 owns nudges                                                                | Orchestrator            |
| Overflow         | Appointments go first; the due job uses the rest of a shared 97/day budget; the rest roll to the next day                                                      | Resend free allows 100/day, minus the heartbeat and 2 possible alerts                                      | Orchestrator + plan     |
| Which exams      | Only tier items in `partitionDashboard`'s `lastDone` map                                                                                                       | The email matches what the dashboard shows                                                                 | Orchestrator            |
| Candidate filter | The SQL filter is a superset (anchor + the shortest possible interval ≤ this month, no plan, no sent row for the same anchor), ordered by `md5(user_id‖today)` | Keeps the TypeScript work and CPU small, can't drop a truly due item, and rotates users so none is starved | Plan                    |
| Ledger key       | `unique (user_id, catalog_slug, due_month)`, plus `anchor_month`, with a cascade FK to completions                                                             | Re-dating an exam starts a new cycle, and deleting or withdrawing a completion cleans up its rows          | Plan                    |
| Failure alert    | Generalised to `ReminderJob`; the job name goes in the subject and the idempotency key                                                                         | A shared key would make Resend reject the second alert when both jobs fail                                 | Plan                    |
| Rule types       | `recommend` and `partitionDashboard` accept narrowed profile and completion types                                                                              | The cron passes only the five fields the rules read                                                        | Plan                    |

## Scope

**In scope:**

- the ledger table and three cron-only definer functions, with pgTAP tests;
- the pure `dueScreeningItems` function and its tests;
- the due job;
- the shared budget, and the appointment job returning its sent count;
- the generalised failure event and alert, with privacy tests;
- pl/en email copy and README notes.

**Out of scope:**

- first-time eligibility reminders (follow-up note);
- repeats and nudges (S-07);
- UI changes;
- cron schedule changes;
- a SQL port of the rules;
- a `roadmap.md` status change.

## Architecture / Approach

`scheduled()` runs two things in parallel: the heartbeat, and a chain of `appointment → due(budget − appointment.sent)`. The due job runs these steps:

1. `get_due_screening_candidates(today, 100)` returns profile rule fields and the candidate completions; it returns no email.
2. `getActiveCatalog`.
3. `dueScreeningItems` per user.
4. `claim_due_screening_reminders(items)` re-checks opt-in, consent and email, inserts idempotently, and returns the email, locale and ids.
5. `sendEmailBatch` with key `dbam-due-screening-reminder:<sha256(ids)>`.
6. `mark_due_screening_reminders_sent`.

Logs carry counts only.

## Phases at a Glance

| Phase                                        | What it delivers                                                  | Key risk                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1. Ledger and cron-only functions            | Migration, pgTAP tests, regenerated types                         | The SQL candidate filter drifts from `anchorMonth` and misses or re-sends |
| 2. Pure due-item rule                        | Narrowed rule types, `dueScreeningItems`, Vitest cases            | Type narrowing breaks dashboard callers                                   |
| 3. Due job, shared budget and failure alerts | Job, worker chain, generalised alert, copy, README, local dry run | CPU per run near 10 ms once many users are candidates                     |

**Prerequisites:** S-04, S-05 and F-08 merged (done); shared local Supabase with the DB lock for Phase 1 and the dry run.
**Estimated effort:** about 2 implement sessions across 3 phases.

## Open Risks & Assumptions

- Resend counts each email in a batch toward the 100/day quota (S-04's assumption, not confirmed by Resend).
- CPU fits 10 ms for 100 candidates. This is only verifiable in production; the fallback is to lower the candidate limit constant.
- Candidates the TypeScript rules reject (for example, aged out) keep coming back daily. The daily rotation prevents starvation but spends candidate slots.
- B-01 and B-02 (F-07 production checks) are still open on the owner's side. S-06 adds no slugs to URLs or logs.

## Success Criteria (Summary)

- An opted-in user whose exam interval has run out gets one email at 10:00 Warsaw that names no exam, and no second email for that cycle.
- Appointment reminders keep priority, and the total stays at or under 97 reminder emails a day.
- A failed due run is visible: a redacted error event and an owner alert naming the job.
