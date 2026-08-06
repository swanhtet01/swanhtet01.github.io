-- AI-009: move Agent Company authority out of the ephemeral model-response cache.
-- This migration intentionally does not copy rows from supermega_ai_cache. Legacy cache rows are
-- inert; an operator must recreate or explicitly reconcile authority through the control APIs.

begin;

create table if not exists public.supermega_control_records (
  record_key text primary key,
  record_type text not null,
  tenant_id text not null,
  status text not null,
  plan_hash text not null,
  payload jsonb not null,
  payload_hash text not null,
  record_version bigint not null default 1 check (record_version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supermega_control_records_key_check check (char_length(record_key) between 1 and 240),
  constraint supermega_control_records_type_check check (record_type in ('sign_in_code','operator_session','mission','work_order','work_order_review','work_order_evaluation','ceo_outcome_operation','ceo_outcome_evaluation','ceo_outcome_delivery','ceo_outcome_action')),
  constraint supermega_control_records_tenant_check check (char_length(tenant_id) between 1 and 80),
  constraint supermega_control_records_status_check check (status ~ '^[a-z][a-z_]{0,39}$'),
  constraint supermega_control_records_plan_hash_check check (plan_hash ~ '^[a-f0-9]{64}$'),
  constraint supermega_control_records_payload_hash_check check (payload_hash ~ '^[a-f0-9]{64}$')
);

-- Databases migrated before the CEO outcome record types existed carry the narrower constraint;
-- widen it idempotently so re-running this migration upgrades them in place.
do $widen$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid='public.supermega_control_records'::regclass
       and conname='supermega_control_records_type_check'
       and pg_get_constraintdef(oid) not like '%ceo_outcome_operation%'
  ) then
    alter table public.supermega_control_records drop constraint supermega_control_records_type_check;
    alter table public.supermega_control_records add constraint supermega_control_records_type_check
      check (record_type in ('sign_in_code','operator_session','mission','work_order','work_order_review','work_order_evaluation','ceo_outcome_operation','ceo_outcome_evaluation','ceo_outcome_delivery','ceo_outcome_action'));
  end if;
end;
$widen$;

create index if not exists supermega_control_records_tenant_type_status_idx
  on public.supermega_control_records (tenant_id, record_type, status, updated_at desc);

