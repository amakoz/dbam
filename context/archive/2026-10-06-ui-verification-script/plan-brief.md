# UI Verification Script (`npm run ui:shots`) — Plan Brief

> Full plan: `context/changes/ui-verification-script/plan.md`
> Research: `context/changes/ui-verification-script/research.md`
> Decisions: `context/changes/ui-verification-script/decisions.md`

## What & Why

Agents can't currently see the UI they change: visual checks have been hand-taken screenshots or ad-hoc Playwright runs. Roadmap F-05 adds one command, `npm run ui:shots`. It signs in a fresh local fixture user and screenshots the key views in light and dark at desktop and phone widths, so a worker can verify UI work in `/10x-implement` gates and put images on a PR when needed.

## Starting Point

There is no browser tooling (`playwright` is not installed). `scripts/smoke.mjs` already has the local-only guard and the HTTP fixture flow (sign up, consent, profile). The theme follows `prefers-color-scheme` only. The kitchen sink is dev-only (404 in production builds), and `/onboarding` is unreachable once a user has finished onboarding.

## Desired End State

Against `npm run dev` and local Supabase, `BASE_URL=http://127.0.0.1:<port> npm run ui:shots` writes 20 full-page PNGs to the gitignored `ui-shots/`. It prints each path, one `fixture:` line per fixture step, and a summary naming `BASE_URL`:

- `onboarding-consent`, `onboarding-profile`, `dashboard`, `profile`, `kitchen-sink`;
- each as `-desktop` (1440) or `-mobile` (390), `-light` or `-dark`.

`--only <view>` narrows the run and `--out <dir>` redirects it. Non-local targets, and port 4321 in a worker session, are refused with exit 2. The Worker build contains no Playwright code.

## Key Decisions Made

| Decision           | Choice                                                                                                                                                                                    | Why (1 sentence)                                                                                                    | Source              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Output             | Gitignored `ui-shots/`; `--out <dir>` for a change folder; no GitHub upload                                                                                                               | The CLI can't upload images; committed PNGs in the change folder worked for dashboard-tier-polish.                  | Orchestrator        |
| Fixture            | Fresh `ui-shots-<ts>@example.com` per run via the app's endpoints, like smoke                                                                                                             | No seed file exists and `service_role` can't write user tables; a fresh user passes through every onboarding state. | Orchestrator        |
| Dashboard data     | One plan (mammography, today+30) and one done record (cervical, last month)                                                                                                               | Plan, done and reminders-hint rows appear; two exams because plan and done on one exam replace each other.          | Orchestrator/worker |
| Guard              | Refuse non-local `BASE_URL`, port 4321 when `DBAM_CHANGE` is set, and non-local, missing or unparseable `SUPABASE_URL` (env, `.dev.vars`, `.env`; anchored, comment-safe parsing); exit 2 | Mirrors smoke and also blocks a local server wired to production Supabase.                                          | Plan review         |
| DB lock            | Callers take the shared lock like smoke (documented); not needed for `--only kitchen-sink`                                                                                                | The run inserts a user into the shared local DB; a kitchen-sink-only run writes nothing.                            | Orchestrator/worker |
| Matrix             | 16 base + onboarding profile step = 20 PNGs, full page, `<view>-<desktop\|mobile>-<light\|dark>.png`                                                                                      | Matches the roadmap outcome and the auth-ui-redesign naming precedent.                                              | Orchestrator/worker |
| Theme / dev chrome | `page.emulateMedia({ colorScheme })`; dev toolbar hidden via screenshot `style`                                                                                                           | The theme is `prefers-color-scheme` only; no app config change.                                                     | Research/orch.      |
| Packaging          | `playwright` library devDependency, Chromium via explicit `npx playwright install chromium --only-shell`                                                                                  | No install scripts, so `deploy`'s `npm ci` fetches no browser; nothing in `src/` imports it.                        | Research/worker     |
| CI / tests         | No CI step, no unit test; verified by real runs and refusal paths                                                                                                                         | Kitchen sink 404s under CI preview; Vitest covers `src/` only.                                                      | Worker              |
| Docs               | README + CLAUDE.md in this PR; the orchestrator updates its skill after merge                                                                                                             | Skills are a symlink outside the repo.                                                                              | Orchestrator        |
| Warm-up            | GET each selected path plus `/auth/signin` and wait for `networkidle` before the checked run                                                                                              | A cold `astro dev` can reload or 500 on first hits, which would fail the strict checks.                             | Plan review         |

## Scope

**In scope:**

- `scripts/ui-shots.mjs`;
- the `playwright` devDependency and the `ui:shots` npm script;
- the `.gitignore` entry and the lint globals the script needs;
- README and CLAUDE.md docs.

**Out of scope:**

- CI job or artifacts, uploading images to GitHub;
- `@playwright/test`, visual diffing, a Playwright MCP server;
- `seed.sql` or admin seeding, changes to `smoke.mjs` or app config;
- an `en` pass, withdrawn or error variants;
- skill edits.

## Architecture / Approach

1. The guards and argument parsing run first.
2. Headless Chromium launches with one context and one page (`lang=pl`, scale 1, reduced motion).
3. A warm-up pass loads each selected path and the sign-in page, ignoring the results.
4. `context.request` (sharing the page's cookies, with an `Origin` header) signs up and signs in. The onboarding consent shots come before the consent grant and the profile-step shots after it. Then the profile, plan and done POSTs follow.
5. Each selected view is loaded, its status and final path checked, fonts and islands awaited, and it is shot per scheme × width with `fullPage`, animations off and the dev toolbar hidden.

## Phases at a Glance

| Phase                | What it delivers                                                        | Key risk                                                           |
| -------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1. The script        | Dependency, `scripts/ui-shots.mjs`, npm script, gitignore, lint globals | Fixture order (onboarding shots between steps) and readiness waits |
| 2. Agent-facing docs | README section and script line, CLAUDE.md command bullet                | Docs drifting from the script's flags and preconditions            |

**Prerequisites:**

- local Supabase running;
- the shared DB lock for the full run;
- a one-time Chromium download (about 100+ MB to `~/Library/Caches/ms-playwright`).

**Estimated effort:** about 1 session across 2 small phases.

## Open Risks & Assumptions

- A cold `astro dev` may still reload once for a dependency first seen after the warm-up. The run then fails with exit 1, and a rerun against the warm server is the remedy (no retries around checked navigations).
- The `SUPABASE_URL` guard reads files and the script's environment, not the dev server's: a server started with a shell-exported production URL is not detected.
- In dev mode Vite injects CSS through JS. The `load` + fonts + hydration waits are assumed to be enough for a settled frame; if a shot shows unstyled content, add a wait on a page-specific selector.
- A run that crosses Warsaw midnight can shift the "today+30" and "last month" dates by a day. This is cosmetic only, as in smoke.
- Each full run leaves one throwaway user in the shared local DB, as smoke does.

## Success Criteria (Summary)

- One command, run against the dev server, produces the 20 named PNGs. Dark shots are dark, mobile shots are 390px wide, and the dashboard shows plan and done rows.
- Non-local targets are refused before any request, and the production build contains no Playwright code.
- An agent following CLAUDE.md or README can run it and attach shots to a PR through `--out`.
