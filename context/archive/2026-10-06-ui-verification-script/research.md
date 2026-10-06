---
date: 2026-10-06T08:07:32+0200
researcher: Claude (Opus 5.5, Dbam worker)
git_commit: 970b6ab7de80be2aac914fcc7e657acbe2d5a6bf
branch: feat/ui-verification-script
repository: feat-ui-verification-script (10xdevs / Dbam)
topic: "What does `npm run ui:shots` (F-05) need from the codebase: fixture user, routes, theme, local-only guard, bundle isolation"
tags: [research, codebase, playwright, scripts, smoke, kitchen-sink, theme, ci]
status: complete
last_updated: 2026-10-06
last_updated_by: Claude (Opus 5.5, Dbam worker)
---

# Research: what `npm run ui:shots` needs from the codebase

**Date**: 2026-10-06T08:07:32+0200
**Researcher**: Claude (Opus 5.5, Dbam worker)
**Git Commit**: 970b6ab7de80be2aac914fcc7e657acbe2d5a6bf
**Branch**: feat/ui-verification-script
**Repository**: feat-ui-verification-script (10xdevs / Dbam)

## Research Question

Roadmap F-05 (`context/foundation/roadmap.md:146-157`): `npm run ui:shots` (Playwright run as a script, not an MCP server) signs in a seeded fixture user against `BASE_URL` and screenshots the dashboard, onboarding, profile and kitchen sink in light and dark at 1440px and 390px into a gitignored folder. Agents use it in `/10x-implement` manual-verification gates and attach the paths to PRs. Risks: local Supabase only (refuse a non-local `BASE_URL`, like `scripts/smoke.mjs`); Playwright browsers must stay out of the production build and the Worker bundle.

What in the current codebase does the script depend on, what constrains it, and what has to be decided in the plan?

## Summary

- **Theme:** dark mode follows `prefers-color-scheme` only. There is no toggle, cookie or attribute (`src/styles/global.css:4-5,13`). Playwright's `colorScheme: "dark"` context option therefore produces the real dark theme, including shadcn `dark:` utilities.
- **Server mode:** the kitchen sink returns 404 whenever `import.meta.env.PROD` is set (`src/pages/dev/kitchen-sink.astro:39-41`). On the inspected config that means `astro preview` and production builds, so the script has to run against `astro dev`. That is the server workers already run on `$DBAM_PORT` (`.claude/skills/dbam-orchestrate/SKILL.md:61`). It does not work against CI's `build && preview` smoke server (`.github/workflows/ci.yml:60-65`).
- **Onboarding needs a user who isn't onboarded:** `/onboarding` redirects a user in state `complete` to `/dashboard` (`src/pages/onboarding.astro:23-27`). One fixture user can still cover every view if the script captures onboarding before finishing it:
  1. sign up;
  2. onboarding consent step;
  3. grant consent;
  4. onboarding profile step;
  5. save the profile;
  6. dashboard and profile.

  `scripts/smoke.mjs:101-153` already walks that sequence over HTTP.

- **No seed exists:** `supabase/config.toml:60-65` points `[db.seed]` at `./seed.sql`, but the file does not exist. The pgTAP tests create users inside `begin … rollback`. Local email confirmations are off (`supabase/config.toml:209`), so an account created through the app's `/api/auth/signup` can sign in at once. The `service_role` key cannot write user tables (CLAUDE.md hard rules; `src/lib/reminders/admin-client.ts:5-6`), so profile and consent data have to go through the app's endpoints either way.
- **Bundle isolation:**
  - `playwright@1.63.0` and `playwright-core@1.63.0` define no npm lifecycle scripts (`npm view … scripts` returned nothing on 2026-10-06), and the Playwright docs say browsers are not downloaded on install (playwright.dev/docs/library). The Worker bundle only contains modules reachable from `src/worker.ts` (`wrangler.jsonc:4`), and nothing under `src/` imports `scripts/` (grep, this inspected tree).
  - **Inference:** a devDependency imported only from `scripts/*.mjs` stays out of the Worker, as `@anthropic-ai/sdk` already does (`package.json:50`, imported only by `scripts/catalog/draft.ts:13`).
  - **Cost:** every `npm ci` in CI, including `deploy` (`ci.yml:131`), installs the npm package, but no browser.
