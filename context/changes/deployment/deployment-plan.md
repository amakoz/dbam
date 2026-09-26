---
project: Dbam
planned_at: 2026-09-26
status: approved — executed manually by the owner
platform: Cloudflare Workers
environments: [production]
worker_name: dbam
cloudflare_account_id: fdf3fd78b2ab72e14ddb9d7531aa7f3c
workers_dev_subdomain: amadeuszkozlowski
production_url: "https://dbam.amadeuszkozlowski.workers.dev"
deploy_triggers: [push-to-main, workflow_dispatch]
deploy_approval: none (auto-deploy when ci + smoke are green on main; D6 changed 2026-09-26)
sources:
  - context/foundation/infrastructure.md
  - context/foundation/tech-stack.md
tooling_verified:
  astro: 7.3.2
  "@astrojs/cloudflare": 14.3.1
  wrangler: 4.141.0 # bumped from 4.131.1 on 2026-09-26 (F25)
  supabase-cli: 2.117.0
  gh: 2.101.0
cli_check: 2026-09-26
---

# First Deployment Plan: Dbam on Cloudflare Workers

Follows `context/foundation/infrastructure.md`: Cloudflare Workers, `wrangler` CLI first, scoped tokens, and a human does anything irreversible. Covers tooling prerequisites, the first manual deploy, and a GitHub Actions deploy that runs **automatically on push to `main`** and **manually through `workflow_dispatch`**. A deploy runs only after `ci` + `smoke` pass on that `main` commit, with no approval step (D6, changed 2026-09-26).

workers.dev subdomain = `amadeuszkozlowski` (checked 2026-09-26). `{ref}` = `ewlqmoyuobjiwprxszno`, the **Frankfurt** Supabase project (created 2026-09-26).

## Legend

| Marker        | Meaning                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------- |
| `[ ]` / `[x]` | Step not done / done. Tick it when done.                                                 |
| 🤖            | An agent (or you) can do this safely: local edits, builds, read-only CLI.                |
| 👤            | Human only: logins, secret values, dashboards, approvals, visibility, anything deleting. |
| ⛔ **GATE**   | Stop. Don't start the next phase until every check in the gate passes.                   |
| 🩹            | Edge case: what to do if this step goes wrong.                                           |

`! <command>` means run it yourself in the Claude Code prompt (or your own terminal), so secrets and browser logins stay out of the transcript.

## Phase status

| #   | Phase                                             | Owner   | Status               |
| --- | ------------------------------------------------- | ------- | -------------------- |
| 0   | Findings & decisions                              | 👤      | ✅ done              |
| 1   | Tooling & account prerequisites                   | 👤 + 🤖 | ✅ done (2026-09-26) |
| 2   | Repo prep (PR) + branch protection                | 🤖 + 👤 | ✅ done (2026-09-26) |
| 3   | Supabase production auth config                   | 👤      | ✅ done (2026-09-26) |
| 4   | First manual deploy                               | 👤 + 🤖 | ✅ done (2026-09-26) |
| 5   | Production secrets + auth verification            | 👤 + 🤖 | ✅ done (2026-09-26) |
| 6   | GitHub `production` environment + scoped CF token | 👤 + 🤖 | ✅ done (2026-09-26) |
| 7   | CI/CD deploy job: auto on push + manual dispatch  | 🤖 + 👤 | ✅ done (2026-09-26) |
| 8   | Rollback drill + ops check                        | 🤖 + 👤 | ✅ done (2026-09-26) |
| 9   | Deferred (tracked, not part of this deploy)       | —       | ⏸ deferred           |

Status values: ⬜ not started · 🟡 in progress · ✅ done · ❌ blocked (add a note)

---

## Phase 0: Findings & decisions ✅

### Findings

From checking the repo on 2026-09-26: `astro build`, `wrangler deploy --dry-run`, a git-history secret scan, CLI status checks, and web research.

Re-checked against the working tree on 2026-09-26, before Phase 2: F1, F2, F3 (no `astro:assets` or session usage in `src/`), F4, F6, F7, F8, F11, F12, F14 and F17 (jobs `ci` + `smoke`) all still hold. F13 is resolved by D2 + F19.

