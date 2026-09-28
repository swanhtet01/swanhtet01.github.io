-- SUPERMEGA kernel — payment-event idempotency table (webhook / IPN dedup).
-- Run ONCE on the kernel's Supabase/Postgres project. This makes payment-webhook dedup durable
-- across serverless cold starts and shared across instances (without it, store.recordPaymentEvent
-- falls back to a per-instance in-memory Set — protection, but not cross-instance). Safe to re-run.
--
-- In postgres mode the kernel auto-creates this via store.ensurePgTables(); in supabase mode the
-- service-role key cannot run DDL through PostgREST, so apply this in the Supabase SQL editor.

create table if not exists public.supermega_payment_events (
  provider     text        not null,
  event_id     text        not null,
  project_ref  text,
  amount_total bigint,
  currency     text,
  at           timestamptz not null default now(),
  primary key (provider, event_id)
);

alter table public.supermega_payment_events enable row level security;

-- Explicit browser/API posture for existing Supabase projects and the 2026-10-30 Data API default change.
revoke all privileges on table public.supermega_payment_events from public, anon, authenticated;
grant select, insert, delete on table public.supermega_payment_events to service_role;

-- Optional housekeeping — dedup only needs a reasonable replay window:
-- delete from public.supermega_payment_events where at < now() - interval '90 days';
