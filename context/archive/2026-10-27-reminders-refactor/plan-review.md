<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Reminder jobs: shared claim → send → mark runner

- **Plan**: `context/changes/reminders-refactor/plan.md`
- **Mode**: Deep
- **Date**: 2026-10-27
- **Verdict**: REVISE → all findings decided and applied to plan.md (2026-10-27)
- **Findings**: 2 critical, 2 warnings, 3 observations

## Verdicts

| Dimension             | Verdict               |
| --------------------- | --------------------- |
| End-State Alignment   | PASS                  |
| Lean Execution        | PASS (1 observation)  |
| Architectural Fitness | PASS                  |
| Blind Spots           | FAIL                  |
| Plan Completeness     | PASS (2 observations) |

## Grounding

8/8 existing paths ✓ (the 5 new files are confirmed absent), 12/12 symbols and cited lines ✓, brief↔plan ✓ (same 7 phases, same order, same decisions), Progress↔Phase ✓ (7/7 phases, 25/25 criteria rows, no checkboxes in phase bodies).

Checked against the code:

- `getActiveRuleCatalog` is `.from().select().eq()` (`src/lib/catalog/read.ts:76-79`). The planned `fakeClient` matches it.
- `MAX_BATCH_SIZE` is at `email.ts:17`, the dry-run branch at `email.ts:79-83`, the `RangeError` at `email.ts:77`, and `workerLogsConfig` at `eslint.config.js:77-88`.
- `ReminderRun` is defined in `chain.ts:8`. `README.md:357` says the outcome lines keep their shape. The site is `astro.config.mjs:13`. CI pins the run at `1790841600000` (`ci.yml:72-87`, `chain.test.ts:7`).

## What holds (checked on request)

- **The guard comes first and needs no source change.** `vitest.config.ts` is plain Vitest, without Astro's Vite plugin. So:
  - `vi.mock("astro:env/server")` works (precedent: `email.test.ts:4-8`);
  - `import.meta.env.SITE` is read at runtime, so `vi.stubEnv` takes effect.

  `admin-client.ts` reads `SUPABASE_*` only inside `createReminderClient` (`:16-19`). Because of that, the `importOriginal` partial mock that keeps `ReminderConfigError` loads without those exports. The only source edit in phase 1 is the temporary deliberate break, which is reverted.

- **Dry run is covered** by I1–I3 (phase 1 dry-run row, phase 3 "dry run never marks").
- **The failure alert is covered by composition.** Phase 1 pins each failing job's error fields (`name/step/code/operation/status/resendError`), I8 pins `mark` (`observability.ts:186-187`), and `chain.test.ts` keeps I5. `chain.ts:67` confirms that nothing downstream compares errors by identity.
- **Runner contract.** It reproduces the log shape, including `fields` between `scheduledAt` and `due` and the `failed` line without `fields`. It also keeps the `client`-factory timing (I14).

## Findings

### F1 — Phases 4–7 are a stack, not independently revertable

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Implementation Approach ("Reverting phase 4, 5 or 6 restores that job's hand-written body without touching the others"); Migration Notes; Phases 4, 6, 7
- **Detail**: The plan makes two claims that contradict each other: "revertable on its own when undone in reverse order" and "without touching the others". The code supports only the first, and only as a stack:
  - **Phase 4 creates `src/lib/reminders/deps.ts`, and phases 5 and 6 import it.** A `git revert` of phase 4 alone, after phase 5 or 6 has landed, deletes a module two jobs depend on, so the build fails.
  - **Phase 6 removes the three job files from `workerLogsConfig.files`** (`eslint.config.js:77-88`). Reverting phase 4 or 5 alone after phase 6 brings back `console.log` in a file that is no longer allow-listed. `npm run lint` fails, and so does the CI `ci` job.
  - **Phase 7 edits `appointment.ts` and `due-screening.ts` again.** Reverting phase 4 or 6 after phase 7 conflicts.
  - **Worker rollback has three limits the Migration Notes don't mention.**
    - It is per deploy. Every merge to `main` deploys, and the plan leaves PR grouping open ("Phases may ship in separate PRs"). So a rollback undoes exactly one phase only if that phase was its own PR, and only while it is the latest deploy. Rolling back phase 4 after phase 6 has shipped also rolls back 5 and 6, plus any unrelated merges in between.
    - It is not sticky. The next merge to `main` redeploys the bad code unless a git revert PR follows.
    - It restores code, not data. Marks, and ledger rows inserted by a faulty run, stay. A runner bug that marks without sending consumes that day's reminders for good. "Restores the previous behaviour fully" (Migration Notes) holds only for code.