| #   | Finding                                                                                                                                                                                                                                                    | Effect on plan                                                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | **CI has never run.** `ci.yml` triggers on `master`, but the repo only has `main`.                                                                                                                                                                         | Phase 2 switches the triggers to `main`.                                                                                                                                                                                                  |
| F2  | The Worker is still named `10x-astro-starter`. Renaming after the first deploy creates a **new** Worker; secrets, URL and token scope stay on the old one.                                                                                                 | Rename to `dbam` before the first deploy (Phase 2).                                                                                                                                                                                       |
| F3  | The adapter adds `SESSION` (KV) and `IMAGES` bindings, and `wrangler deploy` **auto-creates** the KV namespace (on by default, hidden flags, cloudflare-docs#32978). A per-Worker token can't create KV. The app uses neither sessions nor `astro:assets`. | Phase 2: `session: false` + `imageService: "passthrough"`. CI deploys with `--no-x-provision`.                                                                                                                                            |
| F4  | `@astrojs/sitemap` is skipped because `site` isn't set.                                                                                                                                                                                                    | Set `site` in Phase 4.                                                                                                                                                                                                                    |
| F5  | Supabase's built-in SMTP **only sends to project team members**, about 2 emails/hour.                                                                                                                                                                      | Fine for testing with your own email. Custom SMTP blocks public signup (Phase 9).                                                                                                                                                         |
| F6  | Supabase env vars are `optional: true`. Without secrets the app still serves, with the "Supabase nie jest skonfigurowany" banner.                                                                                                                          | First deploy goes out without secrets. The banner is the "secrets missing" signal.                                                                                                                                                        |
| F7  | `astro:env` secrets (`access: "secret"`) are read **at runtime** from the Worker env, not at build time.                                                                                                                                                   | CI build doesn't need Supabase secrets. Production values live only in Cloudflare.                                                                                                                                                        |
| F8  | No `/auth/callback` route; `signUp()` has no `emailRedirectTo`, so the confirmation link goes to the Supabase **Site URL**.                                                                                                                                | Set Site URL (Phase 3). Check that a confirmed user can sign in (Phase 5). Auto-login is deferred (Phase 9).                                                                                                                              |
| F8b | **F8 resolved 2026-09-26:** `signUp()` sends `emailRedirectTo: <origin>/api/auth/callback`; the route exchanges the PKCE code and signs the user in. Opened in another browser (no code-verifier cookie) → `/auth/signin?confirmed=1`. Tested locally end to end with confirmations on (Mailpit). | Covered by the existing Redirect URL `https://dbam.amadeuszkozlowski.workers.dev/**` (3.2); no dashboard change. |
| F9  | Per-Worker API tokens are GA (2026-09-15), but the Worker **must already exist** to be selected.                                                                                                                                                           | First deploy via `wrangler login` (Phase 4), scoped token afterwards (Phase 6).                                                                                                                                                           |
| F10 | `wrangler secret put` fails on a Worker that doesn't exist yet (workers-sdk#14258).                                                                                                                                                                        | Deploy first, then secrets (Phase 4 → 5).                                                                                                                                                                                                 |
| F11 | `npm run smoke` creates `smoke-*@example.com` users. Against prod: junk accounts, bounced emails; signed-in steps fail with confirmation on.                                                                                                               | **Never run the full smoke test against production.** Since 2026-09-26 the script enforces it: a non-local `BASE_URL` needs `SMOKE_READONLY=1` (GET-only checks).                                                                                                                                                                                     |
| F12 | Bundle: 2.06 MiB raw / **455 KiB gzip**, under the Free plan's 3 MiB limit.                                                                                                                                                                                | No action. Re-check after adding heavy dependencies.                                                                                                                                                                                      |
| F13 | Dbam stores health-adjacent personal data for users in Poland.                                                                                                                                                                                             | Supabase in an EU region (Frankfurt).                                                                                                                                                                                                     |
| F14 | Local `supabase/config.toml` has `site_url = "http://127.0.0.1:3000"` and `[auth.email] enable_confirmations = false`.                                                                                                                                     | **Never run `supabase config push` against production.** It would disable email confirmation and point auth at localhost. Auth settings go in the dashboard.                                                                              |
| F15 | `npx supabase projects api-keys` prints the `service_role` / secret key.                                                                                                                                                                                   | Don't run it with an agent watching. Copy the **publishable** key from the dashboard.                                                                                                                                                     |
| F16 | On GitHub Free, **private** repos get no environment secrets, required reviewers, deployment-branch rules or branch protection.                                                                                                                            | Repo goes public (D9). Git history scanned 2026-09-26: no secrets. All of `context/` becomes public.                                                                                                                                      |
| F17 | Required status check names must exactly match job names (`ci`, `smoke`). If they're wrong, PRs wait forever on "Expected".                                                                                                                                | Turn on branch protection only after one PR run shows the real names.                                                                                                                                                                     |
| F18 | ~~With a required reviewer plus `concurrency`, GitHub keeps only the newest pending deploy.~~ No longer applies: D6 dropped the reviewer (2026-09-26). | `concurrency` still queues deploys one at a time, never cancelling a running one. |
| F19 | CLI check on 2026-09-26: the existing Dbam Supabase project (`ypeztjwqxhgqtpmvhcvz`) is in **`eu-west-1` (Ireland)**, not Frankfurt. The org already has 2 active projects (MeelPrep + Dbam), the Free plan maximum.                                       | Owner chose to keep D2: delete the empty Ireland project, **then** create Dbam in Frankfurt, then re-link (Phase 1.4–1.5).                                                                                                                |
| F20 | `gh` token scopes: `repo`, `read:org`, `gist`, `admin:public_key`. **No `workflow` scope**, but git pushes go over **SSH** (`git@github.com:amakoz/dbam.git`), so pushing `ci.yml` changes isn't affected. `gh workflow run` only needs `repo`.            | No action now. Run `gh auth refresh -s workflow` only if you switch the remote to HTTPS.                                                                                                                                                  |
| F21 | Cloudflare account is empty: no Workers, no KV namespaces. Subdomain `amadeuszkozlowski` is already claimed.                                                                                                                                               | Nothing to clean up before Phase 4. Any KV namespace that appears later was auto-provisioned (F3).                                                                                                                                        |
| F22 | `@astrojs/cloudflare` 14.3.x → `@cloudflare/vite-plugin` 1.54.8 pins **exactly** `wrangler@4.131.1`. Bumping only our `wrangler` to 4.141.0 installs two wranglers and two `workerd` runtimes (build ≠ deploy toolchain).                                  | Stay on 4.131.1. Bump `wrangler` only **together with** `@cloudflare/vite-plugin` (latest 1.60.2 pins 4.141.0), in its own PR after the first deploy. **Done 2026-09-26 (F25).**                                                                                     |
| F23 | Supabase CLI **2.118.0** doesn't find the login that 2.117.0 uses (`AccessTokenRequiredError`; it looks for `~/.supabase/profile`). Checked 2026-09-26.                                                                                                    | Stay on 2.117.0. CI `smoke` uses `supabase/setup-cli` `version: latest` = 2.118.0, but only for local `supabase start` (no login needed). `smoke` passed with `latest` on PR #1. **2026-09-26: `latest` broke** (run 36255351840, `7ac8028`): `setup-cli@v1` resolves `latest` via the unauthenticated GitHub API → `rate limit exceeded`, `smoke` red, `deploy` skipped. CI now pins `version: 2.118.0` (a fixed version downloads directly, no API call). Bump it by hand. |
| F24 | Cloudflare **Workers Builds** (dashboard Git integration) was connected to the repo after Phase 6. It deploys every push to `main` straight away, without waiting for GitHub checks, using its own build token and without `--no-x-provision`. On the PR #6 merge it deployed `af3e95fd` (2026-09-26 15:46Z) with no approval. | Owner **disconnected** it on 2026-09-26 (plan A). GitHub Actions `deploy` is the only deploy path. Never reconnect it. |
| F25 | First CI deploy (run 36254599797, `7e98bbb`) **went live** as `ff93c7bf`, but the job failed afterwards: wrangler 4.131.1 always calls the **account-level** `GET /accounts/{id}/workers/subdomain` to print the workers.dev URL, and the per-Worker token gets `Authentication error [code: 10000]`. The health check was skipped. wrangler 4.141.0 reads the URL from the per-Worker `/workers/scripts/dbam/subdomain` endpoint first. | Bump `wrangler` 4.141.0 + `@cloudflare/vite-plugin` 1.60.2 together (satisfies F22), on branch `chore/bump-wrangler-4.141`. Don't widen the token instead. |

### Decisions

- [x] **D1**: Worker name = `dbam` (URL `https://dbam.amadeuszkozlowski.workers.dev`)
- [x] **D2**: Supabase region = Central EU (Frankfurt, `eu-central-1`). Reconfirmed 2026-09-26 after the existing project turned out to be in Ireland: recreate it (F19).
- [x] **D3**: Astro sessions + Cloudflare Images binding turned off (F3)
- [x] **D4**: No custom domain for now; use workers.dev
- [x] **D5**: Custom SMTP **deferred**. No domain yet (Phase 9). Blocks public signup.
- [x] **D6**: ~~Every production deploy needs approval through the GitHub `production` environment~~. **Changed 2026-09-26 (owner):** deploy automatically when `ci` + `smoke` are green on `main`. The `production` environment stays (env-scoped secrets + protected-branches policy) but has **no required reviewer**.
- [x] **D7**: Manual trigger = `workflow_dispatch`, same full gate (lint/check/build + smoke), deploys **only from `main`**
- [x] **D11**: One deploy path only: GitHub Actions. Cloudflare Workers Builds disconnected (F24, 2026-09-26).
- [x] **D8**: One environment only: production. No staging.
- [x] **D9**: Repo `amakoz/dbam` becomes **public** (F16)
- [x] **D10**: Branch protection on `main`: PR required, `ci` + `smoke` must pass, 0 approvals, no force-push or deletion, admin bypass allowed

---

## Phase 1: Tooling & account prerequisites 👤 + 🤖 ✅

State checked with the CLIs on 2026-09-26: all three are installed and logged in. `wrangler` 4.131.1 and `supabase` CLI 2.117.0 are **project devDependencies only** (no global binaries on PATH), so always use `npx wrangler` / `npx supabase`, never global installs. What's left: the Supabase project is in the wrong region (F19), and the keys haven't been collected (1.6).

| CLI                    | Check                        | Result on 2026-09-26                                                                                   |
| ---------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `gh` 2.101.0           | `gh auth status`             | ✅ `amakoz`, keyring; scopes `repo`, `read:org`, `gist`, `admin:public_key`; git over SSH (F20)        |
| `npx wrangler` 4.131.1 | `npx wrangler whoami`        | ✅ OAuth, one account, `workers_scripts (write)` + `workers_tail (read)`. 4.141.0 available (optional) |
| `npx supabase` 2.117.0 | `npx supabase projects list` | ✅ logged in; Dbam linked, but region `eu-west-1` ❌ (F19). 2.118.0 available (optional)               |

### 1.1 GitHub CLI ✅

- [x] 👤 `! gh auth login`: logged in as `amakoz` (keyring). Git operations use SSH.
- [x] 🤖 `gh auth status` shows you logged in
- [x] 🤖 `gh api repos/amakoz/dbam --jq '{visibility, default_branch}'` → `{"default_branch":"main","visibility":"public"}`

🩹 **Workflow file pushes get rejected** ("refusing to allow an OAuth App to create or update workflow") → only happens over HTTPS; the token has no `workflow` scope (F20). Run `gh auth refresh -s workflow`.

### 1.2 Make the repo public (D9) ✅

- [x] 🤖 History secret scan re-run 2026-09-26: no matches.
  ```bash
  git log --all -p | grep -nE "sb_(publishable|secret)_|eyJhbGci|service_role" | grep -v '\${{'
  ```
- [x] 👤 `context/` contents checked for publication. The repo was already public when checked.
- [x] 👤 Repo visibility = `public` (checked via `gh api`)
- [x] 👤 Fork PR approval = **Require approval for first-time contributors** (`gh api repos/amakoz/dbam/actions/permissions/fork-pr-contributor-approval` → `first_time_contributors`)

🩹 **A later scan finds a real key** → rotate that key right away (Supabase dashboard / Cloudflare). The repo is public, so assume the key is already compromised. Rewriting history alone isn't enough.
🩹 Fork PRs run `pull_request` workflows **without secrets**. That's fine: `smoke` uses local Supabase, and `deploy` never runs on PRs.

### 1.3 Cloudflare / wrangler ✅

- [x] 👤 `! npx wrangler login` (browser OAuth). Token stored in `~/Library/Preferences/.wrangler/config/default.toml`.
- [x] 🤖 `npx wrangler whoami` → one account. **Account ID**: `fdf3fd78b2ab72e14ddb9d7531aa7f3c`
- [x] 👤 workers.dev subdomain already claimed: `amadeuszkozlowski` (checked with `GET /accounts/{id}/workers/subdomain`). The account has no Workers and no KV namespaces yet (F21).
- [x] 🤖 `npm run build && npx wrangler deploy --dry-run` succeeds: 2066 KiB / gzip 455 KiB. Bindings are still `SESSION` + `IMAGES` + `ASSETS`, as expected until Phase 2.3 removes the first two. Sitemap warning still shows (F4).
- [x] 🤖 (Optional) Bump `wrangler` 4.131.1 → 4.141.0: **tried and reverted** 2026-09-26 (F22)

🩹 **Several accounts in `whoami`** → `export CLOUDFLARE_ACCOUNT_ID=<id>` before every wrangler command, or add `"account_id"` to `wrangler.jsonc`. Account IDs aren't secret.
🩹 `**Authentication error [code: 10000]**` → `npx wrangler logout && npx wrangler login`.
🩹 **Browser callback fails** (localhost:8976 blocked by VPN or firewall) → `npx wrangler login --browser=false`, then open the printed URL by hand.

### 1.4 Supabase CLI ✅

- [x] 👤 `! npx supabase login`: logged in
- [x] 🤖 `npx supabase projects list` works. Result: Dbam (`ypeztjwqxhgqtpmvhcvz`) is in **`eu-west-1` (Ireland)** ❌. Owner chose to recreate it in Frankfurt (F19, D2).
- [x] 👤 Dashboard → Dbam (`ypeztjwqxhgqtpmvhcvz`) → Project Settings → General → **Delete project**. Gone from `projects list` as of 2026-09-26. It's empty, so nothing is lost. This has to come **first**: the org is at the Free plan's 2-active-project limit (MeelPrep + Dbam).
- [x] 👤 Dashboard → New project → name `Dbam`, region **Central EU (Frankfurt)**, strong DB password saved in your password manager
- [x] 🤖 `npx supabase projects list` → the new Dbam shows `"region": "eu-central-1"`, `ACTIVE_HEALTHY`. Ref: `ewlqmoyuobjiwprxszno`
- [x] 🤖 (Optional) Bump `supabase` 2.117.0 → 2.118.0: **tried and reverted** 2026-09-26 (F23)

🩹 **"Maximum limits reached" when creating the project** → the old Dbam isn't deleted yet (or is still being deleted). Wait for it to go away, or pause MeelPrep.
🩹 **Region isn't Frankfurt** → regions can't be changed. The project is still empty, so 👤 delete it and create it again.
🩹 `**LegacyPlatformAuthRequiredError**` → the login didn't stick. Set `SUPABASE_ACCESS_TOKEN` in your shell (not in the repo) and retry.

### 1.5 Link the Supabase project ✅

Re-linked 2026-09-26 from the deleted Ireland project (`ypeztjwqxhgqtpmvhcvz`) to the Frankfurt one.

- [x] 👤 `! npx supabase link --project-ref ewlqmoyuobjiwprxszno` → type the new project's **DB password** into the prompt. This overwrites the old link.
- [x] 🤖 `cat supabase/.temp/project-ref` = `ewlqmoyuobjiwprxszno`, `npx supabase projects list` shows `"linked": true` on the Frankfurt project, and the pooler host is `aws-0-eu-central-1.pooler.supabase.com`
- [x] 🤖 `supabase/.temp` is gitignored (`supabase/.gitignore:3`), and `git status` doesn't show it
- [x] 👤 Read and accept these two rules (owner accepted 2026-09-26):
  - ⚠️ **Never** `npx supabase config push` against production (F14)
  - ⚠️ **Never** `npx supabase projects api-keys` with an agent watching (F15)

🩹 **Link fails with "password authentication failed"** → reset the DB password (Project Settings → Database). Nothing uses it yet, so this is safe. Then link again.
🩹 **Link hangs or times out** (e.g. a network without IPv6) → by default the CLI connects through the pooler, which works over IPv4. Don't add `--skip-pooler`: that uses the direct connection, which is IPv6-only on Supabase. Rerun with `--log-level debug` to see where it stalls.

### 1.6 Collect the Supabase values ✅

- [x] 👤 (owner-confirmed 2026-09-26) From the **new Frankfurt project**: Dashboard → Project Settings → API Keys: copy the **Project URL** and the **publishable** key (`sb_publishable_…`, or the legacy `anon` key) into your password manager. Not needed until Phase 5.1–5.2.
  - ⚠️ **Never** the `service_role` / `sb_secret_…` key. `SUPABASE_KEY` feeds the cookie-based SSR client that runs on every request.
  - ⚠️ Don't copy anything from the old Ireland project. Its URL and keys stop working once it's deleted.

⛔ **GATE 1**: ✅ `gh auth status`, `npx wrangler whoami` and `npx supabase projects list` all succeed. ✅ Repo is public. ✅ Region is Frankfurt. ✅ The Frankfurt project is linked. ✅ URL + publishable key are in your password manager, not in chat or the repo.

---

## Phase 2: Repo prep (PR) + branch protection 🤖 + 👤 ✅

All changes go on branch `chore/deploy-prep` and reach `main` through a PR. The PR is also the first real CI run (F1).

- [x] 2.1 🤖 `git switch -c chore/deploy-prep`. Commit the pending docs first as their own commit. (`wrangler.jsonc` compat flag, `tech-stack.md`, `infrastructure.md` and this plan already went to `main` in `ca25913`; `CLAUDE.md` + plan updates → `31b6786`.)
- [x] 2.2 🤖 `wrangler.jsonc`: `"name": "10x-astro-starter"` → `"name": "dbam"` (F2)
- [x] 2.3 🤖 `astro.config.mjs`: add top-level `session: false` and `adapter: cloudflare({ imageService: "passthrough" })` (F3)
- [x] 2.4 🤖 `.github/workflows/ci.yml` triggers:
  ```yaml
  on:
    push:
      branches: [main]
    pull_request:
      branches: [main]
    workflow_dispatch: {}
  ```
  Also change "PRs to `master`" → "PRs to `main`" in `CLAUDE.md` (now also names both required jobs).
- [x] 2.5 🤖 `ci.yml` `ci` job: remove the `SUPABASE_URL`/`SUPABASE_KEY` env from the build step (F7)
- [x] 2.6 🤖 `package.json`: add `"deploy": "astro build && wrangler deploy"`
- [x] 2.7 🤖 Verify locally (2.2–2.6 committed as `bf8c446`):
  - [x] `npm run lint`
  - [x] `npx astro check`: 0 errors, 0 warnings, 0 hints
  - [x] `npm run build` (only the expected sitemap warning, F4)
  - [x] `npx wrangler deploy --dry-run` lists **only** `env.ASSETS` (no `SESSION`, no `IMAGES`). Bundle now 2038 KiB / gzip 448 KiB.
  - [x] `dist/server/wrangler.json` has `"name":"dbam"`, `nodejs_compat` and `global_fetch_strictly_public`
- [x] 2.8 🤖 `git push -u origin chore/deploy-prep && gh pr create --base main --fill` → [PR #1](https://github.com/amakoz/dbam/pull/1)
- [x] 2.9 🤖 `gh pr checks --watch` → `ci` (41 s) and `smoke` (2 min) both green on the first CI run ever (2026-09-26). **Exact check names:** `ci` / `smoke` (GitHub Actions app)
- [x] 2.10 👤 Merge the PR (`gh pr merge --squash --delete-branch`, or in the UI) → `f8e94e5` on `main`; the post-merge run on `main` has `ci` + `smoke` green
- [x] 2.11 👤 Turn on branch protection (D10), using the names from 2.9. **Owner runs this**: the agent's permission classifier blocks repo-settings changes ("CI Bypass"), which is the right boundary.
  ```bash
  gh api -X PUT repos/amakoz/dbam/branches/main/protection --input - <<'JSON'
  {
    "required_status_checks": { "strict": false, "contexts": ["ci", "smoke"] },
    "enforce_admins": false,
    "required_pull_request_reviews": { "required_approving_review_count": 0 },
    "restrictions": null,
    "allow_force_pushes": false,
    "allow_deletions": false
  }
  JSON
  ```
- [x] 2.12 🤖 `gh api repos/amakoz/dbam/branches/main/protection --jq '.required_status_checks.contexts'` → `["ci","smoke"]`; also 0 reviews, no force-push, no deletion, `enforce_admins: false`, `protected: true`

🩹 `**session: false` rejected by the Astro 7 schema** → remove it, create the namespace yourself (`npx wrangler kv namespace create SESSION`), and put its `id` in `wrangler.jsonc`. CI's `--no-x-provision` still applies.
🩹 **Dry-run still shows `IMAGES`** → check the `imageService` spelling, and that nothing imports `astro:assets`.
🩹 `**smoke` fails on its first ever run** → it has never run in this repo (F1). Fix it in this PR. If `supabase/setup-cli@v1` with `version: latest` is what broke, pin a version. Admin bypass is for emergencies only.
🩹 **Pre-commit hook fails** (husky → eslint/prettier) → review what it changed, re-stage, commit. Never `--no-verify`.
🩹 **After 2.11, PRs hang on "Expected — Waiting for status"** → the check names don't match (F17). Fix the `contexts` with the same `gh api` call.
🩹 `**gh api …/protection` returns 403 "Upgrade to GitHub Pro"** → the repo is still private (Phase 1.2).

⛔ **GATE 2** ✅: PR merged with green `ci` + `smoke`. Branch protection is active (checked via the API). A direct `git push` to `main` is rejected for everyone **except admins**: with `enforce_admins: false` (D10), your own direct push goes through and GitHub marks it "bypassed rule violations". Don't use that outside emergencies.

---

## Phase 3: Supabase production auth config 👤 ✅

Dashboard only. `supabase config push` would carry the local dev settings over (F14).

- [x] 3.1 Authentication → URL Configuration → **Site URL** = `https://dbam.amadeuszkozlowski.workers.dev`
- [x] 3.2 **Redirect URLs**: add `https://dbam.amadeuszkozlowski.workers.dev/**` and `http://localhost:4321/**`
- [x] 3.3 Authentication → Sign In / Providers → Email: **Confirm email = ON** (Supabase's default for hosted projects; the local config has it off)
- [x] 3.4 Authentication → Rate Limits: leave the defaults (custom SMTP comes later, D5)
- [x] 3.5 Nothing to migrate: `supabase/migrations/` doesn't exist yet (Phase 9)

🩹 **Free-tier projects pause after about 7 days of inactivity.** Symptom: auth times out or returns 5xx while the Worker is fine. Restore it from the dashboard.
🩹 **Email never arrives**: before custom SMTP, only team-member addresses get mail, max 2/hour (F5).

⛔ **GATE 3** ✅ (owner-confirmed 2026-09-26): Site URL and redirect URLs saved with the real subdomain. Confirm email is ON.

---

## Phase 4: First manual deploy 👤 + 🤖 ✅

Deploying from your laptop (OAuth login) creates the `dbam` Worker. The scoped CI token needs it to exist (F9).

- [x] 4.1 🤖 `git switch main && git pull`. Set `site: "https://dbam.amadeuszkozlowski.workers.dev"` in `astro.config.mjs` (F4) on branch `chore/site-url`, then PR → green → 👤 merge. (Branch protection is on, so this goes through a PR too.) → [PR #2](https://github.com/amakoz/dbam/pull/2), `ba03df1` on `main`
- [x] 4.2 🤖 On an up-to-date `main`: `npm ci && npm run build`, and check the sitemap warning is gone. `sitemap-index.xml` created; dry-run lists only `env.ASSETS`, 2038 KiB / gzip 448 KiB
- [x] 4.3 👤 First deploy, no secrets yet (F6/F10). **Owner runs this**: the agent's permission classifier blocks production deploys, same boundary as 2.11.
  ```bash
  npx wrangler deploy --message "manual: first deploy, no secrets"
  ```
- [x] 4.4 🤖 Add the printed URL and version ID to the **Deployment log**

🩹 **"You need to register a workers.dev subdomain"** → finish Phase 1.3, then retry.
🩹 **Output mentions provisioning a KV namespace** → 2.3 didn't take effect. Fix the config and redeploy; 👤 delete the orphaned namespace in the dashboard.
🩹 **A Worker named `10x-astro-starter` appears** → 2.2 was skipped. Don't rename it in the dashboard. Deploy as `dbam`, then 👤 delete the stray Worker.
🩹 `**workers.dev` URL returns 404/1042 for about a minute after the first deploy** → normal first-time propagation. Retry for up to 2 minutes before debugging.

⛔ **GATE 4** ✅ (2026-09-26, first try, no propagation delay; also `/sitemap-index.xml` 200, `/does-not-exist` 404, `/auth/signin` 200, `wrangler kv namespace list` → `[]`): `curl -sI https://dbam.amadeuszkozlowski.workers.dev/` → `200`, and the page shows the "Supabase nie jest skonfigurowany" banner (expected at this point).

---

## Phase 5: Production secrets + auth verification 👤 + 🤖 ✅

- [x] 5.1 👤 `! npx wrangler secret put SUPABASE_URL`, then paste the Project URL
- [x] 5.2 👤 `! npx wrangler secret put SUPABASE_KEY`, then paste the **publishable** key
  - Each `secret put` creates **and deploys** a new version right away.
- [x] 5.3 🤖 `npx wrangler secret list` shows both names
- [x] 5.4 🤖 Read-only production checks (**not** `npm run smoke`, F11):
  - [x] `GET /` → `200`, banner **gone**
  - [x] `GET /dashboard` → `302`, `Location: /auth/signin`
  - [x] `GET /auth/signin`, `GET /auth/signup` → `200`
  - [x] `GET /_astro/<asset>` → `200`, `Cache-Control: public, max-age=31536000, immutable`
  - [x] `GET /does-not-exist` → `404`
  - [x] `GET /sitemap-index.xml` → `200`
- [x] 5.5 🤖 `npx wrangler tail dbam --format pretty` running while you do 5.6
- [x] 5.6 👤 Browser test with **your own Supabase-account email**:
  - [x] Sign up → `/auth/confirm-email`
  - [x] The email arrives, and its link points at `dbam.amadeuszkozlowski.workers.dev` (not `localhost`)
  - [x] After confirming, sign in → `/`; `/dashboard` renders (owner-confirmed 2026-09-26)
  - [x] Sign out → `/dashboard` sends you to sign-in again
- [x] 5.7 🤖 Tail output: no uncaught exceptions, no `dynamic require` errors (2026-09-26: signup, confirm-email, `/?code=…` (F8), signin, signout all `Ok`)
- [ ] 5.8 👤 (Optional) Delete the test user in Authentication → Users

🩹 **Banner still shows** → secret names are case-sensitive and must match `astro.config.mjs`. Check `npx wrangler secret list`, then `wrangler secret delete <WRONG>` and put it again.
🩹 `**dynamic require of "stream" is not supported**` → `nodejs_compat` is missing from the deployed config. Check `dist/server/wrangler.json`.
🩹 **Email link points at `localhost`/`127.0.0.1`** → Site URL (3.1) wasn't saved. Fix it and sign up again with a plus-address (`you+t2@…`).
🩹 **You land on `/?code=…` but aren't signed in** → expected (F8). Signing in by hand must still work. If it fails with "Email not confirmed", check `email_confirmed_at` for that user in the dashboard, then move the `/auth/callback` item up from Phase 9.
🩹 `**email rate limit exceeded` (429)** → the built-in SMTP cap. Wait an hour.
🩹 **POST returns 403 "Cross-site POST form submissions are forbidden"** → Astro `checkOrigin` mismatch. Check that `site` matches the URL you're actually on.

⛔ **GATE 5** ✅ (2026-09-26): all of 5.4 and 5.6 checked, tail is clean. **Milestone: first deploy done.**

---

## Phase 6: GitHub `production` environment + scoped Cloudflare token 👤 + 🤖 ✅

- [x] 6.1 🤖 Create the environment with you as required reviewer (D6), limited to protected branches, which means `main` (reviewer removed later, see 7.0):
  ```bash
  USER_ID=$(gh api users/amakoz --jq .id)
  gh api -X PUT repos/amakoz/dbam/environments/production --input - <<JSON
  {
    "reviewers": [{ "type": "User", "id": $USER_ID }],
    "prevent_self_review": false,
    "deployment_branch_policy": { "protected_branches": true, "custom_branch_policies": false }
  }
  JSON
  ```
  `prevent_self_review: false` is required. As a solo dev you're both the one who triggers and the one who approves.
- [x] 6.2 👤 Cloudflare dashboard → Manage Account → **Account API Tokens** → Create:
  - Scope: **Specified Workers** → `dbam`
  - Role: **Editor** (deploy, versions, secrets, rollback, tail; can't delete the Worker or touch other Workers)
  - No zone/DNS, billing, or KV/R2/D1 permissions
  - Expiry: 6 months. Rotation date: `____-__-__` (created 2026-09-26, so about 2027-03-26; fill in the exact expiry from the dashboard and put it in your calendar)
- [x] 6.3 👤 Test the token read-only, straight from the clipboard:
  ```
  ! CLOUDFLARE_API_TOKEN=$(pbpaste) npx wrangler deployments list --name dbam
  ```
- [x] 6.4 👤 `! gh secret set CLOUDFLARE_API_TOKEN --env production` → paste at the prompt
- [x] 6.5 🤖 `gh secret set CLOUDFLARE_ACCOUNT_ID --env production --body fdf3fd78b2ab72e14ddb9d7531aa7f3c` (not sensitive)
- [x] 6.6 🤖 `gh variable set PRODUCTION_URL --env production --body https://dbam.amadeuszkozlowski.workers.dev`
- [x] 6.7 🤖 `gh secret list` (repo level) → 👤 delete any `SUPABASE_URL`/`SUPABASE_KEY` there (`gh secret delete <NAME>`). Nothing reads them after 2.5. (2026-09-26: no repo-level secrets, nothing to delete)
- [x] 6.8 🤖 Verify (2026-09-26: rules `required_reviewers` (`amakoz`, `prevent_self_review: false`) + `branch_policy` (`protected_branches: true`); env secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; env var `PRODUCTION_URL`):
  - `gh api repos/amakoz/dbam/environments/production --jq '.protection_rules'` shows a `required_reviewers` rule
  - `gh secret list --env production` shows both secrets
  - `gh variable list --env production` shows `PRODUCTION_URL`

🩹 `**dbam` isn't in the "Specified Workers" picker** → Phase 4 isn't done, or it deployed under a different name/account.
🩹 **6.3 fails with code 10000 / 9109** → you created a _user_ token when it should be an _account_ token, or the account ID doesn't match.
🩹 **6.1 returns 422 on `protected_branches`** → branch protection (2.11) isn't active yet.

⛔ **GATE 6** ✅ (2026-09-26): 6.3 lists the Phase 4/5 deployments, and 6.8 shows all three checks.

---

## Phase 7: CI/CD deploy job: auto on push + manual dispatch 🤖 + 👤 ✅

The triggers were added in 2.4. This phase adds the job on branch `ci/deploy-job` → PR.

- [x] 7.0 👤 (added 2026-09-26, D6 change + F24) Disconnect Workers Builds: Dashboard → Workers → `dbam` → Settings → Build → Git repository → **Disconnect** (done 2026-09-26)
- [x] 7.0b 👤 Remove the required reviewer and keep the branch policy (done 2026-09-26; verified: rules = `branch_policy` only):
  ```
  ! gh api -X PUT repos/amakoz/dbam/environments/production -F wait_timer=0 -F 'reviewers[]' -F 'deployment_branch_policy[protected_branches]=true' -F 'deployment_branch_policy[custom_branch_policies]=false' --jq '[.protection_rules[].type]'
  ```
  Expected output: `["branch_policy"]`. (An agent may not do this: it weakens a protection control.)

- [x] 7.1 🤖 Add to `.github/workflows/ci.yml` (2026-09-26; `--no-x-provision` checked against wrangler 4.131.1 with `deploy --dry-run`: accepted, while an unknown flag errors):
  ```yaml
  deploy:
    needs: [ci, smoke]
    if: github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')
    runs-on: ubuntu-latest
    environment:
      name: production
      url: ${{ vars.PRODUCTION_URL }}
    concurrency:
      group: production-deploy
      cancel-in-progress: false # never kill a deploy that's already running
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - name: Deploy to Cloudflare Workers
        run: npx wrangler deploy --no-x-provision --message "$DEPLOY_MESSAGE"
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          DEPLOY_MESSAGE: "${{ github.event_name }}: ${{ github.sha }}"
      - name: Post-deploy health check
        env:
          PRODUCTION_URL: ${{ vars.PRODUCTION_URL }}
        run: |
          for i in $(seq 1 10); do
            curl -sf -o /dev/null "$PRODUCTION_URL/" && exit 0
            sleep 3
          done
          echo "::error::Health check failed. Roll back with: npx wrangler rollback -m 'health check failed' -y"
          exit 1
  ```
  Why it's shaped like this:
  - **Two triggers, one gate.** Push to `main` and `workflow_dispatch` both go through `ci` + `smoke` first (D7).
  - **Main only, twice over.** The `if` and the environment's protected-branch policy both block deploys from other branches.
  - **Green means go.** No approval step (D6 as changed). The `environment: production` key exposes the environment secrets and variables, and its protected-branches policy is the second main-only guard.
  - **Same wrangler as your laptop.** `npx wrangler` runs the version pinned in `package-lock.json`.
  - **No surprise resources.** `--no-x-provision` stops CI from ever creating account resources (F3).
  - **Traceable deploys.** `--message` records the trigger and SHA in `wrangler deployments list`.
  - **Expressions go through `env:`.** An unquoted `run:` containing `": "` is invalid YAML (the original draft of this snippet failed Prettier), and keeping `${{ }}` out of shell scripts avoids script injection.
- [x] 7.2 🤖 (PR #6, 2026-09-26) Push the branch and open a PR → `ci` + `smoke` run, and `**deploy` shows as skipped**
- [x] 7.3 👤 (PR #6, then #7–#9; fixes F25, F23) Merge once `ci` + `smoke` are green (see *Merging PRs*). **Auto path:** the run on `main` goes `ci` + `smoke` → `deploy` with no wait. (Run 36253051192 from the PR #6 merge was created while the reviewer still existed and sits in "Waiting"; cancel it.)
- [x] 7.4 🤖 (first try deployed but the job went red, F25; first fully green run 36255990813, `3fa3da5` → `f4dc0417`, 2026-09-26) `gh run watch` → deploy + health check green. `npx wrangler deployments list` shows `push: <sha>`
- [x] 7.5 (run 36256449423 → `0d5e986f`, 2026-09-26) **Manual path:** 🤖 `gh workflow run CI --ref main`, then `gh run watch`. Result: `workflow_dispatch: <sha>` in `deployments list`. (Or use Actions → CI → **Run workflow** → branch `main`.)
- [x] 7.6 (run 36256644239 on `docs/record-phase-7`: `ci` + `smoke` ✅, `deploy` skipped, production unchanged, 2026-09-26) **Negative test:** 🤖 `gh workflow run CI --ref <any-other-branch>` → `ci` + `smoke` run, and `deploy` is **skipped**

🩹 **Run sits in "Waiting"** → the environment still has a required reviewer; redo 7.0b.
🩹 **Two deploys per merge / a deploy with Message `-`** → Workers Builds was reconnected (F24). Disconnect it again.
🩹 `**Authentication error` in the deploy step** → the secrets are at repo level, or the job lost its `environment:` key. Check `gh secret list --env production`.
🩹 **Health check fails right away with an empty URL** → `vars.PRODUCTION_URL` isn't set on the environment (6.6).
🩹 **Deploy green, health check red** → run `npx wrangler rollback -m "health check failed" -y` locally, then investigate with `npx wrangler tail dbam`.
🩹 **Deploy step waits on a prompt / times out** → a new binding needs provisioning, and `--no-x-provision` blocked it. A human creates the resource and puts its ID in `wrangler.jsonc`.
🩹 **Hotfix while `smoke` is broken for reasons outside the app** → fix `smoke` first (pin the Supabase CLI version). As a last resort, deploy from your laptop with `npm run deploy` and write down why in the Deployment log.
🩹 **"Run workflow" button missing** → `workflow_dispatch` has to be in the workflow file on the **default branch** (`main`), which 2.4 already does.

⛔ **GATE 7** ✅ (2026-09-26): 7.2–7.6 all behave as described. Automatic and manual deploys both work without an approval step, only after `ci` + `smoke` are green, and a non-main branch never deploys.

---

## Phase 8: Rollback drill + ops check 🤖 + 👤 ✅

2026-09-26: Claude Code's auto-mode classifier blocks the agent from running `wrangler rollback` (treated as a production deploy) and, in the same session, `wrangler tail` / `secret list`. The owner ran 8.1–8.4 by hand; the agent checked the outcome read-only (`deployments list`, `curl`).

- [x] 8.1 👤 (2026-09-26: current `06c88cde` / `push: de56173`, previous `0d5e986f` / `workflow_dispatch: 3fa3da5`) `npx wrangler deployments list` → note the current and previous version IDs in the log
- [x] 8.2 👤 (2026-09-26 17:40Z; actually rolled back to `d1d36987`, a Phase 5 secret-change version, not `0d5e986f`; see the log) `npx wrangler rollback <previous-version-id> -m "rollback drill" -y` → site still `200`; the rollback appears in `deployments list`
- [x] 8.3 👤 (2026-09-26 17:42Z, back on `06c88cde`; `200`, no "not configured" banner) Roll forward: `npx wrangler rollback <current-version-id> -m "roll forward after drill" -y`, or trigger a manual deploy (7.5)
- [x] 8.4 👤 (checked by hand by the owner, 2026-09-26) Ops commands work:
  - [x] `npx wrangler tail dbam --format pretty`
  - [x] Dashboard → Workers → `dbam` → Logs shows events (`observability.enabled: true`)
  - [x] `npx wrangler secret list`
- [x] 8.5 🤖 (2026-09-26, owner's choice: the two "never run X against prod" rules went into `CLAUDE.md` *Hard rules* instead, because every session loads that file; the Worker-rename trap went into `context/foundation/lessons.md`) Save "never run `npm run smoke` against prod" (F11), "Worker rename = new Worker" (F2) and "never `supabase config push` to prod" (F14) with `/10x-lesson` into `context/foundation/lessons.md`

🩹 **Rollback lands on an unexpected version** (happened in the 8.2 drill: `d1d36987` instead of `0d5e986f`) → always pass the version ID explicitly, copied from `deployments list`, and check `deployments list` right after.
🩹 **Rolled back to a version from before a secret rotation** → it runs with the old secret value. Run `wrangler secret put` again after the rollback.
🩹 **The next CI deploy "undoes" your rollback** → expected: `main` is the source of truth. Revert the bad commit in a PR, don't just roll back.
🩹 Rollback never undoes Supabase schema changes. No migrations exist yet.

⛔ **GATE 8** ✅ (2026-09-26): drill done, production back on the latest version (`06c88cde`). 8.5 done the same day.

---

## Phase 9: Deferred ⏸

Each item has a trigger. Start it when the trigger fires, not before.

- [ ] **Buy a domain**. Unblocks the next two items (D4 + D5).
- [ ] **Custom SMTP** (Resend/Postmark/SES + SPF/DKIM, then check the Auth rate limits). Trigger: before any non-team signup. **Blocks public launch.**
- [ ] **Custom domain** (👤 only: per-Worker tokens don't cover custom domains). After moving, update `site`, the Supabase Site URL/Redirect URLs, and `vars.PRODUCTION_URL`.
- [x] `**/auth/callback` route** (`exchangeCodeForSession` + `emailRedirectTo`). Trigger: 5.6 shows confirmed users can't sign in, or you want auto-login after confirming. Done 2026-09-26 as `/api/auth/callback` (F8b; the path follows the `src/pages/api/auth/*` convention). 👤 Verify on prod: sign up with a plus-address of your team email, click the link → land on `/` signed in.
- [ ] **Cron Triggers for reminders** (FR-007/009/011/012). Custom `src/worker.ts` wrapping `@astrojs/cloudflare/handler` with `scheduled()`, then `main` → that file and `triggers.crons` in `wrangler.jsonc`. The Free plan allows **10 ms CPU** per invocation, so plan for Workers Paid ($5/mo) or Queues. Re-check cloudflare-docs#29326 for the cron limit scope.
- [ ] **Supabase migrations pipeline** (`npx supabase db push` against the linked project, additive-first; a separate approved CI job). Trigger: first table.
- [ ] **Staging environment + PR previews** (`wrangler versions upload --preview-alias pr-<n>`). Needs its own Supabase project first, since previews would otherwise hit the prod DB with prod secrets (D8).
- [x] **Read-only smoke mode** (`SMOKE_READONLY=1`) so the post-deploy check covers more than `GET /`. Done 2026-09-26: `deploy` runs it after the health check. The script refuses a non-local `BASE_URL` without the flag.
- [ ] **Token rotation** on the date from 6.2 (👤).

---

## Human-only actions

Browser logins (`gh`, `wrangler`, `supabase`); changing repo visibility; typing the DB password and secret values; creating or rotating the Cloudflare API token; Supabase Auth/SMTP settings; **merging PRs to `main`** (= production deploy); changing `production` environment protection rules; connecting Cloudflare Git integrations (Workers Builds); deleting any Worker, KV namespace, secret or Supabase project; DNS / custom domains.

## Merging PRs

👤 **Merging PRs to `main` is human-only** (owner decision, 2026-09-26). A merge ships to production: once `ci` + `smoke` pass on `main`, the `deploy` job runs with no approval (D6 as changed). 🤖 The agent opens PRs, reports `ci` / `smoke` status, and stops; it never runs `gh pr merge`, and never uses `--admin` or any other branch-protection bypass. (History: merging was human-only, then briefly agent-allowed on 2026-09-26 while every deploy still needed approval.)

## Deployment log

| Date       | Phase | Trigger         | Version ID                             | Message / SHA                                  | Result | Notes                                                                   |
| ---------- | ----- | --------------- | -------------------------------------- | ---------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| 2026-09-26 | 4.3   | manual (laptop) | `78ad2a4f-e1e9-4219-a44e-b010a9afc0f7` | `manual: first deploy, no secrets` / `ba03df1` | ✅ 200 | Creates Worker `dbam`; only `ASSETS` binding; banner shown (no secrets) |
| 2026-09-26 | 5.1–5.2 | `wrangler secret put` ×2 | `8a55721b-3041-4ccf-8435-cfd423217311` | Secret Change / `ba03df1` | ✅ Gate 5 | Current version. Supersedes secret-change versions `6038bd94`, `380029bf`, `d1d36987`, `ca84c8b6`, `37f4c334` |
| 2026-09-26 | 7.3 | Workers Builds (push `a42d1f4`) | `af3e95fd-1428-4b0a-9d31-f4a43f895d02` | `-` / `a42d1f4` | ✅ 200 | **Unplanned**: Cloudflare Git integration deployed with no approval (F24); integration since disconnected. |
| 2026-09-26 | 7.3 | CI `push` (run 36254599797) | `ff93c7bf-7a28-412d-8b66-6c5ef395afe5` | `push: 7e98bbb…` | ⚠️ live, 200; job ❌ | Deploy went live, then the triggers step failed with code 10000 (F25); health check skipped. |
| 2026-09-26 | 7.4 | CI `push` (run 36255990813) | `f4dc0417-2d30-4328-9b88-e6e1a2eba8b1` | `push: 3fa3da5…` | ✅ 200 | First fully green auto deploy (wrangler 4.141.0, CLI pinned); no approval step |
| 2026-09-26 | 7.5 | CI `workflow_dispatch` (run 36256449423) | `0d5e986f-8633-4e2b-91ce-3c458fe6f61c` | `workflow_dispatch: 3fa3da5…` | ✅ 200 | Manual path; same commit re-deployed. |
| 2026-09-26 | 7.x | CI `push` (run 36257587298, PR #10 merge) | `06c88cde-b72a-442c-bf22-749e373e5c2a` | `push: de56173…` | ✅ 200 | Docs-only merge, auto deploy |
| 2026-09-26 | 8.2 | manual `wrangler rollback` (owner) | `d1d36987-4ede-4143-83eb-ccb1f749649c` | `rollback drill` | ✅ 200 | Drill; landed on a Phase 5 secret-change version, not the intended `0d5e986f` |
| 2026-09-26 | 8.3 | manual `wrangler rollback` (owner) | `06c88cde-b72a-442c-bf22-749e373e5c2a` | `roll forward after drill` | ✅ 200 | Back on the latest version, no banner. Current version |

## References

- `context/foundation/infrastructure.md`: platform decision, risk register, operational story
- Astro Cloudflare adapter: [https://docs.astro.build/en/guides/integrations-guide/cloudflare/](https://docs.astro.build/en/guides/integrations-guide/cloudflare/)
- Workers per-Worker token roles: [https://developers.cloudflare.com/workers/authorization/workers/](https://developers.cloudflare.com/workers/authorization/workers/)
- Automatic resource provisioning: [https://developers.cloudflare.com/changelog/post/2025-10-24-automatic-resource-provisioning/](https://developers.cloudflare.com/changelog/post/2025-10-24-automatic-resource-provisioning/) and [https://github.com/cloudflare/cloudflare-docs/issues/32978](https://github.com/cloudflare/cloudflare-docs/issues/32978)
- `secret put` on a Worker that doesn't exist yet: [https://github.com/cloudflare/workers-sdk/issues/14258](https://github.com/cloudflare/workers-sdk/issues/14258)
- Supabase custom SMTP / limits: [https://supabase.com/docs/guides/auth/auth-smtp](https://supabase.com/docs/guides/auth/auth-smtp) and [https://supabase.com/docs/guides/deployment/going-into-prod](https://supabase.com/docs/guides/deployment/going-into-prod)
- GitHub environments (plan availability, required reviewers): [https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
- GitHub protected branches (plan availability): [https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
