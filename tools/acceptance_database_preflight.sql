-- Read-only prerequisites, not permission to migrate or proof of target identity.
-- Verify the connection is the approved acceptance branch before execution.
begin read only;
select json_build_object(
  'contract', 'supermega.acceptance_preflight.v1',
  'postgres_major', current_setting('server_version_num')::integer / 10000,
  'application_schema_present', exists(select 1 from pg_namespace where nspname = 'app_private'),
  'public_table_count', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p')),
  'migration_history_present', to_regclass('supabase_migrations.schema_migrations') is not null,
  'platform_roles_present', (select count(*) = 3 from pg_roles where rolname in ('anon', 'authenticated', 'service_role')),
  'auth_sessions_uuid_columns', (select count(*) = 2 from information_schema.columns where table_schema = 'auth' and table_name = 'sessions' and column_name in ('id', 'user_id') and udt_name = 'uuid'),
  'backend_role_state', case
    when not exists(select 1 from pg_roles where rolname = 'supermega_trial_backend') then 'absent'
    when exists(select 1 from pg_roles r where r.rolname = 'supermega_trial_backend' and (
      r.rolcanlogin or not r.rolinherit or r.rolsuper or r.rolcreatedb or r.rolcreaterole or r.rolreplication or r.rolbypassrls
      or exists(select 1 from pg_auth_members m where m.member = r.oid or m.roleid = r.oid)
      or exists(select 1 from pg_shdepend d where d.refclassid = 'pg_authid'::regclass and d.refobjid = r.oid)
      or exists(select 1 from pg_db_role_setting s where s.setrole = r.oid)
    )) then 'requires_review'
    else 'unused_group_role'
  end,
  'legacy_extensions_available', (select count(*) = 3 from pg_available_extensions where name in ('uuid-ossp', 'pgcrypto', 'vector'))
) as preflight;
commit;
