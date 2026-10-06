# Follow-up: health data in Cloudflare invocation-log URLs

> Raised by: plan review of `error-tracking` (F-07), finding F1, 2026-10-06. Not fixed in F-07; the owner decides whether it becomes a roadmap slice.

## Observation

`wrangler.jsonc` has `observability.enabled: true`, so Workers Logs keeps one invocation log per request, and that log records the request URL (`$workers.event.request.url`). Several redirects put user-derived values in the query string. The browser then requests those URLs, so the values land in Workers Logs for the retention window: 3 days on the Free plan today, 7 days from 2026-12-01.

- **Screening slug (health data).** `/api/screenings` redirects to `/dashboard?saved=<intent>&slug=<slug>#screening-<slug>` on success (`src/pages/api/screenings.ts:49`). On failure it redirects to `/dashboard?error=<code>&slug=<slug>#screening-<slug>` (`:42`). The `slug` names the screening a user just planned or marked done, for example `mammography`. The `#fragment` is never sent to the server; the query string is.
- `src/pages/dashboard.astro:92` reads `slug` server-side to place the confirmation on the right row.

F-07's own `error` and `failure-alert` events do not carry this. The leak is in Cloudflare's invocation log, which our code does not write. A single SSR `error` event's `requestId` (`cf-ray` = `$metadata.rayId`) joins to that invocation record.

## Proposed fix

1. Move `slug` out of the redirect query. Options:
   - **A short-lived flash cookie** (`HttpOnly`, `SameSite=Lax`, read and cleared by `/dashboard`).
   - **The URL fragment alone** (`#screening-<slug>`), read client-side to place the confirmation. The fragment already carries the slug, so this needs only a small island or script on the dashboard.
2. Update `scripts/smoke.mjs` expectations that assert the `slug` query.
3. Audit every other query param that can carry user-derived data:
   - The auth callback's `?code=` (`src/pages/api/auth/callback.ts:8`). This is a one-time PKCE code, not health data, but it is a credential-like value in logs.
   - `?error=` and `?saved=` codes are static identifiers and are fine.
   - `profile.astro`'s `?reminders=`.
   - Any future redirect.
4. Decide whether `observability.logs.invocation_logs: false` is worth it as a stopgap. Turning it off loses `$workers.outcome`, request metadata and the `rayId` correlation F-07 relies on, so it is not recommended unless the fix above is delayed.

## Open

- [ ] Does `$workers.event.request.url` keep the query string? This is checked in production Workers Logs at F-07's PR stage (plan.md Progress 3.7). Answer: _pending_.
