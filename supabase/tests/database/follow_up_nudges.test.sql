-- Follow-up nudge ledger and cron-only functions (S-07). Run with `npx supabase test db`.
-- Everything happens in one transaction that is rolled back.
-- "Today" is 2027-03-10 (Warsaw, UTC+1), a schedule nudge is due after 14 days and a confirm nudge after 7.
begin;
create extension if not exists pgtap with schema extensions;
select plan(56);

-- Fixtures, inserted as postgres: active catalog rows and one retired, so the test doesn't depend on snapshot data.
insert into public.screening_catalog (
  slug, status, name_pl, name_en, summary_pl, summary_en, how_to_access_pl, how_to_access_en,
  eligibility, interval_kind, interval_months, evidence_level, evidence_source, nfz_funded, referral_required,
  sources
)
select s, st, 'Badanie', 'Exam', 'Opis', 'Summary', 'Dostęp', 'Access',
  '[{"age_min": 18}]', 'fixed', 12, 2, 'USPSTF', true, false, '[{"url": "https://example.com"}]'
from (values
  ('nudge-a', 'active'), ('nudge-b', 'active'), ('nudge-c', 'active'), ('nudge-d', 'active'),
  ('nudge-ret', 'retired'), ('nudge-ret2', 'retired')
) as t (s, st);

-- Users (f0…NN): 01 = both kinds (locale en), 02 = below every threshold, 03 = opted out, 04 = consent withdrawn,
-- 05 = no email, 06 = retired entry, 07 = confirm only, 08 = schedule only, 09 = got an appointment reminder on
-- "today" (Warsaw), 10 = got a due-screening reminder today, 11 = got an appointment reminder yesterday.
-- md5(user id || '2027-03-10') sorts 01 < 11 < 08 < 07, so the confirm-first order differs from md5 alone.
insert into auth.users (id, email) values
  ('f0000000-0000-0000-0000-000000000001', 'one@example.com'),
  ('f0000000-0000-0000-0000-000000000002', 'two@example.com'),
  ('f0000000-0000-0000-0000-000000000003', 'three@example.com'),
  ('f0000000-0000-0000-0000-000000000004', 'four@example.com'),
  ('f0000000-0000-0000-0000-000000000005', null),
  ('f0000000-0000-0000-0000-000000000006', 'six@example.com'),
  ('f0000000-0000-0000-0000-000000000007', 'seven@example.com'),
  ('f0000000-0000-0000-0000-000000000008', 'eight@example.com'),
  ('f0000000-0000-0000-0000-000000000009', 'nine@example.com'),
  ('f0000000-0000-0000-0000-000000000010', 'ten@example.com'),
  ('f0000000-0000-0000-0000-000000000011', 'eleven@example.com'),
  ('f0000000-0000-0000-0000-000000000012', 'twelve@example.com');

insert into public.health_data_consents (user_id, consent_version, locale)
select u, '2026-09-27', 'pl'
from unnest(array[
  'f0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002',
  'f0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000005',
  'f0000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000007',
  'f0000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0000-000000000009',
  'f0000000-0000-0000-0000-000000000010', 'f0000000-0000-0000-0000-000000000011',
  'f0000000-0000-0000-0000-000000000012'
]::uuid[]) as u;
insert into public.health_data_consents (user_id, consent_version, locale, granted_at, withdrawn_at) values
  ('f0000000-0000-0000-0000-000000000004', '2026-09-27', 'pl', now(), now());

insert into public.profiles (user_id, birth_year, sex, smoking_status, reminders_enabled, reminders_locale)
select u, 1970, 'male', 'never', u <> 'f0000000-0000-0000-0000-000000000003',
  case when u = 'f0000000-0000-0000-0000-000000000001' then 'en' end
from unnest(array[
  'f0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002',
  'f0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000004',
  'f0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000006',
  'f0000000-0000-0000-0000-000000000007', 'f0000000-0000-0000-0000-000000000008',
  'f0000000-0000-0000-0000-000000000009', 'f0000000-0000-0000-0000-000000000010',
  'f0000000-0000-0000-0000-000000000011', 'f0000000-0000-0000-0000-000000000012'
]::uuid[]) as u;

