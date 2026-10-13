-- A buyer can submit to an explicitly published storefront without a workspace
-- account. Only the backend role can resolve the opaque handle or write intake.
-- Publication and revocation remain authenticated commerce.write operations.
begin;

create table app_private.commerce_public_storefronts (
  handle uuid primary key,
  workspace_id text not null references app_private.workspace_access_controls(workspace_id),
  enabled boolean not null default true,
  source_version bigint not null check (source_version >= 1),
  source_revision bigint not null check (source_revision >= 1),
  source_action_id text not null check (length(source_action_id) between 1 and 160),
  source_catalog_digest text not null check (source_catalog_digest ~ '^sha256:[0-9a-f]{64}$'),
  preview_digest text not null check (preview_digest ~ '^sha256:[0-9a-f]{64}$'),
  published_by text not null,
  published_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  check ((enabled and revoked_at is null) or (not enabled and revoked_at is not null)),
  unique (workspace_id, handle)
);
create unique index commerce_public_storefront_one_active
  on app_private.commerce_public_storefronts(workspace_id) where enabled;

create table app_private.commerce_public_requests (
  handle uuid not null,
  request_id uuid not null,
  workspace_id text not null,
  request_json jsonb not null check (jsonb_typeof(request_json) = 'object'),
  input_fingerprint text not null check (input_fingerprint ~ '^[0-9a-f]{64}$'),
  client_key text not null check (client_key ~ '^[0-9a-f]{64}$'),
  received_at timestamptz not null default clock_timestamp(),
  primary key (handle, request_id),
  foreign key (workspace_id, handle)
    references app_private.commerce_public_storefronts(workspace_id, handle)
);
create index commerce_public_requests_workspace_time
  on app_private.commerce_public_requests(workspace_id, received_at desc, handle, request_id);
create index commerce_public_requests_client_time
  on app_private.commerce_public_requests(workspace_id, client_key, received_at);
create index commerce_public_requests_handle_time
  on app_private.commerce_public_requests(handle, received_at);

alter table app_private.commerce_public_storefronts enable row level security;
alter table app_private.commerce_public_storefronts force row level security;
alter table app_private.commerce_public_requests enable row level security;
alter table app_private.commerce_public_requests force row level security;

create policy commerce_public_storefront_member_read on app_private.commerce_public_storefronts
  for select to supermega_trial_backend using (
    workspace_id = current_setting('app.workspace_id', true)
    and app_private.website_review_can('commerce.write'));
create policy commerce_public_storefront_member_insert on app_private.commerce_public_storefronts
  for insert to supermega_trial_backend with check (
    workspace_id = current_setting('app.workspace_id', true)
    and published_by = current_setting('app.actor_id', true)
    and enabled and revoked_at is null
    and app_private.website_review_can('commerce.write'));
create policy commerce_public_storefront_member_update on app_private.commerce_public_storefronts
  for update to supermega_trial_backend using (
    workspace_id = current_setting('app.workspace_id', true)
    and app_private.website_review_can('commerce.write'))
  with check (
    workspace_id = current_setting('app.workspace_id', true)
    and not enabled and revoked_at is not null
    and app_private.website_review_can('commerce.write'));
create policy commerce_public_request_member_read on app_private.commerce_public_requests
  for select to supermega_trial_backend using (
    workspace_id = current_setting('app.workspace_id', true)
    and app_private.website_review_can('commerce.write'));

revoke all on app_private.commerce_public_storefronts, app_private.commerce_public_requests
  from public, anon, authenticated, service_role;
grant select, insert, update on app_private.commerce_public_storefronts to supermega_trial_backend;
grant select on app_private.commerce_public_requests to supermega_trial_backend;

