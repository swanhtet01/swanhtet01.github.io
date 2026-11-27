-- Retain the exact ordered upload batch in the same transaction as its cursor
-- and acknowledgements. This migration does not enable connected operation.
do $guard$
begin
  if not exists (
    select 1 from app_private.trial_schema_meta
    where component = 'private_trial_backend' and schema_version = 15
  ) then
    raise exception 'connected upload batch migration requires v15';
  end if;
end
$guard$;

create table app_private.connected_site_upload_batches (
  workspace_id text not null,
  site_id text not null,
  device_id text not null,
  after_cursor bigint not null check (after_cursor >= 0),
  next_cursor bigint not null check (next_cursor > after_cursor),
  batch_digest text not null check (batch_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default transaction_timestamp(),
  primary key (workspace_id, site_id, device_id, after_cursor, next_cursor),
  unique (workspace_id, site_id, device_id, next_cursor),
  foreign key (workspace_id, site_id, device_id)
    references app_private.connected_site_devices (workspace_id, site_id, device_id)
);

create trigger connected_site_upload_batches_immutable before update or delete
on app_private.connected_site_upload_batches for each row
execute function app_private.reject_connected_site_immutable_mutation();

alter table app_private.connected_site_upload_batches enable row level security;
alter table app_private.connected_site_upload_batches force row level security;

create policy connected_site_upload_batches_backend_read
on app_private.connected_site_upload_batches for select to supermega_trial_backend
using (workspace_id = current_setting('app.workspace_id', true)
  and site_id = current_setting('app.site_id', true));
create policy connected_site_upload_batches_backend_insert
on app_private.connected_site_upload_batches for insert to supermega_trial_backend
with check (workspace_id = current_setting('app.workspace_id', true)
  and site_id = current_setting('app.site_id', true));

grant select, insert on app_private.connected_site_upload_batches
to supermega_trial_backend;
revoke all on app_private.connected_site_upload_batches
from public, anon, authenticated, service_role;

update app_private.trial_schema_meta
set schema_version = 16, applied_at = transaction_timestamp()
where component = 'private_trial_backend' and schema_version = 15;
