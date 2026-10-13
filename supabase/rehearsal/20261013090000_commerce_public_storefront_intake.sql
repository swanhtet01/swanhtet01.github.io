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
  shop_request_id text not null
    check (shop_request_id ~ '^ECR-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$'),
  request_json jsonb not null check (jsonb_typeof(request_json) = 'object'),
  contact_json jsonb not null check (jsonb_typeof(contact_json) = 'object'),
  input_fingerprint text not null check (input_fingerprint ~ '^[0-9a-f]{64}$'),
  client_key text not null check (client_key ~ '^[0-9a-f]{64}$'),
  received_at timestamptz not null default clock_timestamp(),
  status text not null default 'received'
    check (status in ('received', 'in_review', 'in_shop', 'closed')),
  close_reason text check (close_reason in
    ('customer_withdrew', 'no_response', 'stock_unavailable', 'spam_or_duplicate', 'other')),
  closed_by text,
  closed_at timestamptz,
  redacted_at timestamptz,
  check ((status = 'closed') = (close_reason is not null and closed_by is not null and closed_at is not null)),
  check (redacted_at is null or (status = 'closed' and redacted_at >= closed_at)),
  primary key (handle, request_id),
  unique (workspace_id, shop_request_id),
  foreign key (workspace_id, handle)
    references app_private.commerce_public_storefronts(workspace_id, handle)
);
create index commerce_public_requests_workspace_time
  on app_private.commerce_public_requests(workspace_id, received_at desc, handle, request_id);
create index commerce_public_requests_client_time
  on app_private.commerce_public_requests(workspace_id, client_key, received_at);
create index commerce_public_requests_handle_time
  on app_private.commerce_public_requests(handle, received_at);
create index commerce_public_requests_redaction_due
  on app_private.commerce_public_requests(closed_at, handle, request_id)
  where status = 'closed' and redacted_at is null;

create table app_private.commerce_public_redaction_runs (
  run_id uuid primary key,
  ran_at timestamptz not null default clock_timestamp(),
  redacted_count integer not null check (redacted_count between 0 and 500),
  max_rows integer not null check (max_rows between 1 and 500)
);

alter table app_private.commerce_public_storefronts enable row level security;
alter table app_private.commerce_public_storefronts force row level security;
alter table app_private.commerce_public_requests enable row level security;
alter table app_private.commerce_public_requests force row level security;
alter table app_private.commerce_public_redaction_runs enable row level security;
alter table app_private.commerce_public_redaction_runs force row level security;

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

revoke all on app_private.commerce_public_storefronts, app_private.commerce_public_requests,
  app_private.commerce_public_redaction_runs
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
  p_handle uuid, p_request uuid, p_shop_request_id text,
  p_fingerprint text, p_request_json jsonb,
  p_contact_json jsonb,
  p_client_key text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, app_private as $$
declare binding app_private.commerce_public_storefronts%rowtype;
  previous app_private.commerce_public_requests%rowtype;
  stamp timestamptz;
