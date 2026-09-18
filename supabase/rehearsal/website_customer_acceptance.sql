-- Candidate extension for isolated rehearsal only. Not in the release migration chain.
-- Customer acceptance is immutable evidence for operator review, never publication.
begin;
create table app_private.website_customer_acceptances (
  workspace_id text not null,
  actor_id text not null,
  command_id uuid not null,
  review_id uuid not null,
  source_version bigint not null,
  content_revision bigint not null,
  preview_digest text not null check (preview_digest ~ '^sha256:[0-9a-f]{64}$'),
  command_fingerprint text not null check (command_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  decision text not null check (decision = 'accept_preview_for_release_review'),
  accepted_at timestamptz not null default clock_timestamp(),
  primary key (workspace_id, actor_id, command_id),
  unique (workspace_id, review_id),
  foreign key (workspace_id, review_id)
    references app_private.website_customer_reviews(workspace_id, review_id)
);
alter table app_private.website_customer_acceptances enable row level security;
alter table app_private.website_customer_acceptances force row level security;
create policy website_acceptance_read on app_private.website_customer_acceptances
for select to supermega_trial_backend using (
  workspace_id = current_setting('app.workspace_id',true)
  and (app_private.website_review_can('website.write') or
    (actor_id = current_setting('app.actor_id',true) and app_private.website_review_can('website.review'))));
create policy website_acceptance_insert on app_private.website_customer_acceptances
for insert to supermega_trial_backend with check (
  workspace_id = current_setting('app.workspace_id',true)
  and actor_id = current_setting('app.actor_id',true)
  and app_private.website_review_can('website.review')
  and app_private.website_review_entitled());

create function app_private.guard_website_acceptance() returns trigger
language plpgsql security invoker set search_path = pg_catalog, app_private as $$
declare assignment app_private.website_customer_reviews%rowtype; identity jsonb;
begin
  if tg_op <> 'INSERT' then
    raise exception using errcode='55000', message='website_acceptance_history_immutable';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode='0A000', message='website_review_requires_read_committed';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('website-review:' || new.workspace_id,0));
  if new.workspace_id <> current_setting('app.workspace_id',true)
    or new.actor_id <> current_setting('app.actor_id',true)
    or not coalesce(app_private.website_review_can('website.review'),false)
    or not coalesce(app_private.website_review_entitled(),false) then
    raise exception using errcode='42501', message='website_acceptance_assignment_denied';
  end if;
  select * into assignment from app_private.website_customer_reviews
    where workspace_id=new.workspace_id and review_id=new.review_id;
  if not found or assignment.status <> 'active'
    or assignment.prepared_at > clock_timestamp() or assignment.expires_at <= clock_timestamp()
    or assignment.recipient_actor_id <> new.actor_id
    or assignment.source_version <> new.source_version
    or assignment.content_revision <> new.content_revision
    or assignment.preview_digest <> new.preview_digest then
    raise exception using errcode='42501', message='website_acceptance_assignment_denied';
  end if;
  if exists(select 1 from app_private.website_customer_feedback
    where workspace_id=new.workspace_id and review_id=new.review_id) then
    raise exception using errcode='55000', message='website_acceptance_changes_pending';
  end if;
  identity := jsonb_build_object('contract','supermega.website.customer-acceptance.v1',
    'workspaceId',new.workspace_id,'actorId',new.actor_id,'reviewId',new.review_id::text,
    'commandId',new.command_id::text,'contentRevision',new.content_revision,
    'previewDigest',new.preview_digest,'decision',new.decision);
  if new.command_fingerprint <> 'sha256:' || encode(sha256(convert_to(
    app_private.website_review_json(identity),'UTF8')),'hex') then
    raise exception using errcode='22023', message='website_acceptance_fingerprint_invalid';
  end if;
  new.accepted_at := clock_timestamp();
  return new;
end;
$$;
create trigger website_acceptance_guard before insert or update or delete
  on app_private.website_customer_acceptances for each row execute function app_private.guard_website_acceptance();

-- Both decisions share the same transaction lock: a review cannot acquire both.
-- A customer wanting changes after acceptance needs a new operator-prepared review.
create function app_private.guard_website_feedback_after_acceptance() returns trigger
language plpgsql security invoker set search_path = pg_catalog, app_private as $$
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode='0A000', message='website_review_requires_read_committed';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('website-review:' || new.workspace_id,0));
  if exists(select 1 from app_private.website_customer_acceptances
    where workspace_id=new.workspace_id and review_id=new.review_id) then
    raise exception using errcode='55000', message='website_review_already_accepted';
  end if;
  return new;
end;
$$;
create trigger website_feedback_acceptance_guard before insert
  on app_private.website_customer_feedback for each row execute function app_private.guard_website_feedback_after_acceptance();

revoke all on app_private.website_customer_acceptances from public, anon, authenticated, service_role;
grant select, insert on app_private.website_customer_acceptances to supermega_trial_backend;
revoke all on function app_private.guard_website_acceptance(), app_private.guard_website_feedback_after_acceptance()
  from public, anon, authenticated, service_role;
grant execute on function app_private.guard_website_acceptance(), app_private.guard_website_feedback_after_acceptance()
  to supermega_trial_backend;
commit;