-- Plans. updated_at is set explicitly on insert (the BEFORE UPDATE trigger does not fire on insert), noon UTC so
-- the Warsaw date is the same day. 14 days before 2027-03-10 is 2027-02-24; 7 days before is 2027-03-03.
insert into public.screening_plans (user_id, catalog_slug, appointment_date, updated_at) values
  -- 01: exactly at both thresholds.
  ('f0000000-0000-0000-0000-000000000001', 'nudge-a', null, '2027-02-24 12:00:00+00'),
  ('f0000000-0000-0000-0000-000000000001', 'nudge-b', '2027-03-03', '2027-02-01 12:00:00+00'),
  -- 02: one day short of a schedule nudge, one day short of a confirm nudge, dated today, dated in the future.
  ('f0000000-0000-0000-0000-000000000002', 'nudge-a', null, '2027-02-25 12:00:00+00'),
  ('f0000000-0000-0000-0000-000000000002', 'nudge-b', '2027-03-04', '2027-02-01 12:00:00+00'),
  ('f0000000-0000-0000-0000-000000000002', 'nudge-c', '2027-03-10', '2027-02-01 12:00:00+00'),
  ('f0000000-0000-0000-0000-000000000002', 'nudge-d', '2027-03-20', '2027-02-01 12:00:00+00'),
  -- 03, 04, 05: eligible plans, but opted out / consent withdrawn / no email.
  ('f0000000-0000-0000-0000-000000000003', 'nudge-a', null, '2027-02-01 12:00:00+00'),
  ('f0000000-0000-0000-0000-000000000003', 'nudge-b', '2027-03-01', '2027-02-01 12:00:00+00'),
  ('f0000000-0000-0000-0000-000000000004', 'nudge-a', null, '2027-02-01 12:00:00+00'),
  ('f0000000-0000-0000-0000-000000000004', 'nudge-b', '2027-03-01', '2027-02-01 12:00:00+00'),
  ('f0000000-0000-0000-0000-000000000005', 'nudge-a', null, '2027-02-01 12:00:00+00'),
  -- 06: a retired entry.
  ('f0000000-0000-0000-0000-000000000006', 'nudge-ret', null, '2027-02-01 12:00:00+00'),
  ('f0000000-0000-0000-0000-000000000006', 'nudge-ret2', '2027-03-01', '2027-02-01 12:00:00+00'),
  -- 07: confirm only. 08: schedule only.
  ('f0000000-0000-0000-0000-000000000007', 'nudge-a', '2027-03-01', '2027-02-01 12:00:00+00'),
  ('f0000000-0000-0000-0000-000000000008', 'nudge-a', null, '2027-02-10 12:00:00+00'),
  -- 09, 10, 11: schedule plans of users who may already have been emailed today.
  ('f0000000-0000-0000-0000-000000000009', 'nudge-a', null, '2027-02-01 12:00:00+00'),
  ('f0000000-0000-0000-0000-000000000009', 'nudge-c', '2027-03-11', '2027-02-01 12:00:00+00'),
  ('f0000000-0000-0000-0000-000000000010', 'nudge-a', null, '2027-02-01 12:00:00+00'),
  ('f0000000-0000-0000-0000-000000000011', 'nudge-a', null, '2027-02-01 12:00:00+00'),
  ('f0000000-0000-0000-0000-000000000011', 'nudge-c', '2027-03-11', '2027-02-01 12:00:00+00');

-- 09: an appointment reminder sent 2027-03-09 23:30 UTC, which is 00:30 on 2027-03-10 in Warsaw. 11: sent 22:30 UTC,
-- which is still 2027-03-09 in Warsaw.
insert into public.appointment_reminders (plan_id, user_id, appointment_date, sent_at)
select sp.id, sp.user_id, sp.appointment_date,
  case sp.user_id when 'f0000000-0000-0000-0000-000000000009'
    then '2027-03-09 23:30:00+00'::timestamptz else '2027-03-09 22:30:00+00'::timestamptz end
from public.screening_plans sp
where sp.catalog_slug = 'nudge-c'
  and sp.user_id in ('f0000000-0000-0000-0000-000000000009', 'f0000000-0000-0000-0000-000000000011');

