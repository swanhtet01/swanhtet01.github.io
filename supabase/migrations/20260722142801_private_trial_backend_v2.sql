begin;

-- Additive upgrade from the historical private-trial schema. Version 1 rows
-- did not record actor provenance or enforce the structured decision contract.
-- Preserve those rows as legacy evidence, but keep them outside trusted runtime
-- authorization until an administrator explicitly reclassifies memberships.
do $migration_guard$
declare
  current_version integer;
begin
  select schema_version
  into current_version
  from app_private.trial_schema_meta
  where component = 'private_trial_backend';

  if current_version is distinct from 1 then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v2 requires schema version 1';
  end if;
end
$migration_guard$;

-- The v1 mutation guards intentionally reject these backfills. Drop only the
-- triggers, perform the migration in this transaction, and recreate them before
-- the schema version is advanced.
drop trigger workspace_state_version_guard on app_private.workspace_state;
drop trigger workspace_events_immutable on app_private.workspace_events;
drop trigger approval_requests_controlled_mutation on app_private.approval_requests;

alter table app_private.workspace_memberships
  add column actor_kind text;

update app_private.workspace_memberships
set actor_kind = 'legacy';

alter table app_private.workspace_memberships
  alter column actor_kind set not null,
  add constraint workspace_memberships_actor_kind_v2_check
    check (actor_kind in ('human', 'service', 'agent', 'legacy'));

-- Capability and surface names become product-facing in v2. Legacy membership
-- rows remain unusable until actor_kind is explicitly set to a trusted value.
update app_private.workspace_memberships
set capabilities = array(
  select distinct
    case capability
      when 'command.write' then 'company.write'
      when 'shop.write' then 'commerce.write'
      when 'plant.write' then 'production.write'
      else capability
    end
  from unnest(capabilities) as expanded(capability)
  order by 1
);

alter table app_private.workspace_state
  drop constraint workspace_state_surface_check;

update app_private.workspace_state
set surface = case surface
  when 'command' then 'company'
  when 'shop' then 'commerce'
  when 'plant' then 'production'
  else surface
end;

alter table app_private.workspace_state
  add constraint workspace_state_surface_v2_check
    check (surface in ('company', 'commerce', 'production', 'setup'));

alter table app_private.workspace_events
  drop constraint workspace_events_surface_check,
  add column actor_kind text;

update app_private.workspace_events
set surface = case surface
      when 'command' then 'company'
      when 'shop' then 'commerce'
      when 'plant' then 'production'
      else surface
    end,
    actor_kind = 'legacy';

alter table app_private.workspace_events
  alter column actor_kind set not null,
  add constraint workspace_events_surface_v2_check
    check (surface in ('company', 'commerce', 'production', 'setup', 'approvals')),
  add constraint workspace_events_actor_kind_v2_check
    check (actor_kind in ('human', 'service', 'agent', 'legacy'));

alter table app_private.approval_requests
  add column requested_actor_kind text,
  add column decided_actor_kind text,
  add column decision_contract_version integer;

update app_private.approval_requests
set requested_actor_kind = 'legacy',
    decided_actor_kind = case
      when status in ('approved', 'declined') then 'legacy'
      else null
    end,
    decision_contract_version = 1;

