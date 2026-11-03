---
artifact: architecture-report
track: 10xArchitect (module 4)
updated: 2026-11-03
repository: amakoz/dbam @ c9d5685
---

# Architecture report: Dbam

**Sources** (all from one repository, `amakoz/dbam`):

- **L2, repository map:** `context/map/repo-map.md`.
- **L3, feature research:** `context/archive/2026-10-27-reminders-research/research.md`.
- **L4, refactoring plan:** `context/archive/2026-10-27-reminders-refactor/plan.md` and `plan-brief.md`. Its implementation is in `context/archive/2026-10-28-reminders-runner/`.
- **L5, domain notes:** `context/domain/domain-distillation.md`, `glossary.md` and `anti-corruption-layer.md`.

## 1. The project

- **Dbam** reminds adults in Poland to do their preventive screenings (badania profilaktyczne). It is live at https://dbam.amadeuszkozlowski.workers.dev.
- **Stack:** Astro 7 SSR with React 19 islands, Tailwind 4 and shadcn/ui. Supabase provides Postgres, Auth and row-level security. The app runs on Cloudflare Workers with a daily cron, sends email through Resend, and is checked by GitHub Actions CI (unit, pgTAP, HTTP smoke and Playwright E2E).
- **Scale:**
  - about 7,900 lines of application code in 128 files, and about 6,400 lines of tests;
  - 15 SQL migrations and 20 catalog entries;
  - 86 commits and 82 merged PRs since 2026-09-24, from one maintainer.
- **Artifacts:** all four come from this repository. The map was taken at `159e566`, the research at `8529cc8` and the domain notes at `74c2d16`. The anti-corruption-layer note was taken at `c9d5685`.

## 2. Repository map (L2)

- **Where change concentrates:** the dashboard core loop. Exam records is the area later changes keep reopening. Recommendations is the busiest area (16 commits), and the two depend on each other (11 + 5 import edges).
- **Risk zone 1, the reminder pipeline:** the only code that runs unattended with the service-role key, outside RLS. It emails real people and reads three other areas' tables through SQL that neither imports nor lint can see.
- **Risk zone 2, exam records:** `src/lib/screenings/rules.ts` has the most dependants of any business file (9), and `api/screenings.ts` is the largest endpoint.
- **Entry points:** `src/pages/dashboard.astro` (the product on one page), `src/middleware.ts` (access control for every route) and `scheduled()` in `src/worker.ts` (the cron).
- **Main unknowns:**
  - people: one maintainer, no human reviews on 58 PRs, and no medical owner for the catalog;
  - what a schema change would break in the reminder SQL;
  - whether withdrawing consent also clears the reminder tables.

## 3. Feature analysis (L3): the reminder pipeline

**Why this feature:** it is risk zone 1 of the map, and two of the map's open unknowns point straight at it.

**Overview:** a cron fires twice a day, and a gate lets only the 10:00 Warsaw run send. `runReminderChain` then runs three jobs in order (appointment reminder, due-again reminder, follow-up nudge), all sharing one daily budget of 92 emails. Each job claims its recipients through a `SECURITY DEFINER` SQL function, sends one Resend batch with an idempotency key and marks the rows as sent. Its sent count reduces the next job's budget, so if one job fails, the later jobs send nothing that day.

**Technical debt:** I checked 17 structural claims, 15 confirmed and 2 refuted:

- TypeScript claims (Q1–Q10) used AST queries through the TypeScript compiler API.
- SQL claims (S1–S13) used read-only queries against the Postgres system catalog.

The three risks that matter most:

- **TD-1 (confirmed by AST query):** the same claim → send → mark sequence was copied by hand into all three jobs. The longest step sequence the three functions share is the whole sequence.
- **TD-7 and TD-8 (confirmed by AST query):** two of the three email builders were inline. No unit test imported any job, the worker, the schedule or the alert. That is a test gap in code that emails real people.
- **SD-1 and SD-2 (confirmed by catalog query):** Postgres records 0 dependencies from the reminder functions to the tables they read, so a column rename passes migration and fails only at run time. The consent and opt-in conditions are copied 8 times each, and the copies have already drifted (SD-3).

## 4. Refactoring plan (L4)

**What:** TD-1, TD-7 and TD-8, using the "guard, then shared runner" option.

- **Target shape:** one pure `runClaimSendMark(spec, run, budget, deps)` in `runner.ts`. It owns the gates, the lazily created client, sending, the dry-run stop, marking and logging.
- **Each job** becomes a small spec. The database client, sender and site URL are injected through `deps.ts`, and both email builders become pure modules.
- **Unchanged:** the job names and signatures, so `worker.ts` and `chain.ts` stay as they are.
- **Evidence:** a spike runner reproduced the current output in 42 of 42 scenarios.

**Deliberately not doing:**

- **SQL changes (SD-2):** they need a migration, and a Worker rollback does not undo one.
- **Product questions (SD-3).**
- **TD-4, TD-5 and TD-6:** fixing the batch cap would change the RPC arguments and break the recorded outputs.
- **Changes to** the chain, the log names or the email copy.
- **Rejected option:** injection per job, which costs the same churn without removing the duplication.

