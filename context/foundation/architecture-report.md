---
artifact: architecture-report
created: 2026-10-27
updated: 2026-11-03
status: approved 2026-10-28 (owner); refreshed 2026-11-03 after M-03, refresh awaits owner review
head: c9d5685
inputs: repo-map, reminders-research (F-12), reminders-refactor (F-13), domain-distillation (F-14), test-plan, tests/e2e, roadmap (M-03 outcomes, Parked)
---

# Architecture report: Dbam

**How it was made.** An agent worker wrote the draft by hand from the four inputs, citing every claim. The M4L5 report prompt was not in the toolkit. The owner answered the open questions (§7) and approved it on 2026-10-28 without edits (`context/archive/2026-10-27-architecture-report/decisions.md`). The 2026-11-03 refresh records what M-03 shipped (§4–§6) and adds the parked work to §8.

Source keys: **RM** `context/map/repo-map.md` · **RR** `context/archive/2026-10-27-reminders-research/research.md` · **RP** / **PB** `context/archive/2026-10-27-reminders-refactor/plan.md` / `plan-brief.md` · **DD** `context/domain/domain-distillation.md` · **GL** `context/domain/glossary.md` · **TP** `context/foundation/test-plan.md` · **RD** `context/foundation/roadmap.md`. `RM:110` means line 110. _Inference_ marks a conclusion that no input states. Map, research and domain line numbers are as of HEAD 1e5d891.

## 1. The system

Dbam reminds adults in Poland about preventive screenings (badania profilaktyczne). A user gives health-data consent (`health_data_consents`) and fills in a health profile (`profiles`). The rule engine (`recommend()`) then matches the curated screening catalog (`screening_catalog`) to that profile and shows a tiered dashboard (Panel). The user records each exam as a plan (`screening_plans`) or as done (`screening_completions`), and the Worker's daily `scheduled()` handler sends reminder emails (RM:15; GL:39-60; RR:78). A merge to `main` runs `ci` and `smoke`, then `migrate`, then `deploy`, with no approval step (`.github/workflows/ci.yml:124-194`).

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

One person authored and merged every commit. When the map was made, none of the 58 PRs had a review (RM:224, :265). Since S-09, every PR gets an advisory AI review comment and an `ai-cr:*` label (`.github/workflows/ai-review.yml`), but there is still no human reviewer.

## 3. Risk zones

1. **Reminder pipeline.** It is the only code that runs unattended with the service-role key, outside RLS. It emails real people and depends on other capabilities' schemas (RM:126-128).
2. **Exam records.** `src/lib/screenings/rules.ts` has 9 dependants, the most of any business file, and `api/screenings.ts` is the fattest endpoint (RM:161-178).
3. **Watch list.** onboarding-consent: `profile.ts` has 8 dependants, and `consent.ts`, `profile.ts` and `middleware.ts` had no unit tests (RM:200-207). F-19 has since added tests for the pure modules (RD:235). catalog-curation: no medical owner is visible.

## 4. The reminder pipeline (F-12, F-13, F-16)

**Trace.** The cron fires at `0 8,9 * * *` UTC, and `isDailySendRun` lets only the 10:00 Warsaw run through (`wrangler.jsonc:16`; RR:46). `runReminderChain` then runs the appointment reminder (przypomnienie o wizycie), the due-again reminder (czas na badanie profilaktyczne) and the nudge (przypomnienie o planowanych badaniach), in that order, on one 92-email daily email budget (`REMINDER_EMAIL_DAILY_BUDGET`) (RR:47-48; GL:71-76). Each job runs gate → claim RPC → one Resend batch with an idempotency key → mark RPC. Recipient selection and dedupe live in 7 `SECURITY DEFINER` functions that only `service_role` can call (RR:49-51). If one job fails, every later job has zero budget for that day (RR:84).

**Debt.** F-12 checked 17 structural claims with AST or catalog queries: 15 confirmed and 2 refuted (RR:63). The ones that matter:

- **TD-1:** the claim → send → mark skeleton was copied by hand into all three runners (RR:261). _Fixed by F-16._
- **TD-7, TD-8:** two of the three email builders were inline, and no unit test imported any job (RR:267-268). _Fixed by F-16._ The worker, the send gate, the heartbeat and the alert still have no unit tests.
- **SD-1:** Postgres records 0 dependencies from the reminder functions to the tables they read, so a column rename succeeds and fails only at run time (RR:272). Open.
- **SD-2, SD-3:** the consent and opt-in predicates are copied 8 times each. The copies have already drifted: the appointment claim lacks the active-entry check (RR:273-274). The owner closed SD-3 as intended (Q-01). SD-2 is open.
- **Withdrawal (TP risk #5):** withdrawal clears all three ledgers, but only through FK cascades. No pgTAP test asserts that `due_screening_reminders` is empty after a withdrawal (RR:52-54, :185). Open.
- **Refuted:** the generated types are not stale for RPC names (TD-10), and only `src/worker.ts` imports the pipeline, so the boundary holds (TD-9) (RR:269-270).

**Chosen refactor (F-13): TD-1 + TD-7 + TD-8.**

- **How:** characterization tests first (invariants I1–I15, proved by a break matrix), then one pure `runClaimSendMark` runner with the client, sender and site injected, then the two builders in their own modules. 8 phases, one PR per phase from phase 3 on (PB:32-38; RP:90-105).
- **Why:** the largest confirmed duplication, TypeScript only (a Worker rollback reverts it), and no migration or answer to SD-3 needed (PB:32). A spike runner matched today's transcript in 42 of 42 scenarios (PB:19).
- **Rejected:** an SQL helper for SD-2, which needs a production migration that a rollback does not undo (RR:286-288).
- **Status: done.** Shipped in M-03 as F-16 in 7 PRs (#99–#113, 2026-10-28 to 2026-11-01), then archived (`context/archive/2026-10-28-reminders-runner/`; RD:21, :53). All three jobs now run on `src/lib/reminders/runner.ts`, and transcript tests (`src/lib/reminders/*.test.ts`) pin what each job sends. Left out on purpose: SD-2, TD-4, TD-5 and TD-6 (`context/archive/2026-10-28-reminders-runner/plan.md:80-84`).

## 5. Domain model (F-14)

The **Core** is two subdomains: screening recommendation, and screening follow-through (plan → appointment date → confirm or done → due again). **Supporting:** catalog curation, consent and profile, reminder dispatch. **Generic:** accounts, email, observability, i18n (DD:112-118).

**Implicit Exam aggregate.** The user's exam (badanie) has no type in code. Its identity is `(user_id, catalog_slug)`, spread across `screening_plans`, `screening_completions`, three ledgers and the read rule `partitionDashboard` (DD:21; GL:51). It ranks #1 because three drift rows and backlog item B-04 all land on it (DD:244, :255).

**Top drift:**

- **D-01:** appointment reminders go out for plans whose catalog entry is retired or back in draft. Nudges and due-again reminders require `active` (DD:215). _Inference:_ this is the same finding as SD-3, found on its own by two inputs. Closed: the owner says the retired case is intended (§7, Q-01).
- **D-02:** a catalog snapshot could move an active entry back to draft, which silently hides users' records for it (DD:216). Closed by F-17: `catalog:check` refuses a backward status move (RD:233).
- **D-03:** "mark done" is two separate PostgREST calls. If the delete fails, both rows stay and the user sees `save_failed` (DD:217; `src/pages/api/screenings.ts:150-163`). Open.
- **D-04:** a screening a user becomes eligible for for the first time gets no reminder, and the PRD sentence reads either way (DD:218). The owner says this is intended: repeat exams only (§7, Q-03). The PRD wording is not fixed yet (`prd.md:32`).

B-04, a plan whose catalog entry is missing hiding its exam, is fixed by S-10 (RD:232). The word `due` has five meanings in code and `badanie` has two (DD:98-99). This report uses the glossary terms.

## 6. Verification in place

| Layer                       | What it covers                                                                                                                                   | Where                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| Unit                        | 31 Vitest files: catalog and screening rules, the pure modules (F-19), each reminder job and the shared runner (F-16 transcripts), the AI review | `src/**/*.test.ts`, `scripts/**/*.test.ts` |
| pgTAP                       | 8 suites: RLS, grants, withdrawal, the ledgers and the F-20 check constraints                                                                    | `supabase/tests/database/`; `ci.yml:53`    |
| HTTP smoke and cron dry run | The dry run asserts only `"outcome":"ok"` and never reaches a mark RPC                                                                           | RR:61; `ci.yml:72-87`                      |
| E2E (S-08)                  | Playwright: seed, the core loop (plan → confirm → next due), and isolation (a second user sees nothing)                                          | `tests/e2e/*.spec.ts`; `ci.yml:107-109`    |
| Post-deploy                 | Health check and read-only smoke                                                                                                                 | `ci.yml:169-194`                           |

**Gap:** no layer runs the reminder jobs against a real database through to the mark RPC. TP Phase 2 has not started (RR:227; TP:71).

## 7. Owner answers (2026-10-28)

The owner answered the DD questions on 2026-10-28 (`context/archive/2026-10-27-architecture-report/decisions.md`). The consequences are the worker's reading of each answer (inference).

| Q    | Question                                             | Answer                                                      | Consequence                                    |
| ---- | ---------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------- |
| Q-01 | Appointment reminders for a retired entry? (DD:261)  | Keep them; intended                                         | D-01 / SD-3 is closed as intended behaviour    |
| Q-02 | Can catalog entries move backwards? B-04? (DD:262)   | Forward-only moves; B-04 is a bug                           | Both done: F-17 and S-10                       |
| Q-03 | "Becomes due" includes first time? (DD:263)          | Repeat exams only; first-time eligibility is dashboard-only | D-04 is a PRD wording fix, not a missing email |
| Q-04 | Lose appointment reminders above ~92/day? (DD:264)   | Accepted for now; revisit before launch                     | D-05 stays as an accepted risk                 |
| Q-05 | Browser reaches Supabase REST directly? (DD:265)     | Accepted for now; revisit before launch                     | DD ranking #8 waits for launch                 |
| Q-06 | Entry past `next_review_due`? (DD:266)               | Flag it in CI                                               | Done: F-17 warns in CI                         |
| Q-07 | Words for catalog item vs user's exam? (DD:267)      | "screening" vs "exam"                                       | Done in English copy (S-11); `zalecenia` stays |
| Q-08 | Appointment and due-again email on one day? (DD:268) | Acceptable                                                  | Cross-job overlap closed                       |
| Q-09 | Medical sign-off and launch gate? (DD:269)           | No launch planned                                           | Q-04, Q-05 and Q-10 wait for a launch decision |
| Q-10 | Re-consent and consent proof? (DD:270)               | Deferred to the launch gate                                 | —                                              |

**Still open:** SD-6, whether two send runs can overlap in production (RR:340).

## 8. What to do next

M-03 closed every item of the previous list except these (RD:51-59):

1. Run TP Phase 2, recipient integration, including a withdrawal sweep over every table with `user_id` (SD-5) and the missing `due_screening_reminders` withdrawal assertion (RR:289-290; TP:71).
2. Name the Exam aggregate and make mark-done atomic (D-03). Done when a failed mark-done leaves no plan beside its done record (DD:244).
3. Reword `prd.md:32` to say repeat exams only (Q-03, D-04). This is an owner edit.
4. _Inference, not in any plan yet:_ add a CI diff of `database.types.ts` (RM:117, :272).
5. Decide SD-2 (8 copies of the consent and opt-in predicates) together with SD-1. Both need a migration, so plan them additive-first.

**Parked (RD:188-199)**, in the order they should be picked up:

1. **F-07 production checks (B-02, P1).** Saved queries, the alert and the failure email are still unconfirmed in production. These are human-only dashboard steps and need no milestone.
2. **Launch gate (RD:184; Q-04, Q-05, Q-09, Q-10).** Medical sign-off, a DPIA, the not-a-medical-device memo, re-consent, and the 92/day budget and direct-REST decisions. Nothing below that reaches real users should start before this.
3. **Automated post-deploy check of the reminder dispatch path (#57).** Un-park when reminders reach real users. The likely shape is a secret-protected trigger endpoint or a send-log check.
4. **Optional follow-up profiling (FR-010).** This is the only parked item already in the PRD, so it is the first product feature for a new milestone.
5. **AI at runtime:** a chatbot that gets only the exam ID (v2). The automated AI catalog update (RD:186) needs a PRD requirement first and must land as drafts pending medical review.
6. **Shared AI-toolkit package on a registry.** Pick it up only if team-level evidence beyond S-09 is needed.
7. **PRD non-goals (v2+):** the NFZ queue-watcher, a medicine tracker, in-app booking, and family or shared accounts. The CodeRabbit bot stays dropped because S-09 replaced it.

## Owner review: check these first

- [ ] One person authored and merged everything. AI review is advisory, and no human reviews the PRs (RM:224, :265).
- [ ] Withdrawal clears the ledgers only through cascades, with no test for `due_screening_reminders` (RR:52-54).
- [ ] §7 records your 2026-10-28 answers as you meant them, especially the consequences for Q-01 (D-01 closed) and Q-03 (D-04 becomes a PRD wording fix).
- [ ] Mark done is two calls (`src/pages/api/screenings.ts:150-163`).
- [ ] The budget is 92, and a failed job zeroes the later jobs (`src/lib/email-budget.ts:9`; RR:84).
- [ ] The order of the parked work in §8 matches your intent.