- **Local-only guard:** `scripts/smoke.mjs:6-14` allows `BASE_URL` hostnames `localhost` and `127.0.0.1` only and exits 2 otherwise. ui:shots has no read-only mode, so it should refuse outright with no override.
- **PR evidence gap:** the CLI session cannot upload images to a GitHub PR (`context/archive/2026-09-30-ui-refactor/reviews/impl-review.md:88-96`, F5). The one precedent that worked committed PNGs into the change folder (`context/changes/dashboard-tier-polish/screenshots/`, commit 83d82e4). The roadmap's "gitignored folder" plus "attach the paths to PRs" leaves open how a reviewer actually sees an image (Open Questions).

## Detailed Findings

### Theme and locale

- `global.css:4-5`: "Dark mode follows the system setting (no manual toggle)". `@custom-variant dark (@media (prefers-color-scheme: dark))`.
- `:root { color-scheme: light dark }` (`global.css:13`); every token is a `light-dark()` value.
- A grep over `src/` found no theme cookie, localStorage, `data-theme` or theme `<script>`.
- Kitchen sink: it always renders a forced light column and a forced dark column (`.scheme-light` / `.scheme-dark`, `kitchen-sink.astro:52-55`).
  - Its legend (`:260`) says `dark:` utilities follow the OS, not the column. This was archived ui-refactor impl-review F7 (`impl-review.md:110-118`).
  - So in a light-scheme shot, only the light column is fully correct, and in a dark-scheme shot only the dark column. Shooting the page in both emulated schemes covers both columns.
- Locale: cookie `lang`, values `pl` | `en`, default `pl`, anything else falls back to `pl` (`src/i18n/index.ts:4-7,25-27`). The middleware resolves it per request (`src/middleware.ts:16`).
  - Pinning `lang=pl` via `context.addCookies` makes runs independent of leftover cookies (inference).
  - An `en` pass is possible but is not in the F-05 outcome.

### Routes, auth and onboarding states

- `PROTECTED_ROUTES` (`src/middleware.ts:5-13`) prefix-matches `/dashboard`, `/onboarding` and `/profile` (and APIs). Anonymous requests 302 to `/auth/signin` (`:32-34`). `/dev/kitchen-sink` is not listed and the page has no user check, so it needs no sign-in.
- `getOnboardingState` (`src/lib/consent.ts:27-40`) returns `needs_consent`, `needs_profile` or `complete`.
  - `/dashboard` and `/profile` redirect to `/onboarding` unless `complete` (`dashboard.astro:34-37`, `profile.astro:24-28`).
  - `/onboarding` redirects `complete` to `/dashboard` (`onboarding.astro:23-27`).
- What `/onboarding` renders, by state:
  - `needs_consent`: a consent card with a native checkbox (`onboarding.astro:69-111`).
  - `needs_profile`: the `ProfileForm` React island (`client:load`, `:121`) plus a collapsed withdraw `<details>`.
  - `?withdrawn` adds a success alert (`:35,62-67`); `?error=<code>` adds a destructive alert (`:30-34`).
- Sign-in:
  - `SignInForm` (`client:load`, `src/pages/auth/signin.astro:47`) is a native `<form method="POST" action="/api/auth/signin" noValidate>` (`SignInForm.tsx:60`) with fields `#email` and `#password` (`FormField.tsx:41-42`).
  - Success redirects to `/dashboard`, failure to `/auth/signin?error=<code>` (`src/pages/api/auth/signin.ts:18-24`).
- Sign-up:
  - `POST /api/auth/signup` redirects to `/auth/confirm-email` (`signup.ts:33`). With confirmations off locally, the account can sign in immediately; smoke relies on this (`smoke.mjs:106-119`).
  - The password policy is 12+ characters with letters and digits (`config.toml:175,178`); smoke's `Smoke-Test-Passw0rd!` (`smoke.mjs:16`) satisfies it.
  - Local auth rate limit: `sign_in_sign_ups = 30` per 5 minutes per IP (`config.toml:190`).
