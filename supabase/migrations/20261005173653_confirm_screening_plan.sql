-- confirm-exam-and-recurrence: the exact day of a confirmed exam next to its month, and one atomic call that turns a
-- passed plan into a done record. The function is security invoker, so the S-03 RLS gates (own rows, active
-- consent, active catalog entry) still apply to every row it touches. Additive only: a Worker rollback never undoes
-- a migration.

-- ---------------------------------------------------------------------------------------------------------------
-- Exact day of the last exam
-- ---------------------------------------------------------------------------------------------------------------

-- Null means the day is unknown (a month-only mark done, or a row from before this column). A day always sits in
-- its month, so a day without a month is rejected too (spelled out: a null month would make the comparison null,
-- which a check accepts). Cast to timestamp (not timestamptz) so the check does not depend on the session time zone.
alter table public.screening_completions
  add column last_done_on date,
  add constraint screening_completions_last_done_on_in_month check (
    last_done_on is null
    or (last_done_month is not null and last_done_month = date_trunc('month', last_done_on::timestamp)::date)
  );

comment on column public.screening_completions.last_done_on is
  'Exact day of the last exam, set when a passed plan is confirmed; null when only the month (or nothing) is known.';

-- Mark done (month only) sends last_done_on = null, so it needs UPDATE as well as INSERT on the column.
grant insert (last_done_on) on table public.screening_completions to authenticated;
grant update (last_done_on) on table public.screening_completions to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Confirm a passed plan
-- ---------------------------------------------------------------------------------------------------------------

-- Returns 'not_found' when the caller has no plan for p_slug, 'not_due' when the plan has no date or its date is
-- after today in Warsaw, otherwise records the exam as done on the appointment date, deletes the plan (its reminder
-- ledger rows cascade) and returns 'confirmed'. "Today" is computed here, so a client cannot backdate it.
-- The plan row is locked by the DELETE, not by SELECT ... FOR UPDATE: a locking read also applies the plans' UPDATE
-- policy, which would hide a plan without an active consent or for a retired entry and report 'not_found'. The
-- DELETE policy checks ownership only, so those cases reach the completion upsert and fail on its RLS check, which
-- rolls the delete back. security invoker, search_path = '' and fully qualified names.
create function public.confirm_screening_plan(p_slug text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  today date := (now() at time zone 'Europe/Warsaw')::date;
  done_on date;
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  delete from public.screening_plans
    where user_id = caller and catalog_slug = p_slug
      and appointment_date is not null and appointment_date <= today
    returning appointment_date into done_on;

  if not found then
    if exists (
      select 1 from public.screening_plans where user_id = caller and catalog_slug = p_slug
    ) then
      return 'not_due';
    end if;
    return 'not_found';
  end if;

  insert into public.screening_completions (catalog_slug, last_done_month, last_done_on)
    values (p_slug, date_trunc('month', done_on::timestamp)::date, done_on)
    on conflict (user_id, catalog_slug)
    do update set last_done_month = excluded.last_done_month, last_done_on = excluded.last_done_on;

  return 'confirmed';
end;
$$;

revoke execute on function public.confirm_screening_plan(text) from public, anon;
grant execute on function public.confirm_screening_plan(text) to authenticated;
