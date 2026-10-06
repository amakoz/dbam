<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Due-screening reminder (S-06)

- **Plan**: context/changes/due-screening-reminder/plan.md
- **Mode**: Deep
- **Date**: 2026-10-06
- **Verdict**: REVISE
- **Findings**: 0 critical, 5 warnings, 3 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | WARNING |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

12/12 existing paths ✓ (`due.ts` and `reminders/errors.ts` are new, as the plan says), 7/7 symbols ✓ (`MAX_BATCH_SIZE`, `isDailySendRun`, `warsawToday`, `REMINDER_JOB`, `ReminderDatabaseError`, `getActiveCatalog`, zod 4 in `package.json`), brief↔plan ✓, Progress↔Phase ✓ (1.1–1.4, 2.1–2.3, 3.1–3.9).

The following claims were checked against the code and hold:

- `screening_completions_user_slug_unique` exists, so the composite FK is valid (`20260930093108_screening_records.sql:46`).
- Withdrawal deletes completions, so the cascade cleans the ledger (`:194-213`).
- service_role keeps SELECT on the catalog, so `getActiveCatalog(adminClient)` works (`20260928195335…sql:5`).
- `least(interval_months, min(override months))` is always at or below the resolved interval, so the SQL filter stays a superset. This holds even for overrides whose `requires` never match, or an override longer than the base.
- The 10:00 Warsaw run is always in the same calendar year in UTC and in Warsaw, so the cron's Warsaw year matches the dashboard's `getFullYear()`.
- At most 97 users × 9 fixed-interval entries is 873 items, which fits under the 1000-item `p_items` cap.

## Findings

### F1 — A cold `Intl.Collator("pl")` alone can use the 10 ms CPU budget

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Blind Spots
- **Location**: Phase 2 §2 (`dueScreeningItems` → `recommend`), Performance Considerations, criterion 3.8
- **Detail**:
  - The cron calls `recommend` once per candidate. `recommend` builds `new Intl.Collator(locale)` on every call, only to sort for display (`src/lib/catalog/recommend.ts:134-139`).
  - In Node, the first `new Intl.Collator("pl")` in a process took 10.4–11.3 ms over three cold runs, because ICU collation data loads lazily. Later collators cost about 0.02 ms each.
  - A scheduled invocation may run in a cold isolate. The S-04 path builds no collator, so this cost is new.
  - The plan checks CPU only in production after the merge (3.8). Its fallback ("lower the candidate limit") cannot fix a fixed one-time cost.
  - If the cap is exceeded, the due job dies every day before its claim, and only the 3.8 manual check would notice.
- **Fix A ⭐ Recommended**: Skip the display sort on the cron path, and measure before merge.
  - Approach: give `recommend` an option that skips sorting, or have `dueScreeningItems` call a sort-free core that `recommend` wraps. Add an automated criterion that times `dueScreeningItems` over 100 synthetic candidates in a fresh process (a Vitest case or a `node` script) and records the result in the PR.
  - Strength: removes the only ICU-heavy call in the job and gives a CPU number before production.
  - Tradeoff: adds a small API seam in `recommend`.
  - Confidence: MED — measured in Node/V8, not in workerd. workerd's ICU loading may differ.
  - Blind spot: whether Cloudflare counts isolate warm-up toward the cron's CPU time.
- **Fix B**: Keep the code and measure in workerd before merge.
  - Approach: run `wrangler dev` and record `performance.now()` around the rule step. Then decide.
  - Strength: no code change if the cost turns out small in workerd.
  - Tradeoff: local workerd doesn't enforce or report the production CPU accounting, so the number is only indicative.
  - Confidence: LOW — local wall time is a proxy at best.
  - Blind spot: same as Fix A.
- **Decision**: ACCEPT — Fix A (sort-free core on the cron path + automated timing criterion over 100 synthetic candidates in a fresh process, result in the PR) (decided by: orchestrator, 2026-10-06)

### F2 — The ledger's unique key (due month) and dedupe key (anchor) disagree

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 1 §1 (table `unique (user_id, catalog_slug, due_month)`), Critical Implementation Details ("Ledger exclusion is per anchor")
- **Detail**:
  - The candidate filter excludes a completion only when a sent row has the **same anchor**. The claim inserts with `on conflict do nothing` on **(user, slug, due_month)**, and then returns only rows that match the given items exactly.
  - Two cycles with different anchors can share a due month when an age override changes the interval. Example with blood pressure, 36 months, or 12 months at age 40+:
    - Anchor 2022-06 (36 months) gives due 2025-06, and that reminder is sent.
    - The user then records a newer exam, anchor 2024-06, now aged 40+ (12 months). That is also due 2025-06.
  - The insert conflicts, so no row is created. The claim returns nothing for the item, and no email is sent.
  - No sent row has the new anchor, so the completion is a candidate again the next day, and on every day after. It takes a candidate slot forever, and that cycle is never reminded.
