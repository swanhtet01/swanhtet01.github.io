-- Optional prepared-review storage. Does not grant membership or expose an API.
-- Customer feedback is not Website approval, publication or hosted acceptance.
begin;
create table app_private.website_customer_reviews (
  review_id uuid primary key,
  workspace_id text not null,
  recipient_actor_id text not null,
  prepared_by text not null,
  source_version bigint not null check (source_version >= 1),
  content_revision bigint not null default 0 check (content_revision >= 0),
  preview jsonb not null check (
    jsonb_typeof(preview) = 'object'
    and preview - array['siteName','pages'] = '{}'::jsonb
    and jsonb_typeof(preview->'siteName') = 'string'
    and jsonb_typeof(preview->'pages') = 'array'
    and jsonb_array_length(preview->'pages') between 1 and 4
  ),
  preview_digest text not null check (preview_digest ~ '^sha256:[0-9a-f]{64}$'),
  prepared_at timestamptz not null default transaction_timestamp(),
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active','stale','revoked')),
  unique (workspace_id, review_id),
  foreign key (workspace_id, recipient_actor_id)
    references app_private.workspace_memberships(workspace_id, actor_id),
  check (expires_at > prepared_at and expires_at <= prepared_at + interval '7 days')
);
create index website_customer_reviews_recipient_idx
  on app_private.website_customer_reviews(workspace_id, recipient_actor_id, review_id);
create index website_customer_reviews_active_idx
  on app_private.website_customer_reviews(workspace_id) where status = 'active';

create table app_private.website_customer_feedback (
  workspace_id text not null,
  actor_id text not null,
  command_id uuid not null,
  review_id uuid not null,
  source_version bigint not null,
  preview_digest text not null check (preview_digest ~ '^sha256:[0-9a-f]{64}$'),
  command_fingerprint text not null check (command_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  note text not null check (length(note) <= 2000 and length(btrim(note,E' \t\r\n')) >= 1 and note = btrim(note)),
  created_at timestamptz not null default transaction_timestamp(),
  primary key (workspace_id, actor_id, command_id),
  foreign key (workspace_id, review_id)
    references app_private.website_customer_reviews(workspace_id, review_id)
);
create index website_customer_feedback_review_idx
  on app_private.website_customer_feedback(workspace_id, review_id, created_at);

-- Canonical JSON for this string/boolean public projection, matching the Python
-- domain serializer (UTF-8, sorted keys, no whitespace, Unicode preserved).
create function app_private.website_review_json(value jsonb) returns text
language sql immutable strict security invoker set search_path = pg_catalog, app_private as $$
  select case jsonb_typeof(value)
    when 'object' then (select '{' || coalesce(string_agg(to_json(key)::text || ':' ||
      app_private.website_review_json(val),',' order by key collate "C"),'') || '}' from jsonb_each(value) fields(key,val))
    when 'array' then (select '[' || coalesce(string_agg(app_private.website_review_json(val),',' order by ordinal),'') || ']'
      from jsonb_array_elements(value) with ordinality elements(val,ordinal))
    else value::text end;
$$;

create function app_private.website_review_can(capability text) returns boolean
language sql stable security invoker set search_path = pg_catalog, app_private as $$
  select current_setting('app.actor_kind',true) = 'human'
    and app_private.workspace_is_active(current_setting('app.workspace_id',true))
    and exists (select 1 from app_private.workspace_memberships m
      where m.workspace_id = current_setting('app.workspace_id',true)
        and m.actor_id = current_setting('app.actor_id',true)
        and m.actor_kind = 'human' and m.status = 'active'
        and capability = any(m.capabilities));
$$;

-- The only privileged lookup: an operator may ask whether one exact recipient
-- can review in the CURRENT workspace. No directory rows or private data return.
-- Owner must remain a trusted migration role; public/browser execution is denied.
create function app_private.website_review_recipient_ready(recipient text) returns boolean
language sql stable security definer set search_path = pg_catalog, app_private as $$
  select current_setting('app.actor_kind',true) = 'human'
    and exists (select 1 from app_private.workspace_access_controls a
      where a.workspace_id = current_setting('app.workspace_id',true) and a.status = 'active')
    and exists (select 1 from app_private.workspace_memberships m
      where m.workspace_id = current_setting('app.workspace_id',true)
        and m.actor_id = current_setting('app.actor_id',true) and m.actor_kind = 'human'
        and m.status = 'active' and 'website.write' = any(m.capabilities))
    and exists (select 1 from app_private.workspace_memberships m
      where m.workspace_id = current_setting('app.workspace_id',true)
        and m.actor_id = recipient and m.actor_kind = 'human'
        and m.status = 'active' and 'website.review' = any(m.capabilities));
$$;

alter table app_private.website_customer_reviews enable row level security;
alter table app_private.website_customer_reviews force row level security;
alter table app_private.website_customer_feedback enable row level security;
alter table app_private.website_customer_feedback force row level security;

create policy website_reviews_read on app_private.website_customer_reviews
for select to supermega_trial_backend using (
  workspace_id = current_setting('app.workspace_id',true)
  and (app_private.website_review_can('website.write') or
    (recipient_actor_id = current_setting('app.actor_id',true)
      and app_private.website_review_can('website.review'))));
create policy website_reviews_insert on app_private.website_customer_reviews
for insert to supermega_trial_backend with check (
  workspace_id = current_setting('app.workspace_id',true)
  and prepared_by = current_setting('app.actor_id',true)
  and app_private.website_review_can('website.write'));
create policy website_reviews_update on app_private.website_customer_reviews
for update to supermega_trial_backend
using (workspace_id = current_setting('app.workspace_id',true) and app_private.website_review_can('website.write'))
with check (workspace_id = current_setting('app.workspace_id',true) and app_private.website_review_can('website.write'));
create policy website_feedback_read on app_private.website_customer_feedback
for select to supermega_trial_backend using (
  workspace_id = current_setting('app.workspace_id',true)
  and (app_private.website_review_can('website.write') or
    (actor_id = current_setting('app.actor_id',true) and app_private.website_review_can('website.review'))));
create policy website_feedback_insert on app_private.website_customer_feedback
for insert to supermega_trial_backend with check (
  workspace_id = current_setting('app.workspace_id',true)
  and actor_id = current_setting('app.actor_id',true)
  and app_private.website_review_can('website.review'));

create function app_private.guard_website_review() returns trigger
language plpgsql security invoker set search_path = pg_catalog, app_private as $$
declare source app_private.workspace_state%rowtype; expected_preview jsonb;
begin
  if tg_op = 'DELETE' then
    raise exception using errcode='55000', message='website_review_history_immutable';
  end if;
  if tg_op = 'INSERT' then
    -- State -> review serialization order, shared with normal Website writes.
    select * into source from app_private.workspace_state
      where workspace_id = new.workspace_id and surface = 'website' for update;
    if not found or source.version <> new.source_version then
      raise exception using errcode='40001', message='website_review_source_stale';
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('website-review:' || new.workspace_id,0));
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'status') <> (to_jsonb(old) - 'status')
      or old.status = 'revoked'
      or not (new.status = 'revoked' or (new.status = 'stale' and pg_trigger_depth() > 1)) then
      raise exception using errcode='55000', message='website_review_history_immutable';
    end if;
    return new;
  end if;
  if new.status <> 'active' or new.prepared_by <> current_setting('app.actor_id',true)
    or not app_private.website_review_recipient_ready(new.recipient_actor_id) then
    raise exception using errcode='42501', message='website_review_recipient_denied';
  end if;
  select jsonb_build_object('siteName',source.state_json->'siteName','pages',coalesce(
    jsonb_agg(jsonb_build_object('id',p->'id','slug',case when rtrim(p->>'slug','/') = '' then '/' else rtrim(p->>'slug','/') end,
      'navigation',p->'navigation','hero',p->'hero','sections',p->'sections','seo',p->'seo') order by ordinal)
      filter (where p->>'stage' = 'ready'),'[]'::jsonb)) into expected_preview
    from jsonb_array_elements(source.state_json->'pages') with ordinality pages(p,ordinal);
  if new.preview <> expected_preview or new.preview_digest <>
    'sha256:' || encode(sha256(convert_to(app_private.website_review_json(expected_preview),'UTF8')),'hex') then
    raise exception using errcode='22023', message='website_review_projection_mismatch';
  end if;
  new.prepared_at := clock_timestamp();
  new.content_revision := (source.state_json->>'contentRevision')::bigint;
  return new;
