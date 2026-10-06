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
- Daily email budget (superseded by review F6 below: now 93): `REMINDER_EMAIL_DAILY_BUDGET = 97` = Resend free 100/day minus 1 heartbeat minus 2 possible failure alerts. The appointment claim limit drops from 100 to 97 so the two reminder jobs together stay inside the quota. Evidence: `src/lib/heartbeat.ts` sends daily; S-04 `research.md:59`.
- Candidate selection: a SQL pre-filter that is a strict superset of the TS rule (anchor + the smallest interval the entry can resolve to ≤ current month; fixed, active entry; no plan for the slug; no sent ledger row for the same anchor month — the ledger stores `anchor_month`, so re-dating an exam to an earlier month starts a new cycle). TS decides. Candidates are ordered by `md5(user_id || p_today)` so repeated non-due candidates cannot starve others across days, and a retried run sees the same order.
- Job order: the appointment job runs first, then the due job with the remaining budget; if the appointment job fails, the due job skips that run (budget unknown) and its users roll over. The heartbeat stays independent.
- Type narrowing: `recommend`, `resolveInterval`, `evaluateBranch` and `partitionDashboard` accept the subset of profile/completion fields they read, so the cron can pass minimal rows; the dashboard compiles unchanged.
- Failure alert: one alert per failed reminder job, job name in subject and idempotency key (a shared key would make Resend reject the second alert with 409).
- decided-by: worker (orchestrator: "complexity, question budget and phase split are your call")

## 2026-10-06 Plan-review triage (plan-review.md, verdict REVISE)

- Question: how to resolve findings F1–F8.
- Choice: all ACCEPT.
  - F1, Fix A: a sort-free core `classifyEntries` on the cron path (no `Intl.Collator`), plus an automated cold-process timing case (`due.perf.test.ts`, 100 synthetic candidates, under 5 ms). The result goes in the PR. New Progress row 2.4.
  - F2: ledger unique key `(user_id, catalog_slug, anchor_month)`, with `due_month` kept as data, and two pgTAP cases. This supersedes the earlier "dedupe per (user, slug, due month)": the dedupe is now one reminder per completion cycle.
  - F3: `claim_due_screening_reminders(p_today, p_items)` re-checks the live anchor, `anchor < due ≤ this month`, no plan, and that the entry is active and fixed, in both the insert and the return. Three pgTAP cases.
  - F4: on a Resend 429, wait `retry-after` (≤ 2 s, 1 s default) and retry once with the same idempotency key (`src/lib/email-retry.ts`). Unit cases and a README note.
  - F5: `runReminderChain` with injected jobs and alert in `src/lib/reminders/chain.ts`, with four unit tests. New Progress row 3.10. Row 3.5 stays as a manual smoke check and moves to Manual; its title is unchanged.
  - F6: daily budget 93, so that 31 × (93 + 1 + 2) = 2,976 stays under 3,000 a month.
  - F7: the candidates RPC returns the SQL-computed `anchor_month` through one helper, `screening_anchor_month`, which the claim also uses. No `updated_at` leaves the database.
  - F8: `partitionDashboard` takes `profile: RuleProfile`. The `admin-client.ts` header and the `observability.test.ts:19` comment are fixed in Phase 3.
- Evidence: `plan-review.md`.
- decided-by: orchestrator

## 2026-10-06 Candidate limit 50, not 100 (implement, Phase 2)

- Question: `due.perf.test.ts` (plan 2.4) asserts 100 synthetic candidates run cold in under 5 ms. Measured cold in Node: 4.7–7.3 ms for 100 (also in a plain `tsx` script, not only under Vitest), against 0.95 ms warm; 50 candidates take about 2.5 ms cold. The cold cost is V8 warm-up, so it does not shrink with code tweaks.
- Options: (a) loosen the 5 ms budget; (b) lower the candidate limit, the plan's own fallback ("lower the candidate limit (a constant) first"); (c) keep a flaky test.
- Choice: (b). `DUE_CANDIDATE_LIMIT = 50` in `src/lib/screenings/due.ts`; Phase 3's job passes it to `get_due_screening_candidates` instead of `MAX_BATCH_SIZE`. The perf test asserts the cold budget at that limit and logs the 100-candidate figure. Consequence: the due job evaluates at most 50 users a run and sends at most 50 emails; the rest roll to the next daily run (the rotating order keeps that fair).
- Also: `warsawToday` caches its last result by timestamp (the cron asks about the same "now" for every candidate; `formatToParts` was a visible share of the cost). The perf workload gives each candidate 6 completions, not the whole catalog; the all-fixed-entries worst case is logged too (warm numbers are about the same).
- Evidence: scratch timing runs, `due.perf.test.ts` output (cold ≈ 2.6–2.7 ms, warm ≈ 1.4–2.3 ms for 50 candidates).
- decided-by: worker

## 2026-10-06 Phase 3 adaptations (implement)

