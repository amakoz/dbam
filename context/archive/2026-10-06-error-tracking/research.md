---
date: 2026-10-06T12:11:07+02:00
researcher: Amadeusz Kozlowski (Claude worker)
git_commit: 71014c3dcc7395a3a0a99be6ce9fcfba26363282
branch: feat/error-tracking
repository: 10xdevs (Dbam)
topic: "F-07 error-tracking: where SSR and reminder-job errors surface today, and what Workers Logs / Resend give us on the Free plan"
tags: [research, codebase, observability, workers-logs, middleware, astro, cron, heartbeat, resend, privacy]
status: complete
last_updated: 2026-10-06
last_updated_by: Amadeusz Kozlowski (Claude worker)
---

# Research: F-07 error tracking (SSR + reminder job → Workers Logs, failure email, saved queries)

**Date**: 2026-10-06T12:11:07+02:00
**Researcher**: Amadeusz Kozlowski (Claude worker)
**Git Commit**: 71014c3dcc7395a3a0a99be6ce9fcfba26363282
**Branch**: feat/error-tracking
**Repository**: 10xdevs (Dbam)

Installed versions read from `node_modules/*/package.json`: astro 7.3.2, @astrojs/cloudflare 14.3.1, wrangler 4.141.0, @supabase/auth-js 2.116.0. External Cloudflare docs were read on 2026-10-06. Most of the pages were last updated 2026-09-24 to 2026-10-05.

## Research Question

From `change.md` / roadmap F-07 (`context/foundation/roadmap.md:172-185`), the change has three parts:

1. Uncaught SSR errors (`src/middleware.ts` / the 500 page) and the scheduled reminder job each log one structured JSON error event to Workers Logs. The event holds an error code, the route or job name and a request id, and never health data, emails or profile fields.
2. A failed reminder run emails the owner through the existing Resend path (`src/lib/heartbeat.ts`, `REMINDER_TEST_TO`).
3. Saved Workers Observability queries for these events are documented in `README.md`. Creating them in production is a human step.

The constraint throughout is Workers Free plan, no new data processor.

## Summary

- **Astro already logs the full error stack for every uncaught pre-stream SSR error, and the stack can carry Postgres messages.** In this case Astro 7.3.2 runs `state.logger.error(null, err.stack || err.message || String(err))` (`node_modules/astro/dist/core/routing/handler.js:102`), which reaches `console.error` and so Workers Logs. Four repo helpers put PostgREST's `error.message` into the thrown message: `src/lib/consent.ts:22,35`, `src/lib/screenings/read.ts:18-19`, `src/lib/catalog/read.ts:34,49`. The pages that call them have no try/catch (`dashboard.astro:34,42`, `profile.astro:25`, `onboarding.astro:24`).
  - This conflicts with the repo's log policy of "error names and codes only, never `message`" (`src/lib/heartbeat.ts:50-51`, `src/lib/reminders/appointment.ts:14-15`).
  - Workers Logs also records the uncaught exception's `message` automatically for throws that escape the Worker (Cloudflare Tail/exception docs). That applies to `scheduled()`, which rethrows at `src/worker.ts:16-19`.
- **The only hook that sees every uncaught pre-stream SSR error once, together with the matched route, is a try/catch in the middleware.** Errors propagate through `next()`: no catch exists in `callMiddleware` or `handlePages` before `routing/handler.js:101`. `context.routePattern` gives the pattern rather than the raw path (`fetch-state.js:411`). Two caveats:
  - Astro renders `500.astro` through the middleware again (`core/errors/default-handler.js:76`), so a whole-body catch needs a once-only guard on `context.locals`. It is the same object in both runs (`default-handler.js:72`).
  - Errors thrown while the response is already streaming (child components or islands) bypass the middleware and 500.astro entirely. No component or layout awaits data today, so this path is empty now.
