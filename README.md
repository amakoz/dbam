# Dbam

Dbam helps adults in Poland (30+) see which preventive screenings are due for their age and situation, grouped by importance, and plan them or mark them done. Once a planned appointment date has passed, one click confirms the exam took place on that day, and the exam comes back as due when its repeat interval elapses. It does not diagnose anything: it shows recommendations from a curated screening catalog built from NFZ programmes and medical society guidelines and keeps track of what you have planned and done. Users can opt in to reminder emails: before a recorded appointment, when a done exam is due again, and as a nudge when a planned exam still has no date or a past appointment is unconfirmed.

The UI is in Polish by default, with English as a second language.

## Tech Stack

- [Astro](https://astro.build/) v7 - Modern web framework with server-first rendering
- [React](https://react.dev/) v19 - UI library for interactive components
- [TypeScript](https://www.typescriptlang.org/) v6 - Type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) v4 - Utility-first CSS framework
- [Supabase](https://supabase.com/) - Authentication and backend-as-a-service
- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge deployment runtime

## Prerequisites

- Node.js v22.14.0 (as specified in `.nvmrc`)
- npm (comes with Node.js)

## Getting Started

1. Clone the repository:

```bash
git clone https://github.com/amakoz/dbam.git
cd dbam
```

2. Install dependencies:

```bash
npm install
```

3. Set up Supabase and configure environment variables — see [Supabase Configuration](#supabase-configuration) below.

4. Create a `.dev.vars` file for local Cloudflare dev secrets:

```bash
cp .env.example .dev.vars
```

5. Run the development server:

```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server (Cloudflare workerd runtime)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint with type-checked rules
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Run Prettier
- `npm run smoke` - Smoke test the auth flow against a running server (`BASE_URL`, defaults to `http://localhost:4321`)
- `npm test` - Run the Vitest unit tests (colocated `src/**/*.test.ts`) once
- `npm run ui:check` - Fail on hardcoded colours and arbitrary values in the views migrated to the design system (see [Design system](#design-system))
- `npm run ui:shots` - Save light/dark screenshots of the key views at 1440px and 390px from a running dev server (see [UI screenshots](#ui-screenshots))
- `npm run db:types` - Regenerate `src/lib/database.types.ts` from the local database
- `npm run cf:types` - Regenerate `worker-configuration.d.ts` (Worker runtime types and `Env`) from `wrangler.jsonc` and `.dev.vars` (commit it)
- `npm run catalog:check` - Validate the screening catalog entries and check they match the newest snapshot migration
- `npm run catalog:migration` - Generate a snapshot migration from `catalog/entries/`
- `npm run catalog:schema` - Regenerate `catalog/entry.schema.json` from the entry schema

### Agent Stop hook

Worker agent sessions (`DBAM_CHANGE` set; reviewers with `DBAM_ROLE=review` and human sessions are skipped) run `scripts/stop-lint.mjs` as a Claude Code `Stop` hook, registered in `.claude/settings.json`. It runs ESLint (errors only) on the files changed against `origin/main` and blocks a turn ending with `STATUS: done` while errors remain, giving up after 3 consecutive blocks so it cannot trap an agent. The block counter and the last ESLint output live in the worktree's git dir: `git rev-parse --git-path dbam-stop-lint.log`.

### Agent docs MCP (Context7)

`.mcp.json` registers the [Context7](https://context7.com) MCP server (`https://mcp.context7.com/mcp`, no API key), so Claude Code sessions can look up current library docs. `enabledMcpjsonServers` in `.claude/settings.json` approves it without a prompt once you trust the folder; worktrees inherit the main checkout's trust. To turn it off for yourself, add `"disabledMcpjsonServers": ["context7"]` to `~/.claude/settings.json` or `.claude/settings.local.json`. If the keyless rate limit ever bites, configure a key in your user or local scope, never in the repo.

## Project Structure

```md
.
├── src/
│ ├── layouts/ # Astro layouts
│ ├── pages/ # Astro pages
│ │ └── api/ # API endpoints
│ ├── components/ # UI components (Astro & React)
│ └── assets/ # Static assets
├── public/ # Public assets
├── wrangler.jsonc # Cloudflare Workers config
```

## Design system

The UI uses theme A "Len i szałwia" (linen and sage), light and dark from the system colour scheme.

- **Tokens:** `src/styles/global.css` — colours are `light-dark()` values under `color-scheme: light dark`, published to Tailwind via `@theme inline` (including the tier-1..3 and success tokens). Views reference roles (`bg-primary`, `text-muted-foreground`, `bg-tier-1`), never raw colours.
- **Browser support:** Baseline 2024 — Chrome/Edge 123+, Firefox 120+, Safari/iOS 17.5+ (the PRD's "last two major versions"). `vite.build.cssTarget` keeps `light-dark()` native; older browsers render without token colours.
- **Components:** shadcn/ui ("new-york") in `src/components/ui/`. Add missing ones with `npx shadcn@latest add <name>`.
- **Kitchen sink:** `/dev/kitchen-sink` renders the tokens and components; dev only (404 in production).
- **Migrated views:** every page — landing, sign-in, sign-up, confirm-email, onboarding, dashboard, profile, 404 and 500 — plus the kitchen sink. The exact file list is `MIGRATED` in `scripts/ui-check.mjs`; a new view adds its files there.
- **Form kit:** `src/components/forms/` holds the shared form pieces (`FormField`, `ChoiceGroup`, `PasswordToggle`, `SubmitButton` with a `pending` prop, `ServerError`), built on the shadcn components. The kitchen sink shows their states.
- **Check:** `npm run ui:check` (`scripts/ui-check.mjs`) scans the migrated views for Tailwind palette classes, hex/rgb/hsl/oklch literals and arbitrary px/rem values, prints `file:line` hits and exits 1. It runs in CI and in the pre-commit hook. Only the files listed in the script are checked; when a follow-up change migrates a view, it appends the files to that list and to the matching lint-staged glob in `package.json`.

## Supabase Configuration

This project uses [Supabase](https://supabase.com/) for authentication. Environment variables are declared via Astro's `astro:env` schema and are treated as **server-only secrets** — they are never exposed to the client.

### First-time setup (local, no cloud project needed)

Requires [Docker](https://www.docker.com/) and ~7 GB RAM.

1. Create your `.env` file:

```bash
cp .env.example .env
```

2. Initialize the local Supabase project (creates a `supabase/` config folder):

```bash
npx supabase init
```

3. Start the local stack (downloads Docker images on first run):

```bash
npx supabase start
```

4. Copy the credentials printed by the CLI into your `.env` and `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
# only for the appointment reminder cron job: SECRET_KEY from `npx supabase status -o env`
SUPABASE_SECRET_KEY=<secret key from CLI output>
```

5. To stop the stack when done:

```bash
npx supabase stop
```

The local Studio UI is available at `http://localhost:54323`.

### Database

The schema lives in `supabase/migrations/` (`health_data_consents` and `profiles`, both with row-level security so users only ever see their own rows). `npx supabase start` applies migrations; `npx supabase db reset` re-applies them from scratch.

- New migration: `npx supabase migration new <name>`. Keep migrations additive — a Worker rollback never undoes a schema change.
- After a schema change, regenerate the typed client: `npm run db:types` (writes `src/lib/database.types.ts`; commit it).
- Access rules are tested with pgTAP: `npx supabase test db` (`supabase/tests/`).
- Production gets migrations only from the CI `migrate` job (see [CI](#ci)); never run `supabase db push` against production by hand.

### Using a cloud Supabase project instead

If you prefer to use a hosted Supabase project, add these variables to your `.env` and `.dev.vars` files:

| Variable              | Description                                                                                                                                                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`        | Project URL from Supabase dashboard → Settings → API                                                                                                                                                                                                       |
| `SUPABASE_KEY`        | `anon` public key from Supabase dashboard → Settings → API                                                                                                                                                                                                 |
| `SUPABASE_SECRET_KEY` | Secret key (`sb_secret_…`), used only by the reminder cron jobs (appointment, due-screening and follow-up nudge, `src/lib/reminders/admin-client.ts`). The database lets it execute the seven reminder functions and read the public catalog, nothing else |
| `EMAIL_FROM`          | Optional. Sender for every email, e.g. `Dbam <przypomnienia@notification.dbam.net.pl>` on the domain verified in Resend; unset falls back to Resend's sandbox sender                                                                                       |

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
```

### Email confirmation in local development

By default Supabase requires email confirmation before a user can sign in. To skip this during local development:

1. Open the Supabase dashboard for your project
2. Go to **Authentication → Email → Confirm email**
3. Toggle it **off**

Users can then sign in immediately after sign-up without clicking a confirmation link.

### Auth routes

| Route                 | Description                                                                                                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/auth/signin`        | Email/password sign-in form                                                                                                                                                                    |
| `/auth/signup`        | Email/password sign-up form                                                                                                                                                                    |
| `/auth/confirm-email` | Post-signup "check your inbox" page                                                                                                                                                            |
| `/api/auth/callback`  | Confirmation-email target: exchanges the PKCE `code` and signs the user in (other browser/device → sign-in page with "email confirmed"). Its URL must be allowed in Supabase **Redirect URLs** |
| `/dashboard`          | Screening recommendations for the signed-in user (redirects to `/auth/signin` if unauthenticated)                                                                                              |

Route protection is handled in `src/middleware.ts`. Add paths to the `PROTECTED_ROUTES` array there to require authentication.

### Password policy

Sign-up requires a password of at least 12 characters with at least one letter and one digit. The rule is defined once in `src/lib/password.ts`: the sign-up form lists it live and the sign-up endpoint redirects with `?error=weak_password` before calling Supabase. Supabase Auth enforces the same policy on its side, so all three places must match:

- Local: `supabase/config.toml` → `[auth]` `minimum_password_length = 12`, `password_requirements = "letters_digits"` (applied when the local stack restarts).
- Production: Supabase dashboard → **Authentication → Sign In / Providers → Email** (direct link: `https://supabase.com/dashboard/project/_/auth/providers?provider=Email`) → minimum password length **12**, password requirements **Letters and digits**, then save. Set it there by hand; never `supabase config push` the local config (it also disables email confirmations).

## Screening catalog

The screening catalog (`public.screening_catalog`) is filled from reviewed JSON files in `catalog/entries/`, never by hand: `npm run catalog:check` validates them (CI runs it), and `npm run catalog:migration` turns them into a generated snapshot migration. See [`catalog/README.md`](catalog/README.md) for the entry format, the lifecycle and the ship workflow.

## Translations

The UI is in Polish by default, with English as a second language. The locale comes from the `lang` cookie (set by the PL/EN switcher in `src/layouts/Layout.astro` through `POST /api/locale`); URLs are not prefixed.

- Strings live in typed dictionaries in `src/i18n/`: `pl.ts` defines the keys, and `en.ts` must define every one of them (a missing key fails `astro check`).
- Astro pages and components translate with `createT(Astro.locals.locale)`; React islands receive `locale` as a prop and call `createT(locale)` themselves.
- Plurals use `_one`/`_few`/`_many`/`_other` key suffixes and `t.plural(baseKey, count)`, which picks the form with `Intl.PluralRules`.
- Endpoints redirect with `?error=<code>`, and pages show the matching message: `errors.auth.<code>` for auth endpoints (`src/lib/auth-errors.ts`), `errors.<code>` for the others (`errorMessageKey()` in `src/lib/errors.ts`). Unknown codes show a generic message.

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/).

1. Build the project:

```bash
npm run build
```

2. Deploy with Wrangler:

```bash
npx wrangler deploy
```

Set `SUPABASE_URL` and `SUPABASE_KEY` as secrets in your Cloudflare dashboard or via `npx wrangler secret put`.

The scheduled heartbeat email (see [Scheduled jobs](#scheduled-jobs)) needs two more secrets:

```bash
npx wrangler secret put RESEND_API_KEY     # Resend API key with sending-only permission
npx wrangler secret put REMINDER_TEST_TO   # heartbeat recipient, and the failure-alert recipient
```

Unless `EMAIL_FROM` is set to a sender on a domain verified in Resend, mail is sent from Resend's test sender `onboarding@resend.dev`, which delivers only to the Resend account owner's address, so `REMINDER_TEST_TO` must be exactly the email the Resend account was created with. A `+tag` variant of that address is rejected with a 403 `validation_error`. Leave `EMAIL_DRY_RUN` unset in production (it defaults to `false`).

### Sending domain

Appointment reminders go to real users, so production sends from a domain verified in Resend: **`notification.dbam.net.pl`**. The domain is for email only: the site stays on `workers.dev`.

- **DNS** is hosted at nazwa.pl (`dbam.net.pl`). Resend's records live under the subdomain: the DKIM TXT at `resend._domainkey.notification.dbam.net.pl`, and the MX + SPF TXT at `send.notification.dbam.net.pl`. Resend → Domains must show the domain as "Verified".
- **Sender** (Worker secret):

```bash
npx wrangler secret put EMAIL_FROM   # Dbam <przypomnienia@notification.dbam.net.pl>
```

Until `EMAIL_FROM` is set, mail falls back to `Dbam <onboarding@resend.dev>`, which reaches only the Resend account owner. Once it is set, reminders go to every opted-in user's account address.

### Scheduled jobs

`src/worker.ts` is the Worker entry (`main` in `wrangler.jsonc`): HTTP requests go to the Astro adapter, and Cron Triggers (`triggers.crons`) run `scheduled()`, which runs two independent parts: the heartbeat email from `src/lib/heartbeat.ts` and the reminder chain (`src/lib/reminders/chain.ts`: the appointment reminders from `src/lib/reminders/appointment.ts`, then the due-screening reminders from `src/lib/reminders/due-screening.ts`, then the follow-up nudges from `src/lib/reminders/follow-up-nudge.ts`), all sending through `src/lib/email.ts`. One failing part doesn't stop the other; the run is still marked failed. Cron runs in UTC; the shared schedule gate is `src/lib/schedule.ts`. `*/30 * * * *` sends on every run; `0 8,9 * * *` sends only on the run that is 10:00 in Europe/Warsaw, so it stays at 10:00 across daylight saving time. Any other cron string fails the run. Production runs `0 8,9 * * *`: one heartbeat email a day at 10:00 Warsaw time (the 08:00 and 09:00 UTC runs are both needed because Warsaw's UTC offset changes with daylight saving; one of them always skips).

Run it locally against `npm run dev` or `npm run build && npm run preview`. With `EMAIL_DRY_RUN=true` (the `.env.example` default) it only logs a `dry-run` line and sends nothing:

```bash
curl 'http://localhost:4321/cdn-cgi/local/scheduled?cron=*%2F30+*+*+*+*&format=json'
# daily cron at a given time (epoch ms): 2026-10-01T08:00Z is 10:00 in Warsaw, so it sends
curl 'http://localhost:4321/cdn-cgi/local/scheduled?cron=0+8%2C9+*+*+*&time=1790841600000&format=json'
```

**Appointment reminders** run only on the daily cron's 10:00 Warsaw run (every other run logs `skipped`). The job calls `claim_due_appointment_reminders` with `SUPABASE_SECRET_KEY` (required: without it or `SUPABASE_URL` the job fails with `ReminderConfigError`, even in dry run). The database returns every opted-in user with an active consent and a plan dated 1–3 Warsaw days after the run date that hasn't been reminded for that date yet, with the account's email address. The job sends one email per user (dates and a count, never an exam name) in one Resend batch, then marks those reminders sent. With `EMAIL_DRY_RUN=true` it sends nothing and marks nothing, so the same reminders are due again on the next run. To try it locally: turn reminders on in `/profile`, plan a screening with an appointment date 1–3 days after the run date (the `time` below is 2026-10-01, so 2–4 October 2026), and call the daily `curl` above. Each run logs one line (counts only, no addresses or subjects):

```json
{
  "event": "appointment-reminder",
  "outcome": "dry-run",
  "cron": "0 8,9 * * *",
  "scheduledAt": "2026-10-01T08:00:00.000Z",
  "due": 1,
  "sent": 0
}
```

`outcome` is `skipped` (not the 10:00 run), `none` (nothing to send), `dry-run` or `sent`, or `failed` with the error name (plus Resend's status and error name, or the database step and SQLSTATE). `due` counts claimed users and `sent` the emails Resend accepted.

**Due-screening reminders** (S-06) email an opted-in user when a screening they marked done, or confirmed after the appointment, is due again because its repeat interval has run out, without the user entering anything. They run right after the appointment job, on the same 10:00 Warsaw run (other runs log `skipped`). `get_due_screening_candidates` returns up to `DUE_CANDIDATE_LIMIT` (50, `src/lib/screenings/due.ts`) users who might owe a reminder, with the five profile fields the rules read and each done exam's anchor month, and never an email, name or exact day. `dueScreeningItems` then decides with the dashboard's own rules (the same `classifyEntries` and `partitionDashboard` that F-08 tests), so an exam the dashboard no longer recommends, one with a plan, or one without a fixed interval never fires. `claim_due_screening_reminders` re-checks live data and records one `due_screening_reminders` ledger row per completion cycle (user, exam, anchor month), so a user is reminded once per cycle and not again unless they re-date or re-mark the exam. The job sends one email per user (a count and two links, never an exam name or a due month) in one Resend batch, then marks the rows sent. A user the run could not reach, because of the 50-user candidate limit or the shared budget below, is picked up by the next daily run (the candidate order rotates daily). First-time eligibility (aged into an exam, new catalog entry) is not reminded: see `context/changes/due-screening-reminder/follow-ups/first-time-eligibility.md`. To try it locally: seed an opted-in user with consent and a done exam whose interval has run out (for example `dental-check-up`, every 6 months, last done 7 months ago), then call the daily `curl` above for the right date. The log line is:

```json
{
  "event": "due-screening-reminder",
  "outcome": "dry-run",
  "cron": "0 8,9 * * *",
  "scheduledAt": "2026-10-06T08:00:00.000Z",
  "candidates": 1,
  "due": 1,
  "sent": 0
}
```

`outcome` is `skipped` (not the 10:00 run, or `reason: "no-budget"` when the appointment job failed or used the whole budget), `none`, `dry-run`, `sent` or `failed` (error name and whitelisted details only). `candidates` counts users the database offered, `due` users the rules found due and the claim returned, `sent` emails Resend accepted. Counts only: no slug, address or subject.

**Follow-up nudges** (S-07) email an opted-in user when a planned exam has had no appointment date for 14 days (FR-011) or an appointment date passed 7 days ago without a confirmation (FR-012). They run last, after the due-screening job, on the same 10:00 Warsaw run (other runs log `skipped`). `claim_follow_up_nudges` decides in SQL alone, with the thresholds passed in from `src/lib/reminders/nudge-message.ts` (`SCHEDULE_NUDGE_AFTER_DAYS`, `CONFIRM_NUDGE_AFTER_DAYS`): a plan on an active catalog entry whose owner has reminders on and an active consent. A missing date counts from the Warsaw date of the plan's `updated_at`, so re-saving a plan without a date restarts the 14 days, and clearing a passed plan's date does too. Each (plan, kind, cycle) is recorded once in the `follow_up_nudges` ledger and nudged at most once: there is no repeat, and a re-saved or re-dated plan starts a new cycle. A user who already got an appointment or due-screening email that Warsaw day is skipped and picked up by a later run, and users with a past appointment to confirm come before users with only missing dates. The job sends one email per user (a count per kind, a dashboard link and an opt-out link, never an exam name) in one Resend batch, then marks the rows sent. On the first run after launch every eligible existing plan qualifies; the shared budget caps the run and the rest roll over to the following days. To try it locally: seed an opted-in user with consent, an undated plan whose `updated_at` is 15 days before the run date and a plan dated 8 days before it, then call the daily `curl` above for the right date: the log shows `dry-run` with `due: 1`. Insert an `appointment_reminders` row with `sent_at` on the run date for that user and the same call logs `none`. The log line is:

```json
{
  "event": "follow-up-nudge",
  "outcome": "dry-run",
  "cron": "0 8,9 * * *",
  "scheduledAt": "2026-10-06T08:00:00.000Z",
  "due": 1,
  "sent": 0
}
```

`outcome` is `skipped` (not the 10:00 run, or `reason: "no-budget"` when the earlier jobs failed or used the whole budget), `none`, `dry-run`, `sent` or `failed` (error name and whitelisted details only). `due` counts users the claim returned, `sent` emails Resend accepted. Counts only: no slug, address or subject. The S-04/S-06 overlap that remains is in `context/changes/follow-up-nudges/follow-ups/cross-job-overlap.md`.

**Shared email budget.** The three reminder jobs share `REMINDER_EMAIL_DAILY_BUDGET` (92, `src/lib/email-budget.ts`) emails a day, in order: the due job may send 92 minus what the appointment job sent, and the nudge job what is left after both. A job gets 0 when an earlier job failed (its use of the quota is then unknown). 92 comes from Resend's 3,000-a-month cap, not the 100-a-day one: 31 days × (92 reminders + 1 heartbeat + 3 possible failure alerts) = 2,976.

For one real send, put a real `RESEND_API_KEY` and `REMINDER_TEST_TO` plus `EMAIL_DRY_RUN=false` in `.dev.vars`, restart the server and call the first `curl` again. Set `EMAIL_DRY_RUN=true` back afterwards.

`EMAIL_DRY_RUN` accepts only the literal `true` or `false`. Any other value (`1`, `TRUE`, `yes`) fails `astro:env` validation when the Worker starts and breaks every request, not just the cron. Production leaves it unset, which means `false`; never `wrangler secret put` it.

In production:

- **Runs:** Cloudflare dashboard → Workers → `dbam` → Settings → Trigger Events (the last 100 invocations), and Workers Logs (one `heartbeat`, one `appointment-reminder`, one `due-screening-reminder` and one `follow-up-nudge` JSON line per run with its outcome; no recipient or key; a failed job also logs an `error` line and a failed reminder run a `failure-alert` line, see [Errors and alerts](#errors-and-alerts)). A cron change takes up to 15 minutes to take effect after a deploy.
- **Free-plan limits:** 10 ms CPU per cron run (waiting on the network doesn't count), 50 subrequests per run, and 5 Cron Triggers per account. Resend's free tier allows 100 emails a day and 3,000 a month (see the shared budget above), and rate-limits API calls per second per team: the heartbeat, the three reminder batches and failure alerts can land within about a second, so `postToResend` retries a `429` once (`src/lib/email-retry.ts`: it waits `Retry-After` seconds, at most 2, or 1 s when missing, and re-sends the same body and `Idempotency-Key`).
- **Stopping the cron:** deploy `"triggers": { "crons": [] }`. Removing or commenting out the `crons` key leaves the deployed schedule running, and `wrangler rollback` is not known to restore trigger settings.

### Errors and alerts

Production errors are visible in Workers Logs (the `observability` block in `wrangler.jsonc`) and, for a failed reminder run (appointment, due-screening or follow-up nudge), in an email. There is no other error service: Workers Issues stays off because it stores raw error messages and stack traces.

**Events.** Every uncaught SSR error and every failed cron job logs one JSON line at error level (`src/lib/observability.ts`). SSR errors are caught in `src/middleware.ts`, and Astro then renders the 500 page as before. Cron errors are logged once per failed job, by `scheduled()` in `src/worker.ts` (heartbeat) and `runReminderChain` in `src/lib/reminders/chain.ts` (the reminder jobs).

```json
{
  "event": "error",
  "source": "ssr",
  "route": "/dashboard",
  "requestId": "8f1c2a3b4d5e6f70-WAW",
  "error": "DatabaseError",
  "operation": "read-consent",
  "code": "PGRST301"
}
```

```json
{
  "event": "error",
  "source": "cron",
  "job": "appointment-reminder",
  "requestId": "cron-1790841600000",
  "cron": "0 8,9 * * *",
  "scheduledAt": "2026-10-01T08:00:00.000Z",
  "error": "ReminderDatabaseError",
  "step": "mark",
  "code": "42501"
}
```

- `route` is the route pattern (`/dashboard`), not the URL. The 500 page's own re-render logs nothing, so one failure is one event.
- `requestId` is the request's `cf-ray` for SSR (a UUID where there is no `cf-ray`, such as local runs) and `cron-<scheduledTime>` for cron.
- `error` is the error name. The optional details `operation`, `step`, `code`, `status` and `resendError` appear when the error carries them.
- The `heartbeat`, `appointment-reminder`, `due-screening-reminder` and `follow-up-nudge` outcome lines keep their shape; a failed job logs both, and their `failed` outcome carries the same error name and details under the same rules.
- The reminder failure email logs one `failure-alert` line (with the `job`) with `outcome`: `sent` (with `resendId`), `dry-run`, `skipped` (`reason: "no-recipient"`) or `failed` (the send threw: error name and details).

**Privacy rule.** Our `error` and `failure-alert` events never carry error messages, addresses or health data; they hold names, short codes, route patterns and run ids only. Astro and Cloudflare print the error's `stack` themselves, so the middleware and `scheduled()` rethrow a redacted copy (same name and frames, message `[redacted]`). When adding a failure path:

- Throw a code-only error such as `DatabaseError` (`src/lib/database-error.ts`) or `ReminderDatabaseError` (`src/lib/reminders/errors.ts`), never one that embeds a PostgREST, Resend or user message.
- Detail values must be static identifiers (an operation name, a SQLSTATE), never row or user values. The builders drop anything that isn't a single short token of letters, digits and `_.:-`, which blocks free text and addresses but not a value like a screening slug.
- Local debugging: the dev server shows `<Name>: [redacted]` plus frames, without Astro's hint. To see a message, add a temporary `console.error` in the page or endpoint itself and remove it before committing; never bypass or weaken the redaction.

**Failure email.** When the appointment, the due-screening or the follow-up nudge reminder job throws, the owner gets one plain-English email at `REMINDER_TEST_TO` per failed job (the subject names the job; all three can fail in one run, and each has its own idempotency key): the job name, run time, cron, error name and codes, and a pointer to the saved query below. It holds no user data. If the failing step is `mark`, it adds that the reminder emails were sent but not marked, so users may get a duplicate on the next run. A failed heartbeat sends no email, only the `error` line. The email is best-effort: it cannot go out when Resend itself is failing, and the run is still marked failed either way. Then check Workers Logs or Trigger Events. Locally, `EMAIL_DRY_RUN=true` logs a `failure-alert` `dry-run` line instead.

**Saved queries.** In the Cloudflare dashboard → Workers → `dbam` → Observability → Query Builder, filter and use **Save Query**. They aren't created by code, so a human adds them once:

| Name                  | Filter                            |
| --------------------- | --------------------------------- |
| `Dbam errors`         | `event = error`                   |
| `Dbam SSR errors`     | `event = error AND source = ssr`  |
| `Dbam cron errors`    | `event = error AND source = cron` |
| `Dbam failure alerts` | `event = failure-alert`           |

An SSR event's `requestId` equals `$metadata.rayId` of the same request's invocation log, which shows its status and outcome.

**Free-plan limits.** Until 2026-12-01 the Workers Free plan keeps 200,000 log events a day (invocation logs count) for 3 days. From 2026-12-01 it is 0.5 GB a day for 7 days, and ingestion stops at the cap until 00:00 UTC. Either way, triage within days.

**Known gaps.**

- Errors thrown after a response has started streaming are not captured: no hook sees them. No page awaits data inside a component today, so the path is empty.
- A cron that never fires is detected only by the missing daily heartbeat email.
- Cloudflare's invocation logs record request URLs, which our code doesn't control, so no health data may sit in them. The screening slug a user just planned or marked done travels in a short-lived `HttpOnly` flash cookie (`screening_flash`, `Path=/dashboard`, 60 s) that `/dashboard` reads and clears, and the URL carries only the `?saved=`/`?error=` code and the `#screening-<slug>` fragment, which a browser never sends. What remains in URLs is static codes, `?reminders=on|off` and Supabase's single-use `?code=` on the auth callback. See `context/changes/redirect-query-privacy/`; whether production Workers Logs keep the query string is a human check that is still open.

## Smoke test

`scripts/smoke.mjs` is a dependency-free Node script that walks the whole auth flow (sign-up, sign-in, protected page, sign-out), onboarding, profile editing, planning and marking screenings done, confirming an appointment planned for today (and checking a future one can't be confirmed), and consent withdrawal over HTTP. Run it against the dev server or the production preview after dependency upgrades:

```bash
npm run dev            # or: npm run build && npm run preview
BASE_URL=http://localhost:4321 npm run smoke
```

It needs a reachable Supabase instance (local or cloud) with email confirmation disabled.

The full run signs up a real `smoke-*@example.com` account, so the script refuses any non-local `BASE_URL` unless `SMOKE_READONLY=1` is set. Read-only mode only sends `GET` requests (`/api/health` reporting that the Supabase secrets are set, the auth redirects, the sign-in/sign-up pages, a 404) and is what the deploy job runs against production:

```bash
SMOKE_READONLY=1 BASE_URL=https://dbam.amadeuszkozlowski.workers.dev npm run smoke
```

> **Note:** this script is a fast sanity check that dependency upgrades did not break the build, the Cloudflare adapter, the Supabase auth flow or the main user flows. It is **not** a substitute for a real test suite: the catalog and screening recurrence rules are covered by the Vitest unit tests (`npm test`), and the database access rules are covered separately by the pgTAP tests (`npx supabase test db`).

## UI screenshots

`scripts/ui-shots.mjs` drives headless Chromium (Playwright, a dev dependency) so a UI change can be looked at without a human at the screen. It signs up and onboards a throwaway fixture user through the app's own endpoints, then saves full-page screenshots of onboarding (consent and profile steps), the dashboard, the profile page and the kitchen sink, each in light and dark at 1440px (desktop) and 390px (mobile): 20 PNGs.

One-time setup per machine, then run it against the dev server (not a production build: the kitchen sink at `/dev/kitchen-sink` is dev-only and answers 404 there) with local Supabase running:

```bash
npx playwright install chromium --only-shell   # once; never installed by an npm lifecycle script
npm run dev                                    # in another terminal, with local Supabase up
BASE_URL=http://localhost:4321 npm run ui:shots
```

Files are written to `ui-shots/` (gitignored) as `<view>-<desktop|mobile>-<light|dark>.png`, with `onboarding-consent-*` and `onboarding-profile-*` for the two onboarding steps. The script prints each path as it saves it and a closing summary with the count, the folder and the `BASE_URL` the shots came from. Same-named files are overwritten and nothing is deleted, so **read only the paths a run printed**: the folder keeps older PNGs from earlier or `--only` runs.

- `--only <view>` limits the run and can be repeated. Views: `onboarding`, `dashboard`, `profile`, `kitchen-sink`. A kitchen-sink-only run creates no fixture user and makes no API calls.
- `--out <dir>` writes elsewhere, e.g. `--out context/changes/<id>/screenshots` when a PR needs images committed.
- A full run signs up one `ui-shots-*@example.com` user in the local Supabase (as smoke leaves `smoke-*` users).

It is local only. It exits 2 before any request when `BASE_URL` or any `SUPABASE_URL` it can see (its own environment and the `.dev.vars*`/`.env*` files at the repo root, except `.env.example`; the last matching line in each file counts) is not `localhost`/`127.0.0.1`. A stale non-local value in an unused file such as `.env.production` also refuses the run: remove it. The guard cannot see the environment the dev server was started with, so a server launched with a shell-exported production `SUPABASE_URL` is not detected: don't start one that way.

### In worker sessions

Port 4321 belongs to the human's dev server, so a worker session (`DBAM_CHANGE` set) uses `$DBAM_PORT`, and the script refuses 4321 there, whether explicit or the default. Always spell out `BASE_URL`:

```bash
npx astro sync                                              # once on a fresh worktree: generates .astro/ types
npx astro dev --port $DBAM_PORT --host 127.0.0.1            # daemonizes; stop it with: npx astro dev stop
BASE_URL=http://127.0.0.1:$DBAM_PORT npm run ui:shots
```

- `--host 127.0.0.1` is needed because Astro 7's dev server binds `::1` only, so `http://127.0.0.1:$DBAM_PORT` is otherwise unreachable.
- The first `astro dev` start (often straight after `astro sync`) can exit 1 with "Dev server process exited before becoming ready". Run the same command again; `npx astro dev logs` shows why it stopped.
- Take the shared DB lock around a full run, as for smoke (see the worker protocol): `until mkdir ~/.cache/dbam/db.lock 2>/dev/null; do sleep 15; done; echo "$DBAM_CHANGE" > ~/.cache/dbam/db.lock/owner`, then `rm -rf ~/.cache/dbam/db.lock` afterwards, even when the run fails. A `--only kitchen-sink` run needs no lock.
- A freshly started dev server optimizes dependencies on its first requests, which can fail the first run (exit 1, "Execution context was destroyed"). The script warms the server up first; if a run still fails that way, rerun it.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every PR and push to `main`, and on manual `workflow_dispatch`:

- **ci** — `catalog:check`, lint, `ui:check`, unit tests (`npm test`), `astro check` and build. No secrets needed: Supabase secrets are read at runtime, not at build time.
- **smoke** — starts a local Supabase via the Supabase CLI (applying `supabase/migrations/`), runs the pgTAP tests (`supabase test db`), builds, serves the production preview on the Cloudflare runtime and runs `npm run smoke` against it. No secrets required.
  It then calls the scheduled handler (`/cdn-cgi/local/scheduled`) for every cron in the built `dist/server/wrangler.json` with `EMAIL_DRY_RUN=true` and fails unless each run returns `"outcome":"ok"`, so a `wrangler.jsonc` cron that `src/lib/heartbeat.ts` doesn't handle fails the PR (see [Scheduled jobs](#scheduled-jobs)). The daily run also exercises the reminder jobs' real database calls (the appointment claim, the due-screening candidates query and the nudge claim) against the local Supabase with its `SECRET_KEY`, so broken wiring or a wrong grant fails the PR too.
- **migrate** — `main` only, after `ci` + `smoke` pass: `supabase db push --db-url` against production, using the `production` environment's `SUPABASE_DB_URL` secret (session-pooler connection string, password percent-encoded).
- **deploy** — `main` only, after `ci` + `smoke` + `migrate` pass: `wrangler deploy` to Cloudflare Workers with the `production` environment's scoped token, then a health check (`GET /api/health`: 200 `{"status":"ok"}`, or 503 `{"status":"misconfigured"}` when the Supabase secrets are missing) and the read-only smoke test against production (retried up to 3 times, 20 s apart, because a new Worker version takes up to a minute to reach every edge location).

## License

MIT
