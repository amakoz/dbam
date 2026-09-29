# Reminder Dispatch Path (F-02) Implementation Plan

## Overview

This plan proves the reminder delivery path on Workers Free in production. A Cloudflare Cron Trigger on the existing `dbam` Worker runs a `scheduled()` handler. The handler sends one heartbeat email through Resend's test mode (`onboarding@resend.dev`) to the owner's `+dbam` address.

- The cron first runs every 30 minutes to prove the path.
- A follow-up PR then moves it to once a day at 10:00 Europe/Warsaw.
- Every PR's CI runs the scheduled handler in dry-run mode, so no email is sent.

S-04, S-06 and S-07 will reuse the Worker entry, the email module and the trigger.

## Current State Analysis

- **No Cron Trigger exists.** `wrangler.jsonc:4` points `main` at the adapter's default entry, and there is no `triggers` block (`roadmap.md` Baseline).
- **The default entry is fetch-only.** It is literally `{ fetch: handle }` (`@astrojs/cloudflare/dist/entrypoints/server.js`), and `@astrojs/cloudflare/handler` is a public export (research §A).
- **Secrets load at module load.** Importing the handler module runs `setGetEnv` right away (`handler.js:31`), and `astro:env/server` secrets are live `export let` bindings (`astro/dist/env/vite-plugin-env.js:146-148`). So secrets are expected to be readable inside `scheduled()`. That comes from reading the code and still needs a runtime check (research §B).
- **No Worker runtime types are available.** `@cloudflare/workers-types` isn't installed, there's no `worker-configuration.d.ts`, and `src/env.d.ts` declares only `App.Locals`.
- **No outbound email outside Supabase Auth.** Supabase SMTP handles Auth emails only (research §D).
- **CI's `smoke` job is where the dry-run check plugs in.** It builds, writes `.env` and `.dev.vars` from local Supabase, starts `npm run preview` on port 4321, and runs `npm run smoke` (`.github/workflows/ci.yml:26-56`). The `deploy` job gates on `/api/health` (`:105-114`) and a read-only smoke (`:117-130`).
- **Setting secrets is human-only.** You run `npx wrangler secret put` yourself (`deployment-plan.md:288-291,475`).

## Desired End State

- **Production:** `dbam` runs `scheduled()` on its cron.
  - **Proving phase** (`*/30 * * * *`): every run sends one email to the owner's `+dbam` address.
  - **Daily phase** (`0 8,9 * * *`): exactly one email arrives per day, at 10:00 Warsaw local time, in both summer (CEST) and winter (CET).
  - **Failed runs are visible.** An unknown cron string, missing secrets or a Resend error shows up as a failed invocation in Trigger Events and in Workers Logs. `/api/health` does not change.
- **Every PR:** CI runs the scheduled handler on the local preview for both configured cron strings, with `EMAIL_DRY_RUN=true`, and fails unless each run returns `outcome: ok`.
- **Verify** with the Progress checklist below. Manual checks happen in the Resend dashboard, the inbox, and Cloudflare → Workers → `dbam` → Settings → Trigger Events.

### Key Discoveries:

- **Custom entry pattern.** Astro's documented pattern is a custom `main` exporting a standard `ExportedHandler`. Since adapter v14.3.0, custom entries fall back to static assets (research §A). The repo is on `^14.3.1` and serves assets via `ASSETS` (`wrangler.jsonc:7-11`).
- **Cron semantics** (research §C):
  - Cron runs in UTC only.
  - `controller.cron` equals the configured string character for character.
  - A deploy replaces the deployed crons, and `"crons": []` removes them. Commenting out the key does not remove them.
  - Changes take up to 15 min to propagate.
- **Workers Free limits:** 10 ms CPU per cron run, 50 subrequests, 5 triggers (treat that as per account). Network waits don't count toward CPU (research §C).
- **Resend** (research §D):
  - Test mode delivers only to the account owner's address.
  - `Idempotency-Key` header is supported.
  - `delivered@resend.dev` is a simulator address.
  - Free tier: 100/day, 3,000/month.
