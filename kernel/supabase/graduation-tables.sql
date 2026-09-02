-- SuperMega kernel console — auto-graduation flywheel migration (ADDITIVE).
-- Run in: Supabase SQL editor → same project as console-tables.sql (Mumbai / ojoeqrghsfvrvqlxjnnz).
-- These back store.mjs bumpGraduation / recordBuildModules / listGraduation. Safe to re-run.
-- The auto-loop: every saved deal packet bumps a module signature's count; every shipped project
-- records its modules; at count >= 3 the signature is flagged productized (graduation-ready).

-- One row per normalized request signature (e.g. "inventory", "kbzpay-mmqr-reconciliation").
create table if not exists public.supermega_graduation (
  signature    text primary key,                 -- normalized module/category slug
  label        text,                             -- human label of the first module that produced it
  count        int  not null default 1,          -- how many times this request has repeated
  sources      jsonb default '[]'::jsonb,         -- deal/project ids that contributed
  modules      jsonb default '[]'::jsonb,         -- module names seen under this signature
  productized  boolean not null default false,    -- true once count >= 3 (graduation-ready)
  graduated_at timestamptz,                       -- when it first crossed the threshold
  updated_at   timestamptz default now()
);

-- The modules of each shipped project (the "what we actually built" record → feeds the flywheel).
create table if not exists public.supermega_build_modules (
  id          text primary key,
  project_id  text,
  signature   text,
  modules     jsonb default '[]'::jsonb,
  shipped_at  timestamptz default now()
);

create index if not exists supermega_graduation_count_idx on public.supermega_graduation(count desc);

-- RLS: ops-only, consistent with the other console tables.
alter table public.supermega_graduation    enable row level security;
alter table public.supermega_build_modules enable row level security;

-- Explicit browser/API posture for existing Supabase projects and the 2026-10-30 Data API default change.
revoke all privileges on table public.supermega_graduation from public, anon, authenticated;
revoke all privileges on table public.supermega_build_modules from public, anon, authenticated;
grant select, insert, update on table public.supermega_graduation to service_role;
grant select, insert, update on table public.supermega_build_modules to service_role;

-- Reload PostgREST schema cache so the new tables are queryable over REST.
notify pgrst, 'reload schema';
