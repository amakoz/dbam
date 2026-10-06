-- S-06 due-screening-reminder: a ledger of reminded completion cycles, an anchor helper and three cron-only
-- functions (select candidates, claim ledger rows, mark them sent). A cycle is one (user, exam, anchor month): the
-- ledger says "this user was reminded that this exam, last done in that month, is due again". It is health data
-- (GDPR Art. 9), so no client can read or write it, it goes away with the completion (and so on withdrawal), and
-- service_role reaches it only through the functions below, like the S-04 ledger. Additive only: a Worker rollback
-- never undoes a migration.

-- ---------------------------------------------------------------------------------------------------------------
-- Ledger (health data)
-- ---------------------------------------------------------------------------------------------------------------

create table public.due_screening_reminders (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  catalog_slug text not null,
  -- The month "due again" counts from, as public.screening_anchor_month computed it when the row was claimed.
  anchor_month date not null,
  -- Kept as data. It is not part of the key: one reminder per completion cycle (anchor), even if the interval
  -- shortens later.
  due_month date not null,
  created_at timestamptz not null default now(),
  -- Null until the email provider accepted the reminder; a failed send stays unsent for the next run.
  sent_at timestamptz,
  constraint due_screening_reminders_user_slug_anchor_unique unique (user_id, catalog_slug, anchor_month),
  constraint due_screening_reminders_anchor_first_day check (
    anchor_month = date_trunc('month', anchor_month::timestamp)::date
  ),
  constraint due_screening_reminders_due_first_day check (
    due_month = date_trunc('month', due_month::timestamp)::date
  ),
  constraint due_screening_reminders_due_after_anchor check (due_month > anchor_month),
  -- Deleting the completion (the user, or withdrawal) deletes its ledger rows.
  constraint due_screening_reminders_completion_fkey foreign key (user_id, catalog_slug)
    references public.screening_completions (user_id, catalog_slug) on delete cascade
);

comment on table public.due_screening_reminders is
  'One row per reminded completion cycle (user, exam, anchor month), GDPR Art. 9 health data; written and read '
  'only by the cron-only due-screening functions. Dies with the completion.';

-- RLS with no policies, and no privileges for any API role: only the definer functions below touch this table.
alter table public.due_screening_reminders enable row level security;

revoke all on table public.due_screening_reminders from anon, authenticated, service_role;
-- Supabase's default privileges leave TRUNCATE (which ignores RLS), TRIGGER and REFERENCES on new tables.
revoke truncate, trigger, references on table public.due_screening_reminders from anon, authenticated, service_role;
-- MAINTAIN exists only from Postgres 17.
do $$
begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'revoke maintain on table public.due_screening_reminders from anon, authenticated, service_role';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Anchor helper
-- ---------------------------------------------------------------------------------------------------------------

