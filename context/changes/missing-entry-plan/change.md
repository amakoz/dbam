---
change_id: missing-entry-plan
title: Keep a plan's screening and completion visible when its catalog entry is missing
status: implementing
created: 2026-10-28
updated: 2026-10-28
archived_at: null
---

## Notes

roadmap S-10 (M-03 north star): a user whose plan's catalog entry is missing still sees that screening and its completion; a user's plan must never disappear (owner-confirmed bug, backlog B-04). Today partitionDashboard skips a plan whose catalog entry is missing, but planned is built from all plans (src/lib/screenings/rules.ts:257), so such a plan still hides that screening's tier item (:271) and its completion (:263). F-08 pinned the current behaviour; its test expectation must change. Source: context/archive/2026-10-06-recurrence-unit-tests/follow-ups/missing-entry-plan.md, drift notes in context/domain/domain-distillation.md. Risks: dashboard rendering of an entry with no catalog row (what label/tier it shows), retired vs deleted entries, no diagnosis wording.
