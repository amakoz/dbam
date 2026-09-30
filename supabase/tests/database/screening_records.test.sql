-- RLS, consent and catalog gates for screening plans and done records (health data, S-03).
-- Run with `npx supabase test db`. Everything happens in one transaction that is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(57);

-- Fixtures, inserted as postgres: one catalog row per status, so the test doesn't depend on snapshot data.
insert into public.screening_catalog (
  slug, status, name_pl, name_en, summary_pl, summary_en, how_to_access_pl, how_to_access_en,
  eligibility, interval_kind, interval_months, evidence_level, evidence_source, nfz_funded, referral_required,
  sources
) values
  ('test-draft', 'draft', 'Szkic', 'Draft', 'Opis', 'Summary', 'Dostęp', 'Access',
   '[{"age_min": 50}]', 'fixed', 24, 1, 'USPSTF', true, false, '[{"url": "https://example.com"}]'),
  ('test-active', 'active', 'Aktywne', 'Active', 'Opis', 'Summary', 'Dostęp', 'Access',
   '[{"age_min": 50}]', 'fixed', 24, 1, 'USPSTF', true, false, '[{"url": "https://example.com"}]'),
  ('test-retired', 'retired', 'Wycofane', 'Retired', 'Opis', 'Summary', 'Dostęp', 'Access',
   '[{"age_min": 50}]', 'no_known_interval', null, 2, 'USPSTF', false, true, '[{"url": "https://example.com"}]');

-- Two users, created as postgres. A = 1111…, B = 2222….
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');

-- --- As user A, without consent ---------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.screening_plans (catalog_slug, appointment_date) values ('test-active', '2026-11-01') $$,
  '42501', null, 'A cannot plan an exam without consent'
);
select throws_ok(
  $$ insert into public.screening_completions (catalog_slug, last_done_month) values ('test-active', '2024-03-01') $$,
  '42501', null, 'A cannot mark an exam done without consent'
);

select lives_ok(
  $$ insert into public.health_data_consents (consent_version, locale) values ('2026-09-27', 'pl') $$,
  'A can grant consent'
);

