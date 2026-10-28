# Decisions: architecture-report

## 2026-10-27 Drafting method

- Question: the lesson's report prompt is not in the toolkit; how should the draft be produced?
- Options: (a) write by hand from the four inputs; (b) run a toolkit skill.
- Choice: (a), as the owner decided (worker drafts, owner edits).
- Evidence: change.md Notes.
- Decided by: orchestrator.

## 2026-10-27 Citation format and length

- Question: how to keep every claim sourced inside about two pages?
- Options: (a) full paths inline; (b) short source keys (RM, RR, RP, PB, DD, GL, TP) defined once, with `key:line`.
- Choice: (b). Repo files are cited as `path:line`. Body is about 1,290 words including about 250 words of citations, so the prose is near the 1,100-word target.
- Evidence: `context/foundation/architecture-report.md` header.
- Decided by: worker.

## 2026-10-27 Claims checked against code, not only the inputs

- Question: which input claims to re-check at HEAD 1e5d891?
- Choice: the cron string (`wrangler.jsonc:16`), the budget (`src/lib/email-budget.ts:9`), the two-call mark done (`src/pages/api/screenings.ts:150-163`), the appointment migration naming no `screening_catalog`, the counts of 14 Vitest and 7 pgTAP files, the 3 e2e specs and the CI job order (`.github/workflows/ci.yml`). All match.
- Found: test-plan §3 still lists Phase 1 as "change opened" while `roadmap.md:53` marks S-08 done. Reported as stale, not edited (out of scope).
- Decided by: worker.

## 2026-10-27 Inferences marked

- D-01 = SD-3 (two inputs agree) and the CI diff for `database.types.ts` (next step 5) are marked _Inference_. Neither input states them that way.
- Decided by: worker.

## 2026-10-28 Owner answers to the open questions

- Question: DD Q-01 to Q-10 (`context/domain/domain-distillation.md:261-270`).
- Answers:
  - Q-01: keep appointment reminders for retired entries (intended).
  - Q-02: catalog moves are forward-only; B-04 is a bug.
  - Q-03: "becomes due" means repeat exams only; first-time eligibility is dashboard-only.
  - Q-04, Q-05: accepted for now; revisit before launch.
  - Q-06: flag entries past `next_review_due` in CI.
  - Q-07: "screening" for the catalog item, "exam" for the user's.
  - Q-08: acceptable.
  - Q-09: no launch planned.
  - Q-10: deferred to the launch gate.
- Applied: report §7 is now an answer table, §5 notes D-01 and D-04 as intended, §8 adds the B-04 fix, a catalog-lifecycle CI guard and a PRD reword. The checklist drops the two items these answers settle (appointment claim vs catalog status, Exam vs first-time-eligibility ranking) and asks the owner to confirm §7.
- Worker reading (inference): the forward-only rule (Q-02) also rules out the draft case of Q-01. Q-07's answer does not cover `zalecenia` (B-06), so that half stays open.
- Decided by: owner (answers); worker (how they were written into the report).

## 2026-10-28 Owner approval

- Question: is the F-15 architecture report approved for merge?
- Choice: approved ("F-15 approved"), 2026-10-28. The worker drafted the report, as the owner decided on 2026-10-27 (worker drafts, owner edits). The owner made no edits in this worktree.
- Evidence: `context/foundation/architecture-report.md` at 4a6deb4.
- Decided by: owner.
