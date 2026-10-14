-- Replace an approved Sites snapshot on its existing public channel. The
-- channel ID remains the public URL and inquiry key. Failed replacements leave
-- the previous artifact enabled; callers have no direct UPDATE privilege.
begin;

-- Attribution belongs to the inquiry as received. The channel name and
-- selected contact page can change while the public URL and inbox continue.
alter table app_private.website_inbox
  add column received_site_name text,
  add column received_source_page text;
update app_private.website_inbox i set
  received_site_name=c.site_name, received_source_page=c.source_page
  from app_private.website_inquiry_channels c where c.channel_id=i.channel_id;
alter table app_private.website_inbox
  alter column received_site_name set not null,
  alter column received_source_page set not null,
  add constraint website_inbox_received_site_name_valid
    check (length(received_site_name) between 1 and 60),
  add constraint website_inbox_received_source_page_valid
    check (length(received_source_page) between 1 and 120);

-- Re-issue the only privileged ingress function with the received-at columns.
-- It already locks the live channel before inserting, so attribution and the
-- received request come from the same approved publication transaction.
create or replace function app_private.receive_website_inquiry(
  p_channel uuid, p_request uuid, p_origin text, p_name text,
  p_contact text, p_message text, p_consent boolean, p_client_key text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, app_private as $$
declare
  channel app_private.website_inquiry_channels%rowtype;
  previous app_private.website_inbox%rowtype;
  stamp timestamptz;
begin
  if p_request is null or p_consent is distinct from true
    or p_name is null or length(btrim(p_name)) not between 1 and 80
    or p_contact is null or length(btrim(p_contact)) not between 1 and 120
    or p_message is null or length(btrim(p_message)) not between 1 and 500
    or p_name <> btrim(p_name) or p_contact <> btrim(p_contact) or p_message <> btrim(p_message)
    or p_name ~ '[[:cntrl:]]' or p_contact ~ '[[:cntrl:]]'
    or regexp_replace(p_message,E'[\n\t]','','g') ~ '[[:cntrl:]]'
    or p_client_key is null or p_client_key !~ '^[0-9a-f]{64}$' then
    raise exception 'website_inquiry_invalid' using errcode='22023';
  end if;
  select * into channel from app_private.website_inquiry_channels where channel_id=p_channel;
  if not found then
    raise exception 'website_inquiry_unavailable' using errcode='P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('website-inquiry:' || channel.workspace_id,0));
  select * into channel from app_private.website_inquiry_channels where channel_id=p_channel for update;
  if not found or not channel.enabled or p_origin is distinct from channel.allowed_origin
    or not app_private.workspace_is_active(channel.workspace_id) then
    raise exception 'website_inquiry_unavailable' using errcode='P0001';
  end if;
  stamp := clock_timestamp();
  perform 1 from app_private.workspace_access_controls
    where workspace_id=channel.workspace_id and status='active' for share;
  if not found then
    raise exception 'website_inquiry_unavailable' using errcode='P0001';
  end if;
  select * into previous from app_private.website_inbox
    where channel_id=p_channel and request_id=p_request;
  if found then
    if previous.name<>p_name or previous.contact<>p_contact or previous.message<>p_message then
      raise exception 'website_inquiry_retry_conflict' using errcode='P0001';
    end if;
    return jsonb_build_object('status','received','requestId',p_request,'duplicate',true);
  end if;
  if (select count(*) from app_private.website_inbox
      where workspace_id=channel.workspace_id and client_key=p_client_key
        and received_at>stamp-interval '10 minutes') >= 6
    or (select count(*) from app_private.website_inbox
      where channel_id=p_channel and received_at>stamp-interval '1 hour') >= 200
    or (select count(*) from app_private.website_inbox
      where workspace_id=channel.workspace_id and received_at>stamp-interval '1 day') >= 500
    or (select count(*) from app_private.website_inbox
      where workspace_id=channel.workspace_id) >= 10000 then
    raise exception 'website_inquiry_capacity' using errcode='P0001';
  end if;
  insert into app_private.website_inbox(channel_id,request_id,workspace_id,name,contact,message,
    consent_recorded,client_key,received_at,received_site_name,received_source_page)
    values(p_channel,p_request,channel.workspace_id,p_name,p_contact,p_message,true,p_client_key,
      stamp,channel.site_name,channel.source_page);
  return jsonb_build_object('status','received','requestId',p_request,'duplicate',false);
end;
$$;

create function app_private.replace_website_inquiry_channel(
  p_channel uuid, p_expected_version bigint, p_expected_digest text,
  p_version bigint, p_page text, p_snapshot text, p_digest text, p_origin text
) returns jsonb language plpgsql security definer set search_path = pg_catalog, app_private as $$
declare channel app_private.website_inquiry_channels%rowtype;
  source app_private.workspace_state%rowtype;
  snapshot jsonb;
  approval jsonb;
  target_page jsonb;
  v_source_digest text;
begin
  perform 1 from app_private.workspace_access_controls a
    join app_private.workspace_memberships m on m.workspace_id=a.workspace_id
    where a.workspace_id=current_setting('app.workspace_id',true) and a.status='active'
      and m.actor_id=current_setting('app.actor_id',true) and m.actor_kind='human' and m.status='active'
      and current_setting('app.actor_kind',true)='human' and 'website.write'=any(m.capabilities)
    for share of a,m;
  if not found then
    raise exception 'website_inquiry_access_denied' using errcode='42501';
  end if;
  -- Match the existing publication lock order. A concurrent withdrawal or
  -- replacement cannot observe a partially switched artifact.
  select * into source from app_private.workspace_state
    where workspace_id=current_setting('app.workspace_id',true) and surface='website' for share;
  perform pg_advisory_xact_lock(hashtextextended('website-inquiry:' || current_setting('app.workspace_id',true),0));
  select * into channel from app_private.website_inquiry_channels
    where channel_id=p_channel and workspace_id=current_setting('app.workspace_id',true) for update;
  if not found or not channel.enabled or p_origin is distinct from channel.allowed_origin then
    raise exception 'website_inquiry_source_stale' using errcode='40001';
  end if;
  -- A retry after a lost acknowledgement is safe only for the exact version,
  -- approved snapshot, digest and page already on this live channel.
  if channel.source_version is not distinct from p_version
    and channel.snapshot_id is not distinct from p_snapshot
    and channel.artifact_digest is not distinct from p_digest
    and channel.page_id is not distinct from p_page then
    return jsonb_build_object('channelId',p_channel,'enabled',true,'artifactDigest',p_digest);
  end if;
  if channel.source_version is distinct from p_expected_version
    or channel.artifact_digest is distinct from p_expected_digest
    or p_version <= channel.source_version or source.version is distinct from p_version then
    raise exception 'website_inquiry_source_stale' using errcode='40001';
  end if;
  v_source_digest := 'sha256:' || encode(sha256(convert_to(
    app_private.website_review_json(source.state_json),'UTF8')),'hex');
  select value into snapshot from jsonb_array_elements(source.state_json->'localPublishes')
    where value->>'id'=p_snapshot;
  select value into approval from jsonb_array_elements(source.state_json->'approvals')
    where value->>'id'=snapshot->>'approvalId';
  if snapshot is null or approval is null or snapshot->'artifact' is null
    or snapshot->'source' is distinct from approval->'source'
    or snapshot->'source'->'contentRevision' is distinct from source.state_json->'contentRevision'
    or snapshot->'artifact'->'siteName' is distinct from source.state_json->'siteName'
    or p_digest is distinct from 'sha256:' || encode(sha256(convert_to(
      app_private.website_review_json(snapshot->'artifact'),'UTF8')),'hex') then
    raise exception 'website_inquiry_approval_required' using errcode='22023';
  end if;
  select value into target_page from jsonb_array_elements(snapshot->'artifact'->'pages')
    where value->>'id'=p_page;
  if target_page is null or length(snapshot->'artifact'->>'siteName') not between 1 and 60
    or length(target_page->>'slug') not between 1 and 120
    or not exists(select 1 from jsonb_array_elements(source.state_json->'pages') p
      where p->>'id'=p_page and p->>'slug'=target_page->>'slug') then
    raise exception 'website_inquiry_approval_required' using errcode='22023';
  end if;
  update app_private.website_inquiry_channels set
    page_id=p_page, source_version=p_version, source_digest=v_source_digest,
    site_name=snapshot->'artifact'->>'siteName', source_page=target_page->>'slug',
    published_artifact=snapshot->'artifact', artifact_digest=p_digest, snapshot_id=p_snapshot,
    published_by=current_setting('app.actor_id',true), published_at=clock_timestamp()
    where channel_id=p_channel and workspace_id=channel.workspace_id;
  return jsonb_build_object('channelId',p_channel,'enabled',true,'artifactDigest',p_digest);
end;
$$;

revoke all on function app_private.replace_website_inquiry_channel(uuid,bigint,text,bigint,text,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function app_private.replace_website_inquiry_channel(uuid,bigint,text,bigint,text,text,text,text)
  to supermega_trial_backend;

commit;
