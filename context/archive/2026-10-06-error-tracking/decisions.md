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

## 2026-10-06 Plan-review triage (plan-review.md F1–F6)

- **Question:** How should each plan-review finding be resolved?
- **Choices:**
  - **F1 Fix A.** Invocation-log URLs carry `slug`. The README privacy rule is scoped to our own `error`/`failure-alert` events, with a Known gaps bullet, PR manual check 3.7 (does `$workers.event.request.url` keep the query string?), and a follow-up record `follow-ups/redirect-slug-leak.md` (move `slug` out of the redirect query; audit `?code=` and other params) for the PR body. No roadmap slice edits; the owner decides.
  - **F2 ACCEPT.** On `/500`, a catch rethrows `redactError(error)` without logging: redact always, log once.
  - **F3 ACCEPT.** Check 2.7 runs under `astro dev` and under `npm run preview` (the production handler), and expects one `ssr` event with every Astro error line redacted.
  - **F4 ACCEPT.** The token rule applies to `name` (fallback `UnknownError`). `redactError` cuts the exact `name: message` prefix before filtering frames (header only otherwise), with unit cases for both. The README says detail values must be static identifiers.
  - **F5 ACCEPT.** Criterion 1.4 uses quoted globs and expects "returns no output".
  - **F6 ACCEPT.** The type is renamed `ErrorLogEvent`.
- **Evidence:** `context/changes/error-tracking/plan-review.md`. F1 rests on `src/pages/api/screenings.ts:42,49` and `src/pages/dashboard.astro:92`.
- **Decided by:** orchestrator

## 2026-10-06 Phase 3 closes with production checks left to the PR

- **Question:** Phase 3's manual rows (3.3–3.7) need production; how does the phase and the epilogue close with them pending?
- **Options:** (a) Pause for the human at the manual gate and the stragglers prompt. (b) Commit the docs, leave 3.3–3.7 unchecked, list them in the PR's Manual checks, and run the epilogue.
- **Choice:** (b). The orchestrator's instruction for this run: production items (saved queries, field filterability, custom alerts on Free, `REMINDER_TEST_TO` in production, rayId correlation, real Resend delivery, invocation-log query string) go to the PR's Manual checks list. Execution mode: implemented in context, since the phase is documentation only.
- **Evidence:** `/10x-implement error-tracking phase 3` arguments; `follow-ups/redirect-slug-leak.md` keeps its **Open** answer as pending until the human check.
- **Decided by:** orchestrator

## 2026-10-06 Implementation review: report path and triage

- **Question:** Where does the impl-review report go, and who triages it?
- **Options:** (a) The skill default, `reviews/impl-review.md`, with triage done by the worker. (b) `impl-review.md` at the change root, with no worker triage.
- **Choice:** (b). The report is at `context/changes/error-tracking/impl-review.md` and every finding is left `PENDING` for the orchestrator. Verdict: APPROVED (1 warning, 6 observations, no critical findings).
- **Evidence:** The orchestrator's `/10x-impl-review` arguments ("Write the report to context/changes/error-tracking/impl-review.md. Triage nothing yourself.").
- **Decided by:** orchestrator

## 2026-10-06 Implementation review triage

- **Question:** How is each finding in `impl-review.md` (F1–F7) resolved?
- **Options:** Per finding: accept and fix in this change, record as a lesson, or leave as is.
- **Choices:**
  - **F1 ACCEPT.** `redactError` accepts the header only when `stack === header` or it continues with `header + "\n"`; an empty message uses the name alone as the header. It stops at the first non-frame line and drops frame lines containing `@`. The three probe cases are in `observability.test.ts`. Worker detail: Vitest's source-map rewrite prints `TypeError: ` (trailing `: `) for an empty message, so both `name` and `name: ` are accepted there; neither contains message text. Dropping `@` frames also drops dev-server frames under `node_modules/@scope/…`; accepted, since our own `src/` frames and the bundled Worker's frames keep no `@`.
  - **F2 ACCEPT.** The log call has its own `try/catch` in `src/middleware.ts` and `src/worker.ts`. A module-level `WeakSet` in `observability.ts` tracks redacted copies (`isRedacted()`); the middleware rethrows one as-is without logging, and `redactError` returns one unchanged. Worker detail: `scheduled()` still logs and alerts for every failed job (no nested pass exists there); `redactError` also falls back to `UnknownError: [redacted]` when reading the error throws.
  - **F3 LESSON.** No ESLint rule. Captured via `/10x-lesson` as "Grep gates are heuristics; privacy tests are the guard" in `context/foundation/lessons.md`; wording drafted by the worker from the orchestrator's triage instead of the skill's interview.
  - **F4 ACCEPT.** Both older `failed` outcome lines (`heartbeat.ts`, `reminders/appointment.ts`) use `errorName()`/`errorDetails()`; the README bullet saying they were unchanged is updated.
  - **F5 ACCEPT.** `isoTime` is exported and reused in `failure-alert.ts`; the recipient fallback stays.
  - **F6 ACCEPT.** README "Errors and alerts" gets the local-debugging note.
  - **F7 ACCEPT.** Comment at the `redactError` rethrow in the middleware (and in `scheduled()`).
- **Evidence:** `context/changes/error-tracking/impl-review.md`; the orchestrator's triage prompt.
- **Decided by:** orchestrator

## 2026-10-06 Archive with the PR-stage production checks open

- **Question:** `/10x-archive` warns that Progress rows 3.3–3.7 (manual) are still pending. Archive anyway?
- **Options:** (a) Wait until the production checks are done after deploy. (b) Archive now; the PR's Manual checks list carries 3.3–3.7.
- **Choice:** (b). Rows 3.3–3.7 need production (saved queries, filterable JSON fields, Custom Alerts on Free, `REMINDER_TEST_TO`, the invocation log's query string), so they belong to the PR's Manual checks, not to this folder; they stay unchecked in `plan.md` as the record. The archive's other diagnostic, that f0a43b8, a028cb9 and 6b57d73 are not yet in `origin/main`, is expected: no PR is open, so there is nothing to repoint. `follow-ups/redirect-slug-leak.md` moves with the change folder.
- **Evidence:** `plan.md` Progress (3.3–3.7 pending, every automated row done); the 2026-10-06 "Phase 3 closes with production checks left to the PR" entry above; `gh pr list --head feat/error-tracking` returns none.
- **Decided by:** orchestrator
