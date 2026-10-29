-- The API's date and age rules and the consent version format, mirrored in the database (F-20, app_rule_checks).
-- Run with `npx supabase test db`. Everything happens in one transaction that is rolled back. Dates and years are
-- computed from Warsaw "now", never written as literals, so the file passes on any calendar day. Refusals assert the
-- rule's own message: the static checks on these tables raise 23514 too.
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

-- Fixtures, inserted as postgres: active catalog rows of our own, so the test doesn't depend on snapshot data.
insert into public.screening_catalog (
  slug, status, name_pl, name_en, summary_pl, summary_en, how_to_access_pl, how_to_access_en,
  eligibility, interval_kind, interval_months, evidence_level, evidence_source, nfz_funded, referral_required,
  sources
)
select s, 'active', 'Aktywne', 'Active', 'Opis', 'Summary', 'Dostęp', 'Access',
  '[{"age_min": 18}]', 'fixed', 24, 1, 'USPSTF', true, false, '[{"url": "https://example.com"}]'
from unnest(array['rules-1', 'rules-2', 'rules-3', 'rules-4']) as s;

-- A: consent and a profile (40 years old). B: consent, no profile. C, D: no consent yet (consent cases).
-- E: consent, no profile yet (profile cases). P: consent and an under-age profile written as postgres.
insert into auth.users (id, email) values
  ('ac000000-0000-0000-0000-00000000000a', 'rules-a@example.com'),
  ('ac000000-0000-0000-0000-00000000000b', 'rules-b@example.com'),
  ('ac000000-0000-0000-0000-00000000000c', 'rules-c@example.com'),
  ('ac000000-0000-0000-0000-00000000000d', 'rules-d@example.com'),
  ('ac000000-0000-0000-0000-00000000000e', 'rules-e@example.com'),
  ('ac000000-0000-0000-0000-0000000000ff', 'rules-p@example.com');
insert into public.health_data_consents (user_id, consent_version, locale) values
  ('ac000000-0000-0000-0000-00000000000a', '2026-09-27', 'pl'),
  ('ac000000-0000-0000-0000-00000000000b', '2026-09-27', 'pl'),
  ('ac000000-0000-0000-0000-00000000000e', '2026-09-27', 'pl'),
  ('ac000000-0000-0000-0000-0000000000ff', '2026-09-27', 'pl');
insert into public.profiles (user_id, birth_year, sex, smoking_status) values
  ('ac000000-0000-0000-0000-00000000000a',
   extract(year from now() at time zone 'Europe/Warsaw')::int - 40, 'female', 'never'),
  ('ac000000-0000-0000-0000-0000000000ff',
   extract(year from now() at time zone 'Europe/Warsaw')::int - 10, 'male', 'never');
-- A plan of A's whose day passed a month ago.
insert into public.screening_plans (user_id, catalog_slug, appointment_date) values
  ('ac000000-0000-0000-0000-00000000000a', 'rules-3', (now() at time zone 'Europe/Warsaw')::date - 30);

