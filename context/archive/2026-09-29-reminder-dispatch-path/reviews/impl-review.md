<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Reminder Dispatch Path (F-02)

- **Plan**: context/changes/reminder-dispatch-path/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-09-30
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

**Evidence summary**:
- Every planned change is present and matches its contract (drift pass).
- Scope guardrails hold: no `deploy` job, `/api/health` or `smoke.mjs` changes from F-02, no migrations, no Supabase access from the cron, no retries, no i18n.
- Automated criteria re-run on `main` code (2026-09-30):
  - `cf:types`: no diff.
  - `lint`, `astro check` (0 errors, 0 warnings), `build` and `catalog:check`: all pass.
  - Built `wrangler.json` has `crons: ["0 8,9 * * *"]`.
- CI evidence: PR #48 run 36606774120 and PR #52 run 36678545066, both with the dry-run step `ok` ×2.
- Production evidence:
  - 2026-09-29 21:00 UTC: `sent`.
  - 2026-09-30 08:00 UTC: `sent`, email at 10:00 Warsaw.
  - 2026-09-30 09:00 UTC: `skipped`.

## Findings

### F1 — Invalid EMAIL_DRY_RUN value takes the whole Worker down

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: astro.config.mjs:29
- **Detail**:
  - `EMAIL_DRY_RUN` is `envField.boolean`. Astro validates it when the Worker loads: `_internalGetSecret` runs in `setGetEnv`, which `@astrojs/cloudflare/handler` calls at the top level.
  - The boolean validator accepts only the literal strings `"true"` and `"false"`; anything else throws `AstroError` (`astro/templates/env.mjs:24-35`, `astro/dist/env/validators.js:90`).
  - A production `wrangler secret put EMAIL_DRY_RUN` with `1`, `TRUE` or `yes` therefore breaks every HTTP request, not only the cron. It also skips CI, because `secret put` deploys immediately.
  - Production doesn't set it today (it's unset, so the default `false` applies). The README doesn't say which values are valid.
- **Fix A ⭐ Recommended**: Document it. In README "Scheduled jobs" and `.env.example`, say that only `true`/`false` are valid, and that production leaves it unset.
  - Strength: Zero code change. Production never needs the flag, and `SUPABASE_*` secrets are strings, so they can't fail this way.
  - Tradeoff: Relies on people reading the docs.
  - Confidence: HIGH — the failure needs a deliberate `secret put` of the flag.
  - Blind spot: None significant.
- **Fix B**: Declare it as `envField.string` (optional) and parse it leniently in `email.ts`, so only `"true"` enables dry run.
  - Strength: Removes the failure mode.
  - Tradeoff: Loses Astro's typed boolean, and adds hand-rolled parsing that differs from the other env fields.
  - Confidence: MED — straightforward, but touches the transport and its types.
  - Blind spot: Existing `.dev.vars` copies keep working, since they already use `true`.
- **Decision**: FIXED (Fix A): README "Scheduled jobs" and `.env.example` state that only `true`/`false` are valid and that production leaves it unset

### F2 — Progress and plan records don't reflect a few deviations

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/reminder-dispatch-path/plan.md (Progress 1.10, 3.2, 3.5)
- **Detail**:
  - **3.2** reads "both Worker secrets set before merge" and is checked, but the secrets were set after the merge, so the 18:00–20:30 UTC runs failed as designed. This is recorded only in the PR #52 body.
  - **3.5** ("every 30 minutes") rests on one observed production run.
  - **1.10** carries `— ced6da1`, but the live send happened later.
  - **Unrecorded adaptations:** `cf:types` runs prettier after `wrangler types` (`package.json:15`); the heartbeat uses `REMINDER_TEST_TO` in dry run when it's set (`heartbeat.ts:81-89`).
  - **Also note:** the Phase 1–2 SHAs (`ced6da1`, `ed48804`) aren't on `main`, because #48 was squash-merged as `792156e`.
- **Fix**: Add a short "Implementation notes" addendum at the end of plan.md, before Progress. Row titles stay unchanged, per the Progress rules.
- **Decision**: FIXED: "Implementation Notes" addendum added to plan.md before Progress

### F3 — Cron string duplicated in wrangler.jsonc and heartbeat.ts, and CI doesn't compare them

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/heartbeat.ts:9-11, wrangler.jsonc:16, .github/workflows/ci.yml:61
- **Detail**:
  - The CI step checks hardcoded cron strings, not the value that gets deployed.
  - A `wrangler.jsonc`-only edit (e.g. `0 8-9 * * *`) would pass CI, then fail every production run with `UnknownCronError`. That failure shows only in Trigger Events and alerts no one.
- **Fix**: Have the CI step read `triggers.crons` from `dist/server/wrangler.json` and exercise each deployed cron. The daily one keeps its pinned `time`.
- **Decision**: FIXED: the CI step reads `triggers.crons` from `dist/server/wrangler.json` and exercises each deployed cron (pinned to 2026-10-01T08:00Z). Verified locally: the real build passes; `0 8-9 * * *` fails with `exception`, exit 1. README CI line updated.

### F4 — A broken Warsaw hour silently skips, and CI can't tell "sent" from "skipped"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/heartbeat.ts:72-79, .github/workflows/ci.yml:64
- **Detail**:
  - If `formatToParts` returned no hour part, `Number(undefined)` would give NaN, so every daily run would return `skipped` with no error.
  - CI checks only `outcome: ok`, which is the same for dry-run-sent and skipped.
  - This is unlikely in workerd: verified send/skip/skip/send locally, and 08:00 `sent` / 09:00 `skipped` in production. But it would fail silently.
- **Fix**: Throw when the hour isn't a finite number, so it surfaces as a failed run.
- **Decision**: FIXED: `warsawHour()` throws when the hour is not a finite number, so the run fails visibly instead of silently skipping

### F5 — Logging choices that will matter once reminders carry health data

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/heartbeat.ts:54-56, src/lib/email.ts:40
- **Detail**:
  - The heartbeat failure log writes `error.message` for any error. Today every message on that path is safe: fixed config errors, the cron string, and Resend's HTTP status plus error name.
  - Dry-run logs include `subject`.
  - S-04/S-06 will reuse this path with Supabase reads, whose error messages can quote row values, and with subjects that may name a screening (GDPR Art. 9).
  - Workers Logs would then hold personal and health data.
- **Fix**: Record as a lesson for S-04 and later reminder jobs. Logs from the cron path carry error `name`s and ids only, never `message`s or subjects built from user data. Optionally tighten both lines now.
- **Decision**: FIXED: the heartbeat failure log keeps only the error `name` (plus `status` and `resendError` for `EmailSendError`), never `message`; the dry-run email log drops `subject`. Not recorded as a lesson.

### F6 — Resend fetch has no timeout, and permanent errors are retried

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/email.ts:47, src/worker.ts:10-12
- **Detail**:
  - A hung Resend call keeps the run open until the platform's wall-clock limit. That's no CPU cost, and the idempotency key covers retries.
  - Config errors and `UnknownCronError` can never succeed on a retry.
- **Fix**: Add `signal: AbortSignal.timeout(10_000)` to the fetch. Optionally call `controller.noRetry()` for config and unknown-cron errors.
- **Decision**: FIXED: the Resend `fetch` has `signal: AbortSignal.timeout(10_000)`; `noRetry()` was not added
