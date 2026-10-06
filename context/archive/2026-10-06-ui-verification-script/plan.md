# UI Verification Script (`npm run ui:shots`) Implementation Plan

## Overview

Add `npm run ui:shots`, a Node script that drives Playwright as a library. It creates a fresh fixture user in local Supabase through the app's own endpoints and saves full-page screenshots of onboarding (consent and profile steps), the dashboard, the profile page and the kitchen sink. Each is taken in light and dark at 1440px and 390px, into a gitignored folder.

Workers use it to verify UI changes in `/10x-implement` manual gates without a human at the screen. When a PR needs images, `--out` writes them into the change folder (roadmap F-05, `context/foundation/roadmap.md:146-157`).

## Current State Analysis

- No browser automation exists:
  - `playwright` is not installed. It appears in `package-lock.json:12463,12483` only as an optional peer of `@vitest/browser-playwright`.
  - Visual checks so far were hand-taken screenshots: ui-refactor, auth-ui-redesign, and dashboard-tier-polish, which used an ad-hoc Playwright run (`context/changes/dashboard-tier-polish/change.md:37`).
- `scripts/smoke.mjs` already has two pieces to reuse:
  - the local-only guard (`:6-14`);
  - the fixture flow over HTTP: sign up, sign in, consent with the version scraped from the page, profile (`:15-26,80-86,101-153`).
- Dark mode follows `prefers-color-scheme` only (`src/styles/global.css:4-5,13`), so media emulation gives the real dark theme.
- `/dev/kitchen-sink` returns 404 when `import.meta.env.PROD` (`src/pages/dev/kitchen-sink.astro:39-41`). The script therefore needs `astro dev`.
- `/onboarding` redirects an onboarded user away (`src/pages/onboarding.astro:23-27`). The onboarding shots must be taken before onboarding is finished.
- `scripts/**/*.mjs` is linted with globals `console, process, fetch, URL, URLSearchParams` only, and `no-undef` is an error (`eslint.config.js:106-111`).
- CI installs devDependencies in every job, including `deploy` (`.github/workflows/ci.yml:25,48,131`). The Worker bundle only contains modules reachable from `src/worker.ts` (`wrangler.jsonc:4`).

## Desired End State

Against `npm run dev` on a local port with local Supabase running:

- `BASE_URL=http://127.0.0.1:<port> npm run ui:shots` writes 20 PNGs to `ui-shots/` and prints each path. The files are `{onboarding-consent, onboarding-profile, dashboard, profile, kitchen-sink}-{desktop,mobile}-{light,dark}.png`.
- `git status` stays clean after the run.
- `--only <view>` limits the run.
- `--out <dir>` writes elsewhere (e.g. a change folder).
- A non-local `BASE_URL` or `SUPABASE_URL` is refused with exit 2 before any request.
- `npm run build` output contains no Playwright code.

README and CLAUDE.md tell agents how to run it, that it needs the dev server, and that callers take the shared DB lock.

### Key Discoveries:

- The theme is `prefers-color-scheme` only (`src/styles/global.css:4-5`). The kitchen sink also draws both forced columns, and its `dark:` utilities follow the OS (`kitchen-sink.astro:52-55,260`). Shooting it in both emulated schemes covers both columns.
- Form POSTs need an `Origin` header (`scripts/smoke.mjs:51`). Playwright's `APIRequestContext` doesn't send one by default.
- Signup is usable immediately because local confirmations are off (`supabase/config.toml:209`). The password policy is 12+ characters with letters and digits (`:175,178`).
- The dashboard has no islands. `/profile` and the onboarding profile step hydrate `ProfileForm` with `client:load` (`onboarding.astro:121`).
- Fonts are self-hosted (`astro.config.mjs:19-40`). The only animation is the submit spinner (`SubmitButton.tsx:17`).
- The `lang` cookie defaults to `pl` (`src/i18n/index.ts:4-7`).
- Two different exams are needed for the plan and the done record:
  - Mammography is tier 1 for the smoke fixture.
  - Cervical screening (women 25–64, `catalog/entries/cervical-screening-nfz-program.json`) is also active for it.
  - A plan and a done record on the same exam replace each other (`scripts/smoke.mjs:255-269`).

## What We're NOT Doing

