begin;

-- Shop correction global-consumption authority. This migration only creates
-- fail-closed storage and tenant/owner boundaries. It does not enable the
-- application gate, configure signing keys, move money, or mutate a Shop
-- device database. Applying it anywhere remains a separately authorized act.

do $guard$
begin
  if not exists (
    select 1 from app_private.trial_schema_meta
    where component = 'private_trial_backend' and schema_version = 13
  ) then
    raise exception using errcode = '55000',
      message = 'private trial backend v14 requires schema version 13';
  end if;
end
$guard$;

create table app_private.shop_correction_lineages (
  workspace_id text not null,
  lineage_id uuid not null,
  lineage_epoch bigint not null check (lineage_epoch >= 1),
  activation_request_id uuid not null,
  activation_fingerprint text not null check (activation_fingerprint ~ '^[0-9a-f]{64}$'),
  actor_id text not null,
  actor_kind text not null check (actor_kind = 'human'),
  previous_lineage_id uuid,
  previous_lineage_epoch bigint,
  initial_consumption_ordinal bigint not null check (initial_consumption_ordinal >= 0),
  initial_consumption_digest text check (initial_consumption_digest ~ '^[0-9a-f]{64}$'),
  current_consumption_ordinal bigint not null check (current_consumption_ordinal >= 0),
  current_consumption_digest text check (current_consumption_digest ~ '^[0-9a-f]{64}$'),
  activated_at timestamptz not null default transaction_timestamp(),
  superseded_at timestamptz,
  primary key (workspace_id, lineage_id),
  constraint shop_correction_lineage_identity_epoch_key
    unique (workspace_id, lineage_id, lineage_epoch),
  constraint shop_correction_lineage_epoch_key
    unique (workspace_id, lineage_epoch),
  constraint shop_correction_lineage_activation_key
    unique (workspace_id, activation_request_id),
  constraint shop_correction_lineage_previous_fkey
    foreign key (workspace_id, previous_lineage_id, previous_lineage_epoch)
    references app_private.shop_correction_lineages
      (workspace_id, lineage_id, lineage_epoch),
  check (workspace_id = btrim(workspace_id) and workspace_id <> ''),
  check (actor_id = btrim(actor_id) and actor_id <> ''),
  check ((previous_lineage_id is null) = (previous_lineage_epoch is null)),
  check ((lineage_epoch = 1 and previous_lineage_id is null)
      or (lineage_epoch > 1 and previous_lineage_id is not null
          and previous_lineage_epoch = lineage_epoch - 1)),
  check ((initial_consumption_ordinal = 0) = (initial_consumption_digest is null)),
  check ((current_consumption_ordinal = 0) = (current_consumption_digest is null)),
  check (current_consumption_ordinal >= initial_consumption_ordinal)
);

create unique index shop_correction_one_active_lineage_idx
  on app_private.shop_correction_lineages (workspace_id)
  where superseded_at is null;

