# Follow-up: validate the consent version check

`supabase/migrations/20261028131057_app_rule_checks.sql` adds `health_data_consents_version_format`
(`consent_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(\.[0-9]+)?$'`) as `NOT VALID`: new rows are checked, rows already
in production are not scanned, so the CI `migrate` job cannot fail on them.

## Why it matters before the VALIDATE

A `NOT VALID` check is still evaluated on every UPDATE of an old row. `withdraw_health_data_consent` updates
`withdrawn_at` on the caller's active consent, so a malformed `consent_version` already in production would make
that user's withdrawal fail (`23514`, the whole function rolls back) until the row is rewritten. Such a row can
only come from a direct client write (Q-05) or a manual edit: the app has written only `2026-09-27`, `2026-09-28` and
`2026-09-30` (`git log -p src/lib/consent.ts`).

## 1. Owner: run the read-only query soon after merge

In the Supabase dashboard (production project) → SQL editor. Read-only; it changes nothing:

```sql
select consent_version, count(*)
from public.health_data_consents
where consent_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(\.[0-9]+)?$'
group by 1;
```

Expected: zero rows.

## 2. If it returns rows

Rewrite each offending version to the version the user most plausibly saw (the `HEALTH_DATA_CONSENT_VERSION` in
force at its `granted_at`), as `postgres` in the SQL editor, before that user withdraws and before the VALIDATE.
Decide this with the owner; consent rows are GDPR Art. 7(1) proof, so record the rewrite (id, old value, new value)
in the follow-up change.

## 3. Follow-up change: VALIDATE

Once the query returns zero rows, open a new change with one additive migration:

```sql
alter table public.health_data_consents validate constraint health_data_consents_version_format;
```

and flip the assertion in `supabase/tests/database/app_rules.test.sql` ("the consent version check is NOT VALID")
to `convalidated = true`. `VALIDATE` takes only a `SHARE UPDATE EXCLUSIVE` lock and fails the `migrate` job if a row
still violates the check, so run the query again right before merging it.

Tracked after archive by a one-line `context/foundation/backlog.md` entry added in this change's archive commit.
