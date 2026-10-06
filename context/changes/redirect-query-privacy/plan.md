# Redirect Query Privacy Implementation Plan

## Overview

F-09 (backlog B-01): `/api/screenings` stops putting the screening slug, which is health data, in the `/dashboard` redirect query. Cloudflare Workers Logs records request URLs. A short-lived `HttpOnly` flash cookie carries the slug instead, and the dashboard reads and clears it. The `saved`/`error` codes stay in the query, and the dashboard's row confirmation, row error and invalid-field marking stay identical.

## Current State Analysis

- `src/pages/api/screenings.ts:41-42` (`fail`) and `:49` (`succeed`) redirect to `/dashboard?error=<code>&slug=<slug>#screening-<slug>` and `/dashboard?saved=<intent>&slug=<slug>#screening-<slug>`. `:29` (`?error=invalid_request`) and `:81` (`/dashboard#screening-<slug>`) carry no slug in the query.
- `src/pages/dashboard.astro:92` reads `slug` from the query. `:99` accepts it only when it names a row on the page. `:109-119` give `saved`/`error`/`invalidField` to that row only while `saved` or `error` is present, and otherwise fall back to the page-level alert (`:110,116`). This gating stays as is; only the source of the slug changes.
- Row state is server-rendered: `ScreeningActions.astro` sets `<details open>`, `aria-invalid` and `aria-describedby` (`:36-41,60-66,87-113`). The app has no client `<script>`.
- Cloudflare's documented URL redaction (hex/base-64 IDs) doesn't match slugs (`SLUG_PATTERN = /^[a-z0-9-]+$/`, `src/lib/screenings/rules.ts:25`). The `Cookie`/`Set-Cookie` header values are redacted by name (research §1, §3).
- Smoke: `scripts/smoke.mjs:173` asserts the full location with `&slug=`. `:209` GETs `/dashboard?saved=plan&slug=…` to check the row confirmation. Other screenings steps and `scripts/ui-shots.mjs:257,264` match by prefix (`smoke.mjs:384-387`, `ui-shots.mjs:222-223`). The smoke cookie jar drops a cookie only on `max-age=0` (`smoke.mjs:35-42`).
- Astro 7.3.2 `cookies.delete()` emits `Expires=1970` with no `Max-Age` (`node_modules/astro/dist/core/cookies/cookies.js:46-58`).

## Desired End State

No `/api/screenings` redirect carries a slug outside the URL fragment: locations are `/dashboard?saved=<intent>#screening-<slug>`, `/dashboard?error=<code>#screening-<slug>`, or `/dashboard?error=<code>`. The redirect sets a `screening_flash` cookie (`HttpOnly`, `SameSite=Lax`, `Path=/dashboard`, `Max-Age=60`, `Secure` on https) holding the slug, or clears it when there is none. The next `/dashboard` render reads it, validates it, clears it, and places the confirmation or error on that row exactly as the query did before. A refresh still shows the page-level message from the query, but no longer the row placement. Unit tests prove that no built location carries the slug outside the fragment, and smoke checks the row confirmation and row error through the cookie.

### Key Discoveries:

- Single reader of the slug: `src/pages/dashboard.astro:92`. Single writer: the two closures in `src/pages/api/screenings.ts:41-49`.
- Cookie-setting precedent with options: `src/pages/api/locale.ts:24`.
- `LanguageSwitcher.astro:15` strips `saved`, `error`, `slug` from its `next` value; `slug` no longer appears in URLs.
- Lesson "Grep gates are heuristics; privacy tests are the guard" (`context/foundation/lessons.md`): the gate is a unit test that feeds slugs through the location builder, not a grep.

## What We're NOT Doing

- Not moving `saved`/`error` codes out of the query (static, non-health; they keep the `CLAUDE.md` redirect shape and the smoke/ui-shots prefixes).
- Not changing `?reminders=on|off` (`src/pages/api/reminders.ts:42`): a preference, not health data.
- Not changing the auth callback's `?code=` (`src/pages/api/auth/callback.ts`): a single-use PKCE code whose URL shape Supabase sets; accepted as residual.
- Not turning off invocation logs (`wrangler.jsonc` stays as is): F-07 relies on `$workers.outcome` and the `rayId` join.
- Not verifying whether Workers Logs keeps the query string (B-01 human check, does not block).
- Not adding client-side JavaScript or a URL-fragment reader.
- No roadmap status change (worker protocol; `/10x-archive` sets `done`).

## Implementation Approach

A small pure module next to the screening rules owns the cookie contract (name, options, validation) and the dashboard location builder. The endpoint and the page both use it, so set and clear always share the same `Path`, and the privacy property is unit-tested in one place. The endpoint sets or clears the cookie on every redirect it makes to `/dashboard`. The page reads the cookie, clears it when present, and uses its value where it used `slugParam`.