create table app_private.shop_correction_consumptions (
  workspace_id text not null,
  consumption_id uuid not null,
  consumption_request_id uuid not null,
  authorization_receipt_id uuid not null,
  authorization_receipt_digest text not null check (authorization_receipt_digest ~ '^[0-9a-f]{64}$'),
  actor_id text not null,
  actor_kind text not null check (actor_kind = 'human'),
  capability text not null check (capability in ('shop.sale.reverse', 'shop.sale.reconcile_wallet')),
  semantic_target_id text not null,
  command_id uuid not null,
  command_digest text not null check (command_digest ~ '^[0-9a-f]{64}$'),
  lineage_id uuid not null,
  lineage_epoch bigint not null check (lineage_epoch >= 1),
  consumption_ordinal bigint not null check (consumption_ordinal >= 1),
  previous_consumption_digest text check (previous_consumption_digest ~ '^[0-9a-f]{64}$'),
  history_digest text not null check (history_digest ~ '^[0-9a-f]{64}$'),
  consumed_at timestamptz not null default transaction_timestamp(),
  consumed_at_millis bigint not null check (consumed_at_millis > 0),
  key_id text not null,
  signature text not null,
  primary key (workspace_id, consumption_id),
  constraint shop_correction_consumption_request_key
    unique (workspace_id, consumption_request_id),
  constraint shop_correction_consumption_receipt_key
    unique (workspace_id, authorization_receipt_id),
  constraint shop_correction_consumption_command_key
    unique (workspace_id, command_id),
  constraint shop_correction_consumption_ordinal_key
    unique (workspace_id, lineage_id, consumption_ordinal),
  constraint shop_correction_consumption_history_key
    unique (workspace_id, history_digest),
  constraint shop_correction_consumption_lineage_fkey
    foreign key (workspace_id, lineage_id)
    references app_private.shop_correction_lineages (workspace_id, lineage_id),
  constraint shop_correction_consumption_lineage_epoch_fkey
    foreign key (workspace_id, lineage_id, lineage_epoch)
    references app_private.shop_correction_lineages
      (workspace_id, lineage_id, lineage_epoch),
  check (workspace_id = btrim(workspace_id) and workspace_id <> ''),
  check (actor_id = btrim(actor_id) and actor_id <> ''),
  check (semantic_target_id = btrim(semantic_target_id)
      and semantic_target_id <> '' and length(semantic_target_id) <= 120),
  check (key_id = btrim(key_id) and key_id <> '' and length(key_id) <= 120),
  check (signature = btrim(signature) and signature <> '' and length(signature) <= 256),
  check ((consumption_ordinal = 1) = (previous_consumption_digest is null))
);

create function app_private.guard_shop_correction_lineage()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app_private
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'shop correction lineages cannot be deleted';
  end if;
  if tg_op = 'INSERT' then
    new.activated_at := transaction_timestamp();
    new.superseded_at := null;
    if new.current_consumption_ordinal <> new.initial_consumption_ordinal
       or new.current_consumption_digest is distinct from new.initial_consumption_digest then
      raise exception using errcode = '55000', message = 'shop correction lineage must start at its accepted watermark';
    end if;
    if new.lineage_epoch = 1 then
      if new.previous_lineage_id is not null
         or new.initial_consumption_ordinal <> 0
         or new.initial_consumption_digest is not null
         or exists (
           select 1 from app_private.shop_correction_lineages prior
           where prior.workspace_id = new.workspace_id
         ) then
        raise exception using errcode = '55000', message = 'initial shop correction lineage must start from an empty workspace watermark';
      end if;
    elsif not exists (
      select 1 from app_private.shop_correction_lineages prior
      where prior.workspace_id = new.workspace_id
        and prior.lineage_id = new.previous_lineage_id
        and prior.lineage_epoch = new.previous_lineage_epoch
        and prior.superseded_at is not null
        and prior.current_consumption_ordinal = new.initial_consumption_ordinal
        and prior.current_consumption_digest is not distinct from new.initial_consumption_digest
    ) then
      raise exception using errcode = '55000', message = 'restored shop correction lineage must preserve the exact prior watermark';
    end if;
    return new;
  end if;
  if new.workspace_id is distinct from old.workspace_id
     or new.lineage_id is distinct from old.lineage_id
     or new.lineage_epoch is distinct from old.lineage_epoch
     or new.activation_request_id is distinct from old.activation_request_id
     or new.activation_fingerprint is distinct from old.activation_fingerprint
     or new.actor_id is distinct from old.actor_id
     or new.actor_kind is distinct from old.actor_kind
     or new.previous_lineage_id is distinct from old.previous_lineage_id
     or new.previous_lineage_epoch is distinct from old.previous_lineage_epoch
     or new.initial_consumption_ordinal is distinct from old.initial_consumption_ordinal
     or new.initial_consumption_digest is distinct from old.initial_consumption_digest
     or new.activated_at is distinct from old.activated_at then
    raise exception using errcode = '55000', message = 'shop correction lineage identity is immutable';
  end if;
  if old.superseded_at is null and new.superseded_at is not null then
    if new.current_consumption_ordinal is distinct from old.current_consumption_ordinal
       or new.current_consumption_digest is distinct from old.current_consumption_digest then
      raise exception using errcode = '55000', message = 'lineage supersession cannot alter its watermark';
    end if;
    new.superseded_at := transaction_timestamp();
    return new;
  end if;
  if old.superseded_at is null and new.superseded_at is null
     and new.current_consumption_ordinal = old.current_consumption_ordinal + 1
     and new.current_consumption_digest is not null
     and exists (
       select 1
       from app_private.shop_correction_consumptions consumption
       where consumption.workspace_id = old.workspace_id
         and consumption.lineage_id = old.lineage_id
         and consumption.lineage_epoch = old.lineage_epoch
         and consumption.consumption_ordinal = new.current_consumption_ordinal
         and consumption.previous_consumption_digest is not distinct from old.current_consumption_digest
         and consumption.history_digest = new.current_consumption_digest
     ) then
    return new;
  end if;
  raise exception using errcode = '40001', message = 'invalid shop correction lineage transition';