- **Local cron testing.** `/cdn-cgi/local/scheduled?cron=…&time=<ms>&format=json` triggers `scheduled()` locally. The Cloudflare Vite plugin supports it; that it works under `astro preview` is inferred, not confirmed (research §E). Miniflare rejects non-local `/cdn-cgi` requests.
- **Generated-file convention.** `db:types` writes `src/lib/database.types.ts`, which is excluded from ESLint (`eslint.config.js:85-86`). Worker types follow the same pattern.
- **Lesson:** keep `name: "dbam"` (`context/foundation/lessons.md`). Changing `main` doesn't rename the Worker.

## What We're NOT Doing

- **Automated post-deploy verification in the `deploy` job.** Parked as a roadmap item (user decision 2026-09-29; `roadmap.md` Parked). The `deploy` job, `/api/health` and `scripts/smoke.mjs` stay unchanged.
- **Workers Paid, a custom domain, Cloudflare Email Service, and real-user recipients.** MVP constraint. Resend test mode reaches only the owner.
- **Reading user data.** No Supabase access from the cron, no service-role key, no security-definer functions. That belongs to S-04 and later slices.
- **Reminder opt-in, appointment logic, DB tables or a send ledger.** No migrations, so no `db:types` change.
- **Retrying failed sends.** A failed run stays failed and the next scheduled run tries again. Cloudflare doesn't retry crons.
- **i18n for the heartbeat email.** It's an operator-only message to the owner, not a user-facing string, so it's plain English like `/api/health`.
- **Queues, Workflows, or external schedulers.**

## Implementation Approach

Keep `scheduled()` a thin wrapper around plain functions in `src/lib/`, so the real cron, local `/cdn-cgi/local/scheduled` calls and CI all run the same code (research, Architecture Insights).

The handler picks its behaviour from `controller.cron`, and both cron strings are known from the first PR. So the move to daily is a one-line `wrangler.jsonc` change.

The email transport is a single `fetch` POST to Resend's REST API, with no SDK. A dry-run flag (a runtime `astro:env` secret, so `.dev.vars` controls it) replaces the POST with a log line. That lets CI and local dev exercise the path without an API key or an inbox.

## Critical Implementation Details

- **Timing & lifecycle.** Do these before the Phase 3 merge; a missing one makes the first production runs fail (visibly, not silently):
  - set both production secrets;
  - confirm the CI token can deploy triggers.

  Cron changes take up to 15 min to take effect, so check the first run about 45 min after `deploy` goes green, not right away.
- **Stopping the cron.** Deploy `"crons": []` to stop it. `wrangler rollback` restores code, but whether it also restores trigger settings is unverified, so don't rely on it to stop the cron.
- **Warsaw-hour gate.** Compute the local hour of `controller.scheduledTime` with `Intl.DateTimeFormat` using `timeZone: "Europe/Warsaw"` and a 24-hour cycle (`hourCycle: "h23"`), then compare it with `10`. Check it in workerd with the `time` parameter (epoch ms) at four points:

  | UTC time         | Warsaw local | Expected |
  | ---------------- | ------------ | -------- |
  | 2026-10-01 08:00 | 10:00 CEST   | send     |
  | 2026-10-01 09:00 | 11:00 CEST   | skip     |
  | 2026-11-02 08:00 | 09:00 CET    | skip     |
  | 2026-11-02 09:00 | 10:00 CET    | send     |
- **If `astro preview` doesn't expose `/cdn-cgi/local/scheduled`** (checked in 1.8), run the CI step against `npx wrangler dev --test-scheduled` on the built output instead. Record the command in the plan's Phase 2 notes. Do not add a production HTTP trigger endpoint as a workaround; that is out of scope.

## Phase 1: Worker entry, email module and cron config

### Overview

Add the custom Worker entry with `scheduled()`, the heartbeat and email modules, the new env fields, generated Worker types, and the proving cron. Verify locally, first as a dry run, then with one real send.

