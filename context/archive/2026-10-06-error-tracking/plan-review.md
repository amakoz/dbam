<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Error Tracking (F-07) Implementation Plan

- **Plan**: context/changes/error-tracking/plan.md
- **Mode**: Deep
- **Date**: 2026-10-06
- **Verdict**: REVISE
- **Findings**: 0 critical, 4 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

Grounding: 8/8 paths ✓ (`src/middleware.ts`, `src/worker.ts`, `src/lib/consent.ts`, `src/lib/screenings/read.ts`, `src/lib/catalog/read.ts`, `eslint.config.js`, `astro.config.mjs`, `README.md`), 6/6 symbols ✓ (`workerLogsConfig`, `REMINDER_TEST_TO`, `ReminderDatabaseError`, `routePattern`, `sendEmail`, `isDailySendRun`). Line refs match: the six throw sites, `README.md:229/280/281/284` and `astro.config.mjs:54-55`. `eslint.config.js` is cited as 77-80; the config spans 76-80 with `files` at 78. brief↔plan ✓. Progress↔Phase ✓: 1.1–1.5, 2.1–2.8 and 3.1–3.6 match the Success Criteria bullets one to one, and the phase blocks contain no checkboxes. `docs/reference/contract-surfaces.md` is absent, so that check was skipped.

## Verified claims (no finding)

These are recorded so the claims aren't re-checked. The evidence is in `node_modules/astro` 7.3.2 and `@astrojs/cloudflare` 14.3.1.

- **Page and endpoint throws reject `next()` before any Response exists.**
  - `handleMiddleware` has no catch (`core/middleware/astro-middleware.js:10-45`), and `handlePages` rethrows (`core/pages/handler.js:40-43`).
  - Frontmatter is awaited before streaming starts (`runtime/server/render/astro/render.js:201`).
  - The first catch is `core/routing/handler.js:101-108`.
- **`context.routePattern` is exactly `"/500"` during the 500 re-render.**
  - The route string comes from `joinSegments` with no trailing slash (`core/routing/create-manifest.js:678-683`).
  - The re-render uses a fresh `FetchState` with `routeData = errorRouteData` (`core/errors/default-handler.js:65-76`).
  - `500.astro` is not prerendered, so the `prerenderedErrorPageFetch` branch is unused.
- **The `/500` guard does not double-log or miss a 404.**
  - An unmatched route runs the middleware once, with `routePattern` `"/404"` (`routing/handler.js:42-47`).
  - An empty 404 response re-runs the middleware with `"/404"` (`handler.js:126-138`). Only a throw in that second run is logged, so there is still one event.
- **The redacted rethrow breaks no Astro control flow.**
  - Redirects and rewrites return Responses; they do not throw.
  - The only class or name checks (`isAstroError` for NoMatchingStaticPathFound, `MiddlewareNoDataOrNextCalled`) apply to errors thrown outside user middleware.
  - `src/actions` does not exist.
- **The six throw sites are the only PostgREST-message leaks in `src/`.** Callers either have no try/catch (`dashboard.astro`, `profile.astro`, `onboarding.astro`) or use a bare `catch {}` that redirects with `?error=save_failed` (`api/profile.ts`, `api/screenings.ts`), and none reads `.message`.
- **`/cdn-cgi/local/scheduled` works under `astro dev`.** `@cloudflare/vite-plugin` forwards it, and `README.md:251` documents it.
- **An unknown cron fails only the heartbeat.** `isDailySendRun` short-circuits to `false` (`src/lib/schedule.ts:14`), so manual check 2.5's "no failure email" expectation holds.
- **The wrapped body can't skip an un-awaited `return next()`.** `strictTypeChecked` enables `@typescript-eslint/return-await`, so lint flags a `return next()` left inside the try block.

## Findings

### F1 — Health data already reaches Workers Logs via invocation-log URLs, and the README will say it doesn't

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment / Blind Spots
- **Location**: Desired End State; Phase 3 §1 "Privacy rule"; What We're NOT Doing ("no `wrangler.jsonc` observability change")
- **Detail**:
  - **The leak.** `wrangler.jsonc` has `observability.enabled: true`, so invocation logs are on (research.md §3: "each request emits 1 invocation log"). An invocation log records the request URL.
  - `/api/screenings` redirects to `/dashboard?saved=<intent>&slug=<slug>` (`src/pages/api/screenings.ts:49`), and on failure to `/dashboard?error=<code>&slug=<slug>` (`:42`). The follow-up GET's URL therefore names the screening a user just planned or marked done, for example `slug=mammography`, and that is health data.
  - **The join key.** The plan's SSR event uses `requestId = cf-ray = $metadata.rayId`, which is exactly the key that joins an error to that invocation record.
  - **The gap.** The plan only covers what our code logs, yet the brief's success summary ("no log line carries … health data") and the README "Privacy rule" read as a guarantee about Workers Logs as a whole.
  - **Not verified.** I did not confirm in production that the invocation log keeps the query string, though Cloudflare's `$workers.event.request.url` is documented as the full URL.
