-- Baseline for the pre-existing public catalog.
--
-- These 27 tables were created outside migrations by the earlier enterprise
-- application. Production therefore records `enable_rls_public_tables_20260711`
-- as its first migration, which ALTERs tables that no migration ever creates.
-- Replaying production's history onto an empty database fails immediately, so a
-- Supabase preview branch comes up with zero tables and the whole managed-pilot
-- rehearsal is unreachable.
--
-- This file makes the chain self-contained. It is stamped one second before
-- production's own first recorded migration so a fresh database builds the catalog
-- before anything else runs. Reconstructed by introspecting production on
-- 2026-08-08; no data, only structure.
--
-- It also ENABLES ROW LEVEL SECURITY on all 27 tables at the end, because the
-- migration that does that in production — `enable_rls_public_tables_20260711` —
-- exists only in production's migration table and was never committed here. Without
-- that step a database rebuilt from this repository comes up with the whole legacy
-- catalog readable, which is the exact condition the browser-quarantine packet
-- exists to prevent. Enabling RLS with no policies matches production and denies
-- every row to anon/authenticated by default.
--
-- Scope note: most of these tables belong to the dormant enterprise stack. This
-- baseline deliberately captures reality as it stands rather than pre-judging
-- which tables survive — the retire-or-revive decision can then be expressed as
-- its own explicit migration instead of an undocumented gap.

begin;

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;
create extension if not exists vector;

do $enum$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'production_ledger_source') then
    create type public.production_ledger_source as enum ('human', 'vision_agent');
  end if;
end
$enum$;

create sequence if not exists public.supermega_leads_id_seq;
create sequence if not exists public.supermega_sales_runs_id_seq;

