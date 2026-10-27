---
change_id: reminders-research
title: Trace the reminder pipeline end to end with coverage gaps and AST-checked debt
status: preparing
created: 2026-10-27
updated: 2026-10-27
archived_at: null
---

## Notes

Roadmap M-02 F-12 (PRD MS-04): (foundation) the reminder pipeline (scheduled run -> candidate selection -> send chain -> email, across appointment reminders, due-screening reminders and nudges) is traced end to end with the map (context/map/repo-map.md + context/map/evidence/) as input, with test-coverage gaps, blast radius and a technical-debt section whose structural claims are confirmed or refuted by AST queries. Unlocks F-13 (a guard-first refactoring plan for one debt item) and F-15. Risk: research-only, it must not drift into fixing what it finds.
