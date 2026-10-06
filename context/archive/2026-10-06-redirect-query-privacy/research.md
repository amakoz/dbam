---
date: 2026-10-06T18:15:09+0200
researcher: Claude (Opus 5.5, Dbam worker)
git_commit: 980ddf7
branch: feat/redirect-query-privacy
repository: 10xdevs (Dbam)
topic: "Which request URLs carry user-derived health data into Workers Logs, and how to move the screening slug out of them"
tags: [research, codebase, privacy, observability, api-screenings, dashboard, smoke]
status: complete
last_updated: 2026-10-06
last_updated_by: Claude (Opus 5.5, Dbam worker)
---

# Research: user-derived data in request URLs (Workers Logs)

**Date**: 2026-10-06T18:15:09+0200
**Researcher**: Claude (Opus 5.5, Dbam worker)
**Git Commit**: 980ddf7
**Branch**: feat/redirect-query-privacy
**Repository**: 10xdevs (Dbam)

## Research Question

F-09 / backlog B-01: no user-derived health data may reach Cloudflare Workers Logs through request URLs. (1) Where does
`/api/screenings` put the screening slug in a URL, and who reads it? (2) Which other query params carry user-derived
values (auth callback `?code=`, `profile.astro` `?reminders=`, any other redirect)? (3) Which of the two proposed fixes
(short-lived `HttpOnly` flash cookie, or the URL fragment read client-side) fits the codebase, keeping the dashboard
confirmation behaviour, updating `scripts/smoke.mjs`, and leaving invocation logs on?

Scope inspected: every `redirect(`, `searchParams` and `?<name>=` hit under `src/` and `scripts/` (one grep, results
below), plus `wrangler.jsonc`, the dashboard row components, `LanguageSwitcher.astro`, `scripts/smoke.mjs`,
`scripts/ui-shots.mjs`, Astro 7.3.2's cookie implementation in `node_modules`, and Cloudflare's redaction docs.
No sub-agents: the grep located every site, so the sweep stayed in context.

## Summary

- **One redirect family carries health data in the query string:** `/api/screenings` sends
  `/dashboard?error=<code>&slug=<slug>#screening-<slug>` (`src/pages/api/screenings.ts:42`) and
  `/dashboard?saved=<intent>&slug=<slug>#screening-<slug>` (`:49`). The only server-side reader of `slug` is
  `src/pages/dashboard.astro:92`, which uses it to place the confirmation, the error and the invalid-field marking on the
  right row (`:99-119`). `LanguageSwitcher.astro:15` already strips `saved`, `error` and `slug` from its `next` value.
- **Cloudflare's URL redaction does not cover slugs.** The documented rules redact a URL substring only if it is a hex ID
  (32+ hex digits, only hex and `+-_`) or a base-64 ID (21+ chars with at least 2 uppercase, 2 lowercase, 2 digits)
  ([Tail handler docs](https://developers.cloudflare.com/workers/runtime-apis/handlers/tail/)). Slugs match
  `^[a-z0-9-]+$` (`src/lib/screenings/rules.ts:25`): no uppercase, so never base-64; and catalog slugs such as
  `mammography-nfz-program` contain non-hex letters, so not hex. The same docs redact the `Cookie`/`Set-Cookie` header
  values by name.
- **Other user-derived query values (all inspected redirects):** the auth callback's `?code=` (a Supabase PKCE code, not
  health data, outside our control); `/profile?reminders=on|off` (`src/pages/api/reminders.ts:42`, a notification
  preference, not health data); everything else is a static code or flag (`?error=<code>`, `?saved=<intent>`,
  `?saved=1`, `?withdrawn=1`, `?confirmed=1`). Auth `?error=` values go through `authErrorCode()` before encoding
  (`src/pages/api/auth/signin.ts:21`, `signup.ts:30`).
- **Recommended fix: the flash cookie, slug only.** The app has no client `<script>` and no island on the dashboard (grep
  for `<script` under `src/` returns nothing), and the row's error state is rendered server-side (`<details open>`,
  `aria-invalid`, `aria-describedby` in `src/components/recommendations/ScreeningActions.astro:36-41,60-66,87-113`). A
  fragment-only fix would need the first client script in the app and would have to re-create that state in the
  browser, and it would lose it without JavaScript. A cookie keeps `dashboard.astro`'s logic as is, with only the
  source of `slugParam` changing.
