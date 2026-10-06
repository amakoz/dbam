<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Agent Stop Hook

- **Plan**: context/changes/agent-stop-hook/plan.md
- **Scope**: Full plan (Phases 1-2 of 2)
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-06
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Scope and evidence

- Commits `4d4290e` (p1), `f21e140` (p2), `f4510ee` and `b4be985` (plan bookkeeping) on `feat/agent-stop-hook` against `origin/main`.
- Planned files, all present and matching intent: `scripts/stop-lint.mjs`, `.gitignore`, `.claude/settings.json`, `CLAUDE.md`, `README.md`.
- Changes outside the plan: the `context/foundation/roadmap.md` F-06 flip to `in-progress` and the table re-pad. This follows the `/10x-plan` → `/10x-implement` roadmap convention (`.claude/skills/10x-plan/SKILL.md:487`), so it is not a finding. The small additions the worker made inside the plan's intent (an empty lintable list resets the counter, the `.astro/types.d.ts` touch after sync, the 90 s and 150 s child timeouts) are recorded in `decisions.md`.
- The script matches the plan's decision order: env and role guard, STATUS filter with counter reset, cap release, changed-file list, `astro sync` when the types are stale, ESLint, then block or pass. Root resolution is `CLAUDE_PROJECT_DIR` → `cwd` → `process.cwd()`. Every child call passes an argument array with no shell, so no injection path exists.

### Automated verification (re-run by the reviewer)

| Check                                                                | Result                                                                                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1.1 `npx eslint scripts/stop-lint.mjs`                               | PASS (exit 0)                                                                                                             |
| 1.2 / 2.4 `npm run lint`                                             | PASS (exit 0)                                                                                                             |
| 1.3 no `DBAM_CHANGE`                                                 | PASS: no output, exit 0                                                                                                   |
| 1.4 `DBAM_ROLE=review`                                               | PASS: no output, exit 0                                                                                                   |
| 1.5 `STATUS: question` with the probe file present                   | PASS: no output, `blocks: 0`                                                                                              |
| 1.6 clean tree                                                       | PASS: no output, `blocks: 0`                                                                                              |
| 1.7 blocks 1-3, then release                                         | PASS: block 3 reason contains "last block (3/3)" and `STATUS: failed — lint —`; run 4 prints `systemMessage`, `blocks: 0` |
| 1.7 failed path                                                      | PASS: after 3 blocks, a `failed` input prints nothing and sets `blocks: 0`; the next `done` blocks as 1/3                 |
| 1.8 scratch repo without `origin/main`                               | PASS: `{"systemMessage":"stop-lint skipped: git diff against origin/main failed (…)"}`                                    |
| 2.1 `git check-ignore -q .claude/settings.json`                      | PASS (exit 1)                                                                                                             |
| 2.2 skills, prompts and `settings.local.json` ignored                | PASS (no output)                                                                                                          |
| 2.3 `settings.json` parses                                           | PASS (exit 0)                                                                                                             |
| 2.4 `npx prettier --check .claude/settings.json CLAUDE.md README.md` | PASS                                                                                                                      |

The pipe tests need `printf '%s'`, not `echo`: zsh's `echo` expands `\n` inside the JSON, `JSON.parse` fails, and the input silently becomes "no STATUS line". The reviewer's first run hit this. The worker state file was backed up before the tests and restored afterwards (`{"blocks":0}`), and the probe file was removed.

## Findings

### F1 — Cap release skips lint and always reports "lint errors remain"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/stop-lint.mjs:109-115
- **Detail**: When `blocks >= MAX_BLOCKS`, the script resets the counter and emits `stop-lint: released after 3 consecutive blocks; lint errors remain, see <log>`, all before it builds the file list or runs ESLint. If the agent fixed the errors after the 3rd block, as the block reason asks, its next `done` stop still gets the release message. That message says errors remain when they don't, and the orchestrator or human may chase a lint failure that no longer exists. The plan's decision order puts "pass after the cap" before linting (plan.md "Implementation Approach" step 2), so this is a plan-level gap, not drift.
- **Fix**: Move the cap check after the ESLint run. A clean lint then resets and passes silently, and only a run that still has errors at `blocks >= MAX_BLOCKS` releases with the "errors remain" `systemMessage` (and rewrites the log). The cost is one more lint run (~3-7 s) on the release turn.
- **Decision**: PENDING

### F2 — Child-process timeouts add up past the hook's 180 s limit

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/stop-lint.mjs:144, scripts/stop-lint.mjs:154, scripts/stop-lint.mjs:147
- **Detail**: `astro sync` gets 90 s and ESLint 150 s, 240 s in total, but `.claude/settings.json` gives the hook 180 s. `decisions.md` ("Phase 1 execution mode…") says both fit "inside the hook's 180 s limit". If a slow sync is followed by a slow lint, Claude Code kills the hook. That is a non-blocking error, so the stop passes, but without the `stop-lint skipped:` message the fail-open contract promises. Separately, `utimesSync` at :147 is not wrapped in try/catch, so an exception there exits 1 with a stack trace instead of failing open with a message. Typical runtimes (~5 s sync, 3-7 s lint, `research.md` §4) never get close to either limit.
- **Fix**: Make the child timeouts fit the budget (e.g. sync 60 s + ESLint 100 s), or give ESLint whatever remains of a ~170 s deadline. Wrap the `utimesSync` call in try/catch.
- **Decision**: PENDING

### F3 — A Markdown-formatted STATUS line is treated as missing

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/stop-lint.mjs:39-46
- **Detail**: `finalStatus` only recognises lines that start with `STATUS:` after trimming. A worker that writes `**STATUS:** question — …` or `` `STATUS: blocked — …` `` gets `null` (no STATUS line), which means "lint". The reviewer confirmed it: `**STATUS:** question` with the probe present was blocked as 1/3. A `done` turn still gets linted, which is safe. But a `question`/`blocked`/`failed` turn can be blocked and its counter advanced, which goes against the "non-`done` turns pass" decision. The worker protocol asks for a plain `STATUS:` line, so this only bites a worker that doesn't follow it. The behaviour matches the plan's wording.
- **Fix**: Strip leading Markdown decoration (`*`, `` ` ``, `_`, `>`) before matching, e.g. `/^[\s*_`>]_STATUS:?[\s__`]*([A-Za-z]+)/`.
- **Decision**: PENDING

### F4 — Manual items 2.6 and 2.7 checked with no recorded evidence

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/agent-stop-hook/plan.md:275-276
- **Detail**: 2.5 has observable evidence: the worktree's `dbam-stop-lint.log` holds a live block (session `dda9cf5d-…`, 2026-10-06T05:15:27Z, block 3/3, on `src/__stop_lint_probe.ts`), and the state file is back to `{"blocks":0}`. 2.6 (no hook effect in a human session) and 2.7 (`cc-status` still fires) are marked `[x]` against `f21e140`, but nothing in `decisions.md`, the commit messages or the log records how they were checked. The plan also asked for a human confirmation pause after each phase. The reviewer's re-run of the 1.3 pipe test covers the script half of 2.6 (the plan's allowed alternative). The `/hooks` listing and the 2.7 behaviour can't be verified from the diff.
- **Fix**: Have a human confirm 2.6 and 2.7 (open `/hooks` in this worktree; end a turn and watch `cc-status` update), then add one line of evidence to `decisions.md`.
- **Decision**: PENDING