- `REMINDER_EMAIL_DAILY_BUDGET = 93` lives in `src/lib/email-budget.ts` and is re-exported from `src/lib/email.ts`. Plan said `email.ts`, but that module imports `astro:env/server`, and `chain.ts` (and its unit test) must import nothing from `astro:*`. Minor adaptation.
- The SHA-256 batch key moved to `src/lib/reminders/batch-key.ts` (`batchKey(prefix, ids)`), shared by both jobs; the appointment key format is unchanged.
- The due job passes `DUE_CANDIDATE_LIMIT` (50, see the Phase 2 decision) to the candidates RPC, not `MAX_BATCH_SIZE`; the due budget still caps users at `budget`.
- `src/lib/reminders/due-screening.ts` joins the `no-console` allow-list in `eslint.config.js`, like the other Worker job modules (Workers Logs capture `console`).
- The failure-alert log lines now carry `job`, so a run where both jobs fail gives two distinguishable lines.
- Local dry run (shared DB lock held, seeded user removed afterwards): dry-run, `candidates: 1, due: 1`, no slug, address or subject in any line (3.4); re-dated exam → `none`; plan added → `none`; appointment claim stubbed to fail (never committed) → appointment `failed`, due `skipped` / `no-budget`, `error` event and `failure-alert` dry-run for `appointment-reminder` (3.5). Verified by the worker against `http://127.0.0.1:$DBAM_PORT`, per the orchestrator's prompt.
- Rows 3.6–3.9 need production (real Resend delivery, Workers Logs CPU). They stay unchecked and go to the PR's Manual checks list. Epilogue runs with those four pending (orchestrator: "anything that needs production goes to the PR's Manual checks list").
- decided-by: worker

## 2026-10-06 Impl-review triage (impl-review.md, verdict NEEDS ATTENTION)

- Question: how to resolve findings F1–F5.
- Choice: all ACCEPT, decided-by: orchestrator; implemented by the worker.
  - F1, Fix A: `due.perf.test.ts` times the real sequence in a fresh worker: decode and check the candidate rows, decode and check the catalog rows, `collectClaimItems` for 50 candidates, the batch key. Measured cold (Node, 5 runs): 4.9–5.8 ms in total (candidates 0.3, catalog 0.3–0.4, rules 2.5–2.9, hash 1.8–2.4); warm 1.8–3.0 ms. Before the fix the same sequence was 10–11 ms cold, over the 10 ms cap.
    - Worker call: no zod on the cron path. A narrow zod schema for the rule fields still cost 3.4 ms in the catalog step, and moving the candidate rows off zod showed the cost was zod's cold start (about 2.5 ms), which the catalog step then paid. So the candidate rows and the catalog rows are checked by hand-written guards (`src/lib/reminders/candidates.ts`, `src/lib/catalog/rule-entry.ts`), and the select reads only the 8 rule columns. `rule-entry.test.ts` pins that `isRuleEntry` agrees with `CatalogEntrySchema` on every real catalog entry and on 22 broken rule fields, so the two paths cannot drift silently. The cross-field refinements are not re-checked (the rules never throw on them; `catalog:check` validates entries in full in CI).
    - `RuleEntry` is a `Pick<CatalogEntry, …>`; `Recommendation`, `Recommendations`, `partitionDashboard` and the views are generic over it with `CatalogEntry` as the default, so the dashboard compiles unchanged.
    - Budget for the sequence: 7 ms (the plan's 5 ms covered `dueScreeningItems` alone, 2.5 ms measured), leaving 3 ms of the 10 ms cap for the unmeasured fetch and decode work. Still indicative (Node, not workerd; Node's first `crypto.subtle` call is slow): production CPU stays the manual check 3.8.
  - F2: the numbers are always logged. The strict budget is asserted only with `PERF_ASSERT=1` (5 of 5 runs passed). The always-on ceiling is 4× the budget.
  - F3: `array_agg(distinct r.id order by r.id)` in the claim return (two pgTAP cases: a repeated item gives one id, a bad uuid raises `22P02`; the unfixed function failed the first). The migration was edited in place because it has never been pushed or merged; the changed function was re-applied to the shared local database by hand, and CI builds the stack from the files. `collectClaimItems` stops before 1000 items.
  - F4: `due: 0` on the none path after an empty claim; the `failure-alert.ts` comment names `runReminderChain`.
  - F5: `email.test.ts` drives `sendEmail` and `sendEmailBatch` with a stubbed `fetch`; the old closure-only test is removed. Break check: a per-attempt key made two cases fail.

## 2026-10-06 Archive with the production rows open

- Question: `/10x-archive` warned that 4 manual Progress rows (3.6–3.9, production checks) are pending, that its `reviews/impl-review*.md` lookup found nothing (the review is `impl-review.md` at the change root and lists phases 1–3), and that the Progress SHAs are not in `origin/main` history (the branch is unmerged, with no PR yet, so no mapping can be verified and none is offered).
- Choice: continue archiving. The PR's "Manual checks for the human" list covers rows 3.6–3.9 (they need real Resend delivery, a second production run and Workers Logs CPU, so they can only happen after merge). After a squash merge the SHA suffixes in the archived plan will not resolve in `main`; that is accepted, and a later repoint would be a separate human-approved step.
- decided-by: orchestrator (prompt: "if it asks to confirm only because PR-stage production rows (3.6–3.9) are open, note in decisions.md that the PR covers them and continue")
