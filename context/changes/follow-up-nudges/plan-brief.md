# Follow-up Nudges (S-07) — Plan Brief

> Full plan: `context/changes/follow-up-nudges/plan.md`
> Research: `context/changes/follow-up-nudges/research.md`
> Decisions: `context/changes/follow-up-nudges/decisions.md`

## What & Why

These are safety nets for the reminder loop. A user who planned an exam but never entered a date gets one nudge after 14 days (FR-011). A user whose appointment passed a week ago without a confirmation gets one follow-up asking them to confirm (FR-012). Without them the loop breaks silently: no date means no appointment reminder, and no confirmation means no recurrence (PRD `prd.md:108,119`).

## Starting Point

The 10:00 Warsaw cron runs appointment reminders (S-04), then due-screening reminders (S-06), on a shared 93-email daily budget. Both nudge states already exist in `screening_plans`: an undated plan, or a plan whose date has passed (confirming deletes the plan). Nothing emails either state yet.

## Desired End State

The chain runs appointment → due → follow-up nudge. An opted-in user with an undated plan untouched for 14 days, or a plan dated 7 or more days ago, gets one email with counts and a dashboard link, never an exam name. They get it once per cycle, at most one nudge email a day, and never on a day another reminder already reached them. The profile's opt-in text describes every email Dbam sends.

## Key Decisions Made

| Decision         | Choice                                                                                               | Why (1 sentence)                                                                                                                    | Source                  |
| ---------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| FR-011 threshold | 14 days after the plan last became undated (Warsaw date of `updated_at`)                             | Short end of the 2–6 week programme range for self-chosen exams; `updated_at` avoids nudging someone who just cleared a passed date | Research → orchestrator |
| FR-012 threshold | 7 days after `appointment_date`                                                                      | The dashboard already asks from the day itself; a week lets self-starters confirm without an email                                  | Research → orchestrator |
| Repeats          | One nudge per (plan, kind, cycle); none after that                                                   | Same "no repeats" rule as S-06; the dashboard keeps the prompt                                                                      | Research → orchestrator |
| Pipeline         | One `follow-up-nudge` job, third in `runReminderChain`, S-04-style claim/mark definer functions      | Both states are SQL-decidable, so no candidates or TypeScript rule step                                                             | Research → orchestrator |
| Priority         | appointment → due → nudge; users with a confirm item first                                           | Time-critical first; confirmation unblocks recurrence                                                                               | Research → orchestrator |
| Per-user rule    | Skip users with an S-04/S-06 email sent that Warsaw day; they roll to tomorrow                       | Nudges are not time-critical                                                                                                        | Research → orchestrator |
| Budget           | Remainder after due; `REMINDER_EMAIL_DAILY_BUDGET` 93 → 92; due failure → nudge budget 0             | 31 × (92 + 1 + 3 alerts) = 2,976 ≤ 3,000/month                                                                                      | Research + plan         |
| Ledger           | `follow_up_nudges`, `unique (plan_id, kind, cycle_on)`, cascades with the plan, service_role revoked | Confirm, unplan and withdrawal clean up for free; re-saving or re-dating starts a new cycle                                         | Research → orchestrator |
| Email content    | Counts, `/dashboard` and opt-out links; no exam names, slugs or dates                                | Same GDPR Art. 9 rule as S-04/S-06                                                                                                  | Research → orchestrator |
| Testable copy    | Thresholds and the message builder in a pure `nudge-message.ts`; disclosure numbers pinned by a test | Vitest can't import `astro:*`; copy can't drift from the constants                                                                  | Plan                    |
| Retired entries  | Not nudged                                                                                           | A retired entry can't be confirmed (completion RLS)                                                                                 | Plan                    |

## Scope

**In scope:**

- the ledger and two cron-only functions, with a pgTAP file;
- regenerated types;
- the pure nudge module with tests;
- the three-job chain and its tests;
- the budget of 92;
- the third alert job name;
- the job module and Worker wiring;
- pl/en email and opt-in copy;
- README;
- a follow-up note on the S-04/S-06 overlap;
- a local dry run.

**Out of scope:**

- repeat or escalating nudges;
- fixing the S-04/S-06 same-day overlap;
- nudges for retired entries;
- UI changes beyond copy;
- a per-kind opt-out;
- cron changes;
- launch-backlog handling;
- a roadmap status change.

## Architecture / Approach

`scheduled()` → `runReminderChain`, which runs `appointment` and then `due(92 − a.sent)`, then `nudge(92 − a.sent − d.sent)`. The nudge job:

1. `claim_follow_up_nudges(today, 14, 7, budget)` inserts the eligible (plan, kind, cycle) rows idempotently. It returns per user the email, locale, ids and the two counts. It re-checks live state and excludes users emailed today, confirm users first.
2. `sendEmailBatch` with key `dbam-follow-up-nudge:<sha256(ids)>`.
3. `mark_follow_up_nudges_sent`.

Logs carry counts only.

## Phases at a Glance

| Phase                                        | What it delivers                                          | Key risk                                                   |
| -------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| 1. Ledger and cron-only functions            | Migration, pgTAP, types                                   | Cycle re-check or the Warsaw-day exclusion is off by a day |
| 2. Nudge message, budget and three-job chain | Pure builder and copy, budget of 92, chain with tests     | Polish plural copy; chain failure matrix                   |
| 3. Nudge job, wiring and docs                | Job, Worker wiring, README, follow-up note, local dry run | Production CPU with a third job (checked after merge)      |

**Prerequisites:** S-04, S-05, S-06 merged (done); shared local Supabase with the DB lock for Phases 1 and 3.
**Estimated effort:** about 1–2 implement sessions across 3 phases.

## Open Risks & Assumptions

- `updated_at` moves on every upsert. A user who re-saves an undated plan without changes restarts the 14-day count, which is intended.
- Resend counts each batch email toward the 100/day quota (S-04's assumption).
- CPU is unmeasured in workerd. Production check 3.7 is final.
- The first production run may nudge a backlog of older plans, capped by the budget.

## Success Criteria (Summary)

- An opted-in user with a stale undated plan or an unconfirmed past appointment gets one email naming no exam, and no second email for that cycle.
- Appointment and due reminders keep priority, and the day stays within 92 reminder emails.
- A failed nudge run is visible: a redacted error event and an owner alert naming the job.