-- --- As user A, with consent: plans -----------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.screening_plans (catalog_slug, appointment_date) values ('test-active', '2026-11-01') $$,
  'A can plan an active exam after consenting'
);
select is(
  (select user_id from public.screening_plans where catalog_slug = 'test-active'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'the plan belongs to A by default'
);
select throws_ok(
  $$ insert into public.screening_plans (catalog_slug) values ('test-draft') $$,
  '42501', null, 'A cannot plan a draft exam'
);
select throws_ok(
  $$ insert into public.screening_plans (catalog_slug) values ('test-retired') $$,
  '42501', null, 'A cannot plan a retired exam'
);
select throws_ok(
  $$ insert into public.screening_plans (catalog_slug) values ('no-such-exam') $$,
  '42501', null, 'A cannot plan an unknown exam'
);
select throws_ok(
  $$ insert into public.screening_plans (catalog_slug) values ('test-active') $$,
  '23505', null, 'A cannot hold two plans for the same exam'
);
select lives_ok(
  $$ insert into public.screening_plans (catalog_slug, appointment_date) values ('test-active', '2026-12-15')
     on conflict (user_id, catalog_slug)
     do update set catalog_slug = excluded.catalog_slug, appointment_date = excluded.appointment_date $$,
  'A can upsert their plan'
);
select is(
  (select appointment_date from public.screening_plans where catalog_slug = 'test-active'), '2026-12-15'::date,
  'the upsert replaced the appointment date'
);
select is((select count(*) from public.screening_plans), 1::bigint, 'the upsert kept one plan');
select lives_ok(
  $$ update public.screening_plans set appointment_date = null where catalog_slug = 'test-active' $$,
  'A can clear the appointment date'
);
select throws_ok(
  $$ update public.screening_plans set catalog_slug = 'test-draft' where catalog_slug = 'test-active' $$,
  '42501', null, 'A cannot move a plan to a draft exam'
);
select throws_ok(
  $$ insert into public.screening_plans (catalog_slug, created_at) values ('test-active', '2020-01-01') $$,
  '42501', null, 'A cannot forge created_at on a plan'
);
select throws_ok(
  $$ update public.screening_plans set updated_at = '2020-01-01' $$,
  '42501', null, 'A cannot rewrite server-owned plan timestamps'
);
select throws_ok(
  $$ update public.screening_plans set user_id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', null, 'A cannot move a plan to another user'
);
select throws_ok(
  $$ insert into public.screening_plans (user_id, catalog_slug)
     values ('22222222-2222-2222-2222-222222222222', 'test-active') $$,
  '42501', null, 'A cannot create a plan on B''s behalf'
);

-- --- As user A, with consent: completions -----------------------------------------------------------------------
select lives_ok(
  $$ insert into public.screening_completions (catalog_slug, last_done_month) values ('test-active', '2024-03-01') $$,
  'A can mark an active exam done after consenting'
);
select throws_ok(
  $$ insert into public.screening_completions (catalog_slug) values ('test-draft') $$,
  '42501', null, 'A cannot mark a draft exam done'
);
select throws_ok(
  $$ insert into public.screening_completions (catalog_slug) values ('test-retired') $$,
  '42501', null, 'A cannot mark a retired exam done'
);
select throws_ok(
  $$ insert into public.screening_completions (catalog_slug) values ('no-such-exam') $$,
  '42501', null, 'A cannot mark an unknown exam done'
);
select throws_ok(
  $$ insert into public.screening_completions (catalog_slug) values ('test-active') $$,
  '23505', null, 'A cannot hold two done records for the same exam'
);
select lives_ok(
  $$ insert into public.screening_completions (catalog_slug, last_done_month) values ('test-active', null)
     on conflict (user_id, catalog_slug)
     do update set catalog_slug = excluded.catalog_slug, last_done_month = excluded.last_done_month $$,
  'A can upsert their done record'
);
select is(
  (select last_done_month from public.screening_completions where catalog_slug = 'test-active'), null::date,
  'the upsert replaced the done month'
);
select throws_ok(
  $$ update public.screening_completions set last_done_month = '2024-03-15' $$,
  '23514', null, 'the done month must be the first day of a month'
);
select throws_ok(
  $$ insert into public.screening_completions (catalog_slug, created_at) values ('test-active', '2020-01-01') $$,
  '42501', null, 'A cannot forge created_at on a done record'
);
select throws_ok(
  $$ update public.screening_completions set user_id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', null, 'A cannot move a done record to another user'
);

-- --- As user B -------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select is((select count(*) from public.screening_plans), 0::bigint, 'B sees none of A''s plans');
select is((select count(*) from public.screening_completions), 0::bigint, 'B sees none of A''s done records');

with u as (
  update public.screening_plans set appointment_date = '2027-01-01'
  where user_id = '11111111-1111-1111-1111-111111111111' returning 1
)
select is(count(*), 0::bigint, 'B''s update of A''s plan affects no rows') from u;
with d as (
  delete from public.screening_plans where user_id = '11111111-1111-1111-1111-111111111111' returning 1
)
select is(count(*), 0::bigint, 'B''s delete of A''s plan affects no rows') from d;
with u as (
  update public.screening_completions set last_done_month = '2020-01-01'
  where user_id = '11111111-1111-1111-1111-111111111111' returning 1
)
select is(count(*), 0::bigint, 'B''s update of A''s done record affects no rows') from u;
with d as (
  delete from public.screening_completions where user_id = '11111111-1111-1111-1111-111111111111' returning 1
)
select is(count(*), 0::bigint, 'B''s delete of A''s done record affects no rows') from d;

-- --- As anon ---------------------------------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok($$ select * from public.screening_plans $$, '42501', null, 'anon cannot read plans');
select throws_ok(
  $$ select * from public.screening_completions $$, '42501', null, 'anon cannot read done records'
);

-- --- As postgres: A's rows survived B, and privileges ---------------------------------------------------------
reset role;

select is(
  (select count(*) from public.screening_plans
   where user_id = '11111111-1111-1111-1111-111111111111' and appointment_date is null),
  1::bigint, 'A''s plan is unchanged by B'
);
select is(
  (select count(*) from public.screening_completions
   where user_id = '11111111-1111-1111-1111-111111111111' and last_done_month is null),
  1::bigint, 'A''s done record is unchanged by B'
);

-- has_table_privilege with a list is true if any one is held.
select ok(
  not has_table_privilege(
    'anon', 'public.screening_plans', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES'
  ),
  'anon holds no privileges on plans'
);
select ok(
  not has_table_privilege(
    'anon', 'public.screening_completions', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES'
  ),
  'anon holds no privileges on done records'
);
select ok(
  not has_any_column_privilege('anon', 'public.screening_plans', 'SELECT, INSERT, UPDATE, REFERENCES'),
  'anon holds no column privileges on plans'
);
select ok(
  not has_any_column_privilege('anon', 'public.screening_completions', 'SELECT, INSERT, UPDATE, REFERENCES'),
  'anon holds no column privileges on done records'
);
-- TRUNCATE ignores RLS, so clients must not hold it (nor TRIGGER/REFERENCES).
select ok(
  not has_table_privilege('authenticated', 'public.screening_plans', 'TRUNCATE, TRIGGER, REFERENCES'),
  'authenticated holds no TRUNCATE/TRIGGER/REFERENCES on plans'
);
select ok(
  not has_table_privilege('authenticated', 'public.screening_completions', 'TRUNCATE, TRIGGER, REFERENCES'),
  'authenticated holds no TRUNCATE/TRIGGER/REFERENCES on done records'
);
-- MAINTAIN exists only from Postgres 17.
select ok(
  case
    when current_setting('server_version_num')::int < 170000 then true
    else not (
      has_table_privilege('authenticated', 'public.screening_plans', 'MAINTAIN')
      or has_table_privilege('authenticated', 'public.screening_completions', 'MAINTAIN')
    )
  end,
  'authenticated holds no MAINTAIN on plans or done records (PG17+)'
);
-- Timestamps are server-owned: no column grant lets a client write them.
select ok(
  not (
    has_column_privilege('authenticated', 'public.screening_plans', 'created_at', 'INSERT, UPDATE')
    or has_column_privilege('authenticated', 'public.screening_plans', 'updated_at', 'INSERT, UPDATE')
    or has_column_privilege('authenticated', 'public.screening_completions', 'created_at', 'INSERT, UPDATE')
    or has_column_privilege('authenticated', 'public.screening_completions', 'updated_at', 'INSERT, UPDATE')
  ),
  'authenticated cannot write timestamps on plans or done records'
);

-- A second plan for A, as postgres (bypassing the gates), so the delete and withdrawal tests have rows to remove.
insert into public.screening_plans (user_id, catalog_slug) values
  ('11111111-1111-1111-1111-111111111111', 'test-retired');

-- --- As user A: delete and withdraw -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select is((select count(*) from public.screening_plans), 2::bigint, 'A sees both their plans');
select lives_ok(
  $$ delete from public.screening_plans where catalog_slug = 'test-active' $$,
  'A can delete their own plan'
);
select is(
  (select array_agg(catalog_slug) from public.screening_plans), array['test-retired'],
  'only the deleted plan is gone'
);
select lives_ok(
  $$ update public.screening_plans set appointment_date = '2026-12-01' where catalog_slug = 'test-retired' $$,
  'an update of a plan for a retired exam runs but matches no rows'
);
select is(
  (select appointment_date from public.screening_plans where catalog_slug = 'test-retired'), null::date,
  'a plan for a retired exam cannot be re-dated'
);
select lives_ok(
  $$ insert into public.screening_plans (catalog_slug) values ('test-active') $$,
  'A can plan the exam again'
);

select lives_ok($$ select public.withdraw_health_data_consent() $$, 'A can withdraw consent');
select is((select count(*) from public.screening_plans), 0::bigint, 'withdrawal deletes A''s plans');
select is((select count(*) from public.screening_completions), 0::bigint, 'withdrawal deletes A''s done records');
select throws_ok(
  $$ insert into public.screening_plans (catalog_slug) values ('test-active') $$,
  '42501', null, 'A cannot plan an exam after withdrawing'
);
select throws_ok(
  $$ insert into public.screening_completions (catalog_slug) values ('test-active') $$,
  '42501', null, 'A cannot mark an exam done after withdrawing'
);

select * from finish();
rollback;
