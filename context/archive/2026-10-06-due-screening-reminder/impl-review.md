<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Due-screening reminder (S-06)

- **Plan**: context/changes/due-screening-reminder/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-06
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

## Plan-review fixes (F1–F8): status

Each fix landed as decided in `decisions.md`:

- **F1**: The cron path runs `classifyEntries`, which builds no `Intl.Collator` (`recommend.ts:105-131`). `recommend` still sorts for the dashboard (`:143`). Criterion 2.4 exists. The candidate limit dropped to 50, a logged worker decision.
- **F2**: The ledger has `unique (user_id, catalog_slug, anchor_month)`, and the same-due-month and same-anchor pgTAP cases exist.
- **F3**: The claim takes `p_today`. The live anchor, `anchor < due ≤ month(p_today)`, no plan, the active fixed entry, opt-in, consent and email are re-checked in both the insert and the return. The stale-anchor, future-due and plan-in-between pgTAP cases exist.
- **F4**: `email-retry.ts` retries once, on a 429 only, after waiting `retry-after` (at most 2 s, 1 s by default), with the same body and idempotency key. Both send paths use it.
- **F5**: `runReminderChain` (`chain.ts`) is used by `worker.ts`, and the four planned unit cases plus extras exist.
- **F6**: `REMINDER_EMAIL_DAILY_BUDGET = 93` (`email-budget.ts`). The appointment claim uses it as `p_limit`.
- **F7**: `screening_anchor_month` is one SQL helper, used by both the candidates function and the claim. No `updated_at` leaves the database, and `due.ts` passes `last_done_month: anchor_month`.
- **F8**: `partitionDashboard` takes `RuleProfile`, and the `admin-client.ts` header and the `observability.test.ts` comment are updated.

Other checks:

- **Additive-first migration**: the migration has only `create table` and `create function`. It has no `create or replace`, `alter` or `drop`.
- **Grants**: the ledger has RLS on, `revoke all` for anon, authenticated and service_role, and MAINTAIN revoked on PG17. The three cron functions are executable by service_role only. The helper is revoked from every API role. pgTAP checks all of this and has `plan(62)`.
- **Health data**: emails carry a count and two fixed links. Logs carry counts and error names. Idempotency keys are a SHA-256 of ids and differ per job. A zod failure becomes `ReminderDatabaseError("candidates", "invalid")`, with no message.

## Success criteria (run in this review)

| #            | Command                                                                      | Result                                                                                                                                    |
| ------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1          | `npx supabase migration up` (DB lock held)                                   | ✅ already applied                                                                                                                        |
| 1.2          | `npx supabase test db`                                                       | ✅ 6 files, 293 tests, PASS                                                                                                               |
| 1.3          | `npm run db:types && git diff --exit-code src/lib/database.types.ts`         | ✅ no diff                                                                                                                                |
| 2.1 / 3.1    | `npm test`                                                                   | ✅ 9 files, 182 tests                                                                                                                     |
| 2.2 / 3.3    | `npx astro check && npm run build`                                           | ✅ 0 errors, build complete                                                                                                               |
| 2.3 / 3.2    | `npm run lint`                                                               | ✅ clean (`ui:check` also clean)                                                                                                          |
| 2.4          | `npx vitest run src/lib/screenings/due.perf.test.ts`                         | ✅ cold 2.57–2.63 ms, warm 1.44–2.57 ms (3 runs), but see F1/F2                                                                           |
| 3.10         | `npx vitest run src/lib/reminders/chain.test.ts src/lib/email-retry.test.ts` | ✅                                                                                                                                        |
| 3.4, 3.5     | local dry runs                                                               | not re-run (they need a local server and a stub that was never committed). The evidence is logged in `decisions.md` "Phase 3 adaptations" |
| 1.4 (manual) | additive only, service_role revoked                                          | ✅ confirmed by this review                                                                                                               |
| 3.6–3.9      | production checks                                                            | pending on purpose (PR Manual checks)                                                                                                     |

## Findings

### F1 — The CPU gate leaves out the cron run's most expensive step: the cold catalog validation

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: src/lib/reminders/due-screening.ts:77 (`getActiveCatalog`), src/lib/catalog/read.ts:13-27, src/lib/screenings/due.perf.test.ts:21-26
- **Detail**:
  - On every run that has candidates, the due job calls `getActiveCatalog`, which runs `CatalogEntrySchema.safeParse` on all 20 entries. It then zod-parses the candidate rows (`due-screening.ts:26-36,67`).
  - The perf test parses the catalog in `loadCatalog()` _before_ it starts the timer. Its "cold < 5 ms" therefore measures only `dueScreeningItems`.
  - Measured here in a fresh Vitest worker (scratch test, deleted afterwards), the catalog parse took 10.8, 11.1 and 12.5 ms cold, and 2.1–2.3 ms warm.
  - Add `dueScreeningItems` (about 2.6 ms) and the candidate parse, and a cold due run plausibly passes the 10 ms Workers Free CPU cap. That would kill the run every day it has candidates. Persistent false-positive candidates (aged out, `maybe`) can make that every day.
  - The only remaining guard is the post-merge manual check 3.8.
  - These are Node numbers. Zod 4 JIT-compiles object parsers with `new Function`, which workerd forbids, so workerd may come out cheaper or more expensive. Confidence is medium, not high.
