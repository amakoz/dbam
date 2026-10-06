# Agent Docs MCP (Context7) Implementation Plan

## Overview

Register the Context7 MCP server in a committed `.mcp.json` and pre-approve it in the committed `.claude/settings.json`. Every Claude Code session in the repo, Herdr worker worktrees included, can then query current Astro, Supabase, Cloudflare Workers, Tailwind and React docs during `/10x-research` and `/10x-plan` without an approval dialog. CLAUDE.md tells agents when to use it. Roadmap F-04.

## Current State Analysis

- No `.mcp.json` exists in the repo. `.claude/settings.json:1-11` holds only the Stop hook.
- Herdr workers are interactive sessions started with `--permission-mode auto` (`.claude/skills/dbam-orchestrate/scripts/spawn-worker.sh:59-61`). Auto mode is not one of the documented exemptions from the `.mcp.json` approval prompt. The spawn script dismisses only a dialog containing "trust" (`spawn-worker.sh:68`), so an unapproved server could block worker startup (research.md §1).
- CLAUDE.md names Context7 only in the 10xDevs lesson section. The Task Router row (`CLAUDE.md:86`) uses a stale tool name, `get-library-docs`; the current tool is `query-docs` (research.md §3).

## Desired End State

- `.mcp.json` declares a single server `context7` → `{"type": "http", "url": "https://mcp.context7.com/mcp"}`, with no headers, keys or env references.
- `.claude/settings.json` adds `"enabledMcpjsonServers": ["context7"]` next to the unchanged Stop hook, and does not set `enableAllProjectMcpServers`.
- In this worktree, `claude mcp list` reports `context7 … ✔ Connected`, and a fresh `claude -p` session can call `resolve-library-id`.
- CLAUDE.md tells agents when to use Context7 and names the current tools. README documents the setup for humans next to "Agent Stop hook".

### Key Discoveries:

- A committed `enabledMcpjsonServers` is honored only in a trusted workspace. Worktrees use the main checkout's trust, and the main checkout is trusted on this machine (research.md §1). Tested: `⏸ Pending approval` → `✔ Connected`.
- The keyless remote HTTP server connects. A key only raises rate limits (Context7 README:47; `context/foundation/roadmap.md:142`).
- Tools exposed to Claude: `mcp__context7__resolve-library-id` and `mcp__context7__query-docs` (Context7 README:108,111).
- lint-staged runs `prettier --write` on `*.{json,md}`, so the new JSON and the edited table get formatted at commit (CLAUDE.md:35).

## What We're NOT Doing

- No Context7 API key, `${VAR}` header or user-scope override. Keyless until rate limits bite (roadmap Unknowns, owner: user).
- No `enableAllProjectMcpServers`. A future `.mcp.json` entry must be named explicitly.
- No `permissions.allow` rule for `mcp__context7`. Workers run in auto mode. Human manual-mode sessions get the normal per-tool prompt.
- No changes to `spawn-worker.sh`, the 10x skills (symlinked, untracked) or `roadmap.md` status (orchestrator instruction).
- No Herdr pane spawn by the worker. The pane checks belong to the orchestrator (impl-review spawn first, post-merge impl spawn second), listed under the PR's Manual checks.

## Implementation Approach

A single phase. The edits are three small config/doc edits that ship and verify together: the server only becomes useful once both the declaration and the approval exist. The guidance text documents both.

## Critical Implementation Details

- **Approval is name-bound.** The `enabledMcpjsonServers` entry must match the `.mcp.json` key exactly (`context7`). If they differ, the server silently stays `⏸ Pending approval` in interactive sessions and blocks workers.
- **`claude -p` proves the server works, not the approval.** `-p` sessions load `.mcp.json` servers without asking (code.claude.com/docs/en/mcp, Project scope), so the approval check is `claude mcp list`. In `-p` a tool call that needs permission is denied, so pass `--allowedTools mcp__context7__resolve-library-id` explicitly.

## Phase 1: Register, approve and document Context7

### Overview

Add `.mcp.json`, approve the server in `.claude/settings.json`, document it in CLAUDE.md and README.md, and verify the connection and a tool call.

### Changes Required:

#### 1. Project MCP config

**File**: `.mcp.json` (new, repo root)

**Intent**: Register Context7's remote server for every Claude Code session in the repo, with no secrets.

**Contract**: `{ "mcpServers": { "context7": { "type": "http", "url": "https://mcp.context7.com/mcp" } } }`, as formatted by Prettier. No `headers`, `env` or `${…}` references.

#### 2. Committed approval

**File**: `.claude/settings.json`

**Intent**: Pre-approve exactly the `context7` server so interactive auto-mode workers in trusted worktrees don't stop on the `.mcp.json` approval dialog.

**Contract**: Add the top-level key `"enabledMcpjsonServers": ["context7"]`. `hooks.Stop` stays byte-identical in content. `enableAllProjectMcpServers` stays absent.

#### 3. Agent guidance

**File**: `CLAUDE.md`

**Intent**: Tell agents when to reach for Context7, and fix the stale tool name.

**Contract**:

- After the worker Stop-hook paragraph (`CLAUDE.md:33`), add one paragraph:
  - The Context7 MCP server (`.mcp.json`, approved by `enabledMcpjsonServers` in `.claude/settings.json`) serves current library docs.
  - In `/10x-research` and `/10x-plan`, use `resolve-library-id` → `query-docs` before relying on memory for Astro, Supabase (`@supabase/ssr`, CLI), Cloudflare Workers/Wrangler, Tailwind 4, React 19 or shadcn/ui APIs.
  - Cite the library ID in the research or plan.
  - Keyless. Never add a key to `.mcp.json`.
  - If Context7 errors or rate-limits, fall back to web docs or memory and note "Context7 unavailable" in the research or plan instead of retrying.
  - Keep the existing sentence ".claude/settings.json is the only tracked file under .claude/" true. `.mcp.json` lives at the repo root.
- In the Task Router (`CLAUDE.md:86`), change `get-library-docs` to `query-docs`. Let Prettier realign the table.

#### 4. Human docs

**File**: `README.md`

**Intent**: Explain the setup next to the existing "Agent Stop hook" section (`README.md:68-70`).

**Contract**: A new `### Agent docs MCP (Context7)` subsection directly after "Agent Stop hook", 2–4 sentences:

- what `.mcp.json` registers;
- that the committed `enabledMcpjsonServers` approval applies once the folder is trusted (worktrees inherit the main checkout's trust);
- how to opt out (`disabledMcpjsonServers` in your user or local settings);
- that an optional API key, if ever needed, goes in user/local scope, never the repo.

### Success Criteria:

#### Automated Verification:

- `.mcp.json` declares exactly the keyless HTTP server: `jq -e '.mcpServers == {"context7":{"type":"http","url":"https://mcp.context7.com/mcp"}}' .mcp.json`
- No secret-shaped content in `.mcp.json`: `! grep -Eiq 'authorization|bearer|api[_-]?key|token|\$\{' .mcp.json`
- Settings approve only context7 and keep the Stop hook: `jq -e '.enabledMcpjsonServers == ["context7"] and (has("enableAllProjectMcpServers") | not) and (.hooks.Stop | length == 1)' .claude/settings.json`
- Approval resolves in this worktree: `claude mcp list` prints a `context7:` line containing `✔ Connected`
- A fresh non-interactive session can call the tool: `DBAM_CHANGE= claude -p "Call the context7 resolve-library-id tool for 'astro' and reply with only the top library ID" --allowedTools mcp__context7__resolve-library-id --output-format json | jq -e '.is_error == false and (.result | test("/[a-z0-9._-]+/[a-z0-9._-]+"))'` exits 0
- CLAUDE.md names the current tool and the new guidance: `! grep -q get-library-docs CLAUDE.md && grep -q 'query-docs' CLAUDE.md && grep -q 'enabledMcpjsonServers' CLAUDE.md`
- Formatting is clean: `npx prettier --check .mcp.json .claude/settings.json CLAUDE.md README.md`

#### Manual Verification:

- PR description lists, under "Manual checks", two orchestrator pane checks:
  - First, pre-merge: the impl-review pane (`spawn-worker.sh review`, a fresh `--permission-mode auto` pane in this feature worktree, started after implementation) reaches idle with no MCP approval dialog, and `/mcp` in that pane shows `context7` connected.
  - Second, post-merge: the next `spawn-worker.sh impl` worker shows the same.

**Implementation Note**: The manual item is the orchestrator's pane checks (impl-review spawn, then post-merge impl spawn). The worker records it in the PR and does not block on it.

---

## Testing Strategy

### Unit Tests:

- None. The change is config and docs only, with no code paths.

### Integration Tests:

- `claude mcp list` (approval path, the same approval sources as interactive startup) and `claude -p` + `resolve-library-id` (server reachable, tools callable) in this worktree.

### Manual Testing Steps:

1. Pre-merge (first check): the orchestrator spawns the impl-review pane (`spawn-worker.sh review`) in this feature worktree and watches it start: no "New MCP server found in .mcp.json" dialog, the agent reaches idle, and `/mcp` lists `context7` as connected.
2. Post-merge (second check): the next `spawn-worker.sh impl` worker shows the same.

## Performance Considerations

The remote HTTP transport adds no local process per session. MCP tools are deferred behind tool search, so the context cost at session start is limited to tool names (code.claude.com/docs/en/mcp, tool search).

## Migration Notes

None. Rollback is to delete `.mcp.json` and the settings key. If a pane blocks on the MCP dialog after merge, the orchestrator or a human reverts on `main` directly, not through a worker, because worker spawns would block too. A user who wants it off can add `disabledMcpjsonServers: ["context7"]` in user or local settings.

## References

- Related research: `context/changes/agent-docs-mcp/research.md`
- Decisions: `context/changes/agent-docs-mcp/decisions.md`
- Worker launch: `.claude/skills/dbam-orchestrate/scripts/spawn-worker.sh:55-75`
- Similar committed agent tooling: `context/archive/2026-10-05-agent-stop-hook/`, `README.md:68-70`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Register, approve and document Context7

#### Automated

- [ ] 1.1 `.mcp.json` declares exactly the keyless HTTP server
- [ ] 1.2 No secret-shaped content in `.mcp.json`
- [ ] 1.3 Settings approve only context7 and keep the Stop hook
- [ ] 1.4 Approval resolves in this worktree (`claude mcp list` → `✔ Connected`)
- [ ] 1.5 A fresh non-interactive session can call `resolve-library-id`
- [ ] 1.6 CLAUDE.md names the current tool and the new guidance
- [ ] 1.7 Formatting is clean (Prettier check)

#### Manual

- [ ] 1.8 PR lists the orchestrator's pane checks (impl-review spawn first, post-merge impl spawn second) under Manual checks
