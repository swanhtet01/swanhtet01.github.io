begin;

do $guard$
begin
  if not exists (
    select 1
    from app_private.trial_schema_meta
    where component = 'private_trial_backend'
      and schema_version = 6
  ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v7 requires schema version 6';
  end if;
end
$guard$;

-- Keep the v6 membership RLS gate intact. Discovery starts from the verified
-- actor through one private, argument-free function and returns only rows that
-- also have an active workspace access-control record.
create function app_private.actor_workspace_directory()
returns table (
  workspace_id text,
  capabilities text[],
  display_name text
)
language sql
stable
security definer
set search_path = pg_catalog, app_private
as $function$
  select
    membership.workspace_id,
    membership.capabilities,
    nullif(btrim(coalesce(setup_state.state_json ->> 'workspace', '')), '')
  from app_private.workspace_memberships membership
  join app_private.workspace_access_controls access_control
    on access_control.workspace_id = membership.workspace_id
   and access_control.status = 'active'
  left join app_private.workspace_state setup_state
    on setup_state.workspace_id = membership.workspace_id
   and setup_state.surface = 'setup'
  where current_setting('app.actor_kind', true) in ('human', 'service', 'agent')
    and membership.actor_id = current_setting('app.actor_id', true)
    and membership.actor_kind = current_setting('app.actor_kind', true)
    and membership.status = 'active'
  order by membership.workspace_id
$function$;

create index workspace_memberships_actor_directory_idx
on app_private.workspace_memberships (actor_id, actor_kind, status, workspace_id);

revoke all on function app_private.actor_workspace_directory()
  from public, anon, authenticated, service_role;
grant execute on function app_private.actor_workspace_directory()
  to supermega_trial_backend;

update app_private.trial_schema_meta
set schema_version = 7,
    applied_at = transaction_timestamp()
where component = 'private_trial_backend';

do $verify$
begin
  if not exists (
    select 1
    from app_private.trial_schema_meta
    where component = 'private_trial_backend'
      and schema_version = 7
  ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v7 did not reach schema version 7';
  end if;
end
$verify$;

commit;
