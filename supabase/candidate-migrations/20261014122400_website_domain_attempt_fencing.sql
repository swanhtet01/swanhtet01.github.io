-- Corrective migration for the candidate custom-domain binding. Keep the
-- original migration immutable: claim attempts and provider attachment need
-- fencing even when a previous worker or browser request finishes late.
begin;

-- An outbound add is a durable intent before the network request begins. A
-- timeout or process death must leave this token in place: no finite local TTL
-- proves a provider cannot finish its already-accepted request later.
alter table app_private.website_domain_bindings
  add column provider_add_token uuid,
  add column provider_add_started_at timestamptz,
  add column provider_remove_token uuid,
  add column provider_remove_started_at timestamptz,
  add constraint website_domain_add_intent_consistent check
    ((provider_add_token is null)=(provider_add_started_at is null)),
  add constraint website_domain_remove_intent_consistent check
    ((provider_remove_token is null)=(provider_remove_started_at is null)),
  add constraint website_domain_released_add_settled check
    (state<>'released' or (provider_add_token is null and provider_remove_token is null));

create function app_private.begin_website_domain_provider_add(
  p_binding uuid,p_challenge text,p_token uuid
) returns boolean language plpgsql security definer
set search_path=pg_catalog,app_private as $$
declare workspace text := current_setting('app.workspace_id',true);
begin
  if p_binding is null or p_challenge is null or p_token is null
    or app_private.website_review_can('website.write') is distinct from true
    or app_private.workspace_is_active(workspace) is distinct from true then
    raise exception 'website_domain_access_denied' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('website-inquiry:' || workspace,0));
  update app_private.website_domain_bindings b set
    provider_add_token=p_token,provider_add_started_at=clock_timestamp(),
    state='pending',verified_until=null,renewal_checked_at=null,issue='provider_add_pending'
    where b.binding_id=p_binding and b.workspace_id=workspace
      and b.challenge=p_challenge and b.state in ('pending','active')
      and b.provider_add_token is null and b.provider_remove_token is null;
  return found;
end;
$$;

-- Only the caller that received a definite provider.add success may settle
-- its exact token. A provider GET showing absence or presence is not proof
-- that an older accepted POST cannot still complete later.
create function app_private.settle_website_domain_provider_add(
  p_binding uuid,p_challenge text,p_token uuid
) returns boolean language plpgsql security definer
set search_path=pg_catalog,app_private as $$
declare workspace text := current_setting('app.workspace_id',true);
begin
  if p_binding is null or p_challenge is null or p_token is null
    or app_private.website_review_can('website.write') is distinct from true
    or app_private.workspace_is_active(workspace) is distinct from true then
    raise exception 'website_domain_access_denied' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('website-inquiry:' || workspace,0));
  update app_private.website_domain_bindings b set
    provider_add_token=null,provider_add_started_at=null,
    issue=case when b.state='releasing' then 'provider_cleanup_pending'
      else 'provider_verification_pending' end
    where b.binding_id=p_binding and b.workspace_id=workspace
      and b.challenge=p_challenge and b.state in ('pending','releasing')
      and b.provider_add_token=p_token;
  return found;
end;
$$;