- **Request id.** For fetch, `cf-ray` from `context.request.headers` matches Workers Logs' `$metadata.rayId`. For cron, `ScheduledController` exposes only `cron`, `scheduledTime` and `type`. The run key is `cron` + `scheduledTime`, matching the heartbeat's idempotency key (`heartbeat.ts:41`).
- **The reminder job already logs one `appointment-reminder` line per run.** On failure it carries `outcome:"failed"`, `error` (the name), plus `status`/`resendError` or `step`/`code` (`appointment.ts:84-96`). It rethrows in every failure case. A run is all-or-nothing: one claim of up to 100 rows, one Resend batch, one mark. "Failed run" therefore maps to `outcome:"failed"`. `step:"mark"` is the case where emails already went out.
- **The failure email can reuse `sendEmail` with `REMINDER_TEST_TO`, the owner's address per archived plans.** It cannot alert on Resend-side failures (`EmailSendError`/`EmailConfigError`), because it uses the same account. It must therefore be best-effort and must not replace the rethrow.
- **Workers Logs on Free, today:** 200,000 events/day and 3-day retention. Invocation logs count toward the cap. `head_sampling_rate` defaults to 1.
  - From 2026-12-01: 0.5 GB/day and 7-day retention, and ingestion stops at the cap until 00:00 UTC.
  - Saved queries are available to all accounts. They are created in the dashboard or through `POST /accounts/{id}/workers/observability/queries`; wrangler has no command for them.
  - `console.error` sets `$metadata.level = error`.
  - Custom JSON keys are top-level. The best-practices page endorses `console.log(JSON.stringify({...}))` as structured, but no page states the parsing rule, so the field names should be confirmed in production before the queries are saved.
- **Alerting alternatives** have appeared since F-07 was written:
  - Custom Alerts (beta, email destinations, SQL over `logs.workersLogs`). Whether the dataset is available on Free is undocumented.
  - Workers Issues (open beta, free, enabled in `wrangler.jsonc`). It has no email destination, and it stores error messages and stack traces.
  - Neither is required by F-07. Enabling Issues would widen what Cloudflare stores, given the message leak above.

## Detailed Findings

### 1. SSR error path (Astro 7.3.2 + @astrojs/cloudflare 14.3.1)

- **Call path.** `src/worker.ts:10` calls `handle` (`@astrojs/cloudflare/dist/utils/handler.js:36-88`), which calls `app.render(request, { locals, ... })` (`handler.js:79-85`), which reaches `render()` in `astro/dist/core/routing/handler.js:51-142`.
- **Error capture.** The middleware and the page or endpoint run inside `handleMiddleware(state, actionsAndPages)` (`routing/handler.js:80`). None of `handlePages` (`core/pages/handler.js:11-64`), `callMiddleware` or `renderEndpoint` catches. The error lands in the catch at `routing/handler.js:101-108`. That catch:
  1. logs `err.stack` (`:102`) through a console logger (`core/logger/manifest-logger.js:4-10`, `core/logger/impls/console.js:10-22`). The default level is `info`, so error lines are emitted.
  2. calls `renderErrorFromState(... status: 500, error: err ...)`.
- **500.astro.** It is rendered on demand. Its props are `{ error }` (`default-handler.js:73`; `FetchState.getProps` at `fetch-state.js:836-841`).

  | Case                     | `Astro.props.error` |
  | ------------------------ | ------------------- |
  | A thrown error           | the thrown object   |
  | A body-less 500 response | `null`              |
  | A direct `GET /500`      | `undefined`         |

  The page does not read it today (`src/pages/500.astro:9-12`). If the 500 render throws, Astro retries without middleware and without logging (`default-handler.js:90-100`). If that also fails, it returns a bare `Response(null, {status})` (`:105`).

- **The middleware runs twice on an error.** The 500 render goes through `handleMiddleware(errorState, handlePages)` (`default-handler.js:76`). In that run `routePattern` is `/500` but `context.url` is still the original path. As a consequence, the middleware at `src/middleware.ts:18-27` calls `supabase.auth.getUser()` a second time, and sets `Cache-Control: private, no-store` on the 500 response for protected paths (`:36-39`).
- **Hook options:**

  | Hook                                       | Sees                                                                                                        | Gaps                                                                                                                             |
  | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
  | Middleware try/catch around the whole body | every pre-stream throw from page, endpoint or middleware, with `context.routePattern`                       | needs a locals flag or a `routePattern === "/500"` skip to avoid a second event                                                  |
  | `500.astro`                                | the error object                                                                                            | only the `/500` pattern, unless the middleware stashes the original pattern in locals; skipped when the 500 render itself throws |
  | `src/worker.ts` around `handle`            | only adapter-level failures (Astro turns page errors into a Response); could check `response.status >= 500` | no error object, code or route; misses mid-stream errors                                                                         |

- **Stopping the existing leak.** If the middleware catches, logs and rethrows the same error, Astro still logs the stack at `routing/handler.js:102`. Options for the plan:
  - Rethrow a sanitized error with no message.
  - Add an Astro custom logger destination (`logger: { entrypoint }` in `astro.config`). It receives `{label, level, message}` only, where `message` is the stack string (`core/config/schemas/base.js:268-271`, `manifest-logger.js:15-29`).
  - Make the throw sites carry codes only, as `ReminderDatabaseError` already does (`appointment.ts:23-34`).
