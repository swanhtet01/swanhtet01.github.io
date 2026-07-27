-- SuperMega kernel console — Supabase migration
-- Run in: Supabase SQL editor → project ojoeqrghsfvrvqlxjnnz (Mumbai)
-- These are the durable tables and RPCs store.mjs queries in Supabase mode.
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

-- Atomic company-wide daily provider-attempt admission. `reserved_units` is a conservative
-- cost-weighted upper bound and remains charged after ambiguous provider failures.
create table if not exists public.supermega_ai_budget_reservations (
  reservation_id text primary key check (char_length(reservation_id) between 1 and 120),
  "window" text not null check ("window" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  reserved_units bigint not null check (reserved_units > 0),
  actual_units bigint check (actual_units is null or actual_units >= 0),
  status text not null default 'reserved' check (status in ('reserved','consumed','failed','released')),
  tenant_id text,
  tier text,
  provider text,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create index if not exists supermega_ai_budget_window_status_idx
  on public.supermega_ai_budget_reservations ("window", status);

create or replace function public.supermega_reserve_ai_budget(
  p_reservation_id text,
  p_window text,
  p_reserved_units bigint,
  p_cap_units bigint,
  p_tenant_id text default null,
  p_tier text default null,
  p_provider text default null
) returns table (granted boolean, used_units bigint, cap_units bigint, reason text)
language plpgsql
security invoker
set search_path = public
as $supermega$
declare
  current_used bigint;
  effective_cap bigint;
begin
  if p_reservation_id is null or char_length(p_reservation_id) not between 1 and 120
    or p_window is null or p_window !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or p_reserved_units is null or p_reserved_units <= 0
    or p_cap_units is null or p_cap_units <= 0 then
    return query select false, 0::bigint, greatest(coalesce(p_cap_units, 0), 0)::bigint, 'invalid_budget_reservation'::text;
    return;
  end if;

  effective_cap := least(p_cap_units, 2000000);

  perform pg_advisory_xact_lock(hashtext('supermega-ai-budget:' || p_window));
  select coalesce(sum(r.reserved_units), 0)::bigint
    into current_used
    from public.supermega_ai_budget_reservations r
   where r."window" = p_window and r.status <> 'released';

  if exists (select 1 from public.supermega_ai_budget_reservations r where r.reservation_id = p_reservation_id) then
    return query select false, current_used, effective_cap, 'duplicate_budget_reservation'::text;
    return;
  end if;
  if current_used + p_reserved_units > effective_cap then
    return query select false, current_used, effective_cap, 'company_daily_budget_reached'::text;
    return;
  end if;

  insert into public.supermega_ai_budget_reservations
    (reservation_id, "window", reserved_units, status, tenant_id, tier, provider)
  values
    (p_reservation_id, p_window, p_reserved_units, 'reserved', nullif(p_tenant_id, ''), nullif(p_tier, ''), nullif(p_provider, ''));
  return query select true, current_used + p_reserved_units, effective_cap, null::text;
end;
$supermega$;

-- One indexed UTC-window aggregate for protected operator telemetry. It deliberately omits every
-- tenant/provider/detail column and counts only admissions that remain charged to the daily cap.
create or replace function public.supermega_get_ai_budget_usage(p_window text)
returns table (reserved_units bigint, attempts bigint, in_flight bigint, consumed bigint, failed bigint)
language sql
stable
security invoker
set search_path = public
as $supermega$
  select
    coalesce(sum(r.reserved_units), 0)::bigint as reserved_units,
    count(*)::bigint as attempts,
    count(*) filter (where r.status = 'reserved')::bigint as in_flight,
    count(*) filter (where r.status = 'consumed')::bigint as consumed,
    count(*) filter (where r.status = 'failed')::bigint as failed
  from public.supermega_ai_budget_reservations r
  where r."window" = p_window and r.status <> 'released'
$supermega$;

create table if not exists public.supermega_ai_cache (
  cache_key  text primary key,
  payload    jsonb not null,
  created_at timestamptz default now()
);

create table if not exists public.supermega_action_queue (
  id text primary key,
  client_id text not null,
  action_type text not null,
  title text not null,
  payload jsonb not null,
  payload_hash text not null,
  source jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','approved','executing','succeeded','failed','rejected')),
  version integer not null default 0,
  approved_by text,
  approved_at timestamptz,
  rejected_by text,
  rejected_at timestamptz,
  executing_at timestamptz,
  lease_expires_at timestamptz,
  attempts integer not null default 0,
  provider_ref text,
  result jsonb,
  last_error text,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supermega_action_queue_status_created_idx
  on public.supermega_action_queue (status, created_at desc);

-- RLS: enabled on all tables; service_role key (used by kernel) bypasses RLS automatically.
-- Anon/authenticated roles have no access by policy (deny-by-default when RLS is on + no policies).
alter table public.supermega_console_clients  enable row level security;
alter table public.supermega_console_projects enable row level security;
alter table public.supermega_console_deals    enable row level security;
alter table public.supermega_console_activity enable row level security;
alter table public.supermega_token_ledger     enable row level security;
alter table public.supermega_ai_budget_reservations enable row level security;
alter table public.supermega_ai_cache         enable row level security;
alter table public.supermega_graduation       enable row level security;
alter table public.supermega_action_queue     enable row level security;

revoke all on public.supermega_action_queue from anon, authenticated;
grant select, insert, update, delete on public.supermega_action_queue to service_role;
revoke all on public.supermega_ai_budget_reservations from anon, authenticated;
grant select, insert, update, delete on public.supermega_ai_budget_reservations to service_role;
revoke all on function public.supermega_reserve_ai_budget(text,text,bigint,bigint,text,text,text) from public, anon, authenticated;
grant execute on function public.supermega_reserve_ai_budget(text,text,bigint,bigint,text,text,text) to service_role;
revoke all on function public.supermega_get_ai_budget_usage(text) from public, anon, authenticated;
grant execute on function public.supermega_get_ai_budget_usage(text) to service_role;

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
