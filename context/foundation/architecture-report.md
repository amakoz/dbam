---
artifact: architecture-report
track: 10xArchitect (module 4)
updated: 2026-11-03
repository: amakoz/dbam @ c9d5685
---

# Architecture report: Dbam

**Sources** (all from one repository, `amakoz/dbam`):

- **L2, repository map:** `context/map/repo-map.md`, taken at `159e566`.
- **L3, feature research:** `context/archive/2026-10-27-reminders-research/research.md`, taken at `8529cc8`.
- **L4, refactoring plan:** `context/archive/2026-10-27-reminders-refactor/plan.md` and `plan-brief.md`. Its implementation is in `context/archive/2026-10-28-reminders-runner/`.
- **L5, domain notes:** `context/domain/domain-distillation.md` and `glossary.md` (taken at `74c2d16`), and `anti-corruption-layer.md`.
- **ast-grep checks of the structural claims:** `context/foundation/architecture-report-verification.md`.

## 1. The project

**Dbam** reminds adults in Poland to do their preventive screenings (badania profilaktyczne). It is live at https://dbam.amadeuszkozlowski.workers.dev.

- **Stack:** Astro 7 SSR with React 19 islands, Tailwind 4 and shadcn/ui. Supabase provides Postgres, Auth and row-level security. The app runs on Cloudflare Workers with a daily cron and sends email through Resend. GitHub Actions CI runs unit, pgTAP, HTTP smoke and Playwright E2E tests.
- **Scale:**
  - about 7,900 lines of application code and 6,400 lines of tests;
  - 15 migrations and 20 catalog entries;
  - 86 commits and 82 PRs since 2026-09-24, from one maintainer.

## 2. Repository map (L2)

The map combines three views:

- **Territory:** git history, 61 commits over 5 weeks.
- **Structure:** an import graph from the TypeScript compiler, with `rg` for SQL, where coverage is low.
- **People:** git and `gh`, covering 58 PRs.

What it shows:

- **Where change concentrates:** the dashboard core loop. Exam records is the area later changes keep reopening. Recommendations is the busiest area (16 commits), and the two depend on each other (11 + 5 import edges).
- **Risk zone 1, the reminder pipeline:** the only code that runs unattended with the service-role key, outside RLS. It emails real people and reads three other areas' tables through SQL that neither imports nor lint can see.
- **Risk zone 2, exam records:** `src/lib/screenings/rules.ts` has the most dependants of any business file (9), and `api/screenings.ts` is the largest endpoint.
- **Looks risky, isn't:** CI churn (one deploy campaign), translations (lockstep, guarded by the type check) and generated types all look busy. Their activity is mechanical, so the map leaves them out of the risk zones.
- **Entry points:**
  - `src/pages/dashboard.astro`, the product on one page;
  - `src/middleware.ts`, access control for every route;
  - `scheduled()` in `src/worker.ts`, the cron.
- **Unknowns:**
  - people: no second maintainer, no human reviews, no medical owner for the catalog;
  - what a schema change breaks in the reminder SQL;
  - whether withdrawing consent clears the reminder tables.

## 3. Feature analysis (L3): the reminder pipeline

**Why this feature:** it is risk zone 1 of the map, and two of the map's unknowns point straight at it.

**Overview:** the cron fires twice a day, and `schedule.ts` lets only the 10:00 Warsaw run through. `runReminderChain` then runs three jobs in order (appointment reminder, due-again reminder, follow-up nudge) on a shared budget of 92 emails a day. State changes in the database, not in TypeScript. A `SECURITY DEFINER` claim function selects the recipients and inserts ledger rows. Then one Resend batch goes out with an idempotency key, and a mark function stamps the rows as sent. Each job returns its sent count, which reduces the next job's budget, so if one job fails, the later jobs send nothing that day.

**Technical debt:** 17 structural claims, 15 confirmed and 2 refuted. The TypeScript claims were checked with AST queries through the TypeScript compiler API, and the SQL claims with read-only Postgres catalog queries. I re-checked the key ones with **ast-grep 0.39.5** and confirmed every zero with grep. One pattern undercounted: it found 8 `.rpc()` call sites where grep found 9, and the corrected pattern also finds 9.

- **TD-1 (ast-grep: 3 `sendEmailBatch` calls, one per job):** the claim → send → mark sequence was copied by hand into all three jobs. So were three private `log` helpers (`appointment.ts:102`, `due-screening.ts:129`, `follow-up-nudge.ts:80`).
- **TD-7 and TD-8 (ast-grep: 2 inline `buildMessage`, 1 exported builder):** two of the three email builders could not be tested, and only `worker.ts` imported the jobs. That is a test gap in code that emails real people.
- **SD-1 and SD-2 (catalog query):** Postgres records 0 dependencies from the reminder functions to their tables, so a column rename passes migration and fails only at run time. The consent and opt-in conditions are copied 8 times each, and they have already drifted (SD-3).

**Looks like debt, isn't:** every RPC name in the generated types is current (TD-10), and only `worker.ts` imports the pipeline (TD-9).

**Still unknown:** whether two send runs can overlap in production (SD-6).

## 4. Refactoring plan (L4)

**Shape and intent:** each job is a Transaction Script, which is the right size for three small jobs, so only the copied skeleton should go. Earlier plans and PRs show the copies were shortcuts. S-06 "mirrors `appointment.ts`" and S-07 says "Copy S-04, not S-06", and no change ever rejected a shared runner. So this is accidental complexity, safe to remove.

**Options, ranked:**

- **(A) Characterization tests:** the guard, kept as step one.
- **(B) A shared runner:** chosen.
- **(C) Injection per job:** rejected, because it costs the same churn without removing the duplication.

