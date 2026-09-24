-- LOCAL STORAGE CANDIDATE ONLY. Requires projection helpers and existing entitlement proof.
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
