-- Access rules and constraints for the screening catalog: public read of published rows only, no client writes.
-- Run with `npx supabase test db`. Everything happens in one transaction that is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- Fixtures, inserted as postgres: one row per status. updated_at starts in the past so the trigger test can see
-- it move (now() is constant within this transaction).
insert into public.screening_catalog (
  slug, status, name_pl, name_en, summary_pl, summary_en, how_to_access_pl, how_to_access_en,
  eligibility, interval_kind, interval_months, evidence_level, evidence_source, nfz_funded, referral_required,
  sources, updated_at
) values
  ('test-draft', 'draft', 'Szkic', 'Draft', 'Opis', 'Summary', 'Dostęp', 'Access',
   '[{"age_min": 50}]', 'fixed', 24, 1, 'USPSTF', true, false, '[{"url": "https://example.com"}]', '2000-01-01'),
  ('test-active', 'active', 'Aktywne', 'Active', 'Opis', 'Summary', 'Dostęp', 'Access',
   '[{"age_min": 50}]', 'fixed', 24, 1, 'USPSTF', true, false, '[{"url": "https://example.com"}]', '2000-01-01'),
  ('test-retired', 'retired', 'Wycofane', 'Retired', 'Opis', 'Summary', 'Dostęp', 'Access',
   '[{"age_min": 50}]', 'no_known_interval', null, 2, 'USPSTF', false, true, '[{"url": "https://example.com"}]',
   '2000-01-01');

-- --- As anon ---------------------------------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  array(select slug from public.screening_catalog order by slug), array['test-active', 'test-retired'],
  'anon sees active and retired entries, never drafts'
);

select throws_ok(
  $$ insert into public.screening_catalog (slug, name_pl, name_en, summary_pl, summary_en, how_to_access_pl,
       how_to_access_en, eligibility, interval_kind, evidence_level, evidence_source, nfz_funded,
       referral_required, sources)
     values ('anon-entry', 'a', 'a', 'a', 'a', 'a', 'a', '[{}]', 'no_known_interval', 1, 'a', true, true, '[{}]') $$,
  '42501', null, 'anon cannot insert catalog entries'
);
select throws_ok(
  $$ update public.screening_catalog set name_en = 'forged' $$, '42501', null, 'anon cannot update catalog entries'
);
select throws_ok(
  $$ delete from public.screening_catalog $$, '42501', null, 'anon cannot delete catalog entries'
);

-- --- As an authenticated user -----------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select is(
  array(select slug from public.screening_catalog order by slug), array['test-active', 'test-retired'],
  'authenticated sees active and retired entries, never drafts'
);

select throws_ok(
  $$ insert into public.screening_catalog (slug, name_pl, name_en, summary_pl, summary_en, how_to_access_pl,
       how_to_access_en, eligibility, interval_kind, evidence_level, evidence_source, nfz_funded,
       referral_required, sources)
     values ('user-entry', 'a', 'a', 'a', 'a', 'a', 'a', '[{}]', 'no_known_interval', 1, 'a', true, true, '[{}]') $$,
  '42501', null, 'authenticated cannot insert catalog entries'
);
select throws_ok(
  $$ update public.screening_catalog set name_en = 'forged' $$,
  '42501', null, 'authenticated cannot update catalog entries'
);
select throws_ok(
  $$ delete from public.screening_catalog $$, '42501', null, 'authenticated cannot delete catalog entries'
);

-- --- As postgres: privileges -----------------------------------------------------------------------------------
reset role;

-- has_table_privilege with a list is true if any one is held. TRUNCATE ignores RLS, so it matters most.
select ok(
  not has_table_privilege('anon', 'public.screening_catalog', 'INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES'),
  'anon holds no INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES on the catalog'
);
select ok(
  not has_table_privilege(
    'authenticated', 'public.screening_catalog', 'INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES'
  ),
  'authenticated holds no INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES on the catalog'
);

-- --- As postgres: constraints ----------------------------------------------------------------------------------
select throws_ok(
  $$ update public.screening_catalog set interval_months = null where slug = 'test-active' $$,
  '23514', null, 'a fixed interval requires months'
);
select throws_ok(
  $$ update public.screening_catalog set interval_months = 12 where slug = 'test-retired' $$,
  '23514', null, 'months are rejected for a non-fixed interval kind'
);
select throws_ok(
  $$ update public.screening_catalog set slug = 'Bad_Slug' where slug = 'test-active' $$,
  '23514', null, 'a slug must be lowercase kebab-case'
);
select throws_ok(
  $$ update public.screening_catalog set status = 'pending_verification' where slug = 'test-active' $$,
  '23514', null, 'an unknown status is rejected'
);
select throws_ok(
  $$ update public.screening_catalog set sources = '[]' where slug = 'test-active' $$,
  '23514', null, 'an entry needs at least one source'
);
select throws_ok(
  $$ update public.screening_catalog set eligibility = '{"age_min": 50}' where slug = 'test-active' $$,
  '23514', null, 'eligibility must be an array'
);
select throws_ok(
  $$ update public.screening_catalog set evidence_level = 4 where slug = 'test-active' $$,
  '23514', null, 'evidence_level is 1..3'
);

-- --- As postgres: updated_at trigger ---------------------------------------------------------------------------
update public.screening_catalog set name_en = 'Active, renamed' where slug = 'test-active';

select ok(
  (select updated_at > '2000-01-01'::timestamptz from public.screening_catalog where slug = 'test-active'),
  'updated_at advances on update'
);

select * from finish();
rollback;
