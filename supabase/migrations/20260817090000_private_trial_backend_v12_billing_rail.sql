begin;

-- Billing rail v1 (hq/strategy/BILLING-RAIL-DESIGN.md sections 3, 4.4, 6;
-- Gate 9 successor). Three tenant-side tables record founder billing actions:
--
--   billing_invoices      one row per founder-issued invoice packet, sealed by
--                         its sha256 digest, revision version-guarded, status
--                         issued -> paid | void (draft never reaches the server;
--                         drafts live in the founder's local CLI packets).
--   billing_events        the evidence spine: one append-only event per
--                         transition, immutable and server-timestamped exactly
--                         like app_private.workspace_events.
--   billing_entitlements  one projection row per workspace. Legal transitions
--                         none -> granted -> revoked -> granted, each a guarded
--                         revision increment; premiumUnlocked derives from
--                         status = 'granted' and nowhere else.
--
-- RLS posture (design 4.4): deny by default, NO policies. No policy or table
-- privilege grants the runtime member role (supermega_trial_backend) anything:
-- operators must never see or write invoices. Writes happen only through the
-- founder-run privileged provisioner connection
-- (supermega_runtime/billing_rail.py), the managed_activation.py pattern.
-- Nothing in this migration sends an invoice, requests money, confirms a
-- payment, or grants access by itself.
--
-- DEVIATION: design 4.3 has the tenant runtime deriving premiumUnlocked from
-- billing_entitlements.status live. This slice's rails require ZERO policies
-- and ZERO grants for the runtime member role on every billing table, so the
-- runtime's premiumUnlocked probe (PostgresTrialStore._premium_unlocked)
-- observes the missing SELECT privilege and fail-closes to false. The
-- derivation code ships and is tested; lighting it up is one later migration
-- adding a workspace-GUC-scoped SELECT policy on billing_entitlements ONLY --
-- a separate founder decision, exactly how v6 shipped the self-serve INSERT
-- path dark and v11 lit it up.

do $guard$
begin
  if not exists (
    select 1
    from app_private.trial_schema_meta
    where component = 'private_trial_backend'
      and schema_version = 11
  ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v12 requires schema version 11';
  end if;
end
$guard$;

create table app_private.billing_invoices (
  workspace_id text not null,
  invoice_id text not null check (invoice_id ~ '^INV-[A-Za-z0-9-]{4,40}$'),
  status text not null check (status in ('issued', 'paid', 'void')),
  invoice_digest text not null check (invoice_digest ~ '^[0-9a-f]{64}$'),
  payload_json jsonb not null check (jsonb_typeof(payload_json) = 'object'),
  revision bigint not null check (revision >= 1),
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  primary key (workspace_id, invoice_id),
  check (workspace_id = btrim(workspace_id) and workspace_id <> '')
);

create function app_private.guard_billing_invoice()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app_private
as $function$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'issued' then
      raise exception using errcode = '55000', message = 'billing invoices are recorded at issued status';
    end if;
    if new.revision <> 1 then
      raise exception using errcode = '55000', message = 'initial billing invoice revision must be one';
    end if;
    new.created_at := transaction_timestamp();
    new.updated_at := transaction_timestamp();
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'billing invoices cannot be deleted';
  end if;
  if new.workspace_id is distinct from old.workspace_id
     or new.invoice_id is distinct from old.invoice_id
     or new.invoice_digest is distinct from old.invoice_digest
     or new.payload_json is distinct from old.payload_json
     or new.created_at is distinct from old.created_at then
    raise exception using errcode = '55000', message = 'billing invoice identity is immutable';
  end if;
  if old.status <> 'issued' or new.status not in ('paid', 'void') then
    raise exception using errcode = '55000', message = 'billing invoice status can only transition from issued to paid or void';
  end if;
  if new.revision <> old.revision + 1 then
    raise exception using errcode = '40001', message = 'billing invoice revision must increment by one';
  end if;
  new.updated_at := transaction_timestamp();
  return new;
end
$function$;

create trigger billing_invoice_guard
before insert or update or delete on app_private.billing_invoices
for each row execute function app_private.guard_billing_invoice();

create table app_private.billing_events (
  event_id uuid primary key,
  workspace_id text not null,
  command_id uuid not null,
  command_fingerprint text not null check (command_fingerprint ~ '^[0-9a-f]{64}$'),
  event_type text not null check (event_type in (
    'billing.invoice.issued',
    'billing.payment.confirmed',
    'billing.invoice.voided',
    'billing.entitlement.granted',
    'billing.entitlement.revoked',
    'billing.refund.recorded'
  )),
  actor_id text not null,
  actor_kind text not null check (actor_kind = 'human'),
  payload_json jsonb not null check (jsonb_typeof(payload_json) = 'object'),
  result_json jsonb not null check (jsonb_typeof(result_json) = 'object'),
  created_at timestamptz not null default transaction_timestamp(),
  unique (workspace_id, command_id),
  check (workspace_id = btrim(workspace_id) and workspace_id <> ''),
  check (actor_id = btrim(actor_id) and actor_id <> '')
);

create index billing_events_timeline_idx
  on app_private.billing_events (workspace_id, created_at desc);

create function app_private.reject_billing_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app_private
as $function$
begin
  raise exception using
    errcode = '55000',
    message = 'billing events are immutable';
end
$function$;

create trigger billing_events_immutable
before update or delete on app_private.billing_events
for each row execute function app_private.reject_billing_event_mutation();

create function app_private.stamp_billing_event_insert()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app_private
as $function$
begin
  new.created_at := transaction_timestamp();
  return new;
end
$function$;

create trigger billing_events_server_timestamp
before insert on app_private.billing_events
for each row execute function app_private.stamp_billing_event_insert();

create table app_private.billing_entitlements (
  workspace_id text primary key,
  tier text not null check (tier = 'premium'),
  status text not null check (status in ('none', 'granted', 'revoked')),
  granted_event_id uuid,
  invoice_digest text check (invoice_digest ~ '^[0-9a-f]{64}$'),
  revision bigint not null check (revision >= 1),
  updated_at timestamptz not null default transaction_timestamp(),
  check (workspace_id = btrim(workspace_id) and workspace_id <> ''),
  check (
    (status = 'granted' and granted_event_id is not null and invoice_digest is not null)
    or (status in ('none', 'revoked') and granted_event_id is null and invoice_digest is null)
  )
);

create function app_private.guard_billing_entitlement()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app_private
as $function$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'none' or new.revision <> 1 then
      raise exception using errcode = '55000', message = 'billing entitlement rows start at none with revision one';
    end if;
    new.updated_at := transaction_timestamp();
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'billing entitlements cannot be deleted';
  end if;
  if new.workspace_id is distinct from old.workspace_id
     or new.tier is distinct from old.tier then
    raise exception using errcode = '55000', message = 'billing entitlement identity is immutable';
  end if;
  if not (
    (old.status = 'none' and new.status = 'granted')
    or (old.status = 'granted' and new.status = 'revoked')
    or (old.status = 'revoked' and new.status = 'granted')
  ) then
    raise exception using errcode = '55000', message = 'billing entitlement transitions are none to granted, granted to revoked, or revoked to granted';
  end if;
  if new.revision <> old.revision + 1 then
    raise exception using errcode = '40001', message = 'billing entitlement revision must increment by one';
  end if;
  new.updated_at := transaction_timestamp();
  return new;
end
$function$;

create trigger billing_entitlement_guard
before insert or update or delete on app_private.billing_entitlements
for each row execute function app_private.guard_billing_entitlement();

alter table app_private.billing_invoices enable row level security;
alter table app_private.billing_invoices force row level security;
alter table app_private.billing_events enable row level security;
alter table app_private.billing_events force row level security;
alter table app_private.billing_entitlements enable row level security;
alter table app_private.billing_entitlements force row level security;

-- Deny by default, and deliberately no policies: the runtime member role gets
-- nothing (no select, no policy, no capability path). The foundation's default
-- privileges already keep the API roles out; the explicit revokes below keep
-- that boundary visible in this file, the v6 idiom.
revoke all on app_private.billing_invoices
  from public, anon, authenticated, service_role;
revoke all on app_private.billing_events
  from public, anon, authenticated, service_role;
revoke all on app_private.billing_entitlements
  from public, anon, authenticated, service_role;
revoke all on function app_private.guard_billing_invoice()
  from public, anon, authenticated, service_role;
revoke all on function app_private.reject_billing_event_mutation()
  from public, anon, authenticated, service_role;
revoke all on function app_private.stamp_billing_event_insert()
  from public, anon, authenticated, service_role;
revoke all on function app_private.guard_billing_entitlement()
  from public, anon, authenticated, service_role;

update app_private.trial_schema_meta
set schema_version = 12,
    applied_at = transaction_timestamp()
where component = 'private_trial_backend'
  and schema_version = 11;

do $verify$
begin
  if not exists (
    select 1
    from app_private.trial_schema_meta
    where component = 'private_trial_backend'
      and schema_version = 12
  ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v12 did not reach schema version 12';
  end if;

  if (
    select count(*)
    from pg_class relation
    join pg_namespace schema_record on schema_record.oid = relation.relnamespace
    where schema_record.nspname = 'app_private'
      and relation.relname in ('billing_invoices', 'billing_events', 'billing_entitlements')
      and relation.relrowsecurity
      and relation.relforcerowsecurity
  ) <> 3 then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v12 billing tables must force row level security';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'app_private'
      and tablename in ('billing_invoices', 'billing_events', 'billing_entitlements')
  ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v12 billing tables must carry no policies';
  end if;

  if exists (
    select 1
    from unnest(array['billing_invoices', 'billing_events', 'billing_entitlements']) table_name,
         unnest(array['supermega_trial_backend', 'anon', 'authenticated', 'service_role']) role_name,
         unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) privilege_name
    where has_table_privilege(role_name, format('app_private.%I', table_name), privilege_name)
  ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v12 billing tables must grant the runtime and API roles nothing';
  end if;

  if (
    select count(*)
    from pg_trigger trigger_record
    join pg_class relation on relation.oid = trigger_record.tgrelid
    join pg_namespace schema_record on schema_record.oid = relation.relnamespace
    where schema_record.nspname = 'app_private'
      and not trigger_record.tgisinternal
      and (
        (relation.relname = 'billing_invoices'
          and trigger_record.tgname = 'billing_invoice_guard')
        or (relation.relname = 'billing_events'
          and trigger_record.tgname = 'billing_events_immutable')
        or (relation.relname = 'billing_events'
          and trigger_record.tgname = 'billing_events_server_timestamp')
        or (relation.relname = 'billing_entitlements'
          and trigger_record.tgname = 'billing_entitlement_guard')
      )
  ) <> 4 then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v12 billing hardening triggers are missing';
  end if;
end
$verify$;

commit;
