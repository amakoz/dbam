<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Agent Docs MCP (Context7) Implementation Plan

- **Plan**: context/changes/agent-docs-mcp/plan.md
- **Mode**: Quick
- **Date**: 2026-10-06
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | PASS    |

## Grounding

Paths 5/5 ✓ (`.claude/settings.json`, `CLAUDE.md:33` Stop-hook paragraph, `CLAUDE.md:86` `get-library-docs` row, `README.md:68-70` "Agent Stop hook", `spawn-worker.sh:55-75`). `.mcp.json` is absent as the plan says, and `.gitignore:31-32` doesn't ignore it. Symbols 3/3 ✓: lint-staged `*.{json,css,md}` → prettier, `jq` and `claude` are on PATH, and `npx prettier --check .claude/settings.json CLAUDE.md README.md` passes today. Brief↔plan ✓. Progress↔Phase ✓: 7 automated and 1 manual criterion map to 1.1–1.8. `docs/reference/contract-surfaces.md` is absent, so that check was skipped.

## Findings

### F1 — Pane-startup check deferred to post-merge although the pre-merge review spawn already exercises it

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 Manual Verification (1.8), Testing Strategy › Manual Testing Steps, Migration Notes
- **Detail**: The one unproven risk is that an interactive `--permission-mode auto` pane stops on an MCP approval dialog. `spawn-worker.sh:67-72` dismisses only a "trust" dialog and otherwise calls `die "agent … not ready"`. The plan pushes that check to after merge. But `spawn-worker.sh review` (lines 128-137) starts the reviewer pane in the same feature worktree (`--cwd "$path"`), with the same `start_agent … --permission-mode auto` path, before merge. The new `.mcp.json` and settings are already in the worktree at that point. If the approval fails after merge, every later `spawn-worker.sh impl` fails. The plan's rollback (delete `.mcp.json` plus the settings key) then needs a PR, and no worker can be spawned to make it. `claude mcp list` (1.4) stands in for this check but isn't the pane path. The research marks the dialog's wording as inference (research.md:42).
- **Fix**: Have 1.8 and Manual Testing Steps name the impl-review spawn as the first pane check. The orchestrator confirms that the reviewer pane reaches idle with no MCP dialog and that `/mcp` shows `context7` connected before merge. Keep the post-merge `impl` spawn as a second confirmation. Add one line to Migration Notes: if a pane blocks on the dialog, the orchestrator or a human reverts on `main` directly, not through a worker.
  - Strength: The exact startup path gets tested at no extra cost, before the failure can reach `main` and block the pipeline.
  - Tradeoff: The orchestrator has to look at the reviewer pane's startup, which is one extra observation in an existing step.
  - Confidence: HIGH — `spawn-worker.sh:132-137` shows the reviewer pane uses the feature worktree and `start_agent`.
  - Blind spot: Whether the orchestrator's review flow already captures a startup failure distinctly from other spawn errors.
- **Decision**: ACCEPTED — 1.8, Manual Testing Steps and Migration Notes updated (orchestrator)

### F2 — No guidance for when Context7 is unavailable or rate-limited

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 › Changes Required › 3. Agent guidance (CLAUDE.md paragraph)
- **Detail**: The plan runs keyless and accepts the risk of rate limits under parallel workers (plan-brief Open Risks). But the CLAUDE.md contract says only "use before relying on memory". An agent that gets a rate-limit or connection error has no stated fallback and may retry or stall. It also has no instruction to record that the docs lookup didn't happen.
- **Fix**: Add one clause to the CLAUDE.md paragraph: if Context7 errors or rate-limits, fall back to web docs or memory and note "Context7 unavailable" in the research or plan instead of retrying.
- **Decision**: ACCEPTED — fallback clause added to the CLAUDE.md contract (orchestrator)

### F3 — Nested `claude -p` check inherits the worker environment

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 Automated Verification (1.5)
- **Detail**: Criterion 1.5 runs `claude -p` from inside a worker session. That session inherits `DBAM_CHANGE`, so the Stop hook (`scripts/stop-lint.mjs`) also fires in the nested session. This is harmless, because the reply won't contain `STATUS: done`. The check also passes or fails on free-form LLM output ("prints an ID starting with /"), so a wordy reply could look like a failure even when the tool call succeeded.
- **Fix**: Add `--output-format json` and check the result with `jq` (for example, the result text matches `/^\/[a-z0-9-]+\/`), or say explicitly that the implementer judges the reply by eye. Optionally prefix the command with `DBAM_CHANGE=`.
- **Decision**: ACCEPTED — `--output-format json` + jq check, `DBAM_CHANGE=` prefix (orchestrator)
