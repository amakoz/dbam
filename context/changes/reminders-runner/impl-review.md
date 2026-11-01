<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Reminder jobs — shared claim → send → mark runner

Later PRs append one section per phase below this one.

## PR A — phases 1 and 2

- **Plan**: context/changes/reminders-runner/plan.md
- **Scope**: Phases 1–2 of 8 (PR A). Phases 3–8 are not implemented yet by design; their open Progress rows are not findings.
- **Reviewed phases**: 1, 2
- **Commits**: 14f1302 (phase 1), ea0cc9c (phase 2)
- **Date**: 2026-10-28
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 2 observations

### Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

### Verification run by the reviewer

- `npm test`: 20 files, 385 tests passed.
- `npm run lint`: exit 0. `npx astro check`: 0 errors, 0 warnings, 0 hints.
- Phase 1 changed only the 4 planned files under `src/` (`git diff --name-only 14f1302^ 14f1302 -- src/`).
- The phase 1 test files and helper are byte-identical at HEAD (`git diff --quiet 14f1302 HEAD -- …`).
- `src/lib/email-budget.ts` has no `astro:*` import. The only hit is the word in its header comment.
- Gate 2.4 re-run: `MAX_BATCH_SIZE = 99` fails only "budget 250 claims 100"; reverted.
- Break-matrix spot checks (reverted): a changed appointment key prefix fails 2 appointment tests, and removing the due job's `"dryRun" in result` branch fails 1 due test. The other five breaks (1.4, 1.7, 1.8, 1.9, 1.11) were not re-run. Nothing records their results.
- Scope: `chain.ts`, `worker.ts`, `failure-alert.ts`, `observability.ts`, `eslint.config.js` and `roadmap.md` are untouched. `email.ts` changed only where the constant is declared, and its `RangeError` text is unchanged.

### Findings

#### F1 — Some throwing rows don't pin the `failed` line, against the plan's contract

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/lib/reminders/due-screening.test.ts:387-415, src/lib/reminders/appointment.test.ts:274-282, src/lib/reminders/follow-up-nudge.test.ts:306-313
- **Detail**: Plan phase 1 says "Every throwing row asserts exactly one `failed` line and a rethrow (I6)". These rows check only `out.error` and never assert the log lines:
  - due: claim error, Resend 500 and missing-id;
  - nudge: missing-id.

  Appointment missing-id checks only `toHaveLength(1)`, not the line itself. As a result, the due job's `failed` line for a send failure (`status: "500"`, `resendError`) is pinned nowhere, and neither is its claim-failure line. Phase 6 replaces exactly that catch path. A duplicated or extra line there would pass these rows. The guard is frozen from phase 2 on ("unchanged since phase 1"), so this is the last cheap moment to tighten it.

- **Fix A ⭐ Recommended**: Before PR A merges, add `expect(out.logs).toEqual([{ …failed line… }])` to the 5 rows. Make "unchanged since phase 1" refer to that commit, and record the new reference SHA in `decisions.md`.
  - Strength: delivers the plan's stated contract. Uses the same shape the sibling rows already use (e.g. appointment.test.ts:259-268).
  - Tradeoff: the guard's reference moves off 14f1302, and phase 4–8 reviewers must diff against the new SHA.
  - Confidence: HIGH — the expected lines follow from today's code and the pinned sibling rows.
  - Blind spot: today's due-job line for a Resend 500 hasn't been observed; write it from code and confirm the test goes green before committing.
- **Fix B**: Accept the gap and note in `decisions.md` that the runner's single catch is pinned through the appointment and nudge rows from phases 4–5 on.
  - Strength: no change to the frozen guard.
  - Tradeoff: phase 6's due-specific `select` can still add or drop log lines on claim failure without failing a test.
  - Confidence: MED — the shared catch covers most of it, but `select` runs inside it.
  - Blind spot: whether phase 6's `select` will log anything itself.
- **Decision**: Fix A — applied (dc62600)

