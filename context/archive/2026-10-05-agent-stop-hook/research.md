---
date: 2026-10-05T22:02:23+0200
researcher: Claude Opus 5.5 (Dbam worker agent-stop-hook-impl)
git_commit: 1b719a9b1030c4155cb55481c715a85acfd6852f
branch: feat/agent-stop-hook
repository: 10xdevs (Dbam)
topic: "F-06 agent-stop-hook: what a worker-only Claude Code Stop hook that lints changed files must fit into"
tags: [research, claude-code-hooks, eslint, gitignore, dbam-orchestrate, worker-protocol]
status: complete
last_updated: 2026-10-05
last_updated_by: Claude Opus 5.5 (Dbam worker agent-stop-hook-impl)
---

# Research: F-06 agent-stop-hook

**Date**: 2026-10-05T22:02:23+0200
**Researcher**: Claude Opus 5.5 (Dbam worker agent-stop-hook-impl)
**Git Commit**: 1b719a9b1030c4155cb55481c715a85acfd6852f (HEAD = `origin/main` = merge-base at research time)
**Branch**: feat/agent-stop-hook
**Repository**: 10xdevs (Dbam)

## Research Question

From `change.md` / roadmap F-06 (`context/foundation/roadmap.md:157-168`): a committed `.claude/settings.json`, un-ignored in `.gitignore`, adds a Claude Code `Stop` hook. The hook runs ESLint on the files changed against `origin/main` and blocks the turn from ending while errors remain. It runs only when `DBAM_CHANGE` is set. It is capped (for example, it passes after 3 consecutive blocks and reports), it stays on changed files, and `.claude/skills/` plus local settings stay ignored.

The questions:

1. How are worker sessions launched? Does `DBAM_CHANGE` reach a hook, and does a project `.claude/settings.json` load?
2. What is the Stop hook contract (input, blocking, loop cap, env, timeouts, merging with the user's existing Stop hook)?
3. How do we lint "changed files" correctly and fast with this repo's ESLint setup?
4. How do we un-ignore one file under `.claude/` without un-ignoring the rest?

## Summary

- **The env guard works.** Workers get `DBAM_CHANGE`, `DBAM_PORT` and `DBAM_MAIN_REPO` from `spawn-worker.sh`. Implementer panes get them through `export` at `:105`, reviewer panes through `--env` at `:123`. `claude` starts in that shell (`start_agent`, `:52`) without `--settings`/`--setting-sources`, so the project `.claude/settings.json` loads and hook subprocesses inherit the env. A `ps eww` of the live worker confirmed both. **The reviewer pane gets `DBAM_CHANGE` too**, so the hook would fire there as well (open question 1).
- **A plain `!.claude/settings.json` does not work.** `.gitignore:30` is `.claude/`, and git cannot re-include a file under an excluded directory. Changing it to `.claude/*` + `!.claude/settings.json` works. A scratch-repo test showed only `settings.json` becoming visible: the `skills`/`prompts` symlinks, `settings.local.json`, `worktrees/` and `*.lock` stayed ignored.
- **The built-in cap does not protect this hook.** Claude Code overrides a Stop hook after **8 blocks in a row with no tool call in between** (hooks-guide, "Stop hook hits the block cap"). A lint-fixing agent makes tool calls between blocks, so a hook that keeps failing would never hit that cap. The roadmap's "3 consecutive blocks" therefore needs a counter the hook keeps itself.
- **`.astro/` is missing in fresh worktrees, so lint reports false errors there.** `tsconfig.json:3` includes `.astro/types.d.ts`, and CI runs `npx astro sync` before lint (`ci.yml:27-28`). Without it, the ESLint subagent saw `npx eslint .` report 37 `no-unsafe-*` errors in 7 files that pass after `astro sync` (~4.7 s). `spawn-worker.sh:105` runs only `npm ci`. The hook must ensure `.astro/types.d.ts` exists before linting, or it blocks clean work.
- **Changed-file list.** The subagent verified this command in a scratch clone (committed/staged/unstaged/untracked/deleted/renamed cases): `git diff --name-only --diff-filter=d --merge-base origin/main` plus `git ls-files --others --exclude-standard`, filtered to lintable extensions. ESLint must never get an empty list, because no args means the whole repo (~13 s). A deleted path is fatal (exit 2). Warm cost was ~3 s for TS files and ~5.7-6.7 s once a `.astro` file is included.

## Detailed Findings

### 1. Worker launch, environment and settings loading

All anchors are in `.claude/skills/dbam-orchestrate/scripts/spawn-worker.sh`. This file lives in the main repo's gitignored `.claude/skills`, symlinked into each worktree (`:96`), so it is not part of this repo's git history and this change cannot edit it (worker protocol: stay inside the worktree).

- **Env, implementer:** `:105` runs `export DBAM_PORT=$port DBAM_CHANGE=$id DBAM_MAIN_REPO='$REPO'; npm ci …` in the pane's shell, then `start_agent` launches `claude` in the same pane. `restart` (`:132`) reuses that pane, so the vars persist across restarts.
- **Env, reviewer:** `review)` (`:118`) splits a new pane with `--env "DBAM_PORT=$port" --env "DBAM_CHANGE=$id" --env "DBAM_MAIN_REPO=$REPO"` (`:123`) and runs `start_agent` with opus. No env var tells reviewer and implementer apart. They differ only in agent name (`-impl` / `-review`) and `HERDR_PANE_ID`.
- **No other `DBAM_*` vars.** A grep of the worktree and the main repo (excluding `node_modules`, `.git`) found only `DBAM_PORT`, `DBAM_CHANGE` and `DBAM_MAIN_REPO`. `DBAM_NPM_DONE:` is an output marker, not a var.
- **Launch flags (`:52-54`):** `--model … --effort high --permission-mode auto --append-system-prompt-file worker-protocol.md --disallowedTools=AskUserQuestion -n <name>`. There is no `--settings` or `--setting-sources`, so user, project and local settings all load. The live worker (`claude … -n agent-stop-hook-impl`) showed `DBAM_CHANGE=agent-stop-hook`, `DBAM_PORT=4332` and `DBAM_MAIN_REPO=/Users/amadeuszkozlowski/Documents/10xdevs` in its environment.
- **Folder trust:** `start_agent` auto-accepts Claude's folder-trust prompt by sending Enter (`:58-61`). Project hooks in a new worktree therefore load without a human. The hooks reference says project settings hooks follow the workspace-trust rule.
- **Worktree and base:** `:82` runs `git -C "$REPO" fetch --quiet origin main` once at spawn. `:86` runs `herdr worktree create … --base origin/main`. Refs are shared with the main repo, so `origin/main` can move ahead when anyone fetches, and the orchestrator re-fetches only at stage 10 (`SKILL.md:53`). A **merge-base** diff stays correct when `origin/main` moves. A two-dot diff against `origin/main` would also list files other PRs changed.
- **No conflict with symlinking:** `:95` (`mkdir -p .claude`) and `:96` (symlink `skills`, `prompts` only when absent) do not touch `settings.json`. The main repo's `.claude/` has no `settings.json` today (inspected). The orchestrator's main checkout would load the committed file after merge, but it has no `DBAM_CHANGE`, so the guard makes the hook a no-op there.
- **Rollout:** existing worktrees branched before the merge do not have the file. Only worktrees created or rebased after merge get the hook (inference from `--base origin/main`, `:86`).

### 2. Worker protocol the hook must cooperate with

`.claude/skills/dbam-orchestrate/references/worker-protocol.md` is appended to every worker's system prompt (`spawn-worker.sh:54`).

- `:15-21`: every turn ends with exactly one final `STATUS: done|question|blocked|failed — … — <artifact>` line. `failed` means a verification step failed "after 2 honest attempts" and names the step and log path (`:21`).
- The orchestrator reads only the last ~40 lines and looks for `STATUS:` (`SKILL.md:40`). On `STATUS: failed` it allows one changed-approach retry, then escalates (`SKILL.md:63`).
- Consequence (inference): the block `reason` should tell the agent to fix lint and still end with one STATUS line. When the cap releases the stop, the hook cannot change the already-written final message. Its report has to reach the orchestrator or human another way, for example a `systemMessage`, a log file under `context/changes/$DBAM_CHANGE/`, or telling the agent on the last block to report `STATUS: failed` with the log path. That is a plan choice.
- The protocol has no exemption for `question`/`blocked` turns. Blocking a turn that only asks the orchestrator a question would add noise (open question 2). `last_assistant_message` (Stop input, see 3) lets the hook read the final STATUS line without parsing the transcript.

### 3. Claude Code Stop hook contract (external: code.claude.com docs, fetched 2026-10-05; local CLI 2.1.289)

Sources: https://code.claude.com/docs/en/hooks.md and https://code.claude.com/docs/en/hooks-guide.md.

- **Input:** common fields (`session_id`, `prompt_id`, `transcript_path`, `cwd`, `scratchpad_dir` (v2.1.257+), `permission_mode`, `effort`, `hook_event_name`), plus Stop-specific `last_assistant_message`, `stop_reason` and `stop_hook_active`. The docs say the transcript "may lag" and recommend `last_assistant_message` instead.
- **`stop_hook_active`:** "`true` when a previous Stop hook in the same turn already blocked the conversation, so this hook is running in a recheck pass". It is per turn, not a counter. The docs' anti-loop example exits 0 whenever it is true, which caps the hook at **one** block per turn, not three.
- **Blocking:** exit 2 with the stderr message, or exit 0 with **top-level** JSON `{"decision":"block","reason":"…"}`. The docs page contradicts the subagent's `hookSpecificOutput`-nested shape. The reason "continues the conversation so Claude can act on it".
- **Built-in cap:** the hooks guide says "Claude Code overrides a Stop hook after it blocks eight times in a row with no tool call from Claude in between". It can be raised with `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`. A lint-fix loop makes tool calls, so this cap does not bound it, and the hook needs its own counter.
- **Env and cwd:** handlers "run in the current directory with Claude Code's environment" (falling back to the session start dir / project root if cwd vanished). `$CLAUDE_PROJECT_DIR` is available for the command path. The script should `cd` to the git toplevel itself, because Claude may have `cd`'d during the turn.
- **Timeout:** the command-hook default is 600 s, and Stop is not in the 30 s-default list. A timed-out hook's output is discarded ("renders no decision"), so the stop proceeds. The subagent reported that before v2.1.273 a Stop timeout discarded the other Stop hooks' decisions. That claim comes from a third-party source and is not in the fetched docs page (unverified). The local CLI is 2.1.289.
- **Merging:** hooks from user, project and local settings all run, "in parallel". An identical handler defined twice runs once. The user's `~/.claude/settings.json:74-83` already has a Stop hook (`~/.config/iterm2/cc-status`, a status notifier). The project hook adds to it and does not replace it.
- **Scope:** `Stop` fires for the main agent only. Subagents fire `SubagentStop`, API-error endings fire `StopFailure`, and user interrupts fire neither (per the subagent's reading of the reference; consistent with the event table). Stop ignores `matcher`.
- **Live reload:** settings-file edits are normally picked up by a file watcher mid-session (hooks-guide line ~841/999). Editing `.claude/settings.json` during implementation can activate the hook in this very session, which has `DBAM_CHANGE` set.

### 4. ESLint setup and behaviour on file lists

- **Config (`eslint.config.js`):** flat config with type-checked rules (`strictTypeChecked` + `stylisticTypeChecked`, `projectService: true`). `.astro` files use `project: "./tsconfig.json"`. `scripts/**/*.mjs` uses `disableTypeChecked` (`:107-108`). `eslint-plugin-prettier` comes last, so formatting is an error. Ignores come from `.gitignore` via `includeIgnoreFile` (`:114`) plus `database.types.ts` and `worker-configuration.d.ts` (`:116-118`).
  - **Coupling:** loosening `.claude/` in `.gitignore` also loosens ESLint's ignore. Files placed in an un-ignored `.claude/hooks/` would be linted under the type-checked defaults, not the `scripts/**/*.mjs` override.
- **Linted extensions** (tested): `.js .mjs .cjs .jsx .ts .tsx .mts .cts .astro`. `.json/.css/.md/.sql` give the warning "File ignored because no matching configuration" with exit 0. `--no-warn-ignored` silences it.
- **Version:** ESLint 10.10.0 (`package.json:52` `^10.10.0`). It supports `--no-warn-ignored`, `--max-warnings`, `-f json`, `--quiet`, `--no-error-on-unmatched-pattern`, `--pass-on-no-patterns`, `--cache` and `--concurrency`.
- **Edge cases** (all tested by the subagent):
  - No file args lints the whole repo (= `eslint .`), ~13 s.
  - `--pass-on-no-patterns` with no args exits 0 in ~0.4 s.
  - A missing or deleted path is fatal (exit 2), even when mixed with real files, unless `--no-error-on-unmatched-pattern` is passed.
- **Warnings vs errors:** the roadmap says "errors". `no-console` (`:25`) and two astro rules are warnings, so blocking on warnings is a separate choice. The default exit code is 1 only on errors (no `--max-warnings`).
- **Repo lint wiring:**
  - `package.json:10` runs `"lint": "eslint ."`.
  - lint-staged (`package.json:70-80`) runs `eslint --fix` on `*.{ts,tsx,astro}` only (`.js/.mjs` are not linted on commit) and `prettier --write` on `*.{json,css,md}`. The latter means a committed `.claude/settings.json` gets Prettier-formatted on commit once un-ignored.
  - `.husky/pre-commit` runs `npx lint-staged`.
  - The CI `ci` job runs `npm ci` → `catalog:check` → `astro sync` → `npm run lint` → … (`ci.yml:25-31`).
- **Timing** (warm, this machine):
  - `src/middleware.ts` alone: 3.06 s.
  - `SignInForm.tsx` + `forms.ts`: 3.35 s.
  - `middleware.ts` + `dashboard.astro` + `SignInForm.tsx`: 5.67-6.7 s; a second run with `--cache` took 1.25 s.
  - `astro sync`: ~4.7 s.
- **No existing changed-file logic:** `scripts/` holds `smoke.mjs`, `ui-check.mjs` (hard-coded `MIGRATED` list, `:12`) and `catalog/*.ts`. None of them shells out to git.

### 5. Changed-file list

Verified by the subagent in a scratch clone. The clone had one change of each kind: committed, staged, unstaged, staged deletion, working-tree deletion, rename and untracked `.ts`/`.md`.

```sh
{ git diff --name-only --diff-filter=d --merge-base origin/main
  git ls-files --others --exclude-standard
} | grep -E '\.(js|mjs|cjs|jsx|ts|tsx|mts|cts|astro)$' | sort -u
```

- It printed the committed, staged, unstaged, rename-target and untracked `.ts` files. It excluded both deletions, the rename source and the `.md` file.
- `git diff --name-only origin/main...HEAD` returned only the committed file, so it misses uncommitted work.
- Git is 2.50.1; `--merge-base` needs 2.30+. Use `-z` if paths could contain spaces.
- If `origin/main` is missing (an unfetched clone), the command fails. The hook should then fail open: allow the stop and say why (inference).

### 6. `.gitignore` un-ignore (tested locally in a scratch repo)

Fixture: `.claude/{settings.json, settings.local.json, hooks/stop-lint.sh, worktrees/a, scheduled_tasks.lock}` plus `skills`/`prompts` symlinks.

| `.gitignore`                           | Visible to `git status -uall`         |
| -------------------------------------- | ------------------------------------- |
| `.claude/` + `!.claude/settings.json`  | nothing (negation ineffective)        |
| `.claude/*` + `!.claude/settings.json` | `.claude/settings.json` only          |
| above + `!.claude/hooks/`              | `settings.json`, `hooks/stop-lint.sh` |

`git check-ignore -v` confirmed that under `.claude/*` the symlinks `skills` and `prompts`, `settings.local.json` and `worktrees/a` stay matched by `.gitignore:1:.claude/*`. No global excludes file is configured (`core.excludesFile` unset, `~/.config/git/ignore` absent).

### 7. Per-worktree state for a block counter

`git rev-parse --git-path dbam-stop-lint.json` resolves to `<main>/.git/worktrees/feat-agent-stop-hook/dbam-stop-lint.json`. That path is per worktree, untracked and outside the working tree, so it suits a counter without new ignore rules. Other options are `scratchpad_dir` (per session, v2.1.257+) or `os.tmpdir()` keyed by `session_id`. This is an inference: none of these is used for hook state in the repo today.

## Code References

- `.gitignore:30`: `.claude/` (must become `.claude/*` + `!.claude/settings.json`).
- `.claude/skills/dbam-orchestrate/scripts/spawn-worker.sh` (main repo, untracked):
  - `:52-54`: claude launch flags.
  - `:58-61`: folder-trust auto-accept.
  - `:82`: fetch.
  - `:86`: worktree from `origin/main`.
  - `:96`: skills/prompts symlinks.
  - `:105`: implementer env export + `npm ci` (no `astro sync`).
  - `:118-123`: reviewer pane with the same env.
- `.claude/skills/dbam-orchestrate/references/worker-protocol.md:15-21`: STATUS line contract.
- `.claude/skills/dbam-orchestrate/SKILL.md:40,53,63`: orchestrator reads STATUS, PR stage gates, failed retry policy.
- `~/.claude/settings.json:74-83`: the user's existing Stop hook (`cc-status`).
- `eslint.config.js:107-108` (scripts override), `:114` (`includeIgnoreFile`), `:116-118` (extra ignores).
- `tsconfig.json:3`: includes `.astro/types.d.ts`.
- `.github/workflows/ci.yml:27-28`: `astro sync` before `npm run lint`.
- `package.json:10` (`lint`), `:15` (`prepare: husky`), `:70-80` (lint-staged).
- `.husky/pre-commit`: `npx lint-staged`.

## Architecture Insights

- Repo tooling lives in `scripts/*.mjs`, run by `node`. ESLint already has a `disableTypeChecked` override for that glob (`eslint.config.js:107-108`). A hook script there (e.g. `scripts/stop-lint.mjs`) fits the existing convention, needs no `.claude/hooks/` un-ignore, and keeps the `.gitignore` change to one negated file. A script under `.claude/hooks/` would need a second negation and fall under type-checked lint defaults (inference from §4 and §6).
- The repo's guard style is "refuse loudly, never work around" (`scripts/smoke.mjs` production guard, `CLAUDE.md` hard rules). For this hook, a missing `origin/main`, a git failure or an ESLint crash (exit 2) should fail open with a message rather than trap the agent. This follows the roadmap risk; inference for the specifics.
- The hook is an agent-side shortcut, not a gate: CI `ci` (`ci.yml:28`) stays the authoritative lint gate.

## Historical Context (from prior changes)

- `context/archive/2026-10-05-auth-ui-redesign/plan.md:709,730`: husky was never installed until `"prepare": "husky"` landed (`58ee70b`). `core.hooksPath = .husky/_` is shared by every worktree. This is the precedent for repo-wide hook wiring that silently didn't run, so verify the new hook actually fires in a worker session.
- `context/changes/deployment/deployment-plan.md:242`: "Pre-commit hook fails → review, re-stage, commit. Never `--no-verify`." Same spirit for the Stop hook: the agent fixes the lint error and does not bypass the hook.
- No prior change touched `.claude/settings.json` or Claude Code hooks (grep of `context/changes/**`, `context/archive/**`).

## Related Research

Not applicable. No earlier research covers agent hooks.

## Open Questions

These are for `/10x-plan` and the orchestrator; the evidence is above.

1. **Reviewer panes.** Reviewer sessions also have `DBAM_CHANGE` (`spawn-worker.sh:123`). Should the hook block a reviewer, whose job is to write a report rather than fix code? A role env var would need an edit to `spawn-worker.sh`, which lives outside this repo and must be made by the human or orchestrator in the main checkout. Options:
   - (a) accept it, and word the `reason` so a reviewer reports the lint errors as a finding;
   - (b) the orchestrator adds `DBAM_ROLE` in `spawn-worker.sh` as a follow-up;
   - (c) the hook skips when the last STATUS line is not `done`.
2. **Which turns to check.** Block on every Stop, or only when `last_assistant_message`'s final `STATUS:` is `done`? Skipping `question`/`blocked` avoids blocking mid-implementation questions. A turn without a STATUS line (protocol violation) needs a default.
3. **Cap semantics.** How should "3 consecutive blocks" be counted?
   - (a) per `session_id`, reset when lint passes;
   - (b) per turn via `stop_hook_active`, which is only per-turn and boolean.

   Also decide how the release is reported: a `systemMessage` to the user, a log under `context/changes/$DBAM_CHANGE/`, and/or telling the agent on the final block to report `STATUS: failed`.

4. **`.astro` types.** Run `npx astro sync` when `.astro/types.d.ts` is missing (~4.7 s once), or always? Alternatively, `spawn-worker.sh` could run it after `npm ci`, but that file is outside this repo.
5. **Errors only, or warnings too.** The roadmap says errors. `--quiet` drops warnings from the output.
6. **Self-activation during implementation.** This worker's session has `DBAM_CHANGE` set, and settings edits reload live (hooks guide). The hook may start firing here as soon as `.claude/settings.json` is written, so the plan should order the work with that in mind and use it as the manual check.
