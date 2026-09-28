-- Public catalog projection helpers for private review storage.
-- Caller must validate the complete saved-state grammar and assignment separately.
-- Catalog product-field freshness is checked here; stock binds through preview/source version.
-- No table reads; never returns inventory quantities, costs, orders or evidence.
-- Browser String.length counts supplementary characters as two UTF-16 units.
create function app_private.ecommerce_review_text_length(value text) returns bigint
language sql immutable strict security invoker set search_path=pg_catalog,app_private as $$
  select coalesce(sum(case when ascii(character)>65535 then 2 else 1 end),0)
  from regexp_split_to_table(value,'') character where character <> '';
$$;
revoke all on function app_private.ecommerce_review_text_length(text) from public,anon,authenticated,service_role;

create function app_private.ecommerce_review_projection(source jsonb) returns jsonb
language plpgsql immutable security invoker set search_path=pg_catalog,app_private as $$
declare
  configuration jsonb := source->'storefrontConfiguration';
  selected jsonb;
  item jsonb;
  merch jsonb;
  projected jsonb;
  items jsonb := '[]'::jsonb;
  matches bigint;
  catalog_json text;
  field text;
  trim_chars text := chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279);
begin
  if jsonb_typeof(configuration) is distinct from 'object'
    or jsonb_typeof(configuration->'selectedSkus') is distinct from 'array'
    or jsonb_typeof(source->'items') is distinct from 'array' then
    raise exception using errcode='22023',message='ecommerce_review_source_invalid';
  end if;
  foreach field in array array['storeName','summary'] loop
    if jsonb_typeof(configuration->field) is distinct from 'string'
      or length(btrim(configuration->>field,trim_chars)) = 0
      or configuration->>field <> btrim(configuration->>field,trim_chars)
      or app_private.ecommerce_review_text_length(configuration->>field) > (case when field='storeName' then 60 else 180 end) then
      raise exception using errcode='22023',message='ecommerce_review_text_invalid';
    end if;
  end loop;
  if configuration->'selectedSkus' is distinct from
    (select jsonb_agg(value order by value#>>'{}' collate "C") from jsonb_array_elements(configuration->'selectedSkus')) then
    raise exception using errcode='22023',message='ecommerce_review_selection_invalid';
  end if;
  select '[' || coalesce(string_agg('[' || coalesce((i->'sku')::text,'null') || ',' ||
    coalesce((i->'name')::text,'null') || ',' || coalesce((i->'variant')::text,'null') || ',' ||
    coalesce((i->'price')::text,'null') || ']', ',' order by i->>'sku' collate "C"),'') || ']'
    into catalog_json from jsonb_array_elements(source->'items') i;
  if configuration->>'shopCatalogDigest' is distinct from
    'sha256:' || encode(sha256(convert_to(catalog_json,'UTF8')),'hex') then
    raise exception using errcode='22023',message='ecommerce_review_catalog_stale';
  end if;
  if jsonb_array_length(configuration->'selectedSkus') = 0
    or (select count(*) <> count(distinct value) from jsonb_array_elements(configuration->'selectedSkus')) then
    raise exception using errcode='22023',message='ecommerce_review_selection_invalid';
  end if;
  if configuration ? 'merchandising' then
    if jsonb_typeof(configuration->'merchandising') is distinct from 'array' then
      raise exception using errcode='22023',message='ecommerce_review_merchandising_invalid';
    end if;
    if (select jsonb_agg(m->'sku' order by ordinal) from jsonb_array_elements(configuration->'merchandising') with ordinality rows(m,ordinal))
      is distinct from configuration->'selectedSkus' then
      raise exception using errcode='22023',message='ecommerce_review_merchandising_invalid';
    end if;
  end if;
  for selected in select value from jsonb_array_elements(configuration->'selectedSkus') loop
    select count(*) into matches from jsonb_array_elements(source->'items') i where i->'sku'=selected;
    if jsonb_typeof(selected) <> 'string' or matches <> 1 then
      raise exception using errcode='22023',message='ecommerce_review_item_invalid';
    end if;
    select value into item from jsonb_array_elements(source->'items') where value->'sku'=selected;
    foreach field in array array['sku','name'] loop
      if jsonb_typeof(item->field) is distinct from 'string'
        or length(btrim(item->>field,trim_chars)) = 0
        or item->>field <> btrim(item->>field,trim_chars)
        or app_private.ecommerce_review_text_length(item->>field) > (case when field='sku' then 80 else 180 end) then
        raise exception using errcode='22023',message='ecommerce_review_text_invalid';
      end if;
    end loop;
    if item ? 'variant' and item->'variant' <> 'null'::jsonb then
      if jsonb_typeof(item->'variant') is distinct from 'string'
        or app_private.ecommerce_review_text_length(item->>'variant') not between 1 and 180
        or item->>'variant' <> btrim(item->>'variant',trim_chars) then
        raise exception using errcode='22023',message='ecommerce_review_variant_invalid';
      end if;
    end if;
    foreach field in array array['price','onHand'] loop
      if jsonb_typeof(item->field) is distinct from 'number' then
        raise exception using errcode='22023',message='ecommerce_review_number_invalid';
      end if;
      if (item->>field)::numeric <> trunc((item->>field)::numeric)
        or (item->>field)::numeric < (case when field='price' then 1 else 0 end)
        or (item->>field)::numeric > 9007199254740991 then
        raise exception using errcode='22023',message='ecommerce_review_number_invalid';
      end if;
    end loop;
    select count(*) into matches from jsonb_array_elements(coalesce(configuration->'merchandising','[]'::jsonb)) m where m->'sku'=selected;
    if matches > 1 then
      raise exception using errcode='22023',message='ecommerce_review_merchandising_invalid';
    end if;
    projected := jsonb_build_object('sku',item->'sku','name',item->'name','variant',item->'variant',
      'unitPriceMmk',item->'price','availability',case when (item->>'onHand')::numeric > 0 then 'available' else 'sold_out' end);
    if matches = 1 then
      select value into merch from jsonb_array_elements(configuration->'merchandising') where value->'sku'=selected;
      if jsonb_typeof(merch->'featured') is distinct from 'boolean' then
        raise exception using errcode='22023',message='ecommerce_review_merchandising_invalid';
      end if;
      foreach field in array array['collection','displayName','note'] loop
        if jsonb_typeof(merch->field) is distinct from 'string'
          or merch->>field <> btrim(merch->>field,trim_chars)
          or (field='collection' and app_private.ecommerce_review_text_length(merch->>field)=0)
          or app_private.ecommerce_review_text_length(merch->>field) > (case field when 'collection' then 120 when 'displayName' then 180 else 300 end) then
          raise exception using errcode='22023',message='ecommerce_review_merchandising_invalid';
        end if;
      end loop;
      projected := projected || jsonb_build_object('merchandising',jsonb_build_object(
        'featured',merch->'featured','collection',merch->'collection','displayName',merch->'displayName','note',merch->'note'));
    end if;
    items := items || jsonb_build_array(projected);
  end loop;
  return jsonb_build_object('schema','supermega.ecommerce.storefront_preview.v1','mode','browser-local-preview',
    'sourceCatalogSchema','supermega.commerce.workspace.v2','storeName',configuration->'storeName',
    'summary',configuration->'summary','currency','MMK','items',items);
end;
$$;
revoke all on function app_private.ecommerce_review_projection(jsonb) from public,anon,authenticated,service_role;

-- Fixed field order and compact JSON match the existing Python/TS preview digest.
-- Input is always the projection above, never arbitrary caller-supplied JSON.
create function app_private.ecommerce_review_preview_digest(source jsonb) returns text
language plpgsql immutable security invoker set search_path=pg_catalog,app_private as $$
declare
  preview jsonb := app_private.ecommerce_review_projection(source);
  encoded text := '{';
  item jsonb;
  field text;
  first_item boolean := true;
  first_field boolean;
begin
  foreach field in array array['schema','mode','sourceCatalogSchema','storeName','summary','currency'] loop
    if encoded <> '{' then encoded := encoded || ','; end if;
    encoded := encoded || to_json(field)::text || ':' || coalesce((preview->field)::text,'null');
  end loop;
  encoded := encoded || ',"items":[';
  for item in select value from jsonb_array_elements(preview->'items') loop
    if not first_item then encoded := encoded || ','; end if;
    first_item := false;
    encoded := encoded || '{';
    first_field := true;
    foreach field in array array['sku','name','variant','unitPriceMmk','availability'] loop
      if not first_field then encoded := encoded || ','; end if;
      first_field := false;
      encoded := encoded || to_json(field)::text || ':' || coalesce((item->field)::text,'null');
    end loop;
    if item ? 'merchandising' then
      encoded := encoded || ',"merchandising":{';
      first_field := true;
      foreach field in array array['featured','collection','displayName','note'] loop
        if not first_field then encoded := encoded || ','; end if;
        first_field := false;
        encoded := encoded || to_json(field)::text || ':' || coalesce((item->'merchandising'->field)::text,'null');
      end loop;
      encoded := encoded || '}';
    end if;
    encoded := encoded || '}';
  end loop;
  return 'sha256:' || encode(sha256(convert_to(encoded || ']}','UTF8')),'hex');
end;
$$;
revoke all on function app_private.ecommerce_review_preview_digest(jsonb) from public,anon,authenticated,service_role;

-- Private assignment storage. Requires the existing Ecommerce entitlement proof.
-- No route, customer decision, runtime identity bypass or publishing authority.
create table app_private.ecommerce_customer_reviews (
 review_id uuid primary key, workspace_id text not null, recipient_actor_id text not null,
 prepared_by text not null, source_version bigint not null check(source_version between 1 and 9007199254740991),
 content_revision bigint not null default 0 check(content_revision between 0 and 9007199254740991),
 preview jsonb not null, preview_digest text not null check(preview_digest ~ '^sha256:[0-9a-f]{64}$'),
 prepared_at timestamptz not null default transaction_timestamp(), expires_at timestamptz not null,
 status text not null default 'active' check(status in ('active','stale','revoked')),
 foreign key(workspace_id,recipient_actor_id) references app_private.workspace_memberships(workspace_id,actor_id),
 check(expires_at>prepared_at and expires_at<=prepared_at+interval '7 days')
);
create index ecommerce_reviews_recipient_idx on app_private.ecommerce_customer_reviews(workspace_id,recipient_actor_id,review_id);
create index ecommerce_reviews_active_idx on app_private.ecommerce_customer_reviews(workspace_id) where status='active';
alter table app_private.ecommerce_customer_reviews enable row level security;
alter table app_private.ecommerce_customer_reviews force row level security;
-- Optional private proof; no membership, API route or publishing authority is granted.
-- Boolean-only activation proof for review-only recipients. No event payload,
-- workspace directory or additional membership capability is returned.
create function app_private.ecommerce_review_operator_entitled() returns boolean
language sql stable security definer set search_path = pg_catalog, app_private as $$
  with latest as (
    select e.payload_json as payload
    from app_private.workspace_events e
    where e.workspace_id = current_setting('app.workspace_id',true)
      and e.surface = 'company'
      and e.event_type in ('company.workspace.activated','company.workspace.created')
    order by case when e.event_type='company.workspace.activated' then 0 else 1 end,
      e.created_at desc
    limit 1
  ), normalized as (
    select case when payload->'products' is null or payload->'products'='null'::jsonb
      then jsonb_build_array(payload->'product') else payload->'products' end as products
    from latest
  )
  select coalesce(
    current_setting('app.actor_kind',true) = 'human'
    and exists (select 1 from app_private.workspace_access_controls a
      where a.workspace_id=current_setting('app.workspace_id',true) and a.status='active')
    and exists (select 1 from app_private.workspace_memberships m
      where m.workspace_id=current_setting('app.workspace_id',true)
        and m.actor_id=current_setting('app.actor_id',true) and m.actor_kind='human'
        and m.status='active' and 'commerce.write'=any(m.capabilities))
    and exists (select 1 from normalized where products @> '["ecommerce"]'::jsonb
      and products = (select jsonb_agg(p order by ordinal)
        from (values ('shop',1),('plant',2),('website',3),('ecommerce',4)) canonical(p,ordinal)
        where products @> jsonb_build_array(p))), false);
$$;
revoke all on function app_private.ecommerce_review_operator_entitled() from public, anon, authenticated, service_role;
grant execute on function app_private.ecommerce_review_operator_entitled() to supermega_trial_backend;
create function app_private.ecommerce_review_recipient_ready(recipient text) returns boolean
language sql stable security definer set search_path = pg_catalog, app_private as $$
  select current_setting('app.actor_kind',true) = 'human'
    and exists (select 1 from app_private.workspace_access_controls a
      where a.workspace_id = current_setting('app.workspace_id',true) and a.status = 'active')
    and exists (select 1 from app_private.workspace_memberships m
      where m.workspace_id = current_setting('app.workspace_id',true)
        and m.actor_id = current_setting('app.actor_id',true) and m.actor_kind = 'human'
        and m.status = 'active' and 'commerce.write' = any(m.capabilities))
    and exists (select 1 from app_private.workspace_memberships m
      where m.workspace_id = current_setting('app.workspace_id',true)
        and m.actor_id = recipient and m.actor_kind = 'human'
        and m.status = 'active' and 'ecommerce.review' = any(m.capabilities));
$$;


create policy ecommerce_reviews_read on app_private.ecommerce_customer_reviews for select to supermega_trial_backend using (
 workspace_id=current_setting('app.workspace_id',true) and
 (app_private.ecommerce_review_operator_entitled() or
 (recipient_actor_id=current_setting('app.actor_id',true) and status='active'
  and prepared_at<=clock_timestamp() and expires_at>clock_timestamp() and app_private.ecommerce_review_entitled())));
create policy ecommerce_reviews_insert on app_private.ecommerce_customer_reviews for insert to supermega_trial_backend with check (
 workspace_id=current_setting('app.workspace_id',true) and prepared_by=current_setting('app.actor_id',true)
 and app_private.ecommerce_review_operator_entitled());
create policy ecommerce_reviews_update on app_private.ecommerce_customer_reviews for update to supermega_trial_backend
 using(workspace_id=current_setting('app.workspace_id',true) and app_private.ecommerce_review_operator_entitled())
 with check(workspace_id=current_setting('app.workspace_id',true) and app_private.ecommerce_review_operator_entitled());
create function app_private.guard_ecommerce_review() returns trigger
language plpgsql security invoker set search_path = pg_catalog, app_private as $$
declare source app_private.workspace_state%rowtype; expected_preview jsonb;
begin
  -- Advisory locks serialize operations but cannot refresh an old RR snapshot.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode='0A000', message='ecommerce_review_requires_read_committed';
  end if;
  if tg_op = 'DELETE' then
    raise exception using errcode='55000', message='ecommerce_review_history_immutable';
  end if;
  if tg_op = 'INSERT' then
    -- State -> review serialization order, shared with normal Website writes.
    select * into source from app_private.workspace_state
      where workspace_id = new.workspace_id and surface = 'commerce' for update;
    if not found or source.version <> new.source_version then
      raise exception using errcode='40001', message='ecommerce_review_source_stale';
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ecommerce-review:' || new.workspace_id,0));
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'status') <> (to_jsonb(old) - 'status')
      or old.status = 'revoked'
      or not (new.status = 'revoked' or (new.status = 'stale' and pg_trigger_depth() > 1)) then
      raise exception using errcode='55000', message='ecommerce_review_history_immutable';
    end if;
    return new;
  end if;
  if new.status <> 'active' or new.prepared_by <> current_setting('app.actor_id',true)
    or not app_private.ecommerce_review_recipient_ready(new.recipient_actor_id) then
    raise exception using errcode='42501', message='ecommerce_review_recipient_denied';
  end if;
  expected_preview := app_private.ecommerce_review_projection(source.state_json);
  if new.preview <> expected_preview or new.preview_digest <> app_private.ecommerce_review_preview_digest(source.state_json) then
    raise exception using errcode='22023', message='ecommerce_review_projection_mismatch';
  end if;
  new.prepared_at := clock_timestamp();
  new.content_revision := (source.state_json->'storefrontConfiguration'->>'revision')::bigint;
  return new;
end;
$$;
create trigger ecommerce_review_guard before insert or update or delete
  on app_private.ecommerce_customer_reviews for each row execute function app_private.guard_ecommerce_review();

create function app_private.invalidate_ecommerce_reviews() returns trigger
language plpgsql security invoker set search_path = pg_catalog, app_private as $$
begin
  if old.surface = 'commerce' then
    if current_setting('transaction_isolation') <> 'read committed' then
      raise exception using errcode='0A000', message='ecommerce_review_requires_read_committed';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('ecommerce-review:' || old.workspace_id,0));
    update app_private.ecommerce_customer_reviews set status = 'stale'
      where workspace_id = old.workspace_id and status = 'active';
  end if;
  return null;
