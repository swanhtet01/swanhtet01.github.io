begin;

-- Source-only v14 addition. Apply only after the v13 private backend is present,
-- then set the runtime's exact schema version on that approved target. This does
-- not expose native sales through the Data API or modify the browser Shop state.
do $guard$
begin
  if not exists (
    select 1 from app_private.trial_schema_meta
    where component = 'private_trial_backend' and schema_version = 13
  ) then
    raise exception using errcode = '55000',
      message = 'Shop sale sync requires private trial backend schema v13';
  end if;
end
$guard$;

create table app_private.shop_sync_devices (
  workspace_id text not null,
  device_id uuid not null,
  bound_by text not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  bound_at timestamptz not null default transaction_timestamp(),
  last_seen_at timestamptz,
  primary key (workspace_id, device_id),
  check (workspace_id = btrim(workspace_id) and workspace_id <> ''),
  check (bound_by = btrim(bound_by) and bound_by <> '')
);

-- Until a stock conflict workflow exists, only one selling device may be
-- connected to a workspace. A privileged operator may revoke it separately.
create unique index shop_sync_one_active_device_per_workspace
  on app_private.shop_sync_devices (workspace_id) where status = 'active';

create table app_private.shop_sales (
  workspace_id text not null,
  sale_id text not null,
  device_id uuid not null,
  operation_id text not null,
  payment_method text not null check (payment_method in ('cash', 'kbzpay', 'wavepay')),
  total_mmk bigint not null check (total_mmk between 0 and 200000000000000),
  created_at_millis bigint not null check (created_at_millis between 1 and 9007199254740991),
  shift_id text,
  lines_json jsonb not null check (
    jsonb_typeof(lines_json) = 'array' and jsonb_array_length(lines_json) between 1 and 100
  ),
  recorded_at timestamptz not null default transaction_timestamp(),
  primary key (workspace_id, sale_id),
  unique (workspace_id, device_id, operation_id),
  foreign key (workspace_id, device_id)
    references app_private.shop_sync_devices (workspace_id, device_id),
  check (sale_id = operation_id and char_length(sale_id) between 1 and 120),
  check (shift_id is null or char_length(shift_id) between 1 and 120)
);

create table app_private.shop_stock_movements (
  workspace_id text not null,
  sale_id text not null,
  product_id text not null,
  quantity_delta integer not null check (quantity_delta between -1000 and -1),
  reason text not null check (reason in ('cash_sale', 'kbzpay_sale', 'wavepay_sale')),
  recorded_at timestamptz not null default transaction_timestamp(),
  primary key (workspace_id, sale_id, product_id),
  foreign key (workspace_id, sale_id)
    references app_private.shop_sales (workspace_id, sale_id),
  check (char_length(product_id) between 1 and 100)
);

create table app_private.shop_sale_operations (
  workspace_id text not null,
  device_id uuid not null,
  operation_id text not null,
  sale_id text not null,
  event_type text not null check (
    event_type in ('shop.cash_sale.completed.v1', 'shop.mobile_money_sale.completed.v1')
  ),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  accepted_by text not null,
  server_revision bigint generated always as identity,
  accepted_at timestamptz not null default transaction_timestamp(),
  primary key (workspace_id, device_id, operation_id),
  unique (workspace_id, sale_id),
  unique (server_revision),
  foreign key (workspace_id, device_id)
    references app_private.shop_sync_devices (workspace_id, device_id),
  foreign key (workspace_id, sale_id)
    references app_private.shop_sales (workspace_id, sale_id),
  check (char_length(operation_id) between 1 and 120),
  check (accepted_by = btrim(accepted_by) and accepted_by <> '')
);

alter table app_private.shop_sync_devices enable row level security;
alter table app_private.shop_sync_devices force row level security;
alter table app_private.shop_sales enable row level security;
alter table app_private.shop_sales force row level security;
alter table app_private.shop_stock_movements enable row level security;
alter table app_private.shop_stock_movements force row level security;
alter table app_private.shop_sale_operations enable row level security;
alter table app_private.shop_sale_operations force row level security;