-- The backend receives private state while holding the binding and Commerce
-- row locks in one transaction. It projects only the catalog into HTTP output.
-- Neither this function nor its response is available to browser SQL roles.
create function app_private.read_commerce_public_source(p_handle uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, app_private as $$
declare binding app_private.commerce_public_storefronts%rowtype;
  source app_private.workspace_state%rowtype;
begin
  select * into binding from app_private.commerce_public_storefronts
    where handle = p_handle for share;
  if not found or not binding.enabled or not app_private.workspace_is_active(binding.workspace_id) then
    return null;
  end if;
  select * into source from app_private.workspace_state
    where workspace_id = binding.workspace_id and surface = 'commerce' for share;
  if not found then return null; end if;
  return jsonb_build_object(
    'workspaceId', binding.workspace_id,
    'sourceRevision', binding.source_revision,
    'sourceActionId', binding.source_action_id,
    'sourceCatalogDigest', binding.source_catalog_digest,
    'previewDigest', binding.preview_digest,
    'state', source.state_json);
end;
$$;

-- A single purpose writer. The runtime first validates the request against the
-- locked source state and builds the quote itself. This function performs only
-- durable deduplication and bounded intake; it never confirms an order, reserves
-- stock, sends a message, or creates a payment.
create function app_private.receive_commerce_public_request(
  p_handle uuid, p_request uuid, p_fingerprint text, p_request_json jsonb,
  p_client_key text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, app_private as $$
declare binding app_private.commerce_public_storefronts%rowtype;
  previous app_private.commerce_public_requests%rowtype;
  stamp timestamptz;
begin
  if p_request is null or p_fingerprint !~ '^[0-9a-f]{64}$'
    or p_client_key !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_request_json) is distinct from 'object'
    or p_request_json->>'id' is distinct from 'ECR-' || upper(p_request::text) then
    raise exception 'commerce_public_invalid' using errcode = '22023';
  end if;
  select * into binding from app_private.commerce_public_storefronts
    where handle = p_handle for share;
  if not found or not binding.enabled or not app_private.workspace_is_active(binding.workspace_id) then
    raise exception 'commerce_public_unavailable' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('commerce-public:' || p_handle::text, 0));
  stamp := clock_timestamp();
  select * into previous from app_private.commerce_public_requests
    where handle = p_handle and request_id = p_request;
  if found then
    if previous.input_fingerprint is distinct from p_fingerprint then
      raise exception 'commerce_public_retry_conflict' using errcode = 'P0001';
    end if;
    return jsonb_build_object('status', 'received', 'requestId', p_request, 'duplicate', true);
  end if;
  if (select count(*) from app_private.commerce_public_requests
      where workspace_id = binding.workspace_id and client_key = p_client_key
        and received_at > stamp - interval '10 minutes') >= 6
    or (select count(*) from app_private.commerce_public_requests
      where handle = p_handle and received_at > stamp - interval '1 hour') >= 200
    or (select count(*) from app_private.commerce_public_requests
      where workspace_id = binding.workspace_id and received_at > stamp - interval '1 day') >= 500
    or (select count(*) from app_private.commerce_public_requests
      where workspace_id = binding.workspace_id) >= 10000 then
    raise exception 'commerce_public_capacity' using errcode = 'P0001';
  end if;
  insert into app_private.commerce_public_requests(
    handle, request_id, workspace_id, request_json, input_fingerprint, client_key, received_at)
    values (p_handle, p_request, binding.workspace_id, p_request_json,
      p_fingerprint, p_client_key, stamp);
  return jsonb_build_object('status', 'received', 'requestId', p_request, 'duplicate', false);
end;
$$;

-- A retry may arrive after a quote or catalog changes. Return only the prior
-- acknowledgement for the same submitted input; never disclose its contents.
create function app_private.replay_commerce_public_request(
  p_handle uuid, p_request uuid, p_fingerprint text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, app_private as $$
declare previous app_private.commerce_public_requests%rowtype;
begin
  if p_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'commerce_public_invalid' using errcode = '22023';
  end if;
  select r.* into previous from app_private.commerce_public_requests r
    join app_private.commerce_public_storefronts s on s.handle = r.handle
    where r.handle = p_handle and r.request_id = p_request and s.enabled
      and app_private.workspace_is_active(s.workspace_id);
  if not found then return null; end if;
  if previous.input_fingerprint is distinct from p_fingerprint then
    raise exception 'commerce_public_retry_conflict' using errcode = 'P0001';
  end if;
  return jsonb_build_object('status', 'received', 'requestId', p_request, 'duplicate', true);
end;
$$;

revoke all on function app_private.read_commerce_public_source(uuid),
  app_private.receive_commerce_public_request(uuid,uuid,text,jsonb,text),
  app_private.replay_commerce_public_request(uuid,uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function app_private.read_commerce_public_source(uuid),
  app_private.receive_commerce_public_request(uuid,uuid,text,jsonb,text),
  app_private.replay_commerce_public_request(uuid,uuid,text)
  to supermega_trial_backend;
commit;
