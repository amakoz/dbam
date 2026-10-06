# Agent Stop Hook Implementation Plan

## Overview

Add a Claude Code `Stop` hook, committed in `.claude/settings.json`, that runs ESLint (errors only) on the files a Dbam worker changed against `origin/main`. It blocks the worker from ending a `done` turn while errors remain. The hook runs only in worker sessions (`DBAM_CHANGE` set) and is capped at 3 consecutive blocks so it cannot trap an agent. Roadmap F-06; PRD NFR (testing).

## Current State Analysis

- `.gitignore:30` ignores the whole `.claude/` directory, so nothing under it can be committed. A negation inside an excluded directory has no effect (tested, `research.md` §6).
- No Claude Code project settings exist. The user's `~/.claude/settings.json:74-83` already has a Stop hook (`cc-status`). Hooks from all levels run in parallel, so the project hook adds to it.
- Workers get `DBAM_CHANGE`, `DBAM_PORT`, `DBAM_MAIN_REPO` and `DBAM_ROLE` from `spawn-worker.sh`:
  - implementers: `export DBAM_ROLE=impl …` (`:110`);
  - reviewers: `--env "DBAM_ROLE=review" …` (`:128`).

  Panes started before that edit (including this worker's) have no `DBAM_ROLE`. `claude` starts without `--settings`, so the project settings load, and folder trust is auto-accepted (`:58-61`). That file lives in the main repo's gitignored `.claude/skills` and is out of scope (plan-review F3).

- Lint is `eslint .` (`package.json:10`), type-checked. CI runs `npx astro sync` first (`ci.yml:27-28`). Fresh worktrees have no `.astro/`, which yields false `no-unsafe-*` errors (`research.md` Summary).
- No script in `scripts/` computes changed files (`research.md` §4).

## Desired End State

- In a worker session, ending a turn whose final line is `STATUS: done` (or that has no STATUS line) runs ESLint on the changed lintable files. Errors block the stop and are fed back to the agent. A clean run resets the counter and lets the stop through.
- After 3 consecutive blocks, the 4th stop attempt passes and prints a `systemMessage` naming the log. The 3rd block told the agent it was the last one and to report `STATUS: failed — lint — <log path>`.
- Human sessions (no `DBAM_CHANGE`) and `DBAM_ROLE=review` sessions are untouched. `question`, `blocked` and `failed` turns pass without linting and reset the counter, so "consecutive" means consecutive `done` attempts.
- `git status` shows `.claude/settings.json` as trackable. The `.claude/skills` and `.claude/prompts` symlinks, `.claude/settings.local.json`, and the `worktrees/`, `orchestra/` and lock files stay ignored.

### Key Discoveries:

- `stop_hook_active` is per turn and boolean, so it is not a counter. The built-in cap (8 blocks with no tool call in between) never fires in a fix loop (`research.md` §3).
- Blocking output must be top-level `{"decision":"block","reason":…}`. `systemMessage` alone on exit 0 allows the stop and warns the user (code.claude.com/docs/en/hooks).
- `git diff --name-only --diff-filter=d --merge-base origin/main` plus `git ls-files --others --exclude-standard` covers committed, staged, unstaged and untracked files and drops deletions (`research.md` §5).
- ESLint with no file arguments lints the whole repo (~13 s), and a missing path exits 2, so the hook must skip on an empty list and filter deletions (`research.md` §4).
- `scripts/**/*.mjs` already has a `disableTypeChecked` lint override (`eslint.config.js:107-108`), which makes `scripts/` the right home for the hook script.
- `git rev-parse --git-path <name>` resolves to the per-worktree git dir (`.git/worktrees/<wt>/<name>`). That path is untracked and outside the working tree (`research.md` §7).

## What We're NOT Doing

- Not editing `spawn-worker.sh` or anything under `.claude/skills/`. `DBAM_ROLE` (`impl`/`review`) is already wired there by the orchestrator (`:110`, `:128`).
- Not running `ui:check`, `astro check`, build or tests in the hook. Lint only.
- Not blocking on warnings (`--quiet`).
- Not linting the whole repo, and not using `--fix`. The agent fixes errors itself.
- Not adding a `SubagentStop` hook, and not changing CI. CI `ci` stays the authoritative gate.
- Not raising `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`.
- Not adding a unit-test runner. The script is verified by piping Stop-input JSON into it.

## Implementation Approach

A dependency-free Node script (`scripts/stop-lint.mjs`) holds all the logic. `.claude/settings.json` only wires it to `Stop`. The script reads the Stop JSON from stdin and makes these decisions in order:

1. **Pass, no output** (exit 0, no lint):
   - `DBAM_CHANGE` is unset;
   - `DBAM_ROLE=review`;
   - the final `STATUS:` line is not `done`. This branch also resets the counter to 0 (plan-review F1).
2. **Pass after the cap:** the counter has reached 3. The script resets it to 0 and prints a `systemMessage`.
3. **Pass when nothing is lintable:** the list of changed lintable files is empty.
4. **Fail open:** git, `origin/main`, `astro sync` or the ESLint binary is unavailable, or ESLint exits 2. The script passes and prints a `systemMessage` saying the hook skipped and why.
5. **Run ESLint** on the list:
   - errors → write the log, increment the counter, and block with a reason;
   - clean → reset the counter and pass.

The work happens in two phases. Phase 1 builds and verifies the script while nothing calls it. Phase 2 wires it up and is the moment the hook goes live, including in this worker's own session (settings reload mid-session).

## Critical Implementation Details

- **Timing & lifecycle:** write `.claude/settings.json` only in Phase 2, after the script passes its Phase 1 checks. Settings edits reload live, and this session has `DBAM_CHANGE=agent-stop-hook` and no `DBAM_ROLE`, so a broken script would start blocking this very worker.
- **State sequencing:** per decisions.md, the counter is per worktree, not per session, so it survives a `restart`. It resets in three cases: a clean lint, cap release, and any non-`done` turn passing. The non-`done` case matters most: the 3rd block tells the agent to end with `STATUS: failed`, and without the reset the orchestrator's retry (`SKILL.md:63`) would find the counter at 3 and pass its first `done` unchecked (plan-review F1).

## Phase 1: Stop-lint script

### Overview

Create `scripts/stop-lint.mjs`. It decides pass/block from the Stop input and the lint result, keeps the counter and log in the per-worktree git dir, and always exits 0 with JSON (or nothing) on stdout.

### Changes Required:

#### 1. Hook script

**File**: `scripts/stop-lint.mjs` (new)

**Intent**: Implement the decision order from Implementation Approach as a dependency-free ES module using only `node:` built-ins. It follows the `scripts/smoke.mjs` / `ui-check.mjs` style: a short header comment stating purpose and the guards.

**Contract**:

- **Input:** Stop-hook JSON on stdin. It reads `last_assistant_message`, `cwd` and `session_id` (for the log header only). Missing or unparsable stdin is treated as no STATUS line.
- **Env:** `DBAM_CHANGE` must be non-empty; if `DBAM_ROLE=review`, pass.
- **Working dir:** resolve the repo root with `git rev-parse --show-toplevel`. Run it from the first of these that is set:
  1. `$CLAUDE_PROJECT_DIR`;
  2. input `cwd`;
  3. `process.cwd()`.

  The agent's Bash cwd may be `$DBAM_MAIN_REPO` or a scratch repo (plan-review F5). Run every command from that root.

- **STATUS detection:** find the last line of `last_assistant_message` that, after trimming, starts with `STATUS:`. Read the word after it:
  - no such line, or the word is `done` → lint;
  - any other word (`question`, `blocked`, `failed`) → reset the counter to 0 and pass with no output.
- **Changed files:** the merge-base diff plus untracked files (`research.md` §5), de-duplicated and filtered to `\.(js|mjs|cjs|jsx|ts|tsx|mts|cts|astro)$`. Keep only paths that exist on disk. Use `-z` output to tolerate spaces.
- **Types:** run `node_modules/.bin/astro sync` once before linting when `.astro/types.d.ts` is missing _or_ older than `astro.config.mjs` (mtime compare; `env.d.ts` comes from its `env.schema`). If the binary is missing or the sync fails, fail open. Never use `npx`, which could download an unpinned `astro` into a worktree whose `npm ci` hasn't finished (plan-review F6).
- **ESLint:** invoke `node_modules/.bin/eslint` from the repo root with `--quiet --no-warn-ignored --no-error-on-unmatched-pattern -f stylish` and the file list. Exit 1 means errors; exit 2 or a spawn error means fail open.
- **State files** (paths from `git rev-parse --git-path`):
  - `dbam-stop-lint.json`: `{ "blocks": <int> }`;
  - `dbam-stop-lint.log`: overwritten on each block with the ESLint output plus a header (time, `DBAM_CHANGE`, session id, block n/3).
- **Output:** all outputs exit 0 and print at most one JSON object.
  - Block: `{"decision":"block","reason":…}`. The reason includes:
    - the file count and the log path;
    - the ESLint output, truncated to ~4,000 characters;
    - "fix these errors, rerun, then end with your STATUS line";
    - "if this is a review-only session, do not fix code: report these lint errors as a finding". This is a fallback for reviewer panes started without `DBAM_ROLE`;
    - on block 3, additionally: "this is the last block; if you cannot fix them, end with `STATUS: failed — lint — <log path>`".
  - Cap release: `{"systemMessage":"stop-lint: released after 3 consecutive blocks; lint errors remain, see <log path>"}`.
  - Fail open: `{"systemMessage":"stop-lint skipped: <reason>"}`.
- **Constant:** `MAX_BLOCKS = 3`.

### Success Criteria:

#### Automated Verification:

- The script passes lint: `npx eslint scripts/stop-lint.mjs`.
- Full lint still passes after `npx astro sync`: `npm run lint`.
- No-op without the env var: `echo '{"last_assistant_message":"x\nSTATUS: done — y — z"}' | env -u DBAM_CHANGE node scripts/stop-lint.mjs` prints nothing and exits 0.
- Review role passes: the same input with `DBAM_CHANGE=t DBAM_ROLE=review` prints nothing and exits 0.
- A `question` turn passes without linting: input with `STATUS: question — …` and `DBAM_CHANGE=t` prints nothing and exits 0.
- A clean tree passes: with no lintable changes or only clean ones, a `done` input prints nothing (or no `decision`) and leaves `blocks` at 0.
- Errors block, then the cap releases (all with `DBAM_CHANGE=t` and a `done` input):
  - Setup: add an untracked probe file with a lint error (e.g. `src/__stop_lint_probe.ts` containing `const x: any = 1`).
  - Runs 1-3 print `"decision":"block"`, and run 3's reason contains "last block" and `STATUS: failed — lint —`.
  - Run 4 prints a `systemMessage` and no `decision`, and the state file is back to `blocks: 0`.
  - Failed path: repeat runs 1-3. A `STATUS: failed — lint — …` input then prints nothing and leaves `blocks: 0`, and the next `done` input blocks again as block 1/3.
  - Cleanup: delete the probe file and the state and log files.
- Fail open on a missing ref: run the script with `CLAUDE_PROJECT_DIR` set to a scratch git repo that has no `origin/main`. It prints a `systemMessage` starting `stop-lint skipped:` and no `decision`.

#### Manual Verification:

- Read one block `reason` from the probe run: it is understandable to an agent and names the log path.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Wire the hook and document it

### Overview

Un-ignore `.claude/settings.json`, add the Stop hook that calls the script, and document it. This is the activation step.

### Changes Required:

#### 1. Git ignore

**File**: `.gitignore`

**Intent**: Let exactly one file under `.claude/` be tracked.

**Contract**: replace `.claude/` (line 30) with `.claude/*` followed by `!.claude/settings.json`, and add a one-line comment explaining why. ESLint inherits this through `includeIgnoreFile` (`eslint.config.js:114`). JSON is not linted, so nothing new gets linted.

#### 2. Project settings

**File**: `.claude/settings.json` (new, committed)

**Intent**: Register the script as a `Stop` command hook for every session in this repo. The script's own env guard makes it a no-op outside workers.

**Contract**: only a `hooks.Stop` entry (no permissions, env or other keys). It has no matcher and a single `command` hook running `node "$CLAUDE_PROJECT_DIR/scripts/stop-lint.mjs"` with `timeout: 180` (seconds; the default 600 is too long for a stuck lint). Prettier formats it through lint-staged on commit.

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/scripts/stop-lint.mjs\"", "timeout": 180 }
        ]
      }
    ]
  }
}
```

#### 3. Docs

**Files**: `CLAUDE.md`, `README.md`

**Intent**: Tell humans and agents the hook exists, when it fires, and how it is capped.

**Contract**:

- `CLAUDE.md` → "Build, Test, and Development Commands": one bullet saying worker sessions (`DBAM_CHANGE` set) run a Stop hook, `@scripts/stop-lint.mjs`, that blocks a `STATUS: done` turn while ESLint errors remain in changed files (3 blocks max). `.claude/settings.json` is the only tracked file under `.claude/`.
- `README.md` → "Available Scripts" (or a short subsection near "CI"): two or three sentences covering the same facts plus the state and log location (`git rev-parse --git-path dbam-stop-lint.log`).

### Success Criteria:

#### Automated Verification:

- `git check-ignore -q .claude/settings.json` exits 1 (not ignored).
- Each path is ignored on its own (`-q` takes a single path, plan-review F2): `for p in .claude/skills .claude/prompts .claude/settings.local.json; do git check-ignore -q "$p" || echo "NOT IGNORED: $p"; done` prints nothing.
- `node -e 'JSON.parse(require("fs").readFileSync(".claude/settings.json","utf8"))'` exits 0.
- `npm run lint` passes, and `npx prettier --check .claude/settings.json CLAUDE.md README.md` passes.

#### Manual Verification:

- In this worker session (hook live after the settings write): add the untracked lint-error probe and end a turn with `STATUS: done`. The hook blocks with the reason. Remove the probe, end the turn again, and the stop goes through. If no block appears, first confirm in `/hooks` that the Stop entry is registered, and restart the worker. Only treat it as a script failure if it still doesn't fire after the restart (plan-review F4).
- No hook effect without the guard vars, checked in this worktree because the main checkout gets the files only after merge. Either run a session as `env -u DBAM_CHANGE -u DBAM_ROLE claude`, end a turn and see no hook message or delay; or run the Phase 1 pipe test with those vars unset and confirm `/hooks` lists the entry.
- The user's existing `cc-status` Stop hook still fires alongside the project hook.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- None. The repo has no unit runner (`CLAUDE.md` Testing Guidelines). The Phase 1 stdin scenarios cover each decision branch: env guard, role skip, STATUS filter, clean pass, block ×3, cap release with reset, reset on a `failed` turn, fail open.

### Integration Tests:

- The Phase 2 live check in a real worker session covers the whole path through Claude Code (settings load, env inheritance, block feedback).

### Manual Testing Steps:

1. In a worker session, create an untracked file with a lint error, then end a `done` turn. Expect a block naming the file and `dbam-stop-lint.log`.
2. Fix or delete the file and end the turn again. Expect it to pass and the counter to reset.
3. End a `STATUS: question` turn while the error file exists. Expect it to pass without linting and to reset the counter.

## Performance Considerations

- Human sessions pay only Node startup (~50 ms) before the env guard exits.
- Worker `done` turns: ~3 s warm for TS files, 6-7 s once a `.astro` file is included, plus ~4.7 s for `astro sync` in a fresh worktree or after `astro.config.mjs` changes (`research.md` §4). Non-`done` turns and empty change sets skip ESLint.

## Migration Notes

- Rollout: only worktrees created or rebased after merge get the hook (`spawn-worker.sh:86`, `--base origin/main`). Existing worktrees are unaffected until they rebase.
- Rollback: delete `.claude/settings.json` (or the `Stop` entry). The script is then inert.

## References

- Research: `context/changes/agent-stop-hook/research.md`
- Decisions: `context/changes/agent-stop-hook/decisions.md`
- Plan review: `context/changes/agent-stop-hook/plan-review.md` (F1-F6 accepted)
- Roadmap: `context/foundation/roadmap.md:157-168` (F-06)
- Script style: `scripts/smoke.mjs`, `scripts/ui-check.mjs`
- Hook contract: https://code.claude.com/docs/en/hooks.md, https://code.claude.com/docs/en/hooks-guide.md

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Stop-lint script

#### Automated

- [x] 1.1 The script passes lint — 4d4290e
- [x] 1.2 Full lint still passes after astro sync — 4d4290e
- [x] 1.3 No-op without the env var — 4d4290e
- [x] 1.4 Review role passes — 4d4290e
- [x] 1.5 A question turn passes without linting — 4d4290e
- [x] 1.6 A clean tree passes — 4d4290e
- [x] 1.7 Errors block, then the cap releases — 4d4290e
- [x] 1.8 Fail open on a missing ref — 4d4290e

#### Manual

- [x] 1.9 Block reason is understandable and names the log path — 4d4290e

### Phase 2: Wire the hook and document it

#### Automated

- [x] 2.1 .claude/settings.json is not ignored
- [x] 2.2 skills, prompts and settings.local.json stay ignored
- [x] 2.3 settings.json is valid JSON
- [x] 2.4 Lint and Prettier pass

#### Manual

- [x] 2.5 Live block and pass in this worker session
- [x] 2.6 No hook effect in a human session
- [x] 2.7 Existing cc-status Stop hook still fires
