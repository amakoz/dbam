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
