-- Hardening from the onboarding-profile implementation review (reviews/impl-review.md F1, F2, F10).
-- Additive: privileges, one policy removed, one function body replaced; no data is touched.

-- F1: withdrawal has exactly one path. A direct UPDATE of withdrawn_at let a client forge the timestamp and leave
-- the profile (health data) behind, so clients lose UPDATE entirely and the function does the work as its owner.
revoke update (withdrawn_at) on table public.health_data_consents from authenticated;
drop policy "Users withdraw their own active consent" on public.health_data_consents;

-- security definer (runs as the table owner, bypassing RLS), so every statement is pinned to the caller's own
-- auth.uid(); an unauthenticated caller gets nothing. search_path = '' and fully qualified names as before.
create or replace function public.withdraw_health_data_consent()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  delete from public.profiles where user_id = caller;
  update public.health_data_consents
    set withdrawn_at = now()
    where user_id = caller and withdrawn_at is null;
end;
$$;

revoke execute on function public.withdraw_health_data_consent() from public, anon;
grant execute on function public.withdraw_health_data_consent() to authenticated;

-- F2: Supabase's default privileges leave TRUNCATE (which ignores RLS), TRIGGER and REFERENCES on new tables.
revoke truncate, trigger, references on table public.health_data_consents, public.profiles from authenticated;
-- MAINTAIN exists only from Postgres 17.
do $$
begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'revoke maintain on table public.health_data_consents, public.profiles from authenticated';
  end if;
end;
$$;

-- F10: RLS already pins user_id to the caller; clients never need to update it.
revoke update (user_id) on table public.profiles from authenticated;
