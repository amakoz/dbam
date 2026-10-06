# Error Tracking (F-07) — Plan Brief

> Full plan: `context/changes/error-tracking/plan.md`
> Research: `context/changes/error-tracking/research.md`
> Decisions: `context/changes/error-tracking/decisions.md`
> Plan review: `context/changes/error-tracking/plan-review.md` (F1–F6 triaged)

## What & Why

Production errors in Dbam alert nobody today.

- An uncaught SSR error shows up only as Astro's raw stack line in Workers Logs, and that line can quote Postgres messages.
- A failed reminder run shows up only in Trigger Events.

F-07 makes both visible as one structured, privacy-safe event, and emails the owner when the appointment reminder run fails. It uses only Cloudflare Workers Logs and the existing Resend path, on the Free plan, with no new data processor. S-06/S-07 depend on reminder runs not failing silently.

## Starting Point

- **SSR path.** Astro catches page errors, logs `err.stack` and renders `500.astro` (`node_modules/astro/dist/core/routing/handler.js:101-108`). Six helper throw sites embed PostgREST `error.message`.
- **Cron path.** `scheduled()` (`src/worker.ts:13-20`) runs the heartbeat and the reminder job, and rethrows the first failure. Each job logs an outcome line with the error name and codes.
- **Email.** `REMINDER_TEST_TO` (the owner) is read only by the heartbeat.

## Desired End State

- **One error event per failure.** Each uncaught pre-stream SSR error and each failed cron job logs one `console.error` line: `{"event":"error","source":"ssr"|"cron", route|job, requestId, error, code…}`. It holds names, short codes, route patterns and run ids only.
- **Failure email.** A failed appointment reminder run also sends the owner a plain-English, best-effort email with no user data.
- **No raw messages.** Every Astro error line (dev and production handlers, including the `/500` re-render) and Cloudflare's record of the cron exception no longer carry raw messages.
- **Docs.** README lists four saved queries that a human creates in the dashboard, the Free-plan limits and the known gaps.
  - Its privacy rule is scoped to our own `error`/`failure-alert` events.
  - Health data in Cloudflare invocation-log URLs (`/dashboard?…&slug=`) is a named known gap, tracked in `follow-ups/redirect-slug-leak.md`.

## Key Decisions Made

| Decision                             | Choice                                                                                                               | Why                                                                                                                | Source                        |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| SSR message leak                     | The six helper throws become `DatabaseError(operation, code)`                                                        | "Never health data in logs" depends on it (PRD NFR privacy)                                                        | Research → orchestrator       |
| Heartbeat failure email              | None; error event only                                                                                               | The heartbeat is itself the Resend path, and this is smaller                                                       | Orchestrator                  |
| Custom Alerts (beta)                 | Not a dependency; Free availability checked on the PR                                                                | Free-plan dataset access is undocumented                                                                           | Orchestrator                  |
| Workers Issues                       | Stays off                                                                                                            | Stores raw messages and stack traces                                                                               | Orchestrator                  |
| SSR hook                             | Whole-body try/catch in the middleware; logs once (never on `/500`), always rethrows a redacted error                | Only hook that sees each error once with `routePattern`; "redact always, log once" holds on every Astro error path | Research → plan review F2     |
| Event shape                          | One `event:"error"` line (type `ErrorLogEvent`); the token rule applies to the name and to whitelisted detail values | One query handle; makes "no addresses or free text" testable; avoids shadowing the Workers `ErrorEvent` global     | Plan → plan review F4/F6      |
| Redaction                            | Cut the exact `name: message` prefix from the stack, keep frames; header only when the prefix doesn't match          | A frame-like message line can't survive                                                                            | Plan review F4                |
| Invocation-log URL leak              | Documented as a known gap, plus a PR check and a follow-up record; no fix and no roadmap edit here                   | Fixing it changes the dashboard flow (scope creep); the owner decides on a slice                                   | Plan review F1 → orchestrator |
| Request id                           | `cf-ray` (UUID fallback) for SSR, `cron-<scheduledTime>` for cron                                                    | `cf-ray` = `$metadata.rayId`; cron has no readable id                                                              | Research                      |
| Where cron events and the alert fire | `scheduled()` after `allSettled`; the alert never throws; the run still rethrows                                     | Owns the job list; the alert must not mask the failure                                                             | Plan                          |
| Alert idempotency                    | `dbam-reminder-failure:<cron>:<scheduledTime>`                                                                       | Mirrors the heartbeat; dedupes a possible retry                                                                    | Research                      |
| Testability                          | Builders in `astro:env`-free `src/lib/observability.ts`, with Vitest                                                 | `astro:env` doesn't resolve in Vitest                                                                              | Research → orchestrator       |