- Consent grant needs the consent `version` read from the page (`smoke.mjs:80-86`).

### Dashboard and profile content, determinism

- **What the dashboard shows:**
  - The data comes from the profile (`birth_year`, `sex`, `smoking_status`, pack-years, `reminders_enabled`), the active catalog, plans and done records (`dashboard.astro:40-69,122-127`).
  - The reminders hint shows only when reminders are off and a plan is dated after today in Warsaw (`dashboard.astro:66-69`).
  - The smoke fixture (woman born 1970, former smoker) gives tier-1 mammography plus a "may apply" stool test (`smoke.mjs:17-26,154-167`). The dashboard-tier-polish precedent used the same fixture and saw 12 tier rows (`context/changes/dashboard-tier-polish/change.md:20`).
- **Time dependence:**
  - Age, `warsawToday`, awaiting-confirmation and next-due dates derive from `new Date()` (`dashboard.astro:40-69`; `src/lib/screenings/rules.ts:243`).
  - Smoke keeps such steps stable by computing dates relative to the Warsaw "today" (`smoke.mjs:60-76`).
  - The kitchen sink's fixtures use `FIXTURE_DATE = "2026-09-28"`, but age and bounds still use `new Date()` (`kitchen-sink.astro:46`).
- **Assets and motion:**
  - Fonts are self-hosted fontsource files (Fraunces, Figtree) via Astro `<Font>` (`astro.config.mjs:19-40`, `Layout.astro:27-28`), with no third-party font CDN. Waiting on `document.fonts.ready` before capture is the usual guard (inference).
  - `tw-animate-css` is imported (`global.css:2`). The only animation found is the `SubmitButton` spinner (`SubmitButton.tsx:17`), plus `transition-all` on buttons. Playwright's `animations: "disabled"` stops CSS animations and transitions (playwright.dev page.screenshot docs).
- **Islands:**
  - The dashboard has none. Islands appear on `/profile` and the onboarding profile step (`ProfileForm`, `client:load`) and on sign-in.
  - Astro removes the `ssr` attribute from `astro-island` once it hydrates, so `astro-island:not([ssr])` (or no `astro-island[ssr]` left) is a usable readiness signal (agent finding, not run).
- **Readiness selectors:** there are no `data-testid` attributes. Existing hooks are `main#main` and `h1`, plus:
  - `[data-tier-section]` (`TierSection.astro:37`);
  - `[data-plan]` and `[data-awaiting-confirmation]` (`PlanItem.astro:38-42`);
  - `[data-done]` (`DoneItem.astro:33-37`);
  - `[data-maybe]` (`MaybeRecommendationItem.astro:21`);
  - `[data-reminders]` (`RemindersForm.astro:24`).
- **Dev toolbar:** `astro.config.mjs` has no `devToolbar` key, so the Astro dev toolbar is injected under `astro dev` and would show in captures (agent finding, not run). Two ways to hide it without touching app config:
  - Playwright's screenshot `style` option (e.g. `astro-dev-toolbar { display: none !important }`);
  - `astro preferences disable devToolbar`, which is per machine, so prefer the former.

### Local-only guard and Supabase

- **Smoke's guard:** `smoke.mjs:6-14` parses `BASE_URL` (default `http://localhost:4321`) and allows hostnames in `["localhost", "127.0.0.1"]` only; other hosts exit with code 2 unless `SMOKE_READONLY=1`.
  - For ui:shots, two points matter: there is no meaningful read-only mode (signing in needs an account), and port 4321 belongs to the human, so workers use `$DBAM_PORT` (worker protocol).
  - Neither script checks which Supabase the local server talks to. That is set by `.dev.vars` (`SUPABASE_URL`, local `http://127.0.0.1:54321` per `.env.example:1-4`). A stricter guard could also refuse a non-local `SUPABASE_URL` in `.dev.vars` (Open Questions).
