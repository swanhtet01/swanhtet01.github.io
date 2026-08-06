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
  cap_tokens bigint check (cap_tokens is null or cap_tokens > 0),
  in_tokens bigint not null default 0,
  out_tokens bigint not null default 0,
  calls bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, "window")
);

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

alter table public.supermega_token_ledger add column if not exists cap_tokens bigint;
do $migration$
begin
  if not exists (select 1 from pg_constraint where conname='supermega_token_ledger_cap_positive') then
    alter table public.supermega_token_ledger add constraint supermega_token_ledger_cap_positive check (cap_tokens is null or cap_tokens > 0);
  end if;
end;
$migration$;

create table if not exists public.supermega_spend_reservations (
  reservation_id text primary key check (char_length(reservation_id) between 1 and 120),
  tenant_id text not null check (char_length(tenant_id) between 1 and 200),
  "window" text not null check ("window" ~ '^\d{4}-\d{2}$'),
  reserved_tokens bigint not null check (reserved_tokens > 0),
  status text not null default 'reserved' check (status in ('reserved', 'dispatched', 'indeterminate', 'settled', 'released')),
  dispatch_token text not null check (char_length(dispatch_token) between 1 and 160),
  context jsonb not null default '{}'::jsonb,
  actual_in_tokens bigint not null default 0 check (actual_in_tokens >= 0),
  actual_out_tokens bigint not null default 0 check (actual_out_tokens >= 0),
  actual_calls bigint not null default 0 check (actual_calls >= 0),
  reconciled_by text,
  reconciliation_evidence_hash text,
  reconciled_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.supermega_spend_reservations add column if not exists dispatch_token text;
alter table public.supermega_spend_reservations add column if not exists context jsonb not null default '{}'::jsonb;
alter table public.supermega_spend_reservations add column if not exists reconciled_by text;
alter table public.supermega_spend_reservations add column if not exists reconciliation_evidence_hash text;
alter table public.supermega_spend_reservations add column if not exists reconciled_at timestamptz;
do $migration$
begin
  if exists (select 1 from public.supermega_spend_reservations where status='active') then
    raise exception 'legacy_active_reservations_require_reconciliation';
  end if;
  if exists (
    select 1 from pg_constraint
     where conrelid='public.supermega_spend_reservations'::regclass
       and conname='supermega_spend_reservations_status_check'
       and pg_get_constraintdef(oid) not like '%indeterminate%'
  ) then
    alter table public.supermega_spend_reservations drop constraint supermega_spend_reservations_status_check;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid='public.supermega_spend_reservations'::regclass
       and conname='supermega_spend_reservations_status_check'
       and pg_get_constraintdef(oid) like '%indeterminate%'
  ) then
    alter table public.supermega_spend_reservations alter column status set default 'reserved';
    alter table public.supermega_spend_reservations add constraint supermega_spend_reservations_status_check check (status in ('reserved', 'dispatched', 'indeterminate', 'settled', 'released'));
  end if;
  update public.supermega_spend_reservations
     set dispatch_token='legacy-terminal:' || md5(reservation_id)
   where dispatch_token is null and status in ('settled','released');
  if exists (select 1 from public.supermega_spend_reservations where dispatch_token is null) then
    raise exception 'reservation_dispatch_token_reconciliation_required';
  end if;
  alter table public.supermega_spend_reservations alter column dispatch_token set not null;
  if not exists (
    select 1 from pg_constraint
     where conrelid='public.supermega_spend_reservations'::regclass
       and conname='supermega_spend_reservations_dispatch_token_check'
  ) then
    alter table public.supermega_spend_reservations add constraint supermega_spend_reservations_dispatch_token_check check (char_length(dispatch_token) between 1 and 160);
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid='public.supermega_spend_reservations'::regclass
       and conname='supermega_spend_reservations_reconciliation_check'
  ) then
    alter table public.supermega_spend_reservations add constraint supermega_spend_reservations_reconciliation_check check (
      (reconciled_by is null and reconciliation_evidence_hash is null and reconciled_at is null)
      or (char_length(reconciled_by) between 1 and 80 and reconciliation_evidence_hash ~ '^[a-f0-9]{64}$' and reconciled_at is not null)
    );
  end if;
end;
$migration$;

