---
date: 2026-10-06T17:34:35+0200
researcher: Claude (Opus 5.5), worker agent-docs-mcp
git_commit: d15e717d7b046c0e7cf369b6e5b927cfc7944525
branch: feat/agent-docs-mcp
repository: 10xdevs (Dbam)
topic: "Context7 MCP via committed .mcp.json: approval in Herdr auto-mode workers, server config, CLAUDE.md placement"
tags: [research, mcp, context7, claude-settings, herdr, claude-md]
status: complete
last_updated: 2026-10-06
last_updated_by: Claude (Opus 5.5), worker agent-docs-mcp
---

# Research: Context7 MCP via committed `.mcp.json`

**Date**: 2026-10-06T17:34:35+0200
**Researcher**: Claude (Opus 5.5), worker agent-docs-mcp
**Git Commit**: d15e717
**Branch**: feat/agent-docs-mcp
**Repository**: 10xdevs (Dbam)

## Research Question

1. How does project-scoped MCP approval (`.mcp.json`) behave for Claude Code sessions started with `--permission-mode auto` in Herdr worker panes, and does `enableAllProjectMcpServers` / `enabledMcpjsonServers` in the committed `.claude/settings.json` avoid a blocking dialog?
2. Which Context7 MCP server package and transport should we use, and does it need an API key? No secrets may go in `.mcp.json`.
3. Where should CLAUDE.md tell agents to use it?

Scope: 3 files (`.mcp.json` (new), `.claude/settings.json`, `CLAUDE.md`). The scope fits in ≤ 3 modules, so I ran no sub-agents. Everything was investigated locally plus external docs.

## Summary

- **(1)** Herdr workers are **interactive** sessions: `spawn-worker.sh` starts `claude` in a pane with `--permission-mode auto` and no `-p` (`.claude/skills/dbam-orchestrate/scripts/spawn-worker.sh:59-61`). The docs exempt two cases from the `.mcp.json` approval prompt: `-p`/SDK/cloud sessions, and `bypassPermissions` with `skipDangerousModePermissionPrompt`. Auto mode is not on that list (code.claude.com/docs/en/mcp, "Project scope"). So without pre-approval, a worker would show the prompt, and the spawn script dismisses only a dialog whose text contains "trust" (`spawn-worker.sh:68`). A committed `enabledMcpjsonServers: ["context7"]` (scope "Any file") is honored **once the workspace is trusted**. It is ignored in an untrusted folder. Trust in a git worktree is keyed on the main checkout's root (docs/en/permissions, "Project allow rules and workspace trust"). On this machine the main checkout `/Users/amadeuszkozlowski/Documents/10xdevs` has `hasTrustDialogAccepted: true`, and the worktree has no entry of its own in `~/.claude.json`. **Verified empirically in this worktree:** with a temporary `.mcp.json` alone, `claude mcp list` reported `⏸ Pending approval`. With `enabledMcpjsonServers: ["context7"]` added to `.claude/settings.json`, it reported `✔ Connected`. Both files were reverted afterwards.
- **(2)** Use Context7's **remote HTTP** server, `https://mcp.context7.com/mcp` (`"type": "http"`), with no headers. That way there's no npx/Node process per session and nothing to pin. An API key is optional: the README "recommends" a free key for higher rate limits and passes it as `Authorization: Bearer <key>`. The empirical `✔ Connected` above used no key. The alternative is the stdio npm package `@upstash/context7-mcp` (4.1.1 on npm today). The server exposes the tools `resolve-library-id` and `query-docs`.
- **(3)** CLAUDE.md already mentions Context7 in the lesson section. The Task Router row (`CLAUDE.md:86`) names a stale tool, `get-library-docs`; the current name is `query-docs`. Add one operational bullet beside the worker-tooling paragraph (`CLAUDE.md:33`): "Context7 is registered in `.mcp.json`; use it in `/10x-research` and `/10x-plan` for Astro / Supabase / Cloudflare Workers / Tailwind / React API questions before relying on memory." Also fix the tool name on line 86.

## Detailed Findings

### 1. Approval behaviour for Herdr auto-mode workers