- **Local Supabase:**
  - API port 54321 (`config.toml:10`), `enable_signup = true` (`:169`), `enable_confirmations = false` (`:209`).
  - `[db.seed]` is enabled with `sql_paths = ["./seed.sql"]` (`:60-65`), but `supabase/seed.sql` does not exist.
  - A `seed.sql` would only apply on `supabase db reset` / first start. The local stack is shared by every worktree and `db reset` needs the DB lock (worker protocol), so a seed file is a poor fit for an on-demand script (inference).
- **Shared-DB lock:** the worker protocol requires the `~/.cache/dbam/db.lock` for `npm run smoke` and DB work. ui:shots also writes users to the shared local Supabase. It inserts rows but does not reset anything, so whether it needs the lock is a plan decision (Open Questions).
- **Admin client:** `admin-client.ts:2` reads `SUPABASE_SECRET_KEY` from `astro:env/server`, which a plain Node script cannot import. `service_role` has every user-table privilege revoked (CLAUDE.md; pgTAP guard). An admin-API seeding path would therefore only create the auth user, and would still need the app endpoints for consent and profile.

### Build, bundle and CI isolation

- **Worker bundle:**
  - The entry is `src/worker.ts` (`wrangler.jsonc:4`) with `@astrojs/cloudflare` (`astro.config.mjs:49`).
  - The Vite config sets only plugins and `cssTarget` (`astro.config.mjs:41-48`); it has no `ssr.external` or `ssr.noExternal`.
  - `grep -rnE "scripts/|playwright" src` finds nothing (this tree).
- **Package and browsers:**
  - `playwright` is not installed today. It appears in `package-lock.json` only as an optional peer of `@vitest/browser-playwright` (`package-lock.json:12463,12483`). `npm view playwright version` returns 1.63.0 (engines `node >=20`; local Node v22.16.0, CI Node 22 at `ci.yml:22-24`).
  - Browsers come from an explicit `npx playwright install chromium`. Adding `--only-shell` installs just the headless shell. They live in `~/Library/Caches/ms-playwright` (macOS) or `~/.cache/ms-playwright` (Linux), overridable with `PLAYWRIGHT_BROWSERS_PATH`, and each Playwright version pins its browser revision (playwright.dev/docs/browsers).
  - This machine's cache holds `chromium-1161` / `chromium_headless_shell-1161`, an older revision. 1.63.0 will need a fresh download once (inference from the revision-pinning rule).
- **CI:**
  - `ci.yml` has jobs `ci`, `smoke`, `migrate` and `deploy`. `npm ci` (with devDependencies, no `--omit=dev`) runs in `ci` (`:25`), `smoke` (`:48`) and `deploy` (`:131`), and no `postinstall` exists in `package.json`.
  - The `smoke` job serves `npm run preview -- --port 4321` (`ci.yml:61-65`), where the kitchen sink 404s.
  - There is no `actions/upload-artifact` anywhere and no `~/.cache/ms-playwright` cache.
  - The F-05 outcome does not ask for CI integration (`roadmap.md:148`).
- **Lint and types:**
  - `scripts/**/*.mjs` is linted with `disableTypeChecked`, `no-console` off, and a fixed globals list (`eslint.config.js:106-111`).
  - `eslint --print-config scripts/smoke.mjs` shows `no-undef` as an error, with globals `console, process, fetch, URL, URLSearchParams` only. A script using `setTimeout`, `Buffer` and the like must extend that list. Importing from `playwright` itself is fine for `no-undef`.
  - TypeScript `scripts/catalog/*.ts` get full type-checked rules and run through `tsx` (`package.json:20-23`).
- **Conventions:**
  - `smoke.mjs:2`, `ui-check.mjs:2` and `stop-lint.mjs:2` all say "Zero dependencies on purpose". ui:shots necessarily breaks that convention and should say why in its header.
  - Tool output folders are gitignored in the style of `catalog/.draft-runs/` (`.gitignore:35-36`). ESLint ignores everything in `.gitignore` (`eslint.config.js:14,114`). There is no `.prettierignore`; Prettier 3 honours `.gitignore`.

