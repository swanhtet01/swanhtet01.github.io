-- supermega_pipeline_actions
-- Queued actions from Telegram bot, future Viber/LINE webhook, or any agent
-- that needs async processing. The sales-daily cron and any operator agent
-- poll this table, process queued rows, and mark them done or failed.

create table if not exists public.supermega_pipeline_actions (
  id             uuid primary key default gen_random_uuid(),
  action_type    text not null,          -- 'draft_reply' | 'mark_done' | 'snooze' | 'freeform' | 'status_check'
  source         text not null default 'telegram',  -- 'telegram' | 'viber' | 'api' | 'cron'
  chat_id        text,                   -- originating chat/user ID
  message_id     text,                   -- source message reference
  lead_id        text,                   -- resolved lead reference (filled during processing)
  args           text,                   -- parsed arguments or natural-language text
  raw_text       text,                   -- original message text, truncated to 2000 chars
  result         jsonb,                  -- filled by processor: { summary, draft, ... }
  status         text not null default 'queued',  -- 'queued' | 'processing' | 'done' | 'failed' | 'skipped'
  error          text,                   -- error message if failed
  created_at     timestamptz not null default now(),
  processed_at   timestamptz,
  updated_at     timestamptz not null default now()
);

-- Index for the processor polling pattern: newest queued first
create index if not exists supermega_pipeline_actions_status_created
  on public.supermega_pipeline_actions (status, created_at desc);

-- Index for lead lookup
create index if not exists supermega_pipeline_actions_lead_id
  on public.supermega_pipeline_actions (lead_id)
  where lead_id is not null;

-- RLS: service role only (no public access)
alter table public.supermega_pipeline_actions enable row level security;

-- Trigger: auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists supermega_pipeline_actions_updated_at on public.supermega_pipeline_actions;
create trigger supermega_pipeline_actions_updated_at
  before update on public.supermega_pipeline_actions
  for each row execute procedure public.set_updated_at();
