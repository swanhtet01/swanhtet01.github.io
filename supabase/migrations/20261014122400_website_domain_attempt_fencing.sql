-- Corrective migration for the candidate custom-domain binding. Keep the
-- original migration immutable: claim attempts and provider attachment need
-- fencing even when a previous worker or browser request finishes late.
begin;

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
      where b.state='active' and b.verified_until<=clock_timestamp()+interval '12 hours'
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
      and b.renewal_checked_at=p_attempt_at
      and p_attempt_at>clock_timestamp()-interval '30 minutes'
      and p_attempt_at<=clock_timestamp()
      and c.workspace_id=b.workspace_id and c.channel_id=b.channel_id
      and c.enabled and app_private.workspace_is_active(b.workspace_id);
  return found;
end;
$$;

-- A check holds this hostname lock through provider.add and the final local
-- record. Releasing takes it first, so a release cannot detach before a
-- concurrent add settles, then free the hostname for another tenant.
create or replace function app_private.begin_website_domain_release(p_hostname text)
returns void language plpgsql security definer
set search_path=pg_catalog,app_private as $$
declare workspace text := current_setting('app.workspace_id',true);
begin
  if app_private.website_review_can('website.write') is distinct from true
    or app_private.workspace_is_active(workspace) is distinct from true then
    raise exception 'website_domain_access_denied' using errcode='42501';
  end if;
  perform set_config('lock_timeout','30s',true);
  perform pg_advisory_xact_lock(hashtextextended('website-domain-ops:' || p_hostname,0));
  perform pg_advisory_xact_lock(hashtextextended('website-inquiry:' || workspace,0));
  update app_private.website_domain_bindings set state='releasing',verified_until=null,
    renewal_checked_at=null,issue='provider_cleanup_pending'
    where hostname=p_hostname and workspace_id=workspace and state<>'released';
  if not found then raise exception 'website_domain_changed' using errcode='40001'; end if;
end;
$$;

revoke all on function app_private.claim_website_domain_renewals_v2(integer),
  app_private.complete_website_domain_renewal_v2(uuid,text,timestamptz)
  from public,anon,authenticated,service_role;
grant execute on function app_private.claim_website_domain_renewals_v2(integer),
  app_private.complete_website_domain_renewal_v2(uuid,text,timestamptz)
  to supermega_trial_backend;

commit;
