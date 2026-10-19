create or replace function app_private.guard_ecommerce_review() returns trigger
language plpgsql security invoker set search_path = pg_catalog, app_private as $$
declare source app_private.workspace_state%rowtype; expected_preview jsonb;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode='0A000', message='ecommerce_review_requires_read_committed';
  end if;
  if tg_op = 'DELETE' then
    raise exception using errcode='55000', message='ecommerce_review_history_immutable';
  end if;
  if tg_op = 'INSERT' then
    -- Match Shop state writers without requiring commerce.write for a reviewer.
    perform pg_advisory_xact_lock(
      hashtextextended(new.workspace_id::text || ':state:commerce', 0));
    select * into source from app_private.workspace_state
      where workspace_id = new.workspace_id and surface = 'commerce';
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
