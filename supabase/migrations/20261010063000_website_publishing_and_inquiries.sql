-- Approved Sites snapshots, private photo access and durable customer inquiries.
-- Activating hosting remains explicit server configuration; channels start disabled.
-- Public HTTP requests may call only the narrow receive function through the
-- backend. No browser role can read channels, customer data or workspace state.
begin;

create table app_private.website_inquiry_channels (
  channel_id uuid primary key,
  workspace_id text not null references app_private.workspace_access_controls(workspace_id),
  page_id text not null check (length(page_id) between 1 and 80),
  source_version bigint not null check (source_version>=1),
  source_digest text not null check (source_digest ~ '^sha256:[0-9a-f]{64}$'),
  site_name text not null check (length(site_name) between 1 and 60),
  source_page text not null check (length(source_page) between 1 and 120),
  allowed_origin text not null check (allowed_origin ~ '^https://[a-z0-9][a-z0-9.-]*(:[0-9]+)?$'),
  enabled boolean not null default false,
  published_artifact jsonb,
  artifact_digest text check (artifact_digest ~ '^sha256:[0-9a-f]{64}$'),
  snapshot_id text,
  published_by text,
  published_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (workspace_id, channel_id),
  check (not enabled or (published_artifact is not null and artifact_digest is not null
    and snapshot_id is not null and published_by is not null and published_at is not null))
);
create index website_inquiry_channels_workspace_idx
  on app_private.website_inquiry_channels(workspace_id, created_at, channel_id);
create unique index website_inquiry_channels_active_origin_idx
  on app_private.website_inquiry_channels(workspace_id, allowed_origin) where enabled;

create table app_private.website_inbox (
  channel_id uuid not null,
  request_id uuid not null,
  workspace_id text not null,
  name text not null check (length(name) between 1 and 80 and name=btrim(name)),
  contact text not null check (length(contact) between 1 and 120 and contact=btrim(contact)),
  message text not null check (length(message) between 1 and 500 and message=btrim(message)),
  consent_recorded boolean not null check (consent_recorded),
  client_key text not null check (client_key ~ '^[0-9a-f]{64}$'),
  received_at timestamptz not null default clock_timestamp(),
  primary key (channel_id, request_id),
  foreign key (workspace_id, channel_id)
    references app_private.website_inquiry_channels(workspace_id, channel_id)
);
create index website_inbox_workspace_received_idx
  on app_private.website_inbox(workspace_id, received_at desc, channel_id, request_id);
create index website_inbox_channel_received_idx
  on app_private.website_inbox(channel_id, received_at);
create index website_inbox_client_received_idx
  on app_private.website_inbox(workspace_id, client_key, received_at);

alter table app_private.website_inquiry_channels enable row level security;
alter table app_private.website_inquiry_channels force row level security;
alter table app_private.website_inbox enable row level security;
alter table app_private.website_inbox force row level security;

create policy website_inquiry_channel_read on app_private.website_inquiry_channels
  for select to supermega_trial_backend using (
    workspace_id=current_setting('app.workspace_id',true)
    and app_private.website_review_can('website.write'));
create policy website_inquiry_channel_create on app_private.website_inquiry_channels
  for insert to supermega_trial_backend with check (
    workspace_id=current_setting('app.workspace_id',true)
    and created_by=current_setting('app.actor_id',true)
    and not enabled and published_artifact is null and artifact_digest is null
    and snapshot_id is null and published_by is null and published_at is null
    and app_private.website_review_can('website.write'));
-- No direct UPDATE grant. Only the exact approved-snapshot function below can
-- activate a channel; the page renderer reads that retained immutable artifact.
create policy website_inbox_read on app_private.website_inbox
  for select to supermega_trial_backend using (
    workspace_id=current_setting('app.workspace_id',true)
    and app_private.website_review_can('website.write'));

revoke all on app_private.website_inquiry_channels, app_private.website_inbox
  from public, anon, authenticated, service_role;
grant select, insert on app_private.website_inquiry_channels to supermega_trial_backend;
grant select on app_private.website_inbox to supermega_trial_backend;