| #   | Phase                                                    | Verification                                                                                                                                                           |
| --- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Characterization tests of the three jobs (I1–I15)        | Auto: tests, plus a break matrix over 7 invariant classes. Manual: review of the pinned email copy                                                                     |
| 2   | Move `MAX_BATCH_SIZE` into `email-budget.ts`             | Auto                                                                                                                                                                   |
| 3   | Pure runner and production deps, not used yet            | Auto: runner tests                                                                                                                                                     |
| 4–6 | Appointment, nudge, then due-screening job on the runner | Auto: phase 1 tests unchanged, plus one deliberate break per phase. Manual: the next 10:00 production run logs the same fields with no error (phase 6 also checks CPU) |
| 7–8 | Extract the appointment builder, then the due builder    | Auto: copy and privacy tests, plus a deliberate break. Manual (phase 8): all three jobs log unchanged                                                                  |

**Outcome:** implemented as 7 PRs (#99–#113, 2026-10-28 to 2026-11-01). Each PR can be rolled back on its own. The production log checks after phases 4 and 5 passed; the checks after phases 6 and 8 are still open.

## 5. The domain, DDD view (L5)

**Ubiquitous language** (`glossary.md`):

- **screening** is a catalog entry;
- **exam** is the user's own badanie: plan → appointment date → done or confirmed;
- **tier** is the importance level, 1 to 3;
- **due again** means a repeat exam whose interval has passed;
- a **reminder** is about a date, while a **nudge** prompts the next step.

Of 50 core and supporting terms, 4 have no counterpart in code, and the most important missing one is the exam itself. In Polish, `badanie` means both screening and exam, and in code `due` has five meanings.

**Drift between the model and the code:**

- **D-01:** appointment reminders go out for retired entries. This is intended behaviour.
- **D-02:** a catalog snapshot could demote an active entry and hide users' records. Fixed by F-17.
- **D-03:** "mark done" is two separate writes. Still open.
- **B-04:** a plan with a missing catalog entry hid the user's exam. Fixed by S-10.

**Invariant #1 and its aggregate:** for every (user, screening) pair, the stored rows place the exam in exactly one place. This belongs to the implicit **Exam** aggregate, whose identity is `(user_id, catalog_slug)`. Its rules are spread across the route handler, two SQL functions, three reminder ledgers and the read rule `partitionDashboard`. It ranks first because three drift findings and B-04 all land on it. Its weakest rule ("mark done deletes the plan, after writing the completion") is two PostgREST calls.

**Anti-corruption layer:**

- **Already isolated:** Resend sits behind an adapter, since `src/lib/email.ts` is the only file that calls its API. Supabase Auth errors are translated in one place, `auth-errors.ts`.
- **The leak:** Supabase's query builder appears in 3 layers: 9 calls in 5 API routes (5 of them in `api/screenings.ts`), 7 in the read modules and 5 in the reminder jobs.
- **Proposal:** an `ExamRepository` port with a Supabase adapter, in which `markDone` is one RPC and therefore atomic.
- **Done when:** `git grep -nE '\.(from|rpc)\(' -- src/pages` returns no lines.

## 6. Decisions that are mine

The agents traced, measured and ranked; I decided the questions the code could not answer:

- **Retired entries:** I kept appointment reminders for them, even though the domain analysis flagged this as drift (D-01), because the reminder is about the user's own booked visit.
- **What "becomes due" means:** I narrowed the PRD to repeat exams. Screenings a user becomes eligible for for the first time appear on the dashboard, with no email.
- **Catalog status:** I made it forward-only and treated B-04 as a bug, because a user's plan must never disappear. This became F-17 and S-10.
- **The refactor:** from the debt ranking I took the TypeScript-only refactor over the SQL helper, because a Worker rollback undoes code but not a migration. I shipped it one PR per phase, with a production log check between the job phases.
- **Launch-time risks:** I accepted the 92-email daily cap and direct access to the Supabase REST API for now. I moved them, together with medical sign-off and re-consent, to a launch gate, because no public launch is planned.

## 7. Next steps

**From this work:**

1. Test reminder recipients against a real database (test-plan Phase 2). This includes checking that withdrawing consent clears every table with `user_id` (SD-5).
2. Build the `ExamRepository` port, which makes mark-done atomic (D-03).
3. Write an additive migration for SD-1 and SD-2.
4. Add a CI check that the generated `database.types.ts` matches the migrations.
5. Close the two remaining production checks from the refactor.

**Parked on the roadmap, in the order they will be picked up:**

1. Production checks for error tracking (F-07).
2. The launch gate: medical sign-off, a data-protection impact assessment (DPIA), re-consent, the email cap and direct REST access.
3. An automated post-deploy check of the reminder emails.
4. Optional follow-up profiling (FR-010).
5. AI at runtime and AI-assisted catalog updates.
6. A shared AI-toolkit package on a registry.
7. The PRD non-goals: an NFZ queue-watcher, a medicine tracker, in-app booking and family accounts.
