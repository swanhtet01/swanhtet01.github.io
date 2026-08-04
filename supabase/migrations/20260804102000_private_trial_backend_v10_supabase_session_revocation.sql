begin;

do $guard$
begin
  if not exists (
    select 1
    from app_private.trial_schema_meta
    where component = 'private_trial_backend'
      and schema_version = 9
  ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v10 requires schema version 9';
  end if;

  if to_regclass('auth.sessions') is null or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'auth'
      and table_name = 'sessions'
      and column_name = 'id'
      and udt_name = 'uuid'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'auth'
      and table_name = 'sessions'
      and column_name = 'user_id'
      and udt_name = 'uuid'
  ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v10 requires Supabase auth.sessions UUID identity columns';
  end if;
end
$guard$;

-- This boolean-only server function is deliberately outside every exposed
-- schema. It lets the backend make sign-out and administrative revocation
-- effective before a previously issued access token expires.
create function app_private.supabase_session_is_active(
  target_user_id uuid,
  target_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from auth.sessions as session_record
    where session_record.user_id = target_user_id
      and session_record.id = target_session_id
  )
$function$;

revoke all on function app_private.supabase_session_is_active(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function app_private.supabase_session_is_active(uuid, uuid)
to supermega_trial_backend;

update app_private.trial_schema_meta
set schema_version = 10,
    applied_at = transaction_timestamp()
where component = 'private_trial_backend'
  and schema_version = 9;

do $verify$
declare
  function_record record;
begin
  if not exists (
    select 1
    from app_private.trial_schema_meta
    where component = 'private_trial_backend'
      and schema_version = 10
  ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v10 did not reach schema version 10';
  end if;

  select
    procedure_record.prosecdef as security_definer,
    procedure_record.provolatile as volatility,
    procedure_record.proconfig as configuration,
    language_record.lanname as language_name
  into function_record
  from pg_proc procedure_record
  join pg_namespace schema_record
    on schema_record.oid = procedure_record.pronamespace
  join pg_language language_record
    on language_record.oid = procedure_record.prolang
  where schema_record.nspname = 'app_private'
    and procedure_record.proname = 'supabase_session_is_active'
    and pg_get_function_identity_arguments(procedure_record.oid)
      = 'target_user_id uuid, target_session_id uuid';

  if not found then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v10 session function is missing';
  end if;

  if function_record.security_definer is not true
    or function_record.volatility <> 's'
    or function_record.language_name <> 'sql'
    or function_record.configuration <> array['search_path=""']::text[]
  then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v10 session function is not fail-closed';
  end if;

  if not has_function_privilege(
    'supermega_trial_backend',
    'app_private.supabase_session_is_active(uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'app_private.supabase_session_is_active(uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'app_private.supabase_session_is_active(uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'app_private.supabase_session_is_active(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v10 session function privileges are unsafe';
  end if;
end
$verify$;

commit;