- **Workers are interactive TUI sessions.** `start_agent()` runs `herdr agent start … --kind claude -- --model … --effort high --permission-mode auto --append-system-prompt-file … --disallowedTools=AskUserQuestion -n <name>` (`spawn-worker.sh:55-61`). There's no `-p`, so the "non-interactive loads without asking" exemption does not apply.
- **Prompt exemptions are an explicit, listed set.** The MCP docs say Claude Code "prompts for approval in interactive sessions before using project-scoped servers from `.mcp.json`". It skips the prompt in `-p` runs, Agent SDK sessions, cloud sessions, and "a session you start in `bypassPermissions` mode with `skipDangerousModePermissionPrompt`" (code.claude.com/docs/en/mcp.md, Project scope). Auto mode is not named. Inference: an auto-mode worker gets the prompt unless the server is already approved.
- **The spawn script handles only the trust dialog.** If the visible pane contains "trust", the script sends Enter once (`spawn-worker.sh:67-71`). Otherwise it calls `die "agent $name not ready"`. An MCP approval dialog doesn't contain "trust" (inference from the docs' wording, not reproduced in a pane). It would therefore either fail the spawn or leave the worker blocked at startup.
- **The committed approval keys work, but only after trust.** `enableAllProjectMcpServers` and `enabledMcpjsonServers` have Scope "Any file" (docs/en/settings-reference). The MCP docs, section "Project server approvals and workspace trust", say: "A cloned repository can't approve its own servers: `enableAllProjectMcpServers` or `enabledMcpjsonServers` committed to the project's `.claude/settings.json` is ignored in an untrusted folder". The permissions docs table agrees, for the "trusted only a parent folder" column: "The repository's own approvals don't count".
- **Worktrees inherit the main checkout's trust.** "In a worktree, it uses the main checkout's root" (docs/en/permissions.md:685). `git worktree list` shows that `~/.herdr/worktrees/10xdevs/feat-*` are worktrees of `/Users/amadeuszkozlowski/Documents/10xdevs`. In `~/.claude.json`, that root has `hasTrustDialogAccepted: true`, `enabledMcpjsonServers: []`, `disabledMcpjsonServers: []`, and no worktree-path entries.
- **Empirical check (this worktree, Claude Code 2.1.291):**
  - Case A, `.mcp.json` only: `context7: https://mcp.context7.com/mcp (HTTP) - ⏸ Pending approval (run \`claude\` to approve)`.
  - Case B, plus `"enabledMcpjsonServers": ["context7"]` in `.claude/settings.json`: `context7: … (HTTP) - ✔ Connected`.
  - I reverted both files with `git checkout -- .claude/settings.json; rm .mcp.json`, and the status was clean afterwards.
  - Limitation: `claude mcp list` is a proxy for the TUI startup path, not a Herdr pane spawn. The docs say `mcp list` reads the same approval sources.
- **`enabledMcpjsonServers` vs `enableAllProjectMcpServers`.** The named list approves only `context7`. A server added to `.mcp.json` later stays pending until someone names it in the list. `enableAllProjectMcpServers: true` would auto-approve any future `.mcp.json` entry from a PR. Recommendation: use the named list.
- **Tool calls in auto mode.** The docs have one passage about tools that prompt on every call even in `auto`: those flagged `anthropic/requiresUserInteraction`. Context7's read-only tools are not described as flagged. In auto mode a classifier reviews the other actions. Optional: `permissions.allow: ["mcp__context7"]` (allow rules wait for trust; syntax in docs/en/permissions.md:514) would also skip prompts in manual-mode human sessions. Not required for workers.
- **New machine / fresh clone.** The first interactive `claude` run shows the trust dialog. After acceptance, the committed approval applies. This is the "one-time approval per machine" from the roadmap risk. It collapses into the trust step the user already does, so no separate MCP dialog appears.

### 2. Context7 server

