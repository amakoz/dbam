-- Reminder opt-in, ledger and cron-only functions (S-04), and the service_role lockdown on user data.
-- Run with `npx supabase test db`. Everything happens in one transaction that is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(68);

-- Fixtures, inserted as postgres: active catalog rows, so the test doesn't depend on snapshot data.
insert into public.screening_catalog (
  slug, status, name_pl, name_en, summary_pl, summary_en, how_to_access_pl, how_to_access_en,
  eligibility, interval_kind, interval_months, evidence_level, evidence_source, nfz_funded, referral_required,
  sources
)
select s, 'active', 'Badanie', 'Exam', 'Opis', 'Summary', 'Dostęp', 'Access',
  '[{"age_min": 50}]', 'fixed', 24, 1, 'USPSTF', true, false, '[{"url": "https://example.com"}]'
from unnest(array['test-a', 'test-b', 'test-c', 'test-d', 'test-e']) as s;

-- Users, created as postgres. A = 1111… (opts in during the test), B = 2222… (opted out), C = 3333… (reminders
-- on, consent withdrawn), D = 4444… (active consent, no profile), E = 5555… (added for the limit test).
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'c@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'd@example.com'),
  ('55555555-5555-5555-5555-555555555555', 'e@example.com');

insert into public.health_data_consents (user_id, consent_version, locale) values
  ('22222222-2222-2222-2222-222222222222', '2026-09-27', 'pl'),
  ('44444444-4444-4444-4444-444444444444', '2026-09-27', 'pl');
insert into public.health_data_consents (user_id, consent_version, locale, granted_at, withdrawn_at) values
  ('33333333-3333-3333-3333-333333333333', '2026-09-27', 'pl', now(), now());

insert into public.profiles (user_id, birth_year, sex, smoking_status, reminders_enabled) values
  ('22222222-2222-2222-2222-222222222222', 1970, 'male', 'never', false),
  ('33333333-3333-3333-3333-333333333333', 1970, 'male', 'never', true);

-- "Today" is 2027-03-10 and the lead is 3 days, so the window is 2027-03-11 .. 2027-03-13.
insert into public.screening_plans (user_id, catalog_slug, appointment_date) values
  ('22222222-2222-2222-2222-222222222222', 'test-a', '2027-03-11'),
  ('33333333-3333-3333-3333-333333333333', 'test-a', '2027-03-11'),
  ('44444444-4444-4444-4444-444444444444', 'test-a', '2027-03-11');

-- --- Grants ----------------------------------------------------------------------------------------------------
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'reminders_enabled', 'UPDATE')
    and has_column_privilege('authenticated', 'public.profiles', 'reminders_locale', 'UPDATE'),
  'authenticated can update the reminder opt-in and locale'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'reminders_enabled_at', 'INSERT, UPDATE'),
  'authenticated cannot write reminders_enabled_at'
);
select ok(
  not (
    has_column_privilege('authenticated', 'public.profiles', 'reminders_enabled', 'INSERT')
    or has_column_privilege('authenticated', 'public.profiles', 'reminders_locale', 'INSERT')
  ),
  'authenticated cannot insert the reminder columns, so a new profile starts with reminders off'
);
-- has_table_privilege with a list is true if any one is held.
select ok(
  not has_table_privilege(
    'anon', 'public.appointment_reminders', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES'
  )
    and not has_any_column_privilege('anon', 'public.appointment_reminders', 'SELECT, INSERT, UPDATE, REFERENCES'),
  'anon holds no privileges on the reminder ledger'
);
select ok(
  not has_table_privilege(
    'authenticated', 'public.appointment_reminders', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES'
  )
    and not has_any_column_privilege(
      'authenticated', 'public.appointment_reminders', 'SELECT, INSERT, UPDATE, REFERENCES'
    ),
  'authenticated holds no privileges on the reminder ledger'
);
select ok(
  not has_table_privilege(
    'service_role', 'public.appointment_reminders', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES'
  )
    and not has_any_column_privilege(
      'service_role', 'public.appointment_reminders', 'SELECT, INSERT, UPDATE, REFERENCES'
    ),
  'service_role holds no privileges on the reminder ledger'
);
-- MAINTAIN exists only from Postgres 17.
select ok(
  case
    when current_setting('server_version_num')::int < 170000 then true
    else not (
      has_table_privilege('anon', 'public.appointment_reminders', 'MAINTAIN')
      or has_table_privilege('authenticated', 'public.appointment_reminders', 'MAINTAIN')
      or has_table_privilege('service_role', 'public.appointment_reminders', 'MAINTAIN')
      or has_table_privilege('service_role', 'public.profiles', 'MAINTAIN')
      or has_table_privilege('service_role', 'public.health_data_consents', 'MAINTAIN')
      or has_table_privilege('service_role', 'public.screening_plans', 'MAINTAIN')
      or has_table_privilege('service_role', 'public.screening_completions', 'MAINTAIN')
    )
  end,
  'no API role holds MAINTAIN on the ledger, nor service_role on user tables (PG17+)'
);

