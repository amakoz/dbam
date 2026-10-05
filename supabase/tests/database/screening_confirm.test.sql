-- Exact day of the last exam and confirm_screening_plan (confirm-exam-and-recurrence).
-- Run with `npx supabase test db`. Everything happens in one transaction that is rolled back.
-- Plans are dated relative to today in Warsaw, the calendar the function uses; now() is fixed for the transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(50);

-- Fixtures, inserted as postgres: active catalog rows and one retired, so the test doesn't depend on snapshot data.
insert into public.screening_catalog (
  slug, status, name_pl, name_en, summary_pl, summary_en, how_to_access_pl, how_to_access_en,
  eligibility, interval_kind, interval_months, evidence_level, evidence_source, nfz_funded, referral_required,
  sources
)
select s, 'active', 'Badanie', 'Exam', 'Opis', 'Summary', 'Dostęp', 'Access',
  '[{"age_min": 50}]', 'fixed', 24, 1, 'USPSTF', true, false, '[{"url": "https://example.com"}]'
from unnest(array['test-a', 'test-b', 'test-c', 'test-d', 'test-e', 'test-f', 'test-g', 'test-h']) as s;
insert into public.screening_catalog (
  slug, status, name_pl, name_en, summary_pl, summary_en, how_to_access_pl, how_to_access_en,
  eligibility, interval_kind, interval_months, evidence_level, evidence_source, nfz_funded, referral_required,
  sources
) values
  ('test-retired', 'retired', 'Wycofane', 'Retired', 'Opis', 'Summary', 'Dostęp', 'Access',
   '[{"age_min": 50}]', 'no_known_interval', null, 2, 'USPSTF', false, true, '[{"url": "https://example.com"}]');

-- Users, created as postgres. A = 1111… (consents during the test), B = 2222… (never consents).
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');

-- --- Grants ----------------------------------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.confirm_screening_plan(text)', 'EXECUTE'),
  'anon cannot execute confirm_screening_plan'
);
select ok(
  has_function_privilege('authenticated', 'public.confirm_screening_plan(text)', 'EXECUTE'),
  'authenticated can execute confirm_screening_plan'
);
select ok(
  not has_function_privilege('service_role', 'public.confirm_screening_plan(text)', 'EXECUTE'),
  'service_role cannot execute confirm_screening_plan'
);
select ok(
  has_column_privilege('authenticated', 'public.screening_completions', 'last_done_on', 'INSERT')
    and has_column_privilege('authenticated', 'public.screening_completions', 'last_done_on', 'UPDATE'),
  'authenticated can insert and update last_done_on'
);
select ok(
  not has_column_privilege('anon', 'public.screening_completions', 'last_done_on', 'SELECT, INSERT, UPDATE, REFERENCES'),
  'anon holds no privileges on last_done_on'
);

-- --- Check: a day sits in its month ------------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.screening_completions (user_id, catalog_slug, last_done_month, last_done_on)
     values ('11111111-1111-1111-1111-111111111111', 'test-h', '2024-03-01', '2024-04-02') $$,
  '23514', null, 'a day outside its month is rejected'
);
select throws_ok(
  $$ insert into public.screening_completions (user_id, catalog_slug, last_done_month, last_done_on)
     values ('11111111-1111-1111-1111-111111111111', 'test-h', null, '2024-04-02') $$,
  '23514', null, 'a day without a month is rejected'
);
select lives_ok(
  $$ insert into public.screening_completions (user_id, catalog_slug, last_done_month, last_done_on)
     values ('11111111-1111-1111-1111-111111111111', 'test-h', '2024-04-01', '2024-04-30') $$,
  'a day inside its month is accepted'
);
select lives_ok(
  $$ update public.screening_completions set last_done_on = null
     where user_id = '11111111-1111-1111-1111-111111111111' and catalog_slug = 'test-h' $$,
  'a null day is accepted'
);
delete from public.screening_completions where user_id = '11111111-1111-1111-1111-111111111111';

-- --- Not authenticated -----------------------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select public.confirm_screening_plan('test-a') $$, '42501', null, 'anon cannot confirm a plan'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$ select public.confirm_screening_plan('test-a') $$, '42501', null,
  'a caller without a user id cannot confirm a plan'
);

