-- Widen prepared Sites reviews in step with the six-page editor/runtime limit.
-- Existing reviews and their digests remain unchanged; this grants no new access.
begin;
set local lock_timeout = '5s';

alter table app_private.website_customer_reviews
  drop constraint website_customer_reviews_preview_check;
alter table app_private.website_customer_reviews
  add constraint website_customer_reviews_preview_check check (
    jsonb_typeof(preview) = 'object'
    and preview - array['siteName','pages'] = '{}'::jsonb
    and jsonb_typeof(preview->'siteName') = 'string'
    and jsonb_typeof(preview->'pages') = 'array'
    and jsonb_array_length(preview->'pages') between 1 and 6
  );

commit;
