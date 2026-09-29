-- Cache session identity and entitlement lookups once per statement in the
-- thirteen app policies reported by the Supabase auth_rls_initplan advisor.
-- The predicates and permitted role remain unchanged.
begin;

drop policy self_serve_attempt_budget_actor_only
  on app_private.self_serve_attempt_budgets;
create policy self_serve_attempt_budget_actor_only
on app_private.self_serve_attempt_budgets for all to supermega_trial_backend
using (
  actor_id = (select nullif(current_setting('app.actor_id', true), '')::uuid)
  and (select current_setting('app.actor_kind', true)) = 'human'
)
with check (
  actor_id = (select nullif(current_setting('app.actor_id', true), '')::uuid)
  and (select current_setting('app.actor_kind', true)) = 'human'
);

drop policy website_reviews_read on app_private.website_customer_reviews;
create policy website_reviews_read on app_private.website_customer_reviews
for select to supermega_trial_backend using (
  workspace_id = (select current_setting('app.workspace_id', true))
  and ((select app_private.website_review_can('website.write')) or
    (recipient_actor_id = (select current_setting('app.actor_id', true))
      and (select app_private.website_review_can('website.review'))))
);
drop policy website_reviews_insert on app_private.website_customer_reviews;
create policy website_reviews_insert on app_private.website_customer_reviews
for insert to supermega_trial_backend with check (
  workspace_id = (select current_setting('app.workspace_id', true))
  and prepared_by = (select current_setting('app.actor_id', true))
  and (select app_private.website_review_can('website.write'))
);
drop policy website_reviews_update on app_private.website_customer_reviews;
create policy website_reviews_update on app_private.website_customer_reviews
for update to supermega_trial_backend
using (
  workspace_id = (select current_setting('app.workspace_id', true))
  and (select app_private.website_review_can('website.write'))
)
with check (
  workspace_id = (select current_setting('app.workspace_id', true))
  and (select app_private.website_review_can('website.write'))
);

drop policy website_feedback_read on app_private.website_customer_feedback;
create policy website_feedback_read on app_private.website_customer_feedback
for select to supermega_trial_backend using (
  workspace_id = (select current_setting('app.workspace_id', true))
  and ((select app_private.website_review_can('website.write')) or
    (actor_id = (select current_setting('app.actor_id', true))
      and (select app_private.website_review_can('website.review'))))
);
drop policy website_feedback_insert on app_private.website_customer_feedback;
create policy website_feedback_insert on app_private.website_customer_feedback
for insert to supermega_trial_backend with check (
  workspace_id = (select current_setting('app.workspace_id', true))
  and actor_id = (select current_setting('app.actor_id', true))
  and (select app_private.website_review_can('website.review'))
);

drop policy website_acceptance_read on app_private.website_customer_acceptances;
create policy website_acceptance_read on app_private.website_customer_acceptances
for select to supermega_trial_backend using (
  workspace_id = (select current_setting('app.workspace_id', true))
  and ((select app_private.website_review_can('website.write')) or
    (actor_id = (select current_setting('app.actor_id', true))
      and (select app_private.website_review_can('website.review'))))
);
drop policy website_acceptance_insert on app_private.website_customer_acceptances;
create policy website_acceptance_insert on app_private.website_customer_acceptances
for insert to supermega_trial_backend with check (
  workspace_id = (select current_setting('app.workspace_id', true))
  and actor_id = (select current_setting('app.actor_id', true))
  and (select app_private.website_review_can('website.review'))
);

drop policy ecommerce_reviews_read on app_private.ecommerce_customer_reviews;
create policy ecommerce_reviews_read on app_private.ecommerce_customer_reviews
for select to supermega_trial_backend using (
  workspace_id = (select current_setting('app.workspace_id', true))
  and ((select app_private.ecommerce_review_operator_entitled()) or
    (recipient_actor_id = (select current_setting('app.actor_id', true))
      and status = 'active'
      and prepared_at <= clock_timestamp()
      and expires_at > clock_timestamp()
      and (select app_private.ecommerce_review_entitled())))
);
drop policy ecommerce_reviews_insert on app_private.ecommerce_customer_reviews;
create policy ecommerce_reviews_insert on app_private.ecommerce_customer_reviews
for insert to supermega_trial_backend with check (
  workspace_id = (select current_setting('app.workspace_id', true))
  and prepared_by = (select current_setting('app.actor_id', true))
  and (select app_private.ecommerce_review_operator_entitled())
);
drop policy ecommerce_reviews_update on app_private.ecommerce_customer_reviews;
create policy ecommerce_reviews_update on app_private.ecommerce_customer_reviews
for update to supermega_trial_backend
using (
  workspace_id = (select current_setting('app.workspace_id', true))
  and (select app_private.ecommerce_review_operator_entitled())
)
with check (
  workspace_id = (select current_setting('app.workspace_id', true))
  and (select app_private.ecommerce_review_operator_entitled())
);

drop policy ecommerce_decisions_read on app_private.ecommerce_customer_decisions;
create policy ecommerce_decisions_read on app_private.ecommerce_customer_decisions
for select to supermega_trial_backend using (
  workspace_id = (select current_setting('app.workspace_id', true))
  and ((select app_private.ecommerce_review_operator_entitled()) or
    (actor_id = (select current_setting('app.actor_id', true))
      and (select app_private.ecommerce_review_entitled())))
);
drop policy ecommerce_decisions_insert on app_private.ecommerce_customer_decisions;
create policy ecommerce_decisions_insert on app_private.ecommerce_customer_decisions
for insert to supermega_trial_backend with check (
  workspace_id = (select current_setting('app.workspace_id', true))
  and actor_id = (select current_setting('app.actor_id', true))
  and (select app_private.ecommerce_review_entitled())
);

commit;