end
$function$;

create trigger shop_correction_lineage_guard
before insert or update or delete on app_private.shop_correction_lineages
for each row execute function app_private.guard_shop_correction_lineage();

create function app_private.guard_shop_correction_consumption()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app_private
as $function$
begin
  if tg_op <> 'INSERT' then
    raise exception using errcode = '55000', message = 'shop correction consumptions are immutable';
  end if;
  new.consumed_at := transaction_timestamp();
  new.consumed_at_millis := floor(extract(epoch from new.consumed_at) * 1000)::bigint;
  return new;
end
$function$;

create trigger shop_correction_consumption_guard
before insert or update or delete on app_private.shop_correction_consumptions
for each row execute function app_private.guard_shop_correction_consumption();

alter table app_private.shop_correction_lineages enable row level security;
alter table app_private.shop_correction_lineages force row level security;
alter table app_private.shop_correction_consumptions enable row level security;
alter table app_private.shop_correction_consumptions force row level security;

create policy shop_correction_lineages_owner_read
on app_private.shop_correction_lineages
for select to supermega_trial_backend
using (
  workspace_id = (select current_setting('app.workspace_id', true))
  and (select current_setting('app.actor_kind', true)) = 'human'
  and exists (
    select 1 from app_private.workspace_memberships membership
    where membership.workspace_id = shop_correction_lineages.workspace_id
      and membership.actor_id = (select current_setting('app.actor_id', true))
      and membership.actor_kind = 'human'
      and membership.status = 'active'
      and 'commerce.write' = any(membership.capabilities)
  )
  and exists (
    select 1 from app_private.workspace_access_controls access
    where access.workspace_id = shop_correction_lineages.workspace_id
      and access.status = 'active'
      and access.owner_actor_id = (select current_setting('app.actor_id', true))
  )
);

create policy shop_correction_lineages_owner_insert
on app_private.shop_correction_lineages
for insert to supermega_trial_backend
with check (
  workspace_id = (select current_setting('app.workspace_id', true))
  and actor_id = (select current_setting('app.actor_id', true))
  and actor_kind = 'human'
  and (select current_setting('app.actor_kind', true)) = 'human'
  and exists (
    select 1 from app_private.workspace_memberships membership
    where membership.workspace_id = shop_correction_lineages.workspace_id
      and membership.actor_id = (select current_setting('app.actor_id', true))
      and membership.actor_kind = 'human'
      and membership.status = 'active'
      and 'commerce.write' = any(membership.capabilities)
  )
  and exists (
    select 1 from app_private.workspace_access_controls access
    where access.workspace_id = shop_correction_lineages.workspace_id
      and access.status = 'active'
      and access.owner_actor_id = (select current_setting('app.actor_id', true))
  )
);

