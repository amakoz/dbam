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
