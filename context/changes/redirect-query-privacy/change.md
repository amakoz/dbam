---
change_id: redirect-query-privacy
title: Keep user-derived health data out of request URLs logged by Workers Logs
status: preparing
created: 2026-10-06
updated: 2026-10-06
archived_at: null
---

## Notes

(foundation, privacy) no user-derived health data reaches Cloudflare Workers Logs through request URLs: /api/screenings stops redirecting to /dashboard?saved=…&slug=<slug> and ?error=…&slug=<slug> (src/pages/api/screenings.ts:42,49), and every other query param carrying user-derived values is audited (auth callback ?code=, profile.astro ?reminders=, any other redirect). Owner-approved 2026-10-06 as backlog B-01 (context/foundation/backlog.md); add it to the roadmap as F-09 (prerequisites: none; PRD refs: NFR (privacy)) and mark B-01 as moved to F-09 in backlog.md. Source: context/archive/2026-10-06-error-tracking/follow-ups/redirect-slug-leak.md (options: short-lived HttpOnly flash cookie, or the URL fragment read client-side). Constraints: keep the dashboard confirmation behaviour; update scripts/smoke.mjs expectations; don't disable invocation logs.