- **Fix A ⭐ Recommended**: Make each job phase self-contained, and fix the unit of rollback
  - Move `deps.ts` into phase 3. It has no consumer there, so production behaviour cannot change.
  - Drop phase 6's allow-list cleanup. Instead, each of phases 4, 5 and 6 removes only its own job's entry.
  - Split phase 7 into 7a (appointment builder) and 7b (due builder), and state "revert 7a before 4, 7b before 6".
  - In Migration Notes, require one PR per phase from phase 3 on. Rollback procedure: Worker rollback now (`wrangler rollback`), then a git revert PR of that phase before the next merge. Note that marks and claims made by a faulty run are not undone.
  - Strength: The plan's "independently revertable" claim becomes true for 4/5/6. Each revert touches one job file plus one eslint line.
  - Tradeoff: One or two more PRs to merge and watch. Phase 3 gains a wiring file with no consumer yet.
  - Confidence: HIGH — the coupling is visible in the plan's own file lists, and `deps.ts` is pure wiring.
  - Blind spot: Whether the orchestrator's merge policy allows a 10:00-run soak between phase PRs (see F3).
- **Fix B**: Keep the structure and state the honest rule
  - Replace "without touching the others" with "phases 3–7 revert only as a stack, newest first".
  - Ship phases 3–7 as one PR, whose Worker rollback is the unit.
  - Strength: No plan restructuring.
  - Tradeoff: It gives up the per-job rollback that motivated splitting phases 4–6, and one bad job rolls back all three.
  - Confidence: HIGH — accurate as written.
  - Blind spot: A bigger single deploy to watch.
- **Decision**: ACCEPTED — Fix A (orchestrator): `deps.ts` moved to phase 3 (no consumer); phases 4/5/6 each remove only their own allow-list line; builders split into phase 7 (7a) and phase 8 (7b) with "revert 7a before 4, 7b before 6"; Migration Notes state one PR per phase from phase 3, `wrangler rollback` then a revert PR, and that data is not undone.

### F2 — Only phase 1 has a deliberate-break check, and it covers one property

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Success Criteria of phases 1–7; Progress
- **Detail**: Criterion 1.4 swaps mark and send in one job. That proves one ordering property for one job against today's code. Phases 2–7 have no deliberate-break criterion. Their only gate is "the phase 1 files are unchanged and green".

  A green, unchanged test file shows that nothing it checks has changed. It does not show that it checks the new code path. After phase 4, the plan never proves that `appointment.test.ts` fails when `runner.ts` misbehaves, and the same holds for phases 5 and 6. A break in the runner is the exact regression this refactor risks.

  Most invariants are never break-tested even in phase 1:
  - I1: dry-run return removed;
  - I4: recipient swapped;
  - I6: error wrapped;
  - I7: `message` in the `failed` line;
  - I13: prefix changed;
  - I14: client hoisted above the gate.

  If an assertion silently matches nothing, for example because the recorder misses a line, the guard would look green anyway.

- **Fix**: Add a break matrix and a per-phase break row:
  - **Phase 1:** one temporary break per invariant class, each run against its file and reverted:
    - drop the `"dryRun" in result` return (I1);
    - send to `REMINDER_TEST_TO` (I4);
    - `throw new Error("x", { cause })` in the catch (I6);
    - add `message` to the `failed` line (I7);
    - change a prefix (I13);
    - move `createReminderClient()` above the gate (I14);
    - keep the mark/send swap.
  - **Phase 2:** setting `MAX_BATCH_SIZE` to 99 fails the nudge budget-250 case.
  - **Phases 3–6:** one break in `runner.ts` (for example, mark before the dry-run check) must fail `runner.test.ts`, and from phase 4 on also each migrated job's characterization file.
  - **Phase 7:** putting a slug into a builder's text fails the builder test and the job's `sent` transcript.
  - Add each as a Progress row (`N.x A deliberate <break> fails <file> and is reverted before commit`).
  - Strength: Each phase proves that its guard can catch a change in the code that phase actually changed.
  - Tradeoff: About 10 minutes of throwaway edits per phase.
  - Confidence: HIGH — `/10x-goal-implement` already runs a deliberate-break gate per phase, so this aligns with the toolchain.
  - Blind spot: None significant.
- **Decision**: ACCEPTED (orchestrator): phase 1 break matrix (7 invariant classes, each reverted) plus one deliberate-break row in every later phase.

