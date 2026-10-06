# Decisions: error-tracking (F-07)

## 2026-10-06 Clean the error text in the SSR error path

- **Question:** Should F-07 also stop raw Postgres messages from reaching Workers Logs through Astro's own `err.stack` line (`node_modules/astro/dist/core/routing/handler.js:102`)? (research.md, Open Question 1)
- **Options:** (a) The four helpers throw names and codes only. (b) Leave them as they are.
- **Choice:** (a). The throw sites are `src/lib/consent.ts:22,35`, `src/lib/screenings/read.ts:18-19` and `src/lib/catalog/read.ts:34,49`. They should match `src/lib/heartbeat.ts:50-51`.
- **Evidence:** PRD NFR (privacy). F-07's "never health data in logs" outcome depends on it.
- **Decided by:** orchestrator

## 2026-10-06 No failure email for a failed heartbeat

- **Question:** Does a failed heartbeat also send the failure email? (research.md, Open Question 2)
- **Options:** (a) Yes. (b) No: structured error log only.
- **Choice:** (b). Only a failed appointment reminder run sends the failure email, on a best-effort basis, as the roadmap says.
- **Evidence:** The heartbeat is itself the Resend path, and (b) is the smaller change.
- **Decided by:** orchestrator

## 2026-10-06 Custom Alerts are not a dependency

- **Question:** Should the plan use Cloudflare Custom Alerts (beta)? (research.md, Open Question 3)
- **Options:** (a) Depend on them. (b) Don't depend on them, and check Free-plan availability as a PR manual step.
- **Choice:** (b). Checking the dashboard goes to the PR's Manual checks, for the human.
- **Evidence:** Free-plan support for the `logs.workersLogs` dataset is undocumented (research.md §3).
- **Decided by:** orchestrator

## 2026-10-06 Workers Issues stays off

- **Question:** Should Workers Issues be enabled in `wrangler.jsonc`? (research.md, Open Question 4)
- **Options:** (a) Enable it. (b) Keep it off.
- **Choice:** (b).
- **Evidence:** Issues stores raw error messages and stack traces, which conflicts with the privacy NFR.
- **Decided by:** orchestrator

## 2026-10-06 Planning interview and structure approval delegated

- **Question:** What complexity, question budget and phase approval does `/10x-plan` need?
- **Options:** (a) Ask the orchestrator. (b) Take the recommendation, since the pre-answers settle every product decision.
- **Choice:** (b). Complexity is MEDIUM and the substantive question count is 0 (the settled-input exception). The three-phase structure is written straight into the plan. Remaining choices take the worker's recommended option unless they add a dependency, a service or an external account; none do.
- **Evidence:** The orchestrator's instruction: "take your recommended option unless it adds a dependency, a service or an external account — then ask. Ask only what remains open."
- **Decided by:** orchestrator (delegation), worker (application)

## 2026-10-06 Hook SSR errors in the middleware, with a redacted rethrow

- **Question:** Where should one event per uncaught SSR error be emitted, and how do we keep Astro's own stack line message-free?
- **Options:**
  - (a) A whole-body try/catch in `src/middleware.ts` that skips the `/500` re-render, logs the event and rethrows a redacted error.
  - (b) Use `500.astro`.
  - (c) Wrap `handle` in `src/worker.ts`.
  - (d) An Astro custom logger destination.
- **Choice:** (a). The redacted error keeps the original name and stack frames but replaces the message, so Astro's `err.stack` line still points at the code.
- **Evidence:**
  - (a) is the only hook that sees every pre-stream error once, with `context.routePattern` (research.md §1). Astro re-runs the middleware for the 500 render (`default-handler.js:76`).
  - (b) sees only the `/500` pattern.
  - (c) never sees page errors.
  - (d) gets only a stack string, with no route and no error object.
  - Cleaning the four throw sites covers known messages. The redacted rethrow covers unknown ones.
- **Decided by:** worker

## 2026-10-06 One `event: "error"` shape for SSR and cron, logged with `console.error`

- **Question:** What should the structured error event look like?
- **Choice:**
  - One event name `error` and a `source` of `ssr` or `cron`.
  - `route` (the route pattern) or `job`.
  - `requestId`: `cf-ray` for SSR, `cron-<scheduledTime>` for cron.
  - `error`: the error name.
  - Optional detail fields: `code`, `operation`, `step`, `status` and `resendError`. Each is kept only when its value is a short token (`/^[A-Za-z0-9_.:-]{1,64}$/`).
  - Logged with `console.error`, so `$metadata.level = error`.
  - The existing per-job outcome lines (`heartbeat`, `appointment-reminder`) stay unchanged.
- **Evidence:**
  - The `event` key is the established query handle (`heartbeat.ts:86-88`, `appointment.ts:128-130`).
  - The token rule makes "no emails or free text in an event" a testable invariant. An `@` or a space can't pass it.
  - `cf-ray` matches Workers Logs' `$metadata.rayId`. Cron has no readable id, so `cron` plus `scheduledTime` identifies the run (research.md §3).
- **Decided by:** worker

## 2026-10-06 Cron error events and the failure email are emitted in `scheduled()`

- **Question:** Should the job modules emit cron error events, or `src/worker.ts`?
- **Choice:** `src/worker.ts`, after `Promise.allSettled`.
  - It emits one error event per rejected job.
  - If `appointment-reminder` was rejected, it awaits a best-effort `sendReminderFailureAlert`. That function never throws and logs its own `failure-alert` outcome.
  - It then rethrows the first failure, redacted.
- **Evidence:**
  - `worker.ts:13-20` already owns the job list and the rethrow.
  - The alert must not mask the original failure (research.md, Architecture Insights).
  - Idempotency key: `dbam-reminder-failure:<cron>:<scheduledTime>`, mirroring `heartbeat.ts:41`. It dedupes a retried run, a question that is unresolved in the archived docs.
- **Decided by:** worker