-- --- Guard: service_role reaches user data only through the reminder functions -------------------------------
-- Supabase's default privileges grant service_role everything on a new public table, so a future table that
-- forgets to revoke fails here. The catalog is public reference data and keeps SELECT.
select ok(
  (select count(*) from pg_tables where schemaname = 'public' and tablename <> 'screening_catalog') >= 5,
  'the guard covers the user tables'
);
select is_empty(
  $$ select tablename from pg_tables
     where schemaname = 'public' and tablename <> 'screening_catalog'
       and has_table_privilege(
         'service_role', format('%I.%I', schemaname, tablename), 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE'
       ) $$,
  'service_role holds no SELECT/INSERT/UPDATE/DELETE/TRUNCATE on any public table except the catalog'
);

-- --- Function grants -------------------------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.claim_due_appointment_reminders(date, int, text[], int)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.mark_appointment_reminders_sent(bigint[])', 'EXECUTE'),
  'anon cannot execute the reminder functions'
);
select ok(
  not has_function_privilege(
    'authenticated', 'public.claim_due_appointment_reminders(date, int, text[], int)', 'EXECUTE'
  )
    and not has_function_privilege('authenticated', 'public.mark_appointment_reminders_sent(bigint[])', 'EXECUTE'),
  'authenticated cannot execute the reminder functions'
);
select ok(
  has_function_privilege('service_role', 'public.claim_due_appointment_reminders(date, int, text[], int)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.mark_appointment_reminders_sent(bigint[])', 'EXECUTE'),
  'service_role can execute the reminder functions'
);

-- --- As user A: opt-in and its timestamp -----------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.health_data_consents (consent_version, locale) values ('2026-09-27', 'pl') $$,
  'A can grant consent'
);
select throws_ok(
  $$ insert into public.profiles (birth_year, sex, smoking_status, reminders_enabled)
     values (1970, 'female', 'never', true) $$,
  '42501', null, 'A cannot create a profile with reminders already on'
);
select lives_ok(
  $$ insert into public.profiles (birth_year, sex, smoking_status) values (1970, 'female', 'never') $$,
  'A can create a profile'
);
select is((select reminders_enabled from public.profiles), false, 'reminders are off by default');
select is(
  (select reminders_enabled_at from public.profiles), null::timestamptz, 'reminders_enabled_at is null while off'
);
select lives_ok(
  $$ update public.profiles set reminders_enabled = true, reminders_locale = 'en' $$,
  'A can turn reminders on'
);
select ok(
  (select reminders_enabled_at is not null from public.profiles), 'turning reminders on sets reminders_enabled_at'
);
select lives_ok($$ update public.profiles set reminders_enabled = false $$, 'A can turn reminders off');
select is(
  (select reminders_enabled_at from public.profiles), null::timestamptz,
  'turning reminders off clears reminders_enabled_at'
);
select throws_ok(
  $$ update public.profiles set reminders_enabled_at = now() $$,
  '42501', null, 'A cannot write reminders_enabled_at directly'
);
select throws_ok(
  $$ update public.profiles set reminders_locale = 'de' $$,
  '23514', null, 'the reminder locale must be pl or en'
);
select lives_ok($$ update public.profiles set reminders_enabled = true $$, 'A can turn reminders back on');

select throws_ok(
  $$ select * from public.claim_due_appointment_reminders('2027-03-10', 3, null, 100) $$,
  '42501', null, 'A cannot claim reminders'
);
select throws_ok(
  $$ select public.mark_appointment_reminders_sent(array[1]::bigint[]) $$,
  '42501', null, 'A cannot mark reminders sent'
);
select throws_ok(
  $$ select * from public.appointment_reminders $$, '42501', null, 'A cannot read the reminder ledger'
);

-- Plans at +1 and +3 (in the window), +0 and +4 (outside) and one without a date.
select lives_ok(
  $$ insert into public.screening_plans (catalog_slug, appointment_date) values
       ('test-a', '2027-03-11'), ('test-b', '2027-03-13'), ('test-c', '2027-03-10'), ('test-d', '2027-03-14'),
       ('test-e', null) $$,
  'A can plan five exams'
);

-- An update that leaves reminders on keeps the old timestamp (set to a known value with the trigger off).
reset role;
alter table public.profiles disable trigger profiles_set_reminders_enabled_at;
update public.profiles set reminders_enabled_at = '2020-01-01 00:00:00+00'
  where user_id = '11111111-1111-1111-1111-111111111111';
