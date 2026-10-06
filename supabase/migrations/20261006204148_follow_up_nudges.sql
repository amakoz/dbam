-- S-07 follow-up-nudges: a ledger of nudged (plan, kind, cycle) triples and two cron-only functions (claim ledger
-- rows, mark them sent). A `schedule` nudge says "this planned exam still has no appointment date" (FR-011); a
-- `confirm` nudge says "this appointment date passed without a confirmation" (FR-012). Both states are decided in
-- SQL alone, so there is no candidates step. The ledger is health data (GDPR Art. 9): no client can read or write
-- it, it goes away with the plan (and so on withdrawal), and service_role reaches it only through the functions
-- below, like the S-04 and S-06 ledgers. Additive only: a Worker rollback never undoes a migration.

-- ---------------------------------------------------------------------------------------------------------------
-- Ledger (health data)
-- ---------------------------------------------------------------------------------------------------------------

create table public.follow_up_nudges (
  id bigint generated always as identity primary key,
  plan_id bigint not null references public.screening_plans (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('schedule', 'confirm')),
  -- schedule: the Warsaw date the plan was last saved without a date. confirm: the appointment date that passed.
  cycle_on date not null,
  created_at timestamptz not null default now(),
  -- Null until the email provider accepted the nudge; a failed send stays unsent for the next run.
  sent_at timestamptz,
  constraint follow_up_nudges_plan_kind_cycle_unique unique (plan_id, kind, cycle_on)
);

comment on table public.follow_up_nudges is
  'One row per nudged (plan, kind, cycle) triple (GDPR Art. 9 health data); written and read only by the cron-only '
  'follow-up-nudge functions. A re-saved or re-dated plan starts a new cycle with a new row; the old one stays '
  'unsent and dies with the plan.';

-- RLS with no policies, and no privileges for any API role: only the definer functions below touch this table.
alter table public.follow_up_nudges enable row level security;

revoke all on table public.follow_up_nudges from anon, authenticated, service_role;
-- Supabase's default privileges leave TRUNCATE (which ignores RLS), TRIGGER and REFERENCES on new tables.
revoke truncate, trigger, references on table public.follow_up_nudges from anon, authenticated, service_role;
-- MAINTAIN exists only from Postgres 17.
do $$
begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'revoke maintain on table public.follow_up_nudges from anon, authenticated, service_role';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Cron-only functions
-- ---------------------------------------------------------------------------------------------------------------

