-- S-04 appointment-reminder: an opt-in on the profile, a ledger of reminded (plan, appointment date) pairs, and two
-- cron-only functions. The ledger records that a user has an appointment on a date, derived from plan data, so it
-- is health data (GDPR Art. 9): no client can read or write it, and it goes away with the plan (and so on
-- withdrawal). The functions are the only way the cron's secret key (service_role) reaches user data: this
-- migration also revokes every service_role privilege on the user tables. Additive only: a Worker rollback never
-- undoes a migration.

-- ---------------------------------------------------------------------------------------------------------------
-- Opt-in (on the profile, so it inherits the consent-gated RLS and is deleted on withdrawal)
-- ---------------------------------------------------------------------------------------------------------------

alter table public.profiles
  add column reminders_enabled boolean not null default false,
  add column reminders_locale text check (reminders_locale in ('pl', 'en')),
  add column reminders_enabled_at timestamptz;

comment on column public.profiles.reminders_enabled is 'Appointment reminders by email are on (off by default).';
comment on column public.profiles.reminders_locale is 'Language of reminder emails; null means Polish.';
comment on column public.profiles.reminders_enabled_at is 'When reminders were last turned on; null while off.';

-- reminders_enabled_at is server-owned: stamped when reminders turn on, cleared when they are off, otherwise kept.
create function public.set_reminders_enabled_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.reminders_enabled then
    new.reminders_enabled_at := null;
  elsif tg_op = 'INSERT' or not old.reminders_enabled then
    new.reminders_enabled_at := now();
  else
    new.reminders_enabled_at := old.reminders_enabled_at;
  end if;
  return new;
end;
$$;

revoke execute on function public.set_reminders_enabled_at() from public, anon, authenticated;

create trigger profiles_set_reminders_enabled_at
  before insert or update on public.profiles
  for each row execute function public.set_reminders_enabled_at();

-- Update only: there is no insert grant for these columns, so a new profile always starts with reminders off.
grant update (reminders_enabled, reminders_locale) on table public.profiles to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Reminder ledger (health data)
-- ---------------------------------------------------------------------------------------------------------------

create table public.appointment_reminders (
  id bigint generated always as identity primary key,
  plan_id bigint not null references public.screening_plans (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  appointment_date date not null,
  created_at timestamptz not null default now(),
  -- Null until the email provider accepted the reminder; a failed send stays unsent for the next run.
  sent_at timestamptz,
  constraint appointment_reminders_plan_date_unique unique (plan_id, appointment_date)
);

comment on table public.appointment_reminders is
  'One row per reminded (plan, appointment date) pair (GDPR Art. 9 health data); written and read only by the '
  'cron-only reminder functions. A re-dated plan gets a new row; the old one stays unsent and dies with the plan.';

-- RLS with no policies, and no privileges for any API role: only the definer functions below touch this table.
alter table public.appointment_reminders enable row level security;

revoke all on table public.appointment_reminders from anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Cron-only functions
-- ---------------------------------------------------------------------------------------------------------------

-- Records a ledger row for every plan dated in (p_today, p_today + p_lead_days] whose owner has reminders on and an
-- active consent, then returns every still-valid unsent row, one row per user. A row is still valid only while its
-- plan keeps that date, the owner still has reminders on and an active consent, and the date is still in the
-- window, and the account has an email address. Returns nothing beyond user id, account email, locale, reminder ids
-- and dates: no exam names. security definer (runs as the table owner), so EXECUTE is granted to service_role only.
create function public.claim_due_appointment_reminders(
  p_today date,
  p_lead_days int,
  p_limit int
)
returns table (user_id uuid, email text, locale text, reminder_ids bigint[], appointment_dates date[])
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_today is null
    or p_lead_days is null or p_lead_days not between 1 and 30
    or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'invalid reminder window or limit' using errcode = '22023';
  end if;

  insert into public.appointment_reminders (plan_id, user_id, appointment_date)
  select sp.id, sp.user_id, sp.appointment_date
  from public.screening_plans sp
  join public.profiles pr on pr.user_id = sp.user_id and pr.reminders_enabled
  where sp.appointment_date > p_today
    and sp.appointment_date <= p_today + p_lead_days
    and exists (
      select 1 from public.health_data_consents c
      where c.user_id = sp.user_id and c.withdrawn_at is null
    )
  on conflict on constraint appointment_reminders_plan_date_unique do nothing;

  return query
  select
    r.user_id,
    u.email::text,
    coalesce(pr.reminders_locale, 'pl'),
    array_agg(r.id order by r.id),
    array_agg(distinct r.appointment_date order by r.appointment_date)
  from public.appointment_reminders r
  join public.screening_plans sp
    on sp.id = r.plan_id and sp.user_id = r.user_id and sp.appointment_date = r.appointment_date
  join public.profiles pr on pr.user_id = r.user_id and pr.reminders_enabled
  join auth.users u on u.id = r.user_id
  where r.sent_at is null
    and u.email is not null
    and r.appointment_date > p_today
    and r.appointment_date <= p_today + p_lead_days
    and exists (
      select 1 from public.health_data_consents c
      where c.user_id = r.user_id and c.withdrawn_at is null
    )
  group by r.user_id, u.email, pr.reminders_locale
  order by r.user_id
  limit p_limit;
end;
$$;

-- Stamps the given ledger rows as sent (already-sent rows are left alone) and returns how many were stamped.
create function public.mark_appointment_reminders_sent(p_ids bigint[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated integer;
begin
  update public.appointment_reminders
    set sent_at = now()
    where id = any (p_ids) and sent_at is null;
  get diagnostics updated = row_count;
  return updated;
end;
$$;

revoke execute on function public.claim_due_appointment_reminders(date, int, int)
  from public, anon, authenticated;
grant execute on function public.claim_due_appointment_reminders(date, int, int) to service_role;
revoke execute on function public.mark_appointment_reminders_sent(bigint[]) from public, anon, authenticated;
grant execute on function public.mark_appointment_reminders_sent(bigint[]) to service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Hardening
-- ---------------------------------------------------------------------------------------------------------------

-- The cron's secret key acts as service_role, which bypasses RLS, so only grants keep it off user data. It keeps
-- SELECT on the public catalog (20260928195335) and reaches user data only through the functions above.
revoke all on table public.profiles, public.health_data_consents, public.screening_plans,
  public.screening_completions from service_role;

-- Supabase's default privileges leave TRUNCATE (which ignores RLS), TRIGGER and REFERENCES on new tables.
revoke truncate, trigger, references on table public.appointment_reminders from authenticated;
-- MAINTAIN exists only from Postgres 17.
do $$
begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'revoke maintain on table public.profiles, public.health_data_consents, public.screening_plans, '
      'public.screening_completions, public.appointment_reminders from service_role';
    execute 'revoke maintain on table public.appointment_reminders from anon, authenticated';
  end if;
end;
$$;
