-- One tenant-proven hostname for one approved Sites channel. Public reads use
-- this binding, never a visitor-selected workspace or channel identifier.
begin;

create table app_private.website_domain_bindings (
  binding_id uuid primary key,
  hostname text not null check (length(hostname) between 4 and 253
    and hostname ~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]$'),
  workspace_id text not null references app_private.workspace_access_controls(workspace_id),
  channel_id uuid not null,
  challenge text not null check (challenge ~ '^supermega-domain=v1:[A-Za-z0-9_-]{32,64}$'),
  state text not null default 'pending' check (state in ('pending','active','releasing','released')),
  verified_until timestamptz,
  last_verified_at timestamptz,
  dns_record jsonb,
  issue text not null default '' check (issue ~ '^[a-z_]{0,40}$'),
  created_by text not null,
  created_at timestamptz not null default clock_timestamp(),
  released_at timestamptz,
  foreign key (workspace_id,channel_id)
    references app_private.website_inquiry_channels(workspace_id,channel_id),
  check ((state='active' and verified_until is not null and last_verified_at is not null)
    or state<>'active'),
  check (state<>'released' or released_at is not null)
);
-- The partial indexes are the concurrency arbiter; historic released claims do
-- not prevent a new tenant from presenting a fresh DNS challenge.
create unique index website_domain_live_hostname_idx
  on app_private.website_domain_bindings(hostname) where state<>'released';
create unique index website_domain_live_workspace_idx
  on app_private.website_domain_bindings(workspace_id) where state<>'released';
create index website_domain_workspace_history_idx
  on app_private.website_domain_bindings(workspace_id,created_at desc,binding_id);

alter table app_private.website_domain_bindings enable row level security;
alter table app_private.website_domain_bindings force row level security;
create policy website_domain_binding_read on app_private.website_domain_bindings
  for select to supermega_trial_backend using (
    workspace_id=current_setting('app.workspace_id',true)
    and app_private.website_review_can('website.write'));
revoke all on app_private.website_domain_bindings from public,anon,authenticated,service_role;
grant select on app_private.website_domain_bindings to supermega_trial_backend;

create function app_private.claim_website_domain(
  p_binding uuid,p_hostname text,p_channel uuid,p_challenge text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,app_private as $$
declare current_claim app_private.website_domain_bindings%rowtype;
  workspace text := current_setting('app.workspace_id',true);
begin
  if p_binding is null or p_channel is null or p_hostname is null
    or length(p_hostname) not between 4 and 253
    or p_hostname !~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]$'
    or p_challenge is null
    or p_challenge !~ '^supermega-domain=v1:[A-Za-z0-9_-]{32,64}$' then
    raise exception 'website_domain_invalid' using errcode='22023';
  end if;
  if app_private.website_review_can('website.write') is distinct from true
    or app_private.workspace_is_active(workspace) is distinct from true then
    raise exception 'website_domain_access_denied' using errcode='42501';
  end if;
  perform 1 from app_private.website_inquiry_channels
    where workspace_id=workspace and channel_id=p_channel for share;
  if not found then
    raise exception 'website_domain_channel_missing' using errcode='P0001';
  end if;
  -- Serialise competing claims for one hostname and one workspace before
  -- checking both uniqueness dimensions; indexes remain the final backstop.
  perform pg_advisory_xact_lock(hashtextextended('website-domain:' || p_hostname,0));
  perform pg_advisory_xact_lock(hashtextextended('website-domain-workspace:' || workspace,0));
  select * into current_claim from app_private.website_domain_bindings
    where hostname=p_hostname and state<>'released' for update;
  if found then
    if current_claim.workspace_id=workspace and current_claim.channel_id=p_channel
      and current_claim.state in ('pending','active') then
      return jsonb_build_object('bindingId',current_claim.binding_id,'replay',true);
    end if;
    raise exception 'website_domain_conflict' using errcode='23505';
  end if;
  perform 1 from app_private.website_domain_bindings
    where workspace_id=workspace and state<>'released' for update;
  if found then
    raise exception 'website_domain_conflict' using errcode='23505';
  end if;
  insert into app_private.website_domain_bindings
    (binding_id,hostname,workspace_id,channel_id,challenge,created_by)
    values(p_binding,p_hostname,workspace,p_channel,p_challenge,current_setting('app.actor_id',true));
  return jsonb_build_object('bindingId',p_binding,'replay',false);
end;
$$;

-- Only the server can report an external check, and a released claim can never
-- be revived by a late provider response. An active lease is at most 48 hours.
create function app_private.record_website_domain_check(
  p_binding uuid,p_challenge text,p_verified boolean,p_dns jsonb,p_issue text
) returns void language plpgsql security definer
set search_path=pg_catalog,app_private as $$
declare workspace text := current_setting('app.workspace_id',true);
begin
  if app_private.website_review_can('website.write') is distinct from true
    or app_private.workspace_is_active(workspace) is distinct from true
    or p_issue is null or p_issue !~ '^[a-z_]{0,40}$'
    or (p_dns is not null and (jsonb_typeof(p_dns)<>'object'
      or coalesce(p_dns->>'type','') not in ('A','CNAME')
      or p_dns->>'name' is null or length(p_dns->>'name') not between 4 and 253
      or p_dns->>'value' is null or length(p_dns->>'value') not between 1 and 253)) then
    raise exception 'website_domain_invalid' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('website-inquiry:' || workspace,0));
  update app_private.website_domain_bindings b set
    state=case when p_verified and c.enabled then 'active' else 'pending' end,
    verified_until=case when p_verified and c.enabled then clock_timestamp()+interval '24 hours' else null end,
    last_verified_at=case when p_verified and c.enabled then clock_timestamp() else b.last_verified_at end,
    dns_record=p_dns,issue=p_issue
    from app_private.website_inquiry_channels c
    where b.binding_id=p_binding and b.workspace_id=workspace and b.state in ('pending','active')
      and b.challenge=p_challenge and c.workspace_id=b.workspace_id and c.channel_id=b.channel_id;
  if not found then raise exception 'website_domain_changed' using errcode='40001'; end if;
