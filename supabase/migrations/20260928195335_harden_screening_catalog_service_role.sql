-- F-01 review fix: service_role must not write the screening catalog either. Rows change only through generated
-- catalog migrations (run as the table owner); a manual write would be silently overwritten by the next snapshot.
-- Additive only.

revoke insert, update, delete, truncate, trigger, references on table public.screening_catalog from service_role;
-- MAINTAIN exists only from Postgres 17.
do $$
begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'revoke maintain on table public.screening_catalog from service_role';
  end if;
end;
$$;
