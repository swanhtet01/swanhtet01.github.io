-- Historical replay prerequisite for 20260812141352_public_browser_quarantine.
-- The 27-table baseline creates the legacy catalog, but fresh Supabase branches
-- do not inherit production's service_role grants. Grant only that server role.
BEGIN;

DO $guard$
DECLARE
  expected_tables text[] := ARRAY[
    'assets', 'enterprise_agent_runs', 'enterprise_audit_events',
    'enterprise_connector_events', 'enterprise_knowledge_chunks',
    'enterprise_knowledge_embeddings', 'enterprise_lead_activities',
    'enterprise_lead_hunt_profiles', 'enterprise_leads',
    'enterprise_memberships', 'enterprise_metric_records',
    'enterprise_module_definitions', 'enterprise_sessions',
    'enterprise_source_change_events', 'enterprise_source_records',
    'enterprise_users', 'enterprise_workspace_domains',
    'enterprise_workspace_modules', 'enterprise_workspace_profiles',
    'enterprise_workspace_tasks', 'enterprise_workspaces', 'iot_telemetry',
    'production_ledger', 'supermega_campaign_clicks', 'supermega_leads',
    'supermega_sales_runs', 'wcm_incidents'
  ];
  expected_sequences text[] := ARRAY[
    'supermega_leads_id_seq', 'supermega_sales_runs_id_seq'
  ];
  actual_tables text[];
  actual_sequences text[];
BEGIN
  IF current_user <> 'postgres' OR to_regrole('service_role') IS NULL THEN
    RAISE EXCEPTION 'service_role_replay_grants_wrong_role';
  END IF;
  SELECT coalesce(array_agg(c.relname ORDER BY c.relname), ARRAY[]::text[])
    INTO actual_tables
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p');
  SELECT coalesce(array_agg(c.relname ORDER BY c.relname), ARRAY[]::text[])
    INTO actual_sequences
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'S';
  IF actual_tables <> expected_tables OR actual_sequences <> expected_sequences THEN
    RAISE EXCEPTION 'service_role_replay_grants_catalog_changed';
  END IF;
END;
$guard$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.assets,
  public.enterprise_agent_runs,
  public.enterprise_audit_events,
  public.enterprise_connector_events,
  public.enterprise_knowledge_chunks,
  public.enterprise_knowledge_embeddings,
  public.enterprise_lead_activities,
  public.enterprise_lead_hunt_profiles,
  public.enterprise_leads,
  public.enterprise_memberships,
  public.enterprise_metric_records,
  public.enterprise_module_definitions,
  public.enterprise_sessions,
  public.enterprise_source_change_events,
  public.enterprise_source_records,
  public.enterprise_users,
  public.enterprise_workspace_domains,
  public.enterprise_workspace_modules,
  public.enterprise_workspace_profiles,
  public.enterprise_workspace_tasks,
  public.enterprise_workspaces,
  public.iot_telemetry,
  public.production_ledger,
  public.supermega_campaign_clicks,
  public.supermega_leads,
  public.supermega_sales_runs,
  public.wcm_incidents
TO service_role;

GRANT USAGE, SELECT ON SEQUENCE
  public.supermega_leads_id_seq,
  public.supermega_sales_runs_id_seq
TO service_role;

DO $verify$
DECLARE
  missing_count integer;
BEGIN
  SELECT count(*) INTO missing_count FROM (
    SELECT c.relname AS object_name, p.privilege
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p(privilege)
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND NOT has_table_privilege('service_role', c.oid, p.privilege)
    UNION ALL
    SELECT c.relname, p.privilege
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL unnest(ARRAY['USAGE', 'SELECT']) p(privilege)
    WHERE n.nspname = 'public' AND c.relkind = 'S'
      AND NOT has_sequence_privilege('service_role', c.oid, p.privilege)
  ) missing;
  IF missing_count <> 0 THEN
    RAISE EXCEPTION 'service_role_replay_grants_readback_failed';
  END IF;
END;
$verify$;

COMMIT;
