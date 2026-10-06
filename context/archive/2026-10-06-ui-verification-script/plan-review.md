<!-- PLAN-REVIEW-REPORT -->

# Plan Review: UI Verification Script (`npm run ui:shots`)

- **Plan**: context/changes/ui-verification-script/plan.md
- **Mode**: Deep (claims checked inline; the verification sub-agent hit a rate limit and was not re-run)
- **Date**: 2026-10-06
- **Verdict**: REVISE (small, targeted edits; no structural problems)
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

12/12 paths ✓. 8/8 symbols ✓:

- `astro-island` drops `ssr` after hydration (`node_modules/astro/dist/runtime/server/astro-island.js:187`, Astro 7.3.2).
- The dev toolbar element is `astro-dev-toolbar` (`node_modules/astro/dist/runtime/client/dev-toolbar/entrypoint.js:34`).
- `LOCALE_COOKIE = "lang"` (`src/i18n/index.ts:7`).
- The kitchen sink returns 404 under `PROD` (`src/pages/dev/kitchen-sink.astro:39-41`).
- Cervical screening is `active`, female 25–64 with `requires: []`, so it lands in a tier rather than "may apply" (`recommend.ts:119-130`). `parseDoneForm` accepts last month (`rules.ts:138-153`).
- The reminders hint shows when reminders are off and a plan is dated after today (`dashboard.astro:67-69`).
- `/api/screenings` success redirects start with `/dashboard?saved=<intent>` (`screenings.ts`, `succeed`).
- The existing main-repo `dist/` contains no "playwright" string, so criterion 1.3 starts clean.

Other checks:

- Only `client:load` islands exist on the shot pages: onboarding `:121` and profile `:77`. The dashboard and kitchen sink have none. The `astro-island[ssr]` wait therefore can't hang on a `client:visible` island.
- `.env` and `.dev.vars` exist in the worktree with a `127.0.0.1` `SUPABASE_URL`.
- The Progress section matches the phases: 2/2 headings, 10 + 3 items, no checkboxes outside Progress.
- brief↔plan ✓.

## Findings

### F1 — Shots can silently come from the wrong code

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §2 Contract (Invocation, Matrix) and Phase 2 (README, CLAUDE.md)
- **Detail**: The tool's job is to give a worker visual evidence of _its own_ change. Two parts of the contract let that evidence come from somewhere else without any warning:
  - `BASE_URL` defaults to `http://localhost:4321`. Under the worker protocol that port is the human's dev server, which may be running another branch. A worker who forgets `BASE_URL` gets a clean exit 0 with shots of the wrong code. Smoke shares this default, but smoke checks behaviour; here a human or worker reads the images as proof.
  - Output overwrites and never deletes. After a failed or `--only` run, `ui-shots/` still holds older PNGs from earlier runs, or from other branches when `--out` is reused. They are indistinguishable from fresh ones, and Manual 1.10 / 2.3 say "open a sample of the PNGs" without saying "the ones this run printed".
- **Fix**:
  - The CLAUDE.md bullet and the README examples always spell out `BASE_URL=http://127.0.0.1:$DBAM_PORT` for workers.
  - The summary line also prints `BASE_URL`.
  - The docs say to read only the paths the run printed.
  - Optionally, the script refuses port 4321 when `DBAM_CHANGE` is set.
- **Decision**: ACCEPTED — the docs always spell out `BASE_URL=http://127.0.0.1:$DBAM_PORT` for workers, the summary line prints `BASE_URL`, the docs say to read only the paths the run printed, and the script refuses port 4321 when `DBAM_CHANGE` is set (new criterion 1.7). Decided by orchestrator.

### F2 — Cold `astro dev` can fail the hard navigation checks

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details (navigation checks, readiness) and Open Risks in plan-brief.md
- **Detail**: Every `page.goto` and fixture step fails the run on an unexpected status or redirect. That strictness is good. But a freshly started `astro dev` in a new worktree (empty `node_modules/.vite`, Cloudflare workerd runner) optimizes dependencies on the first requests. This can trigger a full page reload ("new dependencies optimized … reloading") or an occasional 500 or 504 on the first hit of a route. `astro.config.mjs:41-47` sets no `optimizeDeps`.
  - A reload between `load` and `page.screenshot` gives "Execution context was destroyed" (exit 1).
  - A first-hit 500 fails the status check.
  - The brief's Open Risks cover only unstyled CSS-in-JS frames.
  - So the first full run (criterion 1.7) in every new worktree may fail spuriously. The plan gives the implementer no guidance on whether to retry, warm up, or treat it as a real failure.