- **Fix A ⭐ Recommended**: Measure the whole in-process step and cut the catalog validation cost on the cron path.
  - Approach: extend `due.perf.test.ts` (fresh worker) to time the real CPU sequence: candidate-row parse, catalog validation of the raw rows, `dueScreeningItems` for 50 candidates, and the batch key. Validate the catalog on the cron path with a narrow schema that covers only the fields the rules read (`slug`, `eligibility`, `interval_kind`, `interval_months`, `interval_overrides`, `burden_weight`, `status`), or without zod. Assert the total.
  - Strength: the gate then measures what the 10 ms cap measures, and the largest cold cost goes away before production.
  - Tradeoff: a second catalog validation path that has to stay in step with `CatalogEntrySchema` for the rule fields.
  - Confidence: MED — the Node measurement is solid, but workerd's zod path differs (no JIT).
  - Blind spot: how much of the 11 ms is zod's JIT compile, which workerd skips, and how much is real validation work.
- **Fix B**: Keep the code and gate the merge on 3.8.
  - Approach: add the cold catalog parse to the perf test's log line only. Ship. Watch the first production run's CPU in Workers Logs, with the narrow schema prepared as a follow-up.
  - Strength: no code change if workerd turns out cheap.
  - Tradeoff: the first real signal is a production run, and a failure there silently skips that day's due reminders (the alert does fire).
  - Confidence: LOW — no workerd measurement exists.
  - Blind spot: whether Cloudflare's CPU accounting for cold isolates includes module and JIT warm-up.
- **Decision**: ACCEPT (Fix A). `due.perf.test.ts` now times the whole in-process cron sequence; the catalog is validated on the cron path by `isRuleEntry` (hand-written, rule fields only), not zod.

### F2 — The absolute-millisecond perf assertion runs in CI's `npm test`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/screenings/due.perf.test.ts:13,74
- **Detail**:
  - `expect(cold.ms).toBeLessThan(5)` is part of `vitest run` with `include: src/**/*.test.ts`, so the CI `ci` job runs it on shared GitHub runners while other test files run in parallel.
  - Locally it measured 2.6–3.0 ms on Apple silicon. A runner two to three times slower, or a noisy neighbour, crosses 5 ms and turns CI red with no code change.
  - "Cold" here means the first call in a Vitest worker after zod and Vitest have loaded. It is not a cold process.
- **Fix**: Always log the numbers, and assert only when an env flag is set (for example `PERF_ASSERT=1`, set by the implementer when filling 2.4). Or give CI a generous ceiling (for example 4× the budget) that catches only order-of-magnitude regressions.
- **Decision**: ACCEPT. Numbers are always logged; the strict budget (7 ms) is asserted only with `PERF_ASSERT=1`; CI keeps a 4x ceiling (28 ms).

### F3 — Claim inputs: duplicate items aren't deduplicated, and the TS side doesn't guard the 1000-item cap

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261006155313_due_screening_reminders.sql:200-227, src/lib/reminders/due-screening.ts:78-100
- **Detail**:
  - The return query joins `jsonb_to_recordset(p_items)` to the ledger. If the same item appears twice, its id appears twice in `reminder_ids`, which inflates the plural count in the email and changes the batch key. TS doesn't send duplicates today.
  - The claim raises `22023` above 1000 items. The TS loop stops at `budget` users, not at an item count. Today 50 users × 9 fixed entries = 450, so the cap only matters if the catalog grows.
  - No pgTAP case pins a malformed item (bad uuid or date → `22P02`/`22007`, not `22023`).
- **Fix**: Add `select distinct` over the items in the return query (or `array_agg(distinct r.id …)`). Break the TS loop before `items.length` would pass 1000. Optionally add a `throws_ok` that pins `22P02` for a bad uuid.
- **Decision**: ACCEPT. `array_agg(distinct …)` in the claim return, `collectClaimItems` stops before 1000 items, and a `22P02` pgTAP case.

### F4 — The `due` count in the log is inconsistent, and the alert-module comment is stale

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/reminders/due-screening.ts:117, src/lib/failure-alert.ts:5
- **Detail**:
  - When the claim returns no rows, the `none` line logs `due: dueUsers`. The dry-run and sent lines log `due: claimed.length`, and the README defines `due` as users the claim returned. So on that path a `none` line can show `due: 3`, which misleads anyone reading Workers Logs.
  - The comment at `failure-alert.ts:5` still says the alert is called from `scheduled()` in `src/worker.ts`. It is now called from `src/lib/reminders/chain.ts`. The line is also 133 characters, past the file's usual wrap.
- **Fix**: Log `due: 0` (or `claimed.length`) at line 117, and reword and re-wrap the comment to name `runReminderChain`.
- **Decision**: ACCEPT. The `none` path after an empty claim logs `due: 0`; the `failure-alert.ts` comment names `runReminderChain`.

### F5 — The "same idempotency key on retry" test can't fail

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/email-retry.test.ts:75-89
- **Detail**:
  - The case builds its key inside the closure passed to the retry helper, so it never exercises `postToResend`. It would still pass if `email.ts` built a fresh key or body for the second attempt.
  - The retry is F4's double-send guard, so the property should be pinned where the request is built.
- **Fix**: Test through `postToResend` (or `sendEmailBatch`) with a stubbed `fetch` that returns a 429 and then a 200, and assert that both calls carry the identical `Idempotency-Key` header and body.
- **Decision**: ACCEPT. `src/lib/email.test.ts` drives `sendEmail` and `sendEmailBatch` with a stubbed `fetch` (429 then 200) and asserts the identical `Idempotency-Key` and body.
