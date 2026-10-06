# Due-screening reminder (S-06) — Plan Brief

> Full plan: `context/changes/due-screening-reminder/plan.md`
> Research: `context/changes/due-screening-reminder/research.md`
> Plan review: `context/changes/due-screening-reminder/plan-review.md` (F1–F8 accepted)

## What & Why

When a done or confirmed exam's repeat interval runs out, an opted-in user gets one email, without re-entering the exam. This completes the PRD's primary success criterion (US-03, FR-009): the product reminds people again, not just once.

## Starting Point

S-04 sends appointment reminders from the daily 10:00 Warsaw cron. A definer function claims the reminders, one Resend batch sends them, and a second function marks them sent. "Due again" is computed only in pure TypeScript for the dashboard (`recommend` and `partitionDashboard`, tested in F-08). The cron's service-role key can't read user tables directly.

## Desired End State

The 10:00 run sends appointment reminders first. Then, from the remaining daily email budget, it emails each user who has at least one exam the dashboard now shows as "due again". The email gives a count and a dashboard link and names no exam. Each completion cycle (user, exam, anchor month) is reminded at most once. Users over the budget are picked up the next day. A failed run logs a redacted error event and emails the owner with the job's name.

## Key Decisions Made

| Decision         | Choice                                                                                                                                                            | Why (1 sentence)                                                                                           | Source                             |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Due-date source  | Definer function returns minimal inputs; TypeScript runs the dashboard rules                                                                                      | One source of truth: no SQL port and no stored due column                                                  | Research → orchestrator            |
| Scope            | Only elapsed repeat intervals of done or confirmed exams                                                                                                          | US-03/FR-009 define the recurrence reminder; first-time eligibility is deferred to a follow-up             | Orchestrator                       |
| Cadence          | One email per user per run, no exam names, one reminder per completion cycle, no repeats                                                                          | Same privacy rule as S-04; S-07 owns nudges                                                                | Orchestrator, refined by review F2 |
| Overflow         | Appointments go first; the due job uses the rest of a shared 93/day budget; the rest roll to the next day                                                         | 31 × (93 + heartbeat + 2 alerts) = 2,976 stays under Resend's 3,000/month and 100/day                      | Orchestrator + review F6           |
| Which exams      | Only tier items in `partitionDashboard`'s `lastDone` map                                                                                                          | The email matches what the dashboard shows                                                                 | Orchestrator                       |
| Candidate filter | The SQL filter is a superset (anchor + the shortest possible interval ≤ this month, no plan, no sent row for the same anchor), ordered by `md5(user_id‖today)`    | Keeps the TypeScript work and CPU small, can't drop a truly due item, and rotates users so none is starved | Plan                               |
| Ledger key       | `unique (user_id, catalog_slug, anchor_month)`, with `due_month` kept as data and a cascade FK to completions                                                     | One key for the claim and the filter, so no completion gets stuck as a daily candidate                     | Review F2                          |
| Anchor           | Computed once in SQL (`screening_anchor_month`) and returned; TypeScript uses it as is                                                                            | Both sides agree by construction, and no `updated_at` leaves the database                                  | Review F7                          |
| Claim checks     | `claim(p_today, items)` re-checks live anchor, `anchor < due ≤ this month`, no plan, entry active and fixed, opt-in, consent and email, in both insert and return | Same defence in depth as the S-04 claim                                                                    | Review F3                          |
| CPU              | A sort-free core `classifyEntries` on the cron path (no `Intl.Collator`), plus a cold-process timing test under 5 ms                                              | A cold collator alone can use the 10 ms cap                                                                | Review F1                          |
| Rate limit       | On a Resend 429, wait `retry-after` (≤ 2 s) and retry once with the same idempotency key                                                                          | Heartbeat, batches and alerts can land in the same second                                                  | Review F4                          |
| Chain            | `runReminderChain` with injected jobs and alert, unit-tested                                                                                                      | Budget and alert rules get a regression guard, not just a manual stub                                      | Review F5                          |
| Failure alert    | Generalised to `ReminderJob`; the job name goes in the subject and the idempotency key                                                                            | A shared key would make Resend reject the second alert when both jobs fail                                 | Plan                               |
| Rule types       | `recommend`, `resolveInterval` and `partitionDashboard` take `RuleProfile` and a narrowed completion type                                                         | The cron passes only the five fields the rules read                                                        | Plan + review F8                   |

## Scope

**In scope:**

- the ledger table, the anchor helper and three cron-only definer functions, with pgTAP tests;
- the sort-free rule core, the pure `dueScreeningItems` function, its tests and a timing test;
- the due job and the unit-tested `runReminderChain`;
- a single bounded Resend 429 retry;
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

`scheduled()` runs two things in parallel: the heartbeat, and `runReminderChain`, which runs `appointment → due(93 − appointment.sent)`. The due job runs these steps:

1. `get_due_screening_candidates(today, 100)` returns profile rule fields and the candidate completions as `{slug, anchor_month}`; it returns no email and no `updated_at`.
2. `getActiveCatalog`.
3. `dueScreeningItems` per user (sort-free core, no collator).
4. `claim_due_screening_reminders(today, items)` re-checks live data, inserts idempotently per anchor, and returns the email, locale and ids.
5. `sendEmailBatch` with key `dbam-due-screening-reminder:<sha256(ids)>` (one 429 retry).
6. `mark_due_screening_reminders_sent`.

Logs carry counts only.

## Phases at a Glance

| Phase                                        | What it delivers                                                                     | Key risk                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| 1. Ledger and cron-only functions            | Migration, pgTAP tests, regenerated types                                            | The claim re-checks or the anchor helper drift from the TypeScript rules     |
| 2. Pure due-item rule                        | Narrowed rule types, `classifyEntries`, `dueScreeningItems`, Vitest and timing cases | The cold timing is over 5 ms, or the type narrowing breaks dashboard callers |
| 3. Due job, shared budget and failure alerts | Job, `runReminderChain`, 429 retry, generalised alert, copy, README, local dry run   | Production CPU per run in workerd differs from the Node timing               |

**Prerequisites:** S-04, S-05 and F-08 merged (done); shared local Supabase with the DB lock for Phase 1 and the dry run.
**Estimated effort:** about 2 implement sessions across 3 phases.

## Open Risks & Assumptions

- Resend counts each email in a batch toward the 100/day quota (S-04's assumption, not confirmed by Resend).
- CPU fits 10 ms for 100 candidates. The Node timing test is only indicative for workerd, and whether isolate warm-up counts is unknown. Production check 3.8 is final; the fallback is to lower the candidate limit constant.
- Resend's per-second limit for this account wasn't checked. One retry covers a short burst only.
- Candidates the TypeScript rules reject (for example, aged out) keep coming back daily. The daily rotation prevents starvation but spends candidate slots.
- B-01 and B-02 (F-07 production checks) are still open on the owner's side. S-06 adds no slugs to URLs or logs.

## Success Criteria (Summary)

- An opted-in user whose exam interval has run out gets one email at 10:00 Warsaw that names no exam, and no second email for that cycle.
- Appointment reminders keep priority, and the total stays at or under 93 reminder emails a day (2,976 a month at most, including the heartbeat and alerts).
- A failed due run is visible: a redacted error event and an owner alert naming the job.
