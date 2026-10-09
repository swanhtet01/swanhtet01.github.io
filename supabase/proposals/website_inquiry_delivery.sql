-- Candidate extension, NOT in the deployment migration chain.
-- Exercise on disposable PostgreSQL before generating/reviewing its migration.
-- Public HTTP requests may call only the narrow receive function through the
-- backend. No browser role can read channels, customer data or workspace state.
begin;

create table app_private.website_inquiry_channels (
  channel_id uuid primary key,
  workspace_id text not null references app_private.workspace_access_controls(workspace_id),
  page_id text not null check (length(page_id) between 1 and 80),
  source_version bigint not null check (source_version>=1),
  site_name text not null check (length(site_name) between 1 and 60),
  source_page text not null check (length(source_page) between 1 and 120),
  allowed_origin text not null check (allowed_origin ~ '^https://[a-z0-9][a-z0-9.-]*(:[0-9]+)?$'),
  enabled boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (workspace_id, channel_id)
);
create index website_inquiry_channels_workspace_idx
  on app_private.website_inquiry_channels(workspace_id, created_at, channel_id);

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
    and not enabled and app_private.website_review_can('website.write'));
-- Activation is intentionally absent until the public-page release binding is
-- implemented. Ordinary editors cannot turn an arbitrary draft into a public form.
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
  select * into channel from app_private.website_inquiry_channels
    where channel_id=p_channel for update;
  if not found or not channel.enabled or p_origin is distinct from channel.allowed_origin
    or not app_private.workspace_is_active(channel.workspace_id) then
    raise exception 'website_inquiry_unavailable' using errcode='P0001';
  end if;
  -- One workspace lock prevents multiple channels racing shared privacy/volume
  -- budgets. Clock is read AFTER the lock wait, never from browser timestamps.
  perform pg_advisory_xact_lock(hashtextextended('website-inquiry:' || channel.workspace_id,0));
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
commit;
