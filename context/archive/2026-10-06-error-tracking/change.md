---
change_id: error-tracking
title: Log and alert production errors with Cloudflare Workers Logs and the existing email path
status: archived
created: 2026-10-06
updated: 2026-10-06
archived_at: 2026-10-06T11:04:43Z
---

## Notes

(foundation) production errors are visible and alerted using Cloudflare and the existing email path only, on the Workers Free plan with no new data processor: (1) the SSR error path (src/middleware.ts / the 500 page) and the scheduled reminder job log one structured JSON error event (error code, route or job name, request id; never health data, emails or profile fields) to Workers Logs; (2) a failed reminder run emails the owner through the existing Resend path (src/lib/heartbeat.ts, REMINDER_TEST_TO); (3) saved queries for these events in the Workers Observability dashboard, documented in README.md. Roadmap F-07; PRD refs: NFR (privacy), FR-007. Unlocks S-06, S-07. Risk: free-plan limits (200k log events/day, 3-day retention); the failure email must not include user data. Creating saved queries in the production dashboard is a human step (PR manual checks), not something the worker does.