#### F2 — Manual row 1.5 ticked with no reviewer evidence, and the phase-1 pause was skipped

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/reminders-runner/plan.md:725-726
- **Detail**: Row 1.5 ("Reviewer confirms the pinned sent-transcript email copy…") is `[x] — 14f1302`. `decisions.md` records only that the worker pinned the copy by hand from `src/i18n`. No reviewer is named and no confirmation is recorded. The plan says "Pause after this phase for the manual check before phase 2", yet phase 2 was committed 2 minutes after phase 1 (09:08 → 09:10). The person who wrote the expectations is not an independent reviewer of them.
- **Fix**: Have the orchestrator or the owner read the 3 `sent` transcripts (appointment.test.ts:189-221, due-screening.test.ts:275-306, follow-up-nudge.test.ts:221-254) against `src/i18n/{pl,en}.ts`, and record who confirmed in `decisions.md`. Otherwise reset 1.5 to `[ ]` until someone does.
- **Decision**: Fixed (reviewer-confirmed): the reviewer pane (Opus, independent of the author) verified the pinned sent-transcript copy in the 3 test files against today's i18n and builders, with no exam name or health data

#### F3 — The `SITE` baseline doesn't match the plan's phase 4 gate, and only `decisions.md` records the reinterpretation

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/reminders-runner/decisions.md (SITE build baseline), plan.md:421-427, plan.md:752
- **Detail**: Plan phase 4 §3 and Progress 4.3 require `import.meta.env.SITE` to be **absent** from `dist/`. The phase 1 baseline found 1 hit: Astro's own deprecation text in `dist/server/chunks/dist_*.mjs`. The worker redefined the phase 4 pass condition in `decisions.md` ("pass when that is still the only hit"), marked `decided-by: worker`. The plan text still says "absent". A phase 4 worker who reads only the plan will either fail a sound build, or start making their own judgment calls about the gate.
- **Fix**: The orchestrator confirms the reinterpretation (re-mark it `decided-by: orchestrator`), and phase 4 §3 plus row 4.3 get one line: "absent apart from the vendor hit recorded in decisions.md (SITE build baseline)".
- **Decision**: Confirmed by the orchestrator — applied (decisions.md; plan.md phase 4 §3 and row 4.3)

#### F4 — Progress SHA write-backs are malformed

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/reminders-runner/plan.md:720-721, 725-726, 735-737
- **Detail**: Rows 1.12 and 1.5 carry ` — 14f1302` on a wrapped continuation line. Row 2.4's ` — ea0cc9c`, which is uncommitted, sits on its own line and has eaten the blank line before `### Phase 3`. The convention is ` — <sha>` at the end of the step line. Parsers that read the SHA from the row line won't find it.
- **Fix**: Put each SHA at the end of its row line and restore the blank line before `### Phase 3`. Commit it with the PR A epilogue.
- **Decision**: Fix applied

#### F5 — Plan references point at the pre-archive change folder

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/reminders-runner/plan.md:84, 695-698
- **Detail**: The References section cites `context/changes/reminders-refactor/{research,plan-review,decisions}.md`, and the scope list cites `follow-ups/td-5-job-list.md`. Neither path exists any more: the folder is now `context/archive/2026-10-27-reminders-refactor/`. Phases 3–8 depend on the I1–I14 table in that research file, so later workers will hit dead links.
- **Fix**: Repoint the 4 references to `context/archive/2026-10-27-reminders-refactor/…` (editing this plan only; the archive itself stays read-only).
- **Decision**: Fix applied (4 references repointed)

## PR B — phase 3

- **Plan**: context/changes/reminders-runner/plan.md
- **Scope**: Phase 3 of 8 (PR B, branch `feat/reminders-runner-p3`, commit bdff91e). Phases 1–2 merged in #99 (8410cdb); phases 4–8 are open by design.
- **Reviewed phases**: 3
- **Date**: 2026-10-28
- **Verdict**: APPROVED (2 low-impact warnings, both about git history, not code)
- **Findings**: 0 critical, 2 warnings, 0 observations

### Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

### Verification run by the reviewer

