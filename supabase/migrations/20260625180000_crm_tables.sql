-- SuperMega CRM + pipeline tables
-- Apply in Supabase SQL editor: ojoeqrghsfvrvqlxjnnz.supabase.co
-- Safe to re-run (idempotent).

-- 1. supermega_leads — one row per contact-form submission / qualified lead
create table if not exists public.supermega_leads (
  id              uuid primary key default gen_random_uuid(),
  lead_id         text not null unique,
  task_id         text,
  source          text not null default 'website',
  name            text,
  email           text,
  company         text,
  workflow        text,
  requested_package text,
  goal            text,
  data            text,
  team            text,
  source_url      text,
  page_path       text,
  referrer        text,
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_content     text,
  utm_term        text,
  lead_score      integer,
  lead_stage      text,
  status          text not null default 'open',
  owner           text,
  next_step       text,
  submitted_at    timestamptz not null default now(),
  raw             jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_leads_email       on public.supermega_leads(email);
create index if not exists idx_leads_status      on public.supermega_leads(status);
create index if not exists idx_leads_submitted   on public.supermega_leads(submitted_at desc);
create index if not exists idx_leads_score       on public.supermega_leads(lead_score desc);

-- 2. supermega_pipeline_actions — unified action queue for both:
--    a) sales automation (savePipelineAction in datastore.js)
--    b) Telegram bot commands
-- All sales-automation columns are NOT NULL only when action_id is present.
drop table if exists public.supermega_pipeline_actions;
create table if not exists public.supermega_pipeline_actions (
  id                    uuid primary key default gen_random_uuid(),
  -- Sales automation fields (populated by savePipelineAction / sales-daily cron)
  action_id             text unique,           -- e.g. AUTO-lead-source
  lead_id               text,
  task_id               text,
  run_id                text,
  priority              text,
  owner                 text,
  title                 text,
  next_step             text,
  due_at                timestamptz,
  evidence_url          text,
  source_url            text,
  approval_required     boolean not null default false,
  approval_state        text not null default 'pending',
  notification_channel  text,
  notification_status   text,
  payload               jsonb not null default '{}'::jsonb,
  -- Telegram bot fields (populated by telegram-webhook.js)
  chat_id               text,
  message_id            text,
  args                  text,
  raw_text              text,
  result                jsonb,
  error                 text,
  processed_at          timestamptz,
  -- Shared
  action_type           text not null,
  source                text not null default 'system',
  status                text not null default 'queued',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_actions_status      on public.supermega_pipeline_actions(status, created_at desc);
create index if not exists idx_actions_lead        on public.supermega_pipeline_actions(lead_id);
create index if not exists idx_actions_run         on public.supermega_pipeline_actions(run_id);
create index if not exists idx_actions_type        on public.supermega_pipeline_actions(action_type);

-- 3. supermega_sales_runs — one row per daily sales brief run
create table if not exists public.supermega_sales_runs (
  id            uuid primary key default gen_random_uuid(),
  run_id        text not null unique,
  run_type      text not null default 'sales_daily',
  campaign      text,
  status        text not null default 'ready',
  summary       text,
  metrics       jsonb not null default '{}'::jsonb,
  payload       jsonb not null default '{}'::jsonb,
  generated_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_sales_runs_generated on public.supermega_sales_runs(generated_at desc);
create index if not exists idx_sales_runs_campaign  on public.supermega_sales_runs(campaign);

-- 4. updated_at triggers for all three tables
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists set_updated_at on public.supermega_leads;
create trigger set_updated_at before update on public.supermega_leads
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.supermega_pipeline_actions;
create trigger set_updated_at before update on public.supermega_pipeline_actions
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.supermega_sales_runs;
create trigger set_updated_at before update on public.supermega_sales_runs
  for each row execute function public.set_updated_at();

-- 5. RLS — service role bypasses these; anon/authenticated have no access
alter table public.supermega_leads           enable row level security;
alter table public.supermega_pipeline_actions enable row level security;
alter table public.supermega_sales_runs       enable row level security;
