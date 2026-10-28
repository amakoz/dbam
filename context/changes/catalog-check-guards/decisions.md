# Decisions — catalog-check-guards

## 2026-10-28 Is draft → retired allowed?

- Question: may a shipped draft entry move straight to retired, skipping active?
- Options: (a) allowed, as a forward move; (b) refused, a draft must pass through active first.
- Choice: (a). Retired comes after draft in the order, so the move is forward. It also hides nothing new, because users can read both active and retired entries.
- Evidence: RLS read predicate `status in ('active', 'retired')` (`supabase/migrations/20260928153742_screening_catalog.sql:67`); roadmap wording `roadmap.md:91`; research Open Question 1.
- decided-by: orchestrator

## 2026-10-28 Which entries get the review-date warning?

- Question: which statuses are checked against `next_review_due`?
- Options: (a) active only; (b) active and retired.
- Choice: (a). Retired entries are no longer recommended, and drafts carry no review stamp.
- Evidence: research Open Question 2; `src/lib/catalog/read.ts:35,77` (only active entries are recommended).
- decided-by: orchestrator

## 2026-10-28 Active entry with no `next_review_due`

- Question: should an active entry without a review date warn as well?
- Options: (a) yes, an advisory "no review date" warning that never fails CI; (b) no.
- Choice: (a). The schema does not require the date on active entries, so without this warning such an entry could never be flagged.
- Evidence: `src/lib/catalog/schema.ts:194-204,248`; research Open Question 3.
- decided-by: orchestrator

## 2026-10-28 Planning scope: complexity, questions, phases

- Complexity: LOW. The change touches one module (`scripts/catalog/`) plus docs, needs no schema or runtime change, and research settled the baseline and output design.
- Question budget: 0 further questions. The orchestrator settled the three open product choices above; everything else derives from research (the settled-input exception in `/10x-plan`).
- Phase split: 2 phases in one PR. Phase 1 adds the pure guards in `scripts/catalog/lib.ts` with unit tests. Phase 2 wires them into `check.ts` and `migration.ts` and updates `catalog/README.md` and `CLAUDE.md`. Each phase is its own commit.
- Roadmap: `roadmap.md` status is not flipped (worker protocol), although `/10x-plan` would set `planning`.
- decided-by: worker (delegated by orchestrator)

## 2026-10-28 Design choices derived from research

- Baseline for "previous status": the committed snapshot chain. Statuses are parsed from each snapshot's VALUES rows, in order, followed by the entry files. Git history is ruled out because CI checks out only the latest commit (`ci.yml:20`). The DB is ruled out because the `ci` job has none. Comparing against the newest snapshot alone would let a demotion through when it ships together with its regenerated snapshot.
- Snapshot format unchanged: changing `renderSnapshotSql` would make the current newest snapshot drift and force a no-op catalog migration to production.
- Status parse is strict: a snapshot must contain exactly one row-start match for each manifest slug, otherwise `catalog:check` reports it. Text fields may contain newlines (`schema.ts:28-32`).
- A slug's first appearance may have any status, so a new entry can start as active.
- "Overdue" means `next_review_due < today`, where today is `warsawToday(now)`; the due date itself is not overdue. Warnings never change the exit code.
- GitHub keeps only 10 warning annotations per step (community-documented). In Actions the check emits one summary `::warning` annotation plus one log line per entry, and appends the list to `$GITHUB_STEP_SUMMARY` when that variable is set.
- `catalog:migration` refuses a backward move too, so a demoting snapshot is never generated.
- Tests: the new pure functions get a colocated `scripts/catalog/lib.test.ts` now. F-19 extends the same file later with tests for the rest of the scripts.
- decided-by: worker

## 2026-10-28 Plan-review triage (verdict SOUND, 2 observations)

- F1 (no path to undo a wrong retirement): fix. The README Lifecycle section names the escape path: a reversal needs a code change to the guard in `scripts/catalog/lib.ts`, recorded as an owner decision. The check stays override-free.
- F2 (test gaps in the warning output): fix.
  - New unit cases: `renderReviewSummary` (heading plus bullets, and `[]`) and the singular `formatReviewWarnings` form ("1 active catalog entry needs review").
  - Break check 2.3 also sets a past `next_review_due` on another active entry and asserts that the `warning:` line prints while the exit code is 1 because of the demotion alone.
  - The Progress row 2.3 title is kept (titles are immutable); the Phase 2 criterion carries the addition.
- decided-by: orchestrator