create policy shop_correction_lineages_owner_update
on app_private.shop_correction_lineages
for update to supermega_trial_backend
using (
  workspace_id = (select current_setting('app.workspace_id', true))
  and (select current_setting('app.actor_kind', true)) = 'human'
  and exists (
    select 1 from app_private.workspace_memberships membership
    where membership.workspace_id = shop_correction_lineages.workspace_id
      and membership.actor_id = (select current_setting('app.actor_id', true))
      and membership.actor_kind = 'human'
      and membership.status = 'active'
      and 'commerce.write' = any(membership.capabilities)
  )
  and exists (
    select 1 from app_private.workspace_access_controls access
    where access.workspace_id = shop_correction_lineages.workspace_id
      and access.status = 'active'
      and access.owner_actor_id = (select current_setting('app.actor_id', true))
  )
)
with check (
  workspace_id = (select current_setting('app.workspace_id', true))
  and (select current_setting('app.actor_kind', true)) = 'human'
  and exists (
    select 1 from app_private.workspace_memberships membership
    where membership.workspace_id = shop_correction_lineages.workspace_id
      and membership.actor_id = (select current_setting('app.actor_id', true))
      and membership.actor_kind = 'human'
      and membership.status = 'active'
      and 'commerce.write' = any(membership.capabilities)
  )
  and exists (
    select 1 from app_private.workspace_access_controls access
    where access.workspace_id = shop_correction_lineages.workspace_id
      and access.status = 'active'
      and access.owner_actor_id = (select current_setting('app.actor_id', true))
  )
);

create policy shop_correction_consumptions_owner_read
on app_private.shop_correction_consumptions
for select to supermega_trial_backend
using (
  workspace_id = (select current_setting('app.workspace_id', true))
  and (select current_setting('app.actor_kind', true)) = 'human'
  and exists (
    select 1 from app_private.workspace_memberships membership
    where membership.workspace_id = shop_correction_consumptions.workspace_id
      and membership.actor_id = (select current_setting('app.actor_id', true))
      and membership.actor_kind = 'human'
      and membership.status = 'active'
      and 'commerce.write' = any(membership.capabilities)
  )
  and exists (
    select 1 from app_private.workspace_access_controls access
    where access.workspace_id = shop_correction_consumptions.workspace_id
      and access.status = 'active'
      and access.owner_actor_id = (select current_setting('app.actor_id', true))
  )
);

create policy shop_correction_consumptions_owner_insert
on app_private.shop_correction_consumptions
for insert to supermega_trial_backend
with check (
  workspace_id = (select current_setting('app.workspace_id', true))
  and actor_id = (select current_setting('app.actor_id', true))
  and actor_kind = 'human'
  and (select current_setting('app.actor_kind', true)) = 'human'
  and exists (
    select 1 from app_private.workspace_memberships membership
    where membership.workspace_id = shop_correction_consumptions.workspace_id
      and membership.actor_id = (select current_setting('app.actor_id', true))
      and membership.actor_kind = 'human'
      and membership.status = 'active'
      and 'commerce.write' = any(membership.capabilities)
  )
  and exists (
    select 1 from app_private.workspace_access_controls access
    where access.workspace_id = shop_correction_consumptions.workspace_id
      and access.status = 'active'
      and access.owner_actor_id = (select current_setting('app.actor_id', true))
  )
);

revoke all on app_private.shop_correction_lineages
  from public, anon, authenticated, service_role;
revoke all on app_private.shop_correction_consumptions
  from public, anon, authenticated, service_role;
revoke all on function app_private.guard_shop_correction_lineage()
  from public, anon, authenticated, service_role;
revoke all on function app_private.guard_shop_correction_consumption()
  from public, anon, authenticated, service_role;
grant select, insert, update on app_private.shop_correction_lineages
  to supermega_trial_backend;
grant select, insert on app_private.shop_correction_consumptions
  to supermega_trial_backend;

update app_private.trial_schema_meta
set schema_version = 14, applied_at = transaction_timestamp()
where component = 'private_trial_backend' and schema_version = 13;

