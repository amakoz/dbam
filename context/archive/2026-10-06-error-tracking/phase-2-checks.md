# Phase 2 local checks (error-tracking)

Run 2026-10-06 with `EMAIL_DRY_RUN=true` against local Supabase (DB lock held for the cron runs). Dev server: `npx astro dev --host 127.0.0.1 --port $DBAM_PORT`; production handler: `npm run build` + `npx astro preview` on workerd. Every temporary change (the `SUPABASE_SECRET_KEY` edit in `.dev.vars`, the two SSR throws) was reverted.

## 2.5 Unknown cron

`/cdn-cgi/local/scheduled?cron=1+2+3+4+5&time=1790841600000&format=json` returned HTTP 500 (`{"outcome":"exception"}`). One error event, no `failure-alert` line:

```json
{"event":"heartbeat","outcome":"failed","cron":"1 2 3 4 5","scheduledAt":"2026-10-01T08:00:00.000Z","error":"UnknownCronError"}
{"event":"error","source":"cron","job":"heartbeat","requestId":"cron-1790841600000","cron":"1 2 3 4 5","scheduledAt":"2026-10-01T08:00:00.000Z","error":"UnknownCronError"}
```

## 2.6 Failing reminder claim

Daily cron `0 8,9 * * *`, `time=1790841600000`, `SUPABASE_SECRET_KEY=invalid-key`. HTTP 500. Output (no `@` anywhere in the dev log):

```json
{"event":"appointment-reminder","outcome":"failed","cron":"0 8,9 * * *","scheduledAt":"2026-10-01T08:00:00.000Z","error":"ReminderDatabaseError","step":"claim","code":"PGRST301"}
{"event":"error","source":"cron","job":"appointment-reminder","requestId":"cron-1790841600000","cron":"0 8,9 * * *","scheduledAt":"2026-10-01T08:00:00.000Z","error":"ReminderDatabaseError","step":"claim","code":"PGRST301"}
{"event":"email","outcome":"dry-run","idempotencyKey":"dbam-reminder-failure:0 8,9 * * *:1790841600000"}
{"event":"failure-alert","outcome":"dry-run","cron":"0 8,9 * * *","scheduledAt":"2026-10-01T08:00:00.000Z"}
```

The heartbeat on the same run logged its normal `dry-run` outcome and no error event.

## 2.7 Temporary SSR throw

The throw message was `boom for jan.kowalski@example.com\nSELECT secret FROM profiles`.

- **Dev handler** (`/dev/kitchen-sink`): HTTP 500, 500 page rendered (`<title>Chwilowy problem</title>`). One `ssr` event, and two Astro error lines, both `Error: [redacted]` plus frames. The address and the SQL fragment appear nowhere in the dev log or the response body.
  ```json
  {
    "event": "error",
    "source": "ssr",
    "route": "/dev/kitchen-sink",
    "requestId": "02c9e457-e953-4291-b693-59484c4f1b7d",
    "error": "Error"
  }
  ```
- **Production handler on workerd** (`src/pages/index.astro` frontmatter, `npm run build` + `astro preview`): HTTP 500, 500 page rendered. One `ssr` event, one Astro error line (`Error: [redacted]` plus frames; the production handler swallows the second pass). No address or SQL in the log or body.
  ```json
  {
    "event": "error",
    "source": "ssr",
    "route": "/",
    "requestId": "96f3c49d-25fd-4d92-902f-6af922e0cbe3",
    "error": "Error"
  }
  ```
  `requestId` is a UUID locally because there is no `cf-ray` header; in production it is the `cf-ray`.

## 2.8 Normal daily run

HTTP 200 (`{"outcome":"ok"}`). Lines: heartbeat `dry-run`, appointment-reminder `none` (`due: 0`). No `error` and no `failure-alert` line.

## Left for the PR

Production-only: the `requestId` of a real SSR error equals `$metadata.rayId`, and real Resend delivery of the failure email. Phase 3's manual list covers the rest.
