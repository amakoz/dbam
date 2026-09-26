---
project: Dbam
researched_at: 2026-09-24
recommended_platform: Cloudflare Workers
runner_up: Netlify
context_type: mvp
tech_stack:
  language: typescript
  framework: astro
  runtime: cloudflare-workers
---

## Recommendation

**Deploy on Cloudflare Workers.**

Cloudflare Workers is the only researched platform that passed all five agent-friendly criteria cleanly (CLI-first via `wrangler`, serverless/managed, agent-readable docs with `llms.txt`, a deterministic scriptable deploy API, and a GA remote-MCP path). It's also effectively free at Dbam's expected traffic (10k–100k requests/month sits inside the Free tier's 100k-requests/day allowance), which matches the "minimize cost" answer directly — the closest competitor on cost, Vercel, requires a mandatory $20/month Pro plan for any commercial use. Critically, it's also already what the repository is wired for: `astro.config.mjs` already uses the `cloudflare()` adapter, `wrangler.jsonc` already exists at the repo root, and `CLAUDE.md` already states the project is "deployed to Cloudflare Workers." The only correction this research surfaces is that `context/foundation/tech-stack.md`'s `deployment_target: cloudflare-pages` hint is stale — the actual scaffold already targets Workers, not Pages (see Anti-Bias Cross-Check, item 3).

## Platform Comparison

No hard filters applied: the interview confirmed no persistent-connection requirement (reminders run as scheduled/cron jobs, not WebSockets), and every researched platform supports the Node/TypeScript stack in some form, so all six candidates were scored.

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP/Integration | Total |
|---|---|---|---|---|---|---|
| **Cloudflare Workers** | Pass | Pass | Pass | Pass | Pass | 5 Pass |
| Netlify | Partial | Pass | Pass | Pass | Partial | 3P / 2Pa |
| Railway | Partial | Pass | Pass | Pass | Partial | 3P / 2Pa |
| Render | Partial | Pass | Pass | Partial | Pass | 3P / 2Pa |
| Vercel | Pass | Pass | Pass | Pass | Partial | 4P / 1Pa |
| Fly.io | Pass | Pass | Partial | Partial | Partial | 2P / 3Pa |

Notes per platform:

- **Cloudflare Workers**: `wrangler deploy`/`rollback`/`tail` are all mature GA commands; docs are published as markdown and `llms.txt`; Cron Triggers (GA) cover the reminder job natively; a GA remote-MCP path exists per the 2026-07-28 spec. The repo is already scaffolded for it.
- **Netlify**: deploy (`netlify deploy --prod`) and live logs are GA and safe-by-default (draft unless `--prod`), but rollback has no dedicated CLI verb (API-only via `netlify api restoreSiteDeploy`). Scheduled Functions (GA) cover reminders with a 30s execution cap — fine for email dispatch. Official MCP server is shipped but not explicitly GA-labeled.
- **Railway**: Railpack (beta) removes the need for a Dockerfile; native Cron Jobs (GA, 5-min minimum interval) cover reminders; CLI rollback is limited to "redeploy last," arbitrary version rollback is dashboard-only. One EU region (Amsterdam) — good for Poland latency.
- **Render**: native Node runtime, GA Cron Jobs (billed per job, $1/mo minimum), GA MCP server with 20+ tools — but CLI rollback is undocumented (dashboard/API only), and its docs are markdown-served rather than GitHub-hosted.
- **Vercel**: technically the strongest matrix after Cloudflare (GA cron, GA docs, live MCP), but Hobby's non-commercial clause forces Pro ($20/mo minimum) for a real product — a direct conflict with the cost-minimization answer.
- **Fly.io**: full VMs mean genuine WebSocket/long-process support (unneeded here) and low compute cost (~$2–6/mo), but cron is DIY (no native precise scheduler — requires Cron Manager or baking Supercronic into a Dockerfile), a Dockerfile gets auto-generated regardless, there's no Poland/EU-local region (Frankfurt/Amsterdam proxy only), and its self-management MCP tooling is early-stage (4 commits).

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Clean sweep on all five criteria, near-$0 cost at this traffic level, GA Cron Triggers cover the reminder engine that the entire PRD depends on, and it requires zero migration — the starter scaffold is already built for it.

#### 2. Netlify

The strongest alternative if the Workers-specific compatibility surface (below) turns out to be more friction than expected. GA Scheduled Functions, a free tier that likely covers this traffic level, solid agent-readable docs, and a shipped (if not explicitly GA-labeled) MCP server. Main gap versus Cloudflare: rollback isn't a first-class CLI verb.

#### 3. Railway

The best fit if a full container runtime (no edge-specific Node compatibility layer to reason about) is worth ~$5–15/month over Cloudflare's near-free tier. No Dockerfile needed (Railpack), native GA Cron Jobs, and a single well-placed EU region (Amsterdam).

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **Supabase-on-Workers is a documented fragile spot.** `@supabase/ssr` throws `"dynamic require of 'stream' is not supported"` unless `nodejs_compat` is explicitly set (supabase/supabase#37592) — not a Cloudflare-guaranteed compatibility, a workaround that could regress on a future Supabase SDK bump. *(Verification note: the repo's `wrangler.jsonc` already sets `compatibility_flags: ["nodejs_compat"]`, so this specific risk is currently mitigated in the scaffold — but it's a config line that must survive every future edit to that file, not a platform guarantee.)*
2. **Free-tier Cron Triggers cap at 10ms CPU time per invocation.** The reminder job (query due screenings across users, evaluate importance, dispatch notifications) will plausibly exceed 10ms of actual CPU time once the user base grows past a trivial size — forcing an unplanned upgrade to Paid ($5/mo) or a restructure onto Queues mid-build.
3. **The Pages→Workers consolidation is explicitly "transitional, not complete"** per Cloudflare's own team. `tech-stack.md`'s `deployment_target: cloudflare-pages` hint is stale relative to what's actually scaffolded (`CLAUDE.md` already says "Workers," `wrangler.jsonc` already exists) — low risk of breakage since the code is already correct, but the hand-off document should be corrected so it doesn't mislead a future agent run.
4. **Workers bill CPU time with a 15-minute wall-clock hard cap.** Any future feature needing a longer synchronous batch job (e.g. a nightly full-user eligibility recompute as the product grows) hits an architectural ceiling a container platform wouldn't have. Not an MVP blocker — the PRD's Non-Goals already exclude that kind of scale work.
5. **Cloudflare's own docs are inconsistent about whether the Cron Trigger limit is per-account or per-worker** (open GitHub issue, cloudflare-docs#29326, filed 2026) — the "5 free triggers" ceiling this plan leans on for the reminder feature isn't reliably documented by Cloudflare itself.

### Pre-Mortem — How This Could Fail

Six months after launch, Dbam is deployed on Cloudflare Workers and the reminder engine — the feature the entire PRD is built around — turns out to be the recurring source of outages. The team assumed `nodejs_compat` plus the Supabase Cloudflare guide would "just work," but a minor Supabase SDK bump introduced a new Node API call the compat layer didn't cover, and auth silently broke for a subset of users overnight with no clear error in `wrangler tail`. Separately, the reminder cron job — a simple loop over due screenings — kept tripping the 10ms CPU-time cap during a monthly spike (everyone's annual screenings clustering around the same dates), needing a hasty migration to Cloudflare Queues mid-flight, weeks the solo developer didn't have. Worse, because `tech-stack.md` still said "Cloudflare Pages" and nobody corrected it before the first deploy, the CI workflow referenced a deployment model the scaffold had already silently moved away from, costing a frustrating afternoon debugging a "working" deploy that wasn't actually serving the SSR routes correctly.

### Unknown Unknowns

- `nodejs_compat` being present is not the same claim as "sufficient for every Node API `@supabase/ssr` touches" — it usually just works, until a specific call path doesn't, and there's no way to prove absence of future breakage.
- Workers bills **CPU time, not wall-clock time** — a slow Supabase network round-trip doesn't cost CPU-ms while waiting on I/O (favorable), but "requests per second" load intuition doesn't map to cost the way it does on Render/Railway/Fly's per-second-of-VM-time model.
- `@astrojs/cloudflare` needs the `global_fetch_strictly_public` compatibility flag for SSR/fetch behavior to work as documented — confirmed present in current Astro-on-Cloudflare reference configs ([docs.astro.build/en/guides/integrations-guide/cloudflare](https://docs.astro.build/en/guides/integrations-guide/cloudflare/), [docs.astro.build/en/guides/deploy/cloudflare](https://docs.astro.build/en/guides/deploy/cloudflare/)) but **absent from the repo's current `wrangler.jsonc`** — a concrete, verified gap, not a hypothetical one.
- "Workers Sites" (old, deprecated) and "Workers Static Assets" (current — what `wrangler.jsonc`'s `assets` block already uses) have near-identical names but are different systems; copying an older tutorial is a realistic way to end up with a broken or double-migrated static-asset config.
- Cloudflare's remote-MCP tooling is dated 2026-07-28 — genuinely new, with minimal production track record for unattended agent-driven ops, despite scoring a clean "Pass" on the MCP criterion on paper.

**User decision**: proceed with Cloudflare Workers, risks noted and carried into the register below.

## Operational Story

- **Preview deploys**: Wrangler's Versions feature (GA) supports uploading a preview build without shipping it to production traffic — `wrangler versions upload` from a PR/branch produces a unique preview URL, and `wrangler versions deploy` promotes it (gradually or fully) to production. This slots into the existing GitHub Actions `ci.yml` as an additional step once a deploy job is added (see Out of Scope — CI/CD wiring is a follow-up, not part of this research).
- **Secrets**: `SUPABASE_URL`/`SUPABASE_KEY` are declared via `astro:env/server` per this repo's hard rule. In production they're set with `wrangler secret put SUPABASE_URL` / `wrangler secret put SUPABASE_KEY` (Cloudflare Workers Secrets — encrypted at rest, not readable back from the dashboard once set). Locally they live in `.dev.vars` (gitignored, already the repo's pattern). CI needs a scoped `CLOUDFLARE_API_TOKEN` GitHub secret (Workers-edit permission on this project only — no DNS, no billing, no other projects' secrets, per this project's production-access-boundary posture) to run `wrangler deploy` non-interactively. Rotation: re-run `wrangler secret put <NAME>`; new values take effect on the next Worker invocation without requiring a full redeploy, though redeploying immediately after is the safer verification step.
- **Rollback**: `wrangler deployments list` to find a prior deployment, then `wrangler rollback [deployment-id]` (defaults to the previous version if the id is omitted). Time-to-revert is near-instant — edge propagation typically completes in under a minute globally. Caveat: rollback reverts code and routing only, never a Supabase schema migration — if a deploy shipped a breaking DB migration alongside a code change, rolling back the Worker does not undo the DB change; migrations need their own separate, additive-first rollback discipline.
- **Approval**: human-only — rotating `SUPABASE_KEY` (the primary secret), deleting or renaming the Workers project, changing the billing tier, and scoping or rotating the `CLOUDFLARE_API_TOKEN` itself. An agent may perform unattended, once code is merged via a reviewed PR: `wrangler deploy` / `wrangler versions upload` for shipping code, and `wrangler tail` for reading logs.
- **Logs**: `wrangler tail` streams live production logs read-only from the terminal. For historical/aggregate views, Cloudflare's dashboard exposes Workers Logs / Logpush (GA); the remote-MCP path (noted as newer tooling above) can expose the same data as structured queries once there's more of a track record to lean on it for unattended ops.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Supabase SSR breaks on Workers if `nodejs_compat` is ever removed/misconfigured | Devil's advocate | L (already set in `wrangler.jsonc`) | H | Keep `nodejs_compat` in `compatibility_flags`; add an auth-flow check to `npm run smoke` so a regression fails CI, not production |
| Free-tier Cron Trigger 10ms CPU cap too tight for the reminder job at scale | Devil's advocate | M | M | Budget for Workers Paid ($5/mo) before the reminder job goes live, or move dispatch onto Cloudflare Queues instead of a synchronous loop |
| `tech-stack.md` said `cloudflare-pages`; actual scaffold already targets Workers | Devil's advocate / Research finding | **Resolved 2026-09-24** | M | `deployment_target` hint corrected to `cloudflare-workers` and the "Why this stack" prose updated to match |
| Cloudflare's docs are inconsistent on cron-trigger limit scope (per-account vs per-worker) | Devil's advocate | M | L | Verify the actual limit in the Cloudflare dashboard before relying on the free-tier ceiling; re-check cloudflare-docs#29326 before the first production cron deploy |
| `global_fetch_strictly_public` compat flag was missing from the repo's `wrangler.jsonc` | Unknown unknowns (verified against repo) | **Resolved 2026-09-24** | M | Flag added to `compatibility_flags` alongside `nodejs_compat`; still worth exercising via the smoke test before first deploy |
| "Workers Sites" vs "Workers Static Assets" naming confusion in third-party tutorials | Unknown unknowns | M | M | When following any Cloudflare tutorial, confirm it references "Static Assets" (what `wrangler.jsonc`'s `assets` block already uses), not the deprecated "Workers Sites" mechanism |
| Cloudflare's remote-MCP tooling is very new (spec dated 2026-07-28), little production track record | Unknown unknowns | L | L | Default to `wrangler` CLI for all production ops per this project's CLI-first posture; treat MCP as optional/experimental until it has more track record |
| A Worker rollback doesn't undo a Supabase schema migration shipped in the same deploy | Research finding | L | H | Keep Supabase migrations backward-compatible/additive where feasible; never rely on `wrangler rollback` alone to undo a breaking migration |
| No deploy job exists yet in `.github/workflows/ci.yml` despite `tech-stack.md`'s `auto-deploy-on-merge` hint | Research finding (repo verification) | H (confirmed absent today) | M | Add a deploy job gated on the existing `ci`/`smoke` jobs passing, using a scoped `CLOUDFLARE_API_TOKEN` GitHub secret (CI/CD wiring itself is out of scope for this research — see below) |

## Getting Started

The repo is already scaffolded for Cloudflare Workers — `@astrojs/cloudflare@^14.3.1` is installed, `astro.config.mjs` already uses the `cloudflare()` adapter, and `wrangler.jsonc` already exists with `compatibility_date: "2026-05-08"`. Both config gaps this research found have already been fixed:

1. ~~Add the missing compatibility flag~~ — done: `wrangler.jsonc`'s `compatibility_flags` now reads `["nodejs_compat", "global_fetch_strictly_public"]`.
2. ~~Correct the stale hand-off hint~~ — done: `context/foundation/tech-stack.md`'s `deployment_target` now reads `cloudflare-workers`, and its prose is updated to match.
3. Authenticate and do a first manual deploy to confirm the pipeline works end to end: `npx wrangler login`, then `npm run build && npx wrangler deploy`.
4. Set production secrets (not committed anywhere): `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY`.
5. Create a Cloudflare API token scoped to this Worker only (no DNS, no other projects, no billing) and add it as a `CLOUDFLARE_API_TOKEN` GitHub Actions secret — this unblocks wiring the actual deploy job into CI (the deploy job itself is CI/CD configuration, out of scope for this research; see Plan Mode for the guided first deployment).

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (including the actual GitHub Actions deploy job referenced in Getting Started step 5)
- Production-scale architecture (multi-region, HA, DR)
