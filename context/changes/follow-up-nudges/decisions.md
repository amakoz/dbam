# Decisions: follow-up-nudges

## 2026-10-06 Research sub-agents

- Question: how many sub-agents for `/10x-research`?
- Options: 0–2 (orchestrator cap 2).
- Choice: 2 (reminder pipeline and budget; plan/confirm data model and prior decisions). External threshold evidence gathered by the worker directly.
- Evidence: two independent areas; orchestrator prompt.
- decided-by: worker

## 2026-10-06 Research recommendations adopted

- Question: thresholds, pipeline shape, priority, per-user rule, budget, ledger, email content, opt-in copy (research.md "Summary").
- Choice: every research recommendation as written. FR-011 fires 14 days after the plan last became undated (Warsaw date of `updated_at`), one nudge per undated cycle; FR-012 fires 7 days after `appointment_date`, one per (plan, date), no repeat. One `follow-up-nudge` job, third in `runReminderChain`, with S-04-style claim and mark definer functions; both kinds in one email per user. Priority appointment → due → nudge, confirm users before schedule-only users. The nudge job skips users already emailed by S-04/S-06 that Warsaw day. It gets the budget remainder; `REMINDER_EMAIL_DAILY_BUDGET` 93 → 92. Ledger `follow_up_nudges` with `unique (plan_id, kind, cycle_on)`, service_role revoked, pgTAP. No exam names anywhere. Update `profile.reminders` heading and disclosure (pl, en). Production CPU check goes to the manual rows. Launch backlog needs no special handling. The S-04/S-06 cross-job overlap becomes a follow-up note.
- Evidence: research.md; owner delegated the threshold unknown (roadmap.md S-07).
- decided-by: orchestrator

## 2026-10-06 Plan shape (worker's call, delegated)

- Complexity MEDIUM, 0 interview questions (settled-input exception: the orchestrator pre-answered every design question), 3 phases (database; pure pieces and chain; job and wiring).
- The thresholds and the email builder live in a pure module (`src/lib/reminders/nudge-message.ts`, no `astro:*` import), so Vitest covers the copy, the counts and the no-exam-name rule; the job module stays untested by Vitest like the S-04 job and is checked by the local dry run.
- If the due job fails, the nudge job gets budget 0 (quota use unknown), mirroring the appointment → due rule.
- The S-04/S-06 ledgers' `sent_at` decides "already emailed today" (Warsaw date of `sent_at` = `p_today`); unsent or dry-run rows don't count.
- Plans on retired catalog entries are not nudged (a retired entry can't be confirmed: completion RLS needs an active entry).
- The opt-in disclosure states the thresholds as literals; a Vitest case pins them to the constants so they can't drift.
- Roadmap status flip skipped (worker protocol: no roadmap changes during plan).
- decided-by: worker (orchestrator: "complexity, question budget, phase split are your call")
