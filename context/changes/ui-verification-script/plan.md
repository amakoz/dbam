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

The script is a single `scripts/ui-shots.mjs`, following the `scripts/*.mjs` conventions: a header comment, top-level await, and `process.exit` codes. Its header states why it breaks the "zero dependencies on purpose" convention of its siblings.

It runs in this order:

1. Validate its arguments and both guards before launching anything.
2. Launch headless Chromium with one context and one page.
3. Unless the selection is kitchen-sink-only, create and onboard the fixture user through `context.request`, which shares the page's cookie jar. Take the onboarding shots between the steps, then add the plan and done record.
4. Visit each remaining selected view and shoot it for each scheme × width.

The browser is installed explicitly and never by an npm lifecycle script.

## Critical Implementation Details

- **State sequencing:** the onboarding shots must happen between steps.
  1. The consent shots come after sign-in and before `/api/consent/grant`.
  2. The profile-step shots come after the grant and before `/api/profile`.

  After the profile is saved, `/onboarding` redirects to `/dashboard` (`onboarding.astro:23-27`).

- **Navigation checks:** each `page.goto` must check the response:
  - status 200, and the final URL path equal to the requested path (a redirect means the fixture state is wrong);
  - for `/dev/kitchen-sink`, a 404 means the server is a production build, so fail with "run against `npm run dev`".
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
  - Parse the arguments with `node:util` `parseArgs`. `--only` is repeatable, with values `onboarding | dashboard | profile | kitchen-sink`. `--out` defaults to `ui-shots`, resolved against the current directory and created if missing.
- **Exit codes:**
  - `2` for a refusal or bad usage: unknown flag or view, non-local `BASE_URL`, non-local or missing `SUPABASE_URL`.
  - `1` for any run failure: browser missing, unexpected status or redirect, endpoint step failed, screenshot error.
  - `0` on success.
  - The browser is closed in a `finally` block.
- **Guards** run before any network or browser call:
  - The `BASE_URL` hostname must be `localhost` or `127.0.0.1`.
  - `SUPABASE_URL` is collected from `process.env`, a `SUPABASE_URL=` line in `.dev.vars` and in `.env` at the repo root (`path.resolve(import.meta.dirname, "..")`). Each found value must parse to hostname `localhost` or `127.0.0.1`.
  - If no value is found, refuse.
  - Messages name the offending source and value's host, never a key.
- **Browser:**
  - `chromium.launch()`. If the executable is missing, exit 1 with `npx playwright install chromium --only-shell`.
  - One context with `deviceScaleFactor: 1`, `reducedMotion: "reduce"`, and a `lang=pl` cookie for `BASE_URL`.
- **Fixture** (skipped when the selection is only `kitchen-sink`). All calls use `context.request` with `maxRedirects: 0` and `headers: { Origin: BASE_URL }`, and each step asserts its 302 `Location` like the smoke steps:
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
  - After each file, print its path relative to the current directory; at the end print a summary line with the count and folder.
- **Header comment:** what it does, how to run it (dev server, `npx playwright install chromium --only-shell` once), the local-only refusal, and that it is the one script with a dependency, because it drives a browser.

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
- Full run against `npx astro dev --port $DBAM_PORT`, with the shared DB lock held, exits 0 and writes exactly 20 PNGs named as in the contract to `ui-shots/`
- Kitchen-sink-only run, `npm run ui:shots -- --only kitchen-sink --out <scratch dir>`, exits 0, writes exactly 4 PNGs there, and makes no auth or API calls (no fixture lines in its output)
- `git status --short` lists no file under `ui-shots/` after the full run

#### Manual Verification:

- Open a sample of the PNGs (a worker may read them as images):
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
  - that a full run creates a throwaway `ui-shots-*@example.com` user.

#### 2. CLAUDE.md

**File**: `CLAUDE.md`

**Intent**: tell agents when and how to use it in verification gates.

**Contract**: one bullet under "Build, Test, and Development Commands", next to `npm run smoke` and `npm run ui:check`. It says:

- `npm run ui:shots` screenshots the key views in light and dark at 1440/390 into the gitignored `ui-shots/`;
- run it against `npm run dev` with local Supabase only;
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

- Real runs against `astro dev` with local Supabase: the full matrix, kitchen-sink only, `--out`, and the three refusal paths (Phase 1 automated criteria).

### Manual Testing Steps:

1. Run the full matrix and open `dashboard-desktop-dark.png` and `dashboard-mobile-light.png`.
2. Run `--only kitchen-sink --out /tmp/x` and confirm only 4 files land there.
3. Point `BASE_URL` at a non-local host and confirm exit 2 with no output files.

## Performance Considerations

A full run does about 20 navigations plus 7 API calls in one browser. That should take well under a minute locally. The fixture uses 2 of local Supabase's 30 sign-in/sign-up requests per 5 minutes (`supabase/config.toml:190`).

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

- [ ] 1.1 Lint passes: `npm run lint`
- [ ] 1.2 Types and build pass: `npx astro check` and `npm run build`
- [ ] 1.3 No Playwright in the build output: `grep -rl "playwright" dist/` prints nothing
- [ ] 1.4 Refuses a non-local app: `BASE_URL=https://example.com npm run ui:shots` exits 2 and creates no `ui-shots/` files
- [ ] 1.5 Refuses a non-local Supabase: `SUPABASE_URL=https://abc.supabase.co BASE_URL=http://127.0.0.1:$DBAM_PORT npm run ui:shots` exits 2 before launching a browser
- [ ] 1.6 Rejects an unknown view: `npm run ui:shots -- --only nope` exits 2 with usage
- [ ] 1.7 Full run against `npx astro dev --port $DBAM_PORT`, with the shared DB lock held, exits 0 and writes exactly 20 PNGs named as in the contract to `ui-shots/`
- [ ] 1.8 Kitchen-sink-only run, `npm run ui:shots -- --only kitchen-sink --out <scratch dir>`, exits 0, writes exactly 4 PNGs there, and makes no auth or API calls (no fixture lines in its output)
- [ ] 1.9 `git status --short` lists no file under `ui-shots/` after the full run

#### Manual

- [ ] 1.10 Open a sample of the PNGs: dashboard-desktop-dark shows the planned mammography and done cervical rows and the reminders hint; dashboard-mobile-light is 390px wide with no horizontal overflow; the onboarding consent and profile shots show the right cards; no Astro dev toolbar in any shot

### Phase 2: Agent-facing documentation

#### Automated

- [ ] 2.1 Formatting passes: `npx prettier --check README.md CLAUDE.md`
- [ ] 2.2 Lint still passes: `npm run lint`

#### Manual

- [ ] 2.3 Following only the new README section on a fresh checkout (browser install, dev server, run) is enough to produce the 20 PNGs
