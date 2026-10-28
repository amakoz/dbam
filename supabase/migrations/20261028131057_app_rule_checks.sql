-- F-20 db-check-constraints: the database refuses what the API refuses. The date and age rules of POST /api/screenings
-- and POST /api/profile (`parsePlanForm`, `parseDoneForm`, `parseProfileForm`) and the consent version format were
-- enforced only in the API, so a client writing through PostgREST directly with its own session (Q-05) could store a
-- past appointment, a done month in the future or an under-18 profile. Additive only: a Worker rollback never undoes
-- a migration, and no Worker version sends a value these guards refuse (the rules are unchanged since they shipped).
--
-- Why triggers, not CHECK constraints: four rules depend on "today" (and one on profiles.birth_year). Postgres
-- accepts current_date in a CHECK but assumes the expression immutable, re-checks it on every UPDATE of the row and
-- on restore, so a plan that was valid when booked would turn invalid as its day passes, and passed plans exist by
-- design (confirm_screening_plan). These triggers check a value only when it is inserted or changed, so rows already
-- stored are never re-checked.
--
-- Scope: only the client roles (authenticated, anon) are checked, the Q-05 path. postgres, service_role and security
-- definer functions are trusted writers (the cron tests seed rows around a fake "today"). confirm_screening_plan is
-- security invoker, so its writes are checked like the API's.
--
-- Every bound is deliberately no stricter than the API, which stays the first line and maps any write error to
-- save_failed: an appointment may be from yesterday (the API's "today" can be a day behind if Warsaw midnight passes
-- between its check and the write) up to two years and a day ahead (Postgres turns 29 Feb + 2 years into 28 Feb, the
-- API into 1 Mar); age uses the Warsaw calendar year, never behind the Worker's year. Errors are check_violation
-- (23514) with a message naming the rule and no row values.
--
-- The consent version check is NOT VALID: new rows are checked, existing rows are not scanned, so `migrate` cannot fail
-- on production data. A NOT VALID check is still evaluated on every UPDATE of an old row, so a malformed
-- consent_version already in production would make that user's withdraw_health_data_consent fail (its UPDATE of
-- withdrawn_at re-checks the row) until the row is rewritten. The owner runs a read-only query after merge; the remedy
-- and the later VALIDATE are in context/archive/2026-10-28-db-check-constraints/follow-ups/validate-consent.md.

-- ---------------------------------------------------------------------------------------------------------------
-- Plans: appointment date from yesterday to two years and a day ahead (Warsaw)
-- ---------------------------------------------------------------------------------------------------------------

create function public.validate_screening_plan()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Europe/Warsaw')::date;
begin
  if current_user not in ('authenticated', 'anon') or new.appointment_date is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.appointment_date is not distinct from old.appointment_date then
    return new;
  end if;
  if new.appointment_date < today - 1 or new.appointment_date > (today + interval '2 years')::date + 1 then
    raise exception 'appointment_date is outside the planning window' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger screening_plans_validate_rules
  before insert or update of appointment_date on public.screening_plans
  for each row execute function public.validate_screening_plan();

-- ---------------------------------------------------------------------------------------------------------------
-- Done records: day not after today, month not after this month nor before January of the birth year (Warsaw)
-- ---------------------------------------------------------------------------------------------------------------

-- The day is checked first, so a later day is refused by its own rule even when it falls in next month. The trigger
-- name sorts after screening_completions_clear_stale_last_done_on and _set_updated_at, so it sees the final row.
-- The birth year is read under the caller's RLS (own profile); without a profile (never the case through the API,
-- which requires one) the lower bound is skipped.
create function public.validate_screening_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Europe/Warsaw')::date;
  birth smallint;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.last_done_on is not null
     and (tg_op = 'INSERT' or new.last_done_on is distinct from old.last_done_on)
     and new.last_done_on > today then
    raise exception 'last_done_on is after today' using errcode = 'check_violation';
  end if;

  if new.last_done_month is not null
     and (tg_op = 'INSERT' or new.last_done_month is distinct from old.last_done_month) then
    if new.last_done_month > date_trunc('month', today::timestamp)::date then
      raise exception 'last_done_month is after the current month' using errcode = 'check_violation';
    end if;
    select p.birth_year into birth from public.profiles p where p.user_id = new.user_id;
    if birth is not null and new.last_done_month < make_date(birth, 1, 1) then
      raise exception 'last_done_month is before the birth year' using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger screening_completions_validate_rules
  before insert or update of last_done_month, last_done_on on public.screening_completions
  for each row execute function public.validate_screening_completion();

-- ---------------------------------------------------------------------------------------------------------------
-- Profiles: 18 or older, and years smoked plus years since quitting within the age (Warsaw year)
-- ---------------------------------------------------------------------------------------------------------------

-- Age is by calendar year only, as in the API (`currentYear - birth_year`). The reminder toggle updates other
-- columns, so it never fires this trigger.
create function public.validate_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  years_old int := extract(year from now() at time zone 'Europe/Warsaw')::int - new.birth_year;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.birth_year is not distinct from old.birth_year
     and new.smoking_years is not distinct from old.smoking_years
     and new.years_since_quitting is not distinct from old.years_since_quitting then
    return new;
  end if;
  if years_old < 18 then
    raise exception 'birth_year is below the minimum age' using errcode = 'check_violation';
  end if;
  if coalesce(new.smoking_years, 0) + coalesce(new.years_since_quitting, 0) > years_old then
    raise exception 'smoking years exceed the age' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger profiles_validate_rules
  before insert or update of birth_year, smoking_years, years_since_quitting on public.profiles
  for each row execute function public.validate_profile();

-- Trigger functions run when their trigger fires whatever the writer's EXECUTE privilege; nobody calls them directly.
revoke execute on function public.validate_screening_plan() from public, anon, authenticated, service_role;
revoke execute on function public.validate_screening_completion() from public, anon, authenticated, service_role;
revoke execute on function public.validate_profile() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Consent version: the format of HEALTH_DATA_CONSENT_VERSION (src/lib/consent.ts), the change date with an
-- optional .N suffix. NOT VALID: see the header and follow-ups/validate-consent.md.
-- ---------------------------------------------------------------------------------------------------------------

alter table public.health_data_consents
  add constraint health_data_consents_version_format
  check (consent_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(\.[0-9]+)?$') not valid;