### F3 — The invariants don't pin the returned `sent`, the budget-0 config error or error identity

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 scenario table; research invariants I1–I14
- **Detail**: Four checks are missing.
  - **Budget arithmetic.** `chain.ts:39,47` subtracts each job's returned `sent` to compute the next budget. No invariant names that return contract: `sent` is the Resend-accepted count on `sent` and 0 on every other outcome. The phase 1 table asserts `outcome` and the log's `sent`, not `result` per scenario. `chain.test.ts` uses fake jobs, so it cannot catch it. A runner returning `sent: rows.length` on `dry-run`, or a NaN-producing value on any branch, would pass the guard. A NaN fails open: `NaN <= 0` is false, so the budget gate passes.
  - **I14 on the budget gate.** I14 is tested only on the cron-gate skip. The budget-0 rows assert "0 RPC calls", which still holds if the runner calls `deps.client()` between the send gate and the budget gate.

    In production, with a missing secret, the appointment job fails. Due and nudge then get budget 0. Today they log `skipped`; with that runner they would log `failed` too, so 1 alert becomes 3 (I5). `runner.test.ts` would catch it, but the runner test is not the frozen guard.

  - **Error identity.** The plan asserts "an instance of the original class" (I6). For the `createReminderClient` throws scenario, the test owns the thrown object and can assert `toBe`.
  - **Gate inside the `try`.** `isDailySendRun` can throw (`schedule.ts:25-27`), and today that throw logs `failed`. The runner's 10-step list doesn't say where the `try` starts, and phase 1 doesn't pin it.
- **Fix**:
  - Add I15, "a job returns `{ outcome, sent }` with `sent` = accepted ids on `sent`, else 0", and assert `result` `toEqual` in every non-throwing phase 1 row.
  - Add a "`createReminderClient` throws with budget 0 → `skipped`, no throw" row for due and nudge.
  - Assert `toBe` in the config-error rows.
  - Add a `vi.mock("@/lib/schedule")` throwing-gate row → one `failed` line.
  - State in the runner step list that the `try` wraps step 1 and `scheduledAt` is computed outside it.
- **Decision**: ACCEPTED (orchestrator): I15 added; `result` `toEqual` in every non-throwing row; budget-0 config-error rows for due and nudge; `toBe` for error identity; throwing-gate row; the runner step list says `scheduledAt` is outside the `try`, which starts at the send gate, and the catch rethrows the same object.

### F4 — Production is checked only after the whole stack ships

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 7 Manual (7.4, 7.5); Testing Strategy → Manual Testing Steps
- **Detail**: Phases 4, 5 and 6 each change a production cron path and "may ship in separate PRs". But the only production checks (job log lines unchanged, CPU ≤ 10 ms) are phase 7 rows "after the eventual production deploy of the full stack".

  The CI dry-run step asserts only `"outcome":"ok"` and never reaches mark (`ci.yml:72-87`, dry run marks nothing). So a phase 4 deploy would get no production confirmation for up to three later phases. If F1 Fix A is adopted, the next phase would be stacked on an unobserved one.

- **Fix**: Add a Manual row to each of phases 4, 5 and 6: "the next 10:00 Warsaw run's `<event>` line has the same fields as the pre-deploy run, with no `error` line". Gate the next job phase on it. Keep the CPU row in phase 6, where the due job moves, and leave 7.4 as the final check.
- **Decision**: ACCEPTED (orchestrator): Manual production row in phases 4, 5 and 6 gating the next job phase; CPU row in phase 6; the final all-jobs check stays last (now 8.5, after the 7a/7b split).

### F5 — The `SITE` build check has no baseline and a fragile locator

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 §3 (criterion 4.3)
- **Detail**: The check looks for the production URL "in the module that contains `dbam-appointment-reminder`". After phase 4, `SITE` is read in `deps.ts`, which the bundler may emit in a different chunk from `appointment.ts`. The check is also first run in phase 4. If it fails there, nobody knows whether today's build already behaves that way (pre-existing) or whether phase 4 caused it, and phase 4 is told to stop either way.
- **Fix**:
  - Run the same check on today's build in phase 1 and record the result in `decisions.md` as the baseline.
  - In phase 4, assert on the whole server output (`grep -rl` for the URL present and for `import.meta.env.SITE` absent) instead of "the same module".
- **Decision**: ACCEPTED (orchestrator): phase 1 records the `SITE` baseline on today's build in `decisions.md`; phase 4 checks the whole server output against it.

### F6 — Phase 2's rationale doesn't survive the spec-location decision

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Phase 2 Overview
- **Detail**:
  - The research justified the move so that the spike's spec modules ran with no `astro:*` mock (`research.md:57-60,223`). The plan instead keeps each spec in its job file, next to `reminderDeps()` wiring that imports `astro:env` (Phase 4 §1). So no spec becomes mock-free.
  - The runner never needs the constant. It takes only types from `email`, which are erased.
  - The end state is reachable without phase 2.
- **Fix**: Either drop phase 2, or restate its purpose honestly: "keeps the nudge spec's value import off `email.ts`, so a later spec split stays mock-free". Phase 2 is cheap and harmless, so keeping it with the honest reason is fine.
- **Decision**: KEEP phase 2 (orchestrator), with the honest reason from the finding stated in its Overview.