### How agents verify UI today

- `10x-implement` manual gate: it prints "Ready for Manual Verification" and pauses for the human (`.claude/skills/10x-implement/SKILL.md:232-253`), and manual rows are not ticked until the user confirms (`:361`).
- `dbam-orchestrate/SKILL.md:61` tells workers to "Verify the manual items yourself against http://127.0.0.1:$DBAM_PORT (dev server, curl or a Playwright script)". Anything needing human judgement goes to the PR's "Manual checks for the human" list. The required PR body (`:57`) has no screenshots field.
- `10x-impl-review/SKILL.md:108` flags ticked manual rows without observable evidence.
- There is no `.github/pull_request_template.md`, and no skill or doc mentions `ui:shots` (grep of `.claude/skills/`, `context/`, `README.md`).
- README slots:
  - "Available Scripts" (`README.md:50-60`; smoke `:58`, ui:check `:60`);
  - "Design system" (`:85-95`; kitchen sink `:92`);
  - "Smoke test" (`:284-301`);
  - "CI" (`:303-311`).

## Code References

- `scripts/smoke.mjs:6-14` — local-only `BASE_URL` guard to mirror
- `scripts/smoke.mjs:15-26,80-86,101-153` — fixture account, consent-version scrape, sign-up → consent → profile sequence
- `src/styles/global.css:4-5,13` — dark mode = `prefers-color-scheme`, `color-scheme: light dark`
- `src/pages/dev/kitchen-sink.astro:39-41` — 404 when `import.meta.env.PROD`
- `src/pages/dev/kitchen-sink.astro:52-55,260` — forced scheme columns; `dark:` follows the OS
- `src/pages/onboarding.astro:23-27,62-67,69-111,121` — onboarded user redirected away; consent step; profile island
- `src/middleware.ts:5-13,32-34` — protected prefixes, anonymous redirect
- `src/lib/consent.ts:27-40` — onboarding state machine
- `src/components/auth/SignInForm.tsx:60`, `src/components/forms/FormField.tsx:41-42` — sign-in form and field ids
- `src/pages/api/auth/signin.ts:18-24`, `src/pages/api/auth/signup.ts:33` — auth redirects
- `src/i18n/index.ts:4-7,25-27` — `lang` cookie
- `supabase/config.toml:60-65,169,175,178,209` — seed path (missing file), signup, password policy, confirmations off
- `eslint.config.js:106-111` — `scripts/**/*.mjs` lint block and globals
- `.github/workflows/ci.yml:25,48,60-65,131` — `npm ci` everywhere, smoke on preview :4321
- `wrangler.jsonc:4`, `astro.config.mjs:41-49` — Worker entry, Vite/adapter config
- `.gitignore:35-36` — precedent for a gitignored tool-output folder

## Architecture Insights

- **One fresh user per run** fits the codebase better than a persistent seeded user:
  - it mirrors smoke;
  - it needs no secret key and no `seed.sql`;
  - it reaches all three onboarding states in order, so a single account yields the onboarding shots and then the onboarded dashboard and profile;
  - it never depends on leftover state in the shared local DB.

  The cost is one throwaway `*@example.com` user per run in local Supabase, which smoke already accepts. "Seeded fixture user" in the roadmap can be read as "a fixture user the script seeds", not as a `seed.sql` row (inference; confirm in the plan).

- **Theme by emulation, not by page state:** one browser context per (scheme × width) with `colorScheme` and `viewport`. Sign-in cookies can be captured once (`context.storageState()`) and reused across contexts, so the matrix doesn't repeat sign-in (Playwright API; not run here).
- **Dev server is a hard requirement** while the kitchen sink is PROD-gated. The script should detect a 404 on `/dev/kitchen-sink` and say "run against `astro dev`", not save a 404 screenshot.
- **Isolation:**
  - `playwright` goes in devDependencies and is imported only from `scripts/`.
  - The browser download is explicit (`npx playwright install chromium`), never a lifecycle script, so `deploy`'s `npm ci` fetches no browser.
  - The script can detect a missing browser and print the install command.

