# Error Tracking (F-07) Implementation Plan

## Overview

Make production errors visible and alerted, using only Cloudflare Workers Logs and the existing Resend path, on the Workers Free plan.

- Every uncaught SSR error and every failed cron job logs exactly one structured `event: "error"` line. The line carries the error name, short codes, the route pattern or job name, and a request id, and nothing else.
- A failed appointment reminder run also emails the owner, best-effort.
- The Workers Observability saved queries for these events are documented in `README.md`.
- The SSR path stops leaking raw Postgres messages into Workers Logs. This is a prerequisite for the privacy outcome.

## Current State Analysis

- **SSR errors.** When a page throws before streaming starts, Astro 7.3.2 logs `err.stack` (`node_modules/astro/dist/core/routing/handler.js:102`), which reaches Workers Logs. It then renders `src/pages/500.astro` through the middleware a second time (`node_modules/astro/dist/core/errors/default-handler.js:72-76`).
  - No repo code logs these errors in a structured way. `src/middleware.ts:15-41` has no try/catch.
  - Six throw sites in four helper functions embed PostgREST `error.message` in the thrown message: `src/lib/consent.ts:22,35`, `src/lib/screenings/read.ts:18-19`, `src/lib/catalog/read.ts:34,49`. Their messages reach Astro's stack line.
- **Cron errors.** `src/worker.ts:13-20` runs the heartbeat and the appointment reminder job with `Promise.allSettled` and rethrows the first failure as-is.
  - Each job already logs one outcome line per run with `outcome: "failed"` and error name plus codes (`src/lib/heartbeat.ts:49-62`, `src/lib/reminders/appointment.ts:84-96`). These lines use `console.log`, so their level is `log`.
  - Nobody is alerted: failures show only in Trigger Events and Workers Logs (`context/archive/2026-09-29-reminder-dispatch-path/reviews/impl-review.md:83`).
- **Email.** `sendEmail` (`src/lib/email.ts:47-62`) is the only send path. `REMINDER_TEST_TO`, the owner's address, is read only by the heartbeat (`src/lib/heartbeat.ts:76-84`).
- **Tests.** Vitest runs `src/**/*.test.ts` in a node environment where `astro:env/server` does not resolve (`vitest.config.ts`). Any testable builder must live in a module with no `astro:env` import.
- **Lint.** `no-console` is `warn` globally (`eslint.config.js:25`) and `off` only for four files (`eslint.config.js:77-80`).

## Desired End State

- An uncaught SSR error before streaming logs exactly one Workers Logs line at error level, then renders the 500 page as today:
  ```json
  {
    "event": "error",
    "source": "ssr",
    "route": "/dashboard",
    "requestId": "<cf-ray>",
    "error": "DatabaseError",
    "operation": "read-consent",
    "code": "PGRST301"
  }
  ```
  Astro's own stack line for that request carries the error name and stack frames, but no message text.
- A cron run where a job throws logs one line per failed job:
  ```json
  {
    "event": "error",
    "source": "cron",
    "job": "appointment-reminder",
    "requestId": "cron-1790841600000",
    "cron": "0 8,9 * * *",
    "scheduledAt": "2026-10-01T08:00:00.000Z",
    "error": "ReminderDatabaseError",
    "step": "mark",
    "code": "42501"
  }
  ```
  The existing outcome lines are unchanged.
- When the appointment reminder job failed, the owner (`REMINDER_TEST_TO`) gets one plain-English email.
  - It names the job, run time, cron, error name and codes, and gives a "check Workers Logs" pointer. It has no user data.
  - The send is best-effort and logged as `event: "failure-alert"`.
  - The run is still marked failed, with a redacted rethrow.
- `README.md` documents the event shapes, the failure email, the saved queries a human creates in the dashboard, and the Free-plan limits.
- Verification:
  - `npm test` covers the builders' privacy invariants.
  - A local dev run shows the events for a forced SSR error, an unknown cron and a failing reminder claim.

### Key Discoveries:

- Astro logs `err.stack || err.message` for every caught pre-stream SSR error (`node_modules/astro/dist/core/routing/handler.js:101-108`). Only the thrown error's text can be controlled.
- Errors propagate through `next()` to the middleware; nothing catches them earlier (research.md §1).
- `context.routePattern` is the matched pattern (`node_modules/astro/dist/types/public/context.d.ts:583`). During the 500 re-render it is `/500`.
- `cf-ray` from `context.request.headers` equals Workers Logs' `$metadata.rayId`. Cron has no readable id (research.md §3).
- Existing precedent for the log shape: `console.log(JSON.stringify({ event, ... }))` (`src/lib/heartbeat.ts:86-88`). For an error class that carries a code only: `ReminderDatabaseError` (`src/lib/reminders/appointment.ts:23-34`).
- PostgREST `error.code` can be an empty string, for example on a network failure. That case needs a fallback code.

## What We're NOT Doing

- No Sentry or other new processor. Workers Issues stays off: it stores raw messages and stack traces (decisions.md). There is no `wrangler.jsonc` observability change.
- No dependency on Cloudflare Custom Alerts. Checking Free-plan availability is a PR manual check for the human.
- No failure email for a failed heartbeat; it gets the structured error event only (decisions.md).
- No capture of mid-stream SSR errors, thrown after a 200 has started streaming. No hook can see them. Today no component or layout awaits data (research.md §1), so the path is empty; README states the limit.
- No change to the handled `?error=<code>` redirects in API routes. They are not uncaught errors.
- No change to `src/pages/500.astro` and no use of `Astro.props.error`.
- No change to the job outcome lines (`heartbeat`, `appointment-reminder`) or their README docs.
- No partial-failure alerts: a claim capped at 100 rows, or an ignored mark count. Only a job that throws counts as failed.
- No creation of saved queries through the API or by the worker. A human creates them in the production dashboard.
- No change to `ReminderDatabaseError`, `EmailSendError` or the other cron error classes: their messages are already code-only.

## Implementation Approach

1. Build the error vocabulary and every builder in `astro:env`-free modules first, with unit tests that pin the privacy invariants. Switch the six throw sites to a code-only error in the same phase.
2. Wire the builders into the two entry points: the middleware for SSR, and `scheduled()` for cron and the failure email.
3. Document. Production-only checks belong to the PR.

The event's detail fields pass through a whitelist with a short-token rule. A future error type that adds free text, or an email address, cannot reach the logs or the email through these builders.

## Critical Implementation Details

- **Middleware runs twice on an error.** Astro renders `500.astro` through `handleMiddleware` again, and `context.url` is still the original path. Skip the catch-and-log logic when `context.routePattern === "/500"`. Otherwise one failure logs two events, or the 500 render's own failure, which Astro already swallows, gets logged.
- **Rethrow, don't return.** After logging, the middleware must rethrow the redacted error rather than return a Response, so Astro still renders `500.astro` with status 500 through its normal path. Astro logs the redacted error's `stack`, so the redacted stack must not contain the original message. Build it from the original stack's frame lines (those starting with whitespace + `at `) under a fixed `"<Name>: [redacted]"` header. Multi-line messages are dropped with the header.
- **Alert must not mask the failure.** In `scheduled()`, the error events and the alert run before the rethrow. `sendReminderFailureAlert` catches everything itself. The rethrow happens even when the alert fails or is skipped.

## Phase 1: Error vocabulary, builders and code-only throw sites

### Overview

Add env-free modules for a code-only database error, the structured error event, error redaction and the failure email content, with unit tests. Switch the six message-leaking throw sites to the code-only error.

### Changes Required:

#### 1. Code-only database error

**File**: `src/lib/database-error.ts` (new)

**Intent**: Give SSR-side Supabase reads an error that carries an operation name and the PostgREST/SQLSTATE code, never PostgREST's message. It follows the `ReminderDatabaseError` precedent.

**Contract**:

- `export class DatabaseError extends Error` with `name = "DatabaseError"`, `readonly operation: string` and `readonly code: string`.
- The message is `Database <operation> failed (<code>)`.
- An empty or missing code becomes `"unknown"`.
- No imports from `astro:*`.

#### 2. Throw sites

**Files**: `src/lib/consent.ts`, `src/lib/screenings/read.ts`, `src/lib/catalog/read.ts`

