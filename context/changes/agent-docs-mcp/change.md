---
change_id: agent-docs-mcp
title: Committed .mcp.json registers Context7 so agent sessions can query current library docs
status: plan_reviewed
created: 2026-10-06
updated: 2026-10-06
archived_at: null
---

## Notes

(foundation) a committed .mcp.json registers the Context7 MCP server, so every Claude Code session and worker worktree can pull current Astro, Supabase, Cloudflare Workers and Tailwind docs during /10x-research and /10x-plan; CLAUDE.md tells agents when to use it. Roadmap F-04; PRD refs: none. Unlocks research quality for S-06, S-07. Risk: low; project-scoped MCP servers need a one-time approval per machine (check how that interacts with Herdr worker sessions started with --permission-mode auto, which must not block on an approval dialog); no secrets in .mcp.json.