- Phase 3's own diff (`8410cdb..bdff91e`) is the 4 planned files plus `decisions.md` and `plan.md`: `runner.ts`, `runner.test.ts`, `deps.ts` and one `eslint.config.js` line. No job file, `chain.ts`, `worker.ts` or `roadmap.md` is touched.
- `runner.ts` matches the runner contract and the 9-step order:
  - `scheduledAt` is computed before the `try`;
  - the send gate comes before the budget gate;
  - `deps.client()` is called after both gates;
  - the dry-run check comes before the mark;
  - the catch logs `failed` with `errorName` and `errorDetails` (no `message`) and rethrows by identity;
  - `fields` fall between `scheduledAt` and `due`, and are absent from `skipped` and `failed` lines.

  Its imports are the planned pure set only (`astro:` appears only in the header comment). Log-line order and the counts in `due` and `sent` equal today's `appointment.ts:54-74`.

- `deps.ts` binds `createReminderClient` (the function), `sendEmailBatch` and `import.meta.env.SITE`, and reads `SITE` only when the job calls it, never at import.
- `runner.test.ts` covers every item in the plan's list. Its only mock is `@/lib/schedule`, with 0 `vi.mock("astro:` calls.
- `npm test`: 21 files, 409 tests passed. `npm run lint`: exit 0. `npx astro check`: 0 errors.
- Gate 3.4 re-run: a mark call before the dry-run check fails 2 runner tests ("…never marks", "marks the flattened ids…"); reverted.
- Guard: the 3 job tests and the helper are byte-identical to both dc62600 and main (8410cdb).

### Findings

#### F1 — The phase 3 branch still sits on PR A's pre-squash commits

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: branch `feat/reminders-runner-p3` (parent chain 14f1302 → … → 8bf4efb)
- **Detail**: #99 was squash-merged (8410cdb has the single parent a3d4b7e), but bdff91e still descends from PR A's 5 original commits, so `git merge-base --is-ancestor 8410cdb bdff91e` fails. A PR opened from this branch would list those 5 commits again and show 16 files against main. The phase 3 change itself is only 6 files, and its content is identical to `8410cdb..bdff91e`. `decisions.md` ("Phase 3 built on a local branch") already plans the rebase. The branch has no upstream and isn't on origin, so rebasing is allowed.
- **Fix**: Before opening PR B, run `git rebase --onto origin/main 8bf4efb feat/reminders-runner-p3`, then confirm `git diff --stat origin/main...HEAD` lists only the phase 3 files.
- **Decision**: Fixed (rebased onto origin/main; the diff lists only phase 3 files)

