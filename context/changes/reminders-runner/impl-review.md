<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Reminder jobs — shared claim → send → mark runner

Later PRs append one section per phase below this one.

## PR A — phases 1 and 2

- **Plan**: context/changes/reminders-runner/plan.md
- **Scope**: Phases 1–2 of 8 (PR A). Phases 3–8 are not implemented yet by design; their open Progress rows are not findings.
- **Reviewed phases**: 1, 2
- **Commits**: 3599ba2 (phase 1), 4d0012f (phase 2)
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
- Phase 1 changed only the 4 planned files under `src/` (`git diff --name-only 3599ba2^ 3599ba2 -- src/`).
- The phase 1 test files and helper are byte-identical at HEAD (`git diff --quiet 3599ba2 HEAD -- …`).
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
  - Tradeoff: the guard's reference moves off 3599ba2, and phase 4–8 reviewers must diff against the new SHA.
  - Confidence: HIGH — the expected lines follow from today's code and the pinned sibling rows.
  - Blind spot: today's due-job line for a Resend 500 hasn't been observed; write it from code and confirm the test goes green before committing.
- **Fix B**: Accept the gap and note in `decisions.md` that the runner's single catch is pinned through the appointment and nudge rows from phases 4–5 on.
  - Strength: no change to the frozen guard.
  - Tradeoff: phase 6's due-specific `select` can still add or drop log lines on claim failure without failing a test.
  - Confidence: MED — the shared catch covers most of it, but `select` runs inside it.
  - Blind spot: whether phase 6's `select` will log anything itself.
- **Decision**: Fix A — applied (780f23a)

#### F2 — Manual row 1.5 ticked with no reviewer evidence, and the phase-1 pause was skipped

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/reminders-runner/plan.md:725-726
- **Detail**: Row 1.5 ("Reviewer confirms the pinned sent-transcript email copy…") is `[x] — 3599ba2`. `decisions.md` records only that the worker pinned the copy by hand from `src/i18n`. No reviewer is named and no confirmation is recorded. The plan says "Pause after this phase for the manual check before phase 2", yet phase 2 was committed 2 minutes after phase 1 (09:08 → 09:10). The person who wrote the expectations is not an independent reviewer of them.
- **Fix**: Have the orchestrator or the owner read the 3 `sent` transcripts (appointment.test.ts:189-221, due-screening.test.ts:275-306, follow-up-nudge.test.ts:221-254) against `src/i18n/{pl,en}.ts`, and record who confirmed in `decisions.md`. Otherwise reset 1.5 to `[ ]` until someone does.
- **Decision**: PENDING

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
- **Detail**: Rows 1.12 and 1.5 carry ` — 3599ba2` on a wrapped continuation line. Row 2.4's ` — 4d0012f`, which is uncommitted, sits on its own line and has eaten the blank line before `### Phase 3`. The convention is ` — <sha>` at the end of the step line. Parsers that read the SHA from the row line won't find it.
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