-- 10: a due-screening reminder sent today in Warsaw.
insert into public.screening_completions (user_id, catalog_slug, last_done_month) values
  ('f0000000-0000-0000-0000-000000000010', 'nudge-d', '2026-03-01');
insert into public.due_screening_reminders (user_id, catalog_slug, anchor_month, due_month, sent_at) values
  ('f0000000-0000-0000-0000-000000000010', 'nudge-d', '2026-03-01', '2027-03-01', '2027-03-10 08:00:00+00');

-- --- Grants ----------------------------------------------------------------------------------------------------
-- has_table_privilege with a list is true if any one is held.
select ok(
  not has_table_privilege(
    'anon', 'public.follow_up_nudges', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES'
  )
    and not has_any_column_privilege('anon', 'public.follow_up_nudges', 'SELECT, INSERT, UPDATE, REFERENCES'),
  'anon holds no privileges on the nudge ledger'
);
select ok(
  not has_table_privilege(
    'authenticated', 'public.follow_up_nudges', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES'
  )
    and not has_any_column_privilege(
      'authenticated', 'public.follow_up_nudges', 'SELECT, INSERT, UPDATE, REFERENCES'
    ),
  'authenticated holds no privileges on the nudge ledger'
);
select ok(
  not has_table_privilege(
    'service_role', 'public.follow_up_nudges', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES'
  )
    and not has_any_column_privilege(
      'service_role', 'public.follow_up_nudges', 'SELECT, INSERT, UPDATE, REFERENCES'
    ),
  'service_role holds no privileges on the nudge ledger'
);
-- MAINTAIN exists only from Postgres 17.
select ok(
  case
    when current_setting('server_version_num')::int < 170000 then true
    else not (
      has_table_privilege('anon', 'public.follow_up_nudges', 'MAINTAIN')
      or has_table_privilege('authenticated', 'public.follow_up_nudges', 'MAINTAIN')
      or has_table_privilege('service_role', 'public.follow_up_nudges', 'MAINTAIN')
    )
  end,
  'no API role holds MAINTAIN on the nudge ledger (PG17+)'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.follow_up_nudges'::regclass),
  'row level security is on for the nudge ledger'
);
select ok(
  not has_function_privilege('anon', 'public.claim_follow_up_nudges(date, int, int, int)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.mark_follow_up_nudges_sent(bigint[])', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.claim_follow_up_nudges(date, int, int, int)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.mark_follow_up_nudges_sent(bigint[])', 'EXECUTE'),
  'anon and authenticated cannot execute the nudge functions'
);
select ok(
  has_function_privilege('service_role', 'public.claim_follow_up_nudges(date, int, int, int)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.mark_follow_up_nudges_sent(bigint[])', 'EXECUTE'),
  'service_role can execute the nudge functions'
);

-- --- As an authenticated user ---------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.claim_follow_up_nudges('2027-03-10', 14, 7, 100) $$,
  '42501', null, 'a user cannot claim nudges'
);
select throws_ok(
  $$ select public.mark_follow_up_nudges_sent(array[1]::bigint[]) $$,
  '42501', null, 'a user cannot mark nudges sent'
);
select throws_ok($$ select * from public.follow_up_nudges $$, '42501', null, 'a user cannot read the nudge ledger');
reset role;

-- --- As service_role ------------------------------------------------------------------------------------------
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select throws_ok(
  $$ select * from public.follow_up_nudges $$, '42501', null, 'service_role cannot read the nudge ledger'
);
select throws_ok(
  $$ select * from public.claim_follow_up_nudges(null, 14, 7, 100) $$, '22023', null, 'a null date is rejected'
);
select throws_ok(
  $$ select * from public.claim_follow_up_nudges('2027-03-10', 0, 7, 100) $$,
  '22023', null, 'a schedule threshold of 0 days is rejected'
);
select throws_ok(
  $$ select * from public.claim_follow_up_nudges('2027-03-10', 91, 7, 100) $$,
  '22023', null, 'a schedule threshold of 91 days is rejected'
);
select throws_ok(
  $$ select * from public.claim_follow_up_nudges('2027-03-10', 14, 0, 100) $$,
  '22023', null, 'a confirm threshold of 0 days is rejected'
);
select throws_ok(
  $$ select * from public.claim_follow_up_nudges('2027-03-10', 14, null, 100) $$,
  '22023', null, 'a null confirm threshold is rejected'
);
select throws_ok(
  $$ select * from public.claim_follow_up_nudges('2027-03-10', 14, 7, 0) $$,
  '22023', null, 'a limit of 0 is rejected'
);
select throws_ok(
  $$ select * from public.claim_follow_up_nudges('2027-03-10', 14, 7, 101) $$,
  '22023', null, 'a limit of 101 is rejected'
);

