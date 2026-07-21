begin;

-- Private, server-mediated trial persistence. This schema is intentionally not
-- exposed through the Supabase Data API. Database integration remains
-- unverified until this migration is applied to a non-production branch and
-- exercised with the dedicated, non-BYPASSRLS runtime role.
create schema if not exists app_private;
comment on schema app_private is
  'Server-only SuperMega trial state. Never expose through PostgREST or GraphQL.';

revoke all on schema app_private from public, anon, authenticated, service_role;
alter default privileges in schema app_private
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges in schema app_private
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges in schema app_private
  revoke all on functions from public, anon, authenticated, service_role;

do $role$
begin
  if not exists (select 1 from pg_roles where rolname = 'supermega_trial_backend') then
    create role supermega_trial_backend
      nologin
      inherit
      nosuperuser
      nocreatedb
      nocreaterole
      noreplication
      nobypassrls;
  end if;
end
$role$;

create table app_private.trial_schema_meta (
  component text primary key,
  schema_version integer not null check (schema_version > 0),
  applied_at timestamptz not null default now()
);

create table app_private.workspace_memberships (
  workspace_id text not null,
  actor_id text not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'revoked')),
  capabilities text[] not null default array[]::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, actor_id),
  check (workspace_id = btrim(workspace_id) and workspace_id <> ''),
  check (actor_id = btrim(actor_id) and actor_id <> '')
);

create table app_private.workspace_state (
  workspace_id text not null,
  surface text not null check (surface in ('command', 'shop', 'plant', 'setup')),
  version bigint not null check (version >= 1),
  state_json jsonb not null check (jsonb_typeof(state_json) = 'object'),
  updated_by text not null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, surface),
  check (workspace_id = btrim(workspace_id) and workspace_id <> ''),
  check (updated_by = btrim(updated_by) and updated_by <> '')
);

create table app_private.workspace_events (
  event_id uuid primary key,
  workspace_id text not null,
  command_id uuid not null,
  command_fingerprint text not null,
  surface text not null check (surface in ('command', 'shop', 'plant', 'setup', 'approvals')),
  event_type text not null,
  actor_id text not null,
  expected_version bigint,
  resulting_version bigint,
  payload_json jsonb not null check (jsonb_typeof(payload_json) = 'object'),
  result_json jsonb not null check (jsonb_typeof(result_json) = 'object'),
  created_at timestamptz not null default now(),
  unique (workspace_id, command_id),
  check (workspace_id = btrim(workspace_id) and workspace_id <> ''),
  check (actor_id = btrim(actor_id) and actor_id <> ''),
  check (event_type = btrim(event_type) and event_type <> ''),
  check (command_fingerprint ~ '^[0-9a-f]{64}$')
);

create index workspace_events_timeline_idx
  on app_private.workspace_events (workspace_id, created_at desc);

