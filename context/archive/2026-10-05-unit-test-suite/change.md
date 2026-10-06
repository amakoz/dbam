---
change_id: unit-test-suite
title: Vitest unit-test suite in CI covering catalog eligibility, tier and interval rules
status: archived
created: 2026-10-05
updated: 2026-10-06
archived_at: 2026-10-06T05:23:20Z
---

## Notes

(foundation) a unit-test runner (Vitest) runs in CI and covers the catalog eligibility, tier and interval rules (src/lib/catalog/recommend.ts, wording.ts). Roadmap F-03; PRD refs: FR-004, FR-009, NFR (testing). First cases are listed in context/archive/_screening-recommendations_/plan.md §Testing Strategy (S-02 shipped the rule engine without unit tests). Prerequisite S-02 is done.

PR description must link `context/changes/unit-test-suite/follow-ups/recurrence-tests.md`: S-05 recurrence logic (`rules.ts`, `format.ts` `describeLastDone`) stays untested after F-03, and whether it becomes a roadmap item is a human decision (impl-review F1).
