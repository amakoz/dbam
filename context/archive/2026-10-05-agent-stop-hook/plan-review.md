<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Agent Stop Hook Implementation Plan

- **Plan**: context/changes/agent-stop-hook/plan.md
- **Mode**: Deep (claims verified inline: spawn-worker.sh, git check-ignore, eslint/ci/tsconfig, .astro layout)
- **Date**: 2026-10-06
- **Verdict**: REVISE
- **Findings**: 2 critical, 4 warnings, 0 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | FAIL    |
| Plan Completeness     | FAIL    |

## Grounding

9/9 paths ✓ (`.gitignore:30`, `eslint.config.js:107-108,114`, `package.json:10`, `ci.yml` astro sync before lint, `tsconfig.json:3`, `scripts/smoke.mjs`, `scripts/ui-check.mjs`, `CLAUDE.md` "Build, Test, and Development Commands", `README.md` "Available Scripts"/"CI"). Symbols: `spawn-worker.sh` env lines have moved and now export `DBAM_ROLE` (see F3). Brief↔plan ✓. Progress↔Phase ✓ (Phase 1: 8 automated + 1 manual, Phase 2: 4 + 3, no checkboxes in phase bodies). `docs/reference/contract-surfaces.md` absent, so that check was skipped.

## Findings

### F1 — Obeying the 3rd block leaves the counter at 3, so the next `done` passes without lint

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Implementation Approach (decision order); Phase 1 contract "STATUS detection" and "State files"; success criterion 1.7
- **Detail**: The 3rd block tells the agent to end with `STATUS: failed — lint — <log>`. That turn hits step 1 ("final STATUS is not `done` → pass, no output"), so the script never reaches step 2 (cap release + reset). The per-worktree counter stays at 3. On `STATUS: failed` the orchestrator gives "one changed-approach retry" (`SKILL.md:63`) to the same worktree. The worker's next `done` stop then hits step 2, passes without running ESLint and resets the counter. This is the exact case the decision "Counter resets after the cap releases" (decisions.md) was meant to prevent ("a restarted fixer would pass its first stop unchecked"). The reset only happens on the path where the agent ignores the instruction. Criterion 1.7 tests only that path (run 4 = another `done`), so the bug passes verification.
- **Fix A ⭐ Recommended**: Reset the counter to 0 whenever a non-`done` turn passes (`question`, `blocked`, `failed`), so "consecutive" means consecutive `done` attempts. Add a 1.7 step: after run 3, a `STATUS: failed` input prints nothing and leaves `blocks: 0`, and the next `done` input blocks again (block 1/3).
  - Strength: One rule covers the instructed `failed` path, a mid-loop question and a restart. Writing state on the non-`done` branch is cheap (no lint).
  - Tradeoff: A non-`done` turn now writes the state file instead of exiting untouched. Plan text "pass with no output" stays true, but the branch is no longer side-effect free.
  - Confidence: HIGH — follows directly from the plan's own step order and `SKILL.md:63`.
  - Blind spot: None significant.
- **Fix B**: Reset only on a `STATUS: failed` turn and leave `question`/`blocked` alone.
  - Strength: Narrowest change, ties the reset to the acknowledged-failure signal.
  - Tradeoff: A loop interrupted by a `question` still carries its count into the next stage, so a later phase can get fewer than 3 blocks.
  - Confidence: HIGH — same evidence.
  - Blind spot: Whether the orchestrator ever restarts a worker after `blocked` without a `failed` turn.
- **Decision**: ACCEPTED — Fix A (orchestrator, 2026-10-06): reset the counter to 0 whenever a non-`done` turn passes; 1.7 gains the failed-path step.

### F2 — Criterion 2.2's `git check-ignore -q` with three paths is a fatal error

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2, Success Criteria → Automated (Progress 2.2)
- **Detail**: `git check-ignore -q .claude/skills .claude/prompts .claude/settings.local.json` exits 128 with "fatal: --quiet is only valid with a single pathname" (reproduced with git in a scratch repo). Even without `-q`, a multi-path call exits 0 if _any_ path is ignored, so it could not prove that all three are ignored.
- **Fix**: Check each path on its own, e.g. `for p in .claude/skills .claude/prompts .claude/settings.local.json; do git check-ignore -q "$p" || echo "NOT IGNORED: $p"; done` prints nothing.
- **Decision**: ACCEPTED (orchestrator, 2026-10-06): 2.2 checks each path separately.

### F3 — `DBAM_ROLE` is already wired, so the plan's premise and risk are stale

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Current State Analysis (env bullet); What We're NOT Doing (first bullet); plan-brief "Open Risks"; Phase 1 block-reason contract ("if this is a review-only session…")
- **Detail**: The plan says the orchestrator "adds `DBAM_ROLE` there separately", and the brief says the reviewer skip "does nothing until the orchestrator adds `DBAM_ROLE=review`". `spawn-worker.sh` already exports `DBAM_ROLE=impl` for implementers (the `pane run "export DBAM_ROLE=impl …"` line, ~~:110) and passes `--env "DBAM_ROLE=review"` to reviewers (~~:123). This review session has `DBAM_ROLE=review` in its env. The cited line numbers `:105`/`:123` have also drifted. The reviewer skip works on day one. The "review-only session" sentence in the block reason is now only a fallback for panes started before that edit.
- **Fix**: Update Current State, NOT Doing and the brief's Open Risks to say `DBAM_ROLE` is set (`impl`/`review`). Keep the review-only sentence as a fallback for older panes, or drop it. Record the choice in decisions.md.
- **Decision**: ACCEPTED (orchestrator, 2026-10-06): Current State, NOT Doing and the brief updated; the review-only sentence stays as a fallback for older panes.

