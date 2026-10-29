---
change_id: validate-consent
title: Validate the consent version check left NOT VALID by F-20
status: archived
created: 2026-10-29
updated: 2026-10-29
archived_at: 2026-10-29T17:33:33Z
---

## Notes

Backlog B-18 (follow-up of F-20 db-check-constraints, PRD MS-07): validate the NOT VALID check health_data_consents_version_format with one additive migration (alter table public.health_data_consents validate constraint health_data_consents_version_format;) and flip the pgTAP assertion in supabase/tests/database/app_rules.test.sql ('the consent version check is NOT VALID') to convalidated = true. Source: context/archive/2026-10-28-db-check-constraints/follow-ups/validate-consent.md. Owner ran the read-only production query on 2026-10-29: zero rows, so no rewrite is needed. Risks: VALIDATE fails the CI migrate job if a row violates the check (none do; new rows have been checked since F-20).
