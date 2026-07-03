-- SuperMega kernel console — Supabase migration
-- Run in: Supabase SQL editor → project ojoeqrghsfvrvqlxjnnz (Mumbai)
-- These are the 4 tables the store.mjs queries in Supabase mode.
-- supermega_leads already exists (created by the website contact form).
-- kernel/schema.sql (short names: client, lead, project…) is dead — do not run it.

create table if not exists public.supermega_console_clients (
  id           text primary key,
  name         text not null,
  plan         text not null default 'free',  -- gates the AI gateway: 'free' → forced bulk tier + fixed cap
  contacts     jsonb default '[]'::jsonb,
  channels     jsonb default '{}'::jsonb,
  notes        text,
  created_at   timestamptz default now()
);

-- Existing installs predate the plan column — additive, safe to re-run.
alter table public.supermega_console_clients add column if not exists plan text not null default 'free';

create table if not exists public.supermega_console_projects (
  id             text primary key,
  client_id      text,
  lead_id        text,
  offer          text,
  scope_summary  text,
  price_mmk      bigint,
  deposit_status text default 'unpaid',
  deposit_method text,
  status         text default 'scoping',
  live_url       text,
  created_at     timestamptz default now()
);

create table if not exists public.supermega_console_deals (
  id          text primary key,
  lead_id     text,
  project_id  text,
  packet      jsonb,
  status      text default 'draft',
  created_at  timestamptz default now()
);

create table if not exists public.supermega_console_activity (
  id       text primary key,
  at       timestamptz default now(),
  kind     text,
  summary  text,
  ref      text
);

-- Graduation flywheel (which request signatures have repeated → productize-ready at count ≥ 3)
create table if not exists public.supermega_graduation (
  signature    text primary key,
  label        text,
  count        int not null default 1,
  sources      jsonb default '[]'::jsonb,
  modules      jsonb default '[]'::jsonb,
  productized  boolean not null default false,
  graduated_at timestamptz,
  updated_at   timestamptz default now()
);

-- AI gateway tables (token tracking + response cache)
create table if not exists public.supermega_token_ledger (
  tenant_id  text not null,
  "window"   text not null,   -- quoted: `window` is a reserved keyword in Postgres
  in_tokens  bigint default 0,
  out_tokens bigint default 0,
  calls      bigint default 0,
  updated_at timestamptz default now(),
  primary key (tenant_id, "window")
);

create table if not exists public.supermega_ai_cache (
  cache_key  text primary key,
  payload    jsonb not null,
  created_at timestamptz default now()
);

-- RLS: enabled on all tables; service_role key (used by kernel) bypasses RLS automatically.
-- Anon/authenticated roles have no access by policy (deny-by-default when RLS is on + no policies).
alter table public.supermega_console_clients  enable row level security;
alter table public.supermega_console_projects enable row level security;
alter table public.supermega_console_deals    enable row level security;
alter table public.supermega_console_activity enable row level security;
alter table public.supermega_token_ledger     enable row level security;
alter table public.supermega_ai_cache         enable row level security;
alter table public.supermega_graduation       enable row level security;

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
