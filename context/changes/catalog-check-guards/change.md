---
change_id: catalog-check-guards
title: catalog:check refuses backward status moves and warns on overdue reviews
status: implemented
created: 2026-10-28
updated: 2026-10-28
archived_at: null
---

## Notes

— roadmap F-17 (M-03): catalog:check refuses backward status moves (draft → active → retired only; documented in catalog/README.md) and warns in CI on entries past next_review_due (flag to the owner only, never hide an entry from users). Backlog B-14 + B-15; owner answers Q-02 and Q-06 (2026-10-28); drift D-02 and D-08 in context/domain/domain-distillation.md. Today the snapshot upsert overwrites status with no transition check, so active → draft silently hides every user's plan and done record for that entry. Risks: how catalog:check knows an entry's previous status (committed snapshots / git history vs the DB), a CI warning that is visible but does not fail the build, 'now' passed as a parameter so the date rule is unit-testable, CLAUDE.md's 'never delete an entry' rule stays intact.
