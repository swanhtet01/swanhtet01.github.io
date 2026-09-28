-- Boolean-only activation proof for review-only recipients. No event payload,
-- workspace directory or additional membership capability is returned.
begin;
create function app_private.website_review_entitled() returns boolean
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
        and m.status='active' and 'website.review'=any(m.capabilities))
    and exists (select 1 from normalized where products @> '["website"]'::jsonb
      and products = (select jsonb_agg(p order by ordinal)
        from (values ('shop',1),('plant',2),('website',3),('ecommerce',4)) canonical(p,ordinal)
        where products @> jsonb_build_array(p))), false);
$$;
revoke all on function app_private.website_review_entitled() from public, anon, authenticated, service_role;
grant execute on function app_private.website_review_entitled() to supermega_trial_backend;
commit;
