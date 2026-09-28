-- F-01 screening-catalog-v1: the curated screening catalog, public reference data with no personal data.
-- Readable by anyone (drafts hidden by RLS), writable only through generated catalog migrations.
-- Additive only: a Worker rollback never undoes a migration.

-- ---------------------------------------------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------------------------------------------

create table public.screening_catalog (
  slug text primary key,
  status text not null default 'draft',
  name_pl text not null,
  name_en text not null,
  summary_pl text not null,
  summary_en text not null,
  how_to_access_pl text not null,
  how_to_access_en text not null,
  eligibility jsonb not null,
  interval_kind text not null,
  interval_months smallint,
  interval_overrides jsonb not null default '[]',
  evidence_level smallint not null,
  evidence_source text not null,
  burden_weight smallint not null default 0,
  nfz_funded boolean not null,
  referral_required boolean not null,
  sources jsonb not null,
  reviewed_by text,
  last_reviewed date,
  next_review_due date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint screening_catalog_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 64),
  constraint screening_catalog_status_valid check (status in ('draft', 'active', 'retired')),
  -- Compared with '[]' rather than jsonb_array_length(), which raises instead of failing the check on a non-array.
  constraint screening_catalog_eligibility_nonempty_array check (
    jsonb_typeof(eligibility) = 'array' and eligibility <> '[]'::jsonb
  ),
  constraint screening_catalog_interval_kind_valid check (
    interval_kind in ('fixed', 'no_known_interval', 'shared_decision', 'per_program')
  ),
  constraint screening_catalog_interval_months_range check (interval_months between 1 and 240),
  -- A fixed interval needs months; every other kind has no computable next due date.
  constraint screening_catalog_interval_months_match_kind check (
    (interval_kind = 'fixed') = (interval_months is not null)
  ),
  constraint screening_catalog_interval_overrides_array check (jsonb_typeof(interval_overrides) = 'array'),
  constraint screening_catalog_evidence_level_range check (evidence_level between 1 and 3),
  constraint screening_catalog_burden_weight_range check (burden_weight between 0 and 5),
  constraint screening_catalog_sources_nonempty_array check (
    jsonb_typeof(sources) = 'array' and sources <> '[]'::jsonb
  )
);

comment on table public.screening_catalog is
  'Public reference data with no personal data; rows are managed only by generated catalog migrations.';

create trigger screening_catalog_set_updated_at
  before update on public.screening_catalog
  for each row execute function public.set_updated_at();

alter table public.screening_catalog enable row level security;

-- Drafts ship in the same migrations as published entries; only active and retired rows are visible.
create policy screening_catalog_select_published on public.screening_catalog
  for select to anon, authenticated
  using (status in ('active', 'retired'));

-- Revoke first: Supabase's default privileges grant clients every privilege on new tables, including TRUNCATE
-- (which ignores RLS), TRIGGER and REFERENCES. Clients get SELECT and nothing else.
revoke all on table public.screening_catalog from anon, authenticated;
grant select on table public.screening_catalog to anon, authenticated;
-- MAINTAIN exists only from Postgres 17.
do $$
begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'revoke maintain on table public.screening_catalog from anon, authenticated';
  end if;
end;
$$;
