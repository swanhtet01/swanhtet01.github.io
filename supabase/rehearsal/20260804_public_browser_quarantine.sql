begin;

-- Isolated rehearsal only. This packet quarantines the exact legacy public
-- catalog observed on 2026-08-04. It does not touch app_private, customer rows,
-- service_role authority, or the protected production target by itself.
do $guard$
declare
  expected_tables constant text[] := array[
    'assets',
    'enterprise_agent_runs',
    'enterprise_audit_events',
    'enterprise_connector_events',
    'enterprise_knowledge_chunks',
    'enterprise_knowledge_embeddings',
    'enterprise_lead_activities',
    'enterprise_lead_hunt_profiles',
    'enterprise_leads',
    'enterprise_memberships',
    'enterprise_metric_records',
    'enterprise_module_definitions',
    'enterprise_sessions',
    'enterprise_source_change_events',
    'enterprise_source_records',
    'enterprise_users',
    'enterprise_workspace_domains',
    'enterprise_workspace_modules',
    'enterprise_workspace_profiles',
    'enterprise_workspace_tasks',
    'enterprise_workspaces',
    'iot_telemetry',
    'production_ledger',
    'supermega_campaign_clicks',
    'supermega_leads',
    'supermega_sales_runs',
    'wcm_incidents'
  ]::text[];
  expected_sequences constant text[] := array[
    'supermega_leads_id_seq',
    'supermega_sales_runs_id_seq'
  ]::text[];
  observed_tables text[];
  observed_sequences text[];
begin
  if current_user <> 'postgres' then
    raise exception using
      errcode = '42501',
      message = 'public browser quarantine requires the reviewed postgres migration role';
  end if;

  if to_regrole('anon') is null
    or to_regrole('authenticated') is null
    or to_regrole('service_role') is null
    or to_regrole('supabase_admin') is null
  then
    raise exception using
      errcode = '55000',
      message = 'public browser quarantine requires the Supabase API and administration roles';
  end if;

  select coalesce(array_agg(relation.relname order by relation.relname), array[]::text[])
  into observed_tables
  from pg_class relation
  join pg_namespace schema_record on schema_record.oid = relation.relnamespace
  where schema_record.nspname = 'public'
    and relation.relkind in ('r', 'p');

  select coalesce(array_agg(relation.relname order by relation.relname), array[]::text[])
  into observed_sequences
  from pg_class relation
  join pg_namespace schema_record on schema_record.oid = relation.relnamespace
  where schema_record.nspname = 'public'
    and relation.relkind = 'S';

  if observed_tables <> expected_tables then
    raise exception using
      errcode = '55000',
      message = 'public browser quarantine table inventory changed; regenerate the reviewed packet';
  end if;
  if observed_sequences <> expected_sequences then
    raise exception using
      errcode = '55000',
      message = 'public browser quarantine sequence inventory changed; regenerate the reviewed packet';
  end if;

  if exists (
    select 1
    from pg_proc function_record
    join pg_namespace schema_record on schema_record.oid = function_record.pronamespace
    where schema_record.nspname = 'public'
      and (
        has_function_privilege('anon', function_record.oid, 'EXECUTE')
        or has_function_privilege('authenticated', function_record.oid, 'EXECUTE')
      )
  ) then
    raise exception using
      errcode = '55000',
      message = 'public browser quarantine found a browser-callable routine; review it explicitly';
  end if;

  if exists (
    select 1
    from unnest(expected_tables) as expected_table(name)
    cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
      as required_privilege(name)
    where not has_table_privilege(
      'service_role',
      format('%I.%I', 'public', expected_table.name),
      required_privilege.name
    )
  ) or exists (
    select 1
    from unnest(expected_sequences) as expected_sequence(name)
    cross join unnest(array['USAGE', 'SELECT']) as required_privilege(name)
    where not has_sequence_privilege(
      'service_role',
      format('%I.%I', 'public', expected_sequence.name),
      required_privilege.name
    )
  ) then
    raise exception using
      errcode = '55000',
      message = 'public browser quarantine server dependency baseline changed';
  end if;
end
$guard$;

alter default privileges for role postgres in schema public
  revoke all privileges on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

alter default privileges for role supabase_admin in schema public
  revoke all privileges on tables from public, anon, authenticated;
alter default privileges for role supabase_admin in schema public
  revoke all privileges on sequences from public, anon, authenticated;
alter default privileges for role supabase_admin in schema public
  revoke execute on functions from public, anon, authenticated;

