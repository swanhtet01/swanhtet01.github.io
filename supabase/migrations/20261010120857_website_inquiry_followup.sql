begin;
alter table app_private.website_inbox
  add column status text not null default 'new' check (status in ('new','in_progress','done')),
  add column assigned_to text,
  add column followup_note text not null default '' check (length(followup_note)<=800),
  add column revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  add column updated_by text,
  add column updated_at timestamptz,
  add constraint website_inbox_assignment check ((status='new' and assigned_to is null) or (status<>'new' and assigned_to is not null)),
  add constraint website_inbox_workspace_request unique (workspace_id,channel_id,request_id);
create index website_inbox_status_received_idx on app_private.website_inbox(workspace_id,status,received_at desc,channel_id,request_id);

-- Immutable action receipts contain no customer contact, message or note text.
create table app_private.website_inquiry_actions (
  workspace_id text not null,
  action_id uuid not null,
  channel_id uuid not null,
  request_id uuid not null,
  actor_id text not null,
  expected_revision bigint not null check (expected_revision>=1),
  operation text not null check (operation in ('claim','release','complete','reopen','note')),
  note_digest text not null check (note_digest ~ '^[a-f0-9]{64}$'),
  previous_status text not null check (previous_status in ('new','in_progress','done')),
  receipt jsonb not null check (jsonb_typeof(receipt)='object'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (workspace_id,action_id),
  foreign key (workspace_id,channel_id,request_id) references app_private.website_inbox(workspace_id,channel_id,request_id)
);
create index website_inquiry_actions_request_idx on app_private.website_inquiry_actions(workspace_id,channel_id,request_id,created_at);
alter table app_private.website_inquiry_actions enable row level security;
alter table app_private.website_inquiry_actions force row level security;
create policy website_inquiry_actions_read on app_private.website_inquiry_actions
  for select to supermega_trial_backend using (
    workspace_id=current_setting('app.workspace_id',true) and app_private.website_review_can('website.write'));
revoke all on app_private.website_inquiry_actions from public,anon,authenticated,service_role;
grant select on app_private.website_inquiry_actions to supermega_trial_backend;

-- No direct UPDATE or audit INSERT grants: the state and its receipt commit
-- together through this scoped operation. The API also validates session and
-- entitlement through its existing guarded runtime transaction.
create function app_private.change_website_inquiry(
  p_channel uuid,p_request uuid,p_action uuid,p_revision bigint,p_operation text,p_note text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,app_private as $$
declare
  workspace text := current_setting('app.workspace_id',true);
  actor text := current_setting('app.actor_id',true);
  item app_private.website_inbox%rowtype;
  prior app_private.website_inquiry_actions%rowtype;
  note_hash text;
  result jsonb;
begin
  perform 1 from app_private.workspace_access_controls a
    join app_private.workspace_memberships m on m.workspace_id=a.workspace_id
    where a.workspace_id=workspace and a.status='active'
      and m.actor_id=actor and m.actor_kind='human' and m.status='active'
      and current_setting('app.actor_kind',true)='human' and 'website.write'=any(m.capabilities)
    for share of a,m;
  if not found then raise exception 'website_inquiry_access_denied' using errcode='42501'; end if;
  if p_channel is null or p_request is null or p_action is null or p_revision is null
    or p_revision<1 or p_revision>=9007199254740991 or p_operation is null
    or p_operation not in ('claim','release','complete','reopen','note')
    or p_note is null or length(p_note)>800 or (p_operation<>'note' and p_note<>'') then
    raise exception 'website_inquiry_invalid' using errcode='22023';
  end if;
  note_hash := encode(sha256(convert_to(p_note,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('website-followup:'||workspace||':'||p_action::text,0));
  select * into prior from app_private.website_inquiry_actions where workspace_id=workspace and action_id=p_action;
  if found then
    if prior.channel_id<>p_channel or prior.request_id<>p_request or prior.actor_id<>actor
      or prior.expected_revision<>p_revision or prior.operation<>p_operation or prior.note_digest<>note_hash then
      raise exception 'website_inquiry_retry_conflict' using errcode='40001';
    end if;
    return prior.receipt;
  end if;
  select * into item from app_private.website_inbox
    where workspace_id=workspace and channel_id=p_channel and request_id=p_request for update;
  if not found then raise exception 'website_inquiry_not_found' using errcode='P0002'; end if;
  if item.revision<>p_revision then raise exception 'website_inquiry_changed' using errcode='40001'; end if;
  if (p_operation='claim' and item.status<>'new')
    or (p_operation='release' and (item.status<>'in_progress' or item.assigned_to is distinct from actor))
    or (p_operation='complete' and (item.status='done' or (item.assigned_to is not null and item.assigned_to<>actor)))
    or (p_operation='reopen' and item.status<>'done') then
    raise exception 'website_inquiry_changed' using errcode='40001';
  end if;
  update app_private.website_inbox set
    status=case p_operation when 'claim' then 'in_progress' when 'complete' then 'done'
      when 'release' then 'new' when 'reopen' then 'new' else status end,
    assigned_to=case p_operation when 'claim' then actor when 'complete' then actor
      when 'release' then null when 'reopen' then null else assigned_to end,
    followup_note=case when p_operation='note' then p_note else followup_note end,
    revision=revision+1,updated_by=actor,updated_at=clock_timestamp()
    where workspace_id=workspace and channel_id=p_channel and request_id=p_request
    returning jsonb_build_object('channelId',channel_id,'requestId',request_id,'actionId',p_action,
      'revision',revision,'status',status,'assignedTo',assigned_to,'updatedBy',updated_by,'updatedAt',updated_at) into result;
  insert into app_private.website_inquiry_actions
    (workspace_id,action_id,channel_id,request_id,actor_id,expected_revision,operation,note_digest,previous_status,receipt)
    values(workspace,p_action,p_channel,p_request,actor,p_revision,p_operation,note_hash,item.status,result);
  return result;
end;
$$;
revoke all on function app_private.change_website_inquiry(uuid,uuid,uuid,bigint,text,text)
  from public,anon,authenticated,service_role;
grant execute on function app_private.change_website_inquiry(uuid,uuid,uuid,bigint,text,text) to supermega_trial_backend;
commit;