select is(
  (select array_agg(user_id) from public.claim_follow_up_nudges('2027-03-10', 14, 7, 100)
   where user_id::text like 'f0000000%'),
  array[
    'f0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000007',
    'f0000000-0000-0000-0000-000000000011', 'f0000000-0000-0000-0000-000000000008'
  ]::uuid[],
  'confirm users come first, then schedule-only users by md5; nobody opted out, without consent, without email, '
  'on a retired entry or emailed today'
);
select is(
  (select array_agg(user_id) from public.claim_follow_up_nudges('2027-03-10', 14, 7, 2)
   where user_id::text like 'f0000000%'),
  array['f0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000007']::uuid[],
  'p_limit caps the rows and keeps the confirm users'
);
select ok(
  md5('f0000000-0000-0000-0000-000000000008' || '2027-03-10') < md5('f0000000-0000-0000-0000-000000000007' || '2027-03-10'),
  'fixture: md5 alone would put the schedule-only user before the confirm-only user'
);
select is(
  (select (schedule_count, confirm_count)::text
   from public.claim_follow_up_nudges('2027-03-10', 14, 7, 100)
   where user_id = 'f0000000-0000-0000-0000-000000000001'),
  '(1,1)',
  'a user with both kinds gets one row with both counts'
);
select is(
  (select cardinality(nudge_ids) from public.claim_follow_up_nudges('2027-03-10', 14, 7, 100)
   where user_id = 'f0000000-0000-0000-0000-000000000001'),
  2, 'two plans give two nudge ids'
);
select is(
  (select (schedule_count, confirm_count)::text || ' ' || email || ' ' || locale
   from public.claim_follow_up_nudges('2027-03-10', 14, 7, 100)
   where user_id = 'f0000000-0000-0000-0000-000000000008'),
  '(1,0) eight@example.com pl', 'a schedule-only row has no confirm count, the account email and the default locale'
);
select is(
  (select locale from public.claim_follow_up_nudges('2027-03-10', 14, 7, 100)
   where user_id = 'f0000000-0000-0000-0000-000000000001'),
  'en', 'the locale is the one stored with the opt-in'
);
select is(
  public.mark_follow_up_nudges_sent(array[]::bigint[]), 0, 'service_role can mark; an empty list marks nothing'
);

-- --- As postgres: the ledger ----------------------------------------------------------------------------------
reset role;

select is(
  (select array_agg(kind || ' ' || cycle_on order by kind) from public.follow_up_nudges
   where user_id = 'f0000000-0000-0000-0000-000000000001'),
  array['confirm 2027-03-03', 'schedule 2027-02-24'],
  'the ledger holds 01''s plans at exactly 7 and 14 days, with their cycles'
);
select is(
  (select count(*) from public.follow_up_nudges
   where user_id in (
     'f0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000003',
     'f0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000006'
   )),
  0::bigint,
  'no ledger rows for 13 and 6 days, today, a future date, an opted-out user, withdrawn consent or a retired entry'
);
select is(
  (select count(*) from public.follow_up_nudges where user_id = 'f0000000-0000-0000-0000-000000000005'),
  1::bigint, 'a user without an email still gets a ledger row, but is never returned'
);
select is(
  (select nudge_ids from public.claim_follow_up_nudges('2027-03-10', 14, 7, 100)
   where user_id = 'f0000000-0000-0000-0000-000000000001'),
  (select array_agg(id order by id) from public.follow_up_nudges
   where user_id = 'f0000000-0000-0000-0000-000000000001'),
  'a repeated claim before mark returns the same ids'
);
select is(
  (select count(*) from public.follow_up_nudges where user_id = 'f0000000-0000-0000-0000-000000000001'),
  2::bigint, 'repeated claims add no duplicate rows'
);