- **Fix A ⭐ Recommended**: Scope the claim honestly and track the leak.
  - Write the README privacy rule as "our `error`/`failure-alert` events never carry …". Add a "Known gaps" bullet: invocation logs record request URLs, and `/dashboard?…&slug=` names a screening.
  - Add a PR manual check: confirm whether `$workers.event.request.url` includes the query string.
  - Open a follow-up roadmap item to move `slug` out of the redirect query, for example to a flash cookie or a fragment read client-side.
  - Strength: no scope creep into dashboard UX; F-07's own events stay clean; the gap is recorded, not hidden.
  - Tradeoff: health data stays in 3-to-7-day logs until the follow-up ships.
  - Confidence: HIGH — the redirect code is unambiguous; only the exact URL field is unverified.
  - Blind spot: whether the PRD's privacy NFR (and DPIA) tolerates this interim state.
- **Fix B**: Close it in this change.
  - Drop `slug` from the redirect query, or set `observability.logs.invocation_logs: false` in `wrangler.jsonc`.
  - Strength: the "never health data in logs" outcome becomes true now.
  - Tradeoff:
    - Dropping the slug changes the dashboard confirmation flow (`dashboard.astro:92-99` reads `slug` server-side) and the smoke test, which is scope creep.
    - Disabling invocation logs loses `$workers.outcome`, request metadata and the `rayId` correlation the plan relies on (research.md §3).
  - Confidence: MED — either variant needs its own design pass.
  - Blind spot: the auth callback's `?code=` and other query params were not audited.
