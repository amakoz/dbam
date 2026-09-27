-- RLS and consent guarantees for health data (PRD guardrail: never exposed to another user).
-- Run with `npx supabase test db`. Everything happens in one transaction that is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- Two users, created as postgres. A = 1111…, B = 2222….
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');

-- --- As user A -------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.profiles (birth_year, sex, smoking_status) values (1980, 'female', 'never') $$,
  '42501', null, 'A cannot create a profile without consent'
);

select lives_ok(
  $$ insert into public.health_data_consents (consent_version, locale) values ('2026-09-27', 'pl') $$,
  'A can grant consent'
);

select throws_ok(
  $$ insert into public.health_data_consents (consent_version, locale) values ('2026-09-27', 'pl') $$,
  '23505', null, 'A cannot hold two active consents'
);

select throws_ok(
  $$ insert into public.health_data_consents (consent_version, locale, granted_at)
     values ('2026-09-27', 'pl', '2020-01-01') $$,
  '42501', null, 'A cannot forge granted_at'
);

select throws_ok(
  $$ update public.health_data_consents set consent_version = 'forged' $$,
  '42501', null, 'A cannot rewrite the consent version'
);

select lives_ok(
  $$ insert into public.profiles (birth_year, sex, smoking_status, packs_per_day, smoking_years, years_since_quitting)
     values (1970, 'female', 'former', 1.5, 20, 5) $$,
  'A can create a profile after consenting'
);

select is(
  (select pack_years from public.profiles), 30.0::numeric,
  'pack_years is packs_per_day * smoking_years'
);

select lives_ok(
  $$ update public.profiles set birth_year = 1971 $$,
  'A can update their own profile'
);

select throws_ok(
  $$ update public.profiles set smoking_status = 'never' $$,
  '23514', null, 'a never-smoker cannot keep smoking fields'
);

select throws_ok(
  $$ update public.profiles set created_at = '2000-01-01' $$,
  '42501', null, 'A cannot rewrite server-owned timestamps'
);

-- --- As user B -------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select is((select count(*) from public.profiles), 0::bigint, 'B sees none of A''s profile');
select is((select count(*) from public.health_data_consents), 0::bigint, 'B sees none of A''s consents');

select lives_ok(
  $$ update public.profiles set birth_year = 1900 where user_id = '11111111-1111-1111-1111-111111111111' $$,
  'B''s update of A''s profile runs but matches no rows'
);
select lives_ok(
  $$ delete from public.profiles where user_id = '11111111-1111-1111-1111-111111111111' $$,
  'B''s delete of A''s profile runs but matches no rows'
);
select lives_ok(
  $$ update public.health_data_consents set withdrawn_at = now()
     where user_id = '11111111-1111-1111-1111-111111111111' $$,
  'B''s withdrawal of A''s consent runs but matches no rows'
);

select throws_ok(
  $$ insert into public.health_data_consents (user_id, consent_version, locale)
     values ('11111111-1111-1111-1111-111111111111', '2026-09-27', 'pl') $$,
  '42501', null, 'B cannot grant consent on A''s behalf'
);

-- --- As anon ---------------------------------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon cannot read profiles');
select throws_ok($$ select * from public.health_data_consents $$, '42501', null, 'anon cannot read consents');
select throws_ok(
  $$ select public.withdraw_health_data_consent() $$, '42501', null, 'anon cannot call the withdraw function'
);

-- --- As postgres: A's rows survived B -------------------------------------------------------------------------
reset role;

select is(
  (select birth_year from public.profiles where user_id = '11111111-1111-1111-1111-111111111111'), 1971::smallint,
  'A''s profile is unchanged by B'
);
select is(
  (select count(*) from public.health_data_consents
   where user_id = '11111111-1111-1111-1111-111111111111' and withdrawn_at is null),
  1::bigint, 'A''s consent is still active after B'
);

-- --- A withdraws ------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select lives_ok($$ select public.withdraw_health_data_consent() $$, 'A can withdraw consent');
select is((select count(*) from public.profiles), 0::bigint, 'withdrawal deletes A''s profile');
select is(
  (select count(*) from public.health_data_consents where withdrawn_at is not null), 1::bigint,
  'withdrawal keeps the consent row, stamped withdrawn'
);

select throws_ok(
  $$ insert into public.profiles (birth_year, sex, smoking_status) values (1980, 'female', 'never') $$,
  '42501', null, 'A cannot create a profile after withdrawing'
);

select lives_ok(
  $$ update public.health_data_consents set withdrawn_at = null $$,
  'reviving a withdrawn consent runs but matches no rows'
);

reset role;
select is(
  (select count(*) from public.health_data_consents
   where user_id = '11111111-1111-1111-1111-111111111111' and withdrawn_at is null),
  0::bigint, 'A''s withdrawn consent stays withdrawn'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.health_data_consents (consent_version, locale) values ('2026-09-27', 'en') $$,
  'A can consent again after withdrawing'
);
select is((select count(*) from public.health_data_consents), 2::bigint, 'the new consent is a new row');

select * from finish();
rollback;