**Target shape:**

- One pure `runClaimSendMark(spec, run, budget, deps)` in `runner.ts` owns the gates, sending, the dry-run stop, marking and logging.
- Each job becomes a small spec. The database client, sender and site URL are injected through `deps.ts`, and the builders become pure modules.
- Job names and signatures stay the same, so `worker.ts` and `chain.ts` don't change.
- A spike runner reproduced the current output in 42 of 42 scenarios.

**Path:** guard first, then branch by abstraction. Characterization tests pin invariants I1–I15. The runner lands unused, then the jobs move to it one PR at a time.

**Deliberately not doing:**

- the SQL copies (SD-2), which need a migration that a Worker rollback does not undo;
- the product question (SD-3);
- TD-4, TD-5 and TD-6 (the batch cap would change the RPC arguments);
- any change to the chain, the log names or the email copy.

| #   | Phase                                     | Verification                                                                                        |
| --- | ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | Characterization tests of the three jobs  | Auto: tests, plus a break matrix over 7 invariant classes. Manual: review of the pinned email copy  |
| 2   | Move `MAX_BATCH_SIZE` to a pure module    | Auto                                                                                                |
| 3   | Pure runner and deps, not used yet        | Auto: runner tests                                                                                  |
| 4–6 | Appointment, nudge, then due job → runner | Auto: phase 1 tests unchanged, plus a deliberate break. Manual: next 10:00 production log unchanged |
| 7–8 | Extract the appointment and due builders  | Auto: copy and privacy tests, plus a deliberate break. Manual (phase 8): all three jobs unchanged   |

**Outcome:** implemented as 7 PRs (#99–#113, 2026-10-28 to 2026-11-01), each of which can be rolled back on its own. ast-grep on `main` finds:

- 3 `runClaimSendMark` calls;
- 0 copied `log` helpers;
- 3 exported builders;
- `sendEmailBatch` only injected (`deps.ts:9`).

The production log checks after phases 4 and 5 passed. The checks after phases 6 and 8 are still open.

## 5. The domain, DDD view (L5)

**Ubiquitous language:**

- a **screening** is a catalog entry;
- an **exam** is the user's own badanie (plan → appointment date → done or confirmed);
- the **tier** is the importance level, 1 to 3;
- **due again** means a repeat exam whose interval has passed;
- a **reminder** is about a date, while a **nudge** prompts the next step.

Of 50 core and supporting terms, 4 have no counterpart in code, and the most important missing one is the exam itself. In Polish, `badanie` means both screening and exam, and in code `due` has five meanings.

**Drift between the model and the code:**

- **D-01:** appointment reminders go out for retired entries. This is intended.
- **D-02:** a catalog snapshot could hide users' records. Fixed by F-17.
- **D-03:** "mark done" is two separate writes. Still open.
- **B-04:** a missing catalog entry hid the user's exam. Fixed by S-10.

**Invariant #1 and its aggregate:** for every (user, screening) pair, the stored rows place the exam in exactly one place. It belongs to the implicit **Exam** aggregate, whose identity is `(user_id, catalog_slug)`. It ranks first on all three axes:

- **How central it is:** it sits in the Core subdomain.
- **How spread out it is:** across the route handler, two SQL functions, three ledgers and `partitionDashboard`.
- **How weakly it is enforced:** only declared. "Mark done deletes the plan" is two PostgREST calls.

**Anti-corruption layer:**

- **Already isolated:** Resend sits behind an adapter, since `email.ts` is the only file that calls its API. Supabase Auth errors are translated in one place, `auth-errors.ts`.
- **The leak:** Supabase's query builder appears in 3 layers. That is 9 calls in 5 API routes (5 of them in `api/screenings.ts`), 7 in the read modules and 5 in the reminder jobs, all counted with ast-grep.
- **Proposal:** an `ExamRepository` port with a Supabase adapter, in which `markDone` is one atomic RPC.
- **Done when:** `.from()` and `.rpc()` no longer appear in `src/pages`.

## 6. Decisions that are mine

The agents traced, measured and ranked; I decided what the code could not:

- **Retired entries:** I kept appointment reminders for them, although the domain analysis flagged this as drift, because the reminder is about the user's own booked visit.
- **What "becomes due" means:** I narrowed the PRD to repeat exams. First-time eligibility shows on the dashboard, with no email.
- **Catalog status:** I made it forward-only and treated B-04 as a bug, because a user's plan must never disappear.
- **The refactor:** the agent's ranking was a proposal; at the planning gate I chose the TypeScript-only refactor over the SQL helper, because a rollback undoes code but not a migration. I shipped it one PR per phase, with a production check between the job phases.
- **Launch-time risks:** I accepted the 92-email daily cap and direct REST access for now. I moved them, with medical sign-off and re-consent, to a launch gate, because no public launch is planned.

## 7. Next steps

**From this work:**

1. Test reminder recipients against a real database, including a consent-withdrawal sweep (test-plan Phase 2, SD-5).
2. Build the `ExamRepository` port, which makes mark-done atomic (D-03).
3. Write an additive migration for SD-1 and SD-2.
4. Add a CI check on `database.types.ts`.
5. Close the two remaining production checks from the refactor.

**Parked on the roadmap, in pickup order:**

1. F-07 production checks.
2. The launch gate: medical sign-off, a data-protection impact assessment (DPIA) and re-consent.
3. A post-deploy reminder check.
4. Optional follow-up profiling (FR-010).
5. AI at runtime and AI-assisted catalog updates.
6. A shared AI-toolkit package.
7. The PRD non-goals: an NFZ queue-watcher, a medicine tracker, booking and family accounts.
