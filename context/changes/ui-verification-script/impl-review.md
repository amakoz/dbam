<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: UI Verification Script (`npm run ui:shots`)

- **Plan**: context/changes/ui-verification-script/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-06
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Plan adherence summary

| Planned change                                                                       | Verdict                              | Note                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json` / `package-lock.json`: `playwright` dev dependency, `ui:shots` script | MATCH                                | `^1.63.0` in `devDependencies`, no `postinstall`, no `@playwright/test`                                                                                                                                                                     |
| `scripts/ui-shots.mjs` (new)                                                         | MATCH                                | Guards, exit codes, fixture order, `fixture:` lines, warm-up, readiness, matrix, naming and header comment follow the contract                                                                                                              |
| `.gitignore`: commented `ui-shots/`                                                  | MATCH                                |                                                                                                                                                                                                                                             |
| `eslint.config.js`: lint globals                                                     | Planned but not changed (documented) | No `document` global is needed because the readiness check is a string expression (`ui-shots.mjs:179`). The deviation is recorded in `decisions.md` ("Phase 1 implementation adaptations"), and the plan allowed it ("add nothing unused"). |
| `README.md`: script line and "UI screenshots" section                                | MATCH                                | Covers every bullet in the contract. It also adds `--host 127.0.0.1` and `npx astro sync`, both documented in `decisions.md`.                                                                                                               |
| `CLAUDE.md`: one command bullet                                                      | MATCH                                |                                                                                                                                                                                                                                             |

Scope: there are no changes to `scripts/smoke.mjs`, `astro.config.mjs`, `.claude/skills/*`, CI, or seeding. The `context/foundation/roadmap.md` F-05 row flip to `in-progress` is expected bookkeeping.

## Requested extra checks (orchestrator)

- **Production build contains no Playwright code: confirmed.**
  - After `rm -rf dist && npm run build` (exit 0), `grep -rli playwright dist/` prints nothing (exit 1), and so does `grep -rli "chromium\|playwright-core" dist/`.
  - The Worker bundle was also checked: `npx wrangler deploy --dry-run --outdir <scratch>` exited 0, and `grep -rli playwright` on its output prints nothing.
  - `grep -rn playwright src/ wrangler.jsonc astro.config.mjs` finds no references.
- **`package.json` lists Playwright under `devDependencies` only: confirmed.**
  - `playwright` is `^1.63.0` in `devDependencies`. It is absent from `dependencies`, `optionalDependencies` and `peerDependencies`.
  - There is no `@playwright/test` and no `postinstall`.
  - In `package-lock.json`, `node_modules/playwright` and `node_modules/playwright-core` are 1.63.0 with `"dev": true`.

## Success criteria re-run (2026-10-06, this review)

| #         | Command                                                                       | Result                                                                                                           |
| --------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1.1 / 2.2 | `npm run lint`                                                                | PASS (exit 0)                                                                                                    |
| 1.2       | `npx astro check` and `npm run build`                                         | PASS (0 errors, 0 warnings, 0 hints; build exit 0)                                                               |
| 1.3       | `grep -rl "playwright" dist/`                                                 | PASS (no output)                                                                                                 |
| 1.4       | `BASE_URL=https://example.com npm run ui:shots`                               | PASS (exit 2, "Refusing to run against example.com…", no `ui-shots/` created)                                    |
| 1.5       | `SUPABASE_URL=https://abc.supabase.co BASE_URL=http://127.0.0.1:$DBAM_PORT …` | PASS (exit 2, "SUPABASE_URL in the environment points to abc.supabase.co")                                       |
| 1.6       | `npm run ui:shots -- --only nope`                                             | PASS (exit 2, usage printed)                                                                                     |
| 1.7       | `DBAM_CHANGE=x BASE_URL=http://127.0.0.1:4321 …`                              | PASS (exit 2). Also exit 2 with the default `BASE_URL`, a stray positional argument, and `SUPABASE_URL=notaurl`. |
| 1.8       | Full run on `astro dev --port 4332 --host 127.0.0.1` with the DB lock held    | PASS (exit 0, 6 `fixture:` lines, 20 PNGs named as in the contract)                                              |
| 1.9       | `--only kitchen-sink --out <scratch>`                                         | PASS (exit 0, 4 PNGs, 0 `fixture:` lines)                                                                        |
| 1.10      | `git status --short` after the full run                                       | PASS (clean)                                                                                                     |
| 2.1       | `npx prettier --check README.md CLAUDE.md`                                    | PASS                                                                                                             |

Manual items:

- **1.11, re-checked:**
  - `dashboard-desktop-dark.png` (1440 px wide) is dark-themed. It shows the planned "Mammografia…" row (Termin 5 listopada 2026), the done "Test HPV HR…" row (wrzesień 2026) and the reminders hint, and no dev toolbar.
  - `dashboard-mobile-light.png` is 390 px wide.
- **2.3: see F2.** The evidence is a run in the existing worktree, not a fresh checkout.

## Findings

### F1 — SUPABASE_URL guard misses env files the dev server also loads

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/ui-shots.mjs:75,82-86
- **Detail**:
  - The guard reads `SUPABASE_URL` only from the process environment, `.dev.vars` and `.env`, and within each file it takes the **first** matching line.
  - Wrangler 4.141.0, which the Cloudflare adapter uses for dev vars, loads more than that. `getDefaultEnvFiles()` in `node_modules/wrangler/wrangler-dist/cli.js` returns `.env`, `.env.local`, `.env.<env>` and `.env.<env>.local`, and loads them with dotenv `override: true`, where the last value wins. `.dev.vars.<env>` also exists.
  - So a production URL in `.env.local`, or a second `SUPABASE_URL=` line placed below a local one in `.dev.vars`/`.env`, passes the guard. The dev server then signs a `ui-shots-*@example.com` user up against production Supabase.
  - This is the exact risk the roadmap names for F-05 (`roadmap.md`, "Must use the local Supabase only").
  - The plan only specified `.dev.vars` and `.env`, so this is partly a plan gap. The documented limitation covers the shell environment, not these files.
  - Today the main repo has only `.dev.vars`, `.env` and `.env.example`, so there is no live exposure now.
- **Fix**: Check every `.dev.vars*` and `.env*` file at the repo root except `.env.example`, take the **last** matching line in each, and refuse if any value is not local. Update the README/header wording to say "the `.dev.vars*`/`.env*` files".
  - Strength: Covers every file wrangler or Vite can pick up, without modelling their precedence rules. It stays fail-safe: an extra local-only file can't cause a false pass.
  - Tradeoff: A stale non-local value in an unused file, such as `.env.production`, would refuse the run, so the user must clean it up or the guard needs an allowlist.
  - Confidence: HIGH — wrangler's file list was read from the installed `cli.js`.
  - Blind spot: Vite's own `loadEnv` precedence for `astro:env` in dev was not traced. The broad pattern covers it anyway.
- **Decision**: PENDING

### F2 — Docs omit the reproducible first-start failure of `astro dev`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: README.md:338 (worker-session code block); Progress item 2.3
- **Detail**:
  - In this review, the first `npx astro dev --port $DBAM_PORT --host 127.0.0.1` exited 1 with "Dev server process exited before becoming ready". An immediate retry worked.
  - `decisions.md` ("Phase 2 documentation") records the same behaviour, but neither README nor CLAUDE.md mentions it. A worker following only the docs gets exit 1 and may report `blocked`.
  - Item 2.3 ("following only the new README section on a fresh checkout") is checked. However, its evidence is a run in the existing worktree, with Chromium already installed, by a worker who already knew about the retry. That is weaker than the criterion states.
- **Fix**: Add one line to the README worker section and append "(retry once if it exits before ready)" to the CLAUDE.md bullet: if `astro dev` exits with "exited before becoming ready", run it again; `npx astro dev logs` shows why.
- **Decision**: PENDING

### F3 — A trailing slash in BASE_URL breaks the run with a misleading error

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/ui-shots.mjs:157,168,205-208
- **Detail**:
  - URLs are built as `BASE_URL + route`, and `Origin: BASE_URL` is sent as given.
  - With `BASE_URL=http://127.0.0.1:4332/`, requests go to `//dashboard` and the `Origin` header carries a trailing slash. The run then fails at the first fixture step or checked navigation (exit 1) with a status/redirect message that doesn't point at the slash.
  - `scripts/smoke.mjs:46,51` behaves the same way, so the script is consistent with existing code. This was not run in this review; it is inferred from the code.
- **Fix**: After the guards, use `baseUrl.origin` for URL building and the `Origin` header.
- **Decision**: PENDING
