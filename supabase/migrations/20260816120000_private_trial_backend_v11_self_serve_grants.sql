begin;

-- Self-serve managed onboarding, schema support (SELF-SERVE-ONBOARDING-SPEC.md
-- step D). The non-BYPASSRLS runtime role must be able to bootstrap exactly ONE
-- tenant it owns: insert the first app_private.workspace_access_controls row and
-- its own owner membership, in one transaction. v6 deliberately reserved those
-- two writes for the privileged managed-activation role (grant SELECT only, no
-- INSERT policy), so the self-serve endpoint shipped dark. This migration adds
-- the minimal, GUC-identity-bound grants and PERMISSIVE INSERT policies that
-- make self-serve schema-supported, scoped so a session can only ever create a
-- self-serve workspace it owns -- never a managed_owner_approval row, never a
-- row for another actor's workspace. Additive only: no existing policy, trigger,
-- grant, guard function, or constraint (other than the widened contract CHECK)
-- is altered. The append-only workspace_events table is untouched; its
-- update/delete privilege for the proof-5 immutability probe is branch-only
-- staging SQL applied separately, never here.

do $guard$
begin
  if not exists (
    select 1
    from app_private.trial_schema_meta
    where component = 'private_trial_backend'
      and schema_version = 10
  ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v11 requires schema version 10';
  end if;
end
$guard$;

-- Admit the self-serve authorization contract alongside the existing managed and
-- legacy contracts. The bootstrap INSERT policy below binds this exact value, so
-- widening the CHECK cannot widen any managed or legacy path.
alter table app_private.workspace_access_controls
  drop constraint workspace_access_controls_authorization_contract_check,
  add constraint workspace_access_controls_authorization_contract_check
    check (authorization_contract in (
      'managed_owner_approval_v1',
      'legacy_migration_v1',
      'self_serve_claim_v1'
    ));

-- A self-serve session may create the access-control row for ITS OWN GUC
-- workspace, naming ITSELF as owner, only under the self-serve contract, only
-- with status active. It can never mint a managed_owner_approval row (contract
-- bound) nor a row whose workspace/owner differ from the bound GUC identity.
create policy workspace_access_controls_self_serve_insert
on app_private.workspace_access_controls
for insert
to supermega_trial_backend
with check (
  workspace_id = (select current_setting('app.workspace_id', true))
  and owner_actor_id = (select current_setting('app.actor_id', true))
  and (select current_setting('app.actor_kind', true)) = 'human'
  and authorization_contract = 'self_serve_claim_v1'
  and status = 'active'
);

-- A self-serve session may add ITSELF as a human, active owner-member of a
-- workspace whose active access-control row already records it as the self-serve
-- owner. The owner-tie + contract scope means that even if app.workspace_id were
-- ever attacker-influenced, a session could only add itself onto a self-serve
-- workspace it already owns -- no escalation onto managed or other actors'
-- tenants.
create policy workspace_memberships_self_serve_insert
on app_private.workspace_memberships
for insert
to supermega_trial_backend
with check (
  workspace_id = (select current_setting('app.workspace_id', true))
  and actor_id = (select current_setting('app.actor_id', true))
  and actor_kind = 'human'
  and status = 'active'
  and exists (
    select 1
    from app_private.workspace_access_controls ac
    where ac.workspace_id = workspace_memberships.workspace_id
      and ac.owner_actor_id = workspace_memberships.actor_id
      and ac.status = 'active'
      and ac.authorization_contract = 'self_serve_claim_v1'
  )
);

grant insert on app_private.workspace_access_controls to supermega_trial_backend;
grant insert on app_private.workspace_memberships to supermega_trial_backend;

update app_private.trial_schema_meta
set schema_version = 11,
    applied_at = transaction_timestamp()
where component = 'private_trial_backend'
  and schema_version = 10;

do $verify$
begin
  if not exists (
    select 1
    from app_private.trial_schema_meta
    where component = 'private_trial_backend'
      and schema_version = 11
  ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v11 did not reach schema version 11';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_record
    join pg_class relation on relation.oid = constraint_record.conrelid
    join pg_namespace schema_record on schema_record.oid = relation.relnamespace
    where schema_record.nspname = 'app_private'
      and relation.relname = 'workspace_access_controls'
      and constraint_record.conname = 'workspace_access_controls_authorization_contract_check'
      and pg_get_constraintdef(constraint_record.oid) like '%self_serve_claim_v1%'
  ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v11 authorization contract check was not relaxed';
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'app_private'
      and cmd = 'INSERT'
      and permissive = 'PERMISSIVE'
      and array_to_string(roles, ',') = 'supermega_trial_backend'
      and (
        (tablename = 'workspace_access_controls'
          and policyname = 'workspace_access_controls_self_serve_insert')
        or (tablename = 'workspace_memberships'
          and policyname = 'workspace_memberships_self_serve_insert')
      )
  ) <> 2 then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v11 self-serve insert policies are missing';
  end if;

  if not has_table_privilege(
      'supermega_trial_backend',
      'app_private.workspace_access_controls',
      'INSERT'
    )
    or not has_table_privilege(
      'supermega_trial_backend',
      'app_private.workspace_memberships',
      'INSERT'
    ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v11 self-serve insert grants are missing';
  end if;
end
$verify$;

commit;