-- This function is the single privileged anonymous-ingress operation. It has
-- no arbitrary workspace argument or read response. The private backend must
-- derive client_key using a server HMAC of the verified source address (never
-- accept that value from the browser). It cannot write any other product data.
create function app_private.receive_website_inquiry(
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
  -- All lifecycle operations acquire the workspace budget lock before a channel
  -- row lock. Re-read after waiting so unpublish cannot race a new receipt.
  perform pg_advisory_xact_lock(hashtextextended('website-inquiry:' || channel.workspace_id,0));
  select * into channel from app_private.website_inquiry_channels where channel_id=p_channel for update;
  if not found or not channel.enabled or p_origin is distinct from channel.allowed_origin
    or not app_private.workspace_is_active(channel.workspace_id) then
    raise exception 'website_inquiry_unavailable' using errcode='P0001';
  end if;
  -- One workspace lock prevents multiple channels racing shared privacy/volume
  -- budgets. Clock is read AFTER the lock wait, never from browser timestamps.
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
    consent_recorded,client_key,received_at)
    values(p_channel,p_request,channel.workspace_id,p_name,p_contact,p_message,true,p_client_key,stamp);
  return jsonb_build_object('status','received','requestId',p_request,'duplicate',false);
end;
$$;
revoke all on function app_private.receive_website_inquiry(uuid,uuid,text,text,text,text,boolean,text)
  from public, anon, authenticated, service_role;
grant execute on function app_private.receive_website_inquiry(uuid,uuid,text,text,text,text,boolean,text)
  to supermega_trial_backend;

-- Publish is a separate, explicit authenticated action. The artifact comes only
-- from the managed state row, never from a caller-supplied HTML/JSON snapshot.
create function app_private.publish_website_inquiry_channel(
  p_channel uuid, p_version bigint, p_snapshot text, p_digest text, p_origin text
) returns jsonb language plpgsql security definer set search_path = pg_catalog, app_private as $$
declare channel app_private.website_inquiry_channels%rowtype;
  source app_private.workspace_state%rowtype; snapshot jsonb; approval jsonb;
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
  -- State -> workspace lock -> channel, matching preparation and receive order.
  select * into source from app_private.workspace_state
    where workspace_id=current_setting('app.workspace_id',true) and surface='website' for share;
  perform pg_advisory_xact_lock(hashtextextended('website-inquiry:' || current_setting('app.workspace_id',true),0));
  select * into channel from app_private.website_inquiry_channels
    where channel_id=p_channel and workspace_id=current_setting('app.workspace_id',true) for update;
  if not found or p_version is distinct from channel.source_version or p_origin is distinct from channel.allowed_origin then
    raise exception 'website_inquiry_source_stale' using errcode='40001';
  end if;
  if channel.published_at is not null then
    if not channel.enabled or p_snapshot is distinct from channel.snapshot_id or p_digest is distinct from channel.artifact_digest then
      raise exception 'website_inquiry_source_stale' using errcode='40001';
    end if;
    return jsonb_build_object('channelId',p_channel,'enabled',true,'artifactDigest',channel.artifact_digest);
  end if;
  if source.version is distinct from p_version or channel.source_digest is distinct from
    'sha256:' || encode(sha256(convert_to(app_private.website_review_json(source.state_json),'UTF8')),'hex') then
    raise exception 'website_inquiry_source_stale' using errcode='40001';
  end if;
  select value into snapshot from jsonb_array_elements(source.state_json->'localPublishes') where value->>'id'=p_snapshot;
  select value into approval from jsonb_array_elements(source.state_json->'approvals') where value->>'id'=snapshot->>'approvalId';
  if snapshot is null or approval is null or snapshot->'artifact' is null
    or snapshot->'source' is distinct from approval->'source'
    or snapshot->'source'->'contentRevision' is distinct from source.state_json->'contentRevision'
    or snapshot->'artifact'->'siteName' is distinct from to_jsonb(channel.site_name)
    or not exists(select 1 from jsonb_array_elements(snapshot->'artifact'->'pages') p
      where p->>'id'=channel.page_id and p->>'slug'=channel.source_page)
    or p_digest is distinct from 'sha256:' || encode(sha256(convert_to(
      app_private.website_review_json(snapshot->'artifact'),'UTF8')),'hex') then
    raise exception 'website_inquiry_approval_required' using errcode='22023';
  end if;
  -- One live site per workspace/origin, including when its contact page changes.
  update app_private.website_inquiry_channels set enabled=false
    where workspace_id=channel.workspace_id
      and allowed_origin=channel.allowed_origin and enabled;
  update app_private.website_inquiry_channels set enabled=true,
    published_artifact=snapshot->'artifact', artifact_digest=p_digest, snapshot_id=p_snapshot,
    published_by=current_setting('app.actor_id',true), published_at=clock_timestamp()
    where channel_id=p_channel;
  return jsonb_build_object('channelId',p_channel,'enabled',true,'artifactDigest',p_digest);
