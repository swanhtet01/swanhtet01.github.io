-- Support review-row updates and deletes for the review_id-only foreign key.
-- The existing (workspace_id, review_id) indexes cannot serve this lookup.
begin;

create index ecommerce_decisions_review_fk_idx
  on app_private.ecommerce_customer_decisions(review_id);

commit;
