-- Minimal durable state for one isolated SuperMega workcell deployment.
-- Apply once in the client's dedicated Supabase project before provisioning Vercel.

begin;

create table if not exists public.supermega_console_activity (
  id text primary key,
  at timestamptz not null default now(),
  kind text,
  summary text,
  ref text
);

create table if not exists public.supermega_token_ledger (
  tenant_id text not null,
  "window" text not null,
  in_tokens bigint not null default 0,
  out_tokens bigint not null default 0,
  calls bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, "window")
);

create table if not exists public.supermega_ai_cache (
  cache_key text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.supermega_console_activity enable row level security;
alter table public.supermega_token_ledger enable row level security;
alter table public.supermega_ai_cache enable row level security;

revoke all on public.supermega_console_activity from anon, authenticated;
revoke all on public.supermega_token_ledger from anon, authenticated;
revoke all on public.supermega_ai_cache from anon, authenticated;

grant select, insert, update, delete on public.supermega_console_activity to service_role;
grant select, insert, update, delete on public.supermega_token_ledger to service_role;
grant select, insert, update, delete on public.supermega_ai_cache to service_role;

commit;