### Changes Required:

#### 1. Worker runtime types

**File**: `worker-configuration.d.ts` (new, generated), `package.json`, `eslint.config.js`

**Intent**: Give `src/worker.ts` typed `ExportedHandler`, `ScheduledController`, `ExecutionContext` and `Env`, using the same generate-and-commit pattern as `db:types`.

**Contract**:
- `package.json` gains a script `"cf:types": "wrangler types"`.
- The generated `worker-configuration.d.ts` is committed at the repo root and added to the ESLint `ignores` next to `src/lib/database.types.ts`.
- Generate it with a `.dev.vars` that holds every key from `.env.example`, so `Env` lists all secret names.
- **Fallback:** if `astro check` reports conflicts with the DOM lib, switch to `wrangler types --include-runtime=false` and type the `scheduled` parameters with minimal local interfaces in `src/worker.ts`. Note the switch in this plan.

#### 2. Env schema

**File**: `astro.config.mjs`, `.env.example`

**Intent**: Declare the new runtime secrets the same way as the Supabase ones: server-only and never exposed to the client.

**Contract**:
- `env.schema` gains three fields, all `context: "server"`, `access: "secret"`, `optional: true`:
  - `RESEND_API_KEY`: string.
  - `REMINDER_TEST_TO`: string, the heartbeat recipient.
  - `EMAIL_DRY_RUN`: boolean, default `false`.
- `.env.example` gains `RESEND_API_KEY=###`, `REMINDER_TEST_TO=###` and `EMAIL_DRY_RUN=true`. Local copies default to dry run, so local dev never sends unless someone opts in.

#### 3. Email transport

**File**: `src/lib/email.ts` (new)

**Intent**: One reusable way to send transactional email from the Worker. S-04 and later slices reuse it.

**Contract**:
- `sendEmail({ to, subject, text, idempotencyKey }): Promise<{ id: string } | { dryRun: true }>`.
- **Live mode:**
  - `POST https://api.resend.com/emails` with `Authorization: Bearer ${RESEND_API_KEY}`, `Idempotency-Key`, and `from: "Dbam <onboarding@resend.dev>"` (a module constant, to be replaced once a domain exists).
  - A missing `RESEND_API_KEY` throws a named config error.
  - A non-2xx response throws an error carrying the HTTP status and Resend's error name.
- **Dry-run mode** (`EMAIL_DRY_RUN` true): logs and returns `{ dryRun: true }` without calling `fetch` or requiring the key.
- **Logs** never contain the API key or the recipient address.

#### 4. Heartbeat job

**File**: `src/lib/heartbeat.ts` (new)

**Intent**: Decide per cron invocation whether to send, and send the heartbeat.

**Contract**:
- Exports the cron constants `HEARTBEAT_CRON_PROVING = "*/30 * * * *"` and `HEARTBEAT_CRON_DAILY = "0 8,9 * * *"`.
- Exports `runHeartbeat({ cron, scheduledTime }): Promise<"sent" | "skipped" | "dry-run">`.
- **Per cron string:**
  - The proving cron always sends.
  - The daily cron sends only when the Europe/Warsaw local hour of `scheduledTime` is 10, and returns `"skipped"` otherwise.
  - Any other string throws.
- **Recipient:**
  - A missing `REMINDER_TEST_TO` throws in live mode.
  - In dry-run it falls back to `delivered@resend.dev`.
- **Idempotency key:** `dbam-heartbeat:<cron>:<scheduledTime>`.
- **Email content:** subject `Dbam heartbeat`, and a plain-text body naming the cron string and the ISO scheduled time.
- **Logging:** one structured `console` line per run (outcome, cron, scheduled time, Resend id if any). Scope the `no-console` lint exception to `src/worker.ts` and `src/lib/{email,heartbeat}.ts` in `eslint.config.js`. Workers Logs captures console output.

#### 5. Worker entry