create table if not exists public.assets (id uuid default gen_random_uuid() not null, org_id text not null, name text not null, asset_type text not null, metadata jsonb default '{}'::jsonb not null, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null);
create table if not exists public.enterprise_agent_runs (run_id character varying not null, workspace_id character varying not null, job_type character varying not null, source character varying not null, idempotency_key character varying, started_at character varying not null, finished_at character varying not null, status character varying not null, summary character varying not null, payload_json text not null, result_json text not null, error_text character varying not null, attempt_count integer not null, max_attempts integer not null, scheduled_for character varying not null, related_entity_type character varying not null, related_entity_id character varying not null, triggered_by character varying not null, created_at character varying not null, updated_at character varying not null);
create table if not exists public.enterprise_audit_events (event_id character varying not null, workspace_id character varying not null, actor character varying not null, event_type character varying not null, entity_type character varying not null, entity_id character varying not null, severity character varying not null, summary character varying not null, detail character varying not null, payload_json text not null, created_at character varying not null);
create table if not exists public.enterprise_connector_events (event_id character varying not null, workspace_id character varying not null, connector_id character varying not null, connector_name character varying not null, tenant character varying not null, source character varying not null, kind character varying not null, title character varying not null, detail character varying not null, route character varying not null, severity character varying not null, actor character varying not null, entity_type character varying not null, entity_id character varying not null, payload_json text not null, created_at character varying not null);
create table if not exists public.enterprise_knowledge_chunks (chunk_id character varying not null, workspace_id character varying not null, source character varying not null, record_id character varying not null, title character varying not null, chunk_type character varying not null, text text not null, route character varying not null, source_url character varying not null, modified_time character varying not null, entity_ids_json text not null, vector_profile_json text not null, token_count integer not null, synced_at character varying not null, updated_at character varying not null);
create table if not exists public.enterprise_knowledge_embeddings (chunk_id text not null, workspace_id text not null, source text default ''::text not null, route text default ''::text not null, title text default ''::text not null, content_hash text not null, embedding_model text not null, embedding_dimensions integer not null, embedding vector(1536) not null, metadata_json text default '{}'::text not null, embedded_at text not null, updated_at text not null);
create table if not exists public.enterprise_lead_activities (activity_id character varying not null, workspace_id character varying not null, lead_id character varying not null, created_at character varying not null, actor character varying not null, activity_type character varying not null, channel character varying not null, direction character varying not null, message character varying not null, stage_after character varying not null, next_step character varying not null);
create table if not exists public.enterprise_lead_hunt_profiles (hunt_id character varying not null, workspace_id character varying not null, created_at character varying not null, updated_at character varying not null, last_run_at character varying not null, name character varying not null, owner character varying not null, status character varying not null, query character varying not null, raw_text character varying not null, keywords_json text not null, sources_json text not null, "limit" integer not null, campaign_goal character varying not null, export_workspace boolean not null, last_provider character varying not null, last_engine character varying not null, last_saved_count integer not null, last_summary character varying not null);
create table if not exists public.enterprise_leads (lead_id character varying not null, workspace_id character varying not null, created_at character varying not null, company_name character varying not null, archetype character varying not null, stage character varying not null, status character varying not null, owner character varying not null, campaign_goal character varying not null, service_pack character varying not null, wedge_product character varying not null, starter_modules_json text not null, semi_products_json text not null, outreach_subject character varying not null, outreach_message character varying not null, discovery_questions_json text not null, contact_email character varying not null, contact_phone character varying not null, website character varying not null, source character varying not null, source_url character varying not null, provider character varying not null, score integer not null, notes character varying not null, synced_at character varying not null);
create table if not exists public.enterprise_memberships (membership_id character varying not null, username character varying not null, workspace_id character varying not null, role character varying not null, status character varying not null, created_at character varying not null, updated_at character varying not null);
create table if not exists public.enterprise_metric_records (metric_id character varying not null, workspace_id character varying not null, captured_at character varying not null, metric_name character varying not null, metric_group character varying not null, metric_value character varying not null, unit character varying not null, period_label character varying not null, scope character varying not null, owner character varying not null, status character varying not null, notes character varying not null, evidence_link character varying not null, source_ref_json text not null, synced_at character varying not null, updated_at character varying not null);
create table if not exists public.enterprise_module_definitions (module_id character varying not null, name character varying not null, category character varying not null, maturity character varying not null, route character varying not null, summary character varying not null, default_enabled boolean not null, created_at character varying not null, updated_at character varying not null);
create table if not exists public.enterprise_sessions (session_id character varying not null, username character varying not null, workspace_id character varying not null, role character varying not null, created_at character varying not null, expires_at character varying not null, last_seen_at character varying not null);
create table if not exists public.enterprise_source_change_events (event_id character varying not null, workspace_id character varying not null, source_system character varying not null, source_record_id character varying not null, source_item_id character varying not null, change_type character varying not null, title character varying not null, path character varying not null, organized_path character varying not null, domain character varying not null, plant character varying not null, department character varying not null, owning_route character varying not null, owner_hint character varying not null, kpi_readiness character varying not null, rag_readiness character varying not null, previous_modified_time character varying not null, current_modified_time character varying not null, previous_signature character varying not null, current_signature character varying not null, detected_at character varying not null, summary text not null, payload_json text not null, created_at character varying not null, updated_at character varying not null);
create table if not exists public.enterprise_source_records (source_record_id character varying not null, workspace_id character varying not null, source_system character varying not null, source_root_id character varying not null, source_root_title character varying not null, source_item_id character varying not null, title character varying not null, path character varying not null, organized_path character varying not null, mime_type character varying not null, file_kind character varying not null, domain character varying not null, plant character varying not null, department character varying not null, owning_route character varying not null, owner_hint character varying not null, kpi_readiness character varying not null, rag_readiness character varying not null, risk_level character varying not null, source_behavior character varying not null, source_mode character varying not null, web_view_link character varying not null, modified_time character varying not null, size_bytes integer not null, checksum character varying not null, shortcut_target_id character varying not null, shortcut_target_mime_type character varying not null, classification_json text not null, lineage_json text not null, synced_at character varying not null, updated_at character varying not null);
create table if not exists public.enterprise_users (username character varying not null, display_name character varying not null, password_hash character varying not null, role character varying not null, status character varying not null, created_at character varying not null, updated_at character varying not null);
create table if not exists public.enterprise_workspace_domains (domain_id character varying not null, workspace_id character varying not null, hostname character varying not null, scope character varying not null, provider character varying not null, runtime_target character varying not null, desired_state character varying not null, route_root character varying not null, dns_status character varying not null, tls_status character varying not null, http_status character varying not null, verified_at character varying not null, deployment_url character varying not null, last_deployed_at character varying not null, notes character varying not null, config_json text not null, created_at character varying not null, updated_at character varying not null);
create table if not exists public.enterprise_workspace_modules (assignment_id character varying not null, workspace_id character varying not null, module_id character varying not null, status character varying not null, source character varying not null, config_json text not null, created_at character varying not null, updated_at character varying not null);
create table if not exists public.enterprise_workspace_profiles (workspace_id character varying not null, company character varying not null, preferred_package character varying not null, first_team character varying not null, systems_json text not null, goal character varying not null, onboarding_status character varying not null, config_json text not null, created_at character varying not null, updated_at character varying not null);
create table if not exists public.enterprise_workspace_tasks (task_id character varying not null, workspace_id character varying not null, lead_id character varying not null, template character varying not null, title character varying not null, owner character varying not null, priority character varying not null, due character varying not null, status character varying not null, notes character varying not null, created_at character varying not null, updated_at character varying not null);
create table if not exists public.enterprise_workspaces (workspace_id character varying not null, slug character varying not null, name character varying not null, plan character varying not null, status character varying not null, created_at character varying not null, updated_at character varying not null);
create table if not exists public.iot_telemetry (id uuid default gen_random_uuid() not null, asset_id uuid not null, "timestamp" timestamp with time zone default now() not null, watts double precision not null, voltage double precision, created_at timestamp with time zone default now() not null);
create table if not exists public.production_ledger (id uuid default gen_random_uuid() not null, asset_id uuid not null, "timestamp" timestamp with time zone default now() not null, shift text not null, reported_units integer default 0 not null, rejects integer default 0 not null, source public.production_ledger_source default 'human'::public.production_ledger_source not null, created_at timestamp with time zone default now() not null);
create table if not exists public.supermega_campaign_clicks (click_id text not null, campaign text not null, source text not null, medium text not null, content text not null, destination_url text not null, source_url text, page_path text, referrer text, user_agent text, ip_hint text, clicked_at timestamp with time zone not null);
create table if not exists public.supermega_leads (id bigint default nextval('public.supermega_leads_id_seq'::regclass) not null, lead_id text not null, task_id text, source text, name text, email text, company text, workflow text, requested_package text, goal text, data text, team text, source_url text, page_path text, referrer text, utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text, lead_score integer, lead_stage text, status text, owner text, next_step text, submitted_at timestamp with time zone, raw jsonb default '{}'::jsonb not null, created_at timestamp with time zone default now() not null);
create table if not exists public.supermega_sales_runs (id bigint default nextval('public.supermega_sales_runs_id_seq'::regclass) not null, run_id text not null, run_type text not null, campaign text, status text not null, summary text, metrics jsonb default '{}'::jsonb not null, payload jsonb default '{}'::jsonb not null, generated_at timestamp with time zone not null, created_at timestamp with time zone default now() not null);
create table if not exists public.wcm_incidents (id uuid default gen_random_uuid() not null, asset_id uuid, org_id text not null, "timestamp" timestamp with time zone default now() not null, what text not null, who text, "where" text, "when" text, why text, how text, wcm_pillar text default 'Focused Improvement'::text not null, raw_text text, created_at timestamp with time zone default now() not null);

