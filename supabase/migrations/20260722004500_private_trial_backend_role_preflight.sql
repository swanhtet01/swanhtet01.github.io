begin;

-- Run before the foundation migration can reuse a colliding role name. A
-- legitimate fresh install has no backend role yet. If an administrator
-- intentionally pre-created the role, it must be an unused, dependency-free
-- group role so the foundation grants cannot expose unrelated authority.
do $backend_role_preflight$
declare
  backend_record record;
begin
  select *
  into backend_record
  from pg_roles
  where rolname = 'supermega_trial_backend';

  if not found then
    return;
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
      message = 'pre-existing supermega trial backend role attributes are unsafe';
  end if;

  if exists (
    select 1
    from pg_auth_members membership
    where membership.member = backend_record.oid
       or membership.roleid = backend_record.oid
  ) then
    raise exception using
      errcode = '55000',
      message = 'pre-existing supermega trial backend role must have no memberships';
  end if;

  if exists (
    select 1
    from pg_shdepend dependency
    where dependency.refclassid = 'pg_authid'::regclass
      and dependency.refobjid = backend_record.oid
  ) then
    raise exception using
      errcode = '55000',
      message = 'pre-existing supermega trial backend role must have no object dependencies';
  end if;

  if exists (
    select 1
    from pg_db_role_setting role_setting
    where role_setting.setrole = backend_record.oid
  ) then
    raise exception using
      errcode = '55000',
      message = 'pre-existing supermega trial backend role must have no role settings';
  end if;
end
$backend_role_preflight$;

commit;