alter table app_private.approval_requests
  alter column requested_actor_kind set not null,
  alter column decision_contract_version set default 2,
  alter column decision_contract_version set not null,
  add constraint approval_requests_requested_actor_kind_v2_check
    check (requested_actor_kind in ('human', 'service', 'agent', 'legacy')),
  add constraint approval_requests_decided_actor_kind_v2_check
    check (decided_actor_kind is null or decided_actor_kind in ('human', 'legacy')),
  add constraint approval_requests_decision_contract_version_v2_check
    check (decision_contract_version in (1, 2)),
  add constraint approval_requests_decision_packet_v2_check
    check (
      decision_contract_version = 1
      or (
        proposal_json ->> 'contract' = 'decision_packet.v1'
        and jsonb_typeof(proposal_json -> 'subject') = 'object'
        and proposal_json #>> '{subject,version}' = '1'
        and jsonb_typeof(proposal_json -> 'claims') = 'array'
        and jsonb_array_length(proposal_json -> 'claims') between 1 and 20
        and jsonb_array_length(evidence_refs_json) between 1 and 20
      )
    ),
  add constraint approval_requests_terminal_decision_v2_check
    check (
      decision_contract_version = 1
      or (
        status = 'pending'
        and version = 0
        and decided_by is null
        and decided_actor_kind is null
        and decided_at is null
        and decision_note = ''
      )
      or (
        status in ('approved', 'declined')
        and version = 1
        and decided_by is not null
        and decided_by = btrim(decided_by)
        and decided_by <> ''
        and decided_actor_kind = 'human'
        and decided_at is not null
        and decision_note = btrim(decision_note)
        and char_length(decision_note) between 1 and 500
      )
    );

create or replace function app_private.guard_approval_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app_private
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'approval records cannot be deleted';
  end if;
  if new.approval_id is distinct from old.approval_id
     or new.workspace_id is distinct from old.workspace_id
     or new.command_id is distinct from old.command_id
     or new.command_fingerprint is distinct from old.command_fingerprint
     or new.title is distinct from old.title
     or new.proposal_json is distinct from old.proposal_json
     or new.evidence_refs_json is distinct from old.evidence_refs_json
     or new.requested_by is distinct from old.requested_by
     or new.requested_actor_kind is distinct from old.requested_actor_kind
     or new.requested_at is distinct from old.requested_at
     or new.decision_contract_version is distinct from old.decision_contract_version then
    raise exception using errcode = '55000', message = 'approval proposal and evidence are immutable';
  end if;
  if old.decision_contract_version <> 2 then
    raise exception using errcode = '55000', message = 'legacy approval must be reissued under decision contract v2';
  end if;
  if old.status <> 'pending' or new.status not in ('approved', 'declined') then
    raise exception using errcode = '55000', message = 'approval transition must be pending to approved or declined';
  end if;
  if new.version <> old.version + 1
     or new.decided_by is null
     or new.decided_by <> btrim(new.decided_by)
     or new.decided_by = ''
     or new.decided_actor_kind <> 'human'
     or new.decided_at is null
     or new.decision_note <> btrim(new.decision_note)
     or char_length(new.decision_note) not between 1 and 500 then
    raise exception using errcode = '55000', message = 'approval decision requires a named human and nonblank note';
  end if;
  return new;
end
$function$;

create trigger workspace_events_immutable
before update or delete on app_private.workspace_events
for each row execute function app_private.reject_workspace_event_mutation();

create trigger workspace_state_version_guard
before update on app_private.workspace_state
for each row execute function app_private.guard_workspace_state_update();

create trigger approval_requests_controlled_mutation
before update or delete on app_private.approval_requests
for each row execute function app_private.guard_approval_mutation();

drop policy workspace_memberships_self_read on app_private.workspace_memberships;
drop policy workspace_state_member_read on app_private.workspace_state;
drop policy workspace_state_capability_insert on app_private.workspace_state;
drop policy workspace_state_capability_update on app_private.workspace_state;
drop policy workspace_events_member_read on app_private.workspace_events;
drop policy workspace_events_capability_insert on app_private.workspace_events;
drop policy approval_requests_member_read on app_private.approval_requests;
drop policy approval_requests_capability_insert on app_private.approval_requests;
drop policy approval_requests_capability_update on app_private.approval_requests;

create policy workspace_memberships_self_read
on app_private.workspace_memberships
for select
to supermega_trial_backend
using (
  workspace_id = current_setting('app.workspace_id', true)
  and actor_id = current_setting('app.actor_id', true)
  and current_setting('app.actor_kind', true) in ('human', 'service', 'agent')
  and actor_kind = current_setting('app.actor_kind', true)
  and status = 'active'
);