-- --- Plans, as A ------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ac000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.screening_plans (catalog_slug, appointment_date)
     values ('rules-1', (now() at time zone 'Europe/Warsaw')::date - 1) $$,
  'a plan dated yesterday is accepted (one day of slack)'
);
select throws_ok(
  $$ insert into public.screening_plans (catalog_slug, appointment_date)
     values ('rules-2', (now() at time zone 'Europe/Warsaw')::date - 2) $$,
  '23514', 'appointment_date is outside the planning window', 'a plan dated two days ago is refused'
);
select lives_ok(
  $$ insert into public.screening_plans (catalog_slug, appointment_date) values ('rules-2', null) $$,
  'a plan without a date is accepted'
);
select lives_ok(
  $$ update public.screening_plans
     set appointment_date = ((now() at time zone 'Europe/Warsaw')::date + interval '2 years')::date
     where catalog_slug = 'rules-2' $$,
  'a date two years ahead is accepted'
);
select lives_ok(
  $$ update public.screening_plans
     set appointment_date = ((now() at time zone 'Europe/Warsaw')::date + interval '2 years')::date + 1
     where catalog_slug = 'rules-2' $$,
  'a date two years and a day ahead is accepted (29 Feb slack)'
);
select throws_ok(
  $$ update public.screening_plans
     set appointment_date = ((now() at time zone 'Europe/Warsaw')::date + interval '2 years')::date + 2
     where catalog_slug = 'rules-2' $$,
  '23514', 'appointment_date is outside the planning window', 'a date two years and two days ahead is refused'
);
select throws_ok(
  $$ update public.screening_plans set appointment_date = (now() at time zone 'Europe/Warsaw')::date - 2
     where catalog_slug = 'rules-1' $$,
  '23514', 'appointment_date is outside the planning window', 're-dating a plan to two days ago is refused'
);
select lives_ok(
  $$ update public.screening_plans set appointment_date = (now() at time zone 'Europe/Warsaw')::date - 30
     where catalog_slug = 'rules-3' $$,
  'a passed plan can be saved again with its unchanged date'
);
select throws_ok(
  $$ insert into public.screening_plans (catalog_slug, appointment_date)
     values ('rules-3', (now() at time zone 'Europe/Warsaw')::date - 2)
     on conflict (user_id, catalog_slug) do update set appointment_date = excluded.appointment_date $$,
  '23514', 'appointment_date is outside the planning window', 'an upsert of a passed plan to a past date is refused'
);
select lives_ok(
  $$ update public.screening_plans set appointment_date = null where catalog_slug = 'rules-3' $$,
  'a passed plan can be cleared to "no date"'
);

reset role;
select lives_ok(
  $$ insert into public.screening_plans (user_id, catalog_slug, appointment_date)
     values ('ac000000-0000-0000-0000-00000000000a', 'rules-4', (now() at time zone 'Europe/Warsaw')::date - 400) $$,
  'postgres may write a past date (only client roles are checked)'
);

-- --- Done records, as A (born 40 years ago) ----------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ac000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.screening_completions (catalog_slug, last_done_month)
     values ('rules-1', date_trunc('month', (now() at time zone 'Europe/Warsaw')::date::timestamp)::date) $$,
  'this month is accepted'
);
select throws_ok(
  $$ insert into public.screening_completions (catalog_slug, last_done_month)
     values ('rules-2', (date_trunc('month', (now() at time zone 'Europe/Warsaw')::date::timestamp)
                         + interval '1 month')::date) $$,
  '23514', 'last_done_month is after the current month', 'next month is refused'
);
select lives_ok(
  $$ insert into public.screening_completions (catalog_slug, last_done_month)
     values ('rules-2', make_date(extract(year from now() at time zone 'Europe/Warsaw')::int - 40, 1, 1)) $$,
  'January of the birth year is accepted'
);
select throws_ok(
  $$ update public.screening_completions
     set last_done_month = make_date(extract(year from now() at time zone 'Europe/Warsaw')::int - 41, 12, 1)
     where catalog_slug = 'rules-2' $$,
  '23514', 'last_done_month is before the birth year', 'moving the month before the birth year is refused'
);
select throws_ok(
  $$ update public.screening_completions
     set last_done_month = (date_trunc('month', (now() at time zone 'Europe/Warsaw')::date::timestamp)
                            + interval '1 month')::date
     where catalog_slug = 'rules-1' $$,
  '23514', 'last_done_month is after the current month', 'moving the month to next month is refused'
);
select lives_ok(
  $$ insert into public.screening_completions (catalog_slug, last_done_month, last_done_on)
     values ('rules-3', date_trunc('month', (now() at time zone 'Europe/Warsaw')::date::timestamp)::date,
             (now() at time zone 'Europe/Warsaw')::date) $$,
  'a last exam day of today is accepted'
);
-- The later day sits in its own month, so only the day rule can refuse it, on any calendar day.
select throws_ok(
  $$ insert into public.screening_completions (catalog_slug, last_done_month, last_done_on)
     values ('rules-4', date_trunc('month', ((now() at time zone 'Europe/Warsaw')::date + 1)::timestamp)::date,
             (now() at time zone 'Europe/Warsaw')::date + 1) $$,
  '23514', 'last_done_on is after today', 'a last exam day of tomorrow is refused'
);
select throws_ok(
  $$ update public.screening_completions
     set last_done_month = date_trunc('month', ((now() at time zone 'Europe/Warsaw')::date + 1)::timestamp)::date,
         last_done_on = (now() at time zone 'Europe/Warsaw')::date + 1
     where catalog_slug = 'rules-3' $$,
  '23514', 'last_done_on is after today', 'moving the last exam day to tomorrow is refused'
);

