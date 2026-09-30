# Appointment Reminder (S-04) Implementation Plan

## Overview

A signed-in user can switch appointment reminders on or off on `/profile`. When on, the daily 10:00 (Europe/Warsaw) Cron Trigger run emails them once per recorded appointment date, 1–3 days before it. The email is generic: the date(s) and a count, never an exam name. The cron reads across users through a dedicated secret key that the database narrows to two `security definer` functions. Emails are sent from a sending domain the owner verifies in Resend (the site stays on `workers.dev`). Real sends are limited to an allowlist holding the two production users (the owner and the tester), so S-04 is done when both receive a real reminder in production (roadmap S-04, issue #22; PRD US-02, FR-006, FR-007).

> **Amendment (2026-09-30, after Phase 4):** the owner verified the sending domain `notification.dbam.net.pl` in Resend and dropped the allowlist, since production holds only the owner and the tester. `REMINDER_ALLOWED_TO` and the `p_allowed_emails` parameter are removed; the migration had not reached production, so it was edited in place. `claim` now returns the account email of every due user who has one, and the job logs `due` and `sent` only. Mentions of the allowlist or of `undeliverable` below are superseded. For Progress: row 1.5 reads "account email" for "allowlisted email", row 3.8 no longer applies, and row 4.3 covers the key and the sender only.

## Current State Analysis

- **The cron reads nothing.** `scheduled()` awaits only `runHeartbeat` (`src/worker.ts:10-12`). The only Supabase client is per request, cookie-bound, with the publishable key (`src/lib/supabase.ts:6-22`). `anon` is revoked on every user table, and emails live only in `auth.users`, which PostgREST does not expose (`supabase/config.toml:13`). F-02 deliberately left this path to S-04 (`context/archive/2026-09-29-reminder-dispatch-path/plan.md:54`).
- **`service_role` is unrestricted on user data.** It holds every table privilege on `profiles`, `health_data_consents`, `screening_plans` and `screening_completions` (local `information_schema.role_table_grants`, 2026-09-30). Only `screening_catalog` was hardened (`supabase/migrations/20260928195335_harden_screening_catalog_service_role.sql:5-13`). Nothing in `src/`, `scripts/`, `supabase/tests/` or CI uses `service_role` today (grep, 2026-09-30).
- **S-03 provides the data.** `screening_plans` has a stable `id` and a nullable, indexed `appointment_date` that is overwritten in place when a plan is re-dated (`supabase/migrations/20260930093108_screening_records.sql:11-32`). `parsePlanForm` rejects dates before Warsaw today (`src/lib/screenings/rules.ts:121`).
- **Dispatch path (F-02).** `sendEmail` sends one plain-text recipient with an `Idempotency-Key`, a 10 s timeout and a dry run (`src/lib/email.ts:39-68`). The heartbeat owns the cron switch, the `UnknownCronError` and the 10:00 Warsaw gate (`src/lib/heartbeat.ts:70-93`). Logs carry error names and ids only, never `message`, recipients or subjects (`heartbeat.ts:55-56`, `email.ts:41`).
- **Sender.** `FROM` is hardcoded to Resend's sandbox sender `Dbam <onboarding@resend.dev>` (`src/lib/email.ts:7-9`), which delivers only to the Resend account owner's address ([Resend 403](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)). Sending to anyone else needs a verified domain ([Verified Domains](https://resend.com/docs/dashboard/domains/introduction)); the docs name no other exception.
- **Consent and withdrawal.** `withdraw_health_data_consent()` deletes plans, completions and the profile (`20260930093108_screening_records.sql:194-216`). Profile writes are consent-gated by RLS with column grants (`20260927190303_onboarding_profile.sql:94-129`). `getOnboardingState` reads `profiles.select("*")` (`src/lib/consent.ts:33`), so new profile columns reach `/profile` and the dashboard without a new query.
- **CI.** The smoke job writes `SUPABASE_URL`, `SUPABASE_KEY` and `EMAIL_DRY_RUN=true`, then runs every deployed cron at `time=1790841600000` (2026-10-01T08:00Z, 10:00 Warsaw) and checks for `"outcome":"ok"` (`.github/workflows/ci.yml:41-75`). Local Supabase stays up during that step. `supabase status -o env` exposes `SECRET_KEY`.

## Desired End State

- `/profile` has a Reminders section with its own disclosure. Turning reminders on stores `reminders_enabled = true`, the current UI locale and a server-set `reminders_enabled_at`. Turning off clears the timestamp. Default is off. Withdrawal deletes it along with the profile.
- The dashboard shows a one-line link to `/profile#reminders` when reminders are off and at least one plan has an appointment date.
- On the 10:00 Warsaw run, every opted-in user with an active consent and a plan dated 1–3 days ahead is claimed once per (plan, appointment date). Allowlisted users (the owner and the tester) get one email per run listing their date(s), from an address on the verified sending domain. Everyone else is counted as `undeliverable` and nothing is sent. A re-dated plan is reminded again for its new date. A plan dated today is never reminded.
- The Worker's secret key can read no user table directly. It can only execute the two reminder functions.
- `CLAUDE.md` and the deployment plan document the cron-only secret key.

Verify with `npx supabase test db`, `npm run lint`, `npx astro check`, `npm run build`, the CI smoke job (including the scheduled-handler loop), and one real email in production.

### Key Discoveries:

- The `security definer` + `search_path = ''` + explicit EXECUTE grant pattern to copy: `20260930093108_screening_records.sql:194-216`.
- The column-grant pattern that stops clients forging server-owned timestamps: `20260927190303_onboarding_profile.sql:43-46,124-129`.
- `set_updated_at` trigger pattern on `profiles`: `20260927190303_onboarding_profile.sql:88-90`.
- Supabase's default privileges grant `service_role` everything on new `public` tables, so a future user table silently reopens the hole unless it revokes. A pgTAP guard over all `public` tables catches that.
- Resend `POST /emails/batch` sends up to 100 emails in one request under one `Idempotency-Key`. Keys expire after 24 h and a reused key with a different payload returns 409 (research, "Limits and delivery").
- Workers Free per cron run: 10 ms CPU, 50 subrequests. This design uses 4 (heartbeat send, claim, batch send, mark sent).

## What We're NOT Doing

- No custom domain for the site: it stays on `workers.dev`. The domain is only for sending, which narrows the F-02 "no custom domain" decision (`roadmap.md:105`).
- No delivery to non-allowlisted users. Production has two users and the allowlist holds both addresses.
- No change to the health-data consent text or `HEALTH_DATA_CONSENT_VERSION`: the opt-in carries its own disclosure.
- No one-click unsubscribe, `List-Unsubscribe` headers, unsubscribe tokens or unauthenticated endpoints. Opt-out is the `/profile` toggle, linked from the email.
- No exam names anywhere in the email, subject or logs.
- No second reminder per date, no per-type reminder preferences, no S-06/S-07 messages (they will reuse the same `reminders_enabled` gate).
- No new Cron Trigger: the job shares `0 8,9 * * *`.
- No `pg_cron`/`pg_net`, no anon-callable RPC, no self-minted JWTs.
- No change to the heartbeat's behaviour or recipient.
- No fix for the S-01 withdraw-versus-save race (`onboarding-profile/follow-ups/review-fixes.md:10`); the cron re-checks consent at claim time, which is enough here.
- No post-deploy cron check in CI (parked as #57).

## Implementation Approach

Build bottom-up so each phase is testable on its own. Phase 1 puts all selection logic in the database, behind two functions, and proves it with pgTAP. Phase 2 lets a user opt in. Phase 3 wires the cron to the functions with a minimal Worker job: claim, build messages, one batch send, mark sent. Phase 4 documents the new key and enables production.

The window is `appointment_date > today and appointment_date <= today + 3` in Warsaw days, so a plan created or re-dated inside the window is still reminded on the next run (catch-up), and a missed run is caught up the next day while the date is still ahead.

Delivery is two-step for idempotency. `claim` inserts ledger rows (`on conflict do nothing`) and returns every still-valid unsent row grouped per user. `mark` stamps `sent_at` after Resend accepts the batch. A failed send leaves rows unsent for the next run. A retry of the same run reuses the same batch key (a hash of the sorted reminder ids), so Resend deduplicates it.

## Critical Implementation Details

- **Allowlist filtering happens in the database.** `claim` returns `email = null` for users not in `p_allowed_emails` (case-insensitive), so non-allowlisted addresses never reach the Worker. A null array means "everyone": Phase 4 sets `REMINDER_ALLOWED_TO` to the two production addresses before the merge, so a stray sign-up is never emailed.
- **A claimed row must still be valid at claim time.** The function returns only unsent rows whose plan still has that `appointment_date`, whose owner still has `reminders_enabled` and an active consent, and whose date is still in the window. Rows for a re-dated plan's old date stay unsent forever and are harmless; they are deleted with the plan.
- **Dry run marks nothing.** With `EMAIL_DRY_RUN=true` the job logs the counts and the batch key and returns without calling `mark`, so local and CI runs never consume reminders.
- **Heartbeat and reminders fail independently.** `scheduled()` runs both with `Promise.allSettled` and rethrows the first rejection afterwards, so a broken reminder job still lets the heartbeat send, and the run is still marked failed in Trigger Events.

## Phase 1: Database — opt-in columns, reminder ledger and cron-only functions

### Overview

One additive migration adds the opt-in to `profiles`, a ledger table, and two `security definer` functions callable only by `service_role`, and strips `service_role` of all privileges on user tables. pgTAP proves the grants and the selection rules.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<timestamp>_appointment_reminders.sql` (create with `npx supabase migration new appointment_reminders`)

**Intent**: Store the opt-in on the profile (so it inherits the consent-gated RLS and dies with the profile on withdrawal), record which (plan, date) pairs were reminded, and give the cron exactly two narrow entry points. Header comment in the style of the S-03 migration, stating that the ledger is health data and that the functions are cron-only.

**Contract**:

- `public.profiles` gains:
  - `reminders_enabled boolean not null default false`;
  - `reminders_locale text` with `check (reminders_locale in ('pl', 'en'))`, nullable;
  - `reminders_enabled_at timestamptz`, server-owned.
- A `before insert or update` trigger on `profiles`: sets `reminders_enabled_at = now()` when `reminders_enabled` turns true (false → true, or inserted true) and `null` when it is false; otherwise keeps the old value.
- Grants: `update (reminders_enabled, reminders_locale)` on `profiles` to `authenticated`. No insert grant for these columns, so a new profile always starts off.
- `public.appointment_reminders`:
  - `id bigint generated always as identity primary key`;
  - `plan_id bigint not null references public.screening_plans (id) on delete cascade`;
  - `user_id uuid not null references auth.users (id) on delete cascade`;
  - `appointment_date date not null`;
  - `created_at timestamptz not null default now()`;
  - `sent_at timestamptz`;
  - `unique (plan_id, appointment_date)`.
  - RLS enabled with no policies; `revoke all` from `anon`, `authenticated` and `service_role`.
- `public.claim_due_appointment_reminders(p_today date, p_lead_days int, p_allowed_emails text[], p_limit int)`:
  - `security definer`, `set search_path = ''`.
  - Raises `22023` unless `p_lead_days between 1 and 30` and `p_limit between 1 and 100`.
  - Inserts ledger rows for every plan with `appointment_date > p_today and appointment_date <= p_today + p_lead_days` whose owner has `reminders_enabled` and an active consent (`on conflict do nothing`).
  - Returns `table (user_id uuid, email text, locale text, reminder_ids bigint[], appointment_dates date[])`: one row per user with at least one valid unsent row (see Critical Implementation Details), ordered by user id, at most `p_limit` rows.
    - `email` is taken from `auth.users` and is null when `p_allowed_emails` is not null and does not contain it (compare `lower()`).
    - `locale` is `coalesce(reminders_locale, 'pl')`.
    - `appointment_dates` are distinct and ascending.
- `public.mark_appointment_reminders_sent(p_ids bigint[])`: `security definer`, `set search_path = ''`, sets `sent_at = now()` where `id = any(p_ids) and sent_at is null`, and returns the number of rows updated.
- For both functions: `revoke execute … from public, anon, authenticated`; `grant execute … to service_role`.
- Hardening: `revoke all` on `profiles`, `health_data_consents`, `screening_plans` and `screening_completions` from `service_role`, plus the Postgres 17 `maintain` guard used in the S-03 migration. The same `truncate, trigger, references` (+ `maintain`) revoke from `authenticated` on the new table, as S-03 did.

#### 2. pgTAP

**File**: `supabase/tests/database/appointment_reminders.test.sql`

**Intent**: Cover every new grant, trigger and selection rule, in the style of `screening_records.test.sql` (postgres fixtures, `set local role`, `request.jwt.claims`, one rolled-back transaction).

**Contract**: At least these cases:

- **Grants:**
  - `authenticated` has UPDATE on `reminders_enabled` and `reminders_locale`, but not on `reminders_enabled_at`, and no INSERT on the reminder columns (`has_column_privilege`).
  - `anon`, `authenticated` and `service_role` have no privilege on `appointment_reminders`.
- **Guard:** for every table in `public` except `screening_catalog`, `service_role` has none of SELECT, INSERT, UPDATE, DELETE and TRUNCATE (one query over `pg_tables`, so a future table that forgets to revoke fails this test).
- **Function grants** (`has_function_privilege`): `anon` and `authenticated` cannot EXECUTE either function; `service_role` can.
- **As `service_role`:** reading `profiles` throws `42501`, and calling `claim` works.
- **Trigger:** as A with consent, turning reminders on sets `reminders_enabled_at`, turning them off clears it, and a direct write to it throws `42501`.
- **Selection,** with today = a fixed date and lead = 3:
  - a plan at +1 and one at +3 are claimed;
  - plans at +0 and +4 and a null date are not;
  - an opted-out user, a user without an active consent, and a user without a profile are not claimed;
  - two plans for one user give one row with two ids and two ascending dates.
- **Idempotency:** a second claim before `mark` returns the same ids (the ledger holds no duplicate rows). After `mark`, the rows are no longer returned. `mark` returns the count and is a no-op on already-sent ids.
- **Re-dating:** after a claim, moving the plan's date gives a new row for the new date, and the old date is not returned.
- **Allowlist:** an allowlist not containing the user returns `email` null (checked with different letter case too); null allowlist returns the email.
- **Limits:** invalid `p_lead_days` or `p_limit` raises `22023`.
- **Cascade:** deleting the plan deletes its ledger rows; withdrawal (`withdraw_health_data_consent()`) leaves A with no ledger rows and no profile.

#### 3. Generated types

**File**: `src/lib/database.types.ts`

**Intent**: Regenerate after the migration so Phases 2–3 are typed.

**Contract**: `npm run db:types`; commit the output.

### Success Criteria:

#### Automated Verification:

- Migration applies on a clean local database: `npx supabase db reset`
- pgTAP passes, including the new file: `npx supabase test db`
- Types regenerated and committed: `npm run db:types` leaves no diff after commit
- Lint and type check pass: `npm run lint` and `npx astro check`

#### Manual Verification:

- Read the migration and confirm neither function returns anything beyond user id, allowlisted email, locale, reminder ids and dates

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Opt-in toggle on /profile and the dashboard hint

### Overview

Users can turn reminders on and off. The UI tells them what gets emailed and through whom. The dashboard nudges users who have a dated plan but reminders off.

### Changes Required:

#### 1. Endpoint

**File**: `src/pages/api/reminders.ts`

**Intent**: Save the opt-in for the signed-in user, following the non-auth endpoint shape (`readForm`, redirect with `?error=<code>`, like `src/pages/api/profile.ts`).

**Contract**:

- `POST` with form field `enabled` = `on` | `off`.
- It updates the caller's `profiles` row: `reminders_enabled`, plus `reminders_locale = Astro.locals.locale` when turning on. It uses `.update(...).eq("user_id", user.id).select("user_id")`, so zero rows (no profile, or no active consent under RLS) is detected.
- Redirects:
  - success → `/profile?reminders=on` or `/profile?reminders=off`;
  - invalid form → `/profile?error=invalid_request`;
  - no profile or no consent → `/onboarding`;
  - database error → `/profile?error=reminders_failed`;
  - no session → `/auth/signin`.

**File**: `src/middleware.ts`

**Intent**: Protect the new endpoint.

**Contract**: add `/api/reminders` to `PROTECTED_ROUTES`.

#### 2. Reminders section on /profile

**Files**:

- `src/components/profile/RemindersForm.astro` (new);
- `src/pages/profile.astro`.

**Intent**: A static Astro form, placed between the profile form and withdrawal with `id="reminders"`. It shows the current state, a status line after a save, and one submit button that flips the state. No React island.

**Contract**:

- The disclosure says four things:
  - one email 1–3 days before each appointment date the user enters;
  - it contains the date and a link, never the exam name;
  - it is sent through our email provider (Resend) to the account address;
  - it can be turned off here at any time.
- The email reaches only allowlisted addresses. The UI does not mention this; production has only the owner and the tester.
- `reminders_*` error codes show in this section; `profile.astro` routes them as it does the `withdraw_` codes.

#### 3. Dashboard hint

**File**: `src/pages/dashboard.astro`

**Intent**: When `profile.reminders_enabled` is false and at least one plan has an `appointment_date`, show one line linking to `/profile#reminders`.

**Contract**: the hint element carries `data-reminders-hint` for smoke assertions. No extra query: the profile is already read.

#### 4. Texts

**Files**:

- `src/i18n/pl.ts`, `src/i18n/en.ts`: keys `profile.reminders.*` (heading, disclosure, state on/off, turn on/off buttons, saved on/off), `dashboard.reminders.hint`, `errors.reminders_failed`.
- `profile.withdraw.deleted`: also say that reminders are switched off.
- `src/pages/api/consent/withdraw.ts:8-9`: fix the stale comment; withdrawal deletes plans, completions and the profile.

**Intent**: Polish default and English, as in the S-03 keys.

**Contract**: every new key exists in both files. `errors.reminders_failed` resolves through `errorMessageKey()`.

#### 5. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: HTTP-level proof of the toggle and the hint in the existing account flow.

**Contract**: new steps placed after the step that plans with a date 30 days ahead (`scripts/smoke.mjs:165`) and before the step that clears the date (`:223`), so the smoke user has a dated plan.

- The dashboard shows `data-reminders-hint`.
- `POST /api/reminders enabled=on` → 302 `/profile?reminders=on`.
- `/profile` shows the on state.
- The dashboard no longer shows the hint.
- `enabled=off` → 302 `/profile?reminders=off`.
- An invalid `enabled` value → 302 `/profile?error=`.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`
- Smoke passes against local preview: `BASE_URL=http://localhost:4321 npm run smoke`
- pgTAP still passes: `npx supabase test db`

#### Manual Verification:

- On `/profile`, turn reminders on and off in Polish and English; the state, disclosure and status line read correctly
- With a dated plan and reminders off, the dashboard hint appears and links to the Reminders section

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Reminder job on the daily cron

### Overview

The Worker claims due reminders through the secret key, sends one Resend batch, marks the rows sent, and logs counts only. CI exercises the database path in dry run.

### Changes Required:

#### 1. Env

**Files**:

- `astro.config.mjs`;
- `.env.example`.

**Intent**: Declare the three new server-only secrets.

**Contract**:

- `SUPABASE_SECRET_KEY`, `REMINDER_ALLOWED_TO` and `EMAIL_FROM`: optional `astro:env/server` secret strings.
- A comment says `SUPABASE_SECRET_KEY` is used only by the reminder job, and that `REMINDER_ALLOWED_TO` is a comma-separated allowlist where unset means everyone, and that `EMAIL_FROM` is the sender (e.g. `Dbam <przypomnienia@send.<domain>>`), falling back to Resend's sandbox sender when unset.

#### 2. Shared schedule gate

**Files**:

- `src/lib/schedule.ts` (new);
- `src/lib/heartbeat.ts`.

**Intent**: Move the daily cron constant, `warsawHour` and the "is this the 10:00 Warsaw run" check out of the heartbeat so both jobs share one gate. The heartbeat's behaviour stays the same.

**Contract**: exports `DAILY_CRON`, `PROVING_CRON` and `isDailySendRun(cron, scheduledTime): boolean`. The heartbeat keeps its `shouldSend` switch and `UnknownCronError`, re-exporting its existing constant names if anything imports them.

#### 3. Batch send

**File**: `src/lib/email.ts`

**Intent**: One Resend call for many recipients, and a configurable sender for both send functions.

**Contract**:

- The sender is `EMAIL_FROM` when set, else the current `Dbam <onboarding@resend.dev>`. The heartbeat therefore keeps working before the domain is verified, and switches sender once `EMAIL_FROM` is set.

- `sendEmailBatch({ messages: { to, subject, text }[], idempotencyKey })` → `{ ids: string[] } | { dryRun: true }`.
- It POSTs to `https://api.resend.com/emails/batch` with the same sender, timeout, `Idempotency-Key`, config and error handling as `sendEmail`.
- It rejects an empty list or more than 100 messages.
- Its dry-run log carries `{event: "email", outcome: "dry-run", idempotencyKey, count}`, with no recipients or subjects.

#### 4. Cron-only Supabase client

**File**: `src/lib/reminders/admin-client.ts` (new)

**Intent**: The only place the secret key is used.

**Contract**:

- `createReminderClient()` builds `@supabase/supabase-js` `createClient<Database>(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } })`.
- It throws `ReminderConfigError` when either value is missing.
- An ESLint `no-restricted-imports` block forbids importing this module from `src/pages/**`, `src/components/**`, `src/layouts/**` and `src/middleware.ts`.

#### 5. The job

**File**: `src/lib/reminders/appointment.ts` (new)

**Intent**: `runAppointmentReminders({ cron, scheduledTime })`.

**Contract**:

- **Gate:** skips unless `isDailySendRun`.
- **Claim:** today = `warsawToday(new Date(scheduledTime))`, then call `claim_due_appointment_reminders` with:
  - `p_lead_days = APPOINTMENT_REMINDER_LEAD_DAYS` (3);
  - `p_allowed_emails` = parsed `REMINDER_ALLOWED_TO`, or null;
  - `p_limit` = 100.
- **Build:** one message per row with a non-null email, using `createT(row.locale)`:
  - subject `email.appointmentReminder.subject`;
  - body with the dates formatted by `formatDay`;
  - the count via `t.plural`;
  - a dashboard link and a `/profile#reminders` opt-out link built from `import.meta.env.SITE`.
- **Send:** `sendEmailBatch` with key `dbam-appointment-reminder:` + SHA-256 hex (Web Crypto) of the sorted reminder ids.
- **Mark:** unless dry run, call `mark_appointment_reminders_sent` with those ids.
- **Returns and logs:** `"none" | "skipped" | "dry-run" | "sent"`. Logs are JSON `{event: "appointment-reminder", outcome, cron, scheduledAt, due, undeliverable, sent}` (counts only). On failure, log the error name and, for `EmailSendError`, status and error name, never `message`; then rethrow.

**Files**:

- `src/i18n/pl.ts`, `src/i18n/en.ts`: keys `email.appointmentReminder.*` (subject, greeting, body with `_one`/`_few`/`_many`/`_other` plural forms, dashboard link line, opt-out line). No exam names.
- `eslint.config.js`: add `src/lib/reminders/appointment.ts` to the `no-console` exemption.

#### 6. Worker entry

**File**: `src/worker.ts`

**Intent**: Run both jobs independently.

**Contract**: `scheduled()` awaits `Promise.allSettled([runHeartbeat(...), runAppointmentReminders(...)])` and then throws the first rejection's reason, if any. The comment is updated.

#### 7. CI and docs

**Files**:

- `.github/workflows/ci.yml`: the grep also keeps `SECRET_KEY`; the `.env` line also writes `SUPABASE_SECRET_KEY`; the scheduled-handler comment mentions the reminder job.
- `README.md`: the env table and the cron section describe the reminder job, how to run it locally (`/cdn-cgi/local/scheduled` with a dated plan and `EMAIL_DRY_RUN=true`) and its log line.

**Intent**: CI's scheduled-handler loop runs the real claim against local Supabase (zero rows → `none`), so broken wiring or a wrong grant fails the PR.

**Contract**: the loop still requires `"outcome":"ok"`.

### Success Criteria:

#### Automated Verification:

- Lint passes (including the new restricted-import rule): `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`
- pgTAP passes: `npx supabase test db`
- Smoke passes against local preview: `BASE_URL=http://localhost:4321 npm run smoke`
- The scheduled handler returns `"outcome":"ok"` locally for `0 8,9 * * *` at `time=1790841600000` with `SUPABASE_SECRET_KEY` set and `EMAIL_DRY_RUN=true`

#### Manual Verification:

- Locally, with an opted-in user whose plan is dated 1–3 days after the run date, the dry-run log shows `due: 1` and no email address. A second run shows the same `due` (dry run marks nothing).
- Locally, with `REMINDER_ALLOWED_TO` set to another address, the log shows `undeliverable: 1` and nothing is sent.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Docs and production enablement

### Overview

Record the new key as a sanctioned exception and the sending domain as a narrowed roadmap decision. The owner then verifies the domain, provisions the secrets and proves real reminders for both production users.

### Changes Required:

#### 1. Rules

**Files**:

- `CLAUDE.md` (Hard rules): new bullet. `SUPABASE_SECRET_KEY` is a server-only secret used only by `src/lib/reminders/admin-client.ts` (enforced by lint). It must never feed the SSR client. Every new `public` table must revoke `service_role` (guarded by pgTAP).
- `context/changes/deployment/deployment-plan.md` §1.6: an amendment under the "Never `service_role` / `sb_secret_…`" bullet. The rule stands for `SUPABASE_KEY`; S-04 adds a separate, cron-only secret key, narrowed in the database. The note links this plan.
- `context/foundation/roadmap.md` F-02 Unknowns: append a note to the "no custom domain" line: resolved 2026-09-30, S-04 verifies a sending domain in Resend; the site stays on `workers.dev`, and Workers stay on Free.
- `README.md`: a short section on the sending domain (Resend domain, DNS records, `EMAIL_FROM`).

**Intent**: Keep the "Never" rule true for the SSR key while documenting the one exception and why it is safe, and keep the roadmap truthful about the domain.

**Contract**: prose only.

#### 2. Production (owner, before merging the PR)

**Intent**: The daily run needs the key and allowlist as soon as the code deploys, or the reminder job fails loudly every day. Sending to the tester needs the verified domain.

**Contract**:

- **The owner creates the key.** In Supabase Dashboard → Project Settings → API Keys, create a new secret key named `dbam-cron`. It goes straight into `npx wrangler secret put SUPABASE_SECRET_KEY`: never in chat, the repo or an agent session.
- **The owner verifies a sending domain.** Use a domain the owner already has, or a cheap new one (Cloudflare DNS is free). In Resend → Domains, add a subdomain such as `send.<domain>`, add the SPF/DKIM TXT and MX records Resend shows, and wait for "Verified".
- **The owner sets the sender:** `npx wrangler secret put EMAIL_FROM`, e.g. `Dbam <przypomnienia@send.<domain>>`.
- **The owner sets the allowlist:** `npx wrangler secret put REMINDER_ALLOWED_TO` with the owner's and the tester's addresses, comma-separated.
- After merge, CI's `migrate` job applies the migration before `deploy`.

### Success Criteria:

#### Automated Verification:

- Formatting passes on changed docs: `npx prettier --check CLAUDE.md README.md context/changes/deployment/deployment-plan.md context/foundation/roadmap.md`

#### Manual Verification:

- The sending domain shows "Verified" in Resend
- `SUPABASE_SECRET_KEY`, `EMAIL_FROM` and `REMINDER_ALLOWED_TO` exist on the `dbam` Worker (`npx wrangler secret list` shows the names) before the PR is merged
- In production, the owner and the tester each turn reminders on and plan an exam 1–3 days ahead; the next 10:00 Warsaw run delivers one email to each inbox from the new sender, with the date and working links, and Trigger Events shows the run as successful
- The following day's run sends no duplicate for the same date

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- No unit runner exists yet (F-03 is `ready`, not done). Selection logic lives in SQL and is covered by pgTAP; the Worker job is thin glue.

### Integration Tests:

- pgTAP: grants, the `service_role` guard over all `public` tables, the trigger, the window, the consent and opt-in gates, idempotency, re-dating, the allowlist and cascades.
- Smoke: toggle on/off, invalid input, and the dashboard hint.
- CI scheduled-handler loop: the real claim against local Supabase through the secret key, in dry run.

### Manual Testing Steps:

1. Locally, opt in, plan an exam dated tomorrow, and run `/cdn-cgi/local/scheduled?cron=0+8,9+*+*+*&time=<today 08:00Z in ms>&format=json`. Check the dry-run log.
2. Set `REMINDER_ALLOWED_TO` to another address and repeat. Expect `undeliverable: 1`.
3. In production, do the owner and tester checks in Phase 4.

## Performance Considerations

Each run makes 4 subrequests (heartbeat send, claim, batch send, mark sent) out of 50. Selection is one set-based SQL call using `screening_plans_appointment_date_idx`. Worker CPU is message formatting plus one SHA-256 over at most 100 users. More than 100 due users are served over following days while their dates stay in the window. S-06 will revisit this when volumes grow.

## Migration Notes

The migration is additive except for revoking `service_role` privileges, which nothing uses today. A Worker rollback leaves the columns, table and functions unused and harmless. Run `npm run db:types` after the migration and commit the result.

## References

- Research: `context/changes/appointment-reminder/research.md`
- Roadmap: `context/foundation/roadmap.md` S-04; issue #22
- Definer pattern: `supabase/migrations/20260930093108_screening_records.sql:194-216`
- Column-grant pattern: `supabase/migrations/20260927190303_onboarding_profile.sql:43-46,124-129`
- Dispatch path: `src/worker.ts`, `src/lib/heartbeat.ts`, `src/lib/email.ts`
- F-02 decisions: `context/archive/2026-09-29-reminder-dispatch-path/plan.md`, `research.md:139,165`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database — opt-in columns, reminder ledger and cron-only functions

#### Automated

- [x] 1.1 Migration applies on a clean local database — a8a98f3
- [x] 1.2 pgTAP passes, including the new file — a8a98f3
- [x] 1.3 Types regenerated and committed — a8a98f3
- [x] 1.4 Lint and type check pass — a8a98f3

#### Manual

- [ ] 1.5 Neither function returns more than id, allowlisted email, locale, reminder ids and dates

### Phase 2: Opt-in toggle on /profile and the dashboard hint

#### Automated

- [x] 2.1 Lint passes — 23beafe
- [x] 2.2 Type check passes — 23beafe
- [x] 2.3 Build passes — 23beafe
- [x] 2.4 Smoke passes against local preview — 23beafe
- [x] 2.5 pgTAP still passes — 23beafe

#### Manual

- [ ] 2.6 Toggle on and off in Polish and English reads correctly
- [ ] 2.7 Dashboard hint appears with a dated plan and reminders off

### Phase 3: Reminder job on the daily cron

#### Automated

- [x] 3.1 Lint passes (including the restricted-import rule) — 289347c
- [x] 3.2 Type check passes — 289347c
- [x] 3.3 Build passes — 289347c
- [x] 3.4 pgTAP passes — 289347c
- [x] 3.5 Smoke passes against local preview — 289347c
- [x] 3.6 Scheduled handler returns outcome ok locally with the secret key in dry run — 289347c

#### Manual

- [ ] 3.7 Local dry run with a due plan logs due 1 without an address, twice
- [ ] 3.8 Local run with another allowlist logs undeliverable 1

### Phase 4: Docs and production enablement

#### Automated

- [x] 4.1 Formatting passes on changed docs — dca7fbe

#### Manual

- [ ] 4.2 Sending domain shows Verified in Resend
- [ ] 4.3 Key, sender and allowlist secrets exist on the dbam Worker before merge
- [ ] 4.4 Owner and tester each receive one real reminder and the run succeeds
- [ ] 4.5 No duplicate reminder the following day
