-- B-18 validate-consent: validate the consent version check that F-20 left NOT VALID, so every row, old and new, is
-- guaranteed to match the version format. This supersedes the comments in 20261028131057_app_rule_checks.sql (lines
-- 23-27 and 148) that still call the check NOT VALID.
--
-- Safe now: since F-20 reached production (#106, 2026-10-28) the check refuses every new malformed consent_version
-- for all roles, and the owner's read-only production query found zero older ones on 2026-10-29. VALIDATE fails
-- (23514) and so fails the CI `migrate` job only if the constraint was dropped or altered by hand in production; the
-- remedy is in context/archive/2026-10-28-db-check-constraints/follow-ups/validate-consent.md. It takes only a
-- SHARE UPDATE EXCLUSIVE lock, so reads and row writes continue. Additive: a Worker rollback is unaffected.

alter table public.health_data_consents validate constraint health_data_consents_version_format;
