-- SUPERMEGA kernel — the data spine (one source of truth). Supabase / Postgres.
-- This IS the proto-CRM: a minimal relational schema, not 40 screens. The UI grows on top.
-- See ../PLATFORM.md. Apply in the Supabase SQL editor.

create extension if not exists "pgcrypto";

-- A client = a won lead with an ongoing relationship. (Defined first — lead/project reference it.)
create table if not exists client (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  contacts    jsonb default '[]'::jsonb,                 -- [{name, role, channel, handle}]
  channels    jsonb default '{}'::jsonb,                 -- {kpay, mmqr, viber, email}
  notes       text,
  created_at  timestamptz not null default now()
);

-- A lead from the public funnel (/contact/) or outbound. Nothing is lost anymore.
create table if not exists lead (
  id          uuid primary key default gen_random_uuid(),
  source      text not null default 'contact-form',     -- contact-form | outbound | referral
  name        text,
  company     text,
  contact     text,                                      -- email / phone / viber
  package     text,                                      -- the chosen offer slug (build, tool-week, ...)
  message     text,
  score       int  default 0,                            -- ICP-fit score
  status      text not null default 'new',               -- new|qualified|scoped|quoted|won|lost
  client_id   uuid references client(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- A project = one engagement (one offer/tier) for a client.
create table if not exists project (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references client(id) on delete cascade,
  offer         text not null,                           -- tool-week | dashboard | ai-agent | design-ship | care-plan
  scope_summary text,
  price_mmk     bigint,
  price_usd     numeric(10,2),
  deposit_status text not null default 'unpaid',         -- unpaid|paid
  deposit_method text,                                   -- kpay|mmqr|cash|card
  status         text not null default 'scoping',        -- scoping|deposit|building|live|care
  live_url       text,
  created_at     timestamptz not null default now()
);

-- A build = the shipped artifact(s) of a project.
create table if not exists build (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references project(id) on delete cascade,
  modules     jsonb default '[]'::jsonb,                 -- reusable module names used → feeds the graduation tracker
  repo_or_url text,
  shipped_at  timestamptz
);

-- An operator run = one day's draft-only AI work for a live client (the Operate loop).
-- Findings + approvals are recorded; the agent NEVER acts without a logged approval.
create table if not exists operator_run (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references project(id) on delete cascade,
  ran_at      timestamptz not null default now(),
  findings    jsonb default '[]'::jsonb,                 -- [{title, evidence, moneyAtRisk}]
  approvals   jsonb default '[]'::jsonb                  -- [{findingId, decision, by, at}]
);

-- Graduation tracker: the 3rd repeat of the same request ships as a product.
create table if not exists graduation_request (
  id           uuid primary key default gen_random_uuid(),
  request      text not null unique,
  count        int  not null default 1,
  source_projects uuid[] default '{}',
  productized  boolean not null default false,
  updated_at   timestamptz not null default now()
);

create index if not exists lead_status_idx on lead(status);
create index if not exists project_status_idx on project(status);
create index if not exists project_client_idx on project(client_id);
