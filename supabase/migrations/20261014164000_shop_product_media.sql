-- Candidate managed Shop photo binding. No browser or public storefront grants.
begin;

-- Immutable upload receipts remain in workspace_events. This ledger describes
-- physical private objects, including uploads that never reached a binding.
-- Quota is charged until confirmed deletion, not until a SKU is unbound.
create table app_private.shop_media_assets (
  workspace_id text not null references app_private.workspace_access_controls(workspace_id),
  asset_id text not null check (asset_id ~ '^[0-9a-f]{64}\.webp$'),
  -- A restored digest receives a new physical key. Delayed deletion of the
  -- old key can never remove the new live image.
  object_key text not null check (object_key ~ '^[0-9a-f]{32}$'),
  byte_size integer not null check (byte_size between 1 and 2097152),
  state text not null check (state in ('pending', 'live', 'retiring', 'deleted')),
  lease_token text,
  lease_until timestamptz,
  collect_after timestamptz,
  updated_by text not null check (length(btrim(updated_by)) > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (workspace_id, asset_id),
  unique (workspace_id, object_key),
  check ((state in ('pending', 'retiring') and lease_token is not null and lease_until is not null)
    or (state in ('live', 'deleted') and lease_token is null and lease_until is null)),
  check (state = 'live' or collect_after is null)
);
create index shop_media_assets_collect_idx
  on app_private.shop_media_assets(workspace_id, collect_after, lease_until)
  where state <> 'deleted';

create table app_private.shop_product_media (
  workspace_id text not null references app_private.workspace_access_controls(workspace_id),
  sku text not null check (length(sku) between 1 and 160
    and sku = btrim(sku) and sku !~ '[[:cntrl:]]'),
  catalog_fingerprint text not null check (catalog_fingerprint ~ '^[0-9a-f]{64}$'),
  asset_id text check (asset_id ~ '^[0-9a-f]{64}\.webp$'),
  generation bigint not null check (generation between 1 and 9007199254740991),
  byte_size integer check (byte_size between 1 and 2097152),
  width integer check (width between 1 and 2048),
  height integer check (height between 1 and 2048),
  updated_by text not null check (length(btrim(updated_by)) > 0),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (workspace_id, sku),
  foreign key (workspace_id, asset_id)
    references app_private.shop_media_assets(workspace_id, asset_id),
  check ((asset_id is null and byte_size is null and width is null and height is null)
    or (asset_id is not null and byte_size is not null and width is not null and height is not null))
);
create index shop_product_media_asset_idx
  on app_private.shop_product_media(workspace_id, asset_id)
  where asset_id is not null;

-- The security-definer lookup is Boolean-only. Commerce can also be granted to
-- Ecommerce; only an exact Shop activation may bind Shop product photos.
create function app_private.shop_media_can(capability text) returns boolean
language sql stable security definer set search_path = pg_catalog, app_private as $$
  with latest as (
    select e.payload_json as payload
    from app_private.workspace_events e
    where e.workspace_id = current_setting('app.workspace_id', true)
      and e.surface = 'company'
      and e.event_type in ('company.workspace.activated', 'company.workspace.created')
    order by case when e.event_type = 'company.workspace.activated' then 0 else 1 end,
      e.created_at desc
    limit 1
  ), normalized as (
    select case when payload->'products' is null or payload->'products' = 'null'::jsonb
      then jsonb_build_array(payload->'product') else payload->'products' end as products
    from latest
  )
  select coalesce(
    capability in ('commerce.read', 'commerce.write')
    and current_setting('app.actor_kind', true) = 'human'
    and exists (select 1 from app_private.workspace_access_controls a
      where a.workspace_id = current_setting('app.workspace_id', true) and a.status = 'active')
    and exists (select 1 from app_private.workspace_memberships m
      where m.workspace_id = current_setting('app.workspace_id', true)
        and m.actor_id = current_setting('app.actor_id', true)
        and m.actor_kind = 'human' and m.status = 'active'
        and capability = any(m.capabilities))
    and exists (select 1 from normalized where products @> '["shop"]'::jsonb
      and products = (select jsonb_agg(p order by ordinal)
        from (values ('shop',1),('plant',2),('website',3),('ecommerce',4)) canonical(p,ordinal)
        where products @> jsonb_build_array(p))), false);
$$;
revoke all on function app_private.shop_media_can(text)
  from public, anon, authenticated, service_role;
grant execute on function app_private.shop_media_can(text) to supermega_trial_backend;

alter table app_private.shop_product_media enable row level security;
alter table app_private.shop_product_media force row level security;
alter table app_private.shop_media_assets enable row level security;
alter table app_private.shop_media_assets force row level security;
create policy shop_media_assets_read on app_private.shop_media_assets
  for select to supermega_trial_backend using (
    workspace_id = (select current_setting('app.workspace_id', true))
    and ((select app_private.shop_media_can('commerce.read'))
      or (select app_private.shop_media_can('commerce.write'))));
create policy shop_media_assets_insert on app_private.shop_media_assets
  for insert to supermega_trial_backend with check (
    workspace_id = (select current_setting('app.workspace_id', true))
    and updated_by = (select current_setting('app.actor_id', true))
    and (select app_private.shop_media_can('commerce.write')));
create policy shop_media_assets_update on app_private.shop_media_assets
  for update to supermega_trial_backend using (
    workspace_id = (select current_setting('app.workspace_id', true))
    and (select app_private.shop_media_can('commerce.write')))
  with check (
    workspace_id = (select current_setting('app.workspace_id', true))
    and updated_by = (select current_setting('app.actor_id', true))
    and (select app_private.shop_media_can('commerce.write')));
create policy shop_product_media_read on app_private.shop_product_media
  for select to supermega_trial_backend using (
    workspace_id = (select current_setting('app.workspace_id', true))
    and ((select app_private.shop_media_can('commerce.read'))
      or (select app_private.shop_media_can('commerce.write'))));
create policy shop_product_media_insert on app_private.shop_product_media
  for insert to supermega_trial_backend with check (
    workspace_id = (select current_setting('app.workspace_id', true))
    and updated_by = (select current_setting('app.actor_id', true))
    and (select app_private.shop_media_can('commerce.write'))
    and exists (select 1 from app_private.workspace_state catalog
      where catalog.workspace_id = shop_product_media.workspace_id
        and catalog.surface = 'commerce'
        and jsonb_path_exists(catalog.state_json,
          '$.items[*] ? (@.sku == $sku)', jsonb_build_object('sku',shop_product_media.sku))));
create policy shop_product_media_update on app_private.shop_product_media
  for update to supermega_trial_backend using (
    workspace_id = (select current_setting('app.workspace_id', true))
    and (select app_private.shop_media_can('commerce.write')))
  with check (
    workspace_id = (select current_setting('app.workspace_id', true))
    and updated_by = (select current_setting('app.actor_id', true))
    and (select app_private.shop_media_can('commerce.write'))
    and (asset_id is null or exists (select 1 from app_private.workspace_state catalog
      where catalog.workspace_id = shop_product_media.workspace_id
        and catalog.surface = 'commerce'
        and jsonb_path_exists(catalog.state_json,
          '$.items[*] ? (@.sku == $sku)', jsonb_build_object('sku',shop_product_media.sku)))));
revoke all on app_private.shop_product_media from public, anon, authenticated, service_role;
grant select, insert, update on app_private.shop_product_media to supermega_trial_backend;
revoke all on app_private.shop_media_assets from public, anon, authenticated, service_role;
grant select, insert, update on app_private.shop_media_assets to supermega_trial_backend;

commit;