### F4 — Manual 2.6 can't run in the main checkout before merge, and 2.5 has no fallback if hooks don't reload

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2, Manual Verification (Progress 2.5, 2.6)
- **Detail**: 2.6 says to test "a human session in the main checkout". The main checkout gets `.claude/settings.json` and `scripts/stop-lint.mjs` only after merge, so before merge that session proves nothing. 2.5 relies on settings reloading mid-session (Critical Implementation Details). The plan doesn't say what to do if the hook doesn't fire after the write: is the script broken, or were the hooks not reloaded?
- **Fix**: Make 2.6 a session in this worktree with the guard vars removed (`env -u DBAM_CHANGE -u DBAM_ROLE claude`, or the Phase 1 pipe test plus a check that `/hooks` lists the entry). Add to 2.5: if no block appears, confirm the hook is registered in `/hooks` and restart the worker before treating it as a script failure.
- **Decision**: ACCEPTED (orchestrator, 2026-10-06): 2.6 runs in this worktree with `env -u DBAM_CHANGE -u DBAM_ROLE` or the pipe test plus `/hooks`; 2.5 gains the `/hooks` + restart fallback.

### F5 — The repo root comes from the agent's current dir, so a `cd` elsewhere lints the wrong repo or skips the check

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 contract, "Working dir"
- **Detail**: The root is `git rev-parse --show-toplevel` from the input `cwd`, falling back to `process.cwd()`. Both are the agent's current Bash directory (hooks run "in the current directory", research §3), so the fallback adds nothing. Workers often read `$DBAM_MAIN_REPO`, and Phase 1's own test 1.8 builds a scratch git repo. If the session's cwd is left in either place, the hook lints the main checkout's diff and writes `dbam-stop-lint.*` into the main repo's `.git`, or it fails open on a scratch repo with no `origin/main`. Either way the worker's own changes go unchecked.
- **Fix**: Resolve the root from `$CLAUDE_PROJECT_DIR` first (the same variable the settings command already uses). Fall back to input `cwd`, then `process.cwd()`, only when it is unset. Test 1.8 then sets the scratch repo through `CLAUDE_PROJECT_DIR` instead of `cwd`.
- **Decision**: ACCEPTED (orchestrator, 2026-10-06): root from `CLAUDE_PROJECT_DIR`, then input `cwd`, then `process.cwd()`; 1.8 uses `CLAUDE_PROJECT_DIR`.

### F6 — `astro sync` runs through `npx` and only when types are missing

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 contract, "Types"
- **Detail**: Two gaps:
  1. `npx astro sync` assumes `--yes` when stdin is not a TTY, and the hook's stdin is a pipe. In a worktree whose `npm ci` hasn't finished or failed, npx would download the latest `astro` from the registry and run that version, not the pinned one. The ESLint step uses `node_modules/.bin/eslint` and fails open when it is missing, so the two steps are inconsistent.
  2. The sync is skipped whenever `.astro/types.d.ts` exists. `.astro/env.d.ts` is generated from the `env.schema` in `astro.config.mjs` (7 vars today, and changes keep adding them). A worker that adds an `envField` and imports it from `astro:env/server` gets stale types. That produces the same false `no-unsafe-*` errors the sync exists to prevent, and the agent burns blocks "fixing" correct code.
- **Fix A ⭐ Recommended**: Run `node_modules/.bin/astro sync` (fail open if it is missing). Run it when `.astro/types.d.ts` is missing _or_ older than `astro.config.mjs` (mtime compare).
  - Strength: Keeps the ~4.7 s cost to the rare turns that need it. Matches the ESLint binary contract.
  - Tradeoff: Other type sources (content collections, `wrangler.jsonc`) are not covered by the mtime check.
  - Confidence: MED — `.astro/types.d.ts` references `env.d.ts` (checked in the main repo's `.astro/`), but no false error from stale env types was reproduced.
  - Blind spot: Whether `astro sync` rewrites `types.d.ts` (bumping its mtime) when its content doesn't change.
- **Fix B**: Always run `node_modules/.bin/astro sync` before linting when the change set is non-empty.
  - Strength: Mirrors CI (`ci.yml`: sync then lint) exactly, so no stale-type class at all.
  - Tradeoff: +~4.7 s on every worker `done` turn with lintable changes.
  - Confidence: HIGH — the same order CI uses.
  - Blind spot: None significant.
- **Decision**: ACCEPTED — Fix A (orchestrator, 2026-10-06): `node_modules/.bin/astro sync` (fail open if missing) when `.astro/types.d.ts` is missing or older than `astro.config.mjs`.