select set_config('request.jwt.claims', '{"sub":"ac000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select lives_ok(
  $$ insert into public.screening_completions (catalog_slug, last_done_month) values ('rules-1', '1950-01-01') $$,
  'without a profile the birth-year bound is skipped'
);

-- --- Profiles, as E ---------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"ac000000-0000-0000-0000-00000000000e","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.profiles (birth_year, sex, smoking_status)
     values (extract(year from now() at time zone 'Europe/Warsaw')::int - 17, 'female', 'never') $$,
  '23514', 'birth_year is below the minimum age', 'a 17-year-old profile is refused'
);
select lives_ok(
  $$ insert into public.profiles (birth_year, sex, smoking_status)
     values (extract(year from now() at time zone 'Europe/Warsaw')::int - 18, 'female', 'never') $$,
  'an 18-year-old profile is accepted'
);
select lives_ok(
  $$ update public.profiles set smoking_status = 'current', packs_per_day = 1, smoking_years = 18 $$,
  'smoking for as many years as the age is accepted'
);
select throws_ok(
  $$ update public.profiles set smoking_years = 19 $$,
  '23514', 'smoking years exceed the age', 'smoking for more years than the age is refused'
);
select throws_ok(
  $$ update public.profiles set smoking_status = 'former', smoking_years = 10, years_since_quitting = 9 $$,
  '23514', 'smoking years exceed the age', 'years smoked plus years since quitting above the age are refused'
);
select throws_ok(
  $$ update public.profiles set birth_year = extract(year from now() at time zone 'Europe/Warsaw')::int - 17 $$,
  '23514', 'birth_year is below the minimum age', 'moving the birth year under 18 is refused'
);

select set_config('request.jwt.claims', '{"sub":"ac000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);
select lives_ok(
  $$ update public.profiles set reminders_enabled = true, reminders_locale = 'pl' $$,
  'the reminder toggle does not re-check an existing profile'
);

-- --- Consent version ---------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"ac000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.health_data_consents (consent_version, locale) values ('forged', 'pl') $$,
  '23514',
  'new row for relation "health_data_consents" violates check constraint "health_data_consents_version_format"',
  'a free-text consent version is refused'
);
select throws_ok(
  $$ insert into public.health_data_consents (consent_version, locale) values ('2026-9-30', 'pl') $$,
  '23514',
  'new row for relation "health_data_consents" violates check constraint "health_data_consents_version_format"',
  'a consent version without zero padding is refused'
);
select lives_ok(
  $$ insert into public.health_data_consents (consent_version, locale) values ('2026-09-30', 'pl') $$,
  'a dated consent version is accepted'
);
select set_config('request.jwt.claims', '{"sub":"ac000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
select lives_ok(
  $$ insert into public.health_data_consents (consent_version, locale) values ('2026-09-30.2', 'pl') $$,
  'a dated consent version with a .N suffix is accepted'
);

reset role;
select is(
  (select convalidated from pg_constraint where conname = 'health_data_consents_version_format'), true,
  'the consent version check is validated (existing rows checked)'
);

-- --- Function grants ---------------------------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.validate_screening_plan()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.validate_screening_plan()', 'EXECUTE')
    and not has_function_privilege('service_role', 'public.validate_screening_plan()', 'EXECUTE'),
  'no API role can execute validate_screening_plan'
);
select ok(
  not has_function_privilege('anon', 'public.validate_screening_completion()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.validate_screening_completion()', 'EXECUTE')
    and not has_function_privilege('service_role', 'public.validate_screening_completion()', 'EXECUTE'),
  'no API role can execute validate_screening_completion'
);
select ok(
  not has_function_privilege('anon', 'public.validate_profile()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.validate_profile()', 'EXECUTE')
    and not has_function_privilege('service_role', 'public.validate_profile()', 'EXECUTE'),
  'no API role can execute validate_profile'
);

select * from finish();
rollback;
