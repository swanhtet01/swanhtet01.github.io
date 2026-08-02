begin;

-- Close the final database-enforced activation gaps without rewriting the
-- historical v1-v3 migrations. The runtime remains server-mediated and the
-- dedicated login must still be provisioned separately.
do $migration_guard$
declare
  current_version integer;
begin
  select schema_version
  into current_version
  from app_private.trial_schema_meta
  where component = 'private_trial_backend';

  if current_version is distinct from 3 then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v4 requires schema version 3';
  end if;
end
$migration_guard$;

-- Never grant private objects to a role that happened to exist with unsafe
-- attributes, inherited authority, any pre-existing member, or object ownership.
do $backend_role_guard$
declare
  backend_record record;
begin
  select *
  into backend_record
  from pg_roles
  where rolname = 'supermega_trial_backend';

  if not found then
    raise exception using
      errcode = '55000',
      message = 'supermega trial backend role is missing';
  end if;

  if backend_record.rolcanlogin
     or not backend_record.rolinherit
     or backend_record.rolsuper
     or backend_record.rolcreatedb
     or backend_record.rolcreaterole
     or backend_record.rolreplication
     or backend_record.rolbypassrls then
    raise exception using
      errcode = '55000',
      message = 'supermega trial backend role attributes are unsafe';
  end if;

  if exists (
    select 1
    from pg_auth_members membership
    where membership.member = backend_record.oid
  ) then
    raise exception using
      errcode = '55000',
      message = 'supermega trial backend role must not inherit another role';
  end if;

  if exists (
    select 1
    from pg_auth_members membership
    join pg_roles member_role
      on member_role.oid = membership.member
    join pg_roles grantor_role
      on grantor_role.oid = membership.grantor
    where membership.roleid = backend_record.oid
      and not (
        member_role.rolname = 'postgres'
        and grantor_role.rolname in ('postgres', 'supabase_admin')
        and membership.admin_option
        and not membership.inherit_option
        and not membership.set_option
      )
  ) then
    raise exception using
      errcode = '55000',
      message = 'supermega trial backend role has an unsafe member before runtime provisioning';
  end if;

  if exists (
    select 1
    from pg_shdepend dependency
    where dependency.refclassid = 'pg_authid'::regclass
      and dependency.refobjid = backend_record.oid
      and dependency.deptype = 'o'
  ) then
    raise exception using
      errcode = '55000',
      message = 'supermega trial backend role must not own database objects';
  end if;

  if exists (
    with observed as (
      select
        case
          when dependency.classid = 'pg_namespace'::regclass then 'schema'
          when dependency.classid = 'pg_class'::regclass then 'relation'
          else 'unexpected:' || dependency.classid::regclass::text
        end as object_kind,
        case
          when dependency.classid = 'pg_namespace'::regclass
            then schema_record.nspname
          when dependency.classid = 'pg_class'::regclass
            then relation_schema.nspname || '.' || relation_record.relname
          else dependency.objid::text
        end as object_name,
        dependency.objsubid
      from pg_shdepend dependency
      left join pg_namespace schema_record
        on dependency.classid = 'pg_namespace'::regclass
       and schema_record.oid = dependency.objid
      left join pg_class relation_record
        on dependency.classid = 'pg_class'::regclass
       and relation_record.oid = dependency.objid
      left join pg_namespace relation_schema
        on relation_schema.oid = relation_record.relnamespace
      where dependency.refclassid = 'pg_authid'::regclass
        and dependency.refobjid = backend_record.oid
        and dependency.deptype = 'a'
    ), expected(object_kind, object_name, objsubid) as (
      values
        ('schema', 'app_private', 0),
        ('relation', 'app_private.trial_schema_meta', 0),
        ('relation', 'app_private.workspace_memberships', 0),
        ('relation', 'app_private.workspace_state', 0),
        ('relation', 'app_private.workspace_events', 0),
        ('relation', 'app_private.approval_requests', 0)
    )
    (select * from observed except select * from expected)
    union all
    (select * from expected except select * from observed)
  ) then
    raise exception using
      errcode = '55000',
      message = 'supermega trial backend role grant scope is unsafe';
  end if;
end
$backend_role_guard$;

alter table app_private.workspace_events
  add constraint workspace_events_approval_surface_v4_check
    check (
      (
        surface = 'approvals'
        and event_type in ('approval.requested', 'approval.decided')
      )
      or
      (
        surface <> 'approvals'
        and event_type not in ('approval.requested', 'approval.decided')
      )
    );

drop trigger workspace_state_version_guard on app_private.workspace_state;

create or replace function app_private.guard_workspace_state_update()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app_private
as $function$
begin
  if tg_op = 'INSERT' then
    if new.version <> 1 then
      raise exception using errcode = '55000', message = 'initial workspace state version must be one';
    end if;
  else
    if new.workspace_id is distinct from old.workspace_id
       or new.surface is distinct from old.surface then
      raise exception using errcode = '55000', message = 'workspace state identity is immutable';
    end if;
    if new.version <> old.version + 1 then
      raise exception using errcode = '40001', message = 'workspace state version must increment by one';
    end if;
  end if;
  new.updated_at := transaction_timestamp();
  return new;
end
$function$;

create trigger workspace_state_version_guard
before insert or update on app_private.workspace_state
for each row execute function app_private.guard_workspace_state_update();

create function app_private.stamp_workspace_event_insert()
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

create trigger workspace_events_server_timestamp
before insert on app_private.workspace_events
for each row execute function app_private.stamp_workspace_event_insert();

drop trigger approval_requests_controlled_mutation on app_private.approval_requests;