begin
  if p_request is null or p_fingerprint !~ '^[0-9a-f]{64}$'
    or p_shop_request_id is null
    or p_shop_request_id !~ '^ECR-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$'
    or p_client_key !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_request_json) is distinct from 'object'
    or p_request_json->>'id' is distinct from 'ECR-' || upper(p_request::text)
    or p_request_json->>'customerReference' is distinct from
      'Web request ' || upper(substr(p_request::text, 1, 8))
    or p_request_json ? 'customerProfile' or p_request_json ? 'deliveryAddress'
    or p_request_json->'quote' ? 'customerProfile'
    or p_request_json->'quote' ? 'deliveryAddress'
    or jsonb_typeof(p_contact_json) is distinct from 'object'
    or not (p_contact_json ? 'name' and p_contact_json ? 'phone' and p_contact_json ? 'address')
    or p_contact_json - 'name' - 'phone' - 'address' <> '{}'::jsonb
    or jsonb_typeof(p_contact_json->'name') is distinct from 'string'
    or jsonb_typeof(p_contact_json->'phone') is distinct from 'string'
    or octet_length(p_contact_json::text) > 1200 then
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
    if previous.status = 'closed' then
      raise exception 'commerce_public_request_closed' using errcode = 'P0001';
    end if;
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
      where workspace_id = binding.workspace_id and status <> 'closed') >= 10000 then
    raise exception 'commerce_public_capacity' using errcode = 'P0001';
  end if;
  insert into app_private.commerce_public_requests(
    handle, request_id, workspace_id, shop_request_id, request_json, contact_json,
    input_fingerprint, client_key, received_at)
    values (p_handle, p_request, binding.workspace_id, p_shop_request_id,
      p_request_json, p_contact_json,
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
  if previous.status = 'closed' then
    raise exception 'commerce_public_request_closed' using errcode = 'P0001';
  end if;
  if previous.input_fingerprint is distinct from p_fingerprint then
    raise exception 'commerce_public_retry_conflict' using errcode = 'P0001';
  end if;
  return jsonb_build_object('status', 'received', 'requestId', p_request, 'duplicate', true);
end;
$$;

-- Reserve before writing to Shop. Closure and review compete on the same row;
-- an uncertain Shop acknowledgement leaves the request retryable in_review.
create function app_private.reserve_commerce_public_request(
  p_workspace text, p_handle uuid, p_request uuid
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, app_private as $$
declare item app_private.commerce_public_requests%rowtype;
begin
  if p_workspace is distinct from current_setting('app.workspace_id', true)
    or current_setting('app.actor_kind', true) <> 'human'
    or not app_private.website_review_can('commerce.write') then
    raise exception 'commerce_public_denied' using errcode = '42501';
  end if;
  select * into item from app_private.commerce_public_requests
    where workspace_id = p_workspace and handle = p_handle and request_id = p_request
    for update;
  if not found or item.status = 'closed' or item.redacted_at is not null then
    raise exception 'commerce_public_unavailable' using errcode = 'P0001';
  end if;
  if item.status = 'received' then
    update app_private.commerce_public_requests set status = 'in_review'
      where workspace_id = p_workspace and handle = p_handle and request_id = p_request;
  end if;
  return jsonb_build_object('status', item.status, 'request', item.request_json);
end;
$$;

create function app_private.complete_commerce_public_request_claim(
  p_workspace text, p_handle uuid, p_request uuid
) returns boolean language plpgsql security definer
set search_path = pg_catalog, app_private as $$
begin
  if p_workspace is distinct from current_setting('app.workspace_id', true)
    or current_setting('app.actor_kind', true) <> 'human'
    or not app_private.website_review_can('commerce.write') then
    raise exception 'commerce_public_denied' using errcode = '42501';
  end if;
  update app_private.commerce_public_requests set status = 'in_shop'
    where workspace_id = p_workspace and handle = p_handle and request_id = p_request
      and status in ('in_review', 'in_shop');
  if not found then
    raise exception 'commerce_public_claim_state' using errcode = 'P0001';
  end if;
  return true;
end;
$$;

create function app_private.inspect_commerce_public_request(
  p_workspace text, p_handle uuid, p_request uuid
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, app_private as $$
declare item app_private.commerce_public_requests%rowtype;
begin
  if p_workspace is distinct from current_setting('app.workspace_id', true)
    or current_setting('app.actor_kind', true) <> 'human'
    or not app_private.website_review_can('commerce.write') then
    raise exception 'commerce_public_denied' using errcode = '42501';
  end if;
  select * into item from app_private.commerce_public_requests
    where workspace_id = p_workspace and handle = p_handle and request_id = p_request
    for update;
  if not found then
    raise exception 'commerce_public_unavailable' using errcode = 'P0001';
  end if;
  return jsonb_build_object('status', item.status, 'shopRequestId', item.shop_request_id);
end;
$$;

create function app_private.close_commerce_public_request(
  p_workspace text, p_handle uuid, p_request uuid, p_reason text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, app_private as $$
declare item app_private.commerce_public_requests%rowtype;
  actor text;
  shop_state jsonb;
begin
  actor := current_setting('app.actor_id', true);
  if p_workspace is distinct from current_setting('app.workspace_id', true)
    or current_setting('app.actor_kind', true) <> 'human'
    or actor is null or actor = ''
    or not app_private.website_review_can('commerce.write') then
    raise exception 'commerce_public_denied' using errcode = '42501';
  end if;
  if p_reason not in ('customer_withdrew', 'no_response', 'stock_unavailable',
                     'spam_or_duplicate', 'other') or p_reason is null then
    raise exception 'commerce_public_invalid' using errcode = '22023';
  end if;
  select * into item from app_private.commerce_public_requests
    where workspace_id = p_workspace and handle = p_handle and request_id = p_request
    for update;
  if not found then
    raise exception 'commerce_public_unavailable' using errcode = 'P0001';
  end if;
  if item.status = 'closed' then
    if item.close_reason is distinct from p_reason or item.closed_by is distinct from actor then
      raise exception 'commerce_public_close_conflict' using errcode = 'P0001';
    end if;
    return jsonb_build_object('status', 'closed', 'duplicate', true);
  end if;
  if item.status in ('in_review', 'in_shop') then
    -- The Shop event commits before this private-row transition. A retry after
    -- an uncertain acknowledgement can finish the transition, but an order or
    -- an arbitrary caller cannot silently erase an actionable request.
    select state_json into shop_state from app_private.workspace_state
      where workspace_id = p_workspace and surface = 'commerce' for share;
    if shop_state is null
      or exists (select 1 from jsonb_array_elements(
          coalesce(shop_state->'storefrontRequests', '[]'::jsonb)) request
          where request->>'id' = item.shop_request_id)
      or exists (select 1 from jsonb_array_elements(
          coalesce(shop_state->'orders', '[]'::jsonb)) shop_order
          where shop_order->>'sourceRecordId' = item.shop_request_id)
      or not exists (select 1 from app_private.workspace_events event
          where event.workspace_id = p_workspace
            and event.surface = 'commerce'
            and event.event_type = 'commerce.storefront_request.closed'
            and event.actor_id = actor and event.actor_kind = 'human'
            and event.payload_json #>> '{evidence,reason}' = p_reason
            and event.payload_json #>> '{evidence,evidenceReference}' =
                'ECOMMERCE-CLOSE:' || item.shop_request_id || ':' || p_reason) then
      raise exception 'commerce_public_close_state' using errcode = 'P0001';
    end if;
  elsif item.status <> 'received' then
    raise exception 'commerce_public_close_state' using errcode = 'P0001';
  end if;
  update app_private.commerce_public_requests
    set status = 'closed', close_reason = p_reason, closed_by = actor,
        closed_at = clock_timestamp()
    where workspace_id = p_workspace and handle = p_handle and request_id = p_request;
  return jsonb_build_object('status', 'closed', 'duplicate', false);
end;
$$;

-- Keep only an opaque request-ID tombstone to reject old retries. Erase the
-- contact-bearing JSON, input fingerprint and IP-derived abuse key.
create function app_private.commerce_public_redaction_due_count(p_cap integer)
returns integer language plpgsql security definer
set search_path = pg_catalog, app_private as $$
declare due_count integer;
begin
  if p_cap not between 1 and 500 then
    raise exception 'commerce_public_invalid' using errcode = '22023';
  end if;
  select count(*) into due_count from (
    select 1 from app_private.commerce_public_requests
    where status = 'closed' and redacted_at is null
      and closed_at <= clock_timestamp() - interval '30 days'
    limit p_cap
  ) due;
  return due_count;
end;
$$;

create function app_private.redact_closed_commerce_public_requests(
  p_run uuid, p_limit integer
) returns integer language plpgsql security definer
set search_path = pg_catalog, app_private as $$
declare prior integer;
  changed integer;
begin
  if p_run is null or p_limit not between 1 and 500 then
    raise exception 'commerce_public_invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('commerce-public-redaction:' || p_run::text, 0));
  select redacted_count into prior from app_private.commerce_public_redaction_runs
    where run_id = p_run for update;
  if found then return prior; end if;
  with due as (
    select handle, request_id from app_private.commerce_public_requests
    where status = 'closed' and redacted_at is null
      and closed_at <= clock_timestamp() - interval '30 days'
    order by closed_at, handle, request_id
    for update skip locked limit p_limit
  )
  update app_private.commerce_public_requests item
    set request_json = '{}'::jsonb, contact_json = '{}'::jsonb,
        input_fingerprint = repeat('0', 64),
        client_key = repeat('0', 64),
        redacted_at = clock_timestamp()
    from due where item.handle = due.handle and item.request_id = due.request_id;
  get diagnostics changed = row_count;
  insert into app_private.commerce_public_redaction_runs(run_id, redacted_count, max_rows)
    values (p_run, changed, p_limit);
  return changed;
end;
$$;

revoke all on function app_private.read_commerce_public_source(uuid),
  app_private.receive_commerce_public_request(uuid,uuid,text,text,jsonb,jsonb,text),
  app_private.replay_commerce_public_request(uuid,uuid,text),
  app_private.reserve_commerce_public_request(text,uuid,uuid),
  app_private.complete_commerce_public_request_claim(text,uuid,uuid),
  app_private.inspect_commerce_public_request(text,uuid,uuid),
  app_private.close_commerce_public_request(text,uuid,uuid,text),
  app_private.commerce_public_redaction_due_count(integer),
  app_private.redact_closed_commerce_public_requests(uuid,integer)
  from public, anon, authenticated, service_role;
grant execute on function app_private.read_commerce_public_source(uuid),
  app_private.receive_commerce_public_request(uuid,uuid,text,text,jsonb,jsonb,text),
  app_private.replay_commerce_public_request(uuid,uuid,text),
  app_private.reserve_commerce_public_request(text,uuid,uuid),
  app_private.complete_commerce_public_request_claim(text,uuid,uuid),
  app_private.inspect_commerce_public_request(text,uuid,uuid),
  app_private.close_commerce_public_request(text,uuid,uuid,text),
  app_private.commerce_public_redaction_due_count(integer),
  app_private.redact_closed_commerce_public_requests(uuid,integer)
  to supermega_trial_backend;
commit;