**Intent**: Replace the six `throw new Error(\`... ${error.message}\`)`sites with`throw new DatabaseError(<operation>, error.code)`. That closes the known leak into Astro's stack line.

**Contract**:

| Throw site              | Operation                    |
| ----------------------- | ---------------------------- |
| `consent.ts:22`         | `read-consent`               |
| `consent.ts:35`         | `read-profile`               |
| `screenings/read.ts:18` | `read-screening-plans`       |
| `screenings/read.ts:19` | `read-screening-completions` |
| `catalog/read.ts:34`    | `read-catalog`               |
| `catalog/read.ts:49`    | `read-catalog-entries`       |

Callers' behaviour is unchanged: they still throw, and the 500 page still renders. Update any doc comment that mentions the message.

#### 3. Observability builders

**File**: `src/lib/observability.ts` (new; no `astro:*` imports)

**Intent**: Hold every pure piece that is shared by the middleware, `scheduled()` and the alert: the event builders, the detail whitelist, redaction, the request-id rule, the failure-email content and the one logging function. All of it is testable with Vitest.

**Contract**:

- `ErrorEvent`: a flat `Record<string, string>` with `event: "error"` and `source: "ssr" | "cron"`.
  - SSR events carry `route`. Cron events carry `job`, `cron` and `scheduledAt`.
  - Both carry `requestId` and `error`, the error name (`"UnknownError"` for non-`Error` values).
  - Optional details are taken from the error's own properties `operation`, `code`, `step`, `status` and `resendError`. Each is kept only when it is a string or number whose `String()` form matches `/^[A-Za-z0-9_.:-]{1,64}$/`; anything else is dropped. Errors are read by duck typing, never `instanceof` of classes from `astro:env` modules.
- `buildSsrErrorEvent({ error, routePattern, requestId })` and `buildCronErrorEvent({ error, job, cron, scheduledTime })`.
  - The cron `requestId` is `cron-<scheduledTime>`.
  - `scheduledAt` is ISO.
- `requestIdFrom(headers)`: returns the `cf-ray` value when it matches the token rule, else `crypto.randomUUID()`.
- `redactError(error)`: returns a new `Error` whose `name` is the original's name, `message` is `"[redacted]"` and `stack` is `"<name>: [redacted]"` followed by only the original stack's frame lines. For a non-`Error` value it returns a redacted `Error` named `UnknownError`.
- `buildReminderFailureEmail({ error, cron, scheduledTime })`: returns `{ subject, text, idempotencyKey }`.
  - Subject: `Dbam: appointment reminder run failed`.
  - Text is plain English with:
    - the job name, `scheduledAt`, `cron` and the error name;
    - the whitelisted details, as `key: value` lines;
    - when `step` is `mark`, the sentence "The reminder emails were sent but not marked; users may get a duplicate on the next run.";
    - a pointer to the README's Workers Logs saved query.
  - It contains no addresses or user data.
  - Idempotency key: `dbam-reminder-failure:<cron>:<scheduledTime>`.
- `logErrorEvent(event)`: writes `console.error(JSON.stringify(event))`. This is the only console call in the module.

#### 4. Unit tests

**File**: `src/lib/observability.test.ts` (new), plus a small `src/lib/database-error.test.ts` or cases in the same file

**Intent**: Pin the privacy invariants and the shapes the README documents.

**Contract**: The cases below. Each takes `scheduledTime` as a parameter; no clock is read.

- **Message never leaks.** For an `Error` whose message contains `jan.kowalski@example.com` and a SQL fragment, neither the SSR event, the cron event, the redacted error's `message`/`stack` nor the email `text`/`subject` contains the address or the fragment.
- **Whitelist.** Extra own properties (`email`, `details`, `hint`) are absent from the event. A whitelisted key with a non-token value (`code: "a b@c"`) is dropped. `status: 403` becomes `"403"`.
- **Cron event.** `requestId` is `cron-1790841600000`, `scheduledAt` is `2026-10-01T08:00:00.000Z`, and `step`/`code` are carried from a `ReminderDatabaseError`-like object.
- **SSR event.** It carries `route` and `requestId` as given. `requestIdFrom` returns a valid `cf-ray` value and falls back to a UUID for a missing or invalid header.
- **Redaction.** Name and frame lines are kept; a multi-line message is fully dropped. A non-`Error` input yields `UnknownError`.
- **Failure email.** The idempotency key is stable for the same `cron`/`scheduledTime`. The mark-step sentence appears only for `step: "mark"`.
- **DatabaseError.** The message holds operation and code only. An empty code becomes `unknown`.

