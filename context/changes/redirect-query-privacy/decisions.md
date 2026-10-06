# Decisions: redirect-query-privacy

## 2026-10-06 Roadmap placement

- **Question:** where does backlog B-01 go?
- **Options:** roadmap foundation slice; stay in backlog.
- **Choice:** F-09 `redirect-query-privacy`, prerequisites none, PRD refs NFR (privacy), status `proposed`; B-01 moved to backlog Done with a pointer. Not added as a prerequisite of S-06/S-07 (listed under Unlocks only).
- **Evidence:** owner approval 2026-10-06 (orchestrator prompt); `context/foundation/backlog.md` B-01 (P1).
- **Decided-by:** orchestrator

## 2026-10-06 Research without sub-agents

- **Question:** dispatch research sub-agents?
- **Options:** up to 2; none.
- **Choice:** none. One grep over `src/` and `scripts/` located every redirect and query read; the rest was reading 6 files.
- **Evidence:** `research.md` scope paragraph.
- **Decided-by:** worker
