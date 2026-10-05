-- confirm-exam-and-recurrence review fixes. Additive only: a Worker rollback never undoes a migration.

-- ---------------------------------------------------------------------------------------------------------------
-- A month change clears a stale exact day
-- ---------------------------------------------------------------------------------------------------------------

-- A Worker from before S-05 marks an exam done with { catalog_slug, last_done_month } only, so its upsert would keep a
-- confirmed day. With another month or "don't know" (null) that day breaks screening_completions_last_done_on_in_month
-- and the save fails. When the month changes and the statement leaves the day as it was, the day is cleared instead.
-- A statement that sets the day itself (confirm_screening_plan, or the app's explicit null) keeps it. Runs before the
-- check, as every BEFORE trigger does.
create function public.clear_stale_last_done_on()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.last_done_month is distinct from old.last_done_month
     and new.last_done_on is not distinct from old.last_done_on then
    new.last_done_on := null;
  end if;
  return new;
end;
$$;

create trigger screening_completions_clear_stale_last_done_on
  before update on public.screening_completions
  for each row execute function public.clear_stale_last_done_on();

-- ---------------------------------------------------------------------------------------------------------------
-- confirm_screening_plan: tighter grant and an accurate description
-- ---------------------------------------------------------------------------------------------------------------

-- Supabase grants EXECUTE on new functions to service_role by default. The cron has no use for it (with no auth.uid()
-- the function raises anyway), so lock it down like the appointment-reminder functions.
revoke execute on function public.confirm_screening_plan(text) from service_role;

comment on function public.confirm_screening_plan(text) is
  'Confirms the caller''s plan for p_slug when its appointment date is today or earlier in Warsaw: records the exam as '
  'done on that date and deletes the plan. "Today" is computed here, so the app''s confirm flow cannot backdate it; '
  'it is not a database invariant (a user may still write last_done_on within its month through the API, under RLS).';