- **Fix**: Make the unique key `(user_id, catalog_slug, anchor_month)`. That means one reminder per completion cycle, which is exactly the exclusion rule. Keep `due_month` as data, and keep the index on that key. Add pgTAP cases for "a new anchor with the same due month gets a row" and "a second claim for the same anchor with a different due month is a no-op".
  - Strength: one key for both the claim and the filter, so the stuck state cannot happen.
  - Tradeoff: an interval that shortens for the same anchor (turning 40) no longer gets a second reminder. The first was already sent for that cycle, so this matches "no repeats".
  - Confidence: HIGH — the scenario follows from the plan's own contracts and the override data (`catalog/entries/blood-pressure-measurement.json`, `moje-zdrowie-health-check.json`).
  - Blind spot: the brief's wording "each (user, exam, due month)" would need updating.
- **Decision**: ACCEPT — unique key (user_id, catalog_slug, anchor_month), due_month kept as data, two pgTAP cases (decided by: orchestrator, 2026-10-06)

### F3 — The definer claim trusts the caller's anchor and due month

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 §1 `claim_due_screening_reminders(p_items jsonb)`
- **Detail**:
  - The S-04 claim re-validates every returned row against live data: the plan still has that date, the date is in the window, opt-in, consent and email (`20260930125726_appointment_reminders.sql:113-131`).
  - The new claim is a `SECURITY DEFINER` function that writes Art. 9 rows from caller-supplied jsonb. It re-checks only opt-in, consent, email and whether the completion exists. It never checks any of these:
    - that `anchor_month` equals the completion's current SQL anchor;
    - that `due_month` is after the anchor and on or before the current month (it has no `p_today`);
    - that no `screening_plans` row exists for the slug.
  - A TS bug, or a re-date or plan between the candidates call and the claim, therefore records and emails a stale or future cycle.
  - Only service_role can call it, so the problem is integrity and defence in depth, not access.
- **Fix**: Add `p_today date` to the claim and require four things in both the insert and the return:
  - `anchor_month` equals the live `coalesce(last_done_month, date_trunc('month', updated_at at time zone 'Europe/Warsaw')::date)`;
  - `anchor_month < due_month <= date_trunc('month', p_today)`;
  - no plan exists for the (user, slug);
  - the catalog entry is still active and fixed-interval.
  - Add pgTAP cases for "a stale anchor gives no row", "a future due month gives no row" and "a plan between candidates and claim gives no row".
  - Strength: matches the S-04 pattern, so the function never writes a row the data doesn't support.
  - Tradeoff: duplicates the anchor expression a second time in SQL. A shared SQL helper function, or F8's approach, keeps it in one place.
  - Confidence: HIGH — the S-04 claim is the direct precedent.
  - Blind spot: None significant.
- **Decision**: ACCEPT — p_today on the claim, four live re-checks in insert and return, three pgTAP cases (decided by: orchestrator, 2026-10-06)

### F4 — Resend's per-second rate limit isn't budgeted

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3 §3 Worker wiring, Performance Considerations
- **Detail**:
  - The heartbeat runs in parallel with the reminder chain. On a day with appointment reminders, four requests can land within about a second: the heartbeat send, the appointment batch, the due batch (a few DB round-trips later) and then any failure alerts.
  - Resend's default API rate limit is 2 requests per second per team, and a 429 returns `rate_limit_exceeded`. Verify the current figure for the account.
  - `postToResend` doesn't retry (`src/lib/email.ts:105-130`). A 429 would fail the due job and send it down the alert path, and that alert can hit 429 as well.
  - The plan considers the daily quota and subrequests, but not the request rate.
- **Fix**: On a 429 from `sendEmailBatch` or `sendEmail`, wait the `retry-after` time (bounded, for example ≤ 2 s) and retry once with the same idempotency key. Waiting costs wall time, not CPU. Alternatively, start the due batch only after the heartbeat has settled. Add a unit case for the retry. Note the limit in the README "Free-plan limits".
  - Strength: removes a timing-dependent failure that would only show on busy days.
  - Tradeoff: touches the shared `email.ts` used by S-04 and the heartbeat.
  - Confidence: MED — the limit comes from Resend's published defaults and wasn't checked against this account.
  - Blind spot: whether Resend counts a batch call as one request for the rate limit (documented as one request).
