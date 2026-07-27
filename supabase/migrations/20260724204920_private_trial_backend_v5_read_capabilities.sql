begin;

-- Keep authenticated membership necessary but no longer sufficient for reading
-- every product surface. Existing write capabilities imply read access so
-- current operators retain access; explicit *.read grants support narrower
-- read-only roles.
do $migration_guard$
declare
  current_version integer;
begin
  select schema_version
  into current_version
  from app_private.trial_schema_meta
  where component = 'private_trial_backend';

  if current_version is distinct from 4 then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v5 requires schema version 4';
  end if;
end
$migration_guard$;

drop policy workspace_state_member_read on app_private.workspace_state;
drop policy workspace_events_member_read on app_private.workspace_events;
drop policy approval_requests_member_read on app_private.approval_requests;

create policy workspace_state_member_read
on app_private.workspace_state
for select
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
      and (
        workspace_state.surface || '.read' = any(membership.capabilities)
        or workspace_state.surface || '.write' = any(membership.capabilities)
      )
  )
);

create policy workspace_events_member_read
on app_private.workspace_events
for select
to supermega_trial_backend
using (
  workspace_id = current_setting('app.workspace_id', true)
  and current_setting('app.actor_kind', true) in ('human', 'service', 'agent')
  and exists (
    select 1
    from app_private.workspace_memberships membership
    where membership.workspace_id = workspace_events.workspace_id
      and membership.actor_id = current_setting('app.actor_id', true)
      and membership.actor_kind = current_setting('app.actor_kind', true)
      and membership.status = 'active'
      and (
        (
          workspace_events.surface = 'approvals'
          and (
            'approvals.read' = any(membership.capabilities)
            or 'approvals.decide' = any(membership.capabilities)
            or (
              'approvals.request' = any(membership.capabilities)
              and workspace_events.actor_id = current_setting('app.actor_id', true)
            )
          )
        )
        or
        (
          workspace_events.surface <> 'approvals'
          and (
            workspace_events.surface || '.read' = any(membership.capabilities)
            or workspace_events.surface || '.write' = any(membership.capabilities)
          )
        )
      )
  )
);

create policy approval_requests_member_read
on app_private.approval_requests
for select
to supermega_trial_backend
using (
  workspace_id = current_setting('app.workspace_id', true)
  and current_setting('app.actor_kind', true) in ('human', 'service', 'agent')
  and exists (
    select 1
    from app_private.workspace_memberships membership
    where membership.workspace_id = approval_requests.workspace_id
      and membership.actor_id = current_setting('app.actor_id', true)
      and membership.actor_kind = current_setting('app.actor_kind', true)
      and membership.status = 'active'
      and (
        'approvals.read' = any(membership.capabilities)
        or 'approvals.decide' = any(membership.capabilities)
        or (
          'approvals.request' = any(membership.capabilities)
          and approval_requests.requested_by = current_setting('app.actor_id', true)
        )
      )
  )
);

update app_private.trial_schema_meta
set schema_version = 5,
    applied_at = now()
where component = 'private_trial_backend'
  and schema_version = 4;

do $version_guard$
begin
  if not exists (
    select 1
    from app_private.trial_schema_meta
    where component = 'private_trial_backend'
      and schema_version = 5
  ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v5 schema version was not recorded';
  end if;
end
$version_guard$;

commit;
