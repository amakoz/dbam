# 10x Astro Starter

![](./public/template.png)

A modern, opinionated starter template for building fast, accessible web applications.

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
git clone https://github.com/przeprogramowani/10x-astro-starter.git
cd 10x-astro-starter
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
- `npm run db:types` - Regenerate `src/lib/database.types.ts` from the local database
- `npm run cf:types` - Regenerate `worker-configuration.d.ts` (Worker runtime types and `Env`) from `wrangler.jsonc` and `.dev.vars` (commit it)
- `npm run catalog:check` - Validate the screening catalog entries and check they match the newest snapshot migration
- `npm run catalog:migration` - Generate a snapshot migration from `catalog/entries/`
- `npm run catalog:schema` - Regenerate `catalog/entry.schema.json` from the entry schema

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
| `REMINDER_ALLOWED_TO` | Optional. Comma-separated addresses the reminder job may email; unset means everyone, set but empty means nobody                                                                           |
| `EMAIL_FROM`          | Optional. Sender for every email, e.g. `Dbam <przypomnienia@send.<domain>>` on the domain verified in Resend; unset falls back to Resend's sandbox sender                                  |

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
| `/dashboard`          | Example protected page (redirects to `/auth/signin` if unauthenticated)                                                                                                                        |

Route protection is handled in `src/middleware.ts`. Add paths to the `PROTECTED_ROUTES` array there to require authentication.

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
npx wrangler secret put REMINDER_TEST_TO   # heartbeat recipient
```

Unless `EMAIL_FROM` is set to a sender on a domain verified in Resend, mail is sent from Resend's test sender `onboarding@resend.dev`, which delivers only to the Resend account owner's address, so `REMINDER_TEST_TO` must be exactly the email the Resend account was created with. A `+tag` variant of that address is rejected with a 403 `validation_error`. Leave `EMAIL_DRY_RUN` unset in production (it defaults to `false`).

### Scheduled jobs

`src/worker.ts` is the Worker entry (`main` in `wrangler.jsonc`): HTTP requests go to the Astro adapter, and Cron Triggers (`triggers.crons`) run `scheduled()`, which runs two independent jobs: the heartbeat email from `src/lib/heartbeat.ts` and the appointment reminders from `src/lib/reminders/appointment.ts`, both sending through `src/lib/email.ts`. One failing job doesn't stop the other; the run is still marked failed. Cron runs in UTC; the shared schedule gate is `src/lib/schedule.ts`. `*/30 * * * *` sends on every run; `0 8,9 * * *` sends only on the run that is 10:00 in Europe/Warsaw, so it stays at 10:00 across daylight saving time. Any other cron string fails the run. Production runs `0 8,9 * * *`: one heartbeat email a day at 10:00 Warsaw time (the 08:00 and 09:00 UTC runs are both needed because Warsaw's UTC offset changes with daylight saving; one of them always skips).

Run it locally against `npm run dev` or `npm run build && npm run preview`. With `EMAIL_DRY_RUN=true` (the `.env.example` default) it only logs a `dry-run` line and sends nothing:

```bash
curl 'http://localhost:4321/cdn-cgi/local/scheduled?cron=*%2F30+*+*+*+*&format=json'
# daily cron at a given time (epoch ms): 2026-10-01T08:00Z is 10:00 in Warsaw, so it sends
curl 'http://localhost:4321/cdn-cgi/local/scheduled?cron=0+8%2C9+*+*+*&time=1790841600000&format=json'
```

**Appointment reminders** run only on the daily cron's 10:00 Warsaw run (every other run logs `skipped`). The job calls `claim_due_appointment_reminders` with `SUPABASE_SECRET_KEY` (required: without it or `SUPABASE_URL` the job fails with `ReminderConfigError`, even in dry run). The database returns every opted-in user with an active consent and a plan dated 1–3 Warsaw days after the run date that hasn't been reminded for that date yet, with the email only for addresses on `REMINDER_ALLOWED_TO`. The job sends one email per allowlisted user (dates and a count, never an exam name) in one Resend batch, then marks those reminders sent. With `EMAIL_DRY_RUN=true` it sends nothing and marks nothing, so the same reminders are due again on the next run. To try it locally: turn reminders on in `/profile`, plan a screening with an appointment date 1–3 days after the run date (the `time` below is 2026-10-01, so 2–4 October 2026), and call the daily `curl` above. Each run logs one line (counts only, no addresses or subjects):

```json
{
  "event": "appointment-reminder",
  "outcome": "dry-run",
  "cron": "0 8,9 * * *",
  "scheduledAt": "2026-10-01T08:00:00.000Z",
  "due": 1,
  "undeliverable": 0,
  "sent": 0
}
```

`outcome` is `skipped` (not the 10:00 run), `none` (nothing to send), `dry-run` or `sent`, or `failed` with the error name (plus Resend's status and error name, or the database step and SQLSTATE). `due` counts claimed users, `undeliverable` those not on `REMINDER_ALLOWED_TO` (nothing is sent to them), and `sent` the emails Resend accepted.

For one real send, put a real `RESEND_API_KEY` and `REMINDER_TEST_TO` plus `EMAIL_DRY_RUN=false` in `.dev.vars`, restart the server and call the first `curl` again. Set `EMAIL_DRY_RUN=true` back afterwards.

`EMAIL_DRY_RUN` accepts only the literal `true` or `false`. Any other value (`1`, `TRUE`, `yes`) fails `astro:env` validation when the Worker starts and breaks every request, not just the cron. Production leaves it unset, which means `false`; never `wrangler secret put` it.

In production:

- **Runs:** Cloudflare dashboard → Workers → `dbam` → Settings → Trigger Events (the last 100 invocations), and Workers Logs (one `heartbeat` and one `appointment-reminder` JSON line per run with its outcome; no recipient or key). A cron change takes up to 15 minutes to take effect after a deploy.
- **Free-plan limits:** 10 ms CPU per cron run (waiting on the network doesn't count), 50 subrequests per run, and 5 Cron Triggers per account. Resend's free tier allows 100 emails a day and 3,000 a month.
- **Stopping the cron:** deploy `"triggers": { "crons": [] }`. Removing or commenting out the `crons` key leaves the deployed schedule running, and `wrangler rollback` is not known to restore trigger settings.

## Smoke test

`scripts/smoke.mjs` is a dependency-free Node script that walks the whole auth flow (sign-up, sign-in, protected page, sign-out), onboarding, profile editing, planning and marking screenings done, and consent withdrawal over HTTP. Run it against the dev server or the production preview after dependency upgrades:

```bash
npm run dev            # or: npm run build && npm run preview
BASE_URL=http://localhost:4321 npm run smoke
```

It needs a reachable Supabase instance (local or cloud) with email confirmation disabled.

The full run signs up a real `smoke-*@example.com` account, so the script refuses any non-local `BASE_URL` unless `SMOKE_READONLY=1` is set. Read-only mode only sends `GET` requests (`/api/health` reporting that the Supabase secrets are set, the auth redirects, the sign-in/sign-up pages, a 404) and is what the deploy job runs against production:

```bash
SMOKE_READONLY=1 BASE_URL=https://dbam.amadeuszkozlowski.workers.dev npm run smoke
```

> **Note:** this script exists primarily to guard the development of the starter itself — it is a fast sanity check that dependency upgrades did not break the build, the Cloudflare adapter or the Supabase auth flow. It is **not** a substitute for a real test suite. Once you build your own product on top of this starter, add proper tests (unit, integration, end-to-end) suited to your application.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every PR and push to `main`, and on manual `workflow_dispatch`:

- **ci** — `catalog:check`, lint, `astro check` and build. No secrets needed: Supabase secrets are read at runtime, not at build time.
- **smoke** — starts a local Supabase via the Supabase CLI (applying `supabase/migrations/`), runs the pgTAP tests (`supabase test db`), builds, serves the production preview on the Cloudflare runtime and runs `npm run smoke` against it. No secrets required.
  It then calls the scheduled handler (`/cdn-cgi/local/scheduled`) for every cron in the built `dist/server/wrangler.json` with `EMAIL_DRY_RUN=true` and fails unless each run returns `"outcome":"ok"`, so a `wrangler.jsonc` cron that `src/lib/heartbeat.ts` doesn't handle fails the PR (see [Scheduled jobs](#scheduled-jobs)). The daily run also exercises the appointment reminder job's real claim against the local Supabase with its `SECRET_KEY`, so broken wiring or a wrong grant fails the PR too.
- **migrate** — `main` only, after `ci` + `smoke` pass: `supabase db push --db-url` against production, using the `production` environment's `SUPABASE_DB_URL` secret (session-pooler connection string, password percent-encoded).
- **deploy** — `main` only, after `ci` + `smoke` + `migrate` pass: `wrangler deploy` to Cloudflare Workers with the `production` environment's scoped token, then a health check (`GET /api/health`: 200 `{"status":"ok"}`, or 503 `{"status":"misconfigured"}` when the Supabase secrets are missing) and the read-only smoke test against production (retried up to 3 times, 20 s apart, because a new Worker version takes up to a minute to reach every edge location).

## License

MIT
