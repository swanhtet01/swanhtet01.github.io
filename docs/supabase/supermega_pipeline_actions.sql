create table if not exists public.supermega_pipeline_actions (
  id bigserial primary key,
  action_id text unique not null,
  lead_id text,
  task_id text,
  run_id text,
  action_type text not null,
  status text not null default 'open',
  priority text not null default 'medium',
  owner text not null default 'Revenue Pod',
  title text not null,
  next_step text,
  due_at timestamptz,
  evidence_url text,
  source_url text,
  approval_required boolean not null default true,
  approval_state text not null default 'pending',
  notification_channel text not null default 'email',
  notification_status text not null default 'queued',
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.supermega_pipeline_actions
  add column if not exists result jsonb;

alter table public.supermega_pipeline_actions
  add column if not exists processed_at timestamptz;

alter table public.supermega_pipeline_actions
  add column if not exists error text;

create index if not exists supermega_pipeline_actions_created_at_idx
  on public.supermega_pipeline_actions (created_at desc);

create index if not exists supermega_pipeline_actions_lead_idx
  on public.supermega_pipeline_actions (lead_id, created_at desc);

create index if not exists supermega_pipeline_actions_status_idx
  on public.supermega_pipeline_actions (status, approval_state, priority);

create index if not exists supermega_pipeline_actions_run_idx
  on public.supermega_pipeline_actions (run_id);

alter table public.supermega_pipeline_actions enable row level security;

notify pgrst, 'reload schema';
