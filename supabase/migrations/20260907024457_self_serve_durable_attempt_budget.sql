-- Additive v13 capability, not a tenant-schema version change. Apply separately
-- through the owner-gated migration flow; no signup/activation window is opened.
begin;

create table app_private.self_serve_attempt_budgets (
  actor_id uuid primary key,
  attempts timestamptz[] not null default '{}',
  claim_conflicts timestamptz[] not null default '{}',
  constraint self_serve_attempt_budget_bounded check (
    cardinality(attempts) <= 5
    and cardinality(claim_conflicts) <= cardinality(attempts)
    and array_position(attempts, null) is null
    and array_position(claim_conflicts, null) is null
    and claim_conflicts <@ attempts
  )
);
alter table app_private.self_serve_attempt_budgets enable row level security;
alter table app_private.self_serve_attempt_budgets force row level security;
revoke all on app_private.self_serve_attempt_budgets from public, anon, authenticated;
grant select, insert on app_private.self_serve_attempt_budgets to supermega_trial_backend;
grant update (attempts, claim_conflicts) on app_private.self_serve_attempt_budgets
  to supermega_trial_backend;

create policy self_serve_attempt_budget_actor_only
on app_private.self_serve_attempt_budgets for all to supermega_trial_backend
using (
  actor_id = nullif(current_setting('app.actor_id', true), '')::uuid
  and current_setting('app.actor_kind', true) = 'human'
)
with check (
  actor_id = nullif(current_setting('app.actor_id', true), '')::uuid
  and current_setting('app.actor_kind', true) = 'human'
);

-- Explicit invoker rights: no privileged path around forced RLS. Runtime binds
-- the verified actor/session first. No email, IP, claim, business or token stored.
create function app_private.reserve_self_serve_attempt()
returns timestamptz language plpgsql security invoker set search_path = ''
as $$
declare
  actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
  previous timestamptz[];
  recent timestamptz[];
  stamp timestamptz;
begin
  if actor is null or current_setting('app.actor_kind', true) is distinct from 'human' then
    raise exception 'self_serve_budget_actor_required';
  end if;
  insert into app_private.self_serve_attempt_budgets (actor_id) values (actor)
    on conflict (actor_id) do nothing;
  -- READ COMMITTED + row lock means a waiter sees the prior committed budget.
  select attempts into strict previous from app_private.self_serve_attempt_budgets
    where actor_id = actor for update;
  -- Read the database clock AFTER the lock, not transaction start / client time.
  stamp := clock_timestamp();
  if exists (select 1 from unnest(previous) t where t >= stamp) then
    raise exception 'self_serve_budget_clock_invalid';
  end if;
  select coalesce(array_agg(t order by t), '{}'::timestamptz[]) into recent
    from unnest(previous) t where t > stamp - interval '24 hours';
  if cardinality(recent) >= 5 then
    return null;
  end if;
  update app_private.self_serve_attempt_budgets
    set attempts = array_append(recent, stamp),
        claim_conflicts = array(
          select t from unnest(claim_conflicts) t where t = any(recent) order by t
        )
    where actor_id = actor;
  return stamp;
end;
$$;

-- Conflict marking is idempotent and can only refer to an admitted attempt.
-- A crash after the claim transaction can undercount diagnostics, never refund
-- admission. Conflicts are NOT customer/commercial proof or authorization.
create function app_private.mark_self_serve_claim_conflict(admitted_at timestamptz)
returns boolean language plpgsql security invoker set search_path = ''
as $$
declare
  actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
begin
  if actor is null or current_setting('app.actor_kind', true) is distinct from 'human' then
    raise exception 'self_serve_budget_actor_required';
  end if;
  update app_private.self_serve_attempt_budgets
    set claim_conflicts = case when admitted_at = any(claim_conflicts)
      then claim_conflicts else array_append(claim_conflicts, admitted_at) end
    where actor_id = actor and admitted_at = any(attempts);
  return found;
end;
$$;

revoke all on function app_private.reserve_self_serve_attempt() from public, anon, authenticated;
revoke all on function app_private.mark_self_serve_claim_conflict(timestamptz) from public, anon, authenticated;
grant execute on function app_private.reserve_self_serve_attempt() to supermega_trial_backend;
grant execute on function app_private.mark_self_serve_claim_conflict(timestamptz) to supermega_trial_backend;

commit;