end;
$$;

create function app_private.begin_website_domain_release(p_hostname text)
returns void language plpgsql security definer
set search_path=pg_catalog,app_private as $$
declare workspace text := current_setting('app.workspace_id',true);
begin
  if app_private.website_review_can('website.write') is distinct from true
    or app_private.workspace_is_active(workspace) is distinct from true then
    raise exception 'website_domain_access_denied' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('website-inquiry:' || workspace,0));
  update app_private.website_domain_bindings set state='releasing',verified_until=null,
    issue='provider_cleanup_pending'
    where hostname=p_hostname and workspace_id=workspace and state<>'released';
  if not found then raise exception 'website_domain_changed' using errcode='40001'; end if;
end;
$$;

-- Only after provider detachment succeeds may the global hostname reservation
-- be freed. A failed external call leaves a safe, retryable releasing claim.
create function app_private.finish_website_domain_release(p_hostname text)
returns void language plpgsql security definer
set search_path=pg_catalog,app_private as $$
declare workspace text := current_setting('app.workspace_id',true);
begin
  if app_private.website_review_can('website.write') is distinct from true
    or app_private.workspace_is_active(workspace) is distinct from true then
    raise exception 'website_domain_access_denied' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('website-inquiry:' || workspace,0));
  update app_private.website_domain_bindings set state='released',verified_until=null,
    released_at=clock_timestamp(),issue=''
    where hostname=p_hostname and workspace_id=workspace and state='releasing';
  if not found then raise exception 'website_domain_changed' using errcode='40001'; end if;
end;
$$;

create function app_private.read_website_domain_page(p_hostname text)
returns jsonb language sql stable security definer set search_path=pg_catalog,app_private as $$
  select app_private.read_website_inquiry_page(c.channel_id,c.allowed_origin)
  from app_private.website_domain_bindings b
  join app_private.website_inquiry_channels c
    on c.workspace_id=b.workspace_id and c.channel_id=b.channel_id
  where b.hostname=p_hostname and b.state='active'
    and b.verified_until>now() and c.enabled
    and app_private.workspace_is_active(b.workspace_id);
$$;

create function app_private.read_website_domain_media(p_hostname text,p_asset text)
returns jsonb language sql stable security definer set search_path=pg_catalog,app_private as $$
  select app_private.read_website_published_media(c.channel_id,c.allowed_origin,p_asset)
  from app_private.website_domain_bindings b
  join app_private.website_inquiry_channels c
    on c.workspace_id=b.workspace_id and c.channel_id=b.channel_id
  where b.hostname=p_hostname and b.state='active'
    and b.verified_until>now() and c.enabled
    and app_private.workspace_is_active(b.workspace_id);
$$;

-- Ingress acquires the same workspace budget lock before the binding row, so
-- release and customer acknowledgements have one unambiguous order.
create function app_private.receive_website_domain_inquiry(
  p_hostname text,p_request uuid,p_name text,p_contact text,p_message text,
  p_consent boolean,p_client_key text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,app_private as $$
declare binding app_private.website_domain_bindings%rowtype;
  channel app_private.website_inquiry_channels%rowtype;
  initial_workspace text;
begin
  select * into binding from app_private.website_domain_bindings
    where hostname=p_hostname and state='active';
  if not found then raise exception 'website_inquiry_unavailable' using errcode='P0001'; end if;
  initial_workspace := binding.workspace_id;
  perform pg_advisory_xact_lock(hashtextextended('website-inquiry:' || initial_workspace,0));
  select * into binding from app_private.website_domain_bindings
    where hostname=p_hostname and state='active' for update;
  if not found or binding.workspace_id<>initial_workspace
    or binding.verified_until<=clock_timestamp() then
    raise exception 'website_inquiry_unavailable' using errcode='P0001';
  end if;
  select * into channel from app_private.website_inquiry_channels
    where workspace_id=binding.workspace_id and channel_id=binding.channel_id;
  if not found or not channel.enabled then
    raise exception 'website_inquiry_unavailable' using errcode='P0001';
  end if;
  return app_private.receive_website_inquiry(channel.channel_id,p_request,channel.allowed_origin,
    p_name,p_contact,p_message,p_consent,p_client_key);
end;
$$;

revoke all on function app_private.claim_website_domain(uuid,text,uuid,text),
  app_private.record_website_domain_check(uuid,text,boolean,jsonb,text),
  app_private.begin_website_domain_release(text),
  app_private.finish_website_domain_release(text),app_private.read_website_domain_page(text),
  app_private.read_website_domain_media(text,text),
  app_private.receive_website_domain_inquiry(text,uuid,text,text,text,boolean,text)
  from public,anon,authenticated,service_role;
grant execute on function app_private.claim_website_domain(uuid,text,uuid,text),
  app_private.record_website_domain_check(uuid,text,boolean,jsonb,text),
  app_private.begin_website_domain_release(text),
  app_private.finish_website_domain_release(text),app_private.read_website_domain_page(text),
  app_private.read_website_domain_media(text,text),
  app_private.receive_website_domain_inquiry(text,uuid,text,text,text,boolean,text)
  to supermega_trial_backend;
commit;
