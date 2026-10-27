-- F-12 reminders-research: read-only catalog queries against local Supabase (127.0.0.1:54322).
-- Run: psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -v ON_ERROR_STOP=1 -f catalog-queries.sql
-- Only SELECTs inside a read-only transaction; nothing is written.
begin transaction read only;

\echo '## S1 reminder-pipeline functions: language, definer, SQL-standard body, search_path, execute grants'
select p.proname,
       l.lanname as lang,
       p.prosecdef as security_definer,
       p.prosqlbody is not null as sql_standard_body,
       p.proconfig as config,
       p.proacl as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname = 'public'
  and p.proname ~ '(reminder|nudge|withdraw|candidate|anchor|confirm_screening)'
order by p.proname;

\echo '## S2 pg_depend rows from those functions to any relation (tables/views)'
select p.proname, c.relname as depends_on, d.deptype
from pg_depend d
join pg_proc p on d.classid = 'pg_proc'::regclass and d.objid = p.oid
join pg_namespace n on n.oid = p.pronamespace
join pg_class c on d.refclassid = 'pg_class'::regclass and d.refobjid = c.oid
where n.nspname = 'public'
  and p.proname ~ '(reminder|nudge|withdraw|candidate|anchor|confirm_screening)'
order by 1, 2;

\echo '## S3 text references from each live function body to public tables (word-boundary match on prosrc)'
select p.proname,
       string_agg(t.tablename, ', ' order by t.tablename) as tables_named_in_body
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_tables t on t.schemaname = 'public' and p.prosrc ~ ('\m' || t.tablename || '\M')
where n.nspname = 'public'
  and p.proname ~ '(reminder|nudge|withdraw|candidate|anchor|confirm_screening)'
group by p.proname
order by p.proname;

\echo '## S4 recipient predicates repeated across live function bodies'
select p.proname,
       p.prosrc ~ 'health_data_consents' as reads_consents,
       p.prosrc ~ 'withdrawn_at' as checks_withdrawn_at,
       p.prosrc ~ 'reminders_opt_in|reminder_opt_in|reminders_enabled|email_reminders' as checks_opt_in,
       p.prosrc ~ 'auth\.users' as reads_auth_users,
       p.prosrc ~ 'locale' as reads_locale,
       p.prosrc ~ 'sent_at' as touches_sent_at,
       p.prosrc ~ 'for update skip locked' as skip_locked
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname ~ '(reminder|nudge|withdraw|candidate)'
order by p.proname;

\echo '## S5 every public table with a user_id column, its FK on user_id, and whether the withdraw function names it'
select c.table_name,
       (select string_agg(format('%s -> %s.%s on delete %s', con.conname, fn.nspname, ft.relname,
                                 case con.confdeltype when 'c' then 'cascade' when 'a' then 'no action'
                                   when 'r' then 'restrict' when 'n' then 'set null' when 'd' then 'set default' end), '; ')
          from pg_constraint con
          join pg_class tt on tt.oid = con.conrelid and tt.relname = c.table_name
          join pg_namespace tn on tn.oid = tt.relnamespace and tn.nspname = 'public'
          join pg_class ft on ft.oid = con.confrelid
          join pg_namespace fn on fn.oid = ft.relnamespace
          join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey) and a.attname = 'user_id'
         where con.contype = 'f') as user_fk,
       exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = 'withdraw_health_data_consent'
                  and p.prosrc ~ ('\m' || c.table_name || '\M')) as named_by_withdraw
from information_schema.columns c
where c.table_schema = 'public' and c.column_name = 'user_id'
order by c.table_name;

\echo '## S6 every foreign key among public tables (the cascade graph)'
select tt.relname as from_table,
       ft.relname as to_table,
       con.conname,
       case con.confdeltype when 'c' then 'cascade' when 'a' then 'no action' when 'r' then 'restrict'
         when 'n' then 'set null' when 'd' then 'set default' end as on_delete
from pg_constraint con
join pg_class tt on tt.oid = con.conrelid
join pg_namespace tn on tn.oid = tt.relnamespace and tn.nspname = 'public'
join pg_class ft on ft.oid = con.confrelid
where con.contype = 'f'
order by 1, 2;

\echo '## S7 table privileges held by service_role / anon / authenticated on public tables'
select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('service_role', 'anon', 'authenticated')
group by table_name, grantee
order by table_name, grantee;

\echo '## S8 columns of public.profiles'
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
order by ordinal_position;

\echo '## S9 unique constraints / indexes on the reminder ledgers (dedupe keys)'
select t.relname as table_name, i.relname as index_name, pg_get_indexdef(ix.indexrelid) as definition
from pg_index ix
join pg_class t on t.oid = ix.indrelid
join pg_class i on i.oid = ix.indexrelid
join pg_namespace n on n.oid = t.relnamespace and n.nspname = 'public'
where t.relname ~ '(reminder|nudge)'
  and ix.indisunique
order by 1, 2;

\echo '## S10 triggers on public tables'
select event_object_table, trigger_name, action_timing, event_manipulation, action_statement
from information_schema.triggers
where trigger_schema = 'public'
order by 1, 2;

\echo '## S11 the live withdraw function body (statements only)'
select regexp_split_to_table(p.prosrc, E'\n') as line
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'withdraw_health_data_consent';

\echo '## S12 copies of each recipient predicate per live function body (regexp match counts on prosrc)'
select p.proname,
       (select count(*) from regexp_matches(p.prosrc, 'withdrawn_at is null', 'g')) as consent_checks,
       (select count(*) from regexp_matches(p.prosrc, 'reminders_enabled', 'g')) as opt_in_checks,
       (select count(*) from regexp_matches(p.prosrc, 'email is not null', 'g')) as email_checks,
       (select count(*) from regexp_matches(p.prosrc, 'status = ''active''', 'g')) as active_entry_checks,
       (select count(*) from regexp_matches(p.prosrc, 'screening_catalog', 'g')) as catalog_refs,
       (select count(*) from regexp_matches(p.prosrc, 'Europe/Warsaw', 'g')) as warsaw_conversions
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname ~ '^(claim_|get_due|mark_)'
order by p.proname;
\echo '## S13 mark_* bodies compared (md5 of prosrc with the table name masked)'
select p.proname, md5(regexp_replace(p.prosrc, '(appointment_reminders|due_screening_reminders|follow_up_nudges)', '<T>', 'g')) as masked_body_md5
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'mark\_%' order by 1;
rollback;