create policy workspace_state_member_read
on app_private.workspace_state
for select
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
  )
);

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
        when 'setup' then 'setup.write'
      end = any(membership.capabilities)
  )
);

create policy workspace_events_member_read
on app_private.workspace_events
for select
to supermega_trial_backend
using (
  workspace_id = current_setting('app.workspace_id', true)
  and current_setting('app.actor_kind', true) in ('human', 'service', 'agent')
  and exists (
    select 1
    from app_private.workspace_memberships membership
    where membership.workspace_id = workspace_events.workspace_id
      and membership.actor_id = current_setting('app.actor_id', true)
      and membership.actor_kind = current_setting('app.actor_kind', true)
      and membership.status = 'active'
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
        when 'setup' then 'setup.write'
        when 'approvals' then case workspace_events.event_type
          when 'approval.requested' then 'approvals.request'
          when 'approval.decided' then 'approvals.decide'
        end
      end = any(membership.capabilities)
  )
);

create policy approval_requests_member_read
on app_private.approval_requests
for select
to supermega_trial_backend
using (
  workspace_id = current_setting('app.workspace_id', true)
  and current_setting('app.actor_kind', true) in ('human', 'service', 'agent')
  and exists (
    select 1
    from app_private.workspace_memberships membership
    where membership.workspace_id = approval_requests.workspace_id
      and membership.actor_id = current_setting('app.actor_id', true)
      and membership.actor_kind = current_setting('app.actor_kind', true)
      and membership.status = 'active'
  )
);

create policy approval_requests_capability_insert
on app_private.approval_requests
for insert
to supermega_trial_backend
with check (
  workspace_id = current_setting('app.workspace_id', true)
  and status = 'pending'
  and decision_contract_version = 2
  and requested_by = current_setting('app.actor_id', true)
  and current_setting('app.actor_kind', true) in ('human', 'service', 'agent')
  and requested_actor_kind = current_setting('app.actor_kind', true)
  and exists (
    select 1
    from app_private.workspace_memberships membership
    where membership.workspace_id = approval_requests.workspace_id
      and membership.actor_id = current_setting('app.actor_id', true)
      and membership.actor_kind = current_setting('app.actor_kind', true)
      and membership.status = 'active'
      and 'approvals.request' = any(membership.capabilities)
  )
);

create policy approval_requests_capability_update
on app_private.approval_requests
for update
to supermega_trial_backend
using (
  workspace_id = current_setting('app.workspace_id', true)
  and status = 'pending'
  and decision_contract_version = 2
  and current_setting('app.actor_kind', true) = 'human'
  and exists (
    select 1
    from app_private.workspace_memberships membership
    where membership.workspace_id = approval_requests.workspace_id
      and membership.actor_id = current_setting('app.actor_id', true)
      and membership.actor_kind = 'human'
      and membership.status = 'active'
      and 'approvals.decide' = any(membership.capabilities)
  )
)
with check (
  workspace_id = current_setting('app.workspace_id', true)
  and status in ('approved', 'declined')
  and decision_contract_version = 2
  and decided_by = current_setting('app.actor_id', true)
  and decided_actor_kind = 'human'
  and current_setting('app.actor_kind', true) = 'human'
  and decision_note = btrim(decision_note)
  and char_length(decision_note) between 1 and 500
  and exists (
    select 1
    from app_private.workspace_memberships membership
    where membership.workspace_id = approval_requests.workspace_id
      and membership.actor_id = current_setting('app.actor_id', true)
      and membership.actor_kind = 'human'
      and membership.status = 'active'
      and 'approvals.decide' = any(membership.capabilities)
  )
);

update app_private.trial_schema_meta
set schema_version = 2,
    applied_at = now()
where component = 'private_trial_backend'
  and schema_version = 1;

do $version_guard$
begin
  if not exists (
    select 1
    from app_private.trial_schema_meta
    where component = 'private_trial_backend'
      and schema_version = 2
  ) then
    raise exception using
      errcode = '55000',
      message = 'private trial backend v2 schema version was not recorded';
  end if;
end
$version_guard$;

commit;