-- No other check may activate a site while an add outcome is unresolved.
create or replace function app_private.record_website_domain_check(
  p_binding uuid,p_challenge text,p_verified boolean,p_dns jsonb,p_issue text
) returns void language plpgsql security definer
set search_path=pg_catalog,app_private as $$
declare workspace text := current_setting('app.workspace_id',true);
begin
  if app_private.website_review_can('website.write') is distinct from true
    or app_private.workspace_is_active(workspace) is distinct from true
    or p_issue is null or p_issue !~ '^[a-z_]{0,40}$'
    or (p_dns is not null and (jsonb_typeof(p_dns)<>'object'
      or coalesce(p_dns->>'type','') not in ('A','CNAME','TXT')
      or p_dns->>'name' is null or length(p_dns->>'name') not between 4 and 253
      or p_dns->>'value' is null or length(p_dns->>'value') not between 1 and 512)) then
    raise exception 'website_domain_invalid' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('website-inquiry:' || workspace,0));
  update app_private.website_domain_bindings b set
    state=case when p_verified and c.enabled then 'active' else 'pending' end,
    verified_until=case when p_verified and c.enabled then clock_timestamp()+interval '24 hours' else null end,
    last_verified_at=case when p_verified and c.enabled then clock_timestamp() else b.last_verified_at end,
    renewal_checked_at=null,dns_record=p_dns,issue=p_issue
    from app_private.website_inquiry_channels c
    where b.binding_id=p_binding and b.workspace_id=workspace and b.state in ('pending','active')
      and b.challenge=p_challenge and b.provider_add_token is null
      and c.workspace_id=b.workspace_id and c.channel_id=b.channel_id;
  if not found then raise exception 'website_domain_changed' using errcode='40001'; end if;
end;
$$;

-- The old two-argument completion cannot distinguish a current renewal from
-- an older worker that wakes after a retry. Retain it for migration history,
-- but remove the runtime role's ability to call either unfenced entry point.
revoke execute on function app_private.claim_website_domain_renewals(integer),
  app_private.complete_website_domain_renewal(uuid,text)
  from supermega_trial_backend;

create function app_private.claim_website_domain_renewals_v2(p_limit integer)
returns table(binding_id uuid,hostname text,challenge text,attempt_at timestamptz)
language plpgsql security definer set search_path=pg_catalog,app_private as $$
begin
  if p_limit is null or p_limit not between 1 and 20 then
    raise exception 'website_domain_invalid' using errcode='22023';
  end if;
  return query
    with due as (
      select b.binding_id
      from app_private.website_domain_bindings b
      join app_private.website_inquiry_channels c
        on c.workspace_id=b.workspace_id and c.channel_id=b.channel_id
      where b.state='active' and b.provider_add_token is null
        and b.verified_until<=clock_timestamp()+interval '12 hours'
        and (b.renewal_checked_at is null
          or b.renewal_checked_at<=clock_timestamp()-interval '30 minutes')
        and c.enabled and app_private.workspace_is_active(b.workspace_id)
      order by b.verified_until,b.binding_id
      limit p_limit for update of b skip locked
    )
    update app_private.website_domain_bindings b
      set renewal_checked_at=clock_timestamp()
      from due where b.binding_id=due.binding_id
      returning b.binding_id,b.hostname,b.challenge,b.renewal_checked_at;
end;
$$;

-- Exact timestamp equality fences retry A after retry B claims the same row.
-- The 30-minute freshness bound also rejects A if no worker has reclaimed it.
create function app_private.complete_website_domain_renewal_v2(
  p_binding uuid,p_challenge text,p_attempt_at timestamptz
) returns boolean language plpgsql security definer
set search_path=pg_catalog,app_private as $$
declare workspace text;
begin
  if p_binding is null or p_challenge is null or p_attempt_at is null then
    raise exception 'website_domain_invalid' using errcode='22023';
  end if;
  select b.workspace_id into workspace from app_private.website_domain_bindings b
    where b.binding_id=p_binding;
  if not found then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('website-inquiry:' || workspace,0));
  update app_private.website_domain_bindings b set
    verified_until=clock_timestamp()+interval '24 hours',
    last_verified_at=clock_timestamp(),renewal_checked_at=null,issue=''
    from app_private.website_inquiry_channels c
    where b.binding_id=p_binding and b.workspace_id=workspace
      and b.challenge=p_challenge and b.state='active'
      and b.provider_add_token is null
      and b.renewal_checked_at=p_attempt_at
      and p_attempt_at>clock_timestamp()-interval '30 minutes'
      and p_attempt_at<=clock_timestamp()
      and c.workspace_id=b.workspace_id and c.channel_id=b.channel_id
      and c.enabled and app_private.workspace_is_active(b.workspace_id);
  return found;
