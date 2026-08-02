begin;

do $guard$
begin
  if not exists (
    select 1
    from app_private.trial_schema_meta
    where component = 'private_trial_backend'
      and schema_version = 7
  ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v8 requires schema version 7';
  end if;
end
$guard$;

-- Supabase lint 0003 requires request-context functions in RLS policies to be
-- wrapped in scalar subqueries so PostgreSQL evaluates them once per query.
-- Recreate only the ten flagged policies; every authorization predicate and
-- the restrictive managed-activation policies remain unchanged.
drop policy workspace_memberships_self_read on app_private.workspace_memberships;
drop policy workspace_state_member_read on app_private.workspace_state;
drop policy workspace_state_capability_insert on app_private.workspace_state;
drop policy workspace_state_capability_update on app_private.workspace_state;
drop policy workspace_events_member_read on app_private.workspace_events;
drop policy workspace_events_capability_insert on app_private.workspace_events;
drop policy approval_requests_member_read on app_private.approval_requests;
drop policy approval_requests_capability_insert on app_private.approval_requests;
drop policy approval_requests_capability_update on app_private.approval_requests;
drop policy workspace_access_controls_member_read on app_private.workspace_access_controls;

create policy workspace_memberships_self_read
on app_private.workspace_memberships
for select
to supermega_trial_backend
using (
  workspace_id = (select current_setting('app.workspace_id', true))
  and actor_id = (select current_setting('app.actor_id', true))
  and (select current_setting('app.actor_kind', true)) in ('human', 'service', 'agent')
  and actor_kind = (select current_setting('app.actor_kind', true))
  and status = 'active'
);

create policy workspace_state_member_read
on app_private.workspace_state
for select
to supermega_trial_backend
using (
  workspace_id = (select current_setting('app.workspace_id', true))
  and (select current_setting('app.actor_kind', true)) in ('human', 'service', 'agent')
  and exists (
    select 1
    from app_private.workspace_memberships membership
    where membership.workspace_id = workspace_state.workspace_id
      and membership.actor_id = (select current_setting('app.actor_id', true))
      and membership.actor_kind = (select current_setting('app.actor_kind', true))
      and membership.status = 'active'
      and (
        workspace_state.surface || '.read' = any(membership.capabilities)
        or workspace_state.surface || '.write' = any(membership.capabilities)
      )
  )
);

create policy workspace_state_capability_insert
on app_private.workspace_state
for insert
to supermega_trial_backend
with check (
  workspace_id = (select current_setting('app.workspace_id', true))
  and updated_by = (select current_setting('app.actor_id', true))
  and version = 1
  and (select current_setting('app.actor_kind', true)) in ('human', 'service', 'agent')
  and exists (
    select 1
    from app_private.workspace_memberships membership
    where membership.workspace_id = workspace_state.workspace_id
      and membership.actor_id = (select current_setting('app.actor_id', true))
      and membership.actor_kind = (select current_setting('app.actor_kind', true))
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
  workspace_id = (select current_setting('app.workspace_id', true))
  and (select current_setting('app.actor_kind', true)) in ('human', 'service', 'agent')
  and exists (
    select 1
    from app_private.workspace_memberships membership
    where membership.workspace_id = workspace_state.workspace_id
      and membership.actor_id = (select current_setting('app.actor_id', true))
      and membership.actor_kind = (select current_setting('app.actor_kind', true))
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
  workspace_id = (select current_setting('app.workspace_id', true))
  and updated_by = (select current_setting('app.actor_id', true))
  and (select current_setting('app.actor_kind', true)) in ('human', 'service', 'agent')
  and exists (
    select 1
    from app_private.workspace_memberships membership
    where membership.workspace_id = workspace_state.workspace_id
      and membership.actor_id = (select current_setting('app.actor_id', true))
      and membership.actor_kind = (select current_setting('app.actor_kind', true))
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

create policy workspace_events_member_read
on app_private.workspace_events
for select
to supermega_trial_backend
using (
  workspace_id = (select current_setting('app.workspace_id', true))
  and (select current_setting('app.actor_kind', true)) in ('human', 'service', 'agent')
  and exists (
    select 1
    from app_private.workspace_memberships membership
    where membership.workspace_id = workspace_events.workspace_id
      and membership.actor_id = (select current_setting('app.actor_id', true))
      and membership.actor_kind = (select current_setting('app.actor_kind', true))
      and membership.status = 'active'
      and (
        (
          workspace_events.surface = 'approvals'
          and (
            'approvals.read' = any(membership.capabilities)
            or 'approvals.decide' = any(membership.capabilities)
            or (
              'approvals.request' = any(membership.capabilities)
              and workspace_events.actor_id = (select current_setting('app.actor_id', true))
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

create policy workspace_events_capability_insert
on app_private.workspace_events
for insert
to supermega_trial_backend
with check (
  workspace_id = (select current_setting('app.workspace_id', true))
  and actor_id = (select current_setting('app.actor_id', true))
  and (select current_setting('app.actor_kind', true)) in ('human', 'service', 'agent')
  and actor_kind = (select current_setting('app.actor_kind', true))
  and (event_type <> 'approval.decided' or actor_kind = 'human')
  and exists (
    select 1
    from app_private.workspace_memberships membership
    where membership.workspace_id = workspace_events.workspace_id
      and membership.actor_id = (select current_setting('app.actor_id', true))
      and membership.actor_kind = (select current_setting('app.actor_kind', true))
      and membership.status = 'active'
      and case
        when workspace_events.event_type = 'approval.requested' then 'approvals.request'
        when workspace_events.event_type = 'approval.decided' then 'approvals.decide'
        when workspace_events.surface = 'company' then 'company.write'
        when workspace_events.surface = 'commerce' then 'commerce.write'
        when workspace_events.surface = 'production' then 'production.write'
        when workspace_events.surface = 'website' then 'website.write'
        when workspace_events.surface = 'setup' then 'setup.write'
      end = any(membership.capabilities)
  )
);

create policy approval_requests_member_read
on app_private.approval_requests
for select
to supermega_trial_backend
using (
  workspace_id = (select current_setting('app.workspace_id', true))
  and (select current_setting('app.actor_kind', true)) in ('human', 'service', 'agent')
  and exists (
    select 1
    from app_private.workspace_memberships membership
    where membership.workspace_id = approval_requests.workspace_id
      and membership.actor_id = (select current_setting('app.actor_id', true))
      and membership.actor_kind = (select current_setting('app.actor_kind', true))
      and membership.status = 'active'
      and (
        'approvals.read' = any(membership.capabilities)
        or 'approvals.decide' = any(membership.capabilities)
        or (
          'approvals.request' = any(membership.capabilities)
          and approval_requests.requested_by = (select current_setting('app.actor_id', true))
        )
      )
  )
);

create policy approval_requests_capability_insert
on app_private.approval_requests
for insert
to supermega_trial_backend
with check (
  workspace_id = (select current_setting('app.workspace_id', true))
  and status = 'pending'
  and decision_contract_version = 2
  and requested_by = (select current_setting('app.actor_id', true))
  and (select current_setting('app.actor_kind', true)) in ('human', 'service', 'agent')
  and requested_actor_kind = (select current_setting('app.actor_kind', true))
  and exists (
    select 1
    from app_private.workspace_memberships membership
    where membership.workspace_id = approval_requests.workspace_id
      and membership.actor_id = (select current_setting('app.actor_id', true))
      and membership.actor_kind = (select current_setting('app.actor_kind', true))
      and membership.status = 'active'
      and 'approvals.request' = any(membership.capabilities)
  )
);

create policy approval_requests_capability_update
on app_private.approval_requests
for update
to supermega_trial_backend
using (
  workspace_id = (select current_setting('app.workspace_id', true))
  and status = 'pending'
  and decision_contract_version = 2
  and (select current_setting('app.actor_kind', true)) = 'human'
  and exists (
    select 1
    from app_private.workspace_memberships membership
    where membership.workspace_id = approval_requests.workspace_id
      and membership.actor_id = (select current_setting('app.actor_id', true))
      and membership.actor_kind = 'human'
      and membership.status = 'active'
      and 'approvals.decide' = any(membership.capabilities)
  )
)
with check (
  workspace_id = (select current_setting('app.workspace_id', true))
  and status in ('approved', 'declined')
  and decision_contract_version = 2
  and decided_by = (select current_setting('app.actor_id', true))
  and decided_actor_kind = 'human'
  and (select current_setting('app.actor_kind', true)) = 'human'
  and decision_note = btrim(decision_note)
  and char_length(decision_note) between 1 and 500
  and exists (
    select 1
    from app_private.workspace_memberships membership
    where membership.workspace_id = approval_requests.workspace_id
      and membership.actor_id = (select current_setting('app.actor_id', true))
      and membership.actor_kind = 'human'
      and membership.status = 'active'
      and 'approvals.decide' = any(membership.capabilities)
  )
);

create policy workspace_access_controls_member_read
on app_private.workspace_access_controls
for select
to supermega_trial_backend
using (
  workspace_access_controls.workspace_id = (select current_setting('app.workspace_id', true))
  and workspace_access_controls.status = 'active'
);

update app_private.trial_schema_meta
set schema_version = 8,
    applied_at = transaction_timestamp()
where component = 'private_trial_backend'
  and schema_version = 7;

do $verify$
begin
  if not exists (
    select 1
    from app_private.trial_schema_meta
    where component = 'private_trial_backend'
      and schema_version = 8
  ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v8 did not reach schema version 8';
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'app_private'
      and policyname in (
        'workspace_memberships_self_read',
        'workspace_state_member_read',
        'workspace_state_capability_insert',
        'workspace_state_capability_update',
        'workspace_events_member_read',
        'workspace_events_capability_insert',
        'approval_requests_member_read',
        'approval_requests_capability_insert',
        'approval_requests_capability_update',
        'workspace_access_controls_member_read'
      )
  ) <> 10 then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v8 did not restore every optimized policy';
  end if;
end
$verify$;

commit;
