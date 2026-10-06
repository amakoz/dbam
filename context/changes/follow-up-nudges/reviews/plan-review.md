<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Follow-up Nudges (S-07) Implementation Plan

- **Plan**: context/changes/follow-up-nudges/plan.md
- **Mode**: Deep (claims verified inline, no sub-agent)
- **Date**: 2026-10-06
- **Verdict**: REVISE (three low-effort fixes; the approach is sound and matches every decision in decisions.md)
- **Findings**: 0 critical, 3 warnings, 0 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

9/9 paths ✓ (migrations, `chain.ts`, `email-budget.ts`, `observability.ts`, `worker.ts`, `eslint.config.js`, `admin-client.ts`), 6/6 symbols ✓ (`warsawToday`, `batchKey`, `MAX_BATCH_SIZE`, `BatchEmailMessage`, `ReminderDatabaseError`, `set_updated_at` BEFORE UPDATE trigger), budget math ✓ (31 × 96 = 2,976), admin-client "five → seven functions" ✓, Progress↔Phase ✓, brief↔plan↔decisions.md ✓.

## Findings

### F1 — Phase 2 gate breaks: `nudge` dep is required before `worker.ts` passes it

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §4 (Chain) vs Phase 3 §2 (Wiring)
- **Detail**: Phase 2 adds a required `nudge` member to `ReminderChainDeps` (`src/lib/reminders/chain.ts:13-19`), but `src/worker.ts:24-28` only gets `nudge: runFollowUpNudges` in Phase 3. `tsconfig.json` includes `**/*`, so Phase 2's gate 2.2 (`npx astro check`) fails on `worker.ts` with a missing property.
- **Fix**: Move Phase 3 §1 (job module `follow-up-nudge.ts`) and §2 (worker wiring, `no-console` allow-list, admin-client header) into Phase 2; Phase 1's regenerated types already exist then. Phase 3 keeps docs, follow-up note and the local dry run.
- **Decision**: ACCEPT (orchestrator), applied to plan.md

### F2 — pgTAP "re-saved plan" case can't use explicit `updated_at` and is time-bombed

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §2 (pgTAP) — "a re-saved undated plan → a new `cycle_on`"
- **Detail**: `screening_plans_set_updated_at` is BEFORE UPDATE (`20260930093108_screening_records.sql:27-29`) and sets `updated_at := now()`, so any UPDATE in the test overwrites an explicit value with the real transaction time. With a fixed `p_today = 2027-03-10`, the new cycle is only ≥14 days old while the real date is before ~2027-02-24; after that the case fails with no code change.
- **Fix**: In that case, run `alter table public.screening_plans disable trigger screening_plans_set_updated_at` (as postgres, inside the rolled-back test transaction) and set `updated_at` explicitly, or use an INSERT-only fixture (the trigger does not fire on insert); never depend on `now()` against a fixed `p_today`.
- **Decision**: ACCEPT (orchestrator), applied to plan.md

### F3 — Confirm-first ORDER BY on a RETURNS TABLE alias silently becomes a null variable

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §1 — "order: `confirm_count > 0` first, then md5(...)"; Phase 1 §2 order case
- **Detail**: In a plpgsql `returns table (…, confirm_count int)` function, `order by (confirm_count > 0) desc` is an expression, not a bare alias, so the name is resolved as a column ref; no column matches, and plpgsql falls back to the OUT variable (null). The order silently degrades to the md5 tiebreak, and the pgTAP order case can still pass by chance (~50%). Also `count(*)` is bigint, so the counts need `::int` or `return query` fails on a type mismatch.
- **Fix**: Specify `order by count(*) filter (where r.kind = 'confirm') > 0 desc, md5(r.user_id::text || p_today::text)` and `count(*) filter (…)::int` for both counts; in the order test, pick fixture user ids whose md5 tiebreak alone would put the schedule-only user first.
- **Decision**: ACCEPT (orchestrator), applied to plan.md