alter table public.profiles enable trigger profiles_set_reminders_enabled_at;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
update public.profiles set reminders_locale = 'en', reminders_enabled = true;
select is(
  (select reminders_enabled_at from public.profiles), '2020-01-01 00:00:00+00'::timestamptz,
  'an update that leaves reminders on keeps reminders_enabled_at'
);

-- --- As service_role ------------------------------------------------------------------------------------------
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select throws_ok($$ select * from public.profiles $$, '42501', null, 'service_role cannot read profiles');
select throws_ok($$ select * from public.screening_plans $$, '42501', null, 'service_role cannot read plans');
select throws_ok(
  $$ select * from public.appointment_reminders $$, '42501', null, 'service_role cannot read the reminder ledger'
);
select lives_ok(
  $$ select * from public.claim_due_appointment_reminders('2027-03-10', 3, null, 100) $$,
  'service_role can claim due reminders'
);
select throws_ok(
  $$ select * from public.claim_due_appointment_reminders('2027-03-10', 0, null, 100) $$,
  '22023', null, 'a lead of 0 days is rejected'
);
select throws_ok(
  $$ select * from public.claim_due_appointment_reminders('2027-03-10', 31, null, 100) $$,
  '22023', null, 'a lead of 31 days is rejected'
);
select throws_ok(
  $$ select * from public.claim_due_appointment_reminders('2027-03-10', 3, null, 0) $$,
  '22023', null, 'a limit of 0 is rejected'
);
select throws_ok(
  $$ select * from public.claim_due_appointment_reminders('2027-03-10', 3, null, 101) $$,
  '22023', null, 'a limit of 101 is rejected'
);
select throws_ok(
  $$ select * from public.claim_due_appointment_reminders('2027-03-10', null, null, 100) $$,
  '22023', null, 'a null lead is rejected'
);

select is(
  (select array_agg(user_id) from public.claim_due_appointment_reminders('2027-03-10', 3, null, 100)),
  array['11111111-1111-1111-1111-111111111111']::uuid[],
  'only A is claimed: not the opted-out user, the one without an active consent or the one without a profile'
);
select is(
  (select appointment_dates from public.claim_due_appointment_reminders('2027-03-10', 3, null, 100)),
  array['2027-03-11', '2027-03-13']::date[],
  'the plans at +1 and +3 are claimed in one row, dates ascending'
);
select is(
  (select cardinality(reminder_ids) from public.claim_due_appointment_reminders('2027-03-10', 3, null, 100)),
  2, 'two plans give two reminder ids'
);
select is(
  (select locale from public.claim_due_appointment_reminders('2027-03-10', 3, null, 100)), 'en',
  'the locale is the one stored with the opt-in'
);
select is(
  (select email from public.claim_due_appointment_reminders('2027-03-10', 3, null, 100)), 'a@example.com',
  'a null allowlist returns the email'
);
select is(
  (select email from public.claim_due_appointment_reminders('2027-03-10', 3, array['someone@example.com'], 100)),
  null::text, 'an allowlist without the user returns a null email'
);
select is(
  (select email from public.claim_due_appointment_reminders(
    '2027-03-10', 3, array['someone@example.com', 'A@Example.COM'], 100
  )),
  'a@example.com', 'the allowlist is compared case-insensitively'
);
select is(
  public.mark_appointment_reminders_sent(array[]::bigint[]), 0, 'service_role can mark; an empty list marks nothing'
);

-- --- As postgres: the ledger ----------------------------------------------------------------------------------
reset role;

select is(
  (select array_agg(p.catalog_slug order by p.catalog_slug)
   from public.appointment_reminders r join public.screening_plans p on p.id = r.plan_id
   where r.user_id = '11111111-1111-1111-1111-111111111111'),
  array['test-a', 'test-b'],
  'the ledger holds A''s +1 and +3 plans, not +0, +4 or the undated one'
);
select is(
  (select count(*) from public.appointment_reminders where user_id = '22222222-2222-2222-2222-222222222222'),
  0::bigint, 'an opted-out user gets no ledger row'
);
select is(
  (select count(*) from public.appointment_reminders where user_id = '33333333-3333-3333-3333-333333333333'),
  0::bigint, 'a user without an active consent gets no ledger row'
);
select is(
  (select count(*) from public.appointment_reminders where user_id = '44444444-4444-4444-4444-444444444444'),
  0::bigint, 'a user without a profile gets no ledger row'
);
select is(
  (select reminder_ids from public.claim_due_appointment_reminders('2027-03-10', 3, null, 100)),
  (select array_agg(id order by id) from public.appointment_reminders),
  'a repeated claim before mark returns the same ids'
);
select is((select count(*) from public.appointment_reminders), 2::bigint, 'repeated claims add no duplicate rows');

