# Dbam

Dbam helps adults in Poland (30+) see which preventive screenings are due for their age and situation, grouped by importance, and plan them or mark them done. Once a planned appointment date has passed, one click confirms the exam took place on that day, and the exam comes back as due when its repeat interval elapses. It does not diagnose anything: it shows recommendations from a curated screening catalog built from NFZ programmes and medical society guidelines and keeps track of what you have planned and done. Users can opt in to a reminder email before a recorded appointment.

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
- `npm run db:types` - Regenerate `src/lib/database.types.ts` from the local database
- `npm run cf:types` - Regenerate `worker-configuration.d.ts` (Worker runtime types and `Env`) from `wrangler.jsonc` and `.dev.vars` (commit it)
- `npm run catalog:check` - Validate the screening catalog entries and check they match the newest snapshot migration
- `npm run catalog:migration` - Generate a snapshot migration from `catalog/entries/`
- `npm run catalog:schema` - Regenerate `catalog/entry.schema.json` from the entry schema

### Agent Stop hook

Worker agent sessions (`DBAM_CHANGE` set; reviewers with `DBAM_ROLE=review` and human sessions are skipped) run `scripts/stop-lint.mjs` as a Claude Code `Stop` hook, registered in `.claude/settings.json`. It runs ESLint (errors only) on the files changed against `origin/main` and blocks a turn ending with `STATUS: done` while errors remain, giving up after 3 consecutive blocks so it cannot trap an agent. The block counter and the last ESLint output live in the worktree's git dir: `git rev-parse --git-path dbam-stop-lint.log`.

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