#### 5. Lint exemption

**File**: `eslint.config.js`

**Intent**: Allow the deliberate Workers Logs console call in the new module.

**Contract**: Add `src/lib/observability.ts` to `workerLogsConfig.files` (`eslint.config.js:78`).

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including the new observability and database-error cases: `npm test`
- Lint passes with no new warnings in changed files: `npm run lint`
- Types check: `npx astro check`
- No thrown message in `src/` embeds a PostgREST message: `grep -rn 'error\.message' src --include=*.ts --include=*.astro` returns no throw sites
- Production build succeeds: `npm run build`

**Implementation Note**: After automated verification passes, continue to Phase 2. This phase has no manual checks.

---

## Phase 2: Wire SSR and cron error events and the failure email

### Overview

Emit the error event from the middleware for uncaught SSR errors, and from `scheduled()` for failed jobs. Send the best-effort failure email when the appointment reminder job fails. Rethrow redacted errors on both paths.

### Changes Required:

#### 1. SSR error hook

**File**: `src/middleware.ts`

**Intent**: Wrap the whole middleware body so that a throw from the middleware itself, the page or the endpoint is caught once. Skip this for the `/500` re-render. On a catch, log `buildSsrErrorEvent` with `context.routePattern` and `requestIdFrom(context.request.headers)`, then rethrow `redactError(error)`, so Astro renders the 500 page and its stack line carries no message.

**Contract**:

- `onRequest` behaviour is unchanged on success: locale, user, protected-route redirect, `Cache-Control` header.
- On error: exactly one `logErrorEvent` call per request, then a rethrow.
- When `context.routePattern === "/500"`, the body runs without the catch.

#### 2. Failure alert sender

**File**: `src/lib/failure-alert.ts` (new; imports `astro:env/server` and `@/lib/email`)

**Intent**: Send the reminder-failure email to the owner through `sendEmail`. It never throws, and it logs its own outcome so a failed alert is visible too.

**Contract**:

- `sendReminderFailureAlert({ cron, scheduledTime }, error): Promise<void>`, which uses `buildReminderFailureEmail`.
- Recipient:
  - `REMINDER_TEST_TO` when set;
  - otherwise `delivered@resend.dev` when `EMAIL_DRY_RUN`;
  - otherwise no send.
- It logs one line `{ event: "failure-alert", outcome, cron, scheduledAt, ... }`:

  | `outcome` | When               | Extra fields                                | Log call        |
  | --------- | ------------------ | ------------------------------------------- | --------------- |
  | `sent`    | Resend accepted it | `resendId`                                  | `console.log`   |
  | `dry-run` | `EMAIL_DRY_RUN`    | —                                           | `console.log`   |
  | `skipped` | no recipient       | `reason: "no-recipient"`                    | `console.error` |
  | `failed`  | the send threw     | `error` (the name) plus whitelisted details | `console.error` |

- It never logs the recipient, subject or text.

#### 3. Scheduled handler

**File**: `src/worker.ts`

**Intent**: After `Promise.allSettled`, emit one cron error event per rejected job, named by its position in the job list (`heartbeat`, `appointment-reminder`). When the appointment reminder job was rejected, await `sendReminderFailureAlert`. Then rethrow the first failure, redacted, so Cloudflare still marks the run failed without recording a raw message.

**Contract**:

- The job list pairs each name with its runner, so names and results cannot drift apart.
- Nothing changes when both jobs succeed.
- No failure email for the heartbeat.
- Update the header comment to describe the events and the alert.

#### 4. Lint exemption and env comment

**Files**: `eslint.config.js`, `astro.config.mjs`

**Intent**:

- Allow console in the alert module.
- Document that `REMINDER_TEST_TO` is now also the failure-alert recipient.

**Contract**:

- Add `src/lib/failure-alert.ts` to `workerLogsConfig.files`.
- Update the comment at `astro.config.mjs:54-55`. The schema is unchanged.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint passes with no new warnings in changed files: `npm run lint`
- Types check: `npx astro check`
- Production build succeeds: `npm run build`

#### Manual Verification:

These run locally against `npx astro dev --port $DBAM_PORT` with `EMAIL_DRY_RUN=true`. The worker can run them.

- An unknown cron (`/cdn-cgi/local/scheduled?cron=1+2+3+4+5`) logs one `{"event":"error","source":"cron","job":"heartbeat","error":"UnknownCronError",...}` line, sends no failure email, and the run reports failure.
- A failing reminder claim, run on the daily cron at `time=1790841600000` with an invalid `SUPABASE_SECRET_KEY` in `.dev.vars` (restored afterwards), logs:
  - one `appointment-reminder` error event with `step: "claim"`;
  - one `failure-alert` `dry-run` line;
  - no address anywhere in the output.
- A temporary throw on the dev-only kitchen-sink page, with a message containing an email address, logs:
  - one `ssr` error event with `route: "/dev/kitchen-sink"`;
  - Astro's error line, showing `[redacted]` and no address.

  The 500 page renders and the temporary throw is reverted, not committed.

- A normal run of the daily cron (no failure) shows no `error` or `failure-alert` lines.

**Implementation Note**: After automated verification passes, run the local checks above and record their output in `context/changes/error-tracking/` before continuing to Phase 3.

---

## Phase 3: Documentation and production checks

### Overview

Document the events, the failure email, the saved queries and the limits in `README.md`. Leave the production-only checks to the PR's manual list.

### Changes Required:

#### 1. README: errors and alerts

**File**: `README.md`

**Intent**: Add a `### Errors and alerts` subsection after the Scheduled jobs production notes (before `## Smoke test`, `README.md:284`). An operator should be able to find, query and act on errors without reading the code.

**Contract**: The subsection covers:

- **Event shapes.** One example of each source: SSR and cron error events. The `failure-alert` outcome values.
- **Privacy rule.** Names, short codes, route patterns and run ids only. Never messages, addresses or health data. Throw code-only errors such as `DatabaseError` for new failure paths.
- **Failure email.** Sent to `REMINDER_TEST_TO` for a failed appointment reminder run only. Best-effort: it cannot go out when Resend itself is failing, so check Workers Logs or Trigger Events. Plus the mark-step duplicate warning.
- **Saved queries** for a human to create in Workers → Observability → Query Builder → Save Query:

  | Name                  | Filter                            |
  | --------------------- | --------------------------------- |
  | `Dbam errors`         | `event = error`                   |
  | `Dbam SSR errors`     | `event = error AND source = ssr`  |
  | `Dbam cron errors`    | `event = error AND source = cron` |
  | `Dbam failure alerts` | `event = failure-alert`           |

  Also note that `$metadata.rayId` correlates an SSR `requestId`.

- **Free-plan limits.**
  - Until 2026-12-01: 200,000 log events a day, 3-day retention, and invocation logs count.
  - From 2026-12-01: 0.5 GB a day and 7 days, and ingestion stops at the cap until 00:00 UTC.
  - So triage within days.
- **Known gaps.** Mid-stream SSR errors are not captured. A cron that never fires is detected only by the missing heartbeat email.

#### 2. README: secret description

**File**: `README.md`

**Intent**: Say that `REMINDER_TEST_TO` is also the failure-alert recipient, and update the Workers Logs line about job runs.

**Contract**:

- `README.md:229`: the comment on `wrangler secret put REMINDER_TEST_TO`.
- `README.md:280`: the "Runs" bullet, which should mention the `error` and `failure-alert` lines and link the new subsection.

### Success Criteria:

#### Automated Verification:

- Formatting is clean: `npx prettier --check README.md`
- Lint, tests and build still pass: `npm run lint && npm test && npm run build`

#### Manual Verification:

These are PR stage, for the human against production.

- After deploy, the four saved queries are created in the Workers Observability dashboard as documented.
- In production Workers Logs, a JSON-string log line's fields (`event`, `source`) appear as top-level filterable keys. If they do not, the README filters are corrected in a follow-up change.
- Whether Cloudflare Custom Alerts can use `logs.workersLogs` on the Free plan is checked in the dashboard and noted on the PR. Nothing depends on it.
- `REMINDER_TEST_TO` is confirmed set in production: `npx wrangler secret list` shows the name.

