# Catalog check guards — Plan Brief

> Full plan: `context/changes/catalog-check-guards/plan.md`
> Research: `context/changes/catalog-check-guards/research.md`

## What & Why

Roadmap F-17 (B-14 + B-15). Today a snapshot migration overwrites `status` with no transition check, so an active → draft edit silently hides every user's plan and done record for that entry (drift D-02). Separately, an entry past its `next_review_due` keeps recommending with no signal (D-08). The owner's answers: entries move forward only (Q-02), and stale reviews are flagged to the owner in CI, never hidden from users (Q-06).

## Starting Point

`catalog:check` validates entries, catches deleted slugs across all snapshots and compares the entries with the newest snapshot only (`scripts/catalog/check.ts:15-38`). It has no warning output. The 3 committed snapshots and the entry files agree: 19 active, 1 draft, no backward moves. All 19 active entries are due for review on 2027-09-29.

## Desired End State

- A backward status move fails `catalog:check` (and `catalog:migration` refuses it), whether it sits in an entry file or in a committed snapshot.
- Every active entry past its review date, or without one, prints a warning that never fails CI. In GitHub Actions that is one annotation plus a step-summary list.
- `catalog/README.md` and `CLAUDE.md` state the forward-only rule; the never-delete rule is unchanged.

## Key Decisions Made

| Decision                   | Choice                                                          | Why (1 sentence)                                                                             | Source       |
| -------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------ |
| Baseline for "previous"    | Committed snapshot chain, statuses parsed from VALUES           | CI has a depth-1 checkout and no DB; newest-only misses a demotion shipped with its snapshot | Research     |
| Snapshot format            | Unchanged                                                       | Changing the renderer would force a no-op catalog migration to production                    | Research     |
| draft → retired            | Allowed                                                         | It is forward and hides nothing new (RLS shows retired)                                      | Orchestrator |
| Who gets review warnings   | Active entries only                                             | Retired entries aren't recommended; drafts have no stamp                                     | Orchestrator |
| Active with no review date | Advisory "missing" warning                                      | Otherwise such an entry could never be flagged                                               | Orchestrator |
| "Overdue"                  | `next_review_due < warsawToday(now)`                            | "Past" the date; Warsaw calendar matches the rest of the app                                 | Plan         |
| CI output                  | One `::warning` annotation + log lines + `$GITHUB_STEP_SUMMARY` | GitHub keeps ≤ 10 warning annotations per step, and 19 entries go due on one day             | Research     |
| `catalog:migration`        | Refuses backward moves too                                      | A demoting snapshot is never generated                                                       | Plan         |
| Tests                      | New `scripts/catalog/lib.test.ts` for the new pure functions    | "now" is a parameter, so the date rule is unit-testable; F-19 extends the same file          | Plan         |

## Scope

**In scope:** pure guards in `scripts/catalog/lib.ts` with tests; wiring into `check.ts` and `migration.ts`; `catalog/README.md` Lifecycle and Review dates sections; `CLAUDE.md` catalog bullet.

**Out of scope:** DB triggers, any snapshot or format change, a scheduled CI run, hiding entries, warnings for draft/retired entries, tests for the rest of the catalog scripts (F-19), and roadmap or domain-distillation edits.

## Architecture / Approach

For each slug, walk its statuses through the snapshots (oldest first) and then its entry file; any drop in rank (draft < active < retired) is a problem, reported against the file where it happens. The status parse is strict: exactly one row per manifest slug, or the snapshot is reported. The review rule takes `today` as a parameter. The CLIs only read the clock and env, print and exit.

## Phases at a Glance

| Phase                          | What it delivers                                                                              | Key risk                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1. Pure guards with unit tests | `parseSnapshotStatuses`, `findBackwardMoves`, `findReviewWarnings`, formatters, `lib.test.ts` | Parse too loose (newlines in text) or too strict for real snapshots |
| 2. Wire into CLIs + docs       | `check.ts` fails/warns, `migration.ts` refuses, README + CLAUDE.md                            | A warning leaking into `problems` and failing CI                    |

**Prerequisites:** none (F-19 waits for this change).
**Estimated effort:** ~1 session, 2 phases, one PR.

## Open Risks & Assumptions

- The 10-annotation cap is community-documented, not in GitHub's docs; the design stays under it either way.
- Retired is final and the check has no override: reversing a wrong retirement needs a code change to the guard, recorded as an owner decision (documented in `catalog/README.md`).
- A demoting snapshot that somehow reached production could never be fixed by editing, since snapshots are immutable. None exists, and the migration guard prevents new ones.

## Success Criteria (Summary)

- The committed tree passes `catalog:check` with `0 review warning(s)`; a deliberate active → draft edit fails both CLIs.
- A past review date shows up as a CI warning while the build stays green and the entry stays visible to users.