- **Supabase in the middleware.** `getUser()` returns network/HTTP failures as `AuthRetryableFetchError` instead of throwing (`@supabase/auth-js` `GoTrueClient.js:2719-2728`, `lib/fetch.js:38,47,53,130`). The middleware then treats the user as signed out (`middleware.ts:21-27`). That is not an uncaught error, so this path would emit no event.
- **Mid-stream errors.** Streaming is on (`core/app/base.js:74`). Errors after the first byte only reach `controller.error(e)` (`runtime/server/render/astro/render.js:62-73`), which produces no Astro log, no 500.astro and no middleware catch. A search of `src/components` and `src/layouts` found no `await`, so data errors in this inspected tree come from page frontmatter.
- **Error codes.** Uncaught errors carry no code today:
  - The four throwing helpers keep `error.message` and drop PostgREST `error.code`.
  - The existing `errors.*` keys (`src/i18n/en.ts` ~306-336, `src/lib/errors.ts:7-10`) are user-facing outcome codes for the `?error=` redirects, not causes.
  - API routes catch their own failures and redirect without logging (for example `src/pages/api/screenings.ts:41-42`, `profile.ts:31-32`, `reminders.ts:34-35`, `consent/withdraw.ts:28-29`), so they are not "uncaught".
  - The available code material is `err.name`, plus `error.code` (SQLSTATE/PostgREST) if the throw sites are changed to keep it.
- **Request id.** The adapter puts only `locals.cfContext` (the `ExecutionContext`, which has no id) on locals; `locals.runtime` getters throw "removed" (`cf-helpers.js:23-53`). `context.request.headers.get("cf-ray")` is the original request header, the same value as Workers Logs' `$metadata.rayId`. It is likely absent under local `wrangler dev`, so `crypto.randomUUID()` is the fallback.
- **Other console calls in SSR code:**
  - `src/lib/supabase.ts:30-31`: `console.warn` with a fixed string.
  - `src/lib/catalog/read.ts:22`: `console.error` with a catalog slug and validation paths. This is catalog data, not user data.

### 2. Scheduled reminder job

- **Entry.** `src/worker.ts:13-20` runs `runHeartbeat` and `runAppointmentReminders` through `Promise.allSettled`, then rethrows the first failure. Cloudflare then marks the run failed and records the exception (name and message) in Trigger Events and Workers Logs.
- **Crons.** Production has `["0 8,9 * * *"]` (`wrangler.jsonc:15-17`), so `scheduled()` fires twice a day. `isDailySendRun` is true only on the run that is 10:00 Warsaw (`src/lib/schedule.ts:13-15`). The reminder job logs `skipped` on the other run (`appointment.ts:45-48`), so a working-path failure happens at most once a day. A failure in the gate itself, such as the generic `Error` at `schedule.ts:25-27`, would fail both runs.
- **Existing log line.** `{event:"appointment-reminder", outcome, cron, scheduledAt, ...}` comes from `appointment.ts:128-130`. Outcomes: `skipped` (`:46`), `none` (`:61`), `dry-run` (`:72`), `sent` (`:80`), `failed` (`:89-95`). The `failed` line adds:
  - `error`: the error name, or `UnknownError`
  - for `EmailSendError`: `status` and `resendError`
  - for `ReminderDatabaseError`: `step` (`claim`/`mark`) and `code` (SQLSTATE)

  It uses `console.log`, not `console.error`, so its Workers Logs level is `log`.

- **Throwable errors on this path.** Every one of them carries a non-user message by construction today:

  | Error                   | Source                       | Message carries              |
  | ----------------------- | ---------------------------- | ---------------------------- |
  | `ReminderConfigError`   | `admin-client.ts:10-17`      | —                            |
  | `ReminderDatabaseError` | `appointment.ts:25-34`       | the code only                |
  | `EmailSendError`        | `email.ts:35-45`             | status and Resend error name |
  | `EmailConfigError`      | `email.ts:113-114`           | —                            |
  | `RangeError`            | `email.ts:72-73`             | the count                    |
  | `TimeoutError`          | `email.ts:126` (fetch abort) | —                            |
  | generic `Error`         | `schedule.ts:25-27`          | —                            |

  A future error type could break that, because `worker.ts:18` rethrows the original object.

