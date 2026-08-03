begin;

do $guard$
begin
  if not exists (
    select 1
    from app_private.trial_schema_meta
    where component = 'private_trial_backend'
      and schema_version = 8
  ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v9 requires schema version 8';
  end if;
end
$guard$;

-- The private schema and table grants already deny browser and service roles.
-- RLS adds a second boundary for the only runtime role that can read metadata.
alter table app_private.trial_schema_meta enable row level security;

create policy trial_schema_meta_backend_read
on app_private.trial_schema_meta
for select
to supermega_trial_backend
using (component = 'private_trial_backend');

update app_private.trial_schema_meta
set schema_version = 9,
    applied_at = transaction_timestamp()
where component = 'private_trial_backend'
  and schema_version = 8;

do $verify$
begin
  if not exists (
    select 1
    from app_private.trial_schema_meta
    where component = 'private_trial_backend'
      and schema_version = 9
  ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v9 did not reach schema version 9';
  end if;

  if not exists (
    select 1
    from pg_class relation
    join pg_namespace schema_record
      on schema_record.oid = relation.relnamespace
    where schema_record.nspname = 'app_private'
      and relation.relname = 'trial_schema_meta'
      and relation.relkind in ('r', 'p')
      and relation.relrowsecurity
  ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v9 did not enable metadata row security';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'app_private'
      and tablename = 'trial_schema_meta'
      and policyname = 'trial_schema_meta_backend_read'
      and cmd = 'SELECT'
      and permissive = 'PERMISSIVE'
      and roles = array['supermega_trial_backend']::name[]
  ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v9 metadata policy is incomplete';
  end if;
end
$verify$;

commit;
