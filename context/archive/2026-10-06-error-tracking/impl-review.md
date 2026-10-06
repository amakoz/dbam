<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Error Tracking (F-07)

- **Plan**: context/changes/error-tracking/plan.md
- **Scope**: Full plan (Phases 1–3; Phase 3 manual rows 3.3–3.7 are PR-stage production checks, left open on purpose)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-06
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 6 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Privacy answer (orchestrator's question)

**Can a user, health or free-text value reach a log line or the failure email? Not on any path the code reaches today.**

- **Every console call in the change, and every call it reaches**, writes only these fields:
  - event names and outcomes;
  - route patterns (`context.routePattern`, never the URL);
  - token-checked error names and detail values;
  - `cron`, ISO times, counts, Resend ids;
  - idempotency keys: `dbam-reminder-failure:<cron>:<time>`, and a SHA-256 hash of the claim ids for reminder batches.
- **The calls checked**: `observability.ts:162`, `failure-alert.ts:20,27,30,33`, `email.ts:50,77`, `heartbeat.ts:87`, `appointment.ts:129`.
- **What is never logged**: the recipient, subject and text of the failure email.
- **The failure email** (`buildReminderFailureEmail`) contains only:
  - fixed text;
  - the job name, run time and cron;
  - the token-checked error name;
  - the whitelisted details.
- **Rethrows are redacted on both entry points** (`middleware.ts:34`, `worker.ts:35`). So Astro's stack line, the dev handler's line and Cloudflare's scheduled-exception record never see an original message.
- **Older lines that are not ours**:
  - `catalog/read.ts:23` logs a catalog slug, which is catalog data, not a user value.
  - Cloudflare's invocation-log URLs (`?slug=`) are a known gap, documented in the README with a follow-up record.

**The `redactError` destructuring and the grep gate.**

- `observability.ts:113` reads `const { name: rawName, message, stack } = error`.
- `message` is used only to build the exact `name: message` prefix that is cut from `stack` (l.116–117). It is never written to the returned error, an event or the email.
- So gate 1.4's intent still holds: no thrown message embeds a PostgREST message.
  - The six throw sites now throw `DatabaseError(operation, code)`.
  - A broader search finds only two other `.message` reads: `supabase.ts:19`, an equality check, and `email.ts:73`, `messages.length`.
- The gate itself, though, no longer guards against a regression (F3).
- `redactError` has edge cases where frame-like text survives (F1). None of them can be reached from today's code.

## Findings

### F1 — `redactError` keeps frame-like lines that are not frames of the original header

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/observability.ts:117-121
- **Detail**: The plan's invariant (plan.md:110) is that a message line that looks like a frame can never survive. The loop _skips_ any line that is not a frame and keeps scanning, and it accepts the header when `stack` merely _starts with_ `name: message`. Probes run in Vitest under Node/V8 show three escapes:
  1. **Message shortened after the stack was read.**
     - Setup: `new Error("boom jan.kowalski@example.com\n    at jan.kowalski@example.com")`, then `e.stack` is read, then `e.message = "boom"`.
     - The header `Error: boom` still prefixes the stack, so `    at jan.kowalski@example.com` is kept.
  2. **A stack with a library-appended cause chain** (`stack += "\nCaused by: " + cause.stack`).
     - The `Caused by:` line is dropped.
     - The cause message's frame-like lines that follow it are kept.
  3. **A real frame whose function name comes from a dynamic property key** (`obj[email] = () => { throw … }`) prints `at Object.jan@…`.

  Nothing in `src/` mutates a message, appends a cause or names functions after user values, so this is not a leak today. Side effect: an error with an empty message (stack header `TypeError`, with no `: `) gets the header-only fallback and loses its frames. That is safe, but the debugging context is gone.

- **Fix**: Accept the header only when `stack === header || stack.startsWith(header + "\n")`, and use `rawName` alone as the header when `message === ""`. Stop at the first non-frame line (`break`, not skip), and optionally drop frame lines containing `@`. Add the three probe cases to `observability.test.ts`.
- **Decision**: ACCEPTED (orchestrator) — fixed. The header is accepted only when `stack` equals it or continues with a line break; for an empty message both `name` (V8) and `name: ` (Vitest's source-map rewrite) are accepted. The frame scan stops at the first non-frame line, and frames containing `@` are dropped. Probe cases (shortened message, cause chain, user-named function) plus the empty-message case are in `observability.test.ts`.

### F2 — "Log once, redact always" holds only on today's request paths

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:25-34; src/worker.ts:28-35
- **Detail**: There are two latent gaps.
  1. **A throw while building the event escapes unredacted.**
     - Building the event reads `name` and the whitelisted properties. If one of them is a throwing getter, that throw escapes the catch unredacted.
     - In `scheduled()`, the same throw would skip the alert and the redacted rethrow.
  2. **An Astro rewrite would log twice.**
     - Astro re-runs the middleware for a rewrite inside `next()` (`node_modules/astro/dist/core/rewrites/handler.js:61`).
     - An error on the rewritten route would then log twice. The outer event would also lack `operation`/`code`, because it sees the already-redacted copy.

  There are no `rewrite(` calls in `src/`, and no error class has getters, so neither happens today.

- **Fix**: Wrap the log call in its own `try {} catch {}` on both entry points. Rethrow an error that is already redacted (tracked in a module-level `WeakSet` in `observability.ts`) as-is, without logging.
- **Decision**: ACCEPTED (orchestrator) — fixed. The log call is wrapped in its own `try/catch` on both entry points. `redactError` records its copies in a module-level `WeakSet` (`isRedacted()`) and returns an already redacted error as-is; the middleware rethrows one without logging. `redactError` also falls back to `UnknownError: [redacted]` if reading the error throws.

### F3 — Grep gate 1.4 can be bypassed by destructuring

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: plan.md:222 (criterion 1.4); src/lib/observability.ts:113
- **Detail**: The gate was met honestly: `message` is never output (see the Privacy answer above). But the destructuring in `redactError` shows that a future `const { message } = error; throw new Error(\`… ${message}\`)` would also pass the gate. So the gate is a weak regression guard. The real guard is the privacy unit test, and that covers only the builders, not new throw sites.
- **Fix**: Treat the grep as a heuristic, not a gate, in future plans. If a hard guard is wanted, add an ESLint `no-restricted-syntax` rule for `.message` reads and `{ message }` destructuring under `src/lib/**` and `src/pages/**`, with `observability.ts` exempt. Or record it as a lesson.
- **Decision**: ACCEPTED as lesson (orchestrator) — no ESLint rule. Recorded in `context/foundation/lessons.md` ("Grep gates are heuristics; privacy tests are the guard").

### F4 — Detail values rely on convention; the older outcome lines skip even the token rule

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/observability.ts:37-48; src/lib/heartbeat.ts:52-60; src/lib/reminders/appointment.ts:83-95
- **Detail**: There are two gaps.
  1. **The token rule passes some personal values.**
     - `errorDetails` reads `code`/`status` from any `Error`, including third-party ones (auth-js `AuthError`, network errors).
     - The token rule would still pass an 11-digit PESEL, a UUID or a slug. The README already states that detail values must be static identifiers (README "Errors and alerts").
  2. **The older outcome lines have no token rule at all.**
     - The heartbeat and appointment-reminder outcome lines still build their own details with `instanceof`.
     - Resend's `body.name` (`resendError`) goes into them unchecked.
     - Resend's names are a fixed documented list, and plan.md:87 deliberately left these lines unchanged.
- **Fix**: In a follow-up, have both outcome lines use `errorName()`/`errorDetails()`, so one rule covers every line.
- **Decision**: ACCEPTED (orchestrator) — fixed in this change rather than a follow-up: the `heartbeat` and `appointment-reminder` `failed` outcome lines use `errorName()`/`errorDetails()`; README bullet updated.

### F5 — `failure-alert.ts` repeats logic that already exists

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/failure-alert.ts:10,16,18
- **Detail**: There are two repeats.
  1. Line 16 re-implements the private `isoTime` from `observability.ts:50`.
  2. `DRY_RUN_RECIPIENT` and the "`REMINDER_TEST_TO`, else the simulator in dry run" fallback repeat `heartbeat.ts:12,76-84`.

  A further side effect: `REMINDER_TEST_TO=""` gives `skipped` even when `EMAIL_DRY_RUN` is on (`??` does not catch an empty string). That is negligible.

- **Fix**: Export `isoTime` from `observability.ts` and use it. Leave the recipient fallback as it is, or extract an `ownerRecipient()` helper when a third caller appears.
- **Decision**: ACCEPTED (orchestrator) — fixed. `isoTime` is exported from `observability.ts` and used in `failure-alert.ts`; the recipient fallback is left as is.

### F6 — Redaction under `astro dev` hides messages and AstroError hints

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/middleware.ts:34
- **Detail**: Under the dev handler, every SSR error now shows as `<Name>: [redacted]` plus frames, and AstroError `title`/`hint`/`loc` are lost.
  - This is deliberate: plan.md:38 and plan-review F3 require redaction on the dev handler too.
  - Astro's handling is unaffected:
    - `routing/handler.js:101-108` always renders 500;
    - the dev handler's `isAstroError` branch (`dev-handler.js:19`) only covers middleware-contract errors raised outside our `try`.
  - The risk is social: debugging pain may tempt someone to weaken the redaction later.
- **Fix**: No change. If needed, put a one-line note in the README's "Errors and alerts" section: during local debugging, read the message from a temporary `console.error` in the page itself, not by bypassing the redaction.
- **Decision**: ACCEPTED (orchestrator) — README note added under "Errors and alerts" (temporary `console.error` in the page, never weaken the redaction).

### F7 — A future switch to Astro's `astro/fetch` handler would change error-layer behaviour

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/middleware.ts:34
- **Detail**:
  - `handleMiddlewareWithErrorFallback` (`node_modules/astro/dist/core/middleware/astro-middleware.js:58`) compares errors by identity: `if (err === nextError) throw err`.
  - The redacted copy breaks that identity, so the 500 would render in a different layer.
  - The Cloudflare adapter's `handle()` uses `app.render` and is not affected today.
- **Fix**: Add a comment at the `redactError` rethrow that the rethrow replaces the error object's identity, so a future handler migration rechecks it.
- **Decision**: ACCEPTED (orchestrator) — comment added at the `redactError` rethrow in `src/middleware.ts` (and a short one in `src/worker.ts`).

## Evidence

- **Plan drift.** Every planned change is a MATCH, including:
  - the six throw-site operation names;
  - the `DatabaseError` shape;
  - the whitelist and regex;
  - the `redactError` contract;
  - the failure-email subject, key and mark-step sentence;
  - the middleware's `/500` handling;
  - the four `failure-alert` outcomes and their log levels;
  - the `scheduled()` job list and the redacted rethrow;
  - every README bullet.

  Unit tests beyond the plan's list (inherited props, `DatabaseError` event shape, email content, `logErrorEvent`) are useful additions. `roadmap.md` changes only F-07's status (`ready` → `in-progress`); the table diff is Prettier re-padding.

- **Automated checks**, re-run during this review:

  | Command                          | Result                     |
  | -------------------------------- | -------------------------- |
  | `npm test`                       | pass, 139 tests in 5 files |
  | `npm run lint`                   | clean                      |
  | `npx astro check`                | 0 errors, 0 warnings       |
  | `npm run build`                  | complete                   |
  | `npx prettier --check README.md` | clean                      |
  | grep gate 1.4                    | no output (exit 1)         |

- **Manual checks.**
  - 2.5–2.8 have recorded output in `phase-2-checks.md`. It covers:
    - the unknown cron;
    - the failing claim, with `step: claim`, `PGRST301`, a `dry-run` alert and no `@`;
    - the SSR throw under both `astro dev` (two redacted Astro lines) and the workerd preview;
    - a normal run.
  - 3.3–3.7 are pending, by design: they are PR-stage production checks.