- **No partial failure is surfaced.**
  - One claim is limited to `p_limit: MAX_BATCH_SIZE` = 100 (`appointment.ts:54`, `email.ts:13`). Rows beyond 100 wait silently for the next day, visible only as `due:100`.
  - The count returned by `mark` is ignored (`appointment.ts:76`).
  - A `step:"mark"` failure means emails were sent but rows stayed unmarked. The next day's claim then reuses the same batch key, but Resend keys expire after 24 h (`context/archive/2026-09-30-appointment-reminder/research.md:65`, not re-verified), so a duplicate send is possible. The alert should say this.
- **Heartbeat.** `heartbeat.ts` logs `{event:"heartbeat", ...}` the same way (`:86-88`) and rethrows (`:61`). Its `recipient()` (`:76-84`) is the only reader of `REMINDER_TEST_TO`. It falls back to `delivered@resend.dev` under `EMAIL_DRY_RUN` and otherwise throws `HeartbeatConfigError`. A failure-email sender would extract or mirror this function. Whether heartbeat failures should also alert is not stated in F-07.
- **Alert recipient.**
  - `REMINDER_TEST_TO` is an optional server secret (`astro.config.mjs:57`), commented as "the heartbeat recipient" (`:54-55`, `README.md:229`).
  - The archived plans identify it as the owner's address registered with Resend (`context/archive/2026-09-29-reminder-dispatch-path/plan.md:5`, `plan-brief.md:18,27-28`), set in production after #48 (`plan.md:391-392`).
  - Not verified against `wrangler secret list`.
- **Alert idempotency and limits.**
  - A key shaped like `dbam-heartbeat:${cron}:${scheduledTime}` (`heartbeat.ts:41`), for example `dbam-<job>-failure:${cron}:${scheduledTime}`, deduplicates a retried run within Resend's window.
  - Whether Cloudflare retries a failed cron is contradicted across archived docs (`reminder-dispatch-path/plan.md:56` vs. `reviews/impl-review.md:114-122`; `appointment-reminder/research.md:67` says "unclear"). `controller.noRetry()` exists (`worker-configuration.d.ts:2403-2408`) and is unused.
  - Resend's free tier is 100 emails/day (`README.md:281`). A full 100-email batch plus the heartbeat already exceeds it, so an alert on such a day may be rejected too.
- **Existing operator-email precedent.** The heartbeat is operator-only, plain English and not translated (`reminder-dispatch-path/plan.md:57`).

### 3. Workers Logs, saved queries and alerts (external, Cloudflare docs, read 2026-10-06)

