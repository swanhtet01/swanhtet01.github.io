begin;

-- Default-off connected-site cloud persistence. This migration establishes
-- server-only storage and isolation; it does not enable a coordinator, issue
-- leases, accept commands, or expose any relation through the Data API.
do $guard$
begin
  if not exists (
    select 1 from app_private.trial_schema_meta
    where component = 'private_trial_backend' and schema_version = 14
  ) then
    raise exception using errcode = '55000',
      message = 'private trial backend v15 requires schema version 14';
  end if;
end
$guard$;

create table app_private.connected_sites (
  workspace_id text not null,
  site_id text not null,
  protocol_version integer not null check (protocol_version = 1),
  connected_enabled boolean not null default false check (connected_enabled = false),
  authority_generation bigint not null check (authority_generation >= 1),
  configuration_generation bigint not null check (configuration_generation >= 1),
  revocation_generation bigint not null check (revocation_generation >= 0),
  authority_payload_digest text not null check (authority_payload_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default transaction_timestamp(),
  primary key (workspace_id, site_id),
  check (workspace_id = btrim(workspace_id) and workspace_id <> ''),
  check (site_id = btrim(site_id) and site_id <> '')
);

create table app_private.connected_site_devices (
  workspace_id text not null,
  site_id text not null,
  device_id text not null,
  signing_key_id text not null,
  signing_public_key text not null,
  client_fingerprint text not null check (client_fingerprint ~ '^[0-9a-f]{64}$'),
  enrollment_evidence_digest text not null check (enrollment_evidence_digest ~ '^[0-9a-f]{64}$'),
  coordinator_binding_digest text not null check (coordinator_binding_digest ~ '^[0-9a-f]{64}$'),
  session_generation bigint not null check (session_generation >= 1),
  status text not null check (status in ('active', 'revoked')),
  enrolled_at timestamptz not null default transaction_timestamp(),
  primary key (workspace_id, site_id, device_id),
  unique (workspace_id, site_id, signing_key_id),
  unique (workspace_id, site_id, client_fingerprint),
  foreign key (workspace_id, site_id)
    references app_private.connected_sites (workspace_id, site_id),
  check (device_id = btrim(device_id) and device_id <> ''),
  check (signing_key_id = btrim(signing_key_id) and signing_key_id <> ''),
  check (signing_public_key ~ '^[A-Za-z0-9_-]{43}$')
);

create table app_private.connected_site_leases (
  workspace_id text not null,
  site_id text not null,
  lease_id text not null,
  actor_id text not null,
  device_id text not null,
  role text not null,
  capabilities text[] not null,
  session_generation bigint not null check (session_generation >= 1),
  revocation_generation bigint not null check (revocation_generation >= 0),
  configuration_generation bigint not null check (configuration_generation >= 1),
  issuer_key_id text not null,
  issuer_public_key text not null check (issuer_public_key ~ '^[A-Za-z0-9_-]{43}$'),
  lease_json jsonb not null check (jsonb_typeof(lease_json) = 'object'),
  lease_digest text not null check (lease_digest ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  status text not null check (status in ('active', 'revoked', 'expired')),
  primary key (workspace_id, site_id, lease_id),
  unique (workspace_id, site_id, lease_digest),
  foreign key (workspace_id, site_id, device_id)
    references app_private.connected_site_devices (workspace_id, site_id, device_id),
  check (actor_id = btrim(actor_id) and actor_id <> ''),
  check (expires_at > issued_at and expires_at <= issued_at + interval '7 days')
);

create table app_private.connected_site_commands (
  workspace_id text not null,
  site_id text not null,
  command_id text not null,
  command_digest text not null check (command_digest ~ '^[0-9a-f]{64}$'),
  command_json jsonb not null check (jsonb_typeof(command_json) = 'object'),
  proof_json jsonb not null check (jsonb_typeof(proof_json) = 'object'),
  proof_digest text not null check (proof_digest ~ '^[0-9a-f]{64}$'),
  actor_id text not null,
  device_id text not null,
  lease_id text not null,
  aggregate_type text not null,
  aggregate_id text not null,
  expected_version bigint not null check (expected_version >= 0),
  state text not null check (state in ('accepted', 'conflict', 'denied')),
  accepted_at timestamptz not null default transaction_timestamp(),
  primary key (workspace_id, site_id, command_id),
  foreign key (workspace_id, site_id, lease_id)
    references app_private.connected_site_leases (workspace_id, site_id, lease_id),
  foreign key (workspace_id, site_id, device_id)
    references app_private.connected_site_devices (workspace_id, site_id, device_id),
  check (actor_id = btrim(actor_id) and actor_id <> ''),
  check (aggregate_type = btrim(aggregate_type) and aggregate_type <> ''),
  check (aggregate_id = btrim(aggregate_id) and aggregate_id <> '')
);

create table app_private.connected_site_events (
  workspace_id text not null,
  site_id text not null,
  event_sequence bigint not null check (event_sequence >= 1),
  event_id text not null,
  event_digest text not null check (event_digest ~ '^[0-9a-f]{64}$'),
  previous_event_digest text check (previous_event_digest ~ '^[0-9a-f]{64}$'),
  event_json jsonb not null check (jsonb_typeof(event_json) = 'object'),
  command_id text not null,
  command_digest text not null check (command_digest ~ '^[0-9a-f]{64}$'),
  aggregate_type text not null,
  aggregate_id text not null,
  aggregate_version bigint not null check (aggregate_version >= 1),
  created_at timestamptz not null default transaction_timestamp(),
  primary key (workspace_id, site_id, event_sequence),
  unique (workspace_id, site_id, event_id),
  unique (workspace_id, site_id, event_digest),
  unique (workspace_id, site_id, aggregate_type, aggregate_id, aggregate_version),
  foreign key (workspace_id, site_id, command_id)
    references app_private.connected_site_commands (workspace_id, site_id, command_id),
  check ((event_sequence = 1) = (previous_event_digest is null))
);

create table app_private.connected_site_acknowledgements (
  workspace_id text not null,
  site_id text not null,
  command_id text not null,
  command_digest text not null check (command_digest ~ '^[0-9a-f]{64}$'),
  ack_state text not null check (ack_state in ('accepted', 'replayed', 'conflict', 'denied')),
  canonical_version bigint not null check (canonical_version >= 0),
  event_digest text check (event_digest ~ '^[0-9a-f]{64}$'),
  reason text,
  ack_json jsonb not null check (jsonb_typeof(ack_json) = 'object'),
  created_at timestamptz not null default transaction_timestamp(),
  primary key (workspace_id, site_id, command_id),
  foreign key (workspace_id, site_id, command_id)
    references app_private.connected_site_commands (workspace_id, site_id, command_id),
  check ((ack_state in ('accepted', 'replayed')) = (event_digest is not null)),
  check ((ack_state in ('conflict', 'denied')) = (reason is not null))
);

create table app_private.connected_site_conflicts (
  workspace_id text not null,
  site_id text not null,
  conflict_id text not null,
  command_id text not null,
  command_digest text not null check (command_digest ~ '^[0-9a-f]{64}$'),
  aggregate_type text not null,
  aggregate_id text not null,
  expected_version bigint not null check (expected_version >= 0),
  canonical_version bigint not null check (canonical_version >= 0),
  reason text not null,
  financial_rewrite_permitted boolean not null default false
    check (financial_rewrite_permitted = false),
  conflict_json jsonb not null check (jsonb_typeof(conflict_json) = 'object'),
  created_at timestamptz not null default transaction_timestamp(),
  primary key (workspace_id, site_id, conflict_id),
  unique (workspace_id, site_id, command_id),
  foreign key (workspace_id, site_id, command_id)
    references app_private.connected_site_commands (workspace_id, site_id, command_id)
);

create table app_private.connected_site_cursors (
  workspace_id text not null,
  site_id text not null,
  device_id text not null,
  upload_cursor bigint not null default 0 check (upload_cursor >= 0),
  acknowledgement_cursor bigint not null default 0 check (acknowledgement_cursor >= 0),
  updated_at timestamptz not null default transaction_timestamp(),
  primary key (workspace_id, site_id, device_id),
  foreign key (workspace_id, site_id, device_id)
    references app_private.connected_site_devices (workspace_id, site_id, device_id)
);

create function app_private.reject_connected_site_immutable_mutation()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, app_private
as $function$
begin
  raise exception using errcode = '55000', message = 'connected site evidence is immutable';
end
$function$;

create function app_private.guard_connected_site_authority()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, app_private
as $function$
begin
  if tg_op = 'DELETE'
     or new.workspace_id is distinct from old.workspace_id
     or new.site_id is distinct from old.site_id
     or new.protocol_version is distinct from old.protocol_version
     or new.connected_enabled
     or new.authority_generation < old.authority_generation
     or new.configuration_generation < old.configuration_generation
     or new.revocation_generation < old.revocation_generation
     or (new.authority_payload_digest = old.authority_payload_digest and
         (new.authority_generation, new.configuration_generation, new.revocation_generation)
          is distinct from
         (old.authority_generation, old.configuration_generation, old.revocation_generation)) then
    raise exception using errcode = '55000', message = 'connected site authority transition is invalid';
  end if;
  return new;
end
$function$;

create trigger connected_sites_authority_guard before update or delete
on app_private.connected_sites for each row
execute function app_private.guard_connected_site_authority();

create function app_private.guard_connected_site_device()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, app_private
as $function$
begin
  if tg_op = 'DELETE'
     or new.workspace_id is distinct from old.workspace_id
     or new.site_id is distinct from old.site_id
     or new.device_id is distinct from old.device_id
     or new.signing_key_id is distinct from old.signing_key_id
     or new.signing_public_key is distinct from old.signing_public_key
     or new.client_fingerprint is distinct from old.client_fingerprint
     or new.enrollment_evidence_digest is distinct from old.enrollment_evidence_digest
     or new.coordinator_binding_digest is distinct from old.coordinator_binding_digest
     or new.session_generation is distinct from old.session_generation
     or not (old.status = 'active' and new.status = 'revoked') then
    raise exception using errcode = '55000', message = 'connected site device transition is invalid';
  end if;
  return new;
end
$function$;

create trigger connected_site_device_guard before update or delete
on app_private.connected_site_devices for each row
execute function app_private.guard_connected_site_device();

create function app_private.guard_connected_site_lease()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, app_private
as $function$
begin
  if tg_op = 'DELETE'
     or new.workspace_id is distinct from old.workspace_id
     or new.site_id is distinct from old.site_id
     or new.lease_id is distinct from old.lease_id
     or new.actor_id is distinct from old.actor_id
     or new.device_id is distinct from old.device_id
     or new.role is distinct from old.role
     or new.capabilities is distinct from old.capabilities
     or new.session_generation is distinct from old.session_generation
     or new.revocation_generation is distinct from old.revocation_generation
     or new.configuration_generation is distinct from old.configuration_generation
     or new.issuer_key_id is distinct from old.issuer_key_id
     or new.issuer_public_key is distinct from old.issuer_public_key
     or new.lease_json is distinct from old.lease_json
     or new.lease_digest is distinct from old.lease_digest
     or new.issued_at is distinct from old.issued_at
     or new.expires_at is distinct from old.expires_at
     or not (old.status = 'active' and new.status in ('revoked', 'expired')) then
    raise exception using errcode = '55000', message = 'connected site lease transition is invalid';
  end if;
  return new;
end
$function$;

create trigger connected_site_lease_guard before update or delete
on app_private.connected_site_leases for each row
execute function app_private.guard_connected_site_lease();

create function app_private.guard_connected_site_event_chain()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, app_private
as $function$
begin
  if not exists (
    select 1 from app_private.connected_site_commands command
    where command.workspace_id = new.workspace_id and command.site_id = new.site_id
      and command.command_id = new.command_id and command.command_digest = new.command_digest
      and command.state = 'accepted' and command.aggregate_type = new.aggregate_type
      and command.aggregate_id = new.aggregate_id
      and command.expected_version + 1 = new.aggregate_version
  ) then
    raise exception using errcode = '55000', message = 'connected site event command binding mismatch';
  end if;
  if new.event_sequence = 1 then
    if exists (select 1 from app_private.connected_site_events prior
      where prior.workspace_id = new.workspace_id and prior.site_id = new.site_id) then
      raise exception using errcode = '40001', message = 'connected site event chain already exists';
    end if;
  elsif not exists (
    select 1 from app_private.connected_site_events prior
    where prior.workspace_id = new.workspace_id and prior.site_id = new.site_id
      and prior.event_sequence = new.event_sequence - 1
      and prior.event_digest = new.previous_event_digest
  ) then
    raise exception using errcode = '40001', message = 'connected site event chain predecessor mismatch';
  end if;
  return new;
end
$function$;

create trigger connected_site_event_chain_guard before insert
on app_private.connected_site_events for each row
execute function app_private.guard_connected_site_event_chain();

create function app_private.guard_connected_site_acknowledgement()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, app_private
as $function$
begin
  if not exists (
    select 1 from app_private.connected_site_commands command
    where command.workspace_id = new.workspace_id and command.site_id = new.site_id
      and command.command_id = new.command_id and command.command_digest = new.command_digest
      and ((new.ack_state in ('accepted','replayed') and command.state = 'accepted')
        or (new.ack_state = 'conflict' and command.state = 'conflict')
        or (new.ack_state = 'denied' and command.state = 'denied'))
  ) then
    raise exception using errcode = '55000', message = 'connected site acknowledgement command binding mismatch';
  end if;
  return new;
end
$function$;

create trigger connected_site_acknowledgement_binding_guard before insert
on app_private.connected_site_acknowledgements for each row
execute function app_private.guard_connected_site_acknowledgement();

create function app_private.guard_connected_site_conflict()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, app_private
as $function$
begin
  if not exists (
    select 1 from app_private.connected_site_commands command
    where command.workspace_id = new.workspace_id and command.site_id = new.site_id
      and command.command_id = new.command_id and command.command_digest = new.command_digest
      and command.state = 'conflict' and command.aggregate_type = new.aggregate_type
      and command.aggregate_id = new.aggregate_id
      and command.expected_version = new.expected_version
  ) then
    raise exception using errcode = '55000', message = 'connected site conflict command binding mismatch';
  end if;
  return new;
end
$function$;

create trigger connected_site_conflict_binding_guard before insert
on app_private.connected_site_conflicts for each row
execute function app_private.guard_connected_site_conflict();

create trigger connected_site_commands_immutable before update or delete
on app_private.connected_site_commands for each row
execute function app_private.reject_connected_site_immutable_mutation();
create trigger connected_site_events_immutable before update or delete
on app_private.connected_site_events for each row
execute function app_private.reject_connected_site_immutable_mutation();
create trigger connected_site_acknowledgements_immutable before update or delete
on app_private.connected_site_acknowledgements for each row
execute function app_private.reject_connected_site_immutable_mutation();
create trigger connected_site_conflicts_immutable before update or delete
on app_private.connected_site_conflicts for each row
execute function app_private.reject_connected_site_immutable_mutation();

create function app_private.guard_connected_site_cursor()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, app_private
as $function$
begin
  if tg_op = 'DELETE'
     or new.workspace_id is distinct from old.workspace_id
     or new.site_id is distinct from old.site_id
     or new.device_id is distinct from old.device_id
     or new.upload_cursor < old.upload_cursor
     or new.acknowledgement_cursor < old.acknowledgement_cursor then
    raise exception using errcode = '55000', message = 'connected site cursor must advance monotonically';
  end if;
  new.updated_at := transaction_timestamp();
  return new;
end
$function$;

create trigger connected_site_cursor_guard before update or delete
on app_private.connected_site_cursors for each row
execute function app_private.guard_connected_site_cursor();

alter table app_private.connected_sites enable row level security;
alter table app_private.connected_sites force row level security;
alter table app_private.connected_site_devices enable row level security;
alter table app_private.connected_site_devices force row level security;
alter table app_private.connected_site_leases enable row level security;
alter table app_private.connected_site_leases force row level security;
alter table app_private.connected_site_commands enable row level security;
alter table app_private.connected_site_commands force row level security;
alter table app_private.connected_site_events enable row level security;
alter table app_private.connected_site_events force row level security;
alter table app_private.connected_site_acknowledgements enable row level security;
alter table app_private.connected_site_acknowledgements force row level security;
alter table app_private.connected_site_conflicts enable row level security;
alter table app_private.connected_site_conflicts force row level security;
alter table app_private.connected_site_cursors enable row level security;
alter table app_private.connected_site_cursors force row level security;

-- Every policy binds both dimensions. The backend runtime sets these only
-- after authenticating the canonical v35 proof envelope.
do $policies$
declare table_name text;
begin
  foreach table_name in array array[
    'connected_sites', 'connected_site_devices', 'connected_site_leases',
    'connected_site_commands', 'connected_site_events',
    'connected_site_acknowledgements', 'connected_site_conflicts',
    'connected_site_cursors'
  ] loop
    execute format(
      'create policy %I on app_private.%I for select to supermega_trial_backend using '
      || '(workspace_id = (select current_setting(''app.workspace_id'', true)) '
      || 'and site_id = (select current_setting(''app.site_id'', true)))',
      table_name || '_backend_read', table_name
    );
    execute format(
      'create policy %I on app_private.%I for insert to supermega_trial_backend with check '
      || '(workspace_id = (select current_setting(''app.workspace_id'', true)) '
      || 'and site_id = (select current_setting(''app.site_id'', true)))',
      table_name || '_backend_insert', table_name
    );
  end loop;
end
$policies$;

create policy connected_sites_backend_update on app_private.connected_sites
for update to supermega_trial_backend
using (workspace_id = (select current_setting('app.workspace_id', true))
  and site_id = (select current_setting('app.site_id', true)))
with check (workspace_id = (select current_setting('app.workspace_id', true))
  and site_id = (select current_setting('app.site_id', true))
  and connected_enabled = false);
create policy connected_site_devices_backend_update on app_private.connected_site_devices
for update to supermega_trial_backend
using (workspace_id = (select current_setting('app.workspace_id', true))
  and site_id = (select current_setting('app.site_id', true)))
with check (workspace_id = (select current_setting('app.workspace_id', true))
  and site_id = (select current_setting('app.site_id', true)));
create policy connected_site_leases_backend_update on app_private.connected_site_leases
for update to supermega_trial_backend
using (workspace_id = (select current_setting('app.workspace_id', true))
  and site_id = (select current_setting('app.site_id', true)))
with check (workspace_id = (select current_setting('app.workspace_id', true))
  and site_id = (select current_setting('app.site_id', true)));
create policy connected_site_cursors_backend_update on app_private.connected_site_cursors
for update to supermega_trial_backend
using (workspace_id = (select current_setting('app.workspace_id', true))
  and site_id = (select current_setting('app.site_id', true)))
with check (workspace_id = (select current_setting('app.workspace_id', true))
  and site_id = (select current_setting('app.site_id', true)));

grant select, insert, update on app_private.connected_sites,
  app_private.connected_site_devices, app_private.connected_site_leases,
  app_private.connected_site_cursors to supermega_trial_backend;
grant select, insert on app_private.connected_site_commands,
  app_private.connected_site_events, app_private.connected_site_acknowledgements,
  app_private.connected_site_conflicts to supermega_trial_backend;
revoke all on app_private.connected_sites, app_private.connected_site_devices,
  app_private.connected_site_leases, app_private.connected_site_commands,
  app_private.connected_site_events, app_private.connected_site_acknowledgements,
  app_private.connected_site_conflicts, app_private.connected_site_cursors
  from public, anon, authenticated, service_role;

update app_private.trial_schema_meta
set schema_version = 15, applied_at = transaction_timestamp()
where component = 'private_trial_backend' and schema_version = 14;

do $verify$
begin
  if not exists (
    select 1 from app_private.trial_schema_meta
    where component = 'private_trial_backend' and schema_version = 15
  ) then
    raise exception using errcode = '55000', message = 'private trial backend v15 version advance failed';
  end if;
  if exists (
    select 1 from pg_class relation
    join pg_namespace schema_record on schema_record.oid = relation.relnamespace
    where schema_record.nspname = 'app_private'
      and relation.relname like 'connected_site%'
      and relation.relkind = 'r'
      and (not relation.relrowsecurity or not relation.relforcerowsecurity)
  ) then
    raise exception using errcode = '55000', message = 'connected site relations must force RLS';
  end if;
  if exists (
    select 1 from unnest(array['anon','authenticated','service_role']) role_name,
      unnest(array['connected_sites','connected_site_devices','connected_site_leases',
        'connected_site_commands','connected_site_events','connected_site_acknowledgements',
        'connected_site_conflicts','connected_site_cursors']) relation_name,
      unnest(array['SELECT','INSERT','UPDATE','DELETE']) privilege_name
    where has_table_privilege(role_name, format('app_private.%I', relation_name), privilege_name)
  ) then
    raise exception using errcode = '55000', message = 'connected site API roles must remain dark';
  end if;
end
$verify$;

commit;
