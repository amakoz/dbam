---
change_id: reminders-runner
title: Run the three reminder jobs on one shared, tested claim-send-mark runner
status: impl_reviewed
created: 2026-10-28
updated: 2026-10-28
archived_at: null
---

## Notes

Roadmap F-16 (MS-01, M-03): implement the F-13 plan (archived as `reminders-refactor`, copied here as `plan.md` / `plan-brief.md`) so the three reminder jobs run on one shared, tested claim → send → mark runner. Ships as 7 PRs from this one change folder: PR A = phases 1+2, then one PR each for phases 3, 4, 5, 6, 7, 8. Risk: production reminder runs.