- **Structured logs.**
  - Workers Logs "automatically extracts the fields" of JSON logs into top-level keys (https://developers.cloudflare.com/workers/observability/logs/workers-logs/).
  - The best-practices page marks `console.log(JSON.stringify({...}))` as structured and filterable (https://developers.cloudflare.com/workers/best-practices/workers-best-practices/#observability).
  - Platform fields live under `$metadata.*` and `$workers.*`.
  - `console.error` gives `$metadata.level = "error"`.
- **Free-plan limits:**

  | Regime           | Volume cap             | Retention | Over the cap                                                   |
  | ---------------- | ---------------------- | --------- | -------------------------------------------------------------- |
  | Until 2026-12-01 | 200,000 log events/day | 3 days    | not documented for this cap                                    |
  | From 2026-12-01  | 0.5 GB/day             | 7 days    | "Cloudflare stops ingesting new data … resumes … at 00:00 UTC" |

  Sources: https://developers.cloudflare.com/workers/observability/logs/workers-logs/ (until 2026-12-01) and https://developers.cloudflare.com/observability/pricing/ (from 2026-12-01).
  - The documented 1% overflow sample belongs to a different, per-account 5-billion cap.
  - Invocation logs count: "Each request emits 1 invocation log and 1 `console.log`".
  - `head_sampling_rate` defaults to 1.

- **Query Builder.**
  - It is "available to all developers". "Save Query" saves a query at account level with a unique URL (https://developers.cloudflare.com/workers/observability/query-builder/).
  - The API is `POST /accounts/{account_id}/workers/observability/queries` and needs the `Workers Observability Write` permission. There is no wrangler command.
  - Filters are key/operator/value combined with AND, with operators such as Equals, Exists and Includes.
  - Documented error filters: `$workers.outcome = "exception"` and `$metadata.error EXISTS` (https://developers.cloudflare.com/workers/observability/errors/).
  - "Outcome is not the same as HTTP status". An SSR error that Astro turns into a 500 is a handled response, so its outcome is likely `ok` (inferred, not tested). Our own event is the reliable filter for SSR errors.
  - `$workers.eventType` distinguishes `fetch` from `scheduled`.
- **Ids.**
  - `$metadata.requestId` ties one invocation's logs together. There is no runtime API to read it.
  - `$metadata.rayId` is the `cf-ray` header.
  - Scheduled runs have no documented readable id.
- **Uncaught exceptions.** They are recorded with `name` and `message` automatically (https://developers.cloudflare.com/workers/runtime-apis/handlers/tail/#tailexception). The Issues docs warn that error messages and stack traces are stored.
- **Alerting:**
  - **Custom Alerts (beta).** These run a SQL query on a schedule and send to up to 20 email recipients or a webhook (https://developers.cloudflare.com/notifications/notification-available/#custom-alerts-beta). "The datasets available to Custom Alerts depend on your plan", and Free access to `logs.workersLogs` is undocumented. Roadmap `:183` makes checking this a user step.
  - **Workers Issues** (open beta, free). It groups exceptions, 5xx responses and error-level logs. It is enabled with `"observability": { "issues": { "enabled": true } }` and needs wrangler ≥ 4.134.0; the installed version is 4.141.0. Its automations go to webhooks, chat or coding agents, not email (https://developers.cloudflare.com/workers/observability/issues/automations/). It stores messages and stack traces.
  - No built-in Workers error-rate email notification was found.
- **Gotchas:**
  - Logs are limited to 256 KB per request.
  - `ctx.waitUntil` logs belong to the invocation, which has 30 s after the response.
  - Turning off `observability.logs.invocation_logs` saves quota but loses `$workers.outcome`.

## Code References

- `src/worker.ts:9-21`: Worker entry; `scheduled()` runs both jobs with `allSettled` and rethrows the first failure.
- `src/middleware.ts:15-41`: middleware, with no try/catch; `getUser` at `:18-27`, protected-route gate at `:29-39`.
- `src/pages/500.astro:9-12`: generic error page that ignores `Astro.props.error`.
- `src/lib/heartbeat.ts:41,49-62,76-88`: idempotency key, failure log (name only), `recipient()`, `log()`.
- `src/lib/reminders/appointment.ts:14-15,23-34,84-96,128-130`: log policy, `ReminderDatabaseError`, failure log, `log()`.
- `src/lib/email.ts:35-45,47-62,113-114,126`: `EmailSendError`, `sendEmail`, `EmailConfigError`, 10 s timeout.
- `src/lib/schedule.ts:6,8,13-15,25-27`: `PROVING_CRON`, `DAILY_CRON`, `isDailySendRun`, `warsawHour` throw.
- `src/lib/consent.ts:22,35`, `src/lib/screenings/read.ts:18-19`, `src/lib/catalog/read.ts:34,49`: throw sites that embed PostgREST `error.message`.
- `astro.config.mjs:50-66`: env schema (`REMINDER_TEST_TO` `:57`, `EMAIL_DRY_RUN` `:58`).
- `wrangler.jsonc:12-17`: `observability.enabled: true`, `crons: ["0 8,9 * * *"]`.
- `eslint.config.js:76-80`: `no-console` is off only for `src/worker.ts`, `email.ts`, `heartbeat.ts`, `reminders/appointment.ts`. A new logging module, or `src/middleware.ts`, must be added there.
- `vitest.config.ts`: node environment with tsconfig paths only. `astro:env/server` does not resolve in tests, so failure-event and email builders should live in an env-free module.
- `README.md:247-282`: "Scheduled jobs" section; production notes at `:278-282` (Workers Logs line `:280`, Free limits `:281`). `## Smoke test` starts at `:284`.
- `.github/workflows/ci.yml:66-84`: CI runs each cron in dry run and expects `"outcome":"ok"`. It never exercises a failure path.
- `node_modules/astro/dist/core/routing/handler.js:101-108`: Astro catch that logs `err.stack` and renders the 500 page.
- `node_modules/astro/dist/core/errors/default-handler.js:72-76,90-105`: 500 render with shared locals, `{ error }` props, middleware re-run, fallbacks.

## Architecture Insights

- **Established log convention.** One `console.log(JSON.stringify({ event: "<job>", outcome, ...fields }))` line per job run. Fields are strings and numbers, and errors appear as `name` plus structured codes, never `message`. New events should keep the shape: an `event` key as the query handle, and `console.error` for error level.
- **Error classes carry codes, not messages.** `ReminderDatabaseError` and `EmailSendError` follow this pattern and the SSR-side throw sites do not. The privacy gap in SSR comes from that difference plus Astro's own stack logging, not from a missing logger.
- **Testability.** Pure logic is tested with "now" passed in (`CLAUDE.md` Testing Guidelines). A pure `buildErrorEvent` / `buildFailureEmail` taking `{job|route, error, cron, scheduledTime, requestId}` is unit-testable without `astro:env`. The essential test is a privacy case: an `Error` whose message contains an email address or SQL fragment must not appear in the event or the email.
- **The alert must be best-effort.** It goes through the same Resend account and runs inside the same 10 ms-CPU cron invocation (`README.md:281`). It must catch and log its own failure and never mask the original rethrow at `worker.ts:18`.

## Historical Context (from prior changes)

- `context/foundation/roadmap.md:182`: decided 2026-10-05 to use Cloudflare-native tooling, not Sentry, so the DPIA (Open Question 2, `:311`) gains no new sub-processor. **Status: supported.** Workers Issues and Custom Alerts are both Cloudflare.
- `context/foundation/roadmap.md:183`: "Cloudflare custom alerts (beta, announced 2026-10-02) … whether they run on the Free plan is undocumented". **Status: still supported** as of the 2026-10-02 docs page. Workers Issues (not mentioned there) is a second Cloudflare option, with no email destination.
- `context/foundation/roadmap.md:184`: "200,000 log events/day and 3-day retention". **Status: supported until 2026-12-01.** The pricing page changes Free to 0.5 GB/day and 7 days from then.
- `context/archive/2026-09-29-reminder-dispatch-path/reviews/impl-review.md:107-112` (F5): decided logs keep the error `name`, never `message`. **Status: supported** for the cron path (`heartbeat.ts:50-51`, `appointment.ts:84-96`). It is **not enforced** on the SSR path (Astro `routing/handler.js:102`), and not enforced for the exception Cloudflare records when `scheduled()` rethrows.
- `context/archive/2026-09-29-reminder-dispatch-path/reviews/impl-review.md:83`: an unknown-cron failure "shows only in Trigger Events and alerts no one". **Status: still true.** F-07 addresses it.
- `context/archive/2026-09-29-reminder-dispatch-path/plan.md:28,57`: the heartbeat is a liveness email for the operator, written in English. Its absence is the only signal that `scheduled()` did not fire at all. F-07's failure email cannot cover a run that never starts.
- `context/changes/deployment/deployment-plan.md:447`: Workers Logs is visible in Dashboard → Workers → dbam → Logs.

## Related Research

- `context/archive/2026-09-30-appointment-reminder/research.md`: reminder job design, Resend idempotency window, log privacy rule (`:65,67,83`).
- `context/archive/2026-09-29-reminder-dispatch-path/`: heartbeat design and production rollout.

## Open Questions

These are for the plan. None blocks planning.

1. **SSR message leak scope.** Should F-07 also stop Astro's `err.stack` line from carrying PostgREST messages? Options: sanitize the throw sites to keep `error.code`, rethrow a sanitized error from the middleware, or add an Astro logger destination. Without one of these, F-07's "never health data in logs" guarantee does not hold for SSR. How often PostgREST messages for these SELECTs quote row values was not measured. The repo's policy already treats them as unsafe (`appointment.ts:14-15`).
2. **Alert scope.** Does a failed heartbeat (not only the appointment reminder job) also send the failure email? If Resend itself fails, the email cannot go out; only Workers Logs and Trigger Events (or a Custom Alert) remain.
3. **Custom Alerts on Free** (roadmap `:183`, owner: user). Is `logs.workersLogs` usable for an email Custom Alert on the Free plan? This is checked in the dashboard, as a PR manual step.
4. **Workers Issues.** Leave it off (F-07 scope, and it stores raw messages), or enable it after the leak is fixed? This is a product choice and not required by F-07.
5. **JSON-string parsing.** Confirm in production that `console.error(JSON.stringify({...}))` fields appear as top-level keys before the saved queries are created. This is a human step, documented in the README.
6. **Cron retry behaviour** is unresolved across archived docs. It affects only duplicate alert emails, which the idempotency key mitigates.
7. **Mid-stream SSR errors** (after a 200 has started streaming) are invisible to every hook. They are acceptable while no component or layout awaits data; the plan should state this limit.