- **Fix**: add a warm-up pass. Before the fixture and the matrix, GET each selected path once, plus the sign-in page that loads the auth island, and wait for `networkidle`, ignoring the result. The checked navigations then run against a warm server. Name the residual risk in the plan's Critical Implementation Details.
  - Strength: keeps the strict status and redirect checks intact for the real run; costs a few seconds.
  - Tradeoff: an anonymous GET to a protected path is a 302, so the warm-up warms the middleware but not the page's island deps. The island warm-up comes from the sign-in page, which uses the same React renderer.
  - Confidence: MED. Vite dep re-optimization on first island load is well-known behaviour, but not reproduced here against this exact Astro 7 + Cloudflare dev setup.
  - Blind spot: not measured whether `astro dev` in this repo actually reloads on a cold start. The first implementation run will tell; if it never does, the warm-up stays as cheap insurance.
- **Decision**: ACCEPTED — a warm-up pass (GET each selected path plus `/auth/signin`, wait for `networkidle`, ignore the results) runs before the fixture and the matrix. The residual risk is named in Critical Implementation Details and the brief's Open Risks. Decided by orchestrator.

### F3 — Criterion 1.8 relies on output the contract never defines

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 Success Criteria / Progress 1.8 vs. Phase 1 §2 Contract (Matrix: output)
- **Detail**:
  - Criterion 1.8 checks a kitchen-sink-only run "makes no auth or API calls (no fixture lines in its output)".
  - The contract says the script prints only each written file's path and a final summary line. It never defines fixture-step lines.
  - With the contract as written, the output of a kitchen-sink-only run looks the same whether or not the fixture ran, so 1.8 can't be checked.
- **Fix**: add to the contract that each fixture step prints one line (e.g. `fixture: signed up ui-shots-…@example.com`, `fixture: consent granted`, …), so 1.8 can grep for `fixture:`.
- **Decision**: ACCEPTED — each fixture step prints one `fixture: …` line; criterion 1.9 greps `^fixture:` for 0 and 1.8 expects 6. Decided by orchestrator.

### F4 — `SUPABASE_URL` guard parsing rules left to the implementer

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §2 Contract (Guards)
- **Detail**: "A `SUPABASE_URL=` line in `.dev.vars` and in `.env`" leaves the edge cases open:
  - Does a commented `# SUPABASE_URL=https://<prod>` line count? An unanchored regex would refuse the run, which is safe but confusing.
  - Are quoted values (`SUPABASE_URL="http://…"`) and an `export ` prefix accepted?
  - What happens when a value doesn't parse as a URL? `new URL()` throws, which today would be an uncaught error rather than the promised exit 2.
  - The guard reads files and the script's own environment. It cannot see a dev server started with a shell-exported production `SUPABASE_URL`. That residual gap is acceptable, but it is unstated.
- **Fix**:
  - Specify the parsing: anchored `^\s*(export\s+)?SUPABASE_URL\s*=`, ignore `#` lines, strip matching quotes, and exit 2 on an unparseable value.
  - Add one sentence noting the shell-env limitation in the header comment or README.
- **Decision**: ACCEPTED — the `SUPABASE_URL` parsing is specified as proposed (anchored regex, `#` lines ignored, matching quotes stripped, unparseable value → exit 2). The shell-env limitation is noted in the header comment, README and the brief. Decided by orchestrator.

### F5 — Header claim "the one script with a dependency" is inaccurate

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Implementation Approach; Phase 1 §2 Contract (Header comment)
- **Detail**: The plan has the header say it "is the one script with a dependency" and breaks the siblings' "zero dependencies on purpose" convention. That convention covers only the `scripts/*.mjs` files (`smoke.mjs:2`, `ui-check.mjs:2`, `stop-lint.mjs:2`). `scripts/catalog/*.ts` already import `zod`, `prettier` and `@anthropic-ai/sdk`.
- **Fix**: reword it to "unlike the other `scripts/*.mjs`, it has a dependency (`playwright`), because it drives a browser."
- **Decision**: ACCEPTED — the header and Implementation Approach now read "Unlike the other `scripts/*.mjs`, it has a dependency (`playwright`), because it drives a browser." Decided by orchestrator.