create table if not exists public.supermega_control_transitions (
  transition_id bigint generated always as identity primary key,
  record_key text not null references public.supermega_control_records(record_key) on delete restrict,
  record_type text not null,
  tenant_id text not null,
  event_type text not null check (event_type in ('created','replaced','transitioned')),
  from_status text,
  to_status text not null,
  from_record_version bigint,
  to_record_version bigint not null,
  prior_payload_hash text,
  next_payload_hash text not null,
  created_at timestamptz not null default now(),
  constraint supermega_control_transition_version_check check (
    to_record_version >= 1
    and (from_record_version is null or from_record_version + 1 = to_record_version)
  ),
  constraint supermega_control_transition_prior_hash_check check (
    prior_payload_hash is null or prior_payload_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint supermega_control_transition_next_hash_check check (next_payload_hash ~ '^[a-f0-9]{64}$')
);

create unique index if not exists supermega_control_transitions_record_version_uidx
  on public.supermega_control_transitions (record_key, to_record_version);

create or replace function public.supermega_reject_control_transition_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $immutable$
begin
  raise exception 'control_transition_history_is_immutable';
end;
$immutable$;

drop trigger if exists supermega_control_transitions_immutable on public.supermega_control_transitions;
create trigger supermega_control_transitions_immutable
before update or delete on public.supermega_control_transitions
for each row execute function public.supermega_reject_control_transition_mutation();

create or replace function public.supermega_put_control_record(
  p_record_key text,
  p_record_type text,
  p_tenant_id text,
  p_status text,
  p_plan_hash text,
  p_payload jsonb,
  p_payload_hash text
)
returns table (updated boolean, version bigint)
language plpgsql
security definer
set search_path = ''
as $control$
declare
  existing public.supermega_control_records%rowtype;
  next_version bigint;
begin
  select * into existing
    from public.supermega_control_records
   where record_key = p_record_key
   for update;

  if not found then
    insert into public.supermega_control_records (
      record_key, record_type, tenant_id, status, plan_hash, payload, payload_hash, record_version
    ) values (
      p_record_key, p_record_type, p_tenant_id, p_status, p_plan_hash, p_payload, p_payload_hash, 1
    );
    insert into public.supermega_control_transitions (
      record_key, record_type, tenant_id, event_type, to_status, to_record_version, next_payload_hash
    ) values (
      p_record_key, p_record_type, p_tenant_id, 'created', p_status, 1, p_payload_hash
    );
    return query select true, 1::bigint;
    return;
  end if;

  if existing.record_type <> p_record_type or existing.tenant_id <> p_tenant_id then
    raise exception 'control_record_identity_conflict';
  end if;

  next_version := existing.record_version + 1;
  update public.supermega_control_records
     set status = p_status,
         plan_hash = p_plan_hash,
         payload = p_payload,
         payload_hash = p_payload_hash,
         record_version = next_version,
         updated_at = now()
   where record_key = p_record_key;
  insert into public.supermega_control_transitions (
    record_key, record_type, tenant_id, event_type, from_status, to_status,
    from_record_version, to_record_version, prior_payload_hash, next_payload_hash
  ) values (
    p_record_key, p_record_type, p_tenant_id, 'replaced', existing.status, p_status,
    existing.record_version, next_version, existing.payload_hash, p_payload_hash
  );
  return query select true, next_version;
end;
$control$;

create or replace function public.supermega_transition_control_record(
  p_record_key text,
  p_expected_status text,
  p_expected_plan_hash text,
  p_has_revision boolean,
  p_expected_revision bigint,
  p_record_type text,
  p_tenant_id text,
  p_status text,
  p_plan_hash text,
  p_payload jsonb,
  p_payload_hash text
)
returns table (updated boolean, version bigint)
language plpgsql
security definer
set search_path = ''
as $control$
declare
  existing public.supermega_control_records%rowtype;
  next_version bigint;
begin
  select * into existing
    from public.supermega_control_records
   where record_key = p_record_key
     and status = p_expected_status
     and plan_hash = p_expected_plan_hash
     and (not p_has_revision or payload->>'revision' = p_expected_revision::text)
   for update;

  if not found then
    return query select false, null::bigint;
    return;
  end if;
  if existing.record_type <> p_record_type or existing.tenant_id <> p_tenant_id then
    raise exception 'control_record_identity_conflict';
  end if;

  next_version := existing.record_version + 1;
  update public.supermega_control_records
     set status = p_status,
         plan_hash = p_plan_hash,
         payload = p_payload,
         payload_hash = p_payload_hash,
         record_version = next_version,
         updated_at = now()
   where record_key = p_record_key;
  insert into public.supermega_control_transitions (
    record_key, record_type, tenant_id, event_type, from_status, to_status,
    from_record_version, to_record_version, prior_payload_hash, next_payload_hash
  ) values (
    p_record_key, p_record_type, p_tenant_id, 'transitioned', existing.status, p_status,
    existing.record_version, next_version, existing.payload_hash, p_payload_hash
  );
  return query select true, next_version;
end;
$control$;

alter table public.supermega_control_records enable row level security;
alter table public.supermega_control_transitions enable row level security;

revoke all on public.supermega_control_records from public, anon, authenticated, service_role;
revoke all on public.supermega_control_transitions from public, anon, authenticated, service_role;
grant select on public.supermega_control_records to service_role;

revoke all on function public.supermega_put_control_record(text,text,text,text,text,jsonb,text) from public, anon, authenticated;
revoke all on function public.supermega_transition_control_record(text,text,text,boolean,bigint,text,text,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.supermega_put_control_record(text,text,text,text,text,jsonb,text) to service_role;
grant execute on function public.supermega_transition_control_record(text,text,text,boolean,bigint,text,text,text,text,jsonb,text) to service_role;

comment on table public.supermega_control_records is
  'Versioned Agent Company authority. Never hydrate from supermega_ai_cache.';
comment on table public.supermega_control_transitions is
  'Append-only evidence for every control-record create, replacement, and compare-and-swap transition.';

commit;
