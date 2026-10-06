# Redirect Query Privacy — Plan Brief

> Full plan: `context/changes/redirect-query-privacy/plan.md`
> Research: `context/changes/redirect-query-privacy/research.md`

## What & Why

After a user plans or marks an exam done, `/api/screenings` redirects to `/dashboard?…&slug=<slug>`, and the slug names the exam (health data). Cloudflare Workers Logs records request URLs for 3 days (7 from 2026-12-01), and its URL redaction doesn't match slugs. F-09 (backlog B-01) keeps that slug out of every request URL without losing the dashboard's on-row confirmation.

## Starting Point

The endpoint builds the redirect in two closures (`src/pages/api/screenings.ts:41-49`). The dashboard reads `slug` from the query in one place (`src/pages/dashboard.astro:92`) to place the confirmation, the error and the invalid-field marking on the right row. The rendering is server-side only, with no client scripts.

## Desired End State

Redirects read `/dashboard?saved=<intent>#screening-<slug>` or `/dashboard?error=<code>#screening-<slug>`. The slug travels in a 60-second `HttpOnly` cookie, scoped to `/dashboard`, which the dashboard reads once and clears. Users see the same row confirmation, scroll and error state as today; only the URL and a cookie differ.

## Key Decisions Made

| Decision             | Choice                                                             | Why (1 sentence)                                                                                        | Source                  |
| -------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ----------------------- |
| Carrier              | Flash cookie (`HttpOnly`, `SameSite=Lax`, `Path=/dashboard`, 60 s) | Row state is server-rendered and the app has no client JS, so a fragment reader would change behaviour. | Research / orchestrator |
| What moves           | Slug only; `saved`/`error` codes stay in the query                 | Codes are static and keep the `?error=<code>` convention and the smoke/ui-shots prefixes.               | Orchestrator            |
| `?reminders=on\|off` | Unchanged                                                          | A preference, not health data.                                                                          | Orchestrator            |
| Auth `?code=`        | Accepted residual                                                  | A single-use PKCE code whose URL shape Supabase sets.                                                   | Orchestrator            |
| Clearing             | `set(name, "", { maxAge: 0 })` with the same options               | Path always matches, and the smoke cookie jar recognises `Max-Age=0`, not Astro's `Expires=1970`.       | Plan                    |
| Privacy gate         | Unit test on the location builder (`flash.test.ts`)                | Lesson: grep gates are heuristics; privacy tests are the guard.                                         | Plan                    |

## Scope

**In scope:**

- new `src/lib/screenings/flash.ts` and its tests;
- `api/screenings.ts` redirects;
- the dashboard's slug source;
- the language-switcher key list;
- smoke steps;
- the README known-gaps bullet;
- the backlog pointer.

**Out of scope:**

- the `saved`/`error` codes;
- `?reminders=`;
- the auth `?code=`;
- invocation-log settings;
- client JS;
- verifying Workers Logs query retention (B-01 human check);
- roadmap status.

## Architecture / Approach

A pure helper owns the cookie name, its options, slug validation and the dashboard location builder. The endpoint sets the cookie, or clears it when there's no slug, on every redirect to `/dashboard`. The dashboard reads it, clears it, and feeds it into the unchanged row-placement logic (`itemSlugs` check, `saved`/`error` gating).

## Phases at a Glance

| Phase                            | What it delivers                                                  | Key risk                                                     |
| -------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| 1. Flash cookie carries the slug | Helper + tests, endpoint, dashboard, smoke reordered and extended | Smoke step order: the first dashboard GET consumes the flash |
| 2. Docs                          | README known gap rewritten, backlog pointer checked               | None                                                         |

**Prerequisites:** none (local Supabase and the DB lock for smoke).
**Estimated effort:** one short session across 2 phases.

## Open Risks & Assumptions

- After a refresh the confirmation shows at page level instead of on the row (the cookie was consumed); this is accepted.
- Two quick saves in two tabs: the last cookie wins, so the first tab may show its message at page level.
- Whether Workers Logs keeps query strings at all is unverified; the fix is correct either way.

## Success Criteria (Summary)

- No `/api/screenings` redirect URL carries a slug outside the fragment; a unit test proves it.
- The dashboard shows the save confirmation and row errors on the right row, as before (smoke + browser check).
- New production invocation logs for `/dashboard` contain no `slug=`.
