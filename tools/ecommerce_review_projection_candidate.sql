-- Local rehearsal candidate, not a migration or authorization boundary.
-- Caller must validate the saved state, catalog freshness and assignment separately.
-- No table reads; never returns inventory quantities, costs, orders or evidence.
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
begin
  if jsonb_typeof(configuration) is distinct from 'object'
    or jsonb_typeof(configuration->'selectedSkus') is distinct from 'array'
    or jsonb_typeof(source->'items') is distinct from 'array' then
    raise exception using errcode='22023',message='ecommerce_review_source_invalid';
  end if;
  if jsonb_array_length(configuration->'selectedSkus') = 0
    or (select count(*) <> count(distinct value) from jsonb_array_elements(configuration->'selectedSkus')) then
    raise exception using errcode='22023',message='ecommerce_review_selection_invalid';
  end if;
  for selected in select value from jsonb_array_elements(configuration->'selectedSkus') loop
    select count(*) into matches from jsonb_array_elements(source->'items') i where i->'sku'=selected;
    if jsonb_typeof(selected) <> 'string' or matches <> 1 then
      raise exception using errcode='22023',message='ecommerce_review_item_invalid';
    end if;
    select value into item from jsonb_array_elements(source->'items') where value->'sku'=selected;
    select count(*) into matches from jsonb_array_elements(coalesce(configuration->'merchandising','[]'::jsonb)) m where m->'sku'=selected;
    if matches > 1 then
      raise exception using errcode='22023',message='ecommerce_review_merchandising_invalid';
    end if;
    projected := jsonb_build_object('sku',item->'sku','name',item->'name','variant',item->'variant',
      'unitPriceMmk',item->'price','availability',case when (item->>'onHand')::numeric > 0 then 'available' else 'sold_out' end);
    if matches = 1 then
      select value into merch from jsonb_array_elements(configuration->'merchandising') where value->'sku'=selected;
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
