-- S-03 record-appointment-date: per-user screening plans (optional appointment date) and done records (optional
-- month of the last exam), both pointing at the screening catalog. They are health data (GDPR Art. 9), so they follow
-- the S-01 profile pattern: own-row RLS, writes gated on an active consent, column grants, and deletion on
-- withdrawal. Writes are also limited to active catalog entries. Additive only: a Worker rollback never undoes a
-- migration.

-- ---------------------------------------------------------------------------------------------------------------
-- Plans
-- ---------------------------------------------------------------------------------------------------------------

create table public.screening_plans (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Catalog rows are never deleted (retired instead), so the default "no action" never fires in practice.
  catalog_slug text not null references public.screening_catalog (slug),
  -- Null means "planned, no date yet" (the FR-011 state).
  appointment_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint screening_plans_user_slug_unique unique (user_id, catalog_slug)
);

comment on table public.screening_plans is
  'Exams a user plans to have, with an optional appointment date booked elsewhere (GDPR Art. 9 health data); '
  'writable only while the owner has an active consent. created_at is the FR-011 "selected at".';

create trigger screening_plans_set_updated_at
  before update on public.screening_plans
  for each row execute function public.set_updated_at();

-- For S-04's set-based reminder query over upcoming appointments.
create index screening_plans_appointment_date_idx on public.screening_plans (appointment_date);

-- ---------------------------------------------------------------------------------------------------------------
-- Completions (done records)
-- ---------------------------------------------------------------------------------------------------------------

create table public.screening_completions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  catalog_slug text not null references public.screening_catalog (slug),
  -- First day of the month of the last exam; null means "don't know" (due again counts from updated_at).
  last_done_month date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint screening_completions_user_slug_unique unique (user_id, catalog_slug),
  -- Cast to timestamp (not timestamptz) so the check does not depend on the session time zone.
  constraint screening_completions_last_done_month_first_day check (
    last_done_month = date_trunc('month', last_done_month::timestamp)::date
  )
);

comment on table public.screening_completions is
  'Exams a user marked already done, with an optional month of the last exam (GDPR Art. 9 health data); '
  'writable only while the owner has an active consent.';

create trigger screening_completions_set_updated_at
  before update on public.screening_completions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------------------------
-- Access rules
-- ---------------------------------------------------------------------------------------------------------------

-- FK checks ignore RLS, so a bare foreign key would accept a draft slug; the write policies also require the
-- referenced entry to be active.

alter table public.screening_plans enable row level security;

create policy "Users read their own plans" on public.screening_plans
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users with active consent create plans for active entries" on public.screening_plans
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.health_data_consents c
      where c.user_id = (select auth.uid()) and c.withdrawn_at is null
    )
    and exists (
      select 1 from public.screening_catalog s
      where s.slug = catalog_slug and s.status = 'active'
    )
  );

create policy "Users with active consent update plans for active entries" on public.screening_plans
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.health_data_consents c
      where c.user_id = (select auth.uid()) and c.withdrawn_at is null
    )
    and exists (
      select 1 from public.screening_catalog s
      where s.slug = catalog_slug and s.status = 'active'
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.health_data_consents c
      where c.user_id = (select auth.uid()) and c.withdrawn_at is null
    )
    and exists (
      select 1 from public.screening_catalog s
      where s.slug = catalog_slug and s.status = 'active'
    )
  );

create policy "Users delete their own plans" on public.screening_plans
  for delete to authenticated
  using (user_id = (select auth.uid()));

alter table public.screening_completions enable row level security;

create policy "Users read their own completions" on public.screening_completions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users with active consent create completions for active entries" on public.screening_completions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.health_data_consents c
      where c.user_id = (select auth.uid()) and c.withdrawn_at is null
    )
    and exists (
      select 1 from public.screening_catalog s
      where s.slug = catalog_slug and s.status = 'active'
    )
  );

create policy "Users with active consent update completions for active entries" on public.screening_completions
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.health_data_consents c
      where c.user_id = (select auth.uid()) and c.withdrawn_at is null
    )
    and exists (
      select 1 from public.screening_catalog s
      where s.slug = catalog_slug and s.status = 'active'
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.health_data_consents c
      where c.user_id = (select auth.uid()) and c.withdrawn_at is null
    )
    and exists (
      select 1 from public.screening_catalog s
      where s.slug = catalog_slug and s.status = 'active'
    )
  );

create policy "Users delete their own completions" on public.screening_completions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Timestamps are server-owned. UPDATE includes catalog_slug because a PostgREST upsert (ON CONFLICT DO UPDATE) sets
-- every payload column, the conflict key too; the policies still pin the slug to an active entry. user_id is
-- insertable only so RLS can reject a forged owner; clients never update it.
revoke all on table public.screening_plans, public.screening_completions from anon;
revoke insert, update on table public.screening_plans, public.screening_completions from authenticated;
grant insert (user_id, catalog_slug, appointment_date) on table public.screening_plans to authenticated;
grant update (catalog_slug, appointment_date) on table public.screening_plans to authenticated;
grant insert (user_id, catalog_slug, last_done_month) on table public.screening_completions to authenticated;
grant update (catalog_slug, last_done_month) on table public.screening_completions to authenticated;

-- Supabase's default privileges leave TRUNCATE (which ignores RLS), TRIGGER and REFERENCES on new tables.
revoke truncate, trigger, references on table public.screening_plans, public.screening_completions
  from authenticated;
-- MAINTAIN exists only from Postgres 17.
do $$
begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'revoke maintain on table public.screening_plans, public.screening_completions from authenticated';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Withdrawal
-- ---------------------------------------------------------------------------------------------------------------

-- Same contract as before (harden_consent_withdrawal): security definer pinned to the caller's own auth.uid(),
-- search_path = '' and fully qualified names. Now also deletes the caller's plans and done records.
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
  delete from public.screening_plans where user_id = caller;
  delete from public.screening_completions where user_id = caller;
  delete from public.profiles where user_id = caller;
  update public.health_data_consents
    set withdrawn_at = now()
    where user_id = caller and withdrawn_at is null;
end;
$$;

revoke execute on function public.withdraw_health_data_consent() from public, anon;
grant execute on function public.withdraw_health_data_consent() to authenticated;
