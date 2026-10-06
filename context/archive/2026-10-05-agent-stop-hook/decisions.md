# Decisions: agent-stop-hook

## 2026-10-06 Plan complexity and question budget

- **Question:** Complexity level and interview budget for `/10x-plan`.
- **Options:** (a) LOW, 3 questions (b) higher (c) lower.
- **Choice:** (a) LOW, 3 questions.
- **Evidence:** `research.md` settles the gitignore pattern, script location, changed-file list, `astro sync` and errors-only.
- **Decided by:** orchestrator

## 2026-10-06 Which worker turns the hook checks

- **Question:** Check every Stop, or only some turns?
- **Options:** (a) only turns whose final `STATUS:` line is `done`, or that have no STATUS line; `question`, `blocked`, `failed` pass (b) every turn.
- **Choice:** (a).
- **Evidence:** `worker-protocol.md:15-21` defines `done` as complete and verified. Stop input `last_assistant_message` (code.claude.com/docs/en/hooks) gives the final text.
- **Decided by:** orchestrator

## 2026-10-06 Cap policy and reporting

- **Question:** How to cap consecutive blocks and report the release.
- **Options:**
  - (a) per-worktree consecutive-block counter, cap 3, reset on clean lint. The 3rd block says it is the last and points to `STATUS: failed — lint — <log path>`. The 4th stop passes with a `systemMessage`.
  - (b) one block per turn via `stop_hook_active`.
  - (c) as (a) with cap 5.
- **Choice:** (a).
- **Evidence:** `roadmap.md:167` ("pass after 3 consecutive blocks and report"). The built-in cap (8 blocks with no tool call between) does not bound a fix loop (hooks-guide). The orchestrator handles `failed` (`SKILL.md:63`).
- **Decided by:** orchestrator

## 2026-10-06 Reviewer panes

- **Question:** Reviewer panes also get `DBAM_CHANGE` (`spawn-worker.sh:123`). How should the hook treat them?
- **Options:** (a) the reason text tells a review-only session to report the errors as a finding (b) the hook skips `DBAM_ROLE=review` (c) both.
- **Choice:** (c). The orchestrator adds `DBAM_ROLE` to `spawn-worker.sh` outside this repo; this change must not touch that file.
- **Evidence:** research Open Question 1.
- **Decided by:** orchestrator

## 2026-10-06 Worker self-decisions approved

- **Question:** Approve the implementation decisions derived from research.
- **Choice:** approved:
  - lint changed files only (merge-base diff + untracked, deletions filtered);
  - run `npx astro sync` only when `.astro/types.d.ts` is missing;
  - errors only (`--quiet`);
  - fail open with a message when git or ESLint itself breaks;
  - write `.claude/settings.json` last, because the hook goes live mid-session.
- **Evidence:** `research.md` §4-§6.
- **Decided by:** orchestrator

## 2026-10-06 Phase split

- **Question:** Phase breakdown.
- **Choice:** two phases:
  1. `scripts/stop-lint.mjs`, verified by piping Stop-input JSON into it while no hook is wired;
  2. `.gitignore` + `.claude/settings.json` + docs, verified live in this worker session.
- **Evidence:** orchestrator said "your call". Phase 2 is the activation step, so it goes last.
- **Decided by:** worker

## 2026-10-06 Counter resets after the cap releases

- **Question:** After the 4th stop passes, what happens to the per-worktree counter? It persists across `restart`, which reuses the worktree (`spawn-worker.sh:132`).
- **Options:** (a) reset to 0 on release (b) keep it at the cap.
- **Choice:** (a). Otherwise a restarted fixer session (`SKILL.md:51`) would pass its first stop unchecked.
- **Decided by:** worker

## 2026-10-06 Plan review output location and triage

