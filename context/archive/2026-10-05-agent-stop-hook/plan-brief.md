# Agent Stop Hook — Plan Brief

> Full plan: `context/changes/agent-stop-hook/plan.md`
> Research: `context/changes/agent-stop-hook/research.md`
> Plan review: `context/changes/agent-stop-hook/plan-review.md` (F1-F6 accepted)

## What & Why

Dbam worker agents sometimes report `STATUS: done` with lint errors still in the files they changed, and those errors only surface in CI or review. A Claude Code `Stop` hook makes the agent fix ESLint errors in its changed files before a `done` turn can end. It is capped so it can never trap an agent (roadmap F-06, NFR testing).

## Starting Point

`.claude/` is entirely gitignored (`.gitignore:30`), so no project Claude settings exist. Workers already carry `DBAM_CHANGE` and `DBAM_ROLE` (`impl`/`review`, `spawn-worker.sh:110,128`) and load project settings. Lint is type-checked ESLint that needs `astro sync` types, which fresh worktrees lack.

## Desired End State

In a worker session, a turn ending in `STATUS: done` (or with no STATUS line) is blocked while ESLint reports errors in the changed files. The agent sees the errors and a log path. After 3 consecutive blocks, the next stop passes with a warning, and the agent has been told to report `STATUS: failed — lint — <log>`. Human sessions, reviewer sessions (`DBAM_ROLE=review`) are unaffected. `question`/`blocked`/`failed` turns pass without linting and reset the counter.

## Key Decisions Made

| Decision      | Choice                                                                                                  | Why (1 sentence)                                                                                   | Source                                  |
| ------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Un-ignore     | `.claude/*` + `!.claude/settings.json`                                                                  | A negation under `.claude/` has no effect; this keeps symlinks and local settings ignored (tested) | Research                                |
| Script home   | `scripts/stop-lint.mjs` (Node, no deps)                                                                 | Matches `scripts/*.mjs` and its lint override; no second un-ignore                                 | Research                                |
| Files linted  | merge-base diff + untracked, deletions dropped, lintable extensions                                     | Correct when `origin/main` moves; never an empty or missing path                                   | Research                                |
| Severity      | errors only (`--quiet`)                                                                                 | Roadmap says errors; `no-console` warnings shouldn't block                                         | Plan (orchestrator)                     |
| Types         | `node_modules/.bin/astro sync` when `.astro/types.d.ts` is missing or older than `astro.config.mjs`     | Avoids false errors in fresh worktrees and after `env.schema` edits; never `npx`                   | Plan (orchestrator, review F6)          |
| Turns checked | final `STATUS: done` or no STATUS line                                                                  | `done` is the "verified" claim; don't block questions                                              | Plan (orchestrator)                     |
| Cap           | per-worktree counter, 3 consecutive `done` blocks, reset on clean lint, release and any non-`done` turn | Built-in cap never fires in a fix loop; resets keep the post-`failed` retry checked                | Plan (orchestrator / worker, review F1) |
| Reporting     | 3rd block points to `STATUS: failed — lint — <log>`; 4th stop passes with a `systemMessage`             | Reuses the protocol's `failed` path the orchestrator already handles                               | Plan (orchestrator)                     |
| Reviewers     | skip `DBAM_ROLE=review`; reason still says "report as a finding"                                        | `DBAM_ROLE` is already wired; the sentence covers older panes without it                           | Plan (orchestrator, review F3)          |
| Repo root     | `$CLAUDE_PROJECT_DIR`, then input `cwd`, then `process.cwd()`                                           | The agent's Bash cwd may be the main repo or a scratch repo                                        | Plan (orchestrator, review F5)          |
| Failures      | fail open with a `systemMessage`                                                                        | A hook bug must not trap the agent; CI stays the gate                                              | Plan (orchestrator)                     |

## Scope

**In scope:**

- `scripts/stop-lint.mjs`
- the `.gitignore` change
- `.claude/settings.json` with one `Stop` hook
- short `CLAUDE.md` and `README.md` notes

**Out of scope:**

- `spawn-worker.sh` (already sets `DBAM_ROLE`; outside the repo)
- other gates in the hook, `--fix`, warnings
- `SubagentStop`
- CI changes
- a unit-test runner

## Architecture / Approach

The hook's only setting is `.claude/settings.json` → `Stop` → `node "$CLAUDE_PROJECT_DIR/scripts/stop-lint.mjs"` (180 s timeout). The script reads the Stop JSON from stdin and decides in this order:

1. env/role guard;
2. STATUS filter;
3. cap release;
4. changed-file list;
5. `astro sync` if needed;
6. ESLint;
7. block or pass.

Counter and log live in the per-worktree git dir (`git rev-parse --git-path dbam-stop-lint.{json,log}`). The script always exits 0 and prints at most one JSON object.

## Phases at a Glance

| Phase                            | What it delivers                                          | Key risk                                    |
| -------------------------------- | --------------------------------------------------------- | ------------------------------------------- |
| 1. Stop-lint script              | Script verified by piping Stop JSON into it, all branches | Edge cases in parsing the STATUS line       |
| 2. Wire the hook and document it | `.gitignore`, `settings.json`, docs; hook live            | Goes live in this very session once written |

**Prerequisites:** none. `origin/main` is fetched, and Node 22 and ESLint 10 are present.
**Estimated effort:** ~1 session across 2 small phases.

## Open Risks & Assumptions

- The hook reaches only worktrees created or rebased after merge.
- Panes started before `DBAM_ROLE` was wired (including this worker's) lack it; reviewers among them rely on the "report as a finding" sentence.
- A Stop timeout (180 s) lets the stop through silently. This is acceptable, because CI still lints.

## Success Criteria (Summary)

- A worker can't end a `done` turn with ESLint errors in its changed files, except after 3 blocks, which ends in an explicit `failed` report.
- Human and reviewer sessions see no change.
- Only `.claude/settings.json` becomes tracked under `.claude/`.