-- Cross-job exclusion. 09 and 10 have rows but are not returned (asserted above); 11's reminder was yesterday.
select is(
  (select count(*) from public.follow_up_nudges
   where user_id in ('f0000000-0000-0000-0000-000000000009', 'f0000000-0000-0000-0000-000000000010')),
  2::bigint, 'users emailed today still get their ledger rows, so the nudge is only deferred'
);
update public.appointment_reminders set sent_at = null where user_id = 'f0000000-0000-0000-0000-000000000009';
select is(
  (select count(*) from public.claim_follow_up_nudges('2027-03-10', 14, 7, 100)
   where user_id = 'f0000000-0000-0000-0000-000000000009'),
  1::bigint, 'an unsent appointment reminder does not exclude the user'
);
select is(
  (select count(*) from public.claim_follow_up_nudges('2027-03-11', 14, 7, 100)
   where user_id = 'f0000000-0000-0000-0000-000000000010'),
  1::bigint, 'a due-screening reminder sent the day before does not exclude the user'
);

-- Opting out between claim and send: the unsent rows are no longer returned.
update public.profiles set reminders_enabled = false where user_id = 'f0000000-0000-0000-0000-000000000008';
select is(
  (select count(*) from public.claim_follow_up_nudges('2027-03-10', 14, 7, 100)
   where user_id = 'f0000000-0000-0000-0000-000000000008'),
  0::bigint, 'after opting out, the unsent rows are not returned'
);
update public.profiles set reminders_enabled = true where user_id = 'f0000000-0000-0000-0000-000000000008';

-- A re-saved undated plan starts a new cycle. screening_plans_set_updated_at writes now() on UPDATE, so the trigger
-- is off while the fixture sets updated_at explicitly.
alter table public.screening_plans disable trigger screening_plans_set_updated_at;
update public.screening_plans set updated_at = '2027-03-08 12:00:00+00'
  where user_id = 'f0000000-0000-0000-0000-000000000008';
select is(
  (select count(*) from public.claim_follow_up_nudges('2027-03-10', 14, 7, 100)
   where user_id = 'f0000000-0000-0000-0000-000000000008'),
  0::bigint, 'a plan re-saved without a date 2 days ago is not nudged: the old row is stale'
);
update public.screening_plans set updated_at = '2027-02-20 12:00:00+00'
  where user_id = 'f0000000-0000-0000-0000-000000000008';
alter table public.screening_plans enable trigger screening_plans_set_updated_at;
select lives_ok(
  $$ select * from public.claim_follow_up_nudges('2027-03-10', 14, 7, 100) $$, 'claiming records the new cycle'
);
select is(
  (select count(*) from public.follow_up_nudges where user_id = 'f0000000-0000-0000-0000-000000000008'),
  2::bigint, 'the re-saved plan has a new ledger row (a new cycle) next to the old one'
);
select is(
  (select nudge_ids from public.claim_follow_up_nudges('2027-03-10', 14, 7, 100)
   where user_id = 'f0000000-0000-0000-0000-000000000008'),
  array[(select max(id) from public.follow_up_nudges where user_id = 'f0000000-0000-0000-0000-000000000008')],
  'only the new cycle''s row is returned'
);

-- A re-dated plan starts a new confirm cycle (the update also bumps updated_at; the confirm rule ignores it).
update public.screening_plans set appointment_date = '2027-03-20'
  where user_id = 'f0000000-0000-0000-0000-000000000007';
select is(
  (select count(*) from public.claim_follow_up_nudges('2027-03-10', 14, 7, 100)
   where user_id = 'f0000000-0000-0000-0000-000000000007'),
  0::bigint, 'a plan re-dated into the future is not returned'
);
update public.screening_plans set appointment_date = '2027-02-20'
  where user_id = 'f0000000-0000-0000-0000-000000000007';
