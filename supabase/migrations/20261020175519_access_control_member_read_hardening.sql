begin;

do $guard$
begin
  if current_user <> 'postgres'
     or not exists (
       select 1 from pg_roles
       where rolname = current_user and (rolsuper or rolbypassrls)
     )
     or (select schema_version from app_private.trial_schema_meta
         where component = 'private_trial_backend') <> 13
     or not exists (
       select 1 from pg_policies
       where schemaname = 'app_private'
         and tablename = 'workspace_access_controls'
         and policyname = 'workspace_access_controls_member_read'
         and cmd = 'SELECT'
         and roles = '{supermega_trial_backend}'::name[]
         and qual =
           '((workspace_id = ( SELECT current_setting(''app.workspace_id''::text, true) AS current_setting)) AND (status = ''active''::text))'
     )
  then
    raise exception 'access_control_member_read_hardening_preflight_failed';
  end if;
end;
$guard$;

-- This private, boolean-only lookup avoids a policy cycle. Membership SELECT
-- itself calls workspace_is_active(), which reads workspace_access_controls.
-- The function owner must bypass RLS; the caller cannot select membership rows
-- through this function or invoke it from a browser role.
create function app_private.workspace_access_member_active(target_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, app_private
as $function$
  select
    target_workspace_id = current_setting('app.workspace_id', true)
    and current_setting('app.actor_kind', true) in ('human', 'service', 'agent')
    and exists (
      select 1
      from app_private.workspace_memberships membership
      where membership.workspace_id = target_workspace_id
        and membership.actor_id = current_setting('app.actor_id', true)
        and membership.actor_kind = current_setting('app.actor_kind', true)
        and membership.status = 'active'
    )
$function$;

revoke all on function app_private.workspace_access_member_active(text)
  from public, anon, authenticated, service_role;
grant execute on function app_private.workspace_access_member_active(text)
  to supermega_trial_backend;

drop policy workspace_access_controls_member_read
  on app_private.workspace_access_controls;
create policy workspace_access_controls_member_read
on app_private.workspace_access_controls
for select
to supermega_trial_backend
using (
  workspace_id = (select current_setting('app.workspace_id', true))
  and status = 'active'
  and (
    (
      authorization_contract = 'self_serve_claim_v1'
      and owner_actor_id = (select current_setting('app.actor_id', true))
      and (select current_setting('app.actor_kind', true)) = 'human'
    )
    or app_private.workspace_access_member_active(workspace_id)
  )
);

do $verify$
begin
  if not exists (
       select 1 from pg_proc function_record
       join pg_namespace namespace_record on namespace_record.oid = function_record.pronamespace
       join pg_roles owner_record on owner_record.oid = function_record.proowner
       where namespace_record.nspname = 'app_private'
         and function_record.proname = 'workspace_access_member_active'
         and function_record.prosecdef
         and (owner_record.rolsuper or owner_record.rolbypassrls)
     )
     or has_function_privilege('anon', 'app_private.workspace_access_member_active(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'app_private.workspace_access_member_active(text)', 'EXECUTE')
     or has_function_privilege('service_role', 'app_private.workspace_access_member_active(text)', 'EXECUTE')
     or not has_function_privilege('supermega_trial_backend', 'app_private.workspace_access_member_active(text)', 'EXECUTE')
  then
    raise exception 'access_control_member_read_hardening_verify_failed';
  end if;
end;
$verify$;

commit;
