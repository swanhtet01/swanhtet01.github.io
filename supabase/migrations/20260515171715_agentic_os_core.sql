create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'production_ledger_source') then
    create type production_ledger_source as enum ('human', 'vision_agent');
  end if;
end $$;

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  name text not null,
  asset_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.iot_telemetry (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  "timestamp" timestamptz not null default now(),
  watts double precision not null,
  voltage double precision,
  created_at timestamptz not null default now()
);

create table if not exists public.production_ledger (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  "timestamp" timestamptz not null default now(),
  shift text not null,
  reported_units integer not null default 0,
  rejects integer not null default 0,
  source production_ledger_source not null default 'human',
  created_at timestamptz not null default now()
);

create table if not exists public.wcm_incidents (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references public.assets(id) on delete set null,
  org_id text not null,
  "timestamp" timestamptz not null default now(),
  what text not null,
  who text,
  "where" text,
  "when" text,
  why text,
  how text,
  wcm_pillar text not null default 'Focused Improvement',
  raw_text text,
  created_at timestamptz not null default now()
);

create index if not exists idx_assets_org_id on public.assets(org_id);
create index if not exists idx_assets_type on public.assets(asset_type);
create index if not exists idx_iot_telemetry_asset_time on public.iot_telemetry(asset_id, "timestamp" desc);
create index if not exists idx_production_ledger_asset_time on public.production_ledger(asset_id, "timestamp" desc);
create index if not exists idx_production_ledger_source on public.production_ledger(source);
create index if not exists idx_wcm_incidents_org_time on public.wcm_incidents(org_id, "timestamp" desc);
create index if not exists idx_wcm_incidents_asset_time on public.wcm_incidents(asset_id, "timestamp" desc);
create index if not exists idx_wcm_incidents_pillar on public.wcm_incidents(wcm_pillar);

alter table public.assets enable row level security;
alter table public.iot_telemetry enable row level security;
alter table public.production_ledger enable row level security;
alter table public.wcm_incidents enable row level security;

comment on table public.assets is 'Factory assets and machines for the agentic WCM/ERP digital twin.';
comment on table public.iot_telemetry is 'High-frequency smart-meter readings used to infer asset state.';
comment on table public.production_ledger is 'Human and vision-agent production reports from forms, whiteboards, and structured entry.';
comment on table public.wcm_incidents is 'Structured WCM/ISO incident records extracted from voice, text, or manager entry.';
