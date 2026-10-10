begin;

-- Hero and section photos share the same private receipt and publication
-- boundary. Draft-only photos remain inaccessible to public visitors.
create or replace function app_private.read_website_published_media(p_channel uuid, p_origin text, p_asset text)
returns jsonb language sql stable security definer set search_path = pg_catalog, app_private as $$
  select jsonb_build_object('workspaceId',c.workspace_id,'assetId',p_asset,
    'artifactDigest',c.artifact_digest,'receipt',e.result_json)
  from app_private.website_inquiry_channels c
  join app_private.workspace_events e on e.workspace_id=c.workspace_id
    and e.surface='website' and e.event_type='website.media.uploaded'
    and e.result_json->>'assetId'=p_asset
    and e.result_json->>'sha256'=left(p_asset,64)
    and e.result_json->>'visibility'='private'
    and e.result_json->>'contentType'='image/webp'
  where c.channel_id=p_channel and c.enabled and c.allowed_origin=p_origin
    and p_asset ~ '^[a-f0-9]{64}\.webp$'
    and app_private.workspace_is_active(c.workspace_id)
    and exists (
      select 1 from jsonb_array_elements(c.published_artifact->'pages') page
      where page->'hero'->'image'->>'assetId'=p_asset
        or exists (
          select 1 from jsonb_array_elements(page->'sections') section
          where section->'image'->>'assetId'=p_asset
        )
    )
  order by e.created_at,e.event_id limit 1;
$$;
revoke all on function app_private.read_website_published_media(uuid,text,text)
  from public, anon, authenticated, service_role;
grant execute on function app_private.read_website_published_media(uuid,text,text)
  to supermega_trial_backend;
commit;