- **Remote HTTP (recommended):** URL `https://mcp.context7.com/mcp`. Manual config: "use the Context7 server URL … and pass your API key via the `Authorization: Bearer YOUR_API_KEY` header" (upstash/context7 README.md:59).
- **Key is optional:** "API Key Recommended: Get a free API key at context7.com/dashboard for higher rate limits" (README.md:47). The keyless connect succeeded in the empirical check. The roadmap already records "add a key only if limits bite (stored outside the repo)" (`context/foundation/roadmap.md:142`).
- **If a key is ever needed without a secret in git:**
  - Option 1: `.mcp.json` supports `${VAR}` / `${VAR:-default}` expansion in `url` and `headers` (docs/en/mcp, env-var expansion). Note: Claude Code strips credential-looking env names in some helper contexts; the docs list the exact names read as empty in remote `url`/`headers`, which are `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `AWS_BEARER_TOKEN_BEDROCK`, `HTTPS_PROXY`, `NPM_TOKEN`. A custom name like `CONTEXT7_API_KEY` is not on that list.
  - Option 2: override the server at user/local scope with the key, outside the repo.
  - Out of scope now.
- **Local stdio alternative:** npm `@upstash/context7-mcp` (README.md:126; `npm view` → 4.1.1). It costs an `npx` download and a Node process per session, and every worker spawns its own. HTTP avoids both.
- **Tools:** `resolve-library-id` and `query-docs` (README.md:108, 111).

### 3. CLAUDE.md placement

- `CLAUDE.md:33` is the paragraph describing worker tooling wired in `.claude/settings.json` (the Stop hook) and ending ".claude/settings.json is the only tracked file under `.claude/`". It's the natural home for a "Context7 MCP (`.mcp.json`, pre-approved via `enabledMcpjsonServers`)" bullet that says when to use it.
- `CLAUDE.md:73,86,95` (10xDevs lesson section) already name Context7 as the external-research tool. Line 86 says `resolve-library-id` → `get-library-docs`; the current tool is `query-docs` (README.md:111).
- The 10x skills (`.claude/skills` is a symlink to the main checkout and gitignored, `.gitignore:30-32`) don't mention Context7 (grep of `10x-research/SKILL.md` and `10x-plan/SKILL.md`). CLAUDE.md is the only tracked place to steer them.
- `.mcp.json` at the repo root is not gitignored (`git check-ignore` → not ignored). lint-staged runs `prettier --write` on `*.json`, so the file gets formatted at commit.

## Code References

- `.claude/skills/dbam-orchestrate/scripts/spawn-worker.sh:55-75` – `start_agent()`: interactive `--permission-mode auto` launch; auto-dismisses only a "trust" prompt
- `.claude/settings.json:1-11` – the committed settings today contain only the Stop hook; the approval key goes here
- `CLAUDE.md:33` – worker-tooling paragraph (placement for the new bullet)
- `CLAUDE.md:86` – Task Router row with the stale `get-library-docs` tool name
- `context/foundation/roadmap.md:132-145` – F-04 outcome, unknowns (keyless) and risk
- `.gitignore:30-32` – only `.claude/settings.json` is tracked under `.claude/`; `.mcp.json` is unaffected

## Architecture Insights

- Settings precedence: managed > `--settings` > `.claude/settings.local.json` > `.claude/settings.json` > user. Workers pass no `--settings` or `--setting-sources`, so the committed project file applies.
- A user's own `disabledMcpjsonServers: ["context7"]` (user or local scope) still rejects the server for that user. That's an acceptable opt-out.

## Historical Context (from prior changes)

- Not applicable. No prior change under `context/changes/**` or `context/archive/**` mentions `.mcp.json` or Context7 (grep, 2026-10-06). The closest precedent for committed agent tooling is `context/archive/2026-10-05-agent-stop-hook/` (Stop hook in `.claude/settings.json`).

## Related Research

- None.

## Open Questions

- Not reproduced: an actual Herdr pane spawn with the new files. Recommend that the implementation's verification step spawn (or start) one interactive session in a worktree and confirm `/mcp` shows context7 connected with no dialog. The fallback is `claude mcp list` → `✔ Connected`, as done here.
- Whether to add `permissions.allow: ["mcp__context7"]` for manual-mode human sessions is a plan choice, not required for workers.