- No CI job or artifact upload: the kitchen sink 404s under CI's preview server (`ci.yml:61-65`), and a browser download would hit every run.
- No uploading images to GitHub. `--out` into a change folder is the PR path.
- No `@playwright/test`, no test runner, no visual diffing or baselines.
- No Playwright MCP server.
- No `supabase/seed.sql` or admin-API seeding.
- No changes to `scripts/smoke.mjs`; its guard is mirrored, not refactored.
- No app config changes: the dev toolbar is hidden per screenshot, and `astro.config.mjs` is untouched.
- No `en` locale pass and no withdrawn or error onboarding variants.
- No edits to `.claude/skills/*`: the orchestrator updates its skill after merge.

## Implementation Approach

The script is a single `scripts/ui-shots.mjs`, following the `scripts/*.mjs` conventions: a header comment, top-level await, and `process.exit` codes. Unlike the other `scripts/*.mjs` ("zero dependencies on purpose", `smoke.mjs:2`, `ui-check.mjs:2`, `stop-lint.mjs:2`), it has a dependency (`playwright`), because it drives a browser; its header says so.

It runs in this order:

1. Validate its arguments and both guards before launching anything.
2. Launch headless Chromium with one context and one page.
3. Warm up the dev server: GET each selected path plus the sign-in page, ignoring the results.
4. Unless the selection is kitchen-sink-only, create and onboard the fixture user through `context.request`, which shares the page's cookie jar. Take the onboarding shots between the steps, then add the plan and done record.
5. Visit each remaining selected view and shoot it for each scheme × width.

The browser is installed explicitly and never by an npm lifecycle script.

## Critical Implementation Details

- **State sequencing:** the onboarding shots must happen between steps.
  1. The consent shots come after sign-in and before `/api/consent/grant`.
  2. The profile-step shots come after the grant and before `/api/profile`.

  After the profile is saved, `/onboarding` redirects to `/dashboard` (`onboarding.astro:23-27`).

- **Navigation checks:** each `page.goto` must check the response:
  - status 200, and the final URL path equal to the requested path (a redirect means the fixture state is wrong);
  - for `/dev/kitchen-sink`, a 404 means the server is a production build, so fail with "run against `npm run dev`".
- **Warm-up pass:** a freshly started `astro dev` optimizes dependencies on the first requests (`astro.config.mjs:41-47` sets no `optimizeDeps`). That can reload the page mid-capture ("Execution context was destroyed") or return a first-hit 500/504, which would fail the strict checks above. So before the fixture and the matrix:
  - `page.goto` each selected path plus `/auth/signin`, whose sign-in island loads the same React renderer as the shot pages' islands;
  - wait for `networkidle` after each, and ignore status, redirects and errors.

  Anonymous GETs to protected paths are 302s, so they warm the middleware but not the page's island dependencies; the sign-in page covers those. Residual risk: a dependency first discovered after the warm-up can still trigger one reload. If that happens, the run fails with exit 1 and a rerun against the now-warm server is the remedy. Do not add retries around the checked navigations.

- **Readiness before capture:** wait for the `load` state, `document.fonts.ready`, and no remaining `astro-island[ssr]` (Astro drops `ssr` after hydration). Then call `page.screenshot` with `fullPage: true`, `animations: "disabled"` and `caret: "hide"`, plus `style: "astro-dev-toolbar { display: none !important; }"`. Change the scheme and width with `page.emulateMedia` and `page.setViewportSize`, then reload, so server-rendered content and layout settle at the new width.

## Phase 1: The `ui:shots` script

### Overview

Add the Playwright dependency, the script, its npm entry, the gitignore entry and the lint globals it needs. Verify it end to end against a local dev server.

### Changes Required:

#### 1. Dependency and npm script

**File**: `package.json`, `package-lock.json`

**Intent**: add Playwright as a dev-only library and expose the script under the name the roadmap uses.

**Contract**:

- `devDependencies` gains `playwright` (current `^1.63.0`, installed with `npm install -D playwright`).
- `scripts` gains `"ui:shots": "node scripts/ui-shots.mjs"`, next to `smoke` and `ui:check`.
- No `postinstall` and no `@playwright/test`.

#### 2. The screenshot script

**File**: `scripts/ui-shots.mjs` (new)

**Intent**: one command that signs in a fresh local fixture user and saves the screenshot matrix, refusing anything that isn't local.

**Contract**:

- **Invocation:** `BASE_URL=http://127.0.0.1:<port> npm run ui:shots [-- --only <view>]... [-- --out <dir>]`.
  - `BASE_URL` defaults to `http://localhost:4321`, like smoke.
  - When `DBAM_CHANGE` is set (a worker session), refuse port 4321 with exit 2, whether it comes from the default or an explicit `BASE_URL`: that port is the human's dev server, possibly on another branch.
  - Parse the arguments with `node:util` `parseArgs`. `--only` is repeatable, with values `onboarding | dashboard | profile | kitchen-sink`. `--out` defaults to `ui-shots`, resolved against the current directory and created if missing.
- **Exit codes:**
  - `2` for a refusal or bad usage: unknown flag or view, non-local `BASE_URL`, port 4321 in a worker session, non-local, missing or unparseable `SUPABASE_URL`.
  - `1` for any run failure: browser missing, unexpected status or redirect, endpoint step failed, screenshot error.
  - `0` on success.
  - The browser is closed in a `finally` block.
- **Guards** run before any network or browser call:
  - The `BASE_URL` hostname must be `localhost` or `127.0.0.1`.
  - `SUPABASE_URL` is collected from `process.env` and from `.dev.vars` and `.env` at the repo root (`path.resolve(import.meta.dirname, "..")`), where a missing file is skipped. In those files:
    - only lines matching `^\s*(export\s+)?SUPABASE_URL\s*=` count, so `#` comment lines are ignored;
    - the value is trimmed and one pair of matching surrounding quotes (`"…"` or `'…'`) is stripped.
  - Each found value must parse with `new URL()` to hostname `localhost` or `127.0.0.1`. A value that doesn't parse is a refusal (exit 2), not an uncaught error.
  - If no value is found, refuse.
  - Limitation (stated in the header comment and README): the guard sees the files and the script's own environment, not the environment the dev server was started with. A server launched with a shell-exported production `SUPABASE_URL` is not detected.
  - Messages name the offending source and value's host, never a key.
- **Browser:**
  - `chromium.launch()`. If the executable is missing, exit 1 with `npx playwright install chromium --only-shell`.
  - One context with `deviceScaleFactor: 1`, `reducedMotion: "reduce"`, and a `lang=pl` cookie for `BASE_URL`.
- **Fixture** (skipped when the selection is only `kitchen-sink`). All calls use `context.request` with `maxRedirects: 0` and `headers: { Origin: BASE_URL }`, and each step asserts its 302 `Location` like the smoke steps. Each fixture step prints exactly one line starting with `fixture:` (e.g. `fixture: signed up ui-shots-…@example.com`, `fixture: signed in`, `fixture: consent granted`, `fixture: profile saved`, `fixture: plan saved`, `fixture: done record saved`). No other output starts with `fixture:`.
  1. Sign up, then sign in, as `ui-shots-<Date.now()>@example.com` with a policy-valid password.
  2. Shoot `onboarding-consent` (if onboarding is selected).
  3. Read the consent `version` from `/onboarding` (same regex as `smoke.mjs:84`) and grant consent.
  4. Shoot `onboarding-profile` (if selected).
  5. POST the smoke fixture profile (`smoke.mjs:18-26`).
  6. POST a plan for `mammography-nfz-program` dated 30 days after Warsaw today.
  7. POST a done record for `cervical-screening-nfz-program` for last calendar month (Warsaw). Copy smoke's `warsawToday` / `shiftDays` / last-month helpers.
- **Views:**
  - `onboarding` → `/onboarding`, twice, as above.
  - `dashboard` → `/dashboard`.
  - `profile` → `/profile`.
  - `kitchen-sink` → `/dev/kitchen-sink`.
- **Matrix:**
  - Per view, the schemes are `light`, `dark` and the widths are `desktop` = 1440×900, `mobile` = 390×844.
  - Files are named `<view>-<desktop|mobile>-<light|dark>.png` in `--out`, overwriting same-named files and deleting nothing.
  - After each file, print its path relative to the current directory; at the end print a summary line with the count, the folder and `BASE_URL`, so a reader can see which server the shots came from.
- **Header comment:** what it does, how to run it (dev server, `npx playwright install chromium --only-shell` once), the local-only refusals and the shell-env limitation, and: "Unlike the other `scripts/*.mjs`, it has a dependency (`playwright`), because it drives a browser."

#### 3. Gitignore

**File**: `.gitignore`

**Intent**: keep default output out of git.

**Contract**: add a commented `ui-shots/` entry in the style of `catalog/.draft-runs/` (`.gitignore:35-36`). ESLint already ignores `.gitignore` paths (`eslint.config.js:14,114`).

