begin;

-- Isolated preview-branch rehearsal probe. Proves the Supabase session
-- acceptance and revocation semantics introduced by
-- supabase/migrations/20260804102000_private_trial_backend_v10_supabase_session_revocation.sql
-- against a hosted target, mirroring the loopback proof in
-- tools/rehearse_supermega_postgres17.py (managed Supabase session checks)
-- without any durable mutation: every statement in this file runs inside one
-- transaction that ends in ROLLBACK, so the probe leaves zero rows behind.
--
-- Run only on an owner-approved isolated rehearsal target (a preview branch),
-- never on protected production. psql must run with ON_ERROR_STOP=1 so any
-- raised exception fails the step closed.

do $probe$
declare
  probe_user uuid := gen_random_uuid();
  probe_session uuid := gen_random_uuid();
  function_record record;
  active boolean;
begin
  if current_user <> 'postgres' then
    raise exception using
      errcode = '42501',
      message = 'session revocation probe requires the reviewed postgres migration role';
  end if;

  if to_regprocedure('app_private.supabase_session_is_active(uuid,uuid)') is null then
    raise exception using
      errcode = '55000',
      message = 'session revocation probe requires private trial backend v10';
  end if;

  -- Mirror the v10 migration $verify$ block: the function must remain the
  -- exact fail-closed contract before its behaviour is exercised.
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

  if not found
    or function_record.security_definer is not true
    or function_record.volatility <> 's'
    or function_record.language_name <> 'sql'
    or function_record.configuration <> array['search_path=""']::text[]
  then
    raise exception using
      errcode = '55000',
      message = 'session function is not the fail-closed v10 contract';
  end if;

  if has_function_privilege(
      'anon', 'app_private.supabase_session_is_active(uuid,uuid)', 'EXECUTE')
    or has_function_privilege(
      'authenticated', 'app_private.supabase_session_is_active(uuid,uuid)', 'EXECUTE')
    or has_function_privilege(
      'service_role', 'app_private.supabase_session_is_active(uuid,uuid)', 'EXECUTE')
  then
    raise exception using
      errcode = '55000',
      message = 'session function must stay denied to browser and service roles';
  end if;

  if not has_function_privilege(
    'supermega_trial_backend',
    'app_private.supabase_session_is_active(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception using
      errcode = '55000',
      message = 'backend role lost execute on the session function';
  end if;

  -- 1. An unknown session must be denied.
  select app_private.supabase_session_is_active(probe_user, probe_session)
  into active;
  if active is distinct from false then
    raise exception using
      errcode = '55000',
      message = 'unknown session must be denied';
  end if;

  -- 2. An active session must be accepted. Hosted Supabase enforces a
  -- foreign key from auth.sessions to auth.users that the loopback rehearsal
  -- schema does not have, so create the synthetic user first when required.
  -- Both rows disappear at ROLLBACK.
  begin
    insert into auth.sessions (id, user_id)
    values (probe_session, probe_user);
  exception
    when foreign_key_violation then
      insert into auth.users (id) values (probe_user);
      insert into auth.sessions (id, user_id)
      values (probe_session, probe_user);
  end;

  select app_private.supabase_session_is_active(probe_user, probe_session)
  into active;
  if active is distinct from true then
    raise exception using
      errcode = '55000',
      message = 'active session must be accepted';
  end if;

  -- 3. A revoked (deleted) session must be denied before token expiry.
  delete from auth.sessions
  where id = probe_session
    and user_id = probe_user;

  select app_private.supabase_session_is_active(probe_user, probe_session)
  into active;
  if active is distinct from false then
    raise exception using
      errcode = '55000',
      message = 'revoked session must be denied';
  end if;

  raise notice 'preview_session_revocation_probe_ok';
end
$probe$;

rollback;