-- --- As user A, with consent -----------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.health_data_consents (consent_version, locale) values ('2026-09-27', 'pl') $$,
  'A can grant consent'
);
-- a = yesterday, b = today, c = tomorrow, d = undated, e = yesterday over an existing done record,
-- f = yesterday (B tries to confirm it).
select lives_ok(
  $$ insert into public.screening_plans (catalog_slug, appointment_date) values
       ('test-a', (now() at time zone 'Europe/Warsaw')::date - 1),
       ('test-b', (now() at time zone 'Europe/Warsaw')::date),
       ('test-c', (now() at time zone 'Europe/Warsaw')::date + 1),
       ('test-d', null),
       ('test-e', (now() at time zone 'Europe/Warsaw')::date - 1),
       ('test-f', (now() at time zone 'Europe/Warsaw')::date - 1) $$,
  'A can plan six exams'
);
select lives_ok(
  $$ insert into public.screening_completions (catalog_slug, last_done_month) values ('test-e', '2020-01-01') $$,
  'A can mark an exam done with a month and no day'
);

-- Ledger rows for the yesterday plan, as postgres (no client can write the ledger).
reset role;
insert into public.appointment_reminders (plan_id, user_id, appointment_date)
select id, user_id, appointment_date from public.screening_plans
where user_id = '11111111-1111-1111-1111-111111111111' and catalog_slug = 'test-a';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- Yesterday: confirmed. The expected month comes from the date, so the 1st of a month works too.
select is(public.confirm_screening_plan('test-a'), 'confirmed', 'a plan dated yesterday is confirmed');
select is(
  (select last_done_on from public.screening_completions where catalog_slug = 'test-a'),
  (now() at time zone 'Europe/Warsaw')::date - 1,
  'the done record holds the appointment day'
);
select is(
  (select last_done_month from public.screening_completions where catalog_slug = 'test-a'),
  date_trunc('month', ((now() at time zone 'Europe/Warsaw')::date - 1)::timestamp)::date,
  'the done record holds the appointment month'
);
select is(
  (select count(*) from public.screening_plans where catalog_slug = 'test-a'), 0::bigint,
  'the confirmed plan is deleted'
);
select is(public.confirm_screening_plan('test-a'), 'not_found', 'a confirmed plan cannot be confirmed again');

-- Today: confirmed.
select is(public.confirm_screening_plan('test-b'), 'confirmed', 'a plan dated today is confirmed');
select is(
  (select last_done_on from public.screening_completions where catalog_slug = 'test-b'),
  (now() at time zone 'Europe/Warsaw')::date,
  'the done record holds today'
);
select is(
  (select count(*) from public.screening_plans where catalog_slug = 'test-b'), 0::bigint,
  'the plan dated today is deleted'
);

-- Tomorrow and undated: not due, nothing changes.
select is(public.confirm_screening_plan('test-c'), 'not_due', 'a plan dated tomorrow is not due');
select is(
  (select count(*) from public.screening_plans where catalog_slug = 'test-c'), 1::bigint,
  'the plan dated tomorrow is kept'
);
select is(
  (select count(*) from public.screening_completions where catalog_slug = 'test-c'), 0::bigint,
  'a plan that is not due records nothing'
);
select is(public.confirm_screening_plan('test-d'), 'not_due', 'an undated plan is not due');
select is(
  (select count(*) from public.screening_plans where catalog_slug = 'test-d'), 1::bigint,
  'the undated plan is kept'
);

select is(public.confirm_screening_plan('no-such-exam'), 'not_found', 'an unknown slug is not found');
select is(public.confirm_screening_plan('test-g'), 'not_found', 'an exam without a plan is not found');

-- An existing done record (month known, day null) is overwritten.
select is(public.confirm_screening_plan('test-e'), 'confirmed', 'a plan over an existing done record is confirmed');
select is(
  (select array[last_done_month, last_done_on] from public.screening_completions where catalog_slug = 'test-e'),
  array[
    date_trunc('month', ((now() at time zone 'Europe/Warsaw')::date - 1)::timestamp)::date,
    (now() at time zone 'Europe/Warsaw')::date - 1
  ],
  'the existing done record gets the new month and day'
);
select is(
  (select count(*) from public.screening_completions where catalog_slug = 'test-e'), 1::bigint,
  'the upsert keeps one done record'
);