create or replace function app_private.guard_approval_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app_private
as $function$
begin
  if tg_op = 'INSERT' then
    new.requested_at := transaction_timestamp();
    return new;
  end if;
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
     or new.requested_actor_kind is distinct from old.requested_actor_kind
     or new.requested_at is distinct from old.requested_at
     or new.decision_contract_version is distinct from old.decision_contract_version then
    raise exception using errcode = '55000', message = 'approval proposal and evidence are immutable';
  end if;
  if old.decision_contract_version <> 2 then
    raise exception using errcode = '55000', message = 'legacy approval must be reissued under decision contract v2';
  end if;
  if old.status <> 'pending' or new.status not in ('approved', 'declined') then
    raise exception using errcode = '55000', message = 'approval transition must be pending to approved or declined';
  end if;
  if new.version <> old.version + 1
     or new.decided_by is null
     or new.decided_by <> btrim(new.decided_by)
     or new.decided_by = ''
     or new.decided_actor_kind <> 'human'
     or new.decision_note <> btrim(new.decision_note)
     or char_length(new.decision_note) not between 1 and 500 then
    raise exception using errcode = '55000', message = 'approval decision requires a named human and nonblank note';
  end if;
  new.decided_at := transaction_timestamp();
  return new;
end
$function$;

create trigger approval_requests_controlled_mutation
before insert or update or delete on app_private.approval_requests
for each row execute function app_private.guard_approval_mutation();

drop policy workspace_state_capability_insert on app_private.workspace_state;
drop policy workspace_state_capability_update on app_private.workspace_state;
drop policy workspace_events_capability_insert on app_private.workspace_events;

create policy workspace_state_capability_insert
on app_private.workspace_state
for insert
to supermega_trial_backend
with check (
  workspace_id = current_setting('app.workspace_id', true)
  and updated_by = current_setting('app.actor_id', true)
  and version = 1
  and current_setting('app.actor_kind', true) in ('human', 'service', 'agent')
  and exists (
    select 1
    from app_private.workspace_memberships membership
    where membership.workspace_id = workspace_state.workspace_id
      and membership.actor_id = current_setting('app.actor_id', true)
      and membership.actor_kind = current_setting('app.actor_kind', true)
      and membership.status = 'active'
      and case workspace_state.surface
        when 'company' then 'company.write'
        when 'commerce' then 'commerce.write'
        when 'production' then 'production.write'
        when 'website' then 'website.write'
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
  and current_setting('app.actor_kind', true) in ('human', 'service', 'agent')
  and exists (
    select 1
    from app_private.workspace_memberships membership
    where membership.workspace_id = workspace_state.workspace_id
      and membership.actor_id = current_setting('app.actor_id', true)
      and membership.actor_kind = current_setting('app.actor_kind', true)
      and membership.status = 'active'
      and case workspace_state.surface
        when 'company' then 'company.write'
        when 'commerce' then 'commerce.write'
        when 'production' then 'production.write'
        when 'website' then 'website.write'
        when 'setup' then 'setup.write'
      end = any(membership.capabilities)
  )
)
with check (
  workspace_id = current_setting('app.workspace_id', true)
  and updated_by = current_setting('app.actor_id', true)
  and current_setting('app.actor_kind', true) in ('human', 'service', 'agent')
  and exists (
    select 1
    from app_private.workspace_memberships membership
    where membership.workspace_id = workspace_state.workspace_id
      and membership.actor_id = current_setting('app.actor_id', true)
      and membership.actor_kind = current_setting('app.actor_kind', true)
      and membership.status = 'active'
      and case workspace_state.surface
        when 'company' then 'company.write'
        when 'commerce' then 'commerce.write'
        when 'production' then 'production.write'
        when 'website' then 'website.write'
        when 'setup' then 'setup.write'
      end = any(membership.capabilities)
  )
);

create policy workspace_events_capability_insert
on app_private.workspace_events
for insert
to supermega_trial_backend
with check (
  workspace_id = current_setting('app.workspace_id', true)
  and actor_id = current_setting('app.actor_id', true)
  and current_setting('app.actor_kind', true) in ('human', 'service', 'agent')
  and actor_kind = current_setting('app.actor_kind', true)
  and (event_type <> 'approval.decided' or actor_kind = 'human')
  and exists (
    select 1
    from app_private.workspace_memberships membership
    where membership.workspace_id = workspace_events.workspace_id
      and membership.actor_id = current_setting('app.actor_id', true)
      and membership.actor_kind = current_setting('app.actor_kind', true)
      and membership.status = 'active'
      and case
        when workspace_events.event_type = 'approval.requested' then 'approvals.request'
        when workspace_events.event_type = 'approval.decided' then 'approvals.decide'
        when workspace_events.surface = 'company' then 'company.write'
        when workspace_events.surface = 'commerce' then 'commerce.write'
        when workspace_events.surface = 'production' then 'production.write'
        when workspace_events.surface = 'website' then 'website.write'
        when workspace_events.surface = 'setup' then 'setup.write'
      end = any(membership.capabilities)
  )
);

revoke all on function app_private.guard_workspace_state_update()
  from public, anon, authenticated, service_role;
revoke all on function app_private.stamp_workspace_event_insert()
  from public, anon, authenticated, service_role;
revoke all on function app_private.guard_approval_mutation()
  from public, anon, authenticated, service_role;

update app_private.trial_schema_meta
set schema_version = 4,
    applied_at = now()
where component = 'private_trial_backend'
  and schema_version = 3;

do $version_guard$
begin
  if not exists (
    select 1
    from app_private.trial_schema_meta
    where component = 'private_trial_backend'
      and schema_version = 4
  ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v4 schema version was not recorded';
  end if;
end
$version_guard$;

commit;
