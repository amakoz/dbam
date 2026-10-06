---
change_id: unit-test-suite
title: Vitest unit-test suite in CI covering catalog eligibility, tier and interval rules
status: impl_reviewed
created: 2026-10-05
updated: 2026-10-06
archived_at: null
---

## Notes

(foundation) a unit-test runner (Vitest) runs in CI and covers the catalog eligibility, tier and interval rules (src/lib/catalog/recommend.ts, wording.ts). Roadmap F-03; PRD refs: FR-004, FR-009, NFR (testing). First cases are listed in context/archive/_screening-recommendations_/plan.md §Testing Strategy (S-02 shipped the rule engine without unit tests). Prerequisite S-02 is done.