| Variable              | Description                                                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SUPABASE_URL`        | Project URL from Supabase dashboard → Settings → API                                                                                                                                       |
| `SUPABASE_KEY`        | `anon` public key from Supabase dashboard → Settings → API                                                                                                                                 |
| `SUPABASE_SECRET_KEY` | Secret key (`sb_secret_…`), used only by the appointment reminder cron job (`src/lib/reminders/admin-client.ts`). The database lets it execute the two reminder functions and nothing else |
| `EMAIL_FROM`          | Optional. Sender for every email, e.g. `Dbam <przypomnienia@notification.dbam.net.pl>` on the domain verified in Resend; unset falls back to Resend's sandbox sender                       |

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

`src/worker.ts` is the Worker entry (`main` in `wrangler.jsonc`): HTTP requests go to the Astro adapter, and Cron Triggers (`triggers.crons`) run `scheduled()`, which runs two independent jobs: the heartbeat email from `src/lib/heartbeat.ts` and the appointment reminders from `src/lib/reminders/appointment.ts`, both sending through `src/lib/email.ts`. One failing job doesn't stop the other; the run is still marked failed. Cron runs in UTC; the shared schedule gate is `src/lib/schedule.ts`. `*/30 * * * *` sends on every run; `0 8,9 * * *` sends only on the run that is 10:00 in Europe/Warsaw, so it stays at 10:00 across daylight saving time. Any other cron string fails the run. Production runs `0 8,9 * * *`: one heartbeat email a day at 10:00 Warsaw time (the 08:00 and 09:00 UTC runs are both needed because Warsaw's UTC offset changes with daylight saving; one of them always skips).

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

For one real send, put a real `RESEND_API_KEY` and `REMINDER_TEST_TO` plus `EMAIL_DRY_RUN=false` in `.dev.vars`, restart the server and call the first `curl` again. Set `EMAIL_DRY_RUN=true` back afterwards.

`EMAIL_DRY_RUN` accepts only the literal `true` or `false`. Any other value (`1`, `TRUE`, `yes`) fails `astro:env` validation when the Worker starts and breaks every request, not just the cron. Production leaves it unset, which means `false`; never `wrangler secret put` it.

In production:

- **Runs:** Cloudflare dashboard → Workers → `dbam` → Settings → Trigger Events (the last 100 invocations), and Workers Logs (one `heartbeat` and one `appointment-reminder` JSON line per run with its outcome; no recipient or key; a failed job also logs an `error` line and a failed reminder run a `failure-alert` line, see [Errors and alerts](#errors-and-alerts)). A cron change takes up to 15 minutes to take effect after a deploy.
- **Free-plan limits:** 10 ms CPU per cron run (waiting on the network doesn't count), 50 subrequests per run, and 5 Cron Triggers per account. Resend's free tier allows 100 emails a day and 3,000 a month.
- **Stopping the cron:** deploy `"triggers": { "crons": [] }`. Removing or commenting out the `crons` key leaves the deployed schedule running, and `wrangler rollback` is not known to restore trigger settings.

### Errors and alerts

Production errors are visible in Workers Logs (the `observability` block in `wrangler.jsonc`) and, for a failed appointment reminder run, in an email. There is no other error service: Workers Issues stays off because it stores raw error messages and stack traces.

**Events.** Every uncaught SSR error and every failed cron job logs one JSON line at error level (`src/lib/observability.ts`). SSR errors are caught in `src/middleware.ts`, and Astro then renders the 500 page as before. Cron errors are logged by `scheduled()` in `src/worker.ts`, once per failed job.

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
- The existing `heartbeat` and `appointment-reminder` outcome lines are unchanged; a failed job logs both.
- The reminder failure email logs one `failure-alert` line with `outcome`: `sent` (with `resendId`), `dry-run`, `skipped` (`reason: "no-recipient"`) or `failed` (the send threw: error name and details).

**Privacy rule.** Our `error` and `failure-alert` events never carry error messages, addresses or health data; they hold names, short codes, route patterns and run ids only. Astro and Cloudflare print the error's `stack` themselves, so the middleware and `scheduled()` rethrow a redacted copy (same name and frames, message `[redacted]`). When adding a failure path:

- Throw a code-only error such as `DatabaseError` (`src/lib/database-error.ts`) or `ReminderDatabaseError`, never one that embeds a PostgREST, Resend or user message.
- Detail values must be static identifiers (an operation name, a SQLSTATE), never row or user values. The builders drop anything that isn't a single short token of letters, digits and `_.:-`, which blocks free text and addresses but not a value like a screening slug.

**Failure email.** When the appointment reminder job throws, the owner gets one plain-English email at `REMINDER_TEST_TO`: the job name, run time, cron, error name and codes, and a pointer to the saved query below. It holds no user data. If the failing step is `mark`, it adds that the reminder emails were sent but not marked, so users may get a duplicate on the next run. A failed heartbeat sends no email, only the `error` line. The email is best-effort: it cannot go out when Resend itself is failing, and the run is still marked failed either way. Then check Workers Logs or Trigger Events. Locally, `EMAIL_DRY_RUN=true` logs a `failure-alert` `dry-run` line instead.

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
- Cloudflare's invocation logs record request URLs, and our code doesn't control that. `/dashboard?…&slug=<slug>` names the screening a user just planned or marked done, so health data can sit in Workers Logs for the retention window. This is tracked in `context/changes/error-tracking/follow-ups/redirect-slug-leak.md` and isn't fixed by the error events.

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

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every PR and push to `main`, and on manual `workflow_dispatch`:

- **ci** — `catalog:check`, lint, `ui:check`, unit tests (`npm test`), `astro check` and build. No secrets needed: Supabase secrets are read at runtime, not at build time.
- **smoke** — starts a local Supabase via the Supabase CLI (applying `supabase/migrations/`), runs the pgTAP tests (`supabase test db`), builds, serves the production preview on the Cloudflare runtime and runs `npm run smoke` against it. No secrets required.
  It then calls the scheduled handler (`/cdn-cgi/local/scheduled`) for every cron in the built `dist/server/wrangler.json` with `EMAIL_DRY_RUN=true` and fails unless each run returns `"outcome":"ok"`, so a `wrangler.jsonc` cron that `src/lib/heartbeat.ts` doesn't handle fails the PR (see [Scheduled jobs](#scheduled-jobs)). The daily run also exercises the appointment reminder job's real claim against the local Supabase with its `SECRET_KEY`, so broken wiring or a wrong grant fails the PR too.
- **migrate** — `main` only, after `ci` + `smoke` pass: `supabase db push --db-url` against production, using the `production` environment's `SUPABASE_DB_URL` secret (session-pooler connection string, password percent-encoded).
- **deploy** — `main` only, after `ci` + `smoke` + `migrate` pass: `wrangler deploy` to Cloudflare Workers with the `production` environment's scoped token, then a health check (`GET /api/health`: 200 `{"status":"ok"}`, or 503 `{"status":"misconfigured"}` when the Supabase secrets are missing) and the read-only smoke test against production (retried up to 3 times, 20 s apart, because a new Worker version takes up to a minute to reach every edge location).

## License

MIT
