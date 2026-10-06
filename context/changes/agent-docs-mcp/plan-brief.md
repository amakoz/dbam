# Agent Docs MCP (Context7) — Plan Brief

> Full plan: `context/changes/agent-docs-mcp/plan.md`
> Research: `context/changes/agent-docs-mcp/research.md`

## What & Why

Agents running the 10x chain (especially Herdr workers on S-06/S-07) answer library questions from memory. This change registers the Context7 MCP server for the repo, so `/10x-research` and `/10x-plan` can pull current Astro, Supabase, Cloudflare Workers, Tailwind and React docs. The setup must not stall auto-mode workers on an approval dialog, and it holds no secrets.

## Starting Point

There's no `.mcp.json` today. `.claude/settings.json` holds only the Stop hook. Workers start as interactive `--permission-mode auto` sessions, and the spawn script auto-accepts only the folder-trust prompt. CLAUDE.md mentions Context7 only in the lesson section, with a stale tool name (`get-library-docs`).

## Desired End State

Every session in the repo, worker worktrees included, starts with `context7` connected and no dialog. `claude mcp list` shows `✔ Connected`, and a `claude -p` session can call `resolve-library-id`. CLAUDE.md tells agents to use Context7 for library API questions, and README explains approval and opt-out.

## Key Decisions Made

| Decision     | Choice                                                               | Why (1 sentence)                                                                                                    | Source                  |
| ------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Transport    | Remote HTTP `https://mcp.context7.com/mcp`                           | No npx/Node process per worker; connects without a key.                                                             | Research / orchestrator |
| API key      | None in the repo                                                     | Key only raises rate limits; if needed later, it goes in user/local scope.                                          | Research / orchestrator |
| Approval     | `enabledMcpjsonServers: ["context7"]` in `.claude/settings.json`     | Honored in trusted worktrees (tested Pending → Connected); doesn't auto-approve future servers.                     | Research / orchestrator |
| Guidance     | CLAUDE.md paragraph after line 33 + fix line 86 to `query-docs`      | Line 33 is where worker tooling is described; line 86 is wrong today.                                               | Research / orchestrator |
| Verification | `claude mcp list` + one `claude -p` tool call; pane spawn post-merge | `-p` skips approval, so `mcp list` checks approval and `-p` checks the server; a pane spawn needs the orchestrator. | Orchestrator            |
| Human docs   | README subsection next to "Agent Stop hook"                          | Keeps setup, opt-out and key guidance where the Stop hook is documented.                                            | Plan                    |
| Phases       | One phase                                                            | Four small config/doc edits that only work together.                                                                | Plan                    |

## Scope

**In scope:**

- New `.mcp.json` (context7, HTTP, keyless)
- `enabledMcpjsonServers` in `.claude/settings.json`
- CLAUDE.md usage paragraph + tool-name fix
- README subsection

**Out of scope:**

- API key or env-var header
- `enableAllProjectMcpServers`
- `permissions.allow` for `mcp__context7`
- `spawn-worker.sh` or skill edits
- roadmap status change
- a real Herdr pane spawn (orchestrator, post-merge)

## Architecture / Approach

`.mcp.json` declares the server, and the committed settings key approves it by name. Claude Code applies that approval once the folder is trusted, and worktrees inherit the main checkout's trust. Auto-mode workers therefore connect at startup without a dialog. CLAUDE.md steers agents to `resolve-library-id` → `query-docs` during research and planning.

## Phases at a Glance

| Phase                                      | What it delivers                                                | Key risk                                                                              |
| ------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1. Register, approve and document Context7 | Connected server, no dialog, agent + human docs, verified calls | Name mismatch between `.mcp.json` key and approval leaves workers on a pending dialog |

**Prerequisites:** the main checkout is trusted in Claude Code on the machine (true here); network access to `mcp.context7.com`.
**Estimated effort:** ~1 short session, 1 phase.

## Open Risks & Assumptions

- Keyless rate limits could throttle parallel workers. Mitigation: a user-scope key (roadmap Unknowns, owner: user).
- On a machine that never trusted the main checkout, the first interactive run shows the trust dialog; after that, the approval applies.
- `claude mcp list` stands in for the pane startup path until the orchestrator's post-merge spawn check.

## Success Criteria (Summary)

- A worker spawned after merge starts with no MCP dialog and `/mcp` shows context7 connected.
- Agents can resolve and query library docs in research and plan sessions.
- No secret ever lands in `.mcp.json`.