#### F2 — The guard reference and the phase 1–2 SHAs point at commits that aren't on main

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/reminders-runner/plan.md:92, plan.md Progress rows 1.x/2.x, decisions.md (F1 triage, phase 3 gate notes)
- **Detail**: The plan names dc62600 as the reference for "unchanged since phase 1", which phases 4–8 diff against, and Progress cites 14f1302 and ea0cc9c. The squash merge left all three off main (`git merge-base --is-ancestor dc62600 origin/main` fails). They survive only in this worktree and in GitHub's PR refs, so later phase workers on a fresh worktree will run `git diff dc62600 -- …` against an unknown revision. The guard files at 8410cdb are byte-identical to dc62600 (verified).
- **Fix**: In `plan.md` "Guard first" and in `decisions.md`, repoint the reference to 8410cdb (#99 on main), and note that the Progress SHAs 14f1302 and ea0cc9c were squashed into 8410cdb. Ship that with PR B.
- **Decision**: Fixed (reference repointed to 8410cdb; the squash is noted in plan.md and decisions.md)

## PR C — phase 4

- **Plan**: context/changes/reminders-runner/plan.md
- **Scope**: Phase 4 of 8 (PR C, local branch `feat/reminders-runner-p4`, commit 2dacbb5 vs its parent). Phases 1–3 merged in #99/#100. Manual row 4.6 (the next production run) is open by design and gates phase 5.
- **Reviewed phases**: 4
- **Date**: 2026-10-28
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 0 observations

### Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

### Verification run by the reviewer

- **Scope.** The commit touches only the planned `src/lib/reminders/appointment.ts` and the one `eslint.config.js` line (the appointment entry removed; the due, nudge and runner entries kept), plus `plan.md` and `decisions.md`. The runner, deps, chain, worker and the other two jobs are untouched.
- **Spec.** `appointmentJob` keeps the planned values:
  - event `appointment-reminder` and prefix `dbam-appointment-reminder`;
  - claim arguments `p_today: warsawToday(now)`, `p_lead_days: APPOINTMENT_REMINDER_LEAD_DAYS` and `p_limit: REMINDER_EMAIL_DAILY_BUDGET`;
  - claim error `ReminderDatabaseError("claim", code)`;
  - ids from `reminder_ids` and the mark RPC `mark_appointment_reminders_sent`.

  The call is `runClaimSendMark(appointmentJob, run, undefined, reminderDeps())`. `buildMessage` now takes `(row, site)`, with its body otherwise byte-identical. The local `log` helper is gone. `AppointmentReminderOutcome` is an alias of `ReminderOutcome`. The header keeps the job's own facts; the skeleton details moved to `runner.ts`.

- **Signature.** `runAppointmentReminders(run: ReminderRun)` is structurally the old `{ cron, scheduledTime }` (`chain.ts:8-11`). It is no longer `async`, so `reminderDeps()` runs before the runner's `try`. That is safe: `reminderDeps()` only reads 2 function references and an inlined literal, so it cannot throw. Even if it did, `chain.ts:37-42` catches the throw of `await appointment(run)` and alerts; only the job's own `failed` line would be missing. The decision is recorded in `decisions.md`.
- **Gates:**
  - `npm test`: 21 files, 409 tests passed.
  - `npm run lint`: exit 0. `npx astro check`: 0 errors. `npm run build`: exit 0.
  - 4.1: the 3 job tests and the helper are byte-identical to 8410cdb.
  - 4.3: same as the baseline. The URL is in 20 files, and `import.meta.env.SITE` appears only as the vendor hit in `dist/server/chunks/dist_CXvK08EP.mjs`. The `reminderDeps` chunk has `site: "https://dbam.amadeuszkozlowski.workers.dev"` (`dist/server/entry.mjs:438`, next to `keyPrefix: "dbam-appointment-reminder"` at :567).
  - 4.4: `appointment.ts` has no `console.` and no `sendEmailBatch(` call.
  - 4.5 re-run: a mark before the dry-run check in `runner.ts` fails 2 runner tests and 2 appointment tests (dry run, sent transcript). Reverted.
- **Bookkeeping.** The Progress write-back ` — 2dacbb5` for rows 4.1–4.5 is in the working tree, uncommitted, as the worker protocol allows.

### Findings

None.

## PR D — phase 5

- **Plan**: context/changes/reminders-runner/plan.md
- **Scope**: Phase 5 of 8 (PR D, local branch `feat/reminders-runner-p5`, commit 4140ba4 vs its parent). Manual row 5.5 (the next production run) is open by design. PR D ships only after row 4.6 has passed on the deployed PR C (plan phase 5 overview; `decisions.md`, "Phase 5 gate notes").
- **Reviewed phases**: 5
- **Date**: 2026-10-28
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 0 observations

### Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

### Verification run by the reviewer

- **Scope.** The commit touches only the planned `src/lib/reminders/follow-up-nudge.ts` and the one `eslint.config.js` line (the nudge entry removed; the due and runner entries kept), plus `plan.md` and `decisions.md`. `runner.ts`, `deps.ts`, `chain.ts`, `worker.ts`, `appointment.ts` and the due job are untouched.
- **Spec.** `followUpNudgeJob` keeps the planned values:
  - event `follow-up-nudge` and prefix `dbam-follow-up-nudge`;
  - claim arguments `p_today: warsawToday(now)`, `p_schedule_after: SCHEDULE_NUDGE_AFTER_DAYS`, `p_confirm_after: CONFIRM_NUDGE_AFTER_DAYS` and `p_limit: Math.min(budget ?? 0, MAX_BATCH_SIZE)`, so TD-6 stays;
  - claim error `ReminderDatabaseError("claim", code)`;
  - ids from `nudge_ids`, `message: buildNudgeMessage` and the mark RPC `mark_follow_up_nudges_sent`.

  The call is `runClaimSendMark(followUpNudgeJob, run, budget, reminderDeps())`. The local `log` helper is gone. `FollowUpNudgeOutcome` is an alias of `ReminderOutcome`. The signature `runFollowUpNudges(run, { budget })` is unchanged in shape.

- **The `?? 0`.** It can't be reached: the runner returns before `select` when `budget <= 0`, and `chain.ts` always passes a number. The budget-250 and budget-7 cases pin the claim limit (`p_limit` 100 and 7).
- **Not `async`.** As in phase 4, `reminderDeps()` runs outside the runner's `try`, and that is safe for the same reason (PR C section).
- **Gates:**
  - 5.1: `npm test` passes, 21 files and 409 tests. The 3 job tests and the helper are byte-identical to 8410cdb.
  - 5.2: `npm run lint` exits 0. `npx astro check` reports 0 errors.
  - 5.3: `follow-up-nudge.ts` has no `console.` call.
  - 5.4 re-run: a mark before the dry-run check in `runner.ts` fails 2 tests each in `runner.test.ts`, `appointment.test.ts` and `follow-up-nudge.test.ts`. Reverted.
- **Bookkeeping.** Rows 5.1–5.4 are `[x]` in the commit. Their SHA write-back is in the working tree, uncommitted, as the worker protocol allows.

### Findings

None.

## PR E — phase 6

- **Plan**: context/changes/reminders-runner/plan.md
- **Scope**: Phase 6 of 8 (PR E, branch `feat/reminders-runner-p6`, commit 2910b8b vs its parent 6f6cec2, which is `origin/main`). Manual rows 6.6 and 6.7 (the production line and its CPU time) are open by design and go into the PR's Manual checks.
- **Reviewed phases**: 6
- **Date**: 2026-11-01
- **Verdict**: APPROVED (1 low-impact warning, about plan bookkeeping, not code)
- **Findings**: 0 critical, 1 warning, 0 observations

### Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

### Verification run by the reviewer

- **Scope.** The commit touches only the planned `src/lib/reminders/due-screening.ts` and the one `eslint.config.js` line. After it, the allow-list names `runner.ts` and no job file, as phase 6 §2 requires. It also touches `plan.md`, `decisions.md` and `change.md` (`updated` only). No test file, and none of `runner.ts`, `deps.ts`, `chain.ts`, `worker.ts` or the other two jobs.
- **Select.** `dueScreeningJob.select` keeps today's order and arguments:
  - candidates (`p_today`, `p_limit: DUE_CANDIDATE_LIMIT`), `parseCandidateRows`, `getActiveRuleCatalog(client)`, `collectClaimItems(…, budget)`, then the claim (`{ ...item }` spread with its comment);
  - error steps `candidates` and `claim`.

  The three `none` exits return `{ rows: [], fields: { candidates: n } }` (0 on no candidates, `candidates.length` on nothing due), and an empty claim returns `{ rows: claimed, … }`. The runner's single `none` exit then logs the same line as before.

- **Spec.** Event `due-screening-reminder`, prefix `dbam-due-screening-reminder`, ids from `reminder_ids`, mark RPC `mark_due_screening_reminders_sent`. `buildMessage(row, site)` is otherwise byte-identical. The local `log` helper is gone. `DueScreeningOutcome` is an alias of `ReminderOutcome`. `budget ?? 0` can't be reached, as in phase 5.
- **Not `async`.** As in phases 4 and 5, `reminderDeps()` runs outside the runner's `try`, and that is safe (PR C section).
- **Gates:**
  - 6.1: `npm test` passes, 29 files and 651 tests.
  - 6.2: `due.perf.test.ts` passes unchanged. The due job has no zod import and no `Intl.Collator`.
  - 6.3: `npm run lint` exits 0. `npx astro check` reports 0 errors.
  - 6.4: `npm run build` exits 0. The `SITE` check equals the baseline:
    - the URL is in 20 files;
    - `import.meta.env.SITE` appears only as Astro's `getStaticPaths` deprecation text (`dist/server/chunks/dist_C3-kYRvb.mjs:6305`);
    - the only `site:` literal in `entry.mjs` is `reminderDeps` (:438), and no job keeps its own `const site`.
  - 6.5 re-run: a mark before the dry-run check in `runner.ts` fails 2 tests in each of `runner.test.ts` and the 3 job test files. Reverted.
  - Guard: the 3 job tests and the helper are unchanged against `origin/main` and untouched by this commit. Against 8410cdb, see F1.
- **Bookkeeping.** Row 5.5 is `[x] — 87c499f`, on the owner's production confirmation recorded in `decisions.md` (2026-11-01, decided-by orchestrator). Rows 6.1–6.5 are `[x]`, with their SHA write-back in the working tree.

### Findings

#### F1 — The guard reference 8410cdb no longer matches `due-screening.test.ts` on main

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/reminders-runner/plan.md:92 (“Guard first”), Progress rows 6.1, 7.1 and 8.1
- **Detail**: The plan names 8410cdb as the reference for "unchanged since phase 1". S-11 (6f6cec2, #110), a separate change on `main`, rewrote 2 pinned English lines in `due-screening.test.ts`, the subject and the body, to follow the copy change in `src/i18n/en.ts`. `git diff 8410cdb 2910b8b -- <guard files>` is therefore not empty, though row 6.1 is `[x]`. The phase 6 commit itself leaves every guard file untouched, and `decisions.md` ("Phase 6 gate notes") explains the gap. But the plan still sends phases 7 and 8 to diff against 8410cdb, and phase 8 moves exactly the builder whose copy those 2 lines pin. The edit by another change is legitimate: the transcript pins real copy, so a copy change has to update it.
- **Fix**: In `plan.md` "Guard first", move the reference to 6f6cec2 (S-11 on `main`, which holds the updated English due copy), with a one-line reason. Note in `decisions.md` that any later copy change on `main` moves the reference the same way.
- **Decision**: Fix A (accepted). `plan.md` "Guard first" now names 6f6cec2 as the reference, with the reason; `decisions.md` records that a later copy change on `main` moves it the same way.

## PR F — phase 7

- **Plan**: context/changes/reminders-runner/plan.md
- **Scope**: Phase 7 of 8 (PR F, branch `feat/reminders-runner-p7`, commit 3efc25f vs its parent c08fb4b, which is `origin/main`). The phase has no Manual rows; the three-line production check is row 8.5.
- **Reviewed phases**: 7
- **Guard reference**: 6f6cec2
- **Date**: 2026-11-01
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 0 observations

### Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

### Verification run by the reviewer

- **Scope.** The commit touches the 2 planned new files (`appointment-message.ts`, `appointment-message.test.ts`), the planned import edit in `appointment.ts`, and `plan.md` and `decisions.md`. `eslint.config.js`, the runner, deps, chain, worker, the other jobs and every guard file are untouched.
- **Move.** `buildAppointmentMessage(row, site)` is the old private `buildMessage` with only its name and row type changed: the same locale resolution, `Intl.ListFormat` conjunction, plural key, link URLs and subject.
  - The module is pure. It imports `@/i18n`, `formatDay` (whose `@/i18n` import is type-only) and a type-only `BatchEmailMessage`; `astro:` appears only in the header comment.
  - `AppointmentRow` is minimal (`email`, `locale`, `appointment_dates`, `reminder_ids`), in the manner of `NudgeRow`.
  - `appointment.ts` uses it as the spec's `message` and keeps `APPOINTMENT_REMINDER_LEAD_DAYS`, as the plan requires.
- **Builder test.** It covers everything in the plan's list for phase 7:
  - pl and en copy as full texts;
  - pl plural forms one, few and many, and en one and other;
  - the 3-date conjunction in both locales;
  - links built from `site`;
  - the `de` locale falling back to pl;
  - a leaky row (slug, name, user id) that never reaches the subject or text.

  It has 0 `vi.mock` calls, which proves the module needs no `astro:*` mock.

- **Gates:**
  - 7.1: `npm test` passes, 30 files and 663 tests. The 3 job tests and the helper are byte-identical to the guard reference 6f6cec2.
  - 7.2: `npm run lint` exits 0, `npx astro check` reports 0 errors, and `npm run build` exits 0.
  - 7.3: `appointment-message.ts` has no `astro:*` import.
  - 7.4 re-run: a slug line appended to the builder's text fails 3 tests in `appointment-message.test.ts` (both full-copy cases and the no-exam-name case) and the `sent` transcript in `appointment.test.ts`. Reverted.
- **Bookkeeping.** Rows 7.1–7.4 are `[x]` in the commit. Their SHA write-back is in the working tree, uncommitted, as the worker protocol allows.

### Findings

None. No `### F<n>` entries for this section.