-- Records a ledger row for every plan of an opted-in, consented owner on an active catalog entry that is
-- (schedule) still undated p_schedule_after Warsaw days after it was last saved, or (confirm) dated at least
-- p_confirm_after days ago, then returns every still-valid unsent row, one row per user, confirm users first. A row
-- is still valid only while its plan is in the state of its cycle, the owner still has reminders on and an active
-- consent, the entry is active, the account has an email address, and the user got no S-04 or S-06 email on
-- p_today (Warsaw). Returns nothing beyond user id, account email, locale, nudge ids and the two counts: no exam
-- names, no dates. security definer (runs as the table owner), so EXECUTE is granted to service_role only.
create function public.claim_follow_up_nudges(
  p_today date,
  p_schedule_after int,
  p_confirm_after int,
  p_limit int
)
returns table (
  user_id uuid, email text, locale text, nudge_ids bigint[], schedule_count int, confirm_count int
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_today is null
    or p_schedule_after is null or p_schedule_after not between 1 and 90
    or p_confirm_after is null or p_confirm_after not between 1 and 90
    or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'invalid nudge threshold or limit' using errcode = '22023';
  end if;

  insert into public.follow_up_nudges (plan_id, user_id, kind, cycle_on)
  select sp.id, sp.user_id, 'schedule', (sp.updated_at at time zone 'Europe/Warsaw')::date
  from public.screening_plans sp
  join public.profiles pr on pr.user_id = sp.user_id and pr.reminders_enabled
  join public.screening_catalog c on c.slug = sp.catalog_slug and c.status = 'active'
  where sp.appointment_date is null
    and (sp.updated_at at time zone 'Europe/Warsaw')::date <= p_today - p_schedule_after
    and exists (
      select 1 from public.health_data_consents hc
      where hc.user_id = sp.user_id and hc.withdrawn_at is null
    )
  on conflict on constraint follow_up_nudges_plan_kind_cycle_unique do nothing;

  insert into public.follow_up_nudges (plan_id, user_id, kind, cycle_on)
  select sp.id, sp.user_id, 'confirm', sp.appointment_date
  from public.screening_plans sp
  join public.profiles pr on pr.user_id = sp.user_id and pr.reminders_enabled
  join public.screening_catalog c on c.slug = sp.catalog_slug and c.status = 'active'
  where sp.appointment_date <= p_today - p_confirm_after
    and exists (
      select 1 from public.health_data_consents hc
      where hc.user_id = sp.user_id and hc.withdrawn_at is null
    )
  on conflict on constraint follow_up_nudges_plan_kind_cycle_unique do nothing;

  return query
  select
    r.user_id,
    u.email::text,
    coalesce(pr.reminders_locale, 'pl'),
    array_agg(distinct r.id order by r.id),
    (count(*) filter (where r.kind = 'schedule'))::int,
    (count(*) filter (where r.kind = 'confirm'))::int
  from public.follow_up_nudges r
  join public.screening_plans sp
    on sp.id = r.plan_id
    and sp.user_id = r.user_id
    and (
      (
        r.kind = 'schedule'
        and sp.appointment_date is null
        and (sp.updated_at at time zone 'Europe/Warsaw')::date = r.cycle_on
        and r.cycle_on <= p_today - p_schedule_after
      ) or (
        r.kind = 'confirm'
        and sp.appointment_date = r.cycle_on
        and r.cycle_on <= p_today - p_confirm_after
      )
    )
  join public.screening_catalog c on c.slug = sp.catalog_slug and c.status = 'active'
  join public.profiles pr on pr.user_id = r.user_id and pr.reminders_enabled
  join auth.users u on u.id = r.user_id
  where r.sent_at is null
    and u.email is not null
    and exists (
      select 1 from public.health_data_consents hc
      where hc.user_id = r.user_id and hc.withdrawn_at is null
    )
    and not exists (
      select 1 from public.appointment_reminders ar
      where ar.user_id = r.user_id and ar.sent_at is not null
        and (ar.sent_at at time zone 'Europe/Warsaw')::date = p_today
    )
    and not exists (
      select 1 from public.due_screening_reminders dr
      where dr.user_id = r.user_id and dr.sent_at is not null
        and (dr.sent_at at time zone 'Europe/Warsaw')::date = p_today
    )
  group by r.user_id, u.email, pr.reminders_locale
  order by count(*) filter (where r.kind = 'confirm') > 0 desc, md5(r.user_id::text || p_today::text)
  limit p_limit;
end;
$$;

-- Stamps the given ledger rows as sent (already-sent rows are left alone) and returns how many were stamped.
create function public.mark_follow_up_nudges_sent(p_ids bigint[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated integer;
begin
  update public.follow_up_nudges
    set sent_at = now()
    where id = any (p_ids) and sent_at is null;
  get diagnostics updated = row_count;
  return updated;
end;
$$;

revoke execute on function public.claim_follow_up_nudges(date, int, int, int) from public, anon, authenticated;
grant execute on function public.claim_follow_up_nudges(date, int, int, int) to service_role;
revoke execute on function public.mark_follow_up_nudges_sent(bigint[]) from public, anon, authenticated;
grant execute on function public.mark_follow_up_nudges_sent(bigint[]) to service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- FR-011 anchor
-- ---------------------------------------------------------------------------------------------------------------

-- updated_at moves on every save (a trigger), and clients cannot write it. For an undated plan it is the moment the
-- plan was selected or last re-saved without a date, which is where a schedule nudge counts from; clearing a passed
-- plan's date also moves it, so the old created_at would nudge too early.
comment on table public.screening_plans is
  'Exams a user plans to have, with an optional appointment date booked elsewhere (GDPR Art. 9 health data); '
  'writable only while the owner has an active consent. created_at is the first selection. updated_at (Warsaw '
  'date) is the FR-011 "selected at": the follow-up nudge counts the days without an appointment date from it.';
