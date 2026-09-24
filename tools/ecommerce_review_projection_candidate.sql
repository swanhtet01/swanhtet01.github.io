-- Local rehearsal candidate, not a migration or authorization boundary.
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
