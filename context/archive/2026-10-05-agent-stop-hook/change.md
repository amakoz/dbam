---
change_id: agent-stop-hook
title: Stop hook that blocks worker turns until ESLint passes on changed files
status: archived
created: 2026-10-05
updated: 2026-10-06
archived_at: 2026-10-06T05:26:42Z
---

## Notes

(foundation) a committed .claude/settings.json (un-ignored in .gitignore) adds a Claude Code Stop hook that runs ESLint on the files changed against origin/main and blocks the turn from ending while errors remain, so worker agents fix lint before reporting done. The hook runs only in worker sessions (DBAM_CHANGE set), so interactive human sessions are not slowed. Roadmap F-06; PRD refs: NFR (testing). Risk: cap the hook (e.g. pass after 3 consecutive blocks and report) so it cannot trap an agent in a loop; keep it to changed files; un-ignoring .claude/settings.json must keep .claude/skills/ and local settings ignored.