### F7 — Small inaccuracies in criteria and contracts

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 criterion 1.1 and §1 `record()`; Phase 3 §1 Contract
- **Detail**:
  - **Criterion 1.1 can't hold as written.** It says "`git show --stat` lists only the 4 new test files", but the worker protocol puts Progress SHA write-backs and `decisions.md` into phase commits.
  - **`record()` would crash on a non-JSON line.** It captures `console.error` "as parsed lines", but the due job's cron path can emit a plain-string `console.error` (`validRuleEntries`, `catalog/read.ts:69`, which logs a catalog slug). The recorder would throw on it, and the privacy assertion would never see it.
  - **The runner's import list omits `ReminderRun`.** The type lives in `chain.ts:8`, and the list doesn't say whether to import it from there or redefine it.
- **Fix**:
  - Reword 1.1 to "no file under `src/` changes other than the 4 new test files".
  - Have `record()` keep non-JSON lines raw and include them in the privacy check.
  - Name `import type { ReminderRun } from "@/lib/reminders/chain"` in the runner contract.
- **Decision**: ACCEPTED (orchestrator): criterion 1.1 reworded to "no other src file changed"; `record()` keeps non-JSON lines raw and includes them in the privacy check; runner contract imports `ReminderRun` from `chain`.

## Re-check

- **Date**: 2026-10-27
- **Plan**: `plan.md` at `1efed5c`
- **Scope**: whether each accepted decision is resolved in `plan.md`. This is not a new review.

| Finding | Verdict  | Reason                                                                                                                                                                                                                                                                                                                                                                                    |
| ------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1      | Resolved | `deps.ts` is now in phase 3, phases 4/5/6 each remove only their own allow-list line, and the builders are split into phases 7 and 8 with the revert order stated. Migration Notes require one PR per phase from phase 3 on and spell out the rollback procedure (`wrangler rollback`, then a revert PR) and its limits (per deploy, code only, not sticky). Residual nit R1 below.       |
| F2      | Resolved | Phase 1 has a 7-row break matrix (rows 1.4 and 1.6–1.11). Every later phase has its own break row: 2.4, 3.4, 4.5, 5.4, 6.5, 7.4 and 8.4. From phase 4 on, each break must fail both `runner.test.ts` and the migrated job's test files.                                                                                                                                                   |
| F3      | Resolved | I15 is defined. `result` is asserted with `toEqual` on every non-throwing row. Due and nudge get a row for a budget of 0 with the client throwing. The config-error and gate-error rows assert `toBe`. A throwing gate is now tested through a `@/lib/schedule` mock. The runner's step list says `scheduledAt` is computed outside the `try` and that the `try` starts at the send gate. |
| F4      | Resolved | Phases 4, 5 and 6 each have a Manual production check (4.6, 5.5, 6.6), and each check gates the next phase. The CPU check moved to phase 6 (6.7). The final all-jobs check is 8.5.                                                                                                                                                                                                        |
| F5      | Resolved | Phase 1 §4 and row 1.12 record the `SITE` baseline. Phase 4 compares the whole server output against it. Residual nit R2 below.                                                                                                                                                                                                                                                           |
| F6      | Resolved | Phase 2's Overview now states the reason honestly, and that the runner does not depend on this phase.                                                                                                                                                                                                                                                                                     |
| F7      | Resolved | Row 1.1 is reworded. `record()` keeps lines that are not JSON as raw text, and the privacy check covers them. The runner contract imports `ReminderRun` from `chain`.                                                                                                                                                                                                                     |

Residual nits (low impact, not blocking):

- **R1: `git revert` will stop on a merge conflict, though the reverted code is sound.** Verified in a scratch repo.
  - The three job entries are adjacent lines in `eslint.config.js:84-86`. Once phase 6 has landed, a plain `git revert` of phase 4 or phase 5 conflicts on that hunk.
  - Phase 2 also edits the import on `follow-up-nudge.ts:1`, and phase 5 rewrites it. So reverting phase 2 after phase 5 conflicts too, although Migration Notes say phase 2 "reverts on its own".
  - Both conflicts take one line to resolve: re-add only that job's entry, or restore only that import.
  - Fix: one sentence in the Migration Notes revert procedure.
- **R2: the "URL present" half of the `SITE` check is always true.**
  - Astro inlines the site URL into many server chunks. The main checkout's `dist/server` has it in `entry.mjs` and in page chunks.
  - So the evidence comes from the "`import.meta.env.SITE` absent" half. Matching the phase 1 baseline still catches a change.
  - Optional fix: also grep for the URL in the chunk that holds `reminderDeps`.

**Overall: APPROVED.** All seven decisions are carried into `plan.md`. The two residual nits are optional one-line clarifications.