end;
$$;
create trigger ecommerce_reviews_invalidate after update or delete on app_private.workspace_state
  for each row execute function app_private.invalidate_ecommerce_reviews();


revoke all on app_private.ecommerce_customer_reviews from public,anon,authenticated,service_role;
grant select,insert,update on app_private.ecommerce_customer_reviews to supermega_trial_backend;
revoke all on function app_private.ecommerce_review_recipient_ready(text) from public,anon,authenticated,service_role;
grant execute on function app_private.ecommerce_review_recipient_ready(text) to supermega_trial_backend;
revoke all on function app_private.guard_ecommerce_review() from public,anon,authenticated,service_role;
grant execute on function app_private.guard_ecommerce_review() to supermega_trial_backend;
revoke all on function app_private.invalidate_ecommerce_reviews() from public,anon,authenticated,service_role;
grant execute on function app_private.invalidate_ecommerce_reviews() to supermega_trial_backend;
revoke all on function app_private.ecommerce_review_projection(jsonb) from public,anon,authenticated,service_role;
grant execute on function app_private.ecommerce_review_projection(jsonb) to supermega_trial_backend;
revoke all on function app_private.ecommerce_review_preview_digest(jsonb) from public,anon,authenticated,service_role;
grant execute on function app_private.ecommerce_review_preview_digest(jsonb) to supermega_trial_backend;
revoke all on function app_private.ecommerce_review_text_length(text) from public,anon,authenticated,service_role;
grant execute on function app_private.ecommerce_review_text_length(text) to supermega_trial_backend;