## Scope

**In scope:**

- `DatabaseError` and the six throw sites.
- `src/lib/observability.ts` (event builders, whitelist, redaction, request id, failure-email content, `logErrorEvent`) and its unit tests.
- The middleware hook.
- `src/lib/failure-alert.ts`.
- The `scheduled()` wiring.
- The lint exemptions and the env comment.
- The README "Errors and alerts" subsection.

**Out of scope:**

- Sentry, Workers Issues, Custom Alerts as a dependency.
- A heartbeat failure email.
- Mid-stream SSR errors.
- `?error=` redirects.
- `500.astro` changes.
- Partial-failure alerts (more than 100 claimed, ignored mark count).
- Saved queries created by the worker or through the API.
- Moving `slug` out of the `/dashboard` redirect query (the follow-up record) and editing roadmap slices.

## Architecture / Approach

- **Pure core.** `observability.ts` is pure: errors in, flat string records out, plus one `console.error`.
- **Middleware** (SSR): `try { …whole body… } catch → (routePattern !== "/500" && logErrorEvent(buildSsrErrorEvent(...))); throw redactError(e)`. Astro then logs the redacted stack and renders `500.astro`.
- **`scheduled()`** (cron): `allSettled`, then one `buildCronErrorEvent` per rejected job. If `appointment-reminder` failed, `await sendReminderFailureAlert` (`failure-alert.ts` → `sendEmail`, logs `failure-alert` and never throws). Then `throw redactError(first)`.

## Phases at a Glance

| Phase                                     | What it delivers                                                                                                                 | Key risk                                                                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1. Vocabulary, builders, code-only throws | `DatabaseError`, `observability.ts` with privacy unit tests, six sanitized throw sites                                           | The redaction must drop multi-line messages but keep frames                                                                    |
| 2. Wiring                                 | Middleware SSR events; cron events and the failure email in `scheduled()`; local checks under `astro dev` and the preview server | The double middleware run on the 500 render (log skipped on `/500`, redaction kept)                                            |
| 3. Docs and production checks             | README "Errors and alerts" with four saved queries, limits and known gaps; follow-up record; PR manual checks                    | Whether JSON-string fields index as top-level keys, and whether invocation URLs keep the query string (verified in production) |

**Prerequisites:** none. The F-03 Vitest runner exists, and `observability.enabled` is already on.
**Estimated effort:** about 2 sessions across 3 phases.

## Open Risks & Assumptions

- Cloudflare's docs endorse `console.log(JSON.stringify(...))` as structured, but no page states the parsing rule. A PR check confirms the top-level keys.
- `REMINDER_TEST_TO` is assumed set in production, based on the archived plans; it is checked on the PR. The alert cannot go out when Resend itself is failing, or the daily quota is used up. Workers Logs and Trigger Events remain the fallback.
- Mid-stream SSR errors stay invisible. That is acceptable while no component or layout awaits data.
- Free-plan logging changes on 2026-12-01: 0.5 GB/day and 7-day retention, and ingestion stops at the cap.
- Until the follow-up ships, a screening slug in `/dashboard?…&slug=` request URLs can sit in Cloudflare's invocation logs for the retention window (plan review F1). Whether the query string is kept is checked on the PR. Whether the privacy NFR and the DPIA tolerate this interim state is for the owner to decide.

## Success Criteria (Summary)

- Every uncaught SSR error and failed cron job produces exactly one queryable error event, and none of our own log lines (`error`, `failure-alert`, Astro's error lines) carries a raw error message, an address or health data.
- A failed appointment reminder run emails the owner, without user data, unless Resend itself is down.
- An operator can find errors through the documented saved queries within the retention window.