alter sequence public.supermega_leads_id_seq owned by public.supermega_leads.id;
alter sequence public.supermega_sales_runs_id_seq owned by public.supermega_sales_runs.id;

-- Keys and references are added after every table exists so the cross-table
-- foreign keys do not depend on creation order.
do $constraints$
begin
  if exists (select 1 from pg_constraint where conname = 'assets_pkey') then
    return;
  end if;

  alter table public.assets add constraint assets_pkey PRIMARY KEY (id);
  alter table public.enterprise_agent_runs add constraint enterprise_agent_runs_pkey PRIMARY KEY (run_id);
  alter table public.enterprise_audit_events add constraint enterprise_audit_events_pkey PRIMARY KEY (event_id);
  alter table public.enterprise_connector_events add constraint enterprise_connector_events_pkey PRIMARY KEY (event_id);
  alter table public.enterprise_knowledge_chunks add constraint enterprise_knowledge_chunks_pkey PRIMARY KEY (chunk_id);
  alter table public.enterprise_knowledge_embeddings add constraint enterprise_knowledge_embeddings_pkey PRIMARY KEY (chunk_id);
  alter table public.enterprise_lead_activities add constraint enterprise_lead_activities_pkey PRIMARY KEY (activity_id);
  alter table public.enterprise_lead_hunt_profiles add constraint enterprise_lead_hunt_profiles_pkey PRIMARY KEY (hunt_id);
  alter table public.enterprise_leads add constraint enterprise_leads_pkey PRIMARY KEY (lead_id);
  alter table public.enterprise_memberships add constraint enterprise_memberships_pkey PRIMARY KEY (membership_id);
  alter table public.enterprise_metric_records add constraint enterprise_metric_records_pkey PRIMARY KEY (metric_id);
  alter table public.enterprise_module_definitions add constraint enterprise_module_definitions_pkey PRIMARY KEY (module_id);
  alter table public.enterprise_sessions add constraint enterprise_sessions_pkey PRIMARY KEY (session_id);
  alter table public.enterprise_source_change_events add constraint enterprise_source_change_events_pkey PRIMARY KEY (event_id);
  alter table public.enterprise_source_records add constraint enterprise_source_records_pkey PRIMARY KEY (source_record_id);
  alter table public.enterprise_users add constraint enterprise_users_pkey PRIMARY KEY (username);
  alter table public.enterprise_workspace_domains add constraint enterprise_workspace_domains_pkey PRIMARY KEY (domain_id);
  alter table public.enterprise_workspace_modules add constraint enterprise_workspace_modules_pkey PRIMARY KEY (assignment_id);
  alter table public.enterprise_workspace_profiles add constraint enterprise_workspace_profiles_pkey PRIMARY KEY (workspace_id);
  alter table public.enterprise_workspace_tasks add constraint enterprise_workspace_tasks_pkey PRIMARY KEY (task_id);
  alter table public.enterprise_workspaces add constraint enterprise_workspaces_pkey PRIMARY KEY (workspace_id);
  alter table public.iot_telemetry add constraint iot_telemetry_pkey PRIMARY KEY (id);
  alter table public.production_ledger add constraint production_ledger_pkey PRIMARY KEY (id);
  alter table public.supermega_campaign_clicks add constraint supermega_campaign_clicks_pkey PRIMARY KEY (click_id);
  alter table public.supermega_leads add constraint supermega_leads_pkey PRIMARY KEY (id);
  alter table public.supermega_sales_runs add constraint supermega_sales_runs_pkey PRIMARY KEY (id);
  alter table public.wcm_incidents add constraint wcm_incidents_pkey PRIMARY KEY (id);

  alter table public.supermega_leads add constraint supermega_leads_lead_id_key UNIQUE (lead_id);
  alter table public.supermega_sales_runs add constraint supermega_sales_runs_run_id_key UNIQUE (run_id);

  alter table public.enterprise_agent_runs add constraint enterprise_agent_runs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.enterprise_workspaces(workspace_id);
  alter table public.enterprise_audit_events add constraint enterprise_audit_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.enterprise_workspaces(workspace_id);
  alter table public.enterprise_connector_events add constraint enterprise_connector_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.enterprise_workspaces(workspace_id);
  alter table public.enterprise_knowledge_chunks add constraint enterprise_knowledge_chunks_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.enterprise_workspaces(workspace_id);
  alter table public.enterprise_knowledge_embeddings add constraint enterprise_knowledge_embeddings_chunk_id_fkey FOREIGN KEY (chunk_id) REFERENCES public.enterprise_knowledge_chunks(chunk_id) ON DELETE CASCADE;
  alter table public.enterprise_lead_activities add constraint enterprise_lead_activities_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.enterprise_leads(lead_id);
  alter table public.enterprise_lead_activities add constraint enterprise_lead_activities_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.enterprise_workspaces(workspace_id);
  alter table public.enterprise_lead_hunt_profiles add constraint enterprise_lead_hunt_profiles_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.enterprise_workspaces(workspace_id);
  alter table public.enterprise_leads add constraint enterprise_leads_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.enterprise_workspaces(workspace_id);
  alter table public.enterprise_memberships add constraint enterprise_memberships_username_fkey FOREIGN KEY (username) REFERENCES public.enterprise_users(username);
  alter table public.enterprise_memberships add constraint enterprise_memberships_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.enterprise_workspaces(workspace_id);
  alter table public.enterprise_metric_records add constraint enterprise_metric_records_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.enterprise_workspaces(workspace_id);
  alter table public.enterprise_sessions add constraint enterprise_sessions_username_fkey FOREIGN KEY (username) REFERENCES public.enterprise_users(username);
  alter table public.enterprise_sessions add constraint enterprise_sessions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.enterprise_workspaces(workspace_id);
  alter table public.enterprise_source_change_events add constraint enterprise_source_change_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.enterprise_workspaces(workspace_id);
  alter table public.enterprise_source_records add constraint enterprise_source_records_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.enterprise_workspaces(workspace_id);
  alter table public.enterprise_workspace_domains add constraint enterprise_workspace_domains_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.enterprise_workspaces(workspace_id);
  alter table public.enterprise_workspace_modules add constraint enterprise_workspace_modules_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.enterprise_module_definitions(module_id);
  alter table public.enterprise_workspace_modules add constraint enterprise_workspace_modules_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.enterprise_workspaces(workspace_id);
  alter table public.enterprise_workspace_profiles add constraint enterprise_workspace_profiles_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.enterprise_workspaces(workspace_id);
  alter table public.enterprise_workspace_tasks add constraint enterprise_workspace_tasks_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.enterprise_workspaces(workspace_id);
  alter table public.iot_telemetry add constraint iot_telemetry_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;
  alter table public.production_ledger add constraint production_ledger_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;
  alter table public.wcm_incidents add constraint wcm_incidents_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE SET NULL;
end
$constraints$;

-- Match production: RLS on, no policies, so every row is denied to anon and
-- authenticated by default. Driven off the catalog rather than a second hardcoded
-- list, so it cannot drift from the tables created above. ALTER ... ENABLE is
-- idempotent, which keeps this file safe to re-run.
do $enable_rls$
declare
  target record;
begin
  for target in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  loop
    execute format('alter table public.%I enable row level security', target.relname);
  end loop;
end
$enable_rls$;

commit;