**File**: `src/worker.ts` (new)

**Intent**: Own the Worker export so it can serve both HTTP (unchanged, through the adapter) and cron.

**Contract**:
- `export default { fetch, scheduled } satisfies ExportedHandler<Env>`.
- `fetch` delegates to `handle(request, env, ctx)` from `@astrojs/cloudflare/handler`.
- `scheduled(controller)` awaits `runHeartbeat({ cron: controller.cron, scheduledTime: controller.scheduledTime })`, so errors propagate and the run is marked failed.
- The `@astrojs/cloudflare/handler` import is what initialises `astro:env` for `scheduled()`. Keep it a static top-level import.

#### 6. Wrangler config

**File**: `wrangler.jsonc`

**Intent**: Point the Worker at the new entry and register the proving cron.

**Contract**:
- `"main": "./src/worker.ts"`.
- `"triggers": { "crons": ["*/30 * * * *"] }`.
- `name` stays `"dbam"`, and everything else is unchanged.

#### 7. Docs

**File**: `README.md`

**Intent**: Document the new secrets and how to exercise the cron.

**Contract**:
- **Deployment section:** set `RESEND_API_KEY` and `REMINDER_TEST_TO` with `npx wrangler secret put`. The Resend account must be registered on the recipient address, because test mode only delivers to the owner.
- **New "Scheduled jobs" subsection:**
  - the `curl` against `/cdn-cgi/local/scheduled` (dry run, and a live send with `EMAIL_DRY_RUN=false` in `.dev.vars`);
  - where to see production runs (Trigger Events, Workers Logs);
  - the Free-plan limits;
  - how to stop the cron with `"crons": []`.
- **Available Scripts:** add `cf:types`.

### Success Criteria:

#### Automated Verification:

- Worker types generated and committed: `npm run cf:types` leaves `worker-configuration.d.ts` unchanged in git
- Linting passes with no new warnings: `npm run lint`
- Type checking passes: `npx astro check`
- Build succeeds: `npm run build`
- Catalog check still passes: `npm run catalog:check`

#### Manual Verification:

- Local dry run: with `EMAIL_DRY_RUN=true`, `curl 'http://localhost:4321/cdn-cgi/local/scheduled?cron=*%2F30+*+*+*+*&format=json'` against `npm run preview` returns `outcome: ok` and logs a `dry-run` line
- Warsaw gate returns send/skip/skip/send for the four `time` values in Critical Implementation Details (daily cron, dry run)
- `/cdn-cgi/local/scheduled` confirmed reachable under `astro preview` (or the `wrangler dev --test-scheduled` fallback recorded)
- Unknown cron string (e.g. `cron=0+0+*+*+*`) returns a non-ok outcome with a named error in the log
- One live local send with the real key and `EMAIL_DRY_RUN=false` arrives at the `+dbam` inbox from `onboarding@resend.dev`
- Site pages, static assets and auth still work under `npm run preview` (no regression from the custom entry)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: CI dry-run check

### Overview

Every PR exercises the scheduled handler for both configured cron strings on the local preview in the `smoke` job, without sending email and without a new CI secret.

### Changes Required:

#### 1. Smoke job

**File**: `.github/workflows/ci.yml`

**Intent**: Catch a lost `scheduled` export, a broken entry, or broken env wiring on every PR.

**Contract**:
- The "Configure secrets for build and preview" step also writes `EMAIL_DRY_RUN=true` into `.env` and `.dev.vars`.
- After the existing smoke run, a new step "Exercise scheduled handler (dry run)" calls `/cdn-cgi/local/scheduled?…&format=json` on `http://localhost:4321`, once for `*/30 * * * *` and once for `0 8,9 * * *`, and fails unless each response contains `"outcome":"ok"`.
- `migrate` and `deploy` are unchanged.

#### 2. Docs

**File**: `README.md` (CI section)

**Intent**: Mention the new smoke-job step.

**Contract**: One line in the CI section.

### Success Criteria:

#### Automated Verification:

- Workflow lints as valid YAML and the PR's `ci` and `smoke` jobs pass on GitHub Actions
- The `smoke` job log shows both dry-run scheduled calls returning `"outcome":"ok"`

#### Manual Verification:

- Temporarily removing `scheduled` from `src/worker.ts` on a scratch branch makes the new CI step fail (then discard the branch)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Production rollout

### Overview

Prepare the production secrets and token, merge the PR (a human does this), and confirm the proving cron delivers email in production.

### Changes Required:

#### 1. Human setup before merge

**File**: none (Resend dashboard, Cloudflare dashboard, `wrangler`)

**Intent**: Production has what the cron needs before the first scheduled run.

**Contract**:
- A Resend account is registered on the owner's `+dbam` address.
- A Resend API key with sending-only permission.
- `npx wrangler secret put RESEND_API_KEY` and `npx wrangler secret put REMINDER_TEST_TO`. Each `secret put` deploys a new Worker version with the current code; that's harmless.
- The CI `CLOUDFLARE_API_TOKEN` (Workers Editor, scoped to `dbam`) is confirmed able to update cron triggers. **If it can't:** a human widens the token, or runs `npx wrangler triggers deploy` once after merge.

#### 2. Roadmap

**File**: `context/foundation/roadmap.md`

**Intent**: Reflect progress. `/10x-implement` and `/10x-archive` manage the status transitions.

**Contract**: F-02 status per the lifecycle skills. No hand-edits beyond that.

### Success Criteria:

#### Automated Verification:

- `deploy` job on `main` succeeds (wrangler deploy, health check, read-only smoke) after the merge

#### Manual Verification:

- Resend account on the `+dbam` address and both Worker secrets set before merge
- CI token confirmed able to deploy cron triggers (or `wrangler triggers deploy` run once)
- Cloudflare → `dbam` → Settings → Trigger Events shows `*/30 * * * *` and successful runs within ~45 min of deploy
- Heartbeat emails arrive at the `+dbam` inbox every 30 minutes, and Workers Logs shows `sent` lines with no recipient or key in them

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Switch to daily 10:00 Warsaw

### Overview

Once the proving cron is confirmed, a follow-up PR moves to the daily schedule. The code already handles it, so only config changes.

### Changes Required:

#### 1. Wrangler config

**File**: `wrangler.jsonc`

**Intent**: One email per day at 10:00 Warsaw local time, correct across DST.

**Contract**: `"triggers": { "crons": ["0 8,9 * * *"] }`. Nothing else changes.

#### 2. Docs

**File**: `README.md` ("Scheduled jobs" subsection)

**Intent**: State the current schedule and why it has two UTC hours.

**Contract**: One or two sentences.

### Success Criteria:

#### Automated Verification:

- The PR's `ci` and `smoke` jobs pass, and `deploy` on `main` succeeds after the merge

#### Manual Verification:

- Trigger Events shows `0 8,9 * * *` and no further `*/30` runs after propagation
- The next day: two successful runs in Trigger Events (08:00 and 09:00 UTC), with one `sent` and one `skipped` in Workers Logs
- Exactly one heartbeat email arrives, at 10:00 Warsaw time

**Implementation Note**: After completing this phase, the human confirms the daily email before F-02 is closed with `/10x-archive`.

---

## Testing Strategy

### Unit Tests:

- None. The repo has no unit suite (CLAUDE.md, Testing Guidelines). The Warsaw gate and the cron-mode switch are covered by the dry-run `time` checks in Phase 1 and the CI step in Phase 2.

### Integration Tests:

- CI `smoke` job: dry-run scheduled invocations for both cron strings on the built Worker (Phase 2).

### Manual Testing Steps:

1. `npm run build && npm run preview`, then curl the dry-run proving cron and check the log.
2. Curl the daily cron with the four `time` values and check send/skip/skip/send.
3. Curl an unknown cron and check the named failure.
4. Set `EMAIL_DRY_RUN=false` with the real key, curl once, and check the inbox.
5. After the production deploy, check Trigger Events, Workers Logs and the inbox.