-- Opting out between claim and send: the unsent rows are no longer returned.
update public.profiles set reminders_enabled = false where user_id = '11111111-1111-1111-1111-111111111111';
select is(
  (select count(*) from public.claim_due_appointment_reminders('2027-03-10', 3, null, 100)), 0::bigint,
  'after opting out, A''s unsent rows are not returned'
);
update public.profiles set reminders_enabled = true where user_id = '11111111-1111-1111-1111-111111111111';

-- Re-dating a claimed plan from +3 to +2, as A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
update public.screening_plans set appointment_date = '2027-03-12' where catalog_slug = 'test-b';
reset role;

select is(
  (select appointment_dates from public.claim_due_appointment_reminders('2027-03-10', 3, null, 100)),
  array['2027-03-11', '2027-03-12']::date[],
  'a re-dated plan is claimed for its new date, and the old date is not returned'
);
select is(
  (select count(*) from public.appointment_reminders r join public.screening_plans p on p.id = r.plan_id
   where p.catalog_slug = 'test-b' and r.user_id = '11111111-1111-1111-1111-111111111111'),
  2::bigint, 'the re-dated plan has a new ledger row next to the old one'
);
select ok(
  not (
    array[(select id from public.appointment_reminders where appointment_date = '2027-03-13')]
    <@ (select reminder_ids from public.claim_due_appointment_reminders('2027-03-10', 3, null, 100))
  ),
  'the old date''s row is not among the returned ids'
);

-- --- Mark sent ------------------------------------------------------------------------------------------------
select is(
  (select public.mark_appointment_reminders_sent(reminder_ids)
   from public.claim_due_appointment_reminders('2027-03-10', 3, null, 100)),
  2, 'mark stamps the claimed rows and returns the count'
);
select is(
  public.mark_appointment_reminders_sent(
    (select array_agg(id) from public.appointment_reminders where sent_at is not null)
  ),
  0, 'mark is a no-op on already-sent ids'
);
select is(
  (select count(*) from public.claim_due_appointment_reminders('2027-03-10', 3, null, 100)), 0::bigint,
  'sent rows are no longer returned'
);
select ok(
  (select sent_at is null from public.appointment_reminders where appointment_date = '2027-03-13'),
  'the row for the old date stays unsent'
);

-- --- Limit and order ------------------------------------------------------------------------------------------
insert into public.health_data_consents (user_id, consent_version, locale) values
  ('55555555-5555-5555-5555-555555555555', '2026-09-27', 'pl');
insert into public.profiles (user_id, birth_year, sex, smoking_status, reminders_enabled) values
  ('55555555-5555-5555-5555-555555555555', 1970, 'male', 'never', true);
insert into public.screening_plans (user_id, catalog_slug, appointment_date) values
  ('55555555-5555-5555-5555-555555555555', 'test-a', '2027-03-12');
update public.screening_plans set appointment_date = '2027-03-11'
  where user_id = '11111111-1111-1111-1111-111111111111' and catalog_slug = 'test-c';

select is(
  (select array_agg(user_id) from public.claim_due_appointment_reminders('2027-03-10', 3, null, 1)),
  array['11111111-1111-1111-1111-111111111111']::uuid[],
  'p_limit caps the rows, taking the lowest user id first'
);
select is(
  (select array_agg(user_id) from public.claim_due_appointment_reminders('2027-03-10', 3, null, 100)),
  array['11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555']::uuid[],
  'rows are ordered by user id'
);

-- --- Cascade --------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select lives_ok(
  $$ delete from public.screening_plans where catalog_slug = 'test-b' $$, 'A can delete a plan that has reminders'
);
reset role;
select is(
  (select count(*) from public.appointment_reminders
   where user_id = '11111111-1111-1111-1111-111111111111' and appointment_date in ('2027-03-12', '2027-03-13')),
  0::bigint, 'deleting a plan deletes its ledger rows'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select lives_ok($$ select public.withdraw_health_data_consent() $$, 'A can withdraw consent');
reset role;

select is(
  (select count(*) from public.appointment_reminders where user_id = '11111111-1111-1111-1111-111111111111'),
  0::bigint, 'withdrawal leaves A with no ledger rows'
);
select is(
  (select count(*) from public.profiles where user_id = '11111111-1111-1111-1111-111111111111'),
  0::bigint, 'withdrawal leaves A with no profile'
);
select is(
  (select array_agg(user_id) from public.claim_due_appointment_reminders('2027-03-10', 3, null, 100)),
  array['55555555-5555-5555-5555-555555555555']::uuid[],
  'after withdrawal only the other opted-in user is claimed'
);

select * from finish();
rollback;