-- Mark done (month only) clears the day. A pre-S-05 Worker changes the month alone: the trigger clears the day, so
-- neither another month nor "don't know" breaks the check.
select lives_ok(
  $$ update public.screening_completions set last_done_month = '2020-04-01' where catalog_slug = 'test-a' $$,
  'changing the month alone (a pre-S-05 Worker) succeeds'
);
select is(
  (select last_done_on from public.screening_completions where catalog_slug = 'test-a'), null::date,
  'changing the month alone clears the day'
);
select lives_ok(
  $$ update public.screening_completions set last_done_month = date_trunc('month', current_date)::date,
       last_done_on = current_date where catalog_slug = 'test-a' $$,
  'a month and day set together are kept'
);
select is(
  (select last_done_on from public.screening_completions where catalog_slug = 'test-a'), current_date,
  'the trigger keeps a day the statement sets'
);
select lives_ok(
  $$ update public.screening_completions set last_done_month = null where catalog_slug = 'test-a' $$,
  '"don''t know" over a confirmed day succeeds and clears it'
);
select lives_ok(
  $$ update public.screening_completions set last_done_month = '2020-05-01', last_done_on = null
     where catalog_slug = 'test-a' $$,
  'mark done can move to another month by clearing the day'
);
select is(
  (select array[last_done_month, last_done_on] from public.screening_completions where catalog_slug = 'test-a'),
  array['2020-05-01'::date, null::date],
  'the done record holds the new month and no day'
);

-- --- As user B (never consented) -------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select is(public.confirm_screening_plan('test-f'), 'not_found', 'B cannot confirm A''s plan');

-- A plan for B, inserted as postgres (bypassing the consent gate).
reset role;
insert into public.screening_plans (user_id, catalog_slug, appointment_date) values
  ('22222222-2222-2222-2222-222222222222', 'test-g', (now() at time zone 'Europe/Warsaw')::date - 1);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select throws_ok(
  $$ select public.confirm_screening_plan('test-g') $$, '42501', null,
  'B cannot confirm a plan without ever consenting'
);

-- A plan for A on a retired entry, inserted as postgres.
reset role;
insert into public.screening_plans (user_id, catalog_slug, appointment_date) values
  ('11111111-1111-1111-1111-111111111111', 'test-retired', (now() at time zone 'Europe/Warsaw')::date - 1);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select throws_ok(
  $$ select public.confirm_screening_plan('test-retired') $$, '42501', null,
  'A cannot confirm a plan for a retired exam'
);

-- --- As postgres: ledger, isolation and failed confirms -----------------------------------------------------------
reset role;

select is(
  (select count(*) from public.appointment_reminders where user_id = '11111111-1111-1111-1111-111111111111'),
  0::bigint, 'confirming a plan deletes its reminder ledger rows'
);
select is(
  (select appointment_date from public.screening_plans
   where user_id = '11111111-1111-1111-1111-111111111111' and catalog_slug = 'test-f'),
  (now() at time zone 'Europe/Warsaw')::date - 1,
  'A''s plan is untouched by B'
);
select is(
  (select count(*) from public.screening_plans
   where user_id = '22222222-2222-2222-2222-222222222222' and catalog_slug = 'test-g'),
  1::bigint, 'a failed confirm keeps B''s plan'
);
select is(
  (select count(*) from public.screening_completions where user_id = '22222222-2222-2222-2222-222222222222'),
  0::bigint, 'a failed confirm records nothing for B'
);
select is(
  (select count(*) from public.screening_plans
   where user_id = '11111111-1111-1111-1111-111111111111' and catalog_slug = 'test-retired'),
  1::bigint, 'a failed confirm keeps the plan for the retired exam'
);

-- --- As user A, after withdrawal ---------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select lives_ok($$ select public.withdraw_health_data_consent() $$, 'A can withdraw consent');

-- Withdrawal deletes plans, so a plan dated yesterday is put back as postgres.
reset role;
insert into public.screening_plans (user_id, catalog_slug, appointment_date) values
  ('11111111-1111-1111-1111-111111111111', 'test-h', (now() at time zone 'Europe/Warsaw')::date - 1);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select throws_ok(
  $$ select public.confirm_screening_plan('test-h') $$, '42501', null,
  'A cannot confirm a plan after withdrawing'
);
select is(
  (select count(*) from public.screening_plans where catalog_slug = 'test-h'), 1::bigint,
  'a failed confirm after withdrawal keeps the plan'
);

select * from finish();
rollback;
