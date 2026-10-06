---
change_id: recurrence-unit-tests
title: Unit tests for screening recurrence rules and last-done formatting
status: implementing
created: 2026-10-06
updated: 2026-10-06
archived_at: null
---

## Notes

(foundation) unit tests cover the recurrence rules in src/lib/screenings/rules.ts (nextDueMonth, addMonths/addYears, partitionDashboard, Warsaw midnight, Feb 29) and describeLastDone in src/lib/screenings/format.ts. Roadmap F-08; PRD refs: FR-008, FR-009, NFR (testing). Prerequisite F-03 (Vitest runner, merged in #77). Source cases: context/archive/2026-10-05-unit-test-suite/follow-ups/recurrence-tests.md and context/archive/2026-09-30-record-appointment-date/plan.md:430-439. Unlocks S-06.
