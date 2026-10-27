---
artifact: architecture-report
created: 2026-10-27
status: draft (worker draft, owner edits and approves before merge)
head: 1e5d891
inputs: repo-map, reminders-research (F-12), reminders-refactor (F-13), domain-distillation (F-14), test-plan, tests/e2e
---

# Architecture report: Dbam

Source keys: **RM** `context/map/repo-map.md` · **RR** `context/archive/2026-10-27-reminders-research/research.md` · **RP** / **PB** `context/archive/2026-10-27-reminders-refactor/plan.md` / `plan-brief.md` · **DD** `context/domain/domain-distillation.md` · **GL** `context/domain/glossary.md` · **TP** `context/foundation/test-plan.md`. `RM:110` means line 110. _Inference_ marks a conclusion that no input states.

## 1. The system

Dbam reminds adults in Poland about preventive screenings (badania profilaktyczne). A user gives health-data consent (`health_data_consents`) and fills in a health profile (`profiles`). The rule engine (`recommend()`) then matches the curated screening catalog (`screening_catalog`) to that profile and shows a tiered dashboard (Panel). The user records each exam as a plan (`screening_plans`) or as done (`screening_completions`), and the Worker's daily `scheduled()` handler sends reminder emails (RM:15; GL:39-60; RR:78). A merge to `main` runs `ci` and `smoke`, then `migrate`, then `deploy`, with no approval step (`.github/workflows/ci.yml:124-164`).

## 2. Capabilities and couplings

There are nine capabilities, and the buzz sits in the dashboard core loop (RM:84-94):

- **exam-records** is the one later changes keep reopening: friction H (RM:87).
- **recommendations** is the busiest, with 16 commits (RM:88).
- **reminders** draws the most planning attention and has the widest reach (RM:86).

The couplings that matter:

- exam-records ↔ recommendations is a capability-level import loop (11 + 5 edges), kept by hand (RM:110).
- reminders reaches into the tables of exam-records, onboarding-consent and catalog through SQL that imports and lint cannot see (RM:111-113). F-12 confirmed these edges from the live catalog (RR:312).
- An exam-records migration redefines `withdraw_health_data_consent()`, a function that onboarding-consent owns (RM:113).
- `database.types.ts` has to change in step with migrations, and no CI step checks it (RM:117). The password policy lives in three places, and one of them is outside git (RM:119).

One person authored and merged every commit, and none of the 58 PRs has a review (RM:224, :265).

## 3. Risk zones

1. **Reminder pipeline.** It is the only code that runs unattended with the service-role key, outside RLS. It emails real people and depends on other capabilities' schemas (RM:126-128).
2. **Exam records.** `src/lib/screenings/rules.ts` has 9 dependants, the most of any business file, and `api/screenings.ts` is the fattest endpoint (RM:161-178).
3. **Watch list.** onboarding-consent: `profile.ts` has 8 dependants, and `consent.ts`, `profile.ts` and `middleware.ts` have no unit tests. catalog-curation: no medical owner is visible (RM:200-207).

## 4. The reminder pipeline (F-12, F-13)

**Trace.** The cron fires at `0 8,9 * * *` UTC, and `isDailySendRun` lets only the 10:00 Warsaw run through (`wrangler.jsonc:16`; RR:46). `runReminderChain` then runs the appointment reminder (przypomnienie o wizycie), the due-again reminder (czas na badanie profilaktyczne) and the nudge (przypomnienie o planowanych badaniach), in that order, on one 92-email daily email budget (`REMINDER_EMAIL_DAILY_BUDGET`) (RR:47-48; GL:71-76). Each job runs gate → claim RPC → one Resend batch with an idempotency key → mark RPC. Recipient selection and dedupe live in 7 `SECURITY DEFINER` functions that only `service_role` can call (RR:49-51). If one job fails, every later job has zero budget for that day (RR:84).

**Debt.** F-12 checked 17 structural claims with AST or catalog queries: 15 confirmed and 2 refuted (RR:63). The ones that matter:

- **TD-1:** the claim → send → mark skeleton is copied by hand into all three runners (RR:261).
- **TD-7, TD-8:** two of the three email builders are inline. No unit test imports any job, the worker, the send gate, the heartbeat or the alert (RR:267-268).
- **SD-1:** Postgres records 0 dependencies from the reminder functions to the tables they read, so a column rename succeeds and fails only at run time (RR:272).
- **SD-2, SD-3:** the consent and opt-in predicates are copied 8 times each. The copies have already drifted: the appointment claim lacks the active-entry check (RR:273-274).
- **Withdrawal (TP risk #5):** withdrawal clears all three ledgers, but only through FK cascades. No pgTAP test asserts that `due_screening_reminders` is empty after a withdrawal (RR:52-54, :185).
- **Refuted:** the generated types are not stale for RPC names (TD-10), and only `src/worker.ts` imports the pipeline, so the boundary holds (TD-9) (RR:269-270).

**Chosen refactor (F-13): TD-1 + TD-7 + TD-8.**

- **How:** characterization tests first (invariants I1–I15, proved by a break matrix), then one pure `runClaimSendMark` runner with the client, sender and site injected, then the two builders in their own modules. 8 phases, one PR per phase from phase 3 on (PB:32-38; RP:90-105).
- **Why:** the largest confirmed duplication, TypeScript only (a Worker rollback reverts it), and no migration or answer to SD-3 needed (PB:32). A spike runner matched today's transcript in 42 of 42 scenarios (PB:19).
- **Rejected:** an SQL helper for SD-2, which needs a production migration that a rollback does not undo (RR:286-288).
- **Status:** parked until M-02 closes (RP:13). A rollback restores code, not data (RP:690).

## 5. Domain model (F-14)

The **Core** is two subdomains: screening recommendation, and screening follow-through (plan → appointment date → confirm or done → due again). **Supporting:** catalog curation, consent and profile, reminder dispatch. **Generic:** accounts, email, observability, i18n (DD:112-118).

**Implicit Exam aggregate.** The user's exam (badanie) has no type in code. Its identity is `(user_id, catalog_slug)`, spread across `screening_plans`, `screening_completions`, three ledgers and the read rule `partitionDashboard` (DD:21; GL:51). It ranks #1 because three drift rows and backlog item B-04 all land on it (DD:244, :255).

**Top drift:**

- **D-01:** appointment reminders go out for plans whose catalog entry is retired or back in draft. Nudges and due-again reminders require `active` (DD:215). _Inference:_ this is the same defect as SD-3, found on its own by two inputs.
- **D-02:** a catalog snapshot can move an active entry back to draft, which silently hides users' records for it (DD:216).
- **D-03:** "mark done" is two separate PostgREST calls. If the delete fails, both rows stay and the user sees `save_failed` (DD:217; `src/pages/api/screenings.ts:150-163`).
- **D-04:** a screening a user becomes eligible for for the first time gets no reminder, and the PRD sentence reads either way (DD:218).

The word `due` has five meanings in code and `badanie` has two (DD:98-99). This report uses the glossary terms.

## 6. Verification in place

| Layer                       | What it covers                                                                                               | Where                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| Unit                        | 14 Vitest files: catalog and screening rules, the chain, candidates, the nudge message, email, observability | `src/**/*.test.ts`; TP:84                  |
| pgTAP                       | 7 suites: RLS, grants, withdrawal and the ledgers                                                            | `supabase/tests/database/`; `ci.yml:53-54` |
| HTTP smoke and cron dry run | The dry run asserts only `"outcome":"ok"` and never reaches a mark RPC                                       | RR:61; `ci.yml:72-87`                      |
| E2E (S-08)                  | Playwright: seed, the core loop (plan → confirm → next due), and isolation (a second user sees nothing)      | `tests/e2e/*.spec.ts`; `ci.yml:107-109`    |
| Post-deploy                 | Health check and read-only smoke                                                                             | `ci.yml:169-193`                           |

**Gap:** no layer runs the TypeScript jobs against a real database. TP Phase 2 has not started (RR:227; TP:71).

**Stale doc:** TP §3 still lists Phase 1 as "change opened", but `roadmap.md:53` marks S-08 done (TP:70).

## 7. Open owner questions

- **Q-01 / SD-3:** should a retired or draft entry stop appointment reminders (DD:261; RR:339)?
- **Q-03:** does "a reminder when a screening becomes due" include first-time eligibility (DD:263)?
- **Q-04:** is it acceptable to lose appointment reminders above about 92 users a day (DD:264)?
- **Q-05:** can a browser reach the Supabase REST API directly and bypass the API routes (DD:265)?
- **Q-09:** where does the medical sign-off and launch gate stand (DD:269; RM:266)?
- **SD-6:** can two send runs overlap in production (RR:340)?

## 8. What to do next

1. Un-park F-13 once M-02 closes, starting with phase 1 (RP:13; PB:90).
2. Run TP Phase 2, recipient integration, including a withdrawal sweep over every table with `user_id` (SD-5) (RR:289-290; TP:71).
3. Name the Exam aggregate and make mark-done atomic. Done when a failed mark-done leaves no plan beside its done record (DD:244).
4. Get answers to Q-01, Q-03 and Q-04. They decide D-01, D-04 and D-05.
5. _Inference, not in any plan yet:_ add a CI diff of `database.types.ts` (RM:117, :272).

## Owner review: check these first

- [ ] One person authored and merged everything, with no human review (RM:224, :265).
- [ ] Withdrawal clears the ledgers only through cascades, with no test for `due_screening_reminders` (RR:52-54).
- [ ] The appointment claim ignores catalog status: `grep -c screening_catalog supabase/migrations/20260930125726_appointment_reminders.sql` prints 0 (D-01, SD-3).
- [ ] Mark done is two calls (`src/pages/api/screenings.ts:150-163`).
- [ ] The budget is 92, and a failed job zeroes the later jobs (`src/lib/email-budget.ts:9`; RR:84).
- [ ] The F-13 choice and its parking match your intent (PB:32; RP:13).
- [ ] The Exam aggregate ranks above first-time eligibility (DD:255).
- [ ] TP §3 Phase 1 status should read done (TP:70).
