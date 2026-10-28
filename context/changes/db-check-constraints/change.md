---
change_id: db-check-constraints
title: Mirror app-only rules (past-date window, age floor, consent version) as DB check constraints
status: impl_reviewed
created: 2026-10-28
updated: 2026-10-28
archived_at: null
---

## Notes

Roadmap F-20 (M-03, backlog B-17): the app-only rules (past-date window, age floor, consent version), enforced today only in the API routes, are also database check constraints, covered by pgTAP. Owner Q-05 (2026-10-28) accepted the gap; this is hardening. Risks: the migration must be additive-first (CLAUDE.md hard rule; a Worker rollback never undoes a schema change), and existing production rows could violate a new constraint, so consider NOT VALID + a separate VALIDATE, or say why not; date rules relative to 'now' can't be plain CHECK constraints (immutable expressions only), so say which rules can and can't be mirrored; npm run db:types afterwards if types change; every DB step takes the shared DB lock (worker protocol). No service_role grants.