- **Decision**: FIX A — orchestrator, 2026-10-06. The README privacy rule is scoped to our own `error`/`failure-alert` events, with a Known gaps bullet for invocation-log URLs (`/dashboard?…&slug=`). PR manual check 3.7 asks whether `$workers.event.request.url` keeps the query string. The follow-up is recorded in `follow-ups/redirect-slug-leak.md` (move `slug` out of the redirect query; audit other params such as the auth callback's `?code=`) for the PR body. Roadmap slices are not edited; the owner decides on a slice.

### F2 — The `/500` guard skips redaction as well as logging, so a second-run error leaks unredacted

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details ("Middleware runs twice on an error"); Phase 2 §1 contract ("When `context.routePattern === "/500"`, the body runs without the catch")
- **Detail**:
  - **What the re-run does.** On the 500 re-render the middleware body runs again in full. It calls `createClient` and `supabase.auth.getUser()` a second time, and applies `PROTECTED_ROUTES` against the original `context.url`.
  - **The failure path.** `getUser()` throws on any non-AuthError, such as a storage or lock failure (`auth-js GoTrueClient.js:2724`). When the first failure came from that shared dependency, the second run throws too, and with the plan's guard it throws the raw error.
    - **Production:** `default-handler.js:90-100` swallows it, retries without middleware, and logs nothing. That is safe, but the custom 500 page then renders without `locals.locale` (`500.astro` reads `Astro.locals.locale`).
    - **Dev:** `errors/dev-handler.js:61-74` re-renders with that error and logs its `error.stack` (`:55-58`), so raw message text appears in the local console. That includes the manual 2.7 run, if the middleware is what fails.
  - **The consequence.** The guard is correct for logging, since it gives exactly one event (see "Verified claims"). Its redaction half is missing: the invariant "every error Astro sees from our middleware is redacted" does not hold on the second run.
- **Fix**: On `/500`, keep a catch that rethrows `redactError(error)` without calling `logErrorEvent`. Off `/500`, log and redact as planned.
  - Make the contract read: "exactly one `logErrorEvent` per request; every rethrow is redacted, including on `/500`".
  - Document in Critical Implementation Details that the second run re-calls `getUser()` and evaluates the protected-route redirect against the original path. Both are pre-existing; leave them unchanged.
  - Strength: a single rule, "redact always, log once", that holds on every Astro error path, dev included.
  - Tradeoff: a few more lines in the middleware.
  - Confidence: HIGH — the dev-handler and default-handler paths were traced line by line.
  - Blind spot: none significant.
- **Decision**: ACCEPT — orchestrator, 2026-10-06. On `/500` the middleware keeps a catch that rethrows `redactError(error)` without logging. Contract: exactly one `logErrorEvent` per request; every rethrow is redacted.

### F3 — Manual SSR check runs only Astro's dev error handler, and its expectation is off

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 2 Manual Verification, the third bullet / Progress 2.7
- **Detail**:
  - **Wrong handler.** `astro dev` runs a `DevFacadeApp` with `errorStrategy: "dev"`. The 500 re-render therefore goes through `core/errors/dev-handler.js`, not the production `default-handler.js` that the plan's double-run reasoning cites (`:72-105`). Check 2.7 never exercises the production path the guard was designed for.
  - **Wrong expectation.** In dev, Astro logs the error twice: once at `routing/handler.js:102` and again at `dev-handler.js:55-58`. Both lines are redacted, so "Astro's error line shows `[redacted]`" should read "every Astro error line".
  - **No throw site under preview.** `/dev/kitchen-sink` returns 404 when `import.meta.env.PROD` is set (`kitchen-sink.astro:39`), so the same temporary throw can't be reused under `npm run preview`.
- **Fix**: Change 2.7 as follows.
  1. Expect "exactly one `ssr` event, and every Astro error line shows `[redacted]` with no address".
  2. Add a run against `npm run build && npm run preview -- --port $DBAM_PORT` (the production handler on workerd). Use a temporary throw in a production-built page, such as the frontmatter of `src/pages/index.astro`, reverted and not committed.
  - Strength: proves the guard and the redaction on the code path production actually runs.
  - Tradeoff: one extra build and preview cycle.
  - Confidence: HIGH — the dev and production handler split is explicit in `vite-plugin-app/index.js:25` and `environment/dev-nonrunnable.js:147`.
  - Blind spot: none significant.
- **Decision**: ACCEPT — orchestrator, 2026-10-06. Check 2.7 now expects exactly one `ssr` event, with every Astro error line `[redacted]`, under both `astro dev` (kitchen-sink throw) and `npm run build && npm run preview` (temporary throw in `src/pages/index.astro`), reverted.

### F4 — Redaction and whitelist leave small gaps in the "no free text" invariant

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §3 (`ErrorEvent`, `redactError`) and §4 tests
- **Detail**:
  - **(a) The error name is unchecked.** The `error` field is `error.name` with no token check. An `Error` subclass or a library can set `name` to arbitrary text, and the plan's tests pin only the detail keys.
  - **(b) The frame filter can keep message text.** It keeps every stack line that starts with whitespace plus `at `, so a multi-line message whose later line reads `    at jan@…` survives into the redacted stack.
  - **(c) The token rule doesn't stop health data.** A catalog slug such as `mammography` passes it, so the health-data half of the guarantee rests on the key whitelist and on authors never putting user-derived values into `operation`, `code` or `step`.
- **Fix**:
  - Apply the token rule to `name`, falling back to `"UnknownError"`.
  - In `redactError`, cut the exact `${name}: ${message}` prefix from `stack` before filtering frames. When `stack` doesn't start with that prefix, emit the header only, with no frames.
  - Add a unit case for each of (a) and (b).
  - State (c) in the README privacy rule: detail values must be static identifiers, never row or user values.
- **Decision**: ACCEPT — orchestrator, 2026-10-06. The token rule applies to `name` (fallback `UnknownError`). `redactError` cuts the exact `name: message` prefix before filtering frames, and emits the header only when the prefix doesn't match. There are unit cases for both. The README states that detail values must be static identifiers.

### F5 — Success criterion 1.4 errors in zsh and isn't pass/fail

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 Automated Verification / Progress 1.4
- **Detail**:
  - The command as written errors in zsh. `grep -rn 'error\.message' src --include=*.ts --include=*.astro` fails with "no matches found", because zsh expands the unquoted globs and this worker's shell is zsh.
  - Even when it runs, "returns no throw sites" needs judgment. The sub-agent found no other `error.message` use in `src/`, so after the change the grep should return nothing at all.
- **Fix**: Make 1.4 `grep -rn 'error\.message' src --include='*.ts' --include='*.astro'` "returns no output".
- **Decision**: ACCEPT — orchestrator, 2026-10-06. 1.4 is now `grep -rn 'error\.message' src --include='*.ts' --include='*.astro'` and "returns no output".

### F6 — `ErrorEvent` type name shadows the Workers global

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 §3 contract (`ErrorEvent`)
- **Detail**: `worker-configuration.d.ts:1491` declares a global `class ErrorEvent extends Event`. A module-level `ErrorEvent` type is legal, but it shadows that global in every importer (`middleware.ts`, `worker.ts`, `failure-alert.ts`) and is confusing to read.
- **Fix**: Name it `ErrorLogEvent`, or `ObservedErrorEvent`.
- **Decision**: ACCEPT — orchestrator, 2026-10-06. The type is renamed `ErrorLogEvent`.
