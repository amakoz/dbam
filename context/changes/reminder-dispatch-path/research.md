---
date: 2026-09-29T18:35:13+02:00
researcher: Claude (Opus 5.5) for Amadeusz Kozlowski
git_commit: 6974e921301d16f4410cbeb06d0d1ae4312ba021
branch: main
repository: amakoz/dbam (worktree 10xdevs-second)
topic: "F-02 reminder-dispatch-path: how to run a Cron Trigger through the Astro Cloudflare adapter and deliver an email from it in production"
tags: [research, cloudflare-workers, cron-triggers, astro-cloudflare-adapter, email, ci, supabase]
status: complete
last_updated: 2026-09-29
last_updated_by: Claude (Opus 5.5)
last_updated_note: "Follow-up 2026-09-29: user decisions on provider, verification scope and plan tier; Resend plus-address check"
---

# Research: F-02 reminder-dispatch-path

**Date**: 2026-09-29T18:35:13+02:00
**Researcher**: Claude (Opus 5.5) for Amadeusz Kozlowski
**Git Commit**: 6974e921301d16f4410cbeb06d0d1ae4312ba021
**Branch**: main
**Repository**: amakoz/dbam

## Research Question

Roadmap F-02 (`context/foundation/roadmap.md:94-107`): "a scheduled job runs in production on a timer and delivers an email to a test address; the path is exercised in CI or post-deploy verification." What does the codebase already provide? How do Cloudflare Cron Triggers work with `@astrojs/cloudflare` 14? Which email provider fits, given that there is no custom domain yet? Where can verification plug into CI?

Sources: repo files (internal), plus Astro, Cloudflare and email-provider documentation and GitHub (external, checked 2026-09-29). Adapter internals were read from the sibling worktree's `node_modules` (`/Users/amadeuszkozlowski/Documents/10xdevs/node_modules`), whose versions match this worktree's `package-lock.json`: `@astrojs/cloudflare` 14.3.1 (`package-lock.json:96-97`), `astro` 7.3.2 (`:4171-4172`), `wrangler` 4.141.0 (`:10996-10997`). Nothing was built or run.

## Summary

1. **Cron wiring is settled and small.** Astro's documented custom-entrypoint pattern for adapter v13+ works like this:
   - Point `wrangler.jsonc` `main` at a user file (e.g. `src/worker.ts`).
   - In that file, export `{ fetch: handle, scheduled }`, with `handle` imported from `@astrojs/cloudflare/handler`.
   - Add `"triggers": { "crons": [...] }`.

   The installed adapter's default entry is literally `{ fetch: handle }` (`node_modules/@astrojs/cloudflare/dist/entrypoints/server.js`), and `./handler` is a public export. The deployment plan already recorded this approach (`context/changes/deployment/deployment-plan.md:465`).
2. **`astro:env/server` secrets are readable inside `scheduled()`**, provided `src/worker.ts` imports `@astrojs/cloudflare/handler`. That module runs `setGetEnv(createGetEnv(globalEnv))` at top level (`@astrojs/cloudflare/dist/utils/handler.js:31`). Astro's generated secrets are `export let` live bindings that are reassigned on `setGetEnv` (`astro/dist/env/vite-plugin-env.js:146-148`). The adapter changelog (#13444, ≥12.3.0) says `astro:env` can be called "anywhere server-side". This was not executed in workerd; verify it once.
3. **Email: of the six providers compared in §D, all except Brevo need a verified custom domain to reach arbitrary recipients; Brevo rewrites the sender to `@brevosend.com` instead. Dbam has no domain** (`deployment-plan.md:9-10,105`). The F-02 proof fits Resend in test mode: `from: onboarding@resend.dev` delivers only to the Resend account owner's address, needs no domain, is free (100/day), is one `fetch` POST, and supports an `Idempotency-Key` header. Cloudflare Email Service can't be used for F-02 for two reasons: it needs Workers Paid, and the sender must be on an onboarded domain on Cloudflare DNS. Supabase SMTP covers Auth emails only.
4. **Workers Free is enough for F-02 (one email per run), but not for S-04/S-06 at scale.** Per the Cloudflare limits page (updated 2026-09-05):
   - **Free:** 10 ms CPU per cron invocation and 50 subrequests.
   - **Paid:** 30 s CPU (15 min if the interval is ≥1 h) and 10,000 subrequests.
   - **Network waits don't count as CPU** on either plan.