## Performance Considerations

- **Each run's cost:** at most one outbound `fetch` and trivial CPU. That's within Free's 10 ms CPU and 50 subrequests (network wait isn't CPU).
- **Resend usage:** the proving phase uses about 48 of Resend's 100/day. The daily phase uses 1/day.
- **Triggers:** the Worker uses 1 of the 5 Free cron triggers.

## Migration Notes

- **No database changes.**
- **Rollback of code:** `npx wrangler rollback`.
- **Stopping the cron:** deploy `"crons": []`, because trigger settings may survive a code rollback.
- **Reversing the entry change:** point `main` back at `@astrojs/cloudflare/entrypoints/server`.

## References

- Research: `context/changes/reminder-dispatch-path/research.md` (§A–F and the user-decisions follow-up)
- Prior sketch: `context/changes/deployment/deployment-plan.md:465`
- Roadmap: `context/foundation/roadmap.md` F-02 and the Parked item "Automated post-deploy verification of the reminder dispatch path"
- Env and secret pattern: `src/lib/supabase.ts:3`, `src/lib/config-status.ts:1`, `astro.config.mjs` env schema
- Generated-file pattern: `package.json` `db:types`, `eslint.config.js:85-86`
- CI: `.github/workflows/ci.yml:26-56`
- Lessons: `context/foundation/lessons.md` (Worker name; post-deploy propagation)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Worker entry, email module and cron config

#### Automated

- [ ] 1.1 Worker types generated and committed: `npm run cf:types` leaves `worker-configuration.d.ts` unchanged in git
- [ ] 1.2 Linting passes with no new warnings: `npm run lint`
- [ ] 1.3 Type checking passes: `npx astro check`
- [ ] 1.4 Build succeeds: `npm run build`
- [ ] 1.5 Catalog check still passes: `npm run catalog:check`

#### Manual

- [ ] 1.6 Local dry run returns `outcome: ok` and logs a `dry-run` line
- [ ] 1.7 Warsaw gate returns send/skip/skip/send for the four `time` values
- [ ] 1.8 `/cdn-cgi/local/scheduled` confirmed reachable under `astro preview` (or fallback recorded)
- [ ] 1.9 Unknown cron string returns a non-ok outcome with a named error
- [ ] 1.10 One live local send arrives at the `+dbam` inbox from `onboarding@resend.dev`
- [ ] 1.11 Site pages, static assets and auth still work under `npm run preview`

### Phase 2: CI dry-run check

#### Automated

- [ ] 2.1 Workflow lints as valid YAML and the PR's `ci` and `smoke` jobs pass
- [ ] 2.2 The `smoke` job log shows both dry-run scheduled calls returning `"outcome":"ok"`

#### Manual

- [ ] 2.3 Removing `scheduled` on a scratch branch makes the new CI step fail

### Phase 3: Production rollout

#### Automated

- [ ] 3.1 `deploy` job on `main` succeeds after the merge

#### Manual

- [ ] 3.2 Resend account on the `+dbam` address and both Worker secrets set before merge
- [ ] 3.3 CI token confirmed able to deploy cron triggers (or `wrangler triggers deploy` run once)
- [ ] 3.4 Trigger Events shows `*/30 * * * *` and successful runs within ~45 min of deploy
- [ ] 3.5 Heartbeat emails arrive every 30 minutes and logs contain no recipient or key

### Phase 4: Switch to daily 10:00 Warsaw

#### Automated

- [ ] 4.1 The PR's `ci` and `smoke` jobs pass, and `deploy` on `main` succeeds

#### Manual

- [ ] 4.2 Trigger Events shows `0 8,9 * * *` and no further `*/30` runs
- [ ] 4.3 Next day: two runs, one `sent` and one `skipped`
- [ ] 4.4 Exactly one heartbeat email arrives at 10:00 Warsaw time