revoke all privileges on table public.assets from public, anon, authenticated;
revoke all privileges on table public.enterprise_agent_runs from public, anon, authenticated;
revoke all privileges on table public.enterprise_audit_events from public, anon, authenticated;
revoke all privileges on table public.enterprise_connector_events from public, anon, authenticated;
revoke all privileges on table public.enterprise_knowledge_chunks from public, anon, authenticated;
revoke all privileges on table public.enterprise_knowledge_embeddings from public, anon, authenticated;
revoke all privileges on table public.enterprise_lead_activities from public, anon, authenticated;
revoke all privileges on table public.enterprise_lead_hunt_profiles from public, anon, authenticated;
revoke all privileges on table public.enterprise_leads from public, anon, authenticated;
revoke all privileges on table public.enterprise_memberships from public, anon, authenticated;
revoke all privileges on table public.enterprise_metric_records from public, anon, authenticated;
revoke all privileges on table public.enterprise_module_definitions from public, anon, authenticated;
revoke all privileges on table public.enterprise_sessions from public, anon, authenticated;
revoke all privileges on table public.enterprise_source_change_events from public, anon, authenticated;
revoke all privileges on table public.enterprise_source_records from public, anon, authenticated;
revoke all privileges on table public.enterprise_users from public, anon, authenticated;
revoke all privileges on table public.enterprise_workspace_domains from public, anon, authenticated;
revoke all privileges on table public.enterprise_workspace_modules from public, anon, authenticated;
revoke all privileges on table public.enterprise_workspace_profiles from public, anon, authenticated;
revoke all privileges on table public.enterprise_workspace_tasks from public, anon, authenticated;
revoke all privileges on table public.enterprise_workspaces from public, anon, authenticated;
revoke all privileges on table public.iot_telemetry from public, anon, authenticated;
revoke all privileges on table public.production_ledger from public, anon, authenticated;
revoke all privileges on table public.supermega_campaign_clicks from public, anon, authenticated;
revoke all privileges on table public.supermega_leads from public, anon, authenticated;
revoke all privileges on table public.supermega_sales_runs from public, anon, authenticated;
revoke all privileges on table public.wcm_incidents from public, anon, authenticated;

revoke all privileges on sequence public.supermega_leads_id_seq
from public, anon, authenticated;
revoke all privileges on sequence public.supermega_sales_runs_id_seq
from public, anon, authenticated;

do $verify$
begin
  if exists (
    select 1
    from pg_class relation
    join pg_namespace schema_record on schema_record.oid = relation.relnamespace
    cross join (values ('anon'), ('authenticated')) as browser_role(name)
    cross join unnest(array[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
    ]) as forbidden_privilege(name)
    where schema_record.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and has_table_privilege(
        browser_role.name,
        relation.oid,
        forbidden_privilege.name
      )
  ) or exists (
    select 1
    from pg_class relation
    join pg_namespace schema_record on schema_record.oid = relation.relnamespace
    cross join (values ('anon'), ('authenticated')) as browser_role(name)
    cross join unnest(array['USAGE', 'SELECT', 'UPDATE']) as forbidden_privilege(name)
    where schema_record.nspname = 'public'
      and relation.relkind = 'S'
      and has_sequence_privilege(browser_role.name, relation.oid, forbidden_privilege.name)
  ) then
    raise exception using
      errcode = '55000',
      message = 'public browser quarantine left a browser object grant';
  end if;

  if exists (
    select 1
    from pg_default_acl default_acl
    join pg_roles owner_role on owner_role.oid = default_acl.defaclrole
    join pg_namespace schema_record on schema_record.oid = default_acl.defaclnamespace
    cross join lateral aclexplode(default_acl.defaclacl) privilege_record
    left join pg_roles grantee_role on grantee_role.oid = privilege_record.grantee
    where owner_role.rolname in ('postgres', 'supabase_admin')
      and schema_record.nspname = 'public'
      and default_acl.defaclobjtype in ('r', 'S', 'f')
      and (
        privilege_record.grantee = 0
        or grantee_role.rolname in ('anon', 'authenticated')
      )
  ) then
    raise exception using
      errcode = '55000',
      message = 'public browser quarantine left an automatic browser grant';
  end if;

  if exists (
    select 1
    from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
      as required_privilege(name)
    where not has_table_privilege(
      'service_role',
      'public.supermega_leads',
      required_privilege.name
    )
  ) then
    raise exception using
      errcode = '55000',
      message = 'public browser quarantine changed the retained server contact path';
  end if;
end
$verify$;

commit;
