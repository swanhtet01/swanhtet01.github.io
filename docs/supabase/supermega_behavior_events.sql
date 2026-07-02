create table if not exists public.supermega_behavior_events (
  event_id text primary key,
  event_type text not null,
  page_path text,
  template_id text,
  requested_package text,
  component text,
  cta_text text,
  source_url text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  session_hint text,
  user_agent text,
  ip_hint text,
  recorded_at timestamptz not null,
  raw jsonb not null default '{}'::jsonb
);

create index if not exists supermega_behavior_events_type_idx
on public.supermega_behavior_events (event_type, recorded_at desc);

create index if not exists supermega_behavior_events_template_idx
on public.supermega_behavior_events (template_id, recorded_at desc);

create index if not exists supermega_behavior_events_campaign_idx
on public.supermega_behavior_events (utm_campaign, recorded_at desc);

alter table public.supermega_behavior_events enable row level security;

notify pgrst, 'reload schema';
