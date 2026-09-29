# Reminder Dispatch Path (F-02) — Plan Brief

> Full plan: `context/changes/reminder-dispatch-path/plan.md`
> Research: `context/changes/reminder-dispatch-path/research.md`

## What & Why

Every reminder slice (S-04, S-06, S-07) depends on scheduled email, and the starter has no scheduled work. F-02 proves the path early and on its own: a Cloudflare Cron Trigger on the production `dbam` Worker sends one heartbeat email. That keeps infrastructure risk out of the product slices.

## Starting Point

- `wrangler.jsonc` points at the Astro adapter's default entry, `{ fetch: handle }`.
- There are no triggers, no Worker runtime types, and no outbound email outside Supabase Auth.
- There is no custom domain and the account is on Workers Free. Both stay that way for the MVP (user decision).

## Desired End State

- **Production:** the Worker runs `scheduled()` on a cron and emails the owner's `+dbam` address. It runs every 30 minutes while proving, then once a day at 10:00 Europe/Warsaw, which stays correct across DST.
- **Failures:** a run that fails shows as failed in Trigger Events and Workers Logs.
- **CI:** every PR runs the handler in dry-run mode, with no email sent.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Cron wiring | Custom `src/worker.ts` exporting `{ fetch: handle, scheduled }`; `main` → it | Astro's documented v13+ pattern, and the installed adapter's default entry is the same shape | Research |
| Email provider | Resend test mode, `onboarding@resend.dev` → owner's `+dbam` address | Works with no domain on the Free plan; one `fetch`; supports `Idempotency-Key` | Research + user |
| `+dbam` recipient | Register the Resend account on the `+dbam` address itself | Resend's docs don't say whether a plus variant of the owner address is accepted; an exact match avoids the question | Research |
| Plan tier / domain | Workers Free, no domain in the MVP | MVP cost constraint; limits are documented and accepted | User |
| Schedule | `*/30 * * * *` to prove, then `0 8,9 * * *` with a 10:00 Europe/Warsaw gate | Cron runs only in UTC; two UTC hours plus a local-hour check gives one 10:00 email all year on 1 trigger | User + Plan |
| Mode switch | Behaviour picked from `controller.cron`; an unknown cron fails | The switch to daily becomes a one-line config PR; a mismatch fails loudly | Plan |
| Post-deploy verification | None in `deploy`; parked as a roadmap item | Avoids an email on every merge, and cron propagation (up to 15 min) exceeds the retry window | User |
| CI coverage | Dry-run scheduled calls in the `smoke` job for both cron strings | Catches a lost export or broken wiring on every PR, with no email and no CI secret | User |
| Missing secrets | Cron run throws; `/api/health` unchanged | Unrelated deploys are never blocked, yet the failure shows in Trigger Events and logs | User |
| Worker types | `wrangler types` → committed `worker-configuration.d.ts`, like `db:types` | No Workers types exist; the Astro docs recommend `wrangler types` | Plan |

## Scope

**In scope:**
- `src/worker.ts`, `src/lib/email.ts` (Resend over `fetch`, with dry run) and `src/lib/heartbeat.ts` (cron modes, Warsaw gate)
- Three `astro:env` secrets: `RESEND_API_KEY`, `REMINDER_TEST_TO`, `EMAIL_DRY_RUN`
- `wrangler.jsonc` `main` and `triggers`
- The Worker types script
- README updates
- The CI dry-run step
- Production secrets and the rollout checks
- The follow-up switch to daily

**Out of scope:**
- Automated post-deploy verification (parked)
- Workers Paid, a domain, Cloudflare Email Service, and real-user recipients
- Supabase access or privileged keys
- Reminder data, opt-in and migrations
- Send retries
- i18n for the operator-only email
- Queues and Workflows

## Architecture / Approach

The cron calls `scheduled()` in `src/worker.ts`, which calls `runHeartbeat({ cron, scheduledTime })` in `src/lib/heartbeat.ts`:
- It picks the mode from the cron string: always send, send only when Warsaw's hour is 10, or throw.
- It sends through `sendEmail()` in `src/lib/email.ts`. That is a POST to Resend with an `Idempotency-Key`, or a log line when `EMAIL_DRY_RUN` is true.

HTTP traffic still goes through the adapter's `handle`. Importing the handler module also sets up `astro:env` for the cron path.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Worker entry, email module and cron config | Custom entry, Resend and heartbeat modules, env fields, types, `*/30` cron; checked locally with a dry run and one live send | Unconfirmed: `astro:env` inside `scheduled()`, the `/cdn-cgi/local/scheduled` endpoint under `astro preview`, and `wrangler types` clashing with the DOM lib |
| 2. CI dry-run check | `smoke` job calls the scheduled handler for both cron strings | The preview may not expose the endpoint (fallback: `wrangler dev --test-scheduled`) |
| 3. Production rollout | Secrets set, human merge, heartbeat every 30 min in production | The CI token may not be allowed to deploy triggers |
| 4. Switch to daily | `0 8,9 * * *` gives one email a day at 10:00 Warsaw | Only visible the next day |

**Prerequisites:**
- A Resend account on the `+dbam` address and its API key.
- `wrangler` access to set secrets.
- A human merges both PRs.

**Estimated effort:** about 1–2 sessions for Phases 1–2 (one PR), a short manual Phase 3, and a one-line PR for Phase 4 after the proving period.

## Open Risks & Assumptions

- **`astro:env` inside `scheduled()`** is based on reading the code; Phase 1 verifies it in workerd.
- **Cron limit scope is unclear.** The limit is 5 cron triggers, and Cloudflare's docs contradict each other on per account vs per Worker (cloudflare-docs#29326), so we treat it as per account. This Worker uses 1.
- **Stopping the cron:** a code rollback may leave triggers in place, so stop the cron with `"crons": []`.
- **No real users can be emailed** until a domain exists. S-04 and later slices inherit that limit.

## Success Criteria (Summary)

- Heartbeat emails reach the owner's `+dbam` inbox from the production cron, every 30 min while proving and then once a day at 10:00 Warsaw.
- Every PR's CI runs the scheduled handler in dry-run mode and fails if it breaks.
- A misconfigured run is visible as a failure in Cloudflare. It is never silent, and it never blocks unrelated deploys.
