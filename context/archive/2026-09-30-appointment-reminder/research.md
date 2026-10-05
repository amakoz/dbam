---
date: 2026-09-30T13:52:07+02:00
researcher: Amadeusz Kozlowski (with Claude Code)
git_commit: 826f9c2d8d55d1bdfab5600864b3cee352f93108
branch: feat/appointment-reminder
repository: amakoz/dbam
topic: "S-04 appointment-reminder: what an opt-in, appointment-approaching email needs, what exists, and which decisions are open"
tags: [research, codebase, reminders, cron, email, resend, supabase, rls, service-role, consent, opt-in]
status: complete
last_updated: 2026-09-30
last_updated_by: Amadeusz Kozlowski (with Claude Code)
---

# Research: S-04 appointment-reminder

**Date**: 2026-09-30T13:52:07+02:00
**Researcher**: Amadeusz Kozlowski (with Claude Code)
**Git Commit**: 826f9c2d8d55d1bdfab5600864b3cee352f93108
**Branch**: feat/appointment-reminder
**Repository**: amakoz/dbam

## Research Question

Roadmap slice S-04 (`appointment-reminder`, issue #22): "user can opt in to (or out of) reminders and, when opted in, receives an email as a recorded appointment date approaches" (`context/foundation/roadmap.md` S-04; PRD US-02, FR-006, FR-007).

This research answers four questions:

- What does S-04 build on: the F-02 dispatch path, the S-03 tables, and the consent model?
- How can a cron run with no user session read, across users, who opted in, whose appointment is near, and their email addresses?
- What do the PRD and the prior changes already decide about the opt-in, the timing and the email content?
- Which choices are left for `/10x-plan`?

This research includes external evidence on Supabase, Cloudflare Workers, Resend and EU/Polish email rules, with URLs. Legal points are interpretation, not advice.

## Summary

1. **The cron can't read any user data today.** `scheduled()` only calls `runHeartbeat` (`src/worker.ts:10-12`). The only Supabase client factory in `src/` is built per request from cookies with the publishable key (`src/lib/supabase.ts:6-22`). `anon` has `revoke all` on every user table: `profiles` (`supabase/migrations/20260927190303_onboarding_profile.sql:124`), `health_data_consents` (`:44`), and `screening_plans`/`screening_completions` (`20260930093108_screening_records.sql:169`).
   - PostgREST exposes only `public` and `graphql_public` (`supabase/config.toml:13`), so `auth.users` (the only place the database stores email) can't be reached over REST with any key.
   - F-02 left this path to S-04 on purpose (`context/archive/2026-09-29-reminder-dispatch-path/plan.md:54`, `research.md:165`).
2. **`service_role` has full privileges on all four user tables, and nothing restricts it.** A local query of `information_schema.role_table_grants` on 2026-09-30 showed `service_role` holding DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE and UPDATE on `profiles`, `health_data_consents`, `screening_plans` and `screening_completions`.
   - Only `screening_catalog` had `service_role` explicitly revoked (`20260928195335_harden_screening_catalog_service_role.sql:5-13`).
   - A secret key (`sb_secret_…`) acts as `service_role` and "bypasses every Row Level Security policy" ([Supabase API keys](https://supabase.com/docs/guides/api/api-keys)).
   - The deployment plan says "**Never** the `service_role` / `sb_secret_…` key", and gives as its reason that `SUPABASE_KEY` feeds the per-request SSR client (`context/changes/deployment/deployment-plan.md:187-188`).
3. **There are four ways to read across users. None is free, and the choice belongs to S-04.** See the options table under Cross-user read path.
   - **(A)** A dedicated secret key in the Worker. It can be narrowed in the database by revoking `service_role`'s table privileges and granting only a definer function.
   - **(B)** A `security definer` function granted to `anon`. It is protected only by a secret argument, and Supabase's advisor flags this as a "public exfiltration endpoint" (lint 0028).
   - **(C)** A push from `pg_cron` + `pg_net`: the database picks who is due and POSTs to a Worker endpoint protected by a shared secret.
   - **(D)** A Worker-minted JWT for a custom role, or a direct Postgres connection. Evidence for this option is thin.
4. **The PRD fixes three things.**
   - Opt-in gates every send (`prd.md:71`; roadmap risk `roadmap.md:172`: "including the later S-06/S-07 messages").
   - Opt-out must exist (FR-006, `prd.md:112-113`).
   - Email bodies stay generic, because screening names are GDPR Art. 9 data and Resend keeps logs (`reminder-dispatch-path/research.md:139`).

   No document settles the default opt-in state, where the toggle lives, the lead time, how many reminders are sent, the email language, whether an unsubscribe link is required, or how opt-in relates to consent. The roadmap assigns the lead-time decision to the user (`roadmap.md:171`).

5. **Only the owner can receive email until a domain exists.** Resend test mode delivers only to the exact address of the account owner (`reminder-dispatch-path/plan.md:390`; [Resend 403](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)). The MVP decision is no custom domain and no Workers Paid (`roadmap.md:105`). S-04 can therefore be built and proven end to end against the owner's address, but not delivered to real users.
6. **The Workers Free budget is tight but fits a set-based design.** Each cron run gets 10 ms CPU and 50 subrequests; waiting on the network doesn't count toward CPU ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)).
   - Resend's `POST /emails/batch` sends up to 100 emails in one request, and one `Idempotency-Key` covers the batch ([Resend batch](https://resend.com/docs/api-reference/emails/send-batch-emails)).
   - The free quota is 100 emails a day and 3,000 a month ([Resend quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits)).
   - `sendEmail` today sends one recipient per call, plain text only (`src/lib/email.ts:12-20,56`).
7. **Adding a job means changing the cron dispatch.** The cron-string switch lives inside the heartbeat, and any unknown string throws `UnknownCronError` (`src/lib/heartbeat.ts:70-79`).
   - Sharing `0 8,9 * * *` costs no extra trigger. The two jobs then share one run's CPU and subrequest budget, and the heartbeat rethrows on failure (`heartbeat.ts:66`), so running jobs one after another couples their failures.
   - CI runs every cron from the built `wrangler.json` at one pinned time, `2026-10-01T08:00Z` (`.github/workflows/ci.yml:55-75`). It checks only for `"outcome":"ok"`, so it can't tell sent from skipped.
8. **A sent-ledger is the idempotency guard F-02 asked for** (`reminder-dispatch-path/research.md:139`).
   - Resend's idempotency keys expire after 24 hours ([Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys)).
   - S-03 provides a stable `screening_plans.id` and an indexed, nullable `appointment_date` that is overwritten in place when a plan is rescheduled (`20260930093108_screening_records.sql:11-32`). So a ledger keyed on (plan id, appointment_date) sends once per date.
   - Whether Cloudflare retries a failed cron run is disputed in the repo: `plan.md:56` says it doesn't, while impl-review F6 says it does (`reviews/impl-review.md:114`). Cloudflare's docs don't clearly say.

## Detailed Findings

### Dispatch path (F-02) and what a second job changes

- **Entry point:** `scheduled(controller)` awaits `runHeartbeat({ cron, scheduledTime })`, so a thrown error marks the run failed in Trigger Events (`src/worker.ts:9-12`). `env` and `ctx` go unused, and nothing calls `ctx.waitUntil` or `noRetry`.
  - The static `@astrojs/cloudflare/handler` import is what makes `astro:env` secrets readable inside `scheduled()` (`src/worker.ts:1,4-6`).
- **The Warsaw gate:** `HEARTBEAT_CRON_DAILY = "0 8,9 * * *"` sends only when `warsawHour(scheduledTime) === 10` (`src/lib/heartbeat.ts:11,15,74-75`).
  - `warsawHour` uses `Intl` with `Europe/Warsaw` and throws on a non-finite hour (`:81-93`).
  - Cron expressions run in UTC ([cron triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)), which is why two hours are scheduled.
- **`sendEmail({ to, subject, text, idempotencyKey })`** (`src/lib/email.ts`):
  - It sends one recipient, as `to: [to]`, in plain text (`:56`), and passes `Idempotency-Key` (`:54`) with a 10 s timeout (`:10,57-58`).
  - Dry run (`EMAIL_DRY_RUN=true`) logs `{event, outcome, idempotencyKey}` and makes no call (`:40-44`).
  - Named errors: `EmailConfigError` (`:22-25`) and `EmailSendError(status, resendError)` (`:27-37`).
  - The sender is `Dbam <onboarding@resend.dev>` (`:7-9`).
- **Logging rules (review F5):** log error names and ids only, never `error.message`, which from Postgres can quote row values. Never log a subject, recipient or key (`heartbeat.ts:55-56`; `email.ts:3-4,41`; `reminder-dispatch-path/reviews/impl-review.md:100-112`). The `no-console` lint exemption covers exactly three files: `src/worker.ts`, `src/lib/email.ts` and `src/lib/heartbeat.ts` (`eslint.config.js:76-80`). A new job file must be added there.
- **Env:** all five variables are optional `astro:env/server` secrets (`astro.config.mjs:21-31`): `SUPABASE_URL`, `SUPABASE_KEY`, `RESEND_API_KEY`, `REMINDER_TEST_TO` and `EMAIL_DRY_RUN`. CI's smoke job writes only `SUPABASE_URL`, `SUPABASE_KEY` and `EMAIL_DRY_RUN=true` (`ci.yml:41-48`). A new required secret would be missing in CI unless CI writes it or the job tolerates its absence in dry run.
- **Adding a job:**
  - Any new cron string must be handled, or it throws (`heartbeat.ts:76-77`). Free allows 5 Cron Triggers, treated as per account, and Dbam uses 1 (`reminder-dispatch-path/research.md:106`).
  - A cron change takes up to 15 minutes to apply (`README.md:223-225`).
  - Local runs use `/cdn-cgi/local/scheduled?cron=…&time=…&format=json` (`README.md:209-217`).

### Cross-user read path (the core decision)

What the cron must read: opted-in users, plans with `appointment_date` a set number of days ahead (`appointment_date is not null`), and each user's email. It must also write a ledger row.

| Option                                                                  | How                                                                                                                                                                                                             | For                                                                                                                                                                                                                                                                                                                     | Against / evidence                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. Secret key, narrowed in the DB**                                   | A new `sb_secret_…` secret (e.g. `SUPABASE_SECRET_KEY`) used only by the cron. It calls one or two `security definer` functions, such as "claim due reminders" returning (ledger id, email, …) and "mark sent". | A pattern the docs name ("periodic jobs"); a separate key per component makes rotation cheap ([API keys](https://supabase.com/docs/guides/api/api-keys)). Can be narrowed by revoking `service_role` on user tables, as was done for the catalog (`20260928195335_…:5-13`), and granting EXECUTE only on the functions. | Reverses the "Never" rule (`deployment-plan.md:187-188`), which was written about the SSR client key. The key still reaches the GoTrue Admin API: list and delete users (inferred from Supabase docs, not tested). A custom role for secret keys appears only in a GitHub discussion ([#29260](https://github.com/orgs/supabase/discussions/29260)), not in the current docs.                    |
| **B. Definer function granted to `anon` + secret argument**             | Publishable key; the RPC checks a shared secret passed in the body                                                                                                                                              | No new key type                                                                                                                                                                                                                                                                                                         | Advisor lint 0028: an anon-executable definer function is "a public exfiltration endpoint" through `/rest/v1/rpc` ([advisors](https://supabase.com/docs/guides/database/database-advisors)). The only protection is the argument. The documented alternative is the `db_pre_request` header pattern, which is meant for apps that don't use Supabase Auth.                                       |
| **C. DB push: `pg_cron` + `pg_net` → Worker endpoint**                  | A scheduled SQL job (running as postgres, which can read `auth.users`) selects due reminders, writes the ledger, and POSTs them to a Worker route that checks a shared secret stored in Vault                   | The Worker gets no DB privileges. The selection is set-based and in the database ([Supabase Cron](https://supabase.com/docs/guides/cron), [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net))                                                                                                        | Moves scheduling off F-02's Cron Trigger. `pg_net` is async with no retries, and its responses are kept only 6 h, in unlogged tables. Email addresses travel in the POST body. `pg_cron` and `pg_net` are available but not installed locally (`pg_available_extensions`, 2026-09-30), and no migration enables them. The endpoint needs a new unauthenticated route with a shared-secret check. |
| **D. Custom role via self-minted JWT, or a direct Postgres connection** | The Worker signs a JWT for a narrow role with an imported signing key, or connects to Postgres with a dedicated login role                                                                                      | Least privilege in theory                                                                                                                                                                                                                                                                                               | The Worker would hold a key that can sign for any role or user ([signing keys](https://supabase.com/docs/guides/auth/signing-keys)). Nothing in the repo covers Hyperdrive or a direct connection. Not researched further.                                                                                                                                                                       |

- **Email lives only in `auth.users`,** and the `auth` schema isn't exposed ([managing user data](https://supabase.com/docs/guides/auth/managing-user-data)). A view over `auth.users` trips advisor lint 0002 (ERROR). Any reader is therefore:
  - a definer function owned by postgres, with EXECUTE locked down;
  - the Admin API (secret key);
  - or a trigger-maintained copy of the email in a `public` table (Supabase's "profiles" pattern). That would copy personal data, and nothing in the repo does it today.
- **Existing definer pattern to copy:** `withdraw_health_data_consent()` uses `security definer` and `search_path = ''`, pins `caller := auth.uid()` and raises `42501` without one, revokes EXECUTE from `public, anon` and grants it to `authenticated` (`20260930093108_screening_records.sql:194-216`).
  - pgTAP tests it with `set local role` and `request.jwt.claims` (`supabase/tests/database/onboarding_profile.test.sql:13-14,105-111`).
  - No test uses `has_function_privilege`, and none runs as `service_role`.
  - A cron function can't pin `auth.uid()`: it runs for all users. Its narrowing has to come from its grants and a fixed, minimal return shape.

### Opt-in: requirements and where it could live

- **Requirements:**
  - "The appointment-approaching reminder only fires for users who opted in" (`prd.md:71`).
  - FR-006: "User can opt in (or out) of receiving reminders" (`prd.md:112-113`).
  - S-06 and S-07 say "an opted-in user" (`roadmap.md:189,201`), and no document mentions reminder preferences per type. So the implied design is one shared gate, inferred from the risk at `roadmap.md:172`.
- **Default:** not stated. The wording "opt in", together with S-01's unticked consent checkbox (`context/archive/2026-09-27-onboarding-profile/plan.md:21`), points to off by default. This is inference.
- **Where to toggle:** not stated. S-01 and S-03 both excluded it (`onboarding-profile/plan.md:47`; `record-appointment-date/plan.md:75`). `/profile` is the existing settings page (inference).
- **Candidate storage (facts about what each touches):**
  - **A column on `profiles`:**
    - Writes inherit the consent gate (`onboarding_profile.sql:98-117`).
    - Withdrawal deletes it along with the profile, with no function change.
    - It needs new column grants (`:125-129`).
    - `api/profile.ts:41` upserts the parsed profile, so the flag must either join that payload or get its own endpoint.
    - It exists only after onboarding.
  - **Its own table:** needs the full pattern (RLS, `revoke all` from anon, column grants, default-privilege revokes, pgTAP). Whether it is consent-gated and deleted on withdrawal is a decision; deleting it means another `create or replace` of the withdrawal function.
  - **Auth `user_metadata`:** the user can write it themselves, and it is readable across users only through the Admin API or a definer function. It has no grant or pgTAP surface, withdrawal doesn't touch it, and nothing in the app uses metadata today.

### Consent, withdrawal and health-data scope

- **The consent text promises nothing about email.** Its purpose is "Only to show which screening tests you're eligible for and when … We don't share this data with other users or third parties" (`src/i18n/en.ts:158-159`; `pl.ts:162-163`). The checkbox says "to show me the preventive screenings that are due for me" (`en.ts:166-167`).
  - An email built from plan data goes through Resend, a third-party processor. Covering that in the text would mean a consent-text change and a `HEALTH_DATA_CONSENT_VERSION` bump (`src/lib/consent.ts:5-8`). The repo leaves open whether existing users must then consent again (S-01 follow-up F7, `onboarding-profile/follow-ups/review-fixes.md:11`).
- **Withdrawal** deletes plans, completions and the profile, then stamps the consent (`20260930093108_screening_records.sql:194-213`).
  - A ledger keyed by plan id with `on delete cascade` would disappear with the plans. That is inference, and it depends on the FK choice.
  - The comment in `src/pages/api/consent/withdraw.ts:8-9` still says only the profile is deleted, which is stale since S-03.
- **Is a ledger health data?** On the repo's own wording (`prd.md:136`: "profile answers and exam dates"; the S-03 migration header, `20260930093108_screening_records.sql:1-5`), a row recording that a user has an appointment for an exam on a date is derived from plan data. So it looks like health data. A bare boolean opt-in is not in any health-data list. Both points are inference.
- **Race:** S-01's withdraw-versus-save race is still open (`review-fixes.md:10`). A cron that reads plans while a user withdraws faces the same kind of race.

### Email content, language and compliance

- **Content:** keep it generic, with no screening name. This is required by `reminder-dispatch-path/research.md:139` and applies to subjects too (review F5). The no-diagnosis guardrail also applies (`prd.md:40`).
- **Language:** the app defaults to Polish. Locale is only a `lang` cookie, not stored per user; the only stored locale is `health_data_consents.locale`, saved at consent time (`onboarding-profile/plan.md:145`). No document decides the email's language.
- **Unsubscribe:**
  - No repo document mentions it.
  - For a reminder the user explicitly asked for, Poland's PKE art. 398 consent rule for commercial information likely doesn't apply, provided the email carries nothing promotional. UOKiK reads "marketing" broadly ([prawo.pl](https://www.prawo.pl/biznes/prawo-komunikacji-elektronicznej-zgoda-na-dzialania-marketingowe,534839.html); the UK ICO treats appointment reminders as service messages: [ICO](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/direct-marketing-guidance/identify-direct-marketing/)).
  - The opt-in is a consent, and GDPR Art. 7(3) requires withdrawing it to be as easy as giving it ([Art. 7](https://gdpr-info.eu/art-7-gdpr/)). That argues for an opt-out link in the email; the law doesn't mandate one (interpretation).
  - Resend supports `List-Unsubscribe` and `List-Unsubscribe-Post` through `headers` ([Resend unsubscribe](https://resend.com/docs/dashboard/emails/add-unsubscribe-to-transactional-emails)).
  - Gmail and Yahoo require one-click unsubscribe only from bulk senders, about 5,000+ messages a day ([Google](https://support.google.com/a/answer/81126)), far above the 100-a-day Resend free cap.
  - A one-click link needs an unauthenticated endpoint and a per-user token. Nothing like that exists in the repo.

### Limits and delivery

- **Workers Free, per cron run:** 10 ms CPU, 50 subrequests, 15 min wall time; network waiting isn't CPU ([limits](https://developers.cloudflare.com/workers/platform/limits/), [scheduled handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/)).
  - Every Supabase call and every Resend call is one subrequest.
  - With one email per call (today's `sendEmail`), one run can send fewer than 50 emails. With the batch endpoint, one call sends up to 100.
- **Resend:**
  - 10 requests/s per team; a batch counts as one request ([API intro](https://resend.com/docs/api-reference/introduction)).
  - Idempotency keys up to 256 chars, expiring after 24 h. Returns 409 when a key is reused with a different payload.
  - The docs don't say outright whether each email in a batch counts toward the 100/day quota. The likely reading is that it does.
- **Test mode:** the first live F-02 send got a 403 until the recipient exactly matched the owner address; `+tag` variants are rejected (`reminder-dispatch-path/plan.md:390`). Brevo is the only no-domain alternative found, and it was not evaluated (`reminder-dispatch-path/research.md:38,245`).

### Test and verification surfaces

- **pgTAP:** every new policy or grant needs a case (CLAUDE.md). The existing files use `has_table_privilege`, `has_column_privilege` and `throws_ok … '42501'` (`supabase/tests/database/screening_records.test.sql:199-247`). None covers `service_role` on user tables, or function privileges.
- **CI cron loop:** runs each cron at `time=1790841600000`, which is 2026-10-01T08:00:00Z (`ci.yml:55-75`). A job that depends on the day's data needs seeded rows to exercise its send path, and CI can't distinguish "sent" from "skipped".
- **Smoke** (`scripts/smoke.mjs`) is HTTP-only against a local server. The deploy job has no post-deploy cron check; that is parked as #57 (`roadmap.md:242`).
- **Unit tests:** no runner exists yet. F-03 (`unit-test-suite`) is `ready`, not done (`roadmap.md:46`).

## Code References

- `src/worker.ts:1-13`: Worker entry; `scheduled()` calls only the heartbeat.
- `src/lib/heartbeat.ts:9-27,39-79,81-107`: cron constants, `shouldSend` switch, `UnknownCronError`, Warsaw gate, failure logging.
- `src/lib/email.ts:7-66`: `sendEmail` contract, sender, idempotency, timeout, dry run, named errors.
- `src/lib/supabase.ts:6-22`: the only Supabase client factory in `src/` (per request, cookie-bound, publishable key).
- `astro.config.mjs:21-31`: env schema (5 optional server secrets).
- `wrangler.jsonc:15-17`: `"crons": ["0 8,9 * * *"]`.
- `.github/workflows/ci.yml:41-48,55-75`: CI env and the scheduled-cron dry-run loop.
- `eslint.config.js:76-80`: `no-console` exemption for the three dispatch files.
- `supabase/migrations/20260930093108_screening_records.sql:11-32,169-216`: `screening_plans` shape and index, grants, withdrawal function.
- `supabase/migrations/20260928195335_harden_screening_catalog_service_role.sql:5-13`: the only `service_role` revoke.
- `supabase/migrations/20260927190303_onboarding_profile.sql:44,94-129`: consent/profile grants and consent-gated RLS.
- `supabase/config.toml:13`: PostgREST exposed schemas.
- `src/pages/api/consent/withdraw.ts:8-9`: stale comment (says only the profile is deleted).
- `src/i18n/en.ts:155-167,179-182`: consent data, purpose and checkbox texts; withdrawal text.
- `src/lib/consent.ts:5-8`: consent version and its format.
- `src/pages/api/profile.ts:41`, `src/pages/profile.astro:25-32`: profile upsert and form mapping (touched if the opt-in lives on `profiles`).

## Architecture Insights

- Every user table is RLS-first with own-row policies for `authenticated`. `anon` is always revoked. `service_role` has been locked down on reference data only, the catalog, and never on user data.
- Privileged database work goes through small `security definer` functions with `search_path = ''`, explicit EXECUTE grants and pgTAP. The existing one is safe because its body is "trivially scoped to `auth.uid()`" (`onboarding-profile/reviews/impl-review.md:58`). A cross-user cron function breaks that assumption, so its safety has to rest on who can execute it and on a minimal return shape.
- The dispatch path is built for fail-loud runs and PII-free logs: named errors, ids only. A reminder job inherits both rules. Its Supabase errors must not be logged with `message`.
- The dispatch path is set-based by necessity (10 ms CPU, 50 subrequests). One query and one batch send per run fits; a loop per user doesn't.

## Historical Context (from prior changes)

- `context/archive/2026-09-29-reminder-dispatch-path/plan.md:54-55`: "No Supabase access from the cron, no service-role key, no security-definer functions. That belongs to S-04." Still accurate.
- `reminder-dispatch-path/research.md:139`: a DB-side sent ledger is the real idempotency guard, and email bodies must stay generic. Still accurate. The Resend 24 h key expiry, now confirmed, strengthens the ledger point.
- `reminder-dispatch-path/research.md:165`: S-04 chooses between a service-role secret and narrowly granted definer functions. Partly accurate: a DB push (`pg_cron` + `pg_net`) is a third option it didn't list. It also didn't note that a definer function still needs some role holding EXECUTE, and that granting it to `anon` is lint 0028.
- `reminder-dispatch-path/plan.md:56` vs `reviews/impl-review.md:114`: whether failed crons are retried. The two contradict each other, and it is unresolved.
- `context/archive/2026-09-30-record-appointment-date/plan.md:74-81`: S-03 stored the state S-04 reads, added no opt-in, and granted nothing to `service_role`. Accurate. The `appointment_date` index exists for this query (`20260930093108_screening_records.sql:31-32`).
- `context/changes/deployment/deployment-plan.md:187-188`: the "Never `service_role` / `sb_secret_…`" rule. Still in force. Its stated reason concerns `SUPABASE_KEY` and the SSR client, not a separate key used only by the cron.
- `context/foundation/screening-catalog-research.md:9,177`: reminders stored on the device, with `.ics` export. Contradicted by F-02 (server email) and by the roadmap outcome.

## Related Research

- `context/archive/2026-09-29-reminder-dispatch-path/research.md`: cron runtime, email limits, cross-user read options.
- `context/archive/2026-09-30-record-appointment-date/research.md`: the S-03 table shape and what S-04 needs from it.
- `context/archive/2026-09-27-onboarding-profile/reviews/impl-review.md`: why withdrawal is `security definer` (F1), and default privileges (F2).

## Open Questions

These are product and architecture choices for `/10x-plan`. The first two gate everything else.

1. **Cross-user read path:** A (a dedicated secret key narrowed by revoking `service_role` table privileges and granting only definer functions), C (`pg_cron` + `pg_net` push to a Worker endpoint), or another option. Option A amends the deployment plan's "Never" rule for a key used only by the cron.
2. **Consent scope:** does sending reminders built from plan data through Resend need a consent-text change and a version bump, and does the opt-in live inside the health-data consent or beside it?
3. **Opt-in storage and default:** a `profiles` column, its own table, or user metadata? Off by default? Is it deleted on withdrawal?
4. **Toggle placement:** `/profile`, onboarding, the dashboard, or several?
5. **Lead time and count:** how many days before the appointment (roadmap owner: user), and one reminder or several? What if a plan is created or re-dated inside the lead window, or dated today?
6. **Ledger:** keyed on (plan id, appointment_date), with `on delete cascade` from plans? Treated as health data (consent-gated, deleted on withdrawal)?
7. **Opt-out from the email:** a one-click link (needs an unauthenticated endpoint plus a per-user token, and `List-Unsubscribe` headers), or "change it on `/profile`" only?
8. **Email language and wording:** Polish only, or the consent-time locale (`health_data_consents.locale`)? Is a generic body with a dashboard link acceptable?
9. **Job wiring:** share the `0 8,9 * * *` run (one budget, coupled failures) or add a second cron string (1 of 5 triggers)? Single sends or the batch endpoint? How does CI exercise the send path with seeded data?
10. **Delivery scope for "done":** is S-04 done when proven against the owner's address in production, given that no real user can receive email without a domain (`roadmap.md:105`)?
