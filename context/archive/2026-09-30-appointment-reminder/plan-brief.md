# Appointment Reminder (S-04) — Plan Brief

> Full plan: `context/changes/appointment-reminder/plan.md`
> Research: `context/changes/appointment-reminder/research.md`

## What & Why

Users can already record an appointment date for a screening (S-03). S-04 lets them opt in to an email that arrives 1–3 days before that date (PRD US-02, FR-006, FR-007; issue #22). It is the first real user-facing use of the F-02 dispatch path, and its opt-in becomes the single gate for the later S-06/S-07 messages.

## Starting Point

The daily Cron Trigger (`0 8,9 * * *`, gated to 10:00 Warsaw) sends only a heartbeat and has no way to read user data. The only Supabase client is the per-request, cookie-bound SSR client. `service_role` holds full privileges on every user table, though nothing uses it. S-03's `screening_plans` has a stable id and an indexed `appointment_date`.

## Desired End State

A Reminders section on `/profile` (off by default, with its own disclosure) turns reminders on or off. The dashboard nudges users who have a dated plan but reminders off. Every day at 10:00 Warsaw, opted-in users with a plan 1–3 days ahead get one generic email per run: the date(s), a count, a dashboard link and an opt-out link, with no exam name. Emails come from `notification.dbam.net.pl`, a sending domain verified in Resend, to each opted-in user's account address.

## Key Decisions Made

| Decision         | Choice                                                                                                                                                                               | Why (1 sentence)                                                                                                                 | Source          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Cross-user read  | A dedicated `SUPABASE_SECRET_KEY` used only by the cron. `service_role` is revoked on all user tables; the key executes only two `security definer` functions.                       | It keeps F-02's trigger and logs; database access is narrowed to two pgTAP-tested functions; anon RPC is lint 0028.              | Research + Plan |
| Opt-in model     | `profiles.reminders_enabled` (default false), `reminders_locale`, and `reminders_enabled_at` set by a trigger. Own disclosure; consent text unchanged.                               | It inherits the consent-gated RLS, dies with the profile on withdrawal, records when consent was given, and avoids a re-consent. | Plan            |
| Timing           | One reminder per (plan, date), on the first run where the date is 1–3 days ahead. Catch-up inside the window; a plan dated today gets none; re-dating reminds again.                 | Leaves time for exam preparation, and a missed run is caught up the next day.                                                    | Plan            |
| Delivery         | Verified sending domain `notification.dbam.net.pl` (`EMAIL_FROM`); no allowlist (dropped 2026-09-30, prod holds only the owner and the tester). Done = both receive a real reminder. | The sandbox sender reaches only the owner; a sending domain reaches anyone, and the site stays on `workers.dev`.                 | Research + Plan |
| Toggle placement | Reminders section on `/profile`, plus a one-line dashboard hint.                                                                                                                     | Settings stay in one place, and users find them when they enter a date.                                                          | Plan            |
| Email content    | Date(s) and a count; no exam name in subject, body or logs.                                                                                                                          | Useful to the user without sending Art. 9 exam data to Resend.                                                                   | Research + Plan |
| Language         | The UI locale captured when reminders are turned on.                                                                                                                                 | Matches what the user saw when they chose; reuses the pl/en i18n keys.                                                           | Plan            |
| Opt-out          | A link to `/profile#reminders`; no one-click unsubscribe.                                                                                                                            | As easy as opting in (Art. 7(3)); no unauthenticated endpoint; far below the bulk-sender rules.                                  | Research + Plan |
| Idempotency      | Ledger `appointment_reminders` unique on (plan, date); claim → send → mark. Batch key = hash of the ids; dry run marks nothing.                                                      | Resend keys expire after 24 h, so the database is the real guard.                                                                | Research        |
| Wiring           | Shares the daily run; heartbeat and reminders run with `Promise.allSettled`; one Resend batch call.                                                                                  | No new trigger; failures are independent; 4 of 50 subrequests used.                                                              | Research + Plan |

## Scope

**In scope:**

- The migration: opt-in columns, the ledger, the two functions and the `service_role` hardening;
- pgTAP;
- `/api/reminders` and the `/profile` section;
- the dashboard hint and the i18n keys;
- `sendEmailBatch`;
- the cron-only client, protected by a lint rule;
- the reminder job and the `scheduled()` change;
- CI, smoke and README;
- the `CLAUDE.md` rule and the deployment-plan amendment;
- production secrets and the live proof.

**Out of scope:**

- a custom domain for the site (the domain is only for sending);
- a consent text or version change;
- one-click unsubscribe;
- exam names in the email;
- multiple reminders per date;
- per-type preferences;
- S-06/S-07;
- a new Cron Trigger;
- `pg_cron`/`pg_net`;
- a post-deploy cron check (#57).

## Architecture / Approach

The cron computes Warsaw today and calls `claim_due_appointment_reminders(today, 3, 100)` with the secret key. The function inserts ledger rows for due plans of opted-in, consenting users, then returns the unsent ones grouped per user: user id, account email, locale, ids and dates. The Worker builds the i18n messages and sends one Resend batch. It then calls `mark_appointment_reminders_sent(ids)` and logs counts only. All selection rules live in SQL and are tested with pgTAP; the Worker job is thin glue.

## Phases at a Glance

| Phase                | What it delivers                                                                                                               | Key risk                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 1. Database          | Opt-in columns, ledger, two cron-only functions, `service_role` revoked on user tables, pgTAP (with a guard for future tables) | Getting the definer function's return shape and window predicates exactly right                           |
| 2. Opt-in toggle     | `/api/reminders`, the Reminders section on `/profile`, the dashboard hint, i18n, smoke                                         | Disclosure wording next to the consent's "no third parties" line                                          |
| 3. Reminder job      | Env, shared schedule gate, `sendEmailBatch`, lint-restricted client, job, `allSettled` in `scheduled()`, CI key                | Whether the local `sb_secret` key reaches PostgREST RPC in CI's local Supabase (checked by the cron loop) |
| 4. Docs & production | `CLAUDE.md` rule, deployment-plan and roadmap notes, domain verified and secrets set by the owner, real emails to both users   | Merging before the secrets exist makes the reminder job fail daily (the heartbeat is unaffected)          |

**Prerequisites:** S-03 and F-02 are done (both archived). The owner can create a Supabase secret key, run `wrangler secret put`, and add DNS records for a domain they own (or buy a cheap one).

**Estimated effort:** about 3–4 sessions across 4 phases. Phase 4's live proof waits for a 10:00 Warsaw run after deploy.

## Open Risks & Assumptions

- The secret key can still reach the GoTrue Admin API (list or delete users), which the database can't narrow. This is accepted and documented in `CLAUDE.md` and the deployment plan.
- Resend's batch endpoint is assumed to count each email toward the 100/day quota (the docs are unclear). At most 100 users are claimed per run.
- Whether Cloudflare retries a failed cron run is unresolved. The ledger plus the id-hash batch key make a retry safe either way.
- Future `public` tables regain `service_role` privileges by Supabase default. The pgTAP guard fails until they revoke.

## Success Criteria (Summary)

- The owner and the tester, each opted in with an appointment 1–3 days ahead, receive exactly one generic reminder email in production, and no duplicate the next day.
- Users can turn reminders on and off on `/profile`. Withdrawing consent turns them off.
- The cron's key can't read any user table directly (pgTAP), and CI exercises the real claim path on every PR.