end;
$$;
create trigger website_review_guard before insert or update or delete
  on app_private.website_customer_reviews for each row execute function app_private.guard_website_review();

create function app_private.invalidate_website_reviews() returns trigger
language plpgsql security invoker set search_path = pg_catalog, app_private as $$
begin
  if old.surface = 'website' then
    perform pg_advisory_xact_lock(hashtextextended('website-review:' || old.workspace_id,0));
    update app_private.website_customer_reviews set status = 'stale'
      where workspace_id = old.workspace_id and status = 'active';
  end if;
  return null;
end;
$$;
create trigger website_reviews_invalidate after update or delete on app_private.workspace_state
  for each row execute function app_private.invalidate_website_reviews();

create function app_private.guard_website_feedback() returns trigger
language plpgsql security invoker set search_path = pg_catalog, app_private as $$
declare assignment app_private.website_customer_reviews%rowtype;
begin
  if tg_op <> 'INSERT' then
    raise exception using errcode='55000', message='website_feedback_history_immutable';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('website-review:' || new.workspace_id,0));
  select * into assignment from app_private.website_customer_reviews
    where workspace_id = new.workspace_id and review_id = new.review_id;
  if not found or assignment.status <> 'active' or assignment.expires_at <= clock_timestamp()
    or assignment.recipient_actor_id <> current_setting('app.actor_id',true)
    or new.actor_id <> current_setting('app.actor_id',true)
    or assignment.source_version <> new.source_version or assignment.preview_digest <> new.preview_digest then
    raise exception using errcode='42501', message='website_feedback_assignment_denied';
  end if;
  new.created_at := clock_timestamp();
  return new;
end;
$$;
create trigger website_feedback_guard before insert or update or delete
  on app_private.website_customer_feedback for each row execute function app_private.guard_website_feedback();

revoke all on app_private.website_customer_reviews, app_private.website_customer_feedback
  from public, anon, authenticated, service_role;
grant select, insert, update on app_private.website_customer_reviews to supermega_trial_backend;
grant select, insert on app_private.website_customer_feedback to supermega_trial_backend;
revoke all on function app_private.website_review_json(jsonb), app_private.website_review_can(text), app_private.website_review_recipient_ready(text),
  app_private.guard_website_review(), app_private.invalidate_website_reviews(), app_private.guard_website_feedback()
  from public, anon, authenticated, service_role;
grant execute on function app_private.website_review_json(jsonb), app_private.website_review_can(text), app_private.website_review_recipient_ready(text),
  app_private.guard_website_review(), app_private.invalidate_website_reviews(), app_private.guard_website_feedback()
  to supermega_trial_backend;
commit;
