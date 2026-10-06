# Decisions: agent-docs-mcp

## 2026-10-06 Research: sub-agents

- Question: dispatch research sub-agents?
- Options: (a) none (b) up to 2
- Choice: (a). The change touches 3 files (`.mcp.json`, `.claude/settings.json`, `CLAUDE.md`), which is at or below the orchestrator's "≤ 3 modules → none" threshold.
- Evidence: research.md § Research Question (scope)
- Decided-by: worker

## 2026-10-06 Research: recommended approval key and transport (input to /10x-plan)

- Question: how do we pre-approve Context7 and which transport do we use?
- Options: `enabledMcpjsonServers: ["context7"]` vs `enableAllProjectMcpServers: true`; remote HTTP vs stdio `@upstash/context7-mcp`
- Choice (recommended, plan confirms): the named `enabledMcpjsonServers` list plus remote HTTP `https://mcp.context7.com/mcp` with no key. The named list doesn't auto-approve future `.mcp.json` entries, and HTTP needs no per-worker npx process.
- Evidence: research.md § Detailed Findings 1–2. Empirical check: Pending approval → Connected after adding the key.
- Decided-by: worker

## 2026-10-06 Plan: transport, key, approval, guidance, verification

- Question: settle the research recommendations for the plan
- Options: as in research.md §1–3
- Choice:
  - Remote HTTP `https://mcp.context7.com/mcp`, with no key in the repo.
  - Named `enabledMcpjsonServers: ["context7"]` in `.claude/settings.json`, not `enableAllProjectMcpServers`.
  - CLAUDE.md usage paragraph after line 33, plus the `query-docs` fix at line 86.
  - Verification by `claude mcp list` plus one fresh `claude -p` session calling `resolve-library-id`.
  - A real Herdr pane spawn is the orchestrator's post-merge check, listed under the PR's Manual checks.
  - roadmap.md status stays unchanged.
- Evidence: research.md; orchestrator pre-answers in the /10x-plan invocation
- Decided-by: orchestrator

## 2026-10-06 Plan: complexity, phases, README

- Question: complexity, question budget, phase split, extra docs
- Options: questions 0 vs more; 1 vs 2 phases; README section yes/no
- Choice: LOW complexity with 0 questions, because every solution decision is settled upstream. One phase. Add a README subsection next to "Agent Stop hook" (`README.md:68-70`) for humans.
- Evidence: plan.md § Implementation Approach
- Decided-by: worker

## 2026-10-06 Plan review: F1–F3

- Question: how to resolve plan-review.md F1 (pane check timing), F2 (Context7-unavailable fallback) and F3 (nested `claude -p` check)
- Options: accept or reject each finding
- Choice: accept all three.
  - F1: criterion 1.8 and the Manual Testing Steps name the impl-review pane spawn as the first pane check, and the post-merge impl spawn as the second. Migration Notes add a revert-on-`main` line.
  - F2: the CLAUDE.md paragraph gets a fallback clause: on error or rate limit, use web docs or memory and note "Context7 unavailable".
  - F3: 1.5 uses `DBAM_CHANGE= claude -p … --output-format json | jq -e`.
- Evidence: plan-review.md; `spawn-worker.sh:128-137` (review pane runs in the feature worktree)
- Decided-by: orchestrator

## 2026-10-06 Implement: roadmap flip and 1.8

- Question: flip roadmap F-04 during implement, given the plan-stage "don't change roadmap.md status"? And when can 1.8 be checked?
- Options: (a) flip to in-progress as /10x-implement and the worker protocol prescribe (b) leave it at ready
- Choice:
  - (a) at first. **Corrected by impl-review F1:** in this project the roadmap row is not flipped during implement. `roadmap.md` was restored from origin/main, so F-04 stays `ready` until `/10x-archive` sets `done`.
  - 1.8 stays unchecked until the PR body lists the orchestrator's pane checks, so change.md stays `implementing`.
- Evidence: 10x-implement "Roadmap status sync"; worker protocol "Git and commits"
- Decided-by: worker

## 2026-10-06 Impl review: report path and triage

- Question: where to write the impl-review report, and who triages
- Options: skill default `reviews/impl-review.md` vs orchestrator path `impl-review.md`; worker vs orchestrator triage
- Choice: `context/changes/agent-docs-mcp/impl-review.md`; findings left `PENDING` for the orchestrator. Pane check for 1.8 (first): context7 connected in the impl-review pane.
- Evidence: orchestrator prompt; impl-review.md § Success criteria evidence
- Decided-by: orchestrator

## 2026-10-06 Impl review triage: F1, F2, backlog

- Question: how to resolve impl-review.md F1 (roadmap flip) and F2 (approval scope wording), plus backlog hygiene
- Options: accept or reject each finding
- Choice:
  - F1 accepted: `roadmap.md` restored from origin/main during the rebase.
  - F2 accepted: CLAUDE.md now says "approved in trusted checkouts and their worktrees".
  - Backlog: B-08 (the orchestrator `wait` subcommand, done in the local skill) and B-10 (SHA write-back noise, fixed by the worker protocol) move to Done in `context/foundation/backlog.md`.
- Evidence: impl-review.md; research.md §1 (the committed approval is ignored in untrusted folders)
- Decided-by: orchestrator

## 2026-10-06 Archive: warnings acknowledged

- Question: archive with /10x-archive's soft warnings open?
- Options: continue archiving, or resume implementation
- Choice: continue. The warnings:
  - (1) 1.8 is open (0 automated, 1 manual). It's a PR-stage row, and the PR body covers it with the reviewer-pane evidence and Manual checks.
  - (2) There is no `reviews/impl-review*.md`. The report is `impl-review.md` at the folder root, with "Reviewed phases: 1", so phase coverage is complete.
  - (3) The Progress SHAs (`1ac45cc`) aren't on origin/main yet because the PR isn't open. There's no repoint.
- Evidence: /10x-archive preflight; `git merge-base --is-ancestor 1ac45cc origin/main` → 1
- Decided-by: orchestrator (standing instruction for PR-stage manual rows); worker for (2)–(3)
