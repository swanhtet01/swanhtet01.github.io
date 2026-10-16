-- Evaluate stable workspace context and entitlement lookups once per statement
-- instead of once per candidate row. Policy roles and access predicates are
-- preserved exactly; only scalar subqueries are added around stable calls.
begin;

drop policy website_inquiry_channel_read
  on app_private.website_inquiry_channels;
create policy website_inquiry_channel_read on app_private.website_inquiry_channels
  for select to supermega_trial_backend using (
    workspace_id = (select current_setting('app.workspace_id', true))
    and (select app_private.website_review_can('website.write'))
  );

drop policy website_inquiry_channel_create
  on app_private.website_inquiry_channels;
create policy website_inquiry_channel_create on app_private.website_inquiry_channels
  for insert to supermega_trial_backend with check (
    workspace_id = (select current_setting('app.workspace_id', true))
    and created_by = (select current_setting('app.actor_id', true))
    and not enabled
    and published_artifact is null
    and artifact_digest is null
    and snapshot_id is null
    and published_by is null
    and published_at is null
    and (select app_private.website_review_can('website.write'))
  );

drop policy website_inbox_read
  on app_private.website_inbox;
create policy website_inbox_read on app_private.website_inbox
  for select to supermega_trial_backend using (
    workspace_id = (select current_setting('app.workspace_id', true))
    and (select app_private.website_review_can('website.write'))
  );

drop policy website_inquiry_actions_read
  on app_private.website_inquiry_actions;
create policy website_inquiry_actions_read on app_private.website_inquiry_actions
  for select to supermega_trial_backend using (
    workspace_id = (select current_setting('app.workspace_id', true))
    and (select app_private.website_review_can('website.write'))
  );

commit;
