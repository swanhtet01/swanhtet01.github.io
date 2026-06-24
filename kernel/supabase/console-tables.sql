-- SuperMega kernel console — Supabase migration
-- Run in: Supabase SQL editor → project ojoeqrghsfvrvqlxjnnz (Mumbai)
-- These are the 4 tables the store.mjs queries in Supabase mode.
-- supermega_leads already exists (created by the website contact form).
-- kernel/schema.sql (short names: client, lead, project…) is dead — do not run it.

create table if not exists public.supermega_console_clients (
  id           text primary key,
  name         text not null,
  contacts     jsonb default '[]'::jsonb,
  channels     jsonb default '{}'::jsonb,
  notes        text,
  created_at   timestamptz default now()
);

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

-- RLS: ops-only, no public access needed
alter table public.supermega_console_clients  enable row level security;
alter table public.supermega_console_projects enable row level security;
alter table public.supermega_console_deals    enable row level security;
alter table public.supermega_console_activity enable row level security;

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
