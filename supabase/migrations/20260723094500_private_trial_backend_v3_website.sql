begin;

-- Add Website as a first-class managed surface. Existing memberships do not
-- receive website.write automatically; an administrator must grant it.
do $migration_guard$
declare
  current_version integer;
begin
  select schema_version
  into current_version
  from app_private.trial_schema_meta
  where component = 'private_trial_backend';

  if current_version is distinct from 2 then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v3 requires schema version 2';
  end if;
end
$migration_guard$;

alter table app_private.workspace_state
  drop constraint workspace_state_surface_v2_check,
  add constraint workspace_state_surface_v3_check
    check (surface in ('company', 'commerce', 'production', 'website', 'setup'));

alter table app_private.workspace_events
  drop constraint workspace_events_surface_v2_check,
  add constraint workspace_events_surface_v3_check
    check (surface in ('company', 'commerce', 'production', 'website', 'setup', 'approvals'));

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
      and case workspace_events.surface
        when 'company' then 'company.write'
        when 'commerce' then 'commerce.write'
        when 'production' then 'production.write'
        when 'website' then 'website.write'
        when 'setup' then 'setup.write'
        when 'approvals' then case workspace_events.event_type
          when 'approval.requested' then 'approvals.request'
          when 'approval.decided' then 'approvals.decide'
        end
      end = any(membership.capabilities)
  )
);

update app_private.trial_schema_meta
set schema_version = 3,
    applied_at = now()
where component = 'private_trial_backend'
  and schema_version = 2;

do $version_guard$
begin
  if not exists (
    select 1
    from app_private.trial_schema_meta
    where component = 'private_trial_backend'
      and schema_version = 3
  ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v3 schema version was not recorded';
  end if;
end
$version_guard$;

commit;