-- The server's non-BYPASSRLS role carries only transaction-local identity.
-- Recheck live membership and workspace activation on every statement; JWT
-- metadata and client-supplied workspace fields never authorize a row.
create function app_private.shop_sync_can_write(target_workspace_id text)
returns boolean
language sql stable security invoker
set search_path = pg_catalog, app_private
as $function$
  select target_workspace_id = (select current_setting('app.workspace_id', true))
    and (select current_setting('app.actor_kind', true)) = 'human'
    and app_private.workspace_is_active(target_workspace_id)
    and exists (
      select 1 from (
        select event.payload_json
        from app_private.workspace_events event
        where event.workspace_id = target_workspace_id
          and event.surface = 'company'
          and event.event_type in ('company.workspace.activated', 'company.workspace.created')
        order by case when event.event_type = 'company.workspace.activated' then 0 else 1 end,
                 event.created_at desc
        limit 1
      ) activation
      where (
        coalesce(jsonb_typeof(activation.payload_json -> 'products'), 'null') = 'null'
        and activation.payload_json ->> 'product' = 'shop'
      ) or (
        jsonb_typeof(activation.payload_json -> 'products') = 'array'
        and (activation.payload_json -> 'products') ? 'shop'
        and activation.payload_json -> 'products' = (
          select jsonb_agg(canonical.product order by canonical.ordinal)
          from (values ('shop', 1), ('plant', 2), ('website', 3), ('ecommerce', 4))
            canonical(product, ordinal)
          where (activation.payload_json -> 'products') ? canonical.product
        )
      )
    )
    and exists (
      select 1 from app_private.workspace_memberships membership
      where membership.workspace_id = target_workspace_id
        and membership.actor_id = (select current_setting('app.actor_id', true))
        and membership.actor_kind = 'human'
        and membership.status = 'active'
        and 'commerce.write' = any(membership.capabilities)
    )
$function$;

revoke all on function app_private.shop_sync_can_write(text)
  from public, anon, authenticated, service_role;
grant execute on function app_private.shop_sync_can_write(text)
  to supermega_trial_backend;

create policy shop_sync_devices_member_select on app_private.shop_sync_devices
  for select to supermega_trial_backend
  using (app_private.shop_sync_can_write(workspace_id));
create policy shop_sync_devices_member_insert on app_private.shop_sync_devices
  for insert to supermega_trial_backend
  with check (
    app_private.shop_sync_can_write(workspace_id)
    and bound_by = (select current_setting('app.actor_id', true))
  );
create policy shop_sync_devices_member_heartbeat on app_private.shop_sync_devices
  for update to supermega_trial_backend
  using (
    app_private.shop_sync_can_write(workspace_id)
    and status = 'active'
    and bound_by = (select current_setting('app.actor_id', true))
  )
  with check (
    app_private.shop_sync_can_write(workspace_id)
    and status = 'active'
    and bound_by = (select current_setting('app.actor_id', true))
  );

create policy shop_sales_member_select on app_private.shop_sales
  for select to supermega_trial_backend
  using (app_private.shop_sync_can_write(workspace_id));
create policy shop_sales_member_insert on app_private.shop_sales
  for insert to supermega_trial_backend
  with check (app_private.shop_sync_can_write(workspace_id));

create policy shop_stock_movements_member_select on app_private.shop_stock_movements
  for select to supermega_trial_backend
  using (app_private.shop_sync_can_write(workspace_id));
create policy shop_stock_movements_member_insert on app_private.shop_stock_movements
  for insert to supermega_trial_backend
  with check (app_private.shop_sync_can_write(workspace_id));

create policy shop_sale_operations_member_select on app_private.shop_sale_operations
  for select to supermega_trial_backend
  using (app_private.shop_sync_can_write(workspace_id));
create policy shop_sale_operations_member_insert on app_private.shop_sale_operations
  for insert to supermega_trial_backend
  with check (
    app_private.shop_sync_can_write(workspace_id)
    and accepted_by = (select current_setting('app.actor_id', true))
  );

grant select, insert on app_private.shop_sync_devices,
  app_private.shop_sales,
  app_private.shop_stock_movements,
  app_private.shop_sale_operations
  to supermega_trial_backend;
-- UPDATE only this harmless heartbeat column, so ingestion can row-lock the
-- active device against a concurrent privileged revocation. The role cannot
-- update status, binding identity, sale rows, stock rows or acknowledgements.
grant update (last_seen_at) on app_private.shop_sync_devices
  to supermega_trial_backend;

-- Sales, stock effects and acknowledgements cannot be silently rewritten.
create function app_private.reject_shop_sale_sync_mutation()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, app_private
as $function$
begin
  raise exception using errcode = '55000', message = 'Shop sale sync records are immutable';
end
$function$;

revoke all on function app_private.reject_shop_sale_sync_mutation()
  from public, anon, authenticated, service_role;

create trigger shop_sales_immutable before update or delete
  on app_private.shop_sales for each row
  execute function app_private.reject_shop_sale_sync_mutation();
create trigger shop_stock_movements_immutable before update or delete
  on app_private.shop_stock_movements for each row
  execute function app_private.reject_shop_sale_sync_mutation();
create trigger shop_sale_operations_immutable before update or delete
  on app_private.shop_sale_operations for each row
  execute function app_private.reject_shop_sale_sync_mutation();

update app_private.trial_schema_meta
set schema_version = 14, applied_at = transaction_timestamp()
where component = 'private_trial_backend' and schema_version = 13;

commit;