---

## Testing Strategy

### Unit Tests:

- `src/lib/observability.test.ts`: event builders, whitelist and token rule, request-id fallback, redaction (multi-line messages, non-`Error` values), failure email content and key, the mark-step sentence.
- `DatabaseError` message and empty-code fallback.
- The privacy case, an email address plus SQL in a message that appears in no output, is the core test.

### Integration Tests:

- None new. CI's scheduled-handler step (`.github/workflows/ci.yml:62-84`) keeps proving the happy path returns `"outcome":"ok"` with no alert. The middleware and `scheduled()` wiring is checked by the Phase 2 local runs, because `astro:middleware` and `astro:env` do not resolve in Vitest.

### Manual Testing Steps:

1. Run the Phase 2 local checks (unknown cron, failing claim, temporary SSR throw, normal run).
2. Run the Phase 3 PR-stage checks in production (saved queries, top-level fields, Custom Alerts availability, secret present).

## Performance Considerations

- **Log volume.** One extra log line per uncaught SSR error or failed job, plus one `failure-alert` line. That is negligible against the 200,000-event daily cap.
- **Cron limits.** The alert adds one Resend `fetch` to a failed cron run. That stays within 50 subrequests, and network wait does not count toward the 10 ms CPU limit (`README.md:281`).
- **Resend quota.** On a day when the reminder batch used Resend's 100-email free quota, the alert may be rejected. That case is logged as `failure-alert` `failed`.

## Migration Notes

No schema or config migration. A Worker rollback simply restores the previous logging.

## References

- Research: `context/changes/error-tracking/research.md`
- Decisions: `context/changes/error-tracking/decisions.md`
- Roadmap item: `context/foundation/roadmap.md` F-07
- Log and error-class precedent: `src/lib/heartbeat.ts:49-62,86-88`, `src/lib/reminders/appointment.ts:23-34,84-96`
- Astro error path: `node_modules/astro/dist/core/routing/handler.js:101-108`, `node_modules/astro/dist/core/errors/default-handler.js:72-105`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Error vocabulary, builders and code-only throw sites

#### Automated

- [ ] 1.1 Unit tests pass, including the new observability and database-error cases: `npm test`
- [ ] 1.2 Lint passes with no new warnings in changed files: `npm run lint`
- [ ] 1.3 Types check: `npx astro check`
- [ ] 1.4 No thrown message in `src/` embeds a PostgREST message: `grep -rn 'error\.message' src --include=*.ts --include=*.astro` returns no throw sites
- [ ] 1.5 Production build succeeds: `npm run build`

### Phase 2: Wire SSR and cron error events and the failure email

#### Automated

- [ ] 2.1 Unit tests pass: `npm test`
- [ ] 2.2 Lint passes with no new warnings in changed files: `npm run lint`
- [ ] 2.3 Types check: `npx astro check`
- [ ] 2.4 Production build succeeds: `npm run build`

#### Manual

- [ ] 2.5 An unknown cron logs one heartbeat cron error event, sends no failure email, and the run reports failure
- [ ] 2.6 A failing reminder claim logs one appointment-reminder error event with step claim, one failure-alert dry-run line, and no address
- [ ] 2.7 A temporary SSR throw logs one ssr error event with the route pattern and Astro's line shows [redacted]; the 500 page renders; the throw is reverted
- [ ] 2.8 A normal daily cron run shows no error or failure-alert lines

### Phase 3: Documentation and production checks

#### Automated

- [ ] 3.1 Formatting is clean: `npx prettier --check README.md`
- [ ] 3.2 Lint, tests and build still pass: `npm run lint && npm test && npm run build`

#### Manual

- [ ] 3.3 After deploy, the four saved queries are created in the Workers Observability dashboard as documented
- [ ] 3.4 In production Workers Logs, JSON-string log fields appear as top-level filterable keys
- [ ] 3.5 Custom Alerts availability for logs.workersLogs on the Free plan is checked and noted on the PR
- [ ] 3.6 REMINDER_TEST_TO is confirmed set in production