## Critical Implementation Details

- **Clearing:** clear with `cookies.set(FLASH_COOKIE, "", { ...options, maxAge: 0 })` from the helper, not `cookies.delete()`. The path must match `/dashboard` or the browser keeps the cookie, and `Max-Age=0` is what the smoke jar recognises. Clear on every `/dashboard` render that received the cookie, even when there's no `saved`/`error` in the query, so a stale slug never pins a later message to an old row.
- **Smoke ordering:** the first `GET /dashboard` after the POST consumes the flash. The row-confirmation check has to be the step right after "plan with a date is saved", ahead of the existing `GET /dashboard` steps.

## Phase 1: Flash cookie carries the slug

### Overview

Add the helper with unit tests, switch the endpoint and the dashboard to it, and update smoke.

### Changes Required:

#### 1. Flash helper

**File**: `src/lib/screenings/flash.ts` (new)

**Intent**: One home for the slug's carrier: cookie name, cookie options, reading a cookie value back to a valid slug, and building the dashboard redirect location without the slug in the query.

**Contract**: exports

- `FLASH_COOKIE = "screening_flash"`;
- `flashCookieOptions(secure: boolean)` → `{ path: "/dashboard", httpOnly: true, sameSite: "lax", secure, maxAge: 60 }`, typed as Astro's `AstroCookieSetOptions`;
- `clearedFlashCookieOptions(secure: boolean)` → the same with `maxAge: 0`;
- `readFlashSlug(value: string | undefined): string | null` → the value when it matches `SLUG_PATTERN` (import from `./rules`), else `null`;
- `dashboardLocation(feedback: { saved: string } | { error: string }, slug: string | null): string` → `/dashboard?saved=<v>` or `/dashboard?error=<v>`, plus `#screening-<slug>` when `slug` is set.

The slug never appears before `#`. The module is pure; it takes no `AstroCookies`.

#### 2. Unit tests

**File**: `src/lib/screenings/flash.test.ts` (new)

**Intent**: The privacy gate. It proves the builder keeps slugs out of the path and query, and pins the cookie contract.

**Contract**: cases:

- (a) for `saved` and `error` feedback with a slug (several real catalog slugs, e.g. `mammography-nfz-program`), the part of `dashboardLocation(...)` before `#` contains neither the slug nor `slug=`, and the fragment is `screening-<slug>`;
- (b) with `slug: null` there is no fragment;
- (c) `flashCookieOptions(true/false)` has `httpOnly: true`, `sameSite: "lax"`, `path: "/dashboard"`, `maxAge: 60`, and `secure` as passed;
- (d) `clearedFlashCookieOptions` matches it except `maxAge: 0`;
- (e) `readFlashSlug` accepts a valid slug and rejects `undefined`, `""`, uppercase, `../x`, `a b` and `a&b`. A pattern-valid value that names no row (for example `deleted`) is the dashboard's `itemSlugs` check's job, not this function's.

#### 3. Endpoint

**File**: `src/pages/api/screenings.ts`

**Intent**: `fail` and `succeed` redirect through `dashboardLocation`. Each one sets the flash cookie when the slug is known, and clears it otherwise. The early `?error=invalid_request` at `:29` and the stale-confirm redirect at `:81` also clear it. Update the comments at `:38` and `:48`.

**Contract**: locations are as in Desired End State. `Secure` is `context.url.protocol === "https:"`. `/onboarding` and `/auth/signin` redirects are untouched.

#### 4. Dashboard

**File**: `src/pages/dashboard.astro`

**Intent**: Replace `Astro.url.searchParams.get("slug")` (`:92`) with `readFlashSlug(Astro.cookies.get(FLASH_COOKIE)?.value)`, and clear the cookie whenever the request carried one. All other feedback logic (`:94-119`) stays byte-identical. Update the comment at `:77-79` to describe the cookie.

**Contract**: `slugParam` keeps its meaning (a candidate slug, accepted only via `itemSlugs`). Read and clear happen after the auth/onboarding redirects at `:30,36`.

#### 5. Language switcher comment

**File**: `src/components/LanguageSwitcher.astro`

**Intent**: Drop `"slug"` from the stripped keys (`:15`) now that no URL carries it, and keep the comment accurate.

**Contract**: `["saved", "error"]`.

#### 6. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Expect slug-free locations and check the row placement through the cookie jar.

**Contract**:

- `:173` expects `/dashboard?saved=plan#screening-${mammography}` (the prefix match then rejects any extra query param).
- Move the "dashboard confirms the save on the planned row" step (`:208-214`) to directly after it, GETting `/dashboard?saved=plan` with the same `bodyIncludes`.
- Add the next step, "the save confirmation shows once": `GET /dashboard?saved=plan` with `bodyExcludes` the row's `data-saved="success"` string. The page-level alert may show.
- After "plan rejects a past date" (`:216-219`), add "dashboard marks the date invalid on the row": `GET /dashboard?error=invalid_appointment_date`, `bodyIncludes: 'aria-invalid="true"'`. Confirm against the rendered markup that this is the plan row's date input, and narrow the string if needed.
- Remove the old `:209` request.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including `src/lib/screenings/flash.test.ts`: `npm test`
- Lint passes: `npm run lint`
- Type check and build pass: `npx astro check && npm run build`
- `npm run ui:check` passes
- Smoke passes against the local dev server (DB lock held): `BASE_URL=http://127.0.0.1:$DBAM_PORT npm run smoke`
- Heuristic only: `grep -rn "slug=" src/pages scripts` shows no redirect or request URL with a `slug` query (the gate is `flash.test.ts`)

#### Manual Verification:

- In a browser on the local dev server: plan an exam with a date → the URL bar shows `/dashboard?saved=plan#screening-<slug>`, the confirmation sits on that row, the page scrolls there, and DevTools shows `screening_flash` set by the POST response and cleared by the dashboard response
- Submit a past date → the row panel is open with the date field marked invalid and the error above it, as before
- Refresh after a save → the confirmation shows at page level, not on the row, and no `slug` appears in any URL

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Docs

### Overview

Record the fix and the accepted residuals where readers look for them.

### Changes Required:

#### 1. README known gaps

**File**: `README.md` (Errors and alerts → Known gaps, `:352`)

**Intent**: Replace the slug-leak gap with what's true now: the slug travels in a short-lived `HttpOnly` cookie. The remaining URL values are static codes, `?reminders=on|off` and Supabase's single-use `?code=` on the auth callback. Point to `context/changes/redirect-query-privacy/` (the current link points to a pre-archive path).

**Contract**: the one bullet in "Known gaps"; no other README section changes.

#### 2. Backlog pointer

**File**: `context/foundation/backlog.md`

**Intent**: B-01's Done entry points to this change and states the open human check. This was done at planning time; verify it still reads correctly.

**Contract**: the B-01 bullet under `## Done`.

### Success Criteria:

#### Automated Verification:

- Prettier passes on changed Markdown: `npx prettier --check README.md context/foundation/backlog.md context/changes/redirect-query-privacy/*.md`

#### Manual Verification:

- After deploy, a reviewer opens Workers Observability, filters invocation logs on `/dashboard` and confirms new entries carry no `slug=` (and, if query strings are kept, only `saved=`/`error=` codes)

---

## Testing Strategy

### Unit Tests:

- `flash.test.ts`: location builder keeps the slug out of path and query for both feedback kinds and for null slugs; cookie options for set and clear; `readFlashSlug` validation.

### Integration Tests:

- Smoke: slug-free redirect location; the row confirmation appears on the first dashboard render after the POST, and only once; a row-level invalid field after a rejected plan.

### Manual Testing Steps:

1. Plan an exam with a date and check the URL, the row confirmation, the scroll and the cookie in DevTools.
2. Submit a past date and check the open panel, `aria-invalid` and the error text.
3. Refresh and switch language after a save; check that no `slug` appears in the URL.

## Performance Considerations

None: one small cookie on two responses.

## Migration Notes

No data migration. A bookmarked old URL with `&slug=` now renders the message at page level, which is harmless. Rollback is a plain Worker rollback.

## References

- Research: `context/changes/redirect-query-privacy/research.md`
- Decisions: `context/changes/redirect-query-privacy/decisions.md`
- Source follow-up: `context/archive/2026-10-06-error-tracking/follow-ups/redirect-slug-leak.md`
- Cookie precedent: `src/pages/api/locale.ts:24`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Flash cookie carries the slug

#### Automated

- [ ] 1.1 Unit tests pass, including `src/lib/screenings/flash.test.ts`: `npm test`
- [ ] 1.2 Lint passes: `npm run lint`
- [ ] 1.3 Type check and build pass: `npx astro check && npm run build`
- [ ] 1.4 `npm run ui:check` passes
- [ ] 1.5 Smoke passes against the local dev server (DB lock held)
- [ ] 1.6 Heuristic grep shows no `slug` query in redirects or request URLs

#### Manual

- [ ] 1.7 Browser: plan with a date shows the row confirmation, slug-free URL, cookie set and cleared
- [ ] 1.8 Browser: past date opens the row panel with the date field marked invalid
- [ ] 1.9 Browser: refresh after a save shows the page-level confirmation and no slug in any URL

### Phase 2: Docs

#### Automated

- [ ] 2.1 Prettier passes on changed Markdown

#### Manual

- [ ] 2.2 Production Workers Logs show no `slug=` in new `/dashboard` invocation entries
