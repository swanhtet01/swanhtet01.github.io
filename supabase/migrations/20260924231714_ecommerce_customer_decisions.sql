-- Private customer decisions only. No publication, deployment or membership grants.
begin;
create table app_private.ecommerce_customer_decisions (
 workspace_id text not null, actor_id text not null, command_id uuid not null,
 review_id uuid not null, source_version bigint not null check(source_version between 1 and 9007199254740991),
 content_revision bigint not null check(content_revision between 0 and 9007199254740991),
 preview_digest text not null check(preview_digest ~ '^sha256:[0-9a-f]{64}$'),
 command_fingerprint text not null check(command_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
 kind text not null check(kind in ('acceptance','feedback')),
 note text, created_at timestamptz not null default clock_timestamp(),
 primary key(workspace_id,actor_id,command_id),
 foreign key(review_id) references app_private.ecommerce_customer_reviews(review_id),
 check((kind='acceptance' and note is null) or (kind='feedback' and note is not null
   and char_length(note) between 1 and 2000 and note=btrim(note)
   and note !~ '[\x01-\x08\x0B\x0C\x0E-\x1F]'))
);
create index ecommerce_decisions_review_idx on app_private.ecommerce_customer_decisions(workspace_id,review_id);
create unique index ecommerce_decisions_acceptance_idx on app_private.ecommerce_customer_decisions(workspace_id,review_id) where kind='acceptance';
alter table app_private.ecommerce_customer_decisions enable row level security;
alter table app_private.ecommerce_customer_decisions force row level security;
create policy ecommerce_decisions_read on app_private.ecommerce_customer_decisions for select to supermega_trial_backend using (
 workspace_id=current_setting('app.workspace_id',true) and
 (app_private.ecommerce_review_operator_entitled() or
 (actor_id=current_setting('app.actor_id',true) and app_private.ecommerce_review_entitled())));
create policy ecommerce_decisions_insert on app_private.ecommerce_customer_decisions for insert to supermega_trial_backend with check (
 workspace_id=current_setting('app.workspace_id',true) and actor_id=current_setting('app.actor_id',true)
 and app_private.ecommerce_review_entitled());
create function app_private.guard_ecommerce_decision() returns trigger
language plpgsql security invoker set search_path=pg_catalog,app_private as $$
declare assignment app_private.ecommerce_customer_reviews%rowtype; identity jsonb;
begin
 if tg_op<>'INSERT' then
  raise exception using errcode='55000',message='ecommerce_decision_history_immutable';
 end if;
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception using errcode='0A000',message='ecommerce_review_requires_read_committed';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('ecommerce-review:' || new.workspace_id,0));
 if new.workspace_id is distinct from current_setting('app.workspace_id',true)
  or new.actor_id is distinct from current_setting('app.actor_id',true)
  or not coalesce(app_private.ecommerce_review_entitled(),false) then
  raise exception using errcode='42501',message='ecommerce_decision_assignment_denied';
 end if;
 select * into assignment from app_private.ecommerce_customer_reviews
  where workspace_id=new.workspace_id and review_id=new.review_id;
 if not found or assignment.status<>'active' or assignment.recipient_actor_id<>new.actor_id
  or assignment.prepared_at>clock_timestamp() or assignment.expires_at<=clock_timestamp()
  or assignment.source_version<>new.source_version or assignment.content_revision<>new.content_revision
  or assignment.preview_digest<>new.preview_digest then
  raise exception using errcode='42501',message='ecommerce_decision_assignment_denied';
 end if;
 if exists(select 1 from app_private.ecommerce_customer_decisions
  where workspace_id=new.workspace_id and review_id=new.review_id
    and (kind='acceptance' or new.kind='acceptance')) then
  raise exception using errcode='55000',message='ecommerce_decision_already_recorded';
 end if;
 identity:=jsonb_build_object('contract',case when new.kind='acceptance' then
  'supermega.ecommerce.customer-acceptance.v1' else 'supermega.ecommerce.customer-feedback.v1' end,
  'workspaceId',new.workspace_id,'actorId',new.actor_id,'commandId',new.command_id::text,
  'reviewId',new.review_id::text,'sourceVersion',new.source_version,'contentRevision',new.content_revision,
  'previewDigest',new.preview_digest);
 identity:=identity || case when new.kind='acceptance' then
  jsonb_build_object('decision','accept_preview_for_release_review') else jsonb_build_object('note',new.note) end;
 if new.command_fingerprint is distinct from 'sha256:' || encode(sha256(convert_to(
  app_private.website_review_json(identity),'UTF8')),'hex') then
  raise exception using errcode='22023',message='ecommerce_decision_fingerprint_invalid';
 end if;
 new.created_at:=clock_timestamp();
 return new;
end;
$$;
create trigger ecommerce_decision_guard before insert or update or delete on app_private.ecommerce_customer_decisions
 for each row execute function app_private.guard_ecommerce_decision();
revoke all on app_private.ecommerce_customer_decisions from public,anon,authenticated,service_role;
grant select,insert on app_private.ecommerce_customer_decisions to supermega_trial_backend;
revoke all on function app_private.guard_ecommerce_decision() from public,anon,authenticated,service_role;
grant execute on function app_private.guard_ecommerce_decision() to supermega_trial_backend;
commit;