create table app_private.approval_requests (
  approval_id uuid primary key,
  workspace_id text not null,
  command_id uuid not null,
  command_fingerprint text not null,
  title text not null check (char_length(title) between 1 and 160),
  proposal_json jsonb not null check (jsonb_typeof(proposal_json) = 'object'),
  evidence_refs_json jsonb not null check (jsonb_typeof(evidence_refs_json) = 'array'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  requested_by text not null,
  requested_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz,
  decision_note text not null default '',
  version bigint not null default 0 check (version in (0, 1)),
  unique (workspace_id, command_id),
  check (workspace_id = btrim(workspace_id) and workspace_id <> ''),
  check (requested_by = btrim(requested_by) and requested_by <> ''),
  check (command_fingerprint ~ '^[0-9a-f]{64}$'),
  check (
    (status = 'pending' and version = 0 and decided_by is null and decided_at is null)
    or
    (status in ('approved', 'declined') and version = 1 and decided_by is not null and decided_at is not null)
  )
);

create index approval_requests_queue_idx
  on app_private.approval_requests (workspace_id, status, requested_at desc);

create function app_private.reject_workspace_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app_private
as $function$
begin
  raise exception using
    errcode = '55000',
    message = 'workspace events are immutable';
end
$function$;

create trigger workspace_events_immutable
before update or delete on app_private.workspace_events
for each row execute function app_private.reject_workspace_event_mutation();

create function app_private.guard_workspace_state_update()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app_private
as $function$
begin
  if new.workspace_id is distinct from old.workspace_id
     or new.surface is distinct from old.surface then
    raise exception using errcode = '55000', message = 'workspace state identity is immutable';
  end if;
  if new.version <> old.version + 1 then
    raise exception using errcode = '40001', message = 'workspace state version must increment by one';
  end if;
  return new;
end
$function$;

create trigger workspace_state_version_guard
before update on app_private.workspace_state
for each row execute function app_private.guard_workspace_state_update();

create function app_private.guard_approval_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app_private
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'approval records cannot be deleted';
  end if;
  if new.approval_id is distinct from old.approval_id
     or new.workspace_id is distinct from old.workspace_id
     or new.command_id is distinct from old.command_id
     or new.command_fingerprint is distinct from old.command_fingerprint
     or new.title is distinct from old.title
     or new.proposal_json is distinct from old.proposal_json
     or new.evidence_refs_json is distinct from old.evidence_refs_json
     or new.requested_by is distinct from old.requested_by
     or new.requested_at is distinct from old.requested_at then
    raise exception using errcode = '55000', message = 'approval proposal and evidence are immutable';
  end if;
  if old.status <> 'pending' or new.status not in ('approved', 'declined') then
    raise exception using errcode = '55000', message = 'approval transition must be pending to approved or declined';
  end if;
  if new.version <> old.version + 1
     or new.decided_by is null
     or new.decided_at is null then
    raise exception using errcode = '55000', message = 'approval decision metadata is incomplete';
  end if;
  return new;
end
$function$;

create trigger approval_requests_controlled_mutation
before update or delete on app_private.approval_requests
for each row execute function app_private.guard_approval_mutation();

alter table app_private.workspace_memberships enable row level security;
alter table app_private.workspace_memberships force row level security;
alter table app_private.workspace_state enable row level security;
alter table app_private.workspace_state force row level security;
alter table app_private.workspace_events enable row level security;
alter table app_private.workspace_events force row level security;
alter table app_private.approval_requests enable row level security;
alter table app_private.approval_requests force row level security;

create policy workspace_memberships_self_read
on app_private.workspace_memberships
for select
to supermega_trial_backend
using (
  workspace_id = current_setting('app.workspace_id', true)
  and actor_id = current_setting('app.actor_id', true)
  and status = 'active'
);

create policy workspace_state_member_read
on app_private.workspace_state
for select
to supermega_trial_backend
using (
  workspace_id = current_setting('app.workspace_id', true)
  and exists (
    select 1
    from app_private.workspace_memberships membership
    where membership.workspace_id = workspace_state.workspace_id
      and membership.actor_id = current_setting('app.actor_id', true)
      and membership.status = 'active'
  )
);

create policy workspace_state_capability_insert
on app_private.workspace_state
for insert
to supermega_trial_backend
with check (
  workspace_id = current_setting('app.workspace_id', true)
  and updated_by = current_setting('app.actor_id', true)
  and exists (
    select 1
    from app_private.workspace_memberships membership
    where membership.workspace_id = workspace_state.workspace_id
      and membership.actor_id = current_setting('app.actor_id', true)
      and membership.status = 'active'
      and case workspace_state.surface
        when 'command' then 'command.write'
        when 'shop' then 'shop.write'
        when 'plant' then 'plant.write'
        when 'setup' then 'setup.write'
      end = any(membership.capabilities)
  )
);

create policy workspace_state_capability_update
on app_private.workspace_state
for update
to supermega_trial_backend
using (
  workspace_id = current_setting('app.workspace_id', true)
  and exists (
    select 1
    from app_private.workspace_memberships membership
    where membership.workspace_id = workspace_state.workspace_id
      and membership.actor_id = current_setting('app.actor_id', true)
      and membership.status = 'active'
      and case workspace_state.surface
        when 'command' then 'command.write'
        when 'shop' then 'shop.write'
        when 'plant' then 'plant.write'
        when 'setup' then 'setup.write'
      end = any(membership.capabilities)
  )
)
with check (
  workspace_id = current_setting('app.workspace_id', true)
  and updated_by = current_setting('app.actor_id', true)
  and exists (
    select 1
    from app_private.workspace_memberships membership
    where membership.workspace_id = workspace_state.workspace_id
      and membership.actor_id = current_setting('app.actor_id', true)
      and membership.status = 'active'
      and case workspace_state.surface
        when 'command' then 'command.write'
        when 'shop' then 'shop.write'
        when 'plant' then 'plant.write'
        when 'setup' then 'setup.write'
      end = any(membership.capabilities)
  )
);

create policy workspace_events_member_read
on app_private.workspace_events
for select
to supermega_trial_backend
using (
  workspace_id = current_setting('app.workspace_id', true)
  and exists (
    select 1
    from app_private.workspace_memberships membership
    where membership.workspace_id = workspace_events.workspace_id
      and membership.actor_id = current_setting('app.actor_id', true)
      and membership.status = 'active'
  )
);

create policy workspace_events_capability_insert
on app_private.workspace_events
for insert
to supermega_trial_backend
with check (
  workspace_id = current_setting('app.workspace_id', true)
  and actor_id = current_setting('app.actor_id', true)
  and exists (
    select 1
    from app_private.workspace_memberships membership
    where membership.workspace_id = workspace_events.workspace_id
      and membership.actor_id = current_setting('app.actor_id', true)
      and membership.status = 'active'
      and case workspace_events.surface
        when 'command' then 'command.write'
        when 'shop' then 'shop.write'
        when 'plant' then 'plant.write'
        when 'setup' then 'setup.write'
        when 'approvals' then case workspace_events.event_type
          when 'approval.requested' then 'approvals.request'
          when 'approval.decided' then 'approvals.decide'
        end
      end = any(membership.capabilities)
  )
);

create policy approval_requests_member_read
on app_private.approval_requests
for select
to supermega_trial_backend
using (
  workspace_id = current_setting('app.workspace_id', true)
  and exists (
    select 1
    from app_private.workspace_memberships membership
    where membership.workspace_id = approval_requests.workspace_id
      and membership.actor_id = current_setting('app.actor_id', true)
      and membership.status = 'active'
  )
);

create policy approval_requests_capability_insert
on app_private.approval_requests
for insert
to supermega_trial_backend
with check (
  workspace_id = current_setting('app.workspace_id', true)
  and status = 'pending'
  and requested_by = current_setting('app.actor_id', true)
  and exists (
    select 1
    from app_private.workspace_memberships membership
    where membership.workspace_id = approval_requests.workspace_id
      and membership.actor_id = current_setting('app.actor_id', true)
      and membership.status = 'active'
      and 'approvals.request' = any(membership.capabilities)
  )
);

create policy approval_requests_capability_update
on app_private.approval_requests
for update
to supermega_trial_backend
using (
  workspace_id = current_setting('app.workspace_id', true)
  and status = 'pending'
  and exists (
    select 1
    from app_private.workspace_memberships membership
    where membership.workspace_id = approval_requests.workspace_id
      and membership.actor_id = current_setting('app.actor_id', true)
      and membership.status = 'active'
      and 'approvals.decide' = any(membership.capabilities)
  )
)
with check (
  workspace_id = current_setting('app.workspace_id', true)
  and status in ('approved', 'declined')
  and decided_by = current_setting('app.actor_id', true)
  and exists (
    select 1
    from app_private.workspace_memberships membership
    where membership.workspace_id = approval_requests.workspace_id
      and membership.actor_id = current_setting('app.actor_id', true)
      and membership.status = 'active'
      and 'approvals.decide' = any(membership.capabilities)
  )
);

revoke all on all tables in schema app_private from public, anon, authenticated, service_role;
revoke all on all sequences in schema app_private from public, anon, authenticated, service_role;
revoke all on all functions in schema app_private from public, anon, authenticated, service_role;

grant usage on schema app_private to supermega_trial_backend;
grant select on app_private.trial_schema_meta to supermega_trial_backend;
grant select on app_private.workspace_memberships to supermega_trial_backend;
grant select, insert, update on app_private.workspace_state to supermega_trial_backend;
grant select, insert on app_private.workspace_events to supermega_trial_backend;
grant select, insert, update on app_private.approval_requests to supermega_trial_backend;

insert into app_private.trial_schema_meta (component, schema_version)
values ('private_trial_backend', 1)
on conflict (component) do update
set schema_version = excluded.schema_version,
    applied_at = now();

commit;