select lives_ok(
  $$ select * from public.claim_follow_up_nudges('2027-03-10', 14, 7, 100) $$, 'claiming records the new date'
);
select is(
  (select count(*) from public.follow_up_nudges where user_id = 'f0000000-0000-0000-0000-000000000007'),
  2::bigint, 'the re-dated plan has a new confirm row next to the old one'
);
select is(
  (select nudge_ids from public.claim_follow_up_nudges('2027-03-10', 14, 7, 100)
   where user_id = 'f0000000-0000-0000-0000-000000000007'),
  array[(select max(id) from public.follow_up_nudges where user_id = 'f0000000-0000-0000-0000-000000000007')],
  'only the new date''s row is returned'
);

-- --- Mark sent ------------------------------------------------------------------------------------------------
select is(
  (select public.mark_follow_up_nudges_sent(nudge_ids) from public.claim_follow_up_nudges('2027-03-10', 14, 7, 100)
   where user_id = 'f0000000-0000-0000-0000-000000000001'),
  2, 'mark stamps the claimed rows and returns the count'
);
select is(
  public.mark_follow_up_nudges_sent(
    (select array_agg(id) from public.follow_up_nudges where user_id = 'f0000000-0000-0000-0000-000000000001')
  ),
  0, 'mark is a no-op on already-sent ids'
);
select is(
  (select count(*) from public.claim_follow_up_nudges('2027-03-10', 14, 7, 100)
   where user_id = 'f0000000-0000-0000-0000-000000000001'),
  0::bigint, 'sent rows are no longer returned'
);
select is(
  (select count(*) from public.follow_up_nudges
   where user_id = 'f0000000-0000-0000-0000-000000000001' and sent_at is not null),
  2::bigint, 'mark stamped sent_at on both rows'
);
select ok(
  (select sent_at is null from public.follow_up_nudges
   where user_id = 'f0000000-0000-0000-0000-000000000007' and cycle_on = '2027-03-01'),
  'the stale row of the re-dated plan stays unsent'
);

-- --- Cascade --------------------------------------------------------------------------------------------------
-- Delete a plan, as its owner.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$ delete from public.screening_plans where catalog_slug = 'nudge-a' $$, 'a user can delete a plan that has nudges'
);
reset role;
select is(
  (select count(*) from public.follow_up_nudges where user_id = 'f0000000-0000-0000-0000-000000000001'),
  1::bigint, 'deleting a plan deletes its ledger rows and keeps the other plan''s'
);

-- Confirm a passed plan. confirm_screening_plan uses the real clock, so this plan is dated well in the past.
insert into public.screening_plans (user_id, catalog_slug, appointment_date) values
  ('f0000000-0000-0000-0000-000000000012', 'nudge-b', '2026-01-01');
select is(
  (select count(*) from public.claim_follow_up_nudges('2027-03-10', 14, 7, 100)
   where user_id = 'f0000000-0000-0000-0000-000000000012'),
  1::bigint, 'a plan dated long ago is claimed'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000012","role":"authenticated"}', true);
select is(
  (select public.confirm_screening_plan('nudge-b')), 'confirmed', 'the user confirms the passed plan'
);
reset role;
select is(
  (select count(*) from public.follow_up_nudges where user_id = 'f0000000-0000-0000-0000-000000000012'),
  0::bigint, 'confirming a plan deletes its ledger rows'
);

-- Withdraw consent, as the owner of a plan with a confirm row.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000007","role":"authenticated"}', true);
select lives_ok($$ select public.withdraw_health_data_consent() $$, 'a user can withdraw consent');
reset role;
select is(
  (select count(*) from public.follow_up_nudges where user_id = 'f0000000-0000-0000-0000-000000000007'),
  0::bigint, 'withdrawal leaves no ledger rows'
);
select is(
  (select array_agg(user_id) from public.claim_follow_up_nudges('2027-03-10', 14, 7, 100)
   where user_id::text like 'f0000000%'),
  array[
    'f0000000-0000-0000-0000-000000000011', 'f0000000-0000-0000-0000-000000000008',
    'f0000000-0000-0000-0000-000000000009'
  ]::uuid[],
  'after the sends, the cascades and the withdrawal only the schedule-only users are left'
);

select * from finish();
rollback;
