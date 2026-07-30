begin;

do $guard$
begin
  if not exists (
    select 1
    from app_private.trial_schema_meta
    where component = 'private_trial_backend'
      and schema_version = 5
  ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v6 requires schema version 5';
  end if;
end
$guard$;

create table app_private.workspace_access_controls (
  workspace_id text primary key,
  activation_id uuid not null unique,
  authorization_id uuid not null unique,
  authorization_contract text not null
    check (authorization_contract in ('managed_owner_approval_v1', 'legacy_migration_v1')),
  plan_digest text not null check (plan_digest ~ '^[0-9a-f]{64}$'),
  owner_actor_id text not null,
  project_ref text not null check (project_ref ~ '^[a-z0-9]{20}$'),
  release_commit text not null check (release_commit ~ '^[0-9a-f]{40}$'),
  status text not null check (status in ('active', 'suspended')),
  activated_at timestamptz not null default transaction_timestamp(),
  suspended_at timestamptz,
  updated_at timestamptz not null default transaction_timestamp(),
  check (workspace_id = btrim(workspace_id) and workspace_id <> ''),
  check (owner_actor_id = btrim(owner_actor_id) and owner_actor_id <> ''),
  check (
    (status = 'active' and suspended_at is null)
    or (status = 'suspended' and suspended_at is not null)
  )
);

create function app_private.guard_workspace_access_control()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app_private
as $function$
begin
  if tg_op = 'INSERT' then
    new.activated_at := transaction_timestamp();
    new.updated_at := transaction_timestamp();
    if new.status = 'suspended' then
      new.suspended_at := transaction_timestamp();
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'workspace access controls cannot be deleted';
  end if;
  if new.workspace_id is distinct from old.workspace_id
     or new.activation_id is distinct from old.activation_id
     or new.authorization_id is distinct from old.authorization_id
     or new.authorization_contract is distinct from old.authorization_contract
     or new.plan_digest is distinct from old.plan_digest
     or new.owner_actor_id is distinct from old.owner_actor_id
     or new.project_ref is distinct from old.project_ref
     or new.release_commit is distinct from old.release_commit
     or new.activated_at is distinct from old.activated_at then
    raise exception using errcode = '55000', message = 'workspace activation identity is immutable';
  end if;
  if old.status <> 'active' or new.status <> 'suspended' then
    raise exception using errcode = '55000', message = 'workspace access can only transition from active to suspended';
  end if;
  new.suspended_at := transaction_timestamp();
  new.updated_at := transaction_timestamp();
  return new;
end
$function$;

create trigger workspace_access_control_guard
before insert or update or delete on app_private.workspace_access_controls
for each row execute function app_private.guard_workspace_access_control();

insert into app_private.workspace_access_controls (
  workspace_id,
  activation_id,
  authorization_id,
  authorization_contract,
  plan_digest,
  owner_actor_id,
  project_ref,
  release_commit,
  status,
  suspended_at
)
select
  membership.workspace_id,
  md5('legacy-activation:' || membership.workspace_id)::uuid,
  md5('legacy-authorization:' || membership.workspace_id)::uuid,
  'legacy_migration_v1',
  md5('legacy-plan-a:' || membership.workspace_id)
    || md5('legacy-plan-b:' || membership.workspace_id),
  (array_agg(
    membership.actor_id
    order by (membership.actor_kind = 'human') desc, membership.actor_id
  ))[1],
  repeat('0', 20),
  repeat('0', 40),
  'suspended',
  transaction_timestamp()
from app_private.workspace_memberships membership
group by membership.workspace_id;

alter table app_private.workspace_access_controls enable row level security;
alter table app_private.workspace_access_controls force row level security;

create policy workspace_access_controls_member_read
on app_private.workspace_access_controls
for select
to supermega_trial_backend
using (
  workspace_access_controls.workspace_id = current_setting('app.workspace_id', true)
  and workspace_access_controls.status = 'active'
);

create function app_private.workspace_is_active(target_workspace_id text)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, app_private
as $function$
  select exists (
    select 1
    from app_private.workspace_access_controls access_control
    where access_control.workspace_id = target_workspace_id
      and access_control.status = 'active'
  )
$function$;

create policy workspace_memberships_access_gate
on app_private.workspace_memberships
as restrictive
for all
to supermega_trial_backend
using (app_private.workspace_is_active(workspace_memberships.workspace_id))
with check (app_private.workspace_is_active(workspace_memberships.workspace_id));

create policy workspace_state_access_gate
on app_private.workspace_state
as restrictive
for all
to supermega_trial_backend
using (app_private.workspace_is_active(workspace_state.workspace_id))
with check (app_private.workspace_is_active(workspace_state.workspace_id));

create policy workspace_events_access_gate
on app_private.workspace_events
as restrictive
for all
to supermega_trial_backend
using (app_private.workspace_is_active(workspace_events.workspace_id))
with check (app_private.workspace_is_active(workspace_events.workspace_id));

create policy approval_requests_access_gate
on app_private.approval_requests
as restrictive
for all
to supermega_trial_backend
using (app_private.workspace_is_active(approval_requests.workspace_id))
with check (app_private.workspace_is_active(approval_requests.workspace_id));

revoke all on app_private.workspace_access_controls
  from public, anon, authenticated, service_role;
revoke all on function app_private.guard_workspace_access_control()
  from public, anon, authenticated, service_role;
revoke all on function app_private.workspace_is_active(text)
  from public, anon, authenticated, service_role;
grant select on app_private.workspace_access_controls to supermega_trial_backend;
grant execute on function app_private.workspace_is_active(text) to supermega_trial_backend;

update app_private.trial_schema_meta
set schema_version = 6,
    applied_at = transaction_timestamp()
where component = 'private_trial_backend';

do $verify$
begin
  if not exists (
    select 1
    from app_private.trial_schema_meta
    where component = 'private_trial_backend'
      and schema_version = 6
  ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v6 did not reach schema version 6';
  end if;
end
$verify$;

commit;
