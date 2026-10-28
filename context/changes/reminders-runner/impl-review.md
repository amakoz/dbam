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
- **Decision**: PENDING

#### F2 — The guard reference and the phase 1–2 SHAs point at commits that aren't on main

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/reminders-runner/plan.md:92, plan.md Progress rows 1.x/2.x, decisions.md (F1 triage, phase 3 gate notes)
- **Detail**: The plan names dc62600 as the reference for "unchanged since phase 1", which phases 4–8 diff against, and Progress cites 14f1302 and ea0cc9c. The squash merge left all three off main (`git merge-base --is-ancestor dc62600 origin/main` fails). They survive only in this worktree and in GitHub's PR refs, so later phase workers on a fresh worktree will run `git diff dc62600 -- …` against an unknown revision. The guard files at 8410cdb are byte-identical to dc62600 (verified).
- **Fix**: In `plan.md` "Guard first" and in `decisions.md`, repoint the reference to 8410cdb (#99 on main), and note that the Progress SHAs 14f1302 and ea0cc9c were squashed into 8410cdb. Ship that with PR B.
- **Decision**: PENDING