- **Smoke and ui-shots impact is small:** one smoke step asserts the full location with `&slug=` (`scripts/smoke.mjs:173`)
  and one GETs `/dashboard?saved=plan&slug=…` (`:209`); the other screenings steps and `scripts/ui-shots.mjs:257,264`
  match by prefix (`smoke.mjs:384-387`, `ui-shots.mjs:222-223`), so they keep passing if `saved`/`error` stay in the
  query.

## Detailed Findings

### 1. `/api/screenings` → `/dashboard` (health data)

- `fail(code)` builds `/dashboard?error=${code}&slug=${slug}#screening-${slug}` when the posted slug passes
  `SLUG_PATTERN`, else `/dashboard?error=${code}` (`src/pages/api/screenings.ts:38-42`).
- `succeed(saved)` builds `/dashboard?saved=${intent}&slug=${saved}#screening-${saved}` (`:49`); it is called for
  `unplan`/`undone` (`:57`), `confirm` (`:78`), `plan` (`:130`) and `done` (`:150`).
- Two redirects already carry the slug only in the fragment: the stale-confirm case `/dashboard#screening-${slug}` (`:81`).
  Line `:29` (`?error=invalid_request`) and the `/onboarding`/`/auth/signin` redirects carry no slug.
- Reader: `dashboard.astro:92` `Astro.url.searchParams.get("slug")`, accepted only if it names a row on the page
  (`:94-99`); `saved` (`:101`) and `error` (`:113`) are mapped through fixed tables (`SAVED_KEYS`, `errorMessageKey`).
  With no matching row the message falls back to the page level (`pageSaved` `:110`, `pageError` `:116`). The comment at
  `:77-79` documents the query contract and needs updating with the fix.
- Row props: `errorFor`, `invalidFieldFor`, `savedFor` feed `PlanItem`/`RecommendationItem`/`DoneItem`
  (`dashboard.astro:183-185,221-223,244`), which pass `error`, `invalidField` and `open` to `ScreeningActions.astro`
  (`:22-27,32`).
- The fragment is not sent to the server and is not part of a `Referer` header, so `#screening-<slug>` can stay for the
  scroll target.
- Inference (not verified in production): while a page URL holds `&slug=`, later same-origin requests from that page
  (form POSTs) also carry it in `Referer` under the default `strict-origin-when-cross-origin` policy, and `Referer` is not
  a redacted header name. Removing the slug from the URL removes this path too.

### 2. Other query params (audit)