5. **No documented way to fire a deployed cron on demand.** The external search found no API or CLI for it. To exercise the path in post-deploy verification, you need one of the following:
   - (a) a secret-protected HTTP endpoint that calls the same dispatch function;
   - (b) inspecting cron events and logs after the fact;
   - (c) a send-log row.

   Cron-trigger changes take "up to 15 minutes" to propagate. That is longer than the existing post-deploy retry window (3 × 20 s, `.github/workflows/ci.yml:117-130`; `context/foundation/lessons.md:12-17`).
6. **F-02 needs no user data.** Later slices (S-04/S-06/S-07) will need a sessionless privileged path, because the only key is the publishable one (`deployment-plan.md:188`) and `anon` has no grants on `profiles` or `health_data_consents`. That choice belongs to those slices, not to F-02.

## Detailed Findings

### A. Custom Worker entrypoint with `scheduled` (Astro adapter v14)

- **Installed default entry.** `node_modules/@astrojs/cloudflare/dist/entrypoints/server.js` is `export default { fetch: handle }`. The package `exports` include `"./handler": "./dist/utils/handler.js"`. `wrangler.js:36` defaults `main` to `@astrojs/cloudflare/entrypoints/server` when none is given. The repo sets it explicitly (`wrangler.jsonc:4`).
- **Documented pattern.** Astro docs, "Changed: Custom entrypoint API" (https://docs.astro.build/en/guides/integrations-guide/cloudflare/#changed-custom-entrypoint-api): set `"main": "./src/worker.ts"` and "create a standard Cloudflare Worker export object directly, rather than using the createExports() function". The docs example exports `fetch` + `queue`. `scheduled` follows the same `ExportedHandler` shape.
- **Recommended shape** (external agent report; not compiled):
  ```ts
  // src/worker.ts
  import { handle } from "@astrojs/cloudflare/handler";
  export default {
    fetch: (req, env, ctx) => handle(req, env, ctx),
    async scheduled(controller, env, ctx) {
      await runDispatch({ cron: controller.cron, scheduledTime: controller.scheduledTime });
    },
  } satisfies ExportedHandler<Env>;
  ```
  A real-world variant, `export default { ...astroHandler, scheduled }` with `triggers.crons`, is used in EmDash's Cloudflare templates (https://github.com/emdash-cms/emdash/pull/1312, merged 2026-06-12).
- **Version history that matters:**
  - **v12:** `workerEntryPoint` option.
  - **v13:** `createExports()` removed (#14306); `workerEntryPoint` removed (#15400); `main` moved to `@astrojs/cloudflare/entrypoints/server` (#15037); dev and preview run on workerd via `@cloudflare/vite-plugin`.
  - **v14.0.0:** Vite 8 only.
  - **v14.3.0 (#17887):** custom entrypoints fall back to static assets when no Astro route matches, and prerender uses the default server entrypoint. The repo's `^14.3.1` includes this, and it matters because the repo serves assets via the `ASSETS` binding (`wrangler.jsonc:7-11`). Source: https://raw.githubusercontent.com/withastro/astro/main/packages/integrations/cloudflare/CHANGELOG.md
- **Unverified edge.** The build-time prerender worker config inherits `triggers` while forcing the default entrypoint, which has no `scheduled`. This is expected to be harmless, because that worker runs only during the local build. The first `npm run build` will confirm it.
- **Types.** The repo has no `worker-configuration.d.ts`, and `src/env.d.ts` declares only `App.Locals`. `Env`, `ExportedHandler` and `ScheduledController` need either `wrangler types` (the Astro docs suggest it in the build script) or a hand-declared `Env`. `astro check` in the CI `ci` job will catch gaps.

### B. Secrets and env inside `scheduled()`

- **How the repo reads secrets.** The pattern is `import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server"` (`src/lib/supabase.ts:3`, `src/lib/config-status.ts:1`). Both are declared `optional: true` (`astro.config.mjs`, env schema), so reading them cannot throw at import time.
- **Mechanism:**
  - `handler.js:1,31` imports `env` from `cloudflare:workers` and calls `setGetEnv` at module load.
  - `astro/dist/env/runtime.js:4-6`: the default getter is `process.env[key]`, replaced by `setGetEnv`.
  - `vite-plugin-env.js:146-148`: every `server`+`secret` field becomes `export let KEY = …` and is reassigned on `setGetEnv`.

  So a `scheduled()` running in the same bundle sees live values.
- **Alternatives.** Both are officially supported, per https://developers.cloudflare.com/workers/runtime-apis/bindings/ and https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/:
  - the `env` argument of `scheduled(controller, env, ctx)`;
  - `import { env } from "cloudflare:workers"`.
- **New secret(s) for F-02.** An email API key (for example `RESEND_API_KEY`), a test recipient, and, if option (a) in §E is chosen, a trigger token. Per the repo convention (`README.md:38-41,193`; `deployment-plan.md:288-291,475`), each one needs:
  - an `astro.config.mjs` env-schema entry;
  - `.env.example`;
  - `.dev.vars`;
  - a human-run `npx wrangler secret put`.

  Setting secret values is human-only, and CI does not set secrets.

### C. Cron configuration and limits (Cloudflare)

- **Syntax.** `"triggers": { "crons": ["0 7 * * *"] }`, five fields, UTC only, with no timezone option. Weekday numbering is 1=Sunday … 7=Saturday, so prefer `MON`/`SUN` names. `controller.cron` equals the configured string character-for-character. Sources: https://developers.cloudflare.com/workers/configuration/cron-triggers/ and https://developers.cloudflare.com/workers/wrangler/configuration/#triggers
- **Deploy semantics:**
  - A deploy replaces the deployed crons.
  - `"crons": []` removes them.
  - Omitting or commenting out the key leaves the deployed crons in place ("Commenting out the `crons` key will not disable a Cron Trigger").
  - Propagation takes "up to 15 minutes".
  - Past cron events for a new Worker can take up to 30 minutes to appear.
- **Trigger count.** The limits page (updated 2026-09-05) says 5 on Free and 250 on Paid, "per account". The Cron Triggers page still says "per Worker". cloudflare-docs#29326 is still open with no staff answer. Treat the 5 as account-wide on Free. The roadmap already lists this unknown (`roadmap.md:105`).
- **Per-invocation limits.** Source: https://developers.cloudflare.com/workers/platform/limits/

  |                 | Free   | Paid                                   |
  | --------------- | ------ | -------------------------------------- |
  | CPU per cron    | 10 ms  | 30 s (<1 h interval) / 15 min (≥1 h)   |
  | Wall time       | 15 min | 15 min                                 |
  | Subrequests     | 50     | 10,000 default (configurable)          |

  "Waiting on network requests … does not count toward CPU time." F-02 sends one email with no DB access, so it fits Free. The 10 ms cap and the 50-subrequest cap are the S-04/S-06 concern already in the risk register (`context/foundation/infrastructure.md:60,92`). Unconfirmed: how `limits.cpu_ms` interacts with the cron-specific CPU tiers on Paid.
- **Existing flag.** `global_fetch_strictly_public` (`wrangler.jsonc:6`) doesn't affect calls to public email APIs.

### D. Email provider (no custom domain)

- **Repo state.** No domain: production is only `https://dbam.amadeuszkozlowski.workers.dev` (`deployment-plan.md:9-10,101,104`). Custom SMTP was deferred for lack of a domain (D5, `:105`), and "Buy a domain" is an open Phase 9 item (`:461-463`) that already blocks public signup. Buying a domain and editing DNS are human-only (`:463,475`). Supabase built-in SMTP sends only to team members, about 2 per hour (F5, `:76`), and custom SMTP covers Auth emails only (https://supabase.com/docs/guides/auth/auth-smtp).
- **Comparison** (checked 2026-09-29, primary sources unless noted):

  | Provider | Workers fit | Free | Domain needed for arbitrary recipients? / no-domain test path | EU posture | Idempotency key |
  |---|---|---|---|---|---|
  | **Resend** | Official CF tutorial; `fetch` | 100/day, 3,000/mo | Yes / `onboarding@resend.dev` → **account owner's address only** | EU sending region (Ireland); account data + logs in US (DPA, SCCs, DPF) | **Yes** (`Idempotency-Key`) |
  | **Cloudflare Email Service** | Native `send_email` binding + REST | None on Free; Paid includes 3k/mo, then $0.35/1k | Yes, on Cloudflare DNS / **none**: the sender must be on an onboarded domain | Cloudflare DPA; email residency undocumented | Not documented |
  | **Postmark** | Official CF tutorial; `fetch` | 100/mo | Yes; freemail senders banned / none usable | US hosting | No |
  | **Amazon SES** | `aws4fetch` SigV4; no official CF guide | Credits only | Sandbox: verified addresses only, 200/day | **Frankfurt** region | No |
  | **Brevo** | `fetch` | 300/day | Recommended; without one, From is rewritten to `@brevosend.com` | **EU hosting** | Batch sends only (not confirmed for single sends) |
  | **MailerSend** | `fetch` | 500/mo | Yes; trial sends go to the admin only (secondary source) | **EU** | Not found |

  Sources:
  - Cloudflare: https://developers.cloudflare.com/changelog/post/2026-04-16-email-sending-public-beta/, https://developers.cloudflare.com/email-service/platform/limits/, https://developers.cloudflare.com/email-service/platform/pricing/
  - Resend: https://developers.cloudflare.com/workers/tutorials/send-emails-with-resend/, https://resend.com/docs/knowledge-base/403-error-resend-dev-domain, https://resend.com/changelog/idempotency-keys, https://resend.com/docs/dashboard/domains/regions, https://resend.com/security/gdpr
  - Postmark: https://postmarkapp.com/support/article/1084-how-does-the-account-approval-process-work
  - Brevo: https://help.brevo.com/hc/en-us/articles/360001005510-Data-storage-location
  - Amazon SES: https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html
- **Cloudflare Email Service status.** Public beta since 2026-04-16, with no GA announcement in the changelog as of 2026-09-29. The old "verified destination addresses only" rule now applies only "before onboarding a sending domain", but the sender must still be on an onboarded domain.
- **Implication for later slices.** Real-user reminders (S-04+) are blocked on buying a domain, whichever provider is chosen. The email bodies must stay generic: screening names are Art. 9 health data, and Resend keeps logs in the US. Keep a DB-side "sent" ledger as the real idempotency guard for cron retries, whatever the provider.

### E. Local testing and production verification

- **Local.** Scheduled handlers are exercised via `/cdn-cgi/local/scheduled?cron=<urlencoded>&format=json`. The older paths `/cdn-cgi/handler/scheduled` and `/__scheduled` were renamed and are still rewritten (workers-sdk PR #14599, merged 2026-07-14). Cloudflare docs say the Vite plugin supports this. `astro dev` and `astro preview` run through `@cloudflare/vite-plugin`, so `curl localhost:4321/cdn-cgi/local/scheduled?...` is expected to work. **Not confirmed by any Astro doc or local run; verify once.** Miniflare rejects non-local `/cdn-cgi` requests (workers-sdk PR #13426).
- **CI today** (`.github/workflows/ci.yml`):
  - **`ci`** (`:11-24`) uses no secrets.
  - **`smoke`** (`:26-56`) runs local Supabase with **mailpit excluded** (`:40`), then pgTAP, a build, `npm run preview` on port 4321, and the full smoke.
  - **`migrate`** (`:60-79`) and **`deploy`** (`:81-130`) run on `main` only.
  - **`deploy`** runs `wrangler deploy --no-x-provision` (`:100`), then a health check with 10 × 3 s (`:105-114`), then a read-only smoke with 3 × 20 s (`:117-130`).
- **Smoke constraints.** `scripts/smoke.mjs:6-14` refuses a non-local `BASE_URL` without `SMOKE_READONLY=1`. `readonlySteps` (`:69-77`) are GET-only checks. A post-deploy check that sends an email is therefore not a "read-only smoke" step. It would need its own step and its own rule.
- **Production options:**
  1. **Protected trigger endpoint.** For example `POST /api/internal/dispatch-test`, gated by a bearer secret, calling the same function as `scheduled()`. It can be called by the `deploy` job after rollout. This proves that dispatch plus email works in production, but not the timer itself.
  2. **Observe the real cron.** Dashboard → Worker → Settings → Trigger Events keeps the last 100 invocations. Workers Logs is enabled (`wrangler.jsonc:12-14`), with 3-day retention on Free. `wrangler tail` also works. This proves the timer fires, but it's asynchronous: with up to 15 min of propagation, it doesn't fit a synchronous CI gate.
  3. **Send-log.** The job writes a row, and a later check reads it. This needs a table and a privileged write path, which is more than F-02 otherwise needs.

  **Inference:** (1) run post-deploy, plus (2) as a one-time manual check of the real timer, is the least machinery that meets the roadmap's "exercised in CI or post-deploy verification". If (1) calls Resend on every `main` deploy, it uses 1 of 100 free sends per day.
- **Unconfirmed: CI token and triggers.** The CI token is Account API Token, Specified Workers → `dbam`, role Editor (`deployment-plan.md:334-338`). Whether that role can update cron schedules (the Workers schedules API) was not verified. If it can't, the first deploy with `triggers` fails in the `deploy` job. Check it with a manual `wrangler deploy` first, or by reading the token's permission list in the dashboard.
- **In-CI option for the `smoke` job.** Hit `/cdn-cgi/local/scheduled` on the local preview, with a stub or dry-run email transport. CI has no email secret, and PR runs should not send real mail.

### F. Supabase access from a sessionless job (context for later slices)

- The only client factory is per-request and cookie-bound (`src/lib/supabase.ts:6-22`, `src/middleware.ts:10-19`). A job would construct a plain `@supabase/supabase-js` client instead.
- `SUPABASE_KEY` is the publishable key, and the deployment plan says to "Never" use the `service_role` / `sb_secret_…` key (`deployment-plan.md:188`).
- `profiles` and `health_data_consents` are `authenticated`-only with own-row RLS, and `anon` is revoked (`supabase/migrations/20260927190303_onboarding_profile.sql:28-30,44,94-124`). User email exists only in `auth.users`. `screening_catalog` is anon-readable, partly with a future cron in mind (`screening-catalog-v1/research.md:64`).
- The existing security-definer function is `withdraw_health_data_consent()` (`20260928061623_harden_consent_withdrawal.sql:11-31`), which is `auth.uid()`-guarded and granted to `authenticated` only.
- **F-02 does not need any of this.** S-04/S-06/S-07 must choose between a service-role secret (which reverses the "never" rule) and narrowly granted security-definer functions. Both need pgTAP cases (per CLAUDE.md).

## Code References

- `wrangler.jsonc:4` — `main: "@astrojs/cloudflare/entrypoints/server"`, which must change to the custom entry
- `wrangler.jsonc:6-14` — `nodejs_compat`, `global_fetch_strictly_public`, `ASSETS`, observability enabled
- `astro.config.mjs` (env schema) — secrets are `optional: true`; new secrets are declared here
- `node_modules/@astrojs/cloudflare/dist/entrypoints/server.js` — default entry `{ fetch: handle }`
- `node_modules/@astrojs/cloudflare/dist/utils/handler.js:1,31` — module-level `setGetEnv(createGetEnv(globalEnv))`
- `node_modules/astro/dist/env/vite-plugin-env.js:146-148` — secrets as reassignable `export let`
- `src/lib/supabase.ts:3,6-22` — `astro:env/server` import; per-request cookie client
- `src/lib/config-status.ts:1,6-8`, `src/pages/api/health.ts:6-12` — health check reports config; could include the email secret
- `src/env.d.ts` — only `App.Locals`; no Worker `Env` types
- `.github/workflows/ci.yml:40,100,105-114,117-130` — mailpit excluded; deploy; health retry; read-only smoke retry
- `scripts/smoke.mjs:6-14,69-77` — production guard; read-only steps
- `supabase/config.toml:99-107,219-227` — local inbucket on; custom SMTP commented out

## Architecture Insights

- The adapter's supported extension point is "own the Worker export". Keep `scheduled()` a thin wrapper around a plain function in `src/lib/`, so an HTTP trigger, a local `/cdn-cgi/local/scheduled` call and the real cron all run the same code.
- Send email over plain `fetch` to a REST API. This follows the repo's zero-dependency habits and avoids Node-API SDK risk under `nodejs_compat` (`infrastructure.md:67`).
- Two established repo rules shape verification:
  - production checks stay read-only (`scripts/smoke.mjs:6-14`; CLAUDE.md);
  - post-deploy checks race the rollout (`lessons.md:12-17`).

  A sending check must be an explicit, separately named step, and cron propagation (up to 15 min) needs its own tolerance.
- Keep the Worker `name: "dbam"` (`lessons.md:5-10`). Changing `main` does not rename the Worker.

## Historical Context (from prior changes)

- `context/changes/deployment/deployment-plan.md:465` — Phase 9 item "Cron Triggers for reminders": custom `src/worker.ts` wrapping `@astrojs/cloudflare/handler`, `main` pointed at it, `triggers.crons`, 10 ms CPU note, re-check cloudflare-docs#29326. **Supported** by current docs and installed adapter code.
- `context/changes/deployment/deployment-plan.md:76,105,461-463` — No domain; custom SMTP deferred; "Buy a domain" open. **Still accurate** at this commit.
- `context/changes/bootstrap-verification/verification.md:44-49,106` — Scheduled work is the starter's known gap; the user chose Cron Triggers or an external queue. **Still accurate**; Cron Triggers are viable.
- `context/foundation/infrastructure.md:60,63,92,94` — The 10 ms Free CPU cap and the limit-scope inconsistency. **Both still hold** as of the 2026-09-05 limits page and open issue #29326.
- `context/changes/screening-catalog-v1/research.md:64,126` — Catalog anon-readable for a future cron; a privileged sessionless path is needed for user data. **Still accurate**; it applies to S-04+, not F-02.

## Related Research

- `context/changes/screening-catalog-v1/research.md`
- `context/changes/screening-recommendations/research.md` (repeats the 10 ms CPU note at `:179`)
- `context/foundation/infrastructure.md`

## Open Questions

For the user, to decide before `/10x-plan`:
1. **Email provider for F-02.** The recommendation is Resend test mode (`onboarding@resend.dev` → the Resend account owner's address). It requires a Resend account whose owner email is the test address.
2. **Verification shape.** Protected trigger endpoint called post-deploy, versus observing the real cron manually, or both. Also whether a post-deploy step may send one real email per `main` deploy.
3. **Cron schedule for F-02.** For example daily at a fixed UTC hour, or temporarily frequent while proving and then relaxed. Free allows 5 triggers (account-wide, to be safe).
4. **Workers Paid (roadmap unknown, `roadmap.md:104`).** Not needed for F-02. It becomes needed for Cloudflare Email Service and for batch reminders.
5. **Domain purchase timing.** Not needed for F-02, but it blocks real-user reminders (S-04+) and public signup.

For the team, to verify during implementation:
6. `astro:env` values inside `scheduled()` at runtime (code-read only).
7. `/cdn-cgi/local/scheduled` under `astro dev` / `astro preview` (inferred from the Vite plugin docs).
8. Whether the CI token (Workers Editor, `dbam` only) can deploy `triggers`.
9. `wrangler types` versus a hand-written `Env` for `src/worker.ts`, checked by `astro check`.
10. Build-time prerender worker inheriting `triggers` (expected harmless).

## Follow-up: user decisions (2026-09-29)

Decisions from the user after the first pass. They supersede the matching Open Questions above.

1. **Provider: Resend test mode.** `from: onboarding@resend.dev`, sent to the user's private address with a `+dbam` tag.
   - Resend's docs say only that test sends go to "your own email address" associated with the account (https://resend.com/docs/knowledge-base/403-error-resend-dev-domain). They don't say whether a `+tag` variant of the owner address is accepted.
   - **Way around that:** register (or re-point) the Resend account under the `+dbam` address itself. The recipient then matches the owner address exactly, and Gmail still delivers plus-addressed mail to the base inbox.
   - **Keep the address out of the repo:** store it as a Worker secret or env value, e.g. `REMINDER_TEST_TO`.
   - **Local and CI runs:** Resend's `delivered@resend.dev` simulator address (https://resend.com/docs/dashboard/emails/send-test-emails) accepts sends without touching the inbox.
2. **No automated post-deploy verification in F-02.** The `deploy` job stays unchanged, so merges don't send emails.
   - Automated post-deploy verification of the dispatch path is parked as a separate roadmap item (`context/foundation/roadmap.md`, Parked).
   - F-02 is verified manually: the real cron fires (Trigger Events, Workers Logs) and the email arrives. Locally, via `/cdn-cgi/local/scheduled`.
   - The §E option "local `/cdn-cgi/local/scheduled` in the `smoke` job with a dry-run transport" sends no email and is not a `deploy` step. It is left for `/10x-plan` to include or drop.
3. **Cron schedule: once daily at 10:00 Polish time.** It goes in two steps:
   - **Proving step:** `*/30 * * * *`, about 48 emails/day, within Resend's 100/day. Use it until one production run is confirmed.
   - **Then a follow-up PR** switches to the daily schedule.
   - **DST constraint:** cron runs in UTC only (§C). Warsaw is UTC+2 (CEST) until 2026-10-25, then UTC+1 (CET). A single fixed hour (`0 8 * * *`) therefore drifts to 09:00 local in winter.
   - **Proposed daily shape:** one trigger `0 8,9 * * *`, with the handler sending only when the `Europe/Warsaw` local hour is 10 (`Intl.DateTimeFormat` with `timeZone`). That is 1 trigger, 2 invocations/day and 1 email/day, and it holds across DST.
   - Not yet run in workerd: whether its `Intl` data includes `Europe/Warsaw`. Verify this during implementation.
4. **No Workers Paid and no custom domain in the MVP plan.** Resolves `roadmap.md:104` for now. Limits the plan must live with:
   - **Workers Free:** 10 ms CPU, 50 subrequests and 15 min wall time per cron invocation. Cron triggers are capped at 5, treated as account-wide (§C).
   - **Workers Logs:** 3-day retention on Free (§E).
   - **Real users can't be emailed.** Resend test mode reaches only the account owner, so S-04/S-06/S-07 can be built and tested against that address. Sending to other users needs a domain (§D). Brevo is the only no-domain path to arbitrary recipients found, via a `@brevosend.com` rewritten sender, and it has not been evaluated for this app.
   - **Resend free tier:** 100/day, 3,000/month.
   - **Cloudflare Email Service** is unavailable (it needs Paid and a domain).