## Historical Context (from prior changes)

- `context/archive/2026-09-30-ui-refactor/plan.md:64`, `research.md:253`: Playwright and a screenshot runner were deliberately left out of ui-refactor. The kitchen sink became the visual gate instead (`plan.md:313-357`). Still accurate: no runner exists today.
- `context/archive/2026-09-30-ui-refactor/reviews/impl-review.md:88-96` (F5): a ticked "screenshots attached" row with no images on PR #64. The owner attached them because the CLI session can't upload images. This is still a constraint for "attach the paths to PRs".
- `context/archive/2026-09-30-ui-refactor/reviews/impl-review.md:110-118` (F7): kitchen-sink `dark:` utilities follow the OS. Still accurate (`kitchen-sink.astro:260`).
- `context/archive/2026-10-05-continue-ui-redesign/plan.md:220,387` and `context/archive/2026-10-05-auth-ui-redesign/plan.md:481,503`: manual screenshots at desktop (1280px) and ~375px in light and dark, saved into the change folder as `<page>-<desktop|mobile>-<light|dark>.png`. That naming is a ready-made convention.
- `context/changes/dashboard-tier-polish/change.md:20,37`: the closest precedent.
  - Playwright Chromium against `astro dev --port 4323`, fixture woman born 1970 and former smoker, at 1440px and 390px.
  - `before-*` / `after-*` PNGs committed in `screenshots/` (commit 83d82e4).
  - It is the only precedent where the PR carried visible images without an owner upload.
- `context/foundation/prd.md:142`: the PRD's testing NFR covers catalog unit tests only. `:139` (usable on mobile-sized screens) is the NFR the 390px width actually serves. `roadmap.md:29` says F-04–F-07 come from the owner's tooling review, not the PRD, so the "NFR (testing)" ref is loose.

## Related Research

- `context/archive/2026-09-30-ui-refactor/research.md` — kitchen sink and visual gate background
- `context/archive/2026-09-28-screening-recommendations/research.md:172-173` — no `seed.sql`

## Open Questions

For `/10x-plan` to decide:

1. **Where shots go and how a PR reviewer sees them.** The roadmap says a gitignored folder (e.g. `.ui-shots/`), but a local path is useless to a GitHub reviewer, and the CLI can't upload images (F5). Options:
   - (a) gitignored only; the PR lists the paths and the human runs the script locally;
   - (b) gitignored by default, plus an option or documented step to copy chosen shots into `context/changes/<id>/screenshots/` (the dashboard-tier-polish precedent);
   - (c) a CI artifact (needs dev mode in CI and a browser download; not in the F-05 outcome).
2. **Fixture model.** Option (a) is a fresh `ui-shots-<timestamp>@example.com` per run, walking onboarding like smoke (recommended above). Option (b) is a fixed email reused if present: faster, but its state drifts between runs and the onboarding shots need a second user.
3. **Dashboard state richness.** Option (a) is a bare onboarded profile. Option (b) also seeds a dated plan or a done record via `/api/screenings` (smoke's forms) so plan, done and reminders-hint rows appear. Dates relative to Warsaw today keep it stable.
4. **Guard strength.** Mirror smoke's hostname check only, or also refuse when `.dev.vars` / `.env` has a non-local `SUPABASE_URL`. Also, should the script take the shared DB lock like smoke? It only inserts rows.
5. **Matrix scope.**
   - The fixed set is 4 views × 2 schemes × 2 widths = 16 PNGs, plus the onboarding consent step and profile step as separate shots.
   - Full-page or viewport capture? Dashboard is about 2,700px tall at 1440px (`dashboard-tier-polish/change.md:37`).
   - A `--only <view>` filter for quick agent runs?
6. **Agent wiring.** Where the usage note lands: README "Available Scripts" and a section; CLAUDE.md commands; `dbam-orchestrate` manual-gate text (`SKILL.md:61`); possibly `10x-implement`. Skills are untracked symlinks (`.gitignore:31-32`; `.claude/skills` is a symlink to the main checkout), so only README, CLAUDE.md and roadmap edits ship in the PR.