#### 4. Lint globals for scripts

**File**: `eslint.config.js`

**Intent**: let `scripts/ui-shots.mjs` pass `no-undef` without loosening other rules.

**Contract**: extend the `scriptsConfig` globals (`eslint.config.js:106-111`) only with identifiers the script actually uses, which is expected to be `document`, inside `page.evaluate` callbacks. Prefer an evaluate expression or a Node import where it reads as naturally, and add nothing unused.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Types and build pass: `npx astro check` and `npm run build`
- No Playwright in the build output: `grep -rl "playwright" dist/` prints nothing
- Refuses a non-local app: `BASE_URL=https://example.com npm run ui:shots` exits 2 and creates no `ui-shots/` files
- Refuses a non-local Supabase: `SUPABASE_URL=https://abc.supabase.co BASE_URL=http://127.0.0.1:$DBAM_PORT npm run ui:shots` exits 2 before launching a browser
- Rejects an unknown view: `npm run ui:shots -- --only nope` exits 2 with usage
- Refuses the human's port in a worker session: `DBAM_CHANGE=x BASE_URL=http://127.0.0.1:4321 npm run ui:shots` exits 2 before launching a browser
- Full run against `npx astro dev --port $DBAM_PORT`, with the shared DB lock held, exits 0, prints 6 `fixture:` lines, and writes exactly 20 PNGs named as in the contract to `ui-shots/`
- Kitchen-sink-only run, `BASE_URL=http://127.0.0.1:$DBAM_PORT npm run ui:shots -- --only kitchen-sink --out <scratch dir>`, exits 0, writes exactly 4 PNGs there, and makes no auth or API calls (`grep -c '^fixture:'` on its output is 0)
- `git status --short` lists no file under `ui-shots/` after the full run

#### Manual Verification:

- Open a sample of the PNGs whose paths this run printed (a worker may read them as images):
  - `dashboard-desktop-dark.png` is dark-themed and shows the planned mammography row, the done cervical row and the reminders hint;
  - `dashboard-mobile-light.png` is 390px wide with no horizontal overflow;
  - `onboarding-consent-*` shows the consent card and `onboarding-profile-*` the profile form;
  - no Astro dev toolbar is visible in any shot.

**Implementation Note**: After automated verification passes, check the manual items (worker self-check per orchestrator policy) before Phase 2.

---

## Phase 2: Agent-facing documentation

### Overview

Document the command where agents and humans look: the README script list and a section, and CLAUDE.md's commands.

### Changes Required:

#### 1. README

**File**: `README.md`

**Intent**: make the command discoverable and explain its preconditions.

**Contract**:

- "Available Scripts" (`README.md:50-60`) gains a `npm run ui:shots` line after `ui:check`.
- A new "UI screenshots" section after "Smoke test" (`:284-301`) covers:
  - the one-time `npx playwright install chromium --only-shell`;
  - that it needs `npm run dev`, because the kitchen sink is dev-only;
  - local Supabase and the local-only refusal (`BASE_URL` and `SUPABASE_URL`);
  - the output folder and file naming;
  - `--only` and `--out`, e.g. `--out context/changes/<id>/screenshots` when a PR needs images;
  - that a full run creates a throwaway `ui-shots-*@example.com` user;
  - worker examples always spell out `BASE_URL=http://127.0.0.1:$DBAM_PORT` (never rely on the 4321 default, which the script refuses in worker sessions);
  - read only the paths the run printed: the folder keeps older PNGs from earlier or `--only` runs;
  - the guard cannot see a shell-exported `SUPABASE_URL` the dev server was started with.

#### 2. CLAUDE.md

**File**: `CLAUDE.md`

**Intent**: tell agents when and how to use it in verification gates.

**Contract**: one bullet under "Build, Test, and Development Commands", next to `npm run smoke` and `npm run ui:check`. It says:

- `npm run ui:shots` screenshots the key views in light and dark at 1440/390 into the gitignored `ui-shots/`;
- run it as `BASE_URL=http://127.0.0.1:$DBAM_PORT npm run ui:shots` against `npm run dev` with local Supabase only (the script refuses port 4321 in worker sessions);
- read only the paths the run printed, since the folder keeps older PNGs;
- worker sessions take the shared DB lock first, as for smoke (not needed for `--only kitchen-sink`);
- use `--out context/changes/<id>/screenshots` to commit shots a PR needs;
- link `@scripts/ui-shots.mjs`.

Keep the wording consistent with README.

