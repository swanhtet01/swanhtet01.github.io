begin;

-- Billing entitlement read policy (BILLING-RAIL-DESIGN.md 4.3, the DEVIATION
-- noted in the v12 migration header). v12 shipped billing dark on purpose:
-- zero policies, zero grants, so the founder's billing rail could ship and be
-- proven WITHOUT deciding, in the same breath, to expose anything to the
-- runtime. This migration is that separate decision, narrowly scoped: it
-- grants the non-BYPASSRLS runtime role exactly one thing -- SELECT on its
-- OWN workspace's billing_entitlements row -- and nothing else. It does not
-- touch billing_invoices or billing_events; those stay founder-only forever.
-- A session can learn only "is this workspace premium", never see an amount,
-- a payment reference, an invoice, or any other workspace's entitlement.
--
-- This mirrors exactly how v6 shipped the self-serve INSERT path dark and v11
-- lit it up as its own reviewable unit (SELF-SERVE-REMEDIATION-FINDINGS.md).
-- Applying this migration to production is a separate founder decision from
-- applying v12: v12 makes billing possible to operate; v13 makes the paid
-- flag visible to the product surface that reads it
-- (PostgresTrialStore._premium_unlocked, already shipped and dark-tested).
--
-- Reviewed and local-rehearsed only as of authoring; NOT proven on a hosted
-- branch and NOT applied anywhere. Do not apply to production without a
-- disposable-branch proof first, per house discipline.

do $guard$
begin
  if not exists (
    select 1
    from app_private.trial_schema_meta
    where component = 'private_trial_backend'
      and schema_version = 12
  ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v13 requires schema version 12';
  end if;
end
$guard$;

-- A session may read only the entitlement row for the workspace its own GUC
-- identity is bound to. No INSERT/UPDATE/DELETE policy is added: the runtime
-- can observe entitlement, never change it. Every write stays exclusively on
-- the founder-run BillingLedger provisioner connection (v12 header).
create policy billing_entitlements_self_read
on app_private.billing_entitlements
for select
to supermega_trial_backend
using (
  workspace_id = (select current_setting('app.workspace_id', true))
);

grant select on app_private.billing_entitlements to supermega_trial_backend;

update app_private.trial_schema_meta
set schema_version = 13,
    applied_at = transaction_timestamp()
where component = 'private_trial_backend'
  and schema_version = 12;

do $verify$
begin
  if not exists (
    select 1
    from app_private.trial_schema_meta
    where component = 'private_trial_backend'
      and schema_version = 13
  ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v13 did not reach schema version 13';
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'app_private'
      and cmd = 'SELECT'
      and permissive = 'PERMISSIVE'
      and array_to_string(roles, ',') = 'supermega_trial_backend'
      and tablename = 'billing_entitlements'
      and policyname = 'billing_entitlements_self_read'
  ) <> 1 then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v13 billing entitlement read policy is missing';
  end if;

  -- billing_invoices and billing_events must remain completely dark: no
  -- policy of any kind, no privilege of any kind, for the runtime role.
  if exists (
    select 1
    from pg_policies
    where schemaname = 'app_private'
      and tablename in ('billing_invoices', 'billing_events')
  ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v13 must not add policies on billing_invoices or billing_events';
  end if;

  if exists (
    select 1
    from unnest(array['billing_invoices', 'billing_events']) table_name,
         unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) privilege_name
    where has_table_privilege(
      'supermega_trial_backend', format('app_private.%I', table_name), privilege_name
    )
  ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v13 must not grant the runtime role any privilege on billing_invoices or billing_events';
  end if;

  if not has_table_privilege(
    'supermega_trial_backend', 'app_private.billing_entitlements', 'SELECT'
  ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v13 billing entitlement select grant is missing';
  end if;

  if exists (
    select 1
    from unnest(array['INSERT', 'UPDATE', 'DELETE']) privilege_name
    where has_table_privilege(
      'supermega_trial_backend', 'app_private.billing_entitlements', privilege_name
    )
  ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v13 must grant the runtime role read-only access to billing_entitlements';
  end if;
end
$verify$;

commit;