- **Decision**: ACCEPT — on 429 wait retry-after (≤ 2 s) and retry once with the same idempotency key; unit case; README note (decided by: orchestrator, 2026-10-06)

### F5 — The `scheduled()` chain is verified only by a manual stub

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §3 Worker wiring, criterion 3.5, Manual Testing Steps 1
- **Detail**:
  - The new control flow decides the budget arithmetic, `budget: 0` after an appointment rejection, one alert per failed reminder job and which failure is rethrown. Those rules decide both the quota and whether the owner is alerted.
  - 3.5 checks this only with "a stubbed RPC error in the working tree, never committed". That leaves no regression guard, and the lesson "Grep gates are heuristics; privacy tests are the guard" asks for tests on each output path.
- **Fix**: Move the chain into a small function with injected jobs and an injected alert, for example `runReminderChain(run, { appointment, due, alert })` in `src/lib/reminders/chain.ts`. Unit-test four things: budget = 97 − sent; a rejection gives budget 0 and an alert; two failures give two alerts with different keys; the first failure is rethrown redacted. Keep 3.5 as a manual smoke.
- **Decision**: ACCEPT — runReminderChain with injected jobs and alert in src/lib/reminders/chain.ts, four unit tests; 3.5 stays a manual smoke (decided by: orchestrator, 2026-10-06)

### F6 — The 3,000/month Resend quota is left out of the daily budget

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 §1 `REMINDER_EMAIL_DAILY_BUDGET = 97`
- **Detail**:
  - `research.md:48` and README:282 both record 3,000 emails a month. The plan budgets only per day.
  - At a saturated 97 plus 1 heartbeat, a 31-day month comes to 3,038 emails, so the last days' batches would fail with a quota error, and so would the alerts.
  - This is unlikely at MVP volume, but the plan says the budget "keeps both jobs inside the quota".
- **Fix**: Set the budget to 93 (31 × (93 + 1 + 2) = 2,976), or state in the README and decisions.md that the monthly cap is accepted as a risk at current volume.
- **Decision**: ACCEPT — daily budget 93 (monthly quota) (decided by: orchestrator, 2026-10-06)

### F7 — The candidates RPC returns raw `updated_at`, and TS re-derives the anchor

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Implementation Approach 1 ("no exact days"), Phase 1 `get_due_screening_candidates`, Phase 2 §2
- **Detail**:
  - The plan says the function returns "no exact days", but each completion carries its exact `updated_at` timestamp.
  - The SQL already computes the anchor for the filter. TS then recomputes it with `Intl` from `updated_at`, so the plan depends on two implementations agreeing at month boundaries in Warsaw.
  - It also spends a `formatToParts` call per "don't know" completion on the CPU budget.
- **Fix**: Return `anchor_month` computed in SQL instead of `last_done_month` and `updated_at`. `dueScreeningItems` passes `{ last_done_month: anchor_month, updated_at: anchor_month }`, so `anchorMonth` returns the SQL anchor unchanged. The SQL and TS anchors then agree by construction, the claim (F3) can use the same expression, and no exact timestamp leaves the database. Keep the TS test "a don't-know completion anchors on the Warsaw month of `updated_at`" in `rules.test.ts`, where it already lives.
- **Decision**: ACCEPT — return SQL-computed anchor_month; no updated_at leaves the database (decided by: orchestrator, 2026-10-06)

### F8 — Type narrowing misses `partitionDashboard(profile)`, and two comments go stale

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §1, Phase 3 §1
- **Detail**:
  - `partitionDashboard` takes `profile: Profile` and passes it to `resolveInterval` (`src/lib/screenings/rules.ts:219-226,264`). The plan narrows only its completion type, so the cron would still need a full `Profile`.
  - `src/lib/reminders/admin-client.ts` says the key can "only execute the two reminder functions". That will be five functions plus the catalog read.
  - `src/lib/observability.test.ts:19` says `ReminderDatabaseError` lives in `appointment.ts`, which Phase 3 moves to `errors.ts`.
- **Fix**: Add `profile: RuleProfile` to the `partitionDashboard` contract, and list the `admin-client.ts` header and the `observability.test.ts:19` comment among the Phase 3 edits.
- **Decision**: ACCEPT — profile: RuleProfile in partitionDashboard, plus the admin-client.ts header and observability.test.ts:19 comment in Phase 3 (decided by: orchestrator, 2026-10-06)