create table if not exists public.supermega_ai_cache (
  cache_key text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now()
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

create table if not exists public.supermega_owner_evidence (
  id text primary key check (char_length(id) between 1 and 80),
  source text not null check (source in ('line','viber','manual')),
  source_ref text check (source_ref is null or char_length(source_ref) <= 120),
  occurred_at timestamptz not null,
  text text not null check (char_length(text) between 1 and 2000),
  reviewed_by text not null check (char_length(reviewed_by) between 1 and 80),
  reviewed_at timestamptz not null default now(),
  fingerprint text not null unique check (fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);

create index if not exists supermega_action_queue_status_created_idx
  on public.supermega_action_queue (status, created_at desc);

create index if not exists supermega_spend_reservations_active_idx
  on public.supermega_spend_reservations (tenant_id, "window", status);

create index if not exists supermega_owner_evidence_occurred_idx
  on public.supermega_owner_evidence (occurred_at desc, id);

alter table public.supermega_console_activity enable row level security;
alter table public.supermega_token_ledger enable row level security;
alter table public.supermega_ai_budget_reservations enable row level security;
alter table public.supermega_spend_reservations enable row level security;
alter table public.supermega_ai_cache enable row level security;
alter table public.supermega_action_queue enable row level security;
alter table public.supermega_owner_evidence enable row level security;

revoke all on public.supermega_console_activity from anon, authenticated;
revoke all on public.supermega_token_ledger from anon, authenticated;
revoke all on public.supermega_ai_budget_reservations from anon, authenticated;
revoke all on public.supermega_token_ledger from public, service_role;
revoke all on public.supermega_spend_reservations from public, anon, authenticated, service_role;
revoke all on public.supermega_ai_cache from anon, authenticated;
revoke all on public.supermega_action_queue from anon, authenticated;
revoke all on public.supermega_owner_evidence from anon, authenticated;

grant select, insert, update, delete on public.supermega_console_activity to service_role;
-- The token ledger is deliberately NOT granted to service_role: all ledger mutation flows through
-- the security-definer spend RPCs below. The company budget reservation table keeps direct grants
-- because supermega_reserve_ai_budget is security invoker and settlement PATCHes the row directly.
grant select, insert, update, delete on public.supermega_ai_budget_reservations to service_role;
grant select, insert, update, delete on public.supermega_ai_cache to service_role;
grant select, insert, update, delete on public.supermega_action_queue to service_role;
grant select, insert on public.supermega_owner_evidence to service_role;
revoke all on function public.supermega_reserve_ai_budget(text,text,bigint,bigint,text,text,text) from public, anon, authenticated;
grant execute on function public.supermega_reserve_ai_budget(text,text,bigint,bigint,text,text,text) to service_role;
revoke all on function public.supermega_get_ai_budget_usage(text) from public, anon, authenticated;
grant execute on function public.supermega_get_ai_budget_usage(text) to service_role;

create or replace function public.supermega_get_token_usage(p_tenant_id text, p_window text)
returns table (
  tenant_id text,
  "window" text,
  cap_tokens bigint,
  in_tokens bigint,
  out_tokens bigint,
  calls bigint,
  reserved_tokens bigint,
  committed_tokens bigint,
  spend_total bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_tenant_id,
    p_window,
    ledger.cap_tokens,
    coalesce(ledger.in_tokens, 0),
    coalesce(ledger.out_tokens, 0),
    coalesce(ledger.calls, 0),
    coalesce((select sum(r.reserved_tokens) from public.supermega_spend_reservations as r where r.tenant_id=p_tenant_id and r."window"=p_window and r.status in ('reserved','dispatched','indeterminate')), 0),
    coalesce(ledger.in_tokens, 0) + coalesce(ledger.out_tokens, 0),
    coalesce(ledger.in_tokens, 0) + coalesce(ledger.out_tokens, 0)
      + coalesce((select sum(r.reserved_tokens) from public.supermega_spend_reservations as r where r.tenant_id=p_tenant_id and r."window"=p_window and r.status in ('reserved','dispatched','indeterminate')), 0)
  from (values (1)) as seed(n)
  left join public.supermega_token_ledger as ledger
    on ledger.tenant_id=p_tenant_id and ledger."window"=p_window
  where p_tenant_id is not null and p_tenant_id <> '' and p_window ~ '^\d{4}-\d{2}$';
$$;

drop function if exists public.supermega_add_token_usage(text, text, bigint, bigint, bigint);

drop function if exists public.supermega_reserve_token_spend(text, text, text, bigint, bigint, timestamptz);
drop function if exists public.supermega_settle_token_spend(text, bigint, bigint, bigint);
drop function if exists public.supermega_release_token_spend(text);

create or replace function public.supermega_reserve_token_spend(
  p_reservation_id text,
  p_tenant_id text,
  p_window text,
  p_reserved_tokens bigint,
  p_cap_tokens bigint,
  p_expires_at timestamptz,
  p_dispatch_token text,
  p_context jsonb
)
returns table (
  accepted boolean,
  reason text,
  reservation_id text,
  status text,
  in_tokens bigint,
  out_tokens bigint,
  calls bigint,
  reserved_tokens bigint,
  committed_tokens bigint,
  spend_total bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_in bigint;
  v_out bigint;
  v_calls bigint;
  v_cap bigint;
  v_reserved bigint;
  v_existing_tenant text;
  v_existing_window text;
  v_existing_reserved bigint;
  v_existing_status text;
  v_existing_dispatch_token text;
  v_existing_context jsonb;
  v_existing_expires_at timestamptz;
  v_same_scope boolean;
begin
  if p_reservation_id is null or char_length(p_reservation_id) not between 1 and 120
     or p_tenant_id is null or char_length(p_tenant_id) not between 1 and 200
     or p_window !~ '^\d{4}-\d{2}$' or p_reserved_tokens <= 0 or p_cap_tokens <= 0
     or p_expires_at is null or p_expires_at <= now()
     or p_dispatch_token is null or char_length(p_dispatch_token) not between 1 and 160
     or p_context is null or jsonb_typeof(p_context) <> 'object' or pg_column_size(p_context) > 4096 then
    raise exception 'invalid_spend_reservation';
  end if;

  insert into public.supermega_token_ledger (tenant_id, "window", cap_tokens)
  values (p_tenant_id, p_window, p_cap_tokens)
  on conflict do nothing;

  select ledger.cap_tokens, ledger.in_tokens, ledger.out_tokens, ledger.calls
    into v_cap, v_in, v_out, v_calls
    from public.supermega_token_ledger as ledger
   where ledger.tenant_id = p_tenant_id and ledger."window" = p_window
   for update;

  if v_cap is null then
    update public.supermega_token_ledger as ledger
       set cap_tokens=p_cap_tokens, updated_at=now()
     where ledger.tenant_id=p_tenant_id and ledger."window"=p_window
     returning ledger.cap_tokens, ledger.in_tokens, ledger.out_tokens, ledger.calls into v_cap, v_in, v_out, v_calls;
  end if;

  select r.tenant_id, r."window", r.reserved_tokens, r.status, r.dispatch_token, r.context, r.expires_at
    into v_existing_tenant, v_existing_window, v_existing_reserved, v_existing_status, v_existing_dispatch_token, v_existing_context, v_existing_expires_at
    from public.supermega_spend_reservations as r
   where r.reservation_id = p_reservation_id;

  select coalesce(sum(r.reserved_tokens), 0)
    into v_reserved
    from public.supermega_spend_reservations as r
   where r.tenant_id = p_tenant_id and r."window" = p_window and r.status in ('reserved','dispatched','indeterminate');

  if v_cap <> p_cap_tokens then
    accepted := false;
    reason := 'cap_mismatch';
    reservation_id := p_reservation_id;
    status := 'rejected';
    in_tokens := v_in;
    out_tokens := v_out;
    calls := v_calls;
    reserved_tokens := v_reserved;
    committed_tokens := v_in + v_out;
    spend_total := v_in + v_out + v_reserved;
    return next;
    return;
  end if;

  if v_existing_status is not null then
    v_same_scope := v_existing_tenant = p_tenant_id
      and v_existing_window = p_window
      and v_existing_reserved = p_reserved_tokens
      and v_existing_context = p_context;
    if v_same_scope and v_existing_status = 'reserved' and v_existing_dispatch_token = p_dispatch_token then
      accepted := true;
      reason := 'idempotent';
    elsif v_same_scope and v_existing_status = 'reserved' and v_existing_expires_at <= now() then
      update public.supermega_spend_reservations as r
         set dispatch_token=p_dispatch_token, context=p_context, expires_at=p_expires_at, updated_at=now()
       where r.reservation_id=p_reservation_id;
      accepted := true;
      reason := 'reservation_reclaimed';
    else
      accepted := false;
      reason := case
        when v_same_scope and v_existing_status in ('dispatched','indeterminate') then 'reconciliation_required'
        when v_same_scope and v_existing_status = 'reserved' then 'reservation_in_progress'
        else 'reservation_exists'
      end;
    end if;
    reservation_id := p_reservation_id;
    status := v_existing_status;
    in_tokens := v_in;
    out_tokens := v_out;
    calls := v_calls;
    reserved_tokens := v_reserved;
    committed_tokens := v_in + v_out;
    spend_total := v_in + v_out + v_reserved;
    return next;
    return;
  end if;

  if v_in + v_out + v_reserved + p_reserved_tokens > v_cap then
    accepted := false;
    reason := 'cap_reached';
    reservation_id := p_reservation_id;
    status := 'rejected';
    in_tokens := v_in;
    out_tokens := v_out;
    calls := v_calls;
    reserved_tokens := v_reserved;
    committed_tokens := v_in + v_out;
    spend_total := v_in + v_out + v_reserved;
    return next;
    return;
  end if;

  insert into public.supermega_spend_reservations (reservation_id, tenant_id, "window", reserved_tokens, status, expires_at, dispatch_token, context)
  values (p_reservation_id, p_tenant_id, p_window, p_reserved_tokens, 'reserved', p_expires_at, p_dispatch_token, p_context);

  accepted := true;
  reason := 'reserved';
  reservation_id := p_reservation_id;
  status := 'reserved';
  in_tokens := v_in;
  out_tokens := v_out;
  calls := v_calls;
  reserved_tokens := v_reserved + p_reserved_tokens;
  committed_tokens := v_in + v_out;
  spend_total := v_in + v_out + v_reserved + p_reserved_tokens;
  return next;
end;
$$;

create or replace function public.supermega_mark_token_spend_dispatched(
  p_reservation_id text,
  p_dispatch_token text
)
returns table (changed boolean, reason text, reservation_id text, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_dispatch_token text;
  v_expires_at timestamptz;
begin
  if p_reservation_id is null or p_reservation_id = ''
     or p_dispatch_token is null or p_dispatch_token = '' then
    raise exception 'invalid_spend_dispatch';
  end if;
  select r.status, r.dispatch_token, r.expires_at
    into v_status, v_dispatch_token, v_expires_at
    from public.supermega_spend_reservations as r
   where r.reservation_id=p_reservation_id
   for update;
  if not found then
    changed := false; reason := 'reservation_not_found'; reservation_id := p_reservation_id; return next; return;
  end if;
  if v_dispatch_token is distinct from p_dispatch_token then
    changed := false; reason := 'dispatch_token_mismatch';
  elsif v_status = 'dispatched' then
    changed := true; reason := 'idempotent';
  elsif v_status <> 'reserved' then
    changed := false; reason := 'invalid_reservation_state';
  elsif v_expires_at <= now() then
    changed := false; reason := 'reservation_stale';
  else
    update public.supermega_spend_reservations as r
       set status='dispatched', updated_at=now()
     where r.reservation_id=p_reservation_id;
    changed := true; reason := 'dispatched'; v_status := 'dispatched';
  end if;
  reservation_id := p_reservation_id; status := v_status; return next;
end;
$$;

create or replace function public.supermega_mark_token_spend_indeterminate(
  p_reservation_id text,
  p_dispatch_token text
)
returns table (changed boolean, reason text, reservation_id text, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_dispatch_token text;
begin
  if p_reservation_id is null or p_reservation_id = ''
     or p_dispatch_token is null or p_dispatch_token = '' then
    raise exception 'invalid_spend_indeterminate';
  end if;
  select r.status, r.dispatch_token
    into v_status, v_dispatch_token
    from public.supermega_spend_reservations as r
   where r.reservation_id=p_reservation_id
   for update;
  if not found then
    changed := false; reason := 'reservation_not_found'; reservation_id := p_reservation_id; return next; return;
  end if;
  if v_dispatch_token is distinct from p_dispatch_token then
    changed := false; reason := 'dispatch_token_mismatch';
  elsif v_status = 'indeterminate' then
    changed := true; reason := 'idempotent';
  elsif v_status <> 'dispatched' then
    changed := false; reason := 'invalid_reservation_state';
  else
    update public.supermega_spend_reservations as r
       set status='indeterminate', updated_at=now()
     where r.reservation_id=p_reservation_id;
    changed := true; reason := 'indeterminate'; v_status := 'indeterminate';
  end if;
  reservation_id := p_reservation_id; status := v_status; return next;
end;
$$;

create or replace function public.supermega_settle_token_spend(
  p_reservation_id text,
  p_dispatch_token text,
  p_in_tokens bigint,
  p_out_tokens bigint,
  p_calls bigint
)
returns table (
  settled boolean,
  reason text,
  reservation_id text,
  status text,
  in_tokens bigint,
  out_tokens bigint,
  calls bigint,
  reserved_tokens bigint,
  committed_tokens bigint,
  spend_total bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant text;
  v_window text;
  v_status text;
  v_reserved_for_call bigint;
  v_actual_in bigint;
  v_actual_out bigint;
  v_actual_calls bigint;
  v_dispatch_token text;
  v_in bigint;
  v_out bigint;
  v_calls bigint;
  v_reserved bigint;
begin
  if p_reservation_id is null or p_reservation_id = '' or p_dispatch_token is null or p_dispatch_token = '' or p_in_tokens < 0 or p_out_tokens < 0 or p_calls < 0 then
    raise exception 'invalid_spend_settlement';
  end if;

  select r.tenant_id, r."window"
    into v_tenant, v_window
    from public.supermega_spend_reservations as r
   where r.reservation_id = p_reservation_id;
  if not found then
    settled := false;
    reason := 'reservation_not_found';
    reservation_id := p_reservation_id;
    return next;
    return;
  end if;

  select ledger.in_tokens, ledger.out_tokens, ledger.calls
    into v_in, v_out, v_calls
    from public.supermega_token_ledger as ledger
   where ledger.tenant_id = v_tenant and ledger."window" = v_window
   for update;

  select r.status, r.reserved_tokens, r.actual_in_tokens, r.actual_out_tokens, r.actual_calls, r.dispatch_token
    into v_status, v_reserved_for_call, v_actual_in, v_actual_out, v_actual_calls, v_dispatch_token
    from public.supermega_spend_reservations as r
   where r.reservation_id = p_reservation_id
   for update;

  if v_dispatch_token is distinct from p_dispatch_token then
    settled := false;
    reason := 'dispatch_token_mismatch';
  elsif v_status = 'released' then
    settled := false;
    reason := 'reservation_released';
  elsif v_status = 'settled' then
    settled := v_actual_in = p_in_tokens and v_actual_out = p_out_tokens and v_actual_calls = p_calls;
    reason := case when settled then 'idempotent' else 'settlement_conflict' end;
  elsif v_status = 'reserved' then
    settled := false;
    reason := 'reservation_not_dispatched';
  elsif p_in_tokens + p_out_tokens > v_reserved_for_call then
    settled := false;
    reason := 'actual_exceeds_reservation';
  elsif v_status not in ('dispatched','indeterminate') then
    settled := false;
    reason := 'invalid_reservation_state';
  else
    update public.supermega_token_ledger as ledger set
      in_tokens = ledger.in_tokens + p_in_tokens,
      out_tokens = ledger.out_tokens + p_out_tokens,
      calls = ledger.calls + p_calls,
      updated_at = now()
    where ledger.tenant_id = v_tenant and ledger."window" = v_window
    returning ledger.in_tokens, ledger.out_tokens, ledger.calls into v_in, v_out, v_calls;

    update public.supermega_spend_reservations as r set
      status = 'settled',
      actual_in_tokens = p_in_tokens,
      actual_out_tokens = p_out_tokens,
      actual_calls = p_calls,
      updated_at = now()
    where r.reservation_id = p_reservation_id;
    settled := true;
    reason := 'settled';
    v_status := 'settled';
  end if;

  select coalesce(sum(r.reserved_tokens), 0)
    into v_reserved
    from public.supermega_spend_reservations as r
   where r.tenant_id = v_tenant and r."window" = v_window and r.status in ('reserved','dispatched','indeterminate');
  reservation_id := p_reservation_id;
  status := v_status;
  in_tokens := v_in;
  out_tokens := v_out;
  calls := v_calls;
  reserved_tokens := v_reserved;
  committed_tokens := v_in + v_out;
  spend_total := v_in + v_out + v_reserved;
  return next;
end;
$$;

create or replace function public.supermega_release_token_spend(p_reservation_id text, p_dispatch_token text, p_definitive boolean)
returns table (
  released boolean,
  reason text,
  reservation_id text,
  status text,
  in_tokens bigint,
  out_tokens bigint,
  calls bigint,
  reserved_tokens bigint,
  committed_tokens bigint,
  spend_total bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant text;
  v_window text;
  v_status text;
  v_in bigint;
  v_out bigint;
  v_calls bigint;
  v_reserved bigint;
  v_dispatch_token text;
begin
  if p_reservation_id is null or p_reservation_id = '' or p_dispatch_token is null or p_dispatch_token = '' or p_definitive is null then
    raise exception 'invalid_spend_release';
  end if;
  select r.tenant_id, r."window"
    into v_tenant, v_window
    from public.supermega_spend_reservations as r
   where r.reservation_id = p_reservation_id;
  if not found then
    released := false;
    reason := 'reservation_not_found';
    reservation_id := p_reservation_id;
    return next;
    return;
  end if;

  select ledger.in_tokens, ledger.out_tokens, ledger.calls
    into v_in, v_out, v_calls
    from public.supermega_token_ledger as ledger
   where ledger.tenant_id = v_tenant and ledger."window" = v_window
   for update;
  select r.status, r.dispatch_token into v_status, v_dispatch_token
    from public.supermega_spend_reservations as r
   where r.reservation_id = p_reservation_id
   for update;

  if v_dispatch_token is distinct from p_dispatch_token then
    released := false;
    reason := 'dispatch_token_mismatch';
  elsif v_status = 'settled' then
    released := false;
    reason := 'reservation_settled';
  elsif v_status = 'released' then
    released := true;
    reason := 'idempotent';
  elsif v_status = 'indeterminate' then
    released := false;
    reason := 'reservation_indeterminate';
  elsif v_status = 'dispatched' and not p_definitive then
    released := false;
    reason := 'dispatch_not_definitive';
  elsif v_status not in ('reserved','dispatched') then
    released := false;
    reason := 'invalid_reservation_state';
  else
    update public.supermega_spend_reservations as r
       set status = 'released', updated_at = now()
     where r.reservation_id = p_reservation_id;
    released := true;
    reason := 'released';
    v_status := 'released';
  end if;

  select coalesce(sum(r.reserved_tokens), 0)
    into v_reserved
    from public.supermega_spend_reservations as r
   where r.tenant_id = v_tenant and r."window" = v_window and r.status in ('reserved','dispatched','indeterminate');
  reservation_id := p_reservation_id;
  status := v_status;
  in_tokens := v_in;
  out_tokens := v_out;
  calls := v_calls;
  reserved_tokens := v_reserved;
  committed_tokens := v_in + v_out;
  spend_total := v_in + v_out + v_reserved;
  return next;
end;
$$;

create or replace function public.supermega_reconcile_token_spend(
  p_reservation_id text,
  p_action text,
  p_in_tokens bigint,
  p_out_tokens bigint,
  p_calls bigint,
  p_actor text,
  p_evidence_hash text
)
returns table (
  reconciled boolean,
  reason text,
  reservation_id text,
  status text,
  in_tokens bigint,
  out_tokens bigint,
  calls bigint,
  reserved_tokens bigint,
  committed_tokens bigint,
  spend_total bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant text;
  v_window text;
  v_status text;
  v_reserved_for_call bigint;
  v_actual_in bigint;
  v_actual_out bigint;
  v_actual_calls bigint;
  v_reconciled_by text;
  v_evidence_hash text;
  v_in bigint;
  v_out bigint;
  v_calls bigint;
  v_reserved bigint;
  v_terminal text;
begin
  if p_reservation_id is null or p_reservation_id = ''
     or p_action is null or p_action not in ('settle','release')
     or p_in_tokens is null or p_out_tokens is null or p_calls is null
     or p_in_tokens < 0 or p_out_tokens < 0 or p_calls < 0
     or p_actor is null or char_length(p_actor) not between 1 and 80
     or p_evidence_hash is null or p_evidence_hash !~ '^[a-f0-9]{64}$'
     or (p_action='release' and (p_in_tokens <> 0 or p_out_tokens <> 0 or p_calls <> 0)) then
    raise exception 'invalid_spend_reconciliation';
  end if;
  select r.tenant_id, r."window"
    into v_tenant, v_window
    from public.supermega_spend_reservations as r
   where r.reservation_id=p_reservation_id;
  if not found then
    reconciled := false; reason := 'reservation_not_found'; reservation_id := p_reservation_id; return next; return;
  end if;
  select ledger.in_tokens, ledger.out_tokens, ledger.calls
    into v_in, v_out, v_calls
    from public.supermega_token_ledger as ledger
   where ledger.tenant_id=v_tenant and ledger."window"=v_window
   for update;
  select r.status, r.reserved_tokens, r.actual_in_tokens, r.actual_out_tokens, r.actual_calls, r.reconciled_by, r.reconciliation_evidence_hash
    into v_status, v_reserved_for_call, v_actual_in, v_actual_out, v_actual_calls, v_reconciled_by, v_evidence_hash
    from public.supermega_spend_reservations as r
   where r.reservation_id=p_reservation_id
   for update;
  v_terminal := case when p_action='settle' then 'settled' else 'released' end;
  if v_status=v_terminal
     and v_reconciled_by=p_actor
     and v_evidence_hash=p_evidence_hash
     and (p_action='release' or (v_actual_in=p_in_tokens and v_actual_out=p_out_tokens and v_actual_calls=p_calls)) then
    reconciled := true;
    reason := 'idempotent';
  elsif v_status in ('settled','released') then
    reconciled := false;
    reason := 'reconciliation_conflict';
  elsif v_status not in ('dispatched','indeterminate') then
    reconciled := false;
    reason := 'invalid_reservation_state';
  elsif p_action='settle' and p_in_tokens+p_out_tokens > v_reserved_for_call then
    reconciled := false;
    reason := 'actual_exceeds_reservation';
  else
    if p_action='settle' then
      update public.supermega_token_ledger as ledger set
        in_tokens=ledger.in_tokens+p_in_tokens,
        out_tokens=ledger.out_tokens+p_out_tokens,
        calls=ledger.calls+p_calls,
        updated_at=now()
      where ledger.tenant_id=v_tenant and ledger."window"=v_window
      returning ledger.in_tokens, ledger.out_tokens, ledger.calls into v_in, v_out, v_calls;
    end if;
    update public.supermega_spend_reservations as r set
      status=v_terminal,
      actual_in_tokens=p_in_tokens,
      actual_out_tokens=p_out_tokens,
      actual_calls=p_calls,
      reconciled_by=p_actor,
      reconciliation_evidence_hash=p_evidence_hash,
      reconciled_at=now(),
      updated_at=now()
    where r.reservation_id=p_reservation_id;
    v_status := v_terminal;
    reconciled := true;
    reason := 'reconciled';
  end if;
  select coalesce(sum(r.reserved_tokens),0)
    into v_reserved
    from public.supermega_spend_reservations as r
   where r.tenant_id=v_tenant and r."window"=v_window and r.status in ('reserved','dispatched','indeterminate');
  reservation_id := p_reservation_id;
  status := v_status;
  in_tokens := v_in;
  out_tokens := v_out;
  calls := v_calls;
  reserved_tokens := v_reserved;
  committed_tokens := v_in+v_out;
  spend_total := v_in+v_out+v_reserved;
  return next;
end;
$$;
revoke execute on function public.supermega_get_token_usage(text, text) from public, anon, authenticated;
revoke execute on function public.supermega_reserve_token_spend(text, text, text, bigint, bigint, timestamptz, text, jsonb) from public, anon, authenticated;
revoke execute on function public.supermega_mark_token_spend_dispatched(text, text) from public, anon, authenticated;
revoke execute on function public.supermega_mark_token_spend_indeterminate(text, text) from public, anon, authenticated;
revoke execute on function public.supermega_settle_token_spend(text, text, bigint, bigint, bigint) from public, anon, authenticated;
revoke execute on function public.supermega_release_token_spend(text, text, boolean) from public, anon, authenticated;
revoke execute on function public.supermega_reconcile_token_spend(text, text, bigint, bigint, bigint, text, text) from public, anon, authenticated;
grant execute on function public.supermega_get_token_usage(text, text) to service_role;
grant execute on function public.supermega_reserve_token_spend(text, text, text, bigint, bigint, timestamptz, text, jsonb) to service_role;
grant execute on function public.supermega_mark_token_spend_dispatched(text, text) to service_role;
grant execute on function public.supermega_mark_token_spend_indeterminate(text, text) to service_role;
grant execute on function public.supermega_settle_token_spend(text, text, bigint, bigint, bigint) to service_role;
grant execute on function public.supermega_release_token_spend(text, text, boolean) to service_role;
grant execute on function public.supermega_reconcile_token_spend(text, text, bigint, bigint, bigint, text, text) to service_role;

notify pgrst, 'reload schema';

commit;
