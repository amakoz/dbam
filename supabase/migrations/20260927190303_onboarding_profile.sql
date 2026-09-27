-- S-01 onboarding-profile: explicit health-data consent (GDPR Art. 9) and the minimal screening profile.
-- Consent records live apart from the health data so the proof of consent (Art. 7(1)) survives a withdrawal,
-- which deletes the profile. Additive only: a Worker rollback never undoes a migration.

-- ---------------------------------------------------------------------------------------------------------------
-- Consent log
-- ---------------------------------------------------------------------------------------------------------------

create table public.health_data_consents (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  consent_version text not null,
  locale text not null check (locale in ('pl', 'en')),
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  check (withdrawn_at is null or withdrawn_at >= granted_at)
);

comment on table public.health_data_consents is
  'Explicit consent to storing health data; rows are kept after withdrawal as proof that consent was given.';

-- At most one active consent per user.
create unique index health_data_consents_one_active on public.health_data_consents (user_id)
  where withdrawn_at is null;

alter table public.health_data_consents enable row level security;

create policy "Users read their own consents" on public.health_data_consents
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users grant consent for themselves" on public.health_data_consents
  for insert to authenticated
  with check (user_id = (select auth.uid()) and withdrawn_at is null);

-- The only allowed update is active -> withdrawn; a withdrawn consent cannot be revived.
create policy "Users withdraw their own active consent" on public.health_data_consents
  for update to authenticated
  using (user_id = (select auth.uid()) and withdrawn_at is null)
  with check (user_id = (select auth.uid()) and withdrawn_at is not null);

-- No delete policy: consent records are proof and go away only with the account (on delete cascade).
-- Column grants stop clients from forging granted_at/withdrawn_at on insert or rewriting the version later.
revoke all on table public.health_data_consents from anon;
revoke insert, update, delete on table public.health_data_consents from authenticated;
grant insert (user_id, consent_version, locale) on table public.health_data_consents to authenticated;
grant update (withdrawn_at) on table public.health_data_consents to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Profile (health data)
-- ---------------------------------------------------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  birth_year smallint not null check (birth_year between 1900 and 2100),
  sex text not null check (sex in ('female', 'male')),
  smoking_status text not null check (smoking_status in ('never', 'current', 'former')),
  packs_per_day numeric(4, 2) check (packs_per_day > 0 and packs_per_day <= 10),
  smoking_years smallint check (smoking_years between 1 and 100),
  years_since_quitting smallint check (years_since_quitting between 0 and 100),
  pack_years numeric generated always as (packs_per_day * smoking_years) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_smoking_fields_match_status check (
    (smoking_status = 'never'
      and packs_per_day is null and smoking_years is null and years_since_quitting is null)
    or (smoking_status = 'current'
      and packs_per_day is not null and smoking_years is not null and years_since_quitting is null)
    or (smoking_status = 'former'
      and packs_per_day is not null and smoking_years is not null and years_since_quitting is not null)
  )
);

comment on table public.profiles is
  'Minimal screening profile (GDPR Art. 9 health data); writable only while the owner has an active consent.';

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "Users read their own profile" on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users with active consent create their profile" on public.profiles
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.health_data_consents c
      where c.user_id = (select auth.uid()) and c.withdrawn_at is null
    )
  );

create policy "Users with active consent update their profile" on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.health_data_consents c
      where c.user_id = (select auth.uid()) and c.withdrawn_at is null
    )
  );

create policy "Users delete their own profile" on public.profiles
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Timestamps and the generated pack_years are server-owned.
revoke all on table public.profiles from anon;
revoke insert, update on table public.profiles from authenticated;
grant insert (user_id, birth_year, sex, smoking_status, packs_per_day, smoking_years, years_since_quitting)
  on table public.profiles to authenticated;
grant update (user_id, birth_year, sex, smoking_status, packs_per_day, smoking_years, years_since_quitting)
  on table public.profiles to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Withdrawal
-- ---------------------------------------------------------------------------------------------------------------

-- Deletes the caller's health data and marks their active consent withdrawn, in one transaction.
-- security invoker: runs under the caller's RLS, so it can only ever touch the caller's own rows.
create function public.withdraw_health_data_consent()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.profiles where user_id = (select auth.uid());
  update public.health_data_consents
    set withdrawn_at = now()
    where user_id = (select auth.uid()) and withdrawn_at is null;
end;
$$;

revoke execute on function public.withdraw_health_data_consent() from public, anon;
grant execute on function public.withdraw_health_data_consent() to authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