### Success Criteria:

#### Automated Verification:

- Formatting passes: `npx prettier --check README.md CLAUDE.md`
- Lint still passes: `npm run lint`

#### Manual Verification:

- Following only the new README section on a fresh checkout (browser install, dev server, run) is enough to produce the 20 PNGs.

**Implementation Note**: PR-stage checks (a human glancing at shots written with `--out`) go to the PR's "Manual checks for the human" list, not this plan.

---

## Testing Strategy

### Unit Tests:

- None. Vitest covers `src/**/*.test.ts` only (`vitest.config.ts:7`), and the script's logic is argument and guard plumbing exercised directly by the refusal runs above.

### Integration Tests:

- Real runs against `astro dev` with local Supabase: the full matrix, kitchen-sink only, `--out`, and the four refusal paths (Phase 1 automated criteria).

### Manual Testing Steps:

1. Run the full matrix and open the printed `dashboard-desktop-dark.png` and `dashboard-mobile-light.png`.
2. Run `--only kitchen-sink --out <scratch dir>` and confirm only 4 files land there.
3. Point `BASE_URL` at a non-local host and confirm exit 2 with no output files.

## Performance Considerations

A full run does 5 warm-up navigations, about 20 checked navigations and 7 API calls in one browser. That should take well under a minute locally. The fixture uses 2 of local Supabase's 30 sign-in/sign-up requests per 5 minutes (`supabase/config.toml:190`).

## Migration Notes

None: no schema, no app code. Each full run leaves one `ui-shots-*@example.com` user in the shared local Supabase, as smoke leaves `smoke-*` users.

## References

- Research: `context/changes/ui-verification-script/research.md`
- Decisions: `context/changes/ui-verification-script/decisions.md`
- Guard and fixture flow to mirror: `scripts/smoke.mjs:6-14,51,60-86,101-153`
- Script conventions: `scripts/ui-check.mjs:1-5`, `eslint.config.js:106-111`
- Roadmap item: `context/foundation/roadmap.md:146-157`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: The `ui:shots` script

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — a61fc18
- [x] 1.2 Types and build pass: `npx astro check` and `npm run build` — a61fc18
- [x] 1.3 No Playwright in the build output: `grep -rl "playwright" dist/` prints nothing — a61fc18
- [x] 1.4 Refuses a non-local app: `BASE_URL=https://example.com npm run ui:shots` exits 2 and creates no `ui-shots/` files — a61fc18
- [x] 1.5 Refuses a non-local Supabase: `SUPABASE_URL=https://abc.supabase.co BASE_URL=http://127.0.0.1:$DBAM_PORT npm run ui:shots` exits 2 before launching a browser — a61fc18
- [x] 1.6 Rejects an unknown view: `npm run ui:shots -- --only nope` exits 2 with usage — a61fc18
- [x] 1.7 Refuses the human's port in a worker session: `DBAM_CHANGE=x BASE_URL=http://127.0.0.1:4321 npm run ui:shots` exits 2 before launching a browser — a61fc18
- [x] 1.8 Full run against `npx astro dev --port $DBAM_PORT`, with the shared DB lock held, exits 0, prints 6 `fixture:` lines, and writes exactly 20 PNGs named as in the contract to `ui-shots/` — a61fc18
- [x] 1.9 Kitchen-sink-only run, `BASE_URL=http://127.0.0.1:$DBAM_PORT npm run ui:shots -- --only kitchen-sink --out <scratch dir>`, exits 0, writes exactly 4 PNGs there, and makes no auth or API calls (`grep -c '^fixture:'` on its output is 0) — a61fc18
- [x] 1.10 `git status --short` lists no file under `ui-shots/` after the full run — a61fc18

#### Manual

- [x] 1.11 Open a sample of the PNGs whose paths this run printed: dashboard-desktop-dark shows the planned mammography and done cervical rows and the reminders hint; dashboard-mobile-light is 390px wide with no horizontal overflow; the onboarding consent and profile shots show the right cards; no Astro dev toolbar in any shot — a61fc18

### Phase 2: Agent-facing documentation

#### Automated

- [x] 2.1 Formatting passes: `npx prettier --check README.md CLAUDE.md` — fae6fb1
- [x] 2.2 Lint still passes: `npm run lint` — fae6fb1

#### Manual

- [x] 2.3 Following only the new README section on a fresh checkout (browser install, dev server, run) is enough to produce the 20 PNGs — fae6fb1