| Site                                                                                        | Value                           | User-derived?                   | Verdict                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/pages/api/auth/callback.ts:7-9` (inbound)                                              | `?code=`, `?error_description=` | credential-like / Supabase text | Not health data. The URL shape is set by Supabase's `emailRedirectTo`, so it cannot move. The code is single-use and needs the PKCE verifier cookie. Inference: GoTrue issues UUID codes (32 hex digits), which the hex-ID rule would redact, if Workers Logs applies the tail redaction rules (unverified). |
| `src/pages/api/reminders.ts:42` → `profile.astro:49`                                        | `?reminders=on\|off`            | yes (a preference)              | Not health data (not GDPR Art. 9); keep, record as an accepted value.                                                                                                                                                                                                                                        |
| `src/pages/api/consent/withdraw.ts:32` → `onboarding.astro:35`                              | `?withdrawn=1`                  | static flag                     | Fine.                                                                                                                                                                                                                                                                                                        |
| `callback.ts:27` → `signin.astro:20`                                                        | `?confirmed=1`                  | static flag                     | Fine.                                                                                                                                                                                                                                                                                                        |
| `src/pages/api/profile.ts:10`                                                               | `?saved=1`                      | static flag                     | Fine.                                                                                                                                                                                                                                                                                                        |
| `api/auth/signin.ts:21`, `api/auth/signup.ts:30`                                            | `?error=<authErrorCode(error)>` | mapped code                     | Fine: mapped by `src/lib/auth-errors.ts`, never raw text.                                                                                                                                                                                                                                                    |
| `api/consent/*`, `api/profile.ts`, `api/reminders.ts`, `api/screenings.ts:29`, `api/auth/*` | `?error=<literal>`              | static code                     | Fine.                                                                                                                                                                                                                                                                                                        |
| `src/pages/api/locale.ts:27` (`next` from `LanguageSwitcher.astro:14-17`)                   | current path + query            | copies the page's query         | The switcher drops `saved`, `error`, `slug` (`:15`); `next` itself travels in the POST body, which is not in the URL. After the fix the `slug` deletion is harmless and can stay.                                                                                                                            |

Code-side logging: our own `console.*` calls (`src/lib/heartbeat.ts:80`, `email.ts:50,77`, `observability.ts:189`,
`failure-alert.ts`, `supabase.ts:31`, `catalog/read.ts:23`) log no request URL; F-07's error event logs
`context.routePattern` (`src/middleware.ts:27-32`), not the URL. `catalog/read.ts:23` logs a catalog slug for an invalid
catalog row, which is catalog data, not user-derived.

### 3. What Workers Logs records

- `wrangler.jsonc:12-14`: `observability.enabled: true`, no `logs` block, so invocation logs are on (default). The
  constraint keeps them on: `invocation_logs = false` would drop the `$workers.outcome` and `rayId` correlation F-07
  uses (`context/archive/2026-10-06-error-tracking/follow-ups/redirect-slug-leak.md`, step 4).
- Cloudflare: an invocation log "contains details such as the Request, Response, and related metadata"
  ([Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)); the blog says sensitive
  URLs and headers such as `Authorization` and `Cookie` are redacted
  ([Introducing Workers dashboard logs](https://blog.cloudflare.com/introducing-workers-dashboard-logs)). The exact
  rules are documented for tail events (above). Whether Workers Logs applies the identical rules is not stated on the
  Workers Logs page; B-01's manual check (does `$workers.event.request.url` keep the query?) is still open. The fix is
  needed whichever way it resolves, because slugs are not redacted by either documented rule.

### 4. Fix options against the codebase

**A. Flash cookie (recommended).**

- Set in `/api/screenings` (`fail`/`succeed`) with `context.cookies.set(name, slug, { path: "/dashboard", httpOnly: true,
sameSite: "lax", secure: <https>, maxAge: <short, e.g. 60> })`; read and delete in `dashboard.astro` before render
  (`Astro.cookies.get`/`delete` with the same `path`). Precedent for `context.cookies.set` with options:
  `src/pages/api/locale.ts:24`, `src/lib/supabase.ts:47`.
- The slug stays validated twice: `SLUG_PATTERN` before setting (`screenings.ts:40`) and the `itemSlugs` check when read
  (`dashboard.astro:99`), so a forged cookie can only pick a row the page already shows.
- `saved=<intent>` and `error=<code>` can stay in the query: they are static codes, match the `CLAUDE.md` redirect shape
  ("`?error=<code>`"), keep the refresh behaviour of the page-level message, and keep every prefix-based smoke and
  ui-shots assertion valid. Planning choice (see Open Questions).
- A failure redirect without a valid slug (`screenings.ts:42`, else branch) should clear any stale flash cookie, or the
  dashboard should ignore a cookie when neither `saved` nor `error` is present; otherwise a leftover slug could pin a later
  page-level message to an old row.
- Astro 7.3.2 `cookies.delete()` emits `Expires=Thu, 01 Jan 1970…` with `maxAge` unset
  (`node_modules/astro/dist/core/cookies/cookies.js:46-58`), value `deleted`. The smoke cookie jar removes a cookie only
  on `max-age=0` (`scripts/smoke.mjs:35-42`), so after a delete the jar keeps `<name>=deleted`. That value fails the
  `itemSlugs` check, so it is harmless, but the plan should either teach the jar about past `Expires` or clear with
  `cookies.set(name, "", { maxAge: 0, path })`.
- `Cookie`/`Set-Cookie` values are redacted by header name in the documented rules, and Supabase's session cookies already
  travel the same way, so this adds no new log exposure class.

**B. Fragment only.**

- `/dashboard?saved=<intent>#screening-<slug>`: the server no longer knows the row, so it renders the page-level message
  (`dashboard.astro:110,116`) and a script would move it to the row, open the `<details>`, and set `aria-invalid` /
  `aria-describedby` on the invalid field. No client script exists in the app today (no `<script` under `src/`), and no
  island hydrates on the dashboard; without JavaScript the row-level feedback is lost. This changes the confirmation
  behaviour that the constraint asks to keep, so it is the weaker option.

### 5. Tests and docs that change

- `scripts/smoke.mjs:173`: full-location assertion including `&slug=` → expect `/dashboard?saved=plan#screening-…` (or
  just the prefix) plus a check that the response sets the flash cookie.
- `scripts/smoke.mjs:209`: GETs `/dashboard?saved=plan&slug=${mammography}` to assert `data-saved="success"` on the row.
  With a cookie the confirmation must be asserted on the first `/dashboard` GET after the POST; today steps `:176-184`
  and `:186` GET `/dashboard` between the POST (`:170`) and this check, and the first of them would consume the flash.
  The plan reorders: the row-confirmation check comes right after the plan step, and a second GET asserts it is gone.
- `scripts/ui-shots.mjs:257,264`: prefix `/dashboard?saved=plan` / `?saved=done` (`:222-223` compares path plus prefix),
  so no change if `saved` stays in the query.
- Unit tests: the redirect builders are inline closures in an `APIRoute`; extracting them into a pure helper (for example
  in `src/lib/screenings/`) would let a Vitest case assert that no built location contains the slug, in line with the
  lesson "Grep gates are heuristics; privacy tests are the guard" (`context/foundation/lessons.md`).
- Docs: `README.md:352` (Known gaps) describes this leak and points to the pre-archive path
  `context/changes/error-tracking/…`; update it when fixed. `dashboard.astro:77-79` and `screenings.ts:38,48` comments
  describe the query contract.

## Code References

- `src/pages/api/screenings.ts:38-49` - slug validation and the `fail`/`succeed` redirect builders
- `src/pages/api/screenings.ts:81` - stale-confirm redirect, slug in fragment only
- `src/pages/dashboard.astro:77-119` - query contract and row placement of saved/error/invalid field
- `src/components/recommendations/ScreeningActions.astro:22-41,60-66` - server-rendered error/open/aria state
- `src/components/LanguageSwitcher.astro:12-17` - strips `saved`, `error`, `slug` from `next`
- `src/pages/api/auth/callback.ts:6-30` - PKCE `?code=` inbound URL
- `src/pages/api/reminders.ts:42`, `src/pages/profile.astro:48-49` - `?reminders=on|off`
- `src/lib/screenings/rules.ts:25` - `SLUG_PATTERN = /^[a-z0-9-]+$/`
- `wrangler.jsonc:12-14` - observability on, invocation logs default
- `scripts/smoke.mjs:31-57,173,209,384-387` - cookie jar, slug assertions, prefix matching
- `scripts/ui-shots.mjs:214-224,257,264` - prefix-matched screening steps
- `node_modules/astro/dist/core/cookies/cookies.js:46-58` - `delete()` uses `Expires`, not `Max-Age`
- `README.md:352` - Known gaps entry for this leak

## Architecture Insights

- Feedback after a form POST is a redirect with static codes in the query (`CLAUDE.md` hard rule; `src/lib/errors.ts:3`),
  read by the page in frontmatter. The slug is the one place where a row identifier was added to that contract (S-03).
  Keeping codes in the query and moving only the row identifier to a cookie preserves the convention.
- The app is server-rendered forms without client scripts (`<details>`-based panels, native controls per `CLAUDE.md` UI
  rules), which is why a server-side carrier (cookie) fits better than a client-side one (fragment).

## Historical Context (from prior changes)

- `context/archive/2026-10-06-error-tracking/follow-ups/redirect-slug-leak.md` - source of this change. Claims checked:
  `screenings.ts:42,49` locations: supported. `dashboard.astro:92` reads slug: supported. `callback.ts:8` `?code=`:
  supported (`:8`). "`?error=` and `?saved=` codes are static identifiers": supported for every inspected redirect.
  Open item "does `$workers.event.request.url` keep the query string": still open (backlog B-01 → F-09).
- `context/foundation/backlog.md` B-01 (moved to F-09 on 2026-10-06) and `context/foundation/roadmap.md` F-09.
- `context/foundation/lessons.md` "Grep gates are heuristics; privacy tests are the guard" - applies to the success
  criterion for this change.

## Related Research

- `context/archive/2026-10-06-error-tracking/research.md` - Workers Logs limits and the event schema (not re-read here).

## Open Questions

1. **Carrier:** flash cookie (recommended, evidence above) or URL fragment. Product/owner choice for `/10x-plan`.
2. **What moves:** slug only (recommended: codes stay static in the query, smoke/ui-shots prefixes hold), or slug plus
   `saved`/`error` into the cookie (a refresh would then drop the message).
3. **`?reminders=on|off`:** keep as a non-health preference (recommended) or move into the same flash mechanism.
4. **`?code=`:** accept as residual (single-use PKCE code, Supabase-controlled URL, likely redacted as a hex ID) - no code
   change recommended; record the decision.
5. **Unverified:** whether Workers Logs keeps the query string and applies the tail redaction rules (B-01 human check,
   F-07 Progress 3.7). Does not block the fix.