-- The only SQL copy of `anchorMonth` (src/lib/screenings/rules.ts): the month of the last exam, or when blank, the
-- Warsaw month the record was last saved. The candidates and claim functions both use it, and TypeScript takes the
-- result as given, so the two sides cannot disagree. Granted to nobody: the definer functions call it as owner.
create function public.screening_anchor_month(p_last_done_month date, p_updated_at timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select coalesce(p_last_done_month, date_trunc('month', p_updated_at at time zone 'Europe/Warsaw')::date)
$$;

revoke execute on function public.screening_anchor_month(date, timestamptz)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Cron-only functions
-- ---------------------------------------------------------------------------------------------------------------

-- Users who may owe a reminder, with the minimal inputs the TypeScript rules need: the five profile fields the
-- eligibility and interval rules read, and per completion its slug and anchor month. A candidate has reminders on,
-- an active consent and an email address, and holds a completion of an active fixed-interval entry that has no
-- plan and no sent ledger row for its current anchor. The filter only narrows the search (a superset of what is
-- truly due): the anchor plus the shortest interval the entry can resolve to (its base or the smallest override)
-- must be at or before the current Warsaw month. TypeScript makes the final call. Returns no email, no names, no
-- exact days and no updated_at. Users are taken in an order that rotates daily and is stable within a day, so
-- candidates TypeScript rejects cannot starve the others, and a retried run sees the same users.
create function public.get_due_screening_candidates(p_today date, p_limit int)
returns table (
  user_id uuid,
  birth_year smallint,
  sex text,
  smoking_status text,
  pack_years numeric,
  years_since_quitting smallint,
  completions jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_today is null or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'invalid date or limit' using errcode = '22023';
  end if;

  return query
  select
    pr.user_id,
    pr.birth_year,
    pr.sex,
    pr.smoking_status,
    pr.pack_years,
    pr.years_since_quitting,
    jsonb_agg(
      jsonb_build_object('catalog_slug', c.catalog_slug, 'anchor_month', a.anchor_month)
      order by c.catalog_slug
    )
  from public.profiles pr
  join auth.users u on u.id = pr.user_id and u.email is not null
  join public.screening_completions c on c.user_id = pr.user_id
  join public.screening_catalog s
    on s.slug = c.catalog_slug and s.status = 'active' and s.interval_kind = 'fixed'
  cross join lateral (
    select public.screening_anchor_month(c.last_done_month, c.updated_at) as anchor_month
  ) a
  where pr.reminders_enabled
    and exists (
      select 1 from public.health_data_consents hc
      where hc.user_id = pr.user_id and hc.withdrawn_at is null
    )
    and not exists (
      select 1 from public.screening_plans sp
      where sp.user_id = c.user_id and sp.catalog_slug = c.catalog_slug
    )
    and not exists (
      select 1 from public.due_screening_reminders r
      where r.user_id = c.user_id and r.catalog_slug = c.catalog_slug
        and r.anchor_month = a.anchor_month and r.sent_at is not null
    )
    and (
      a.anchor_month + make_interval(
        months => least(
          s.interval_months,
          coalesce((select min((o ->> 'months')::int) from jsonb_array_elements(s.interval_overrides) o),
                   s.interval_months)
        )
      )
    )::date <= date_trunc('month', p_today)::date
  group by pr.user_id
  order by md5(pr.user_id::text || p_today::text)
  limit p_limit;
end;
$$;

-- Records a ledger row for every given item that is still due, then returns, per user, the account email, locale and
-- the unsent ledger rows of those items. p_items is an array of {user_id, catalog_slug, anchor_month, due_month}.
-- An item counts only while live data agrees, both when the row is inserted and when it is returned: the
-- completion exists and still has that anchor, anchor < due month <= this month, the owner has reminders on, an
-- active consent and an email address, the exam has no plan, and the entry is still active with a fixed interval.
-- An item that fails a check is skipped. Returns nothing beyond user id, email, locale and ledger ids: no exam
-- names. A second claim for the same anchor adds no row and keeps the stored due month.
create function public.claim_due_screening_reminders(p_today date, p_items jsonb)
returns table (user_id uuid, email text, locale text, reminder_ids bigint[])
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_today is null
    or p_items is null or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) not between 1 and 1000 then
    raise exception 'invalid date or items' using errcode = '22023';
  end if;

  insert into public.due_screening_reminders (user_id, catalog_slug, anchor_month, due_month)
  select i.user_id, i.catalog_slug, i.anchor_month, i.due_month
  from jsonb_to_recordset(p_items) as i(user_id uuid, catalog_slug text, anchor_month date, due_month date)
  join public.screening_completions c on c.user_id = i.user_id and c.catalog_slug = i.catalog_slug
  join public.profiles pr on pr.user_id = i.user_id and pr.reminders_enabled
  join auth.users u on u.id = i.user_id and u.email is not null
  join public.screening_catalog s
    on s.slug = i.catalog_slug and s.status = 'active' and s.interval_kind = 'fixed'
  where public.screening_anchor_month(c.last_done_month, c.updated_at) = i.anchor_month
    and i.anchor_month < i.due_month
    and i.due_month = date_trunc('month', i.due_month::timestamp)::date
    and i.due_month <= date_trunc('month', p_today)::date
    and exists (
      select 1 from public.health_data_consents hc
      where hc.user_id = i.user_id and hc.withdrawn_at is null
    )
    and not exists (
      select 1 from public.screening_plans sp
      where sp.user_id = i.user_id and sp.catalog_slug = i.catalog_slug
    )
  on conflict on constraint due_screening_reminders_user_slug_anchor_unique do nothing;

  return query
  select
    r.user_id,
    u.email::text,
    coalesce(pr.reminders_locale, 'pl'),
    array_agg(r.id order by r.id)
  from jsonb_to_recordset(p_items) as i(user_id uuid, catalog_slug text, anchor_month date, due_month date)
  join public.due_screening_reminders r
    on r.user_id = i.user_id and r.catalog_slug = i.catalog_slug and r.anchor_month = i.anchor_month
  join public.screening_completions c on c.user_id = r.user_id and c.catalog_slug = r.catalog_slug
  join public.profiles pr on pr.user_id = r.user_id and pr.reminders_enabled
  join auth.users u on u.id = r.user_id and u.email is not null
  join public.screening_catalog s
    on s.slug = r.catalog_slug and s.status = 'active' and s.interval_kind = 'fixed'
  where r.sent_at is null
    and public.screening_anchor_month(c.last_done_month, c.updated_at) = i.anchor_month
    and i.anchor_month < i.due_month
    and i.due_month <= date_trunc('month', p_today)::date
    and exists (
      select 1 from public.health_data_consents hc
      where hc.user_id = r.user_id and hc.withdrawn_at is null
    )
    and not exists (
      select 1 from public.screening_plans sp
      where sp.user_id = r.user_id and sp.catalog_slug = r.catalog_slug
    )
  group by r.user_id, u.email, pr.reminders_locale
  order by r.user_id;
end;
$$;

-- Stamps the given ledger rows as sent (already-sent rows are left alone) and returns how many were stamped.
create function public.mark_due_screening_reminders_sent(p_ids bigint[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated integer;
begin
  update public.due_screening_reminders
    set sent_at = now()
    where id = any (p_ids) and sent_at is null;
  get diagnostics updated = row_count;
  return updated;
end;
$$;

revoke execute on function public.get_due_screening_candidates(date, int) from public, anon, authenticated;
grant execute on function public.get_due_screening_candidates(date, int) to service_role;
revoke execute on function public.claim_due_screening_reminders(date, jsonb) from public, anon, authenticated;
grant execute on function public.claim_due_screening_reminders(date, jsonb) to service_role;
revoke execute on function public.mark_due_screening_reminders_sent(bigint[]) from public, anon, authenticated;
grant execute on function public.mark_due_screening_reminders_sent(bigint[]) to service_role;