end;
$$;

create function app_private.unpublish_website_inquiry_channel(p_channel uuid, p_digest text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, app_private as $$
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
  perform pg_advisory_xact_lock(hashtextextended('website-inquiry:' || current_setting('app.workspace_id',true),0));
  update app_private.website_inquiry_channels set enabled=false
    where channel_id=p_channel and workspace_id=current_setting('app.workspace_id',true) and artifact_digest=p_digest;
  if not found then raise exception 'website_inquiry_source_stale' using errcode='40001'; end if;
  return jsonb_build_object('channelId',p_channel,'enabled',false);
end;
$$;

-- This returns only approved public content. Customer records and draft state
-- are never projected, even if the caller guesses a real disabled channel ID.
create function app_private.read_website_inquiry_page(p_channel uuid, p_origin text)
returns jsonb language sql stable security definer set search_path = pg_catalog, app_private as $$
  select jsonb_build_object('channelId',channel_id,'pageId',page_id,'artifact',published_artifact,'artifactDigest',artifact_digest)
  from app_private.website_inquiry_channels
  where channel_id=p_channel and enabled and allowed_origin=p_origin
    and app_private.workspace_is_active(workspace_id);
$$;
revoke all on function app_private.publish_website_inquiry_channel(uuid,bigint,text,text,text),
  app_private.unpublish_website_inquiry_channel(uuid,text), app_private.read_website_inquiry_page(uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function app_private.publish_website_inquiry_channel(uuid,bigint,text,text,text),
  app_private.unpublish_website_inquiry_channel(uuid,text), app_private.read_website_inquiry_page(uuid,text)
  to supermega_trial_backend;

-- Anonymous visitors never select a workspace or a private object path. Only
-- exact image references in an active approved publication can resolve. The
-- backend receives metadata only, checks bytes, and rechecks this function after
-- storage I/O. Browser roles cannot call it or read the private receipt ledger.
create function app_private.read_website_published_media(p_channel uuid, p_origin text, p_asset text)
returns jsonb language sql stable security definer set search_path = pg_catalog, app_private as $$
  select jsonb_build_object('workspaceId',c.workspace_id,'assetId',p_asset,
    'artifactDigest',c.artifact_digest,'receipt',e.result_json)
  from app_private.website_inquiry_channels c
  join app_private.workspace_events e on e.workspace_id=c.workspace_id
    and e.surface='website' and e.event_type='website.media.uploaded'
    and e.result_json->>'assetId'=p_asset
    and e.result_json->>'sha256'=left(p_asset,64)
    and e.result_json->>'visibility'='private'
    and e.result_json->>'contentType'='image/webp'
  where c.channel_id=p_channel and c.enabled and c.allowed_origin=p_origin
    and p_asset ~ '^[a-f0-9]{64}\.webp$'
    and app_private.workspace_is_active(c.workspace_id)
    and exists (
      select 1 from jsonb_array_elements(c.published_artifact->'pages') page
      cross join lateral jsonb_array_elements(page->'sections') section
      where section->'image'->>'assetId'=p_asset
    )
  order by e.created_at,e.event_id limit 1;
$$;
revoke all on function app_private.read_website_published_media(uuid,text,text)
  from public, anon, authenticated, service_role;
grant execute on function app_private.read_website_published_media(uuid,text,text)
  to supermega_trial_backend;
commit;