- **Question:** Where to save the plan review, and who triages it?
- **Choice:** save to `context/changes/agent-stop-hook/plan-review.md` (not the skill's default `reviews/plan-review.md`) and leave every finding `Decision: PENDING`.
- **Evidence:** orchestrator's `/10x-plan-review` arguments ("Write findings to …/plan-review.md, triage nothing yourself").
- **Decided by:** orchestrator

## 2026-10-06 Plan-review triage (plan-review.md F1-F6)

- **Question:** How to resolve the six plan-review findings.
- **Choice:**
  - **F1** ACCEPT Fix A: reset the counter to 0 whenever a non-`done` turn passes. 1.7 adds the step: after run 3, a `STATUS: failed` input prints nothing and leaves `blocks: 0`, and the next `done` blocks again as 1/3.
  - **F2** ACCEPT: 2.2 checks each ignored path separately (`git check-ignore -q` takes one path).
  - **F3** ACCEPT: `DBAM_ROLE` is already wired (`impl`/`review`, `spawn-worker.sh:110,128`). Update Current State, NOT Doing and the brief. Keep the review-only sentence in the block reason as a fallback for older panes.
  - **F4** ACCEPT: 2.6 runs in this worktree with `env -u DBAM_CHANGE -u DBAM_ROLE`, or as the pipe test plus a `/hooks` listing. 2.5 adds the `/hooks` + restart fallback.
  - **F5** ACCEPT: resolve the root from `CLAUDE_PROJECT_DIR` first, then input `cwd`, then `process.cwd()`. Test 1.8 sets the scratch repo via `CLAUDE_PROJECT_DIR`.
  - **F6** ACCEPT Fix A: run `node_modules/.bin/astro sync` (fail open if missing) when `.astro/types.d.ts` is missing or older than `astro.config.mjs`.
- **Evidence:** `context/changes/agent-stop-hook/plan-review.md`. The F3 lines were verified in `spawn-worker.sh`.
- **Decided by:** orchestrator

## 2026-10-06 Phase 1 execution mode and small implementation choices

- **Question:** How to run Phase 1 (the skill asks delegate vs in-context; `AskUserQuestion` is disabled for workers).
- **Choice:** implement in this context. It is one ~190-line file whose decision order was already fixed by the plan, so a subagent adds a re-read for no gain.
- **Also chosen (within plan intent):** an empty lintable list resets the counter to 0 like a clean lint; after a successful `astro sync` the script touches `.astro/types.d.ts` so the mtime check does not re-sync every run; ESLint and `astro sync` have 150 s / 90 s timeouts that fail open. **Correction (impl-review F2):** 150 + 90 = 240 s does not fit the hook's 180 s limit; they now share a 170 s budget (sync 60 s, ESLint the remainder), see "Implementation-review triage" below.
- **Decided by:** worker

## 2026-10-06 Implementation review output location and triage

- **Question:** Where to save the implementation review, and who triages it?
- **Choice:** save to `context/changes/agent-stop-hook/impl-review.md` (not the skill's default `reviews/impl-review.md`) and leave every finding `Decision: PENDING`. Verdict APPROVED: 1 warning (F1, cap release skips lint), 3 observations (F2-F4).
- **Evidence:** orchestrator's `/10x-impl-review` arguments ("Write the report to …/impl-review.md. Triage nothing yourself.").
- **Decided by:** orchestrator

## 2026-10-06 Implementation-review triage (impl-review.md F1-F4)

- **Question:** How to resolve the four implementation-review findings.
- **Choice:**
  - **F1** ACCEPT: move the cap check after the ESLint run. A clean lint resets the counter and passes silently; only a still-failing run at `blocks >= MAX_BLOCKS` releases with the "lint errors remain" `systemMessage`. The release turn costs one extra lint run. Pipe test added: fixed after block 3 → silent pass, `blocks: 0`.
  - **F2** ACCEPT: child timeouts share a 170 s budget measured from script start (`astro sync` 60 s, ESLint the remainder, minimum 1 s), so a slow run fails open with `stop-lint skipped:` before Claude Code's 180 s kill. `utimesSync` wrapped in try/catch. The 150 s / 90 s claim in "Phase 1 execution mode" is corrected.
  - **F3** ACCEPT: strip leading Markdown decoration (`*`, `_`, `` ` ``, `>`) before matching `STATUS:` (regex `STATUS_LINE`, also tolerates `**STATUS**:`). Pipe test added: `**STATUS:** question` with the probe present passes unlinted, `blocks: 0`.
  - **F4** ACCEPT: record the phase 2 worker's evidence (below) and hand the live checks to the human as PR Manual checks (`pr-notes.md`).
- **Evidence:** `context/changes/agent-stop-hook/impl-review.md`. Rerun after the fixes: Phase 1 pipe tests 1.3-1.8 plus the F1/F3 cases, 18/18 pass (worker state file backed up and restored to `{"blocks":0}`); `npm run lint`, `npx astro check` (0 errors) and `npm run build` pass.
- **Decided by:** orchestrator

## 2026-10-06 Evidence for manual checks 2.6 and 2.7

- **2.6 No hook effect in a human session:** the phase 2 worker ran a nested `claude -p` in this worktree with `DBAM_CHANGE` and `DBAM_ROLE` unset and the lint-error probe present. The run finished in ~6 s with no block; the Stop hook was registered and returned empty output (the env guard exited before linting).
- **2.7 `cc-status` still fires:** in the same nested runs the user's `cc-status` Stop hook fired on every stop, printing `Set status failed: No such session cc-status`, because the nested run is outside iTerm. It runs alongside the project hook; the status update itself was not observed.
- **Left for the human (PR Manual checks):** open `/hooks` in a live worker pane and watch a block land; confirm `cc-status` updates on a real turn end.
- **Decided by:** orchestrator
