# Decisions: due-screening-reminder

## 2026-10-06 Research sub-agents

- Question: how many sub-agents for `/10x-research`?
- Options: 0–2 (orchestrator cap 2).
- Choice: 2 (reminder job and limits; due rules and schema).
- Evidence: two independent areas; orchestrator prompt.
- decided-by: worker

## 2026-10-06 Due-date source

- Question: how does the cron get next due dates (S-05 hand-off, `confirm-exam-and-recurrence/plan-brief.md:76`)?
- Options: port the rules to SQL; store `next_due_month`; SECURITY DEFINER function returns minimal inputs and TS evaluates.
- Choice: TS evaluation over definer-returned inputs, using the pure `recommend` / `partitionDashboard` / `nextDueMonth` that F-08 tests; no SQL port, no stored due column. The new ledger table revokes all service_role privileges.
- Evidence: research.md "Design options".
- decided-by: orchestrator

## 2026-10-06 Scope of "becomes due"

- Question: does first-time eligibility count?
- Choice: elapsed repeat intervals of done/confirmed exams only (PRD US-03, FR-009). First-time eligibility is out of scope; see `follow-ups/first-time-eligibility.md`.
- decided-by: orchestrator

## 2026-10-06 Cadence and dedupe

- Choice: one email per user per run; no exam names in subject, body or logs (S-04 rule); ledger dedupes per (user, slug, due month); no repeat if the user does not act (S-07 covers nudges).
- decided-by: orchestrator

## 2026-10-06 Overflow and shared budget

- Choice: appointment reminders keep priority; the due job uses what is left of the shared daily email budget; unclaimed users roll to the next daily run.
- decided-by: orchestrator

## 2026-10-06 Recommended-only

- Choice: remind only exams `partitionDashboard` shows as due again in a tier (its `lastDone` map); an exam the dashboard no longer recommends is not reminded.
- decided-by: orchestrator

## 2026-10-06 Plan shape (worker's call, delegated)

- Complexity MEDIUM, 0 interview questions (settled-input exception: every design question pre-answered), 3 phases (database, pure rules, job and wiring).
- Daily email budget: `REMINDER_EMAIL_DAILY_BUDGET = 97` = Resend free 100/day minus 1 heartbeat minus 2 possible failure alerts. The appointment claim limit drops from 100 to 97 so the two reminder jobs together stay inside the quota. Evidence: `src/lib/heartbeat.ts` sends daily; S-04 `research.md:59`.
- Candidate selection: a SQL pre-filter that is a strict superset of the TS rule (anchor + the smallest interval the entry can resolve to ≤ current month; fixed, active entry; no plan for the slug; no sent ledger row for the same anchor month — the ledger stores `anchor_month`, so re-dating an exam to an earlier month starts a new cycle). TS decides. Candidates are ordered by `md5(user_id || p_today)` so repeated non-due candidates cannot starve others across days, and a retried run sees the same order.
- Job order: the appointment job runs first, then the due job with the remaining budget; if the appointment job fails, the due job skips that run (budget unknown) and its users roll over. The heartbeat stays independent.
- Type narrowing: `recommend`, `resolveInterval`, `evaluateBranch` and `partitionDashboard` accept the subset of profile/completion fields they read, so the cron can pass minimal rows; the dashboard compiles unchanged.
- Failure alert: one alert per failed reminder job, job name in subject and idempotency key (a shared key would make Resend reject the second alert with 409).
- decided-by: worker (orchestrator: "complexity, question budget and phase split are your call")