do $verify$
begin
  if not exists (
    select 1 from app_private.trial_schema_meta
    where component = 'private_trial_backend' and schema_version = 14
  ) then
    raise exception using errcode = '55000',
      message = 'private trial backend v14 did not reach schema version 14';
  end if;
  if (
    select count(*) from pg_class relation
    join pg_namespace schema_record on schema_record.oid = relation.relnamespace
    where schema_record.nspname = 'app_private'
      and relation.relname in ('shop_correction_lineages', 'shop_correction_consumptions')
      and relation.relrowsecurity and relation.relforcerowsecurity
  ) <> 2 then
    raise exception using errcode = '55000',
      message = 'private trial backend v14 correction tables must force row level security';
  end if;
  if exists (
    select 1
    from unnest(array['shop_correction_lineages', 'shop_correction_consumptions']) table_name,
         unnest(array['anon', 'authenticated', 'service_role']) role_name,
         unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) privilege_name
    where has_table_privilege(role_name, format('app_private.%I', table_name), privilege_name)
  ) then
    raise exception using errcode = '55000',
      message = 'private trial backend v14 correction tables must stay private';
  end if;
  if has_table_privilege('supermega_trial_backend', 'app_private.shop_correction_consumptions', 'UPDATE')
     or has_table_privilege('supermega_trial_backend', 'app_private.shop_correction_consumptions', 'DELETE')
     or has_table_privilege('supermega_trial_backend', 'app_private.shop_correction_lineages', 'DELETE') then
    raise exception using errcode = '55000',
      message = 'private trial backend v14 correction mutation grants are too broad';
  end if;
  if not (
    has_table_privilege('supermega_trial_backend', 'app_private.shop_correction_lineages', 'SELECT')
    and has_table_privilege('supermega_trial_backend', 'app_private.shop_correction_lineages', 'INSERT')
    and has_table_privilege('supermega_trial_backend', 'app_private.shop_correction_lineages', 'UPDATE')
    and has_table_privilege('supermega_trial_backend', 'app_private.shop_correction_consumptions', 'SELECT')
    and has_table_privilege('supermega_trial_backend', 'app_private.shop_correction_consumptions', 'INSERT')
  ) then
    raise exception using errcode = '55000',
      message = 'private trial backend v14 correction grants are incomplete';
  end if;
  if (
    select count(*) from pg_policies
    where schemaname = 'app_private'
      and policyname in (
        'shop_correction_lineages_owner_read',
        'shop_correction_lineages_owner_insert',
        'shop_correction_lineages_owner_update',
        'shop_correction_consumptions_owner_read',
        'shop_correction_consumptions_owner_insert'
      )
      and cmd in ('SELECT', 'INSERT', 'UPDATE')
      and array_to_string(roles, ',') = 'supermega_trial_backend'
  ) <> 5 then
    raise exception using errcode = '55000',
      message = 'private trial backend v14 correction owner policies are incomplete';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'app_private'
      and tablename in ('shop_correction_lineages', 'shop_correction_consumptions')
      and cmd in ('ALL', 'DELETE')
  ) then
    raise exception using errcode = '55000',
      message = 'private trial backend v14 correction delete policies are forbidden';
  end if;
  if (
    select count(*) from pg_trigger trigger_record
    join pg_class relation on relation.oid = trigger_record.tgrelid
    join pg_namespace schema_record on schema_record.oid = relation.relnamespace
    where schema_record.nspname = 'app_private'
      and not trigger_record.tgisinternal
      and (
        (relation.relname = 'shop_correction_lineages'
          and trigger_record.tgname = 'shop_correction_lineage_guard')
        or (relation.relname = 'shop_correction_consumptions'
          and trigger_record.tgname = 'shop_correction_consumption_guard')
      )
  ) <> 2 then
    raise exception using errcode = '55000',
      message = 'private trial backend v14 correction guards are missing';
  end if;
end
$verify$;

commit;