end;
$$;

-- A release has its own durable outbound DELETE token. Concurrent release
-- requests cannot race a newly claimed tenant's attachment; an ambiguous
-- timeout cannot be retried and freed by guessing that the first DELETE ended.
revoke execute on function app_private.begin_website_domain_release(text),
  app_private.finish_website_domain_release(text)
  from supermega_trial_backend;

create function app_private.begin_website_domain_release_v2(p_hostname text,p_token uuid)
returns boolean language plpgsql security definer
set search_path=pg_catalog,app_private as $$
declare workspace text := current_setting('app.workspace_id',true);
  pending_add uuid;
  pending_remove uuid;
begin
  if p_token is null or app_private.website_review_can('website.write') is distinct from true
    or app_private.workspace_is_active(workspace) is distinct from true then
    raise exception 'website_domain_access_denied' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('website-inquiry:' || workspace,0));
  select b.provider_add_token,b.provider_remove_token
    into pending_add,pending_remove
    from app_private.website_domain_bindings b
    where b.hostname=p_hostname and b.workspace_id=workspace and b.state<>'released'
    for update;
  if not found then raise exception 'website_domain_changed' using errcode='40001'; end if;
  update app_private.website_domain_bindings b set
    state='releasing',verified_until=null,renewal_checked_at=null,issue='provider_cleanup_pending',
    provider_remove_token=case when b.provider_add_token is null and b.provider_remove_token is null
      then p_token else b.provider_remove_token end,
    provider_remove_started_at=case when b.provider_add_token is null
      and b.provider_remove_token is null then clock_timestamp() else b.provider_remove_started_at end
    where b.hostname=p_hostname and b.workspace_id=workspace and b.state<>'released';
  -- Return true only to the transaction that created a fresh DELETE intent.
  -- Reusing the same UUID cannot launch a second outbound delete.
  return pending_add is null and pending_remove is null;
end;
$$;

create function app_private.finish_website_domain_release_v2(p_hostname text,p_token uuid)
returns void language plpgsql security definer
set search_path=pg_catalog,app_private as $$
declare workspace text := current_setting('app.workspace_id',true);
begin
  if p_token is null or app_private.website_review_can('website.write') is distinct from true
    or app_private.workspace_is_active(workspace) is distinct from true then
    raise exception 'website_domain_access_denied' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('website-inquiry:' || workspace,0));
  update app_private.website_domain_bindings set state='released',verified_until=null,
    released_at=clock_timestamp(),issue='',provider_remove_token=null,provider_remove_started_at=null
    where hostname=p_hostname and workspace_id=workspace and state='releasing'
      and provider_add_token is null and provider_remove_token=p_token;
  if not found then raise exception 'website_domain_changed' using errcode='40001'; end if;
end;
$$;

revoke all on function app_private.claim_website_domain_renewals_v2(integer),
  app_private.complete_website_domain_renewal_v2(uuid,text,timestamptz)
  from public,anon,authenticated,service_role;
grant execute on function app_private.claim_website_domain_renewals_v2(integer),
  app_private.complete_website_domain_renewal_v2(uuid,text,timestamptz)
  to supermega_trial_backend;
revoke all on function app_private.begin_website_domain_provider_add(uuid,text,uuid),
  app_private.settle_website_domain_provider_add(uuid,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function app_private.begin_website_domain_provider_add(uuid,text,uuid),
  app_private.settle_website_domain_provider_add(uuid,text,uuid)
  to supermega_trial_backend;
revoke all on function app_private.begin_website_domain_release_v2(text,uuid),
  app_private.finish_website_domain_release_v2(text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function app_private.begin_website_domain_release_v2(text,uuid),
  app_private.finish_website_domain_release_v2(text,uuid)
  to supermega_trial_backend;

commit;
