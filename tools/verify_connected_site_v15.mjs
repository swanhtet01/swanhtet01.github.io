import { readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const loadPGlite = async () => {
  try {
    return (await import('@electric-sql/pglite')).PGlite
  } catch (error) {
    const moduleRoot = process.env.SUPERMEGA_NODE_MODULES
    if (!moduleRoot) throw error
    return createRequire(resolve(moduleRoot, 'package.json'))('@electric-sql/pglite').PGlite
  }
}
const PGlite = await loadPGlite()

const root = resolve(import.meta.dirname, '..')
const migrationDirectory = resolve(root, 'supabase', 'migrations')
const names = (await readdir(migrationDirectory))
  .filter((name) => name.endsWith('.sql') && name !== '20260711081300_public_legacy_baseline.sql')
  .sort()
const checks = []
const requireCheck = (name, condition) => {
  if (!condition) throw new Error(name)
  checks.push(name)
}
const rejected = async (operation) => {
  try { await operation(); return false } catch { return true }
}

const database = new PGlite()
await database.waitReady
await database.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth authorization postgres;
  create table auth.sessions (id uuid primary key, user_id uuid not null);
`)
for (const name of names) {
  await database.exec(await readFile(resolve(migrationDirectory, name), 'utf8'))
}
const version = await database.query(
  "select schema_version from app_private.trial_schema_meta where component = 'private_trial_backend'",
)
requireCheck('connected site source schema is v15', version.rows[0]?.schema_version === 15)
const relations = await database.query(`
  select relation.relname as name, relation.relrowsecurity as rls, relation.relforcerowsecurity as forced
  from pg_class relation join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'app_private' and relation.relkind = 'r'
    and relation.relname in ('connected_sites','connected_site_devices','connected_site_leases',
      'connected_site_commands','connected_site_events','connected_site_acknowledgements',
      'connected_site_conflicts','connected_site_cursors') order by relation.relname
`)
requireCheck(
  'all eight connected site relations force RLS',
  relations.rows.length === 8 && relations.rows.every((row) => row.rls && row.forced),
)
const policies = await database.query(`
  select policyname, roles from pg_policies
  where schemaname = 'app_private' and tablename like 'connected_site%'
`)
requireCheck(
  'connected site policies are backend-only and dimension scoped',
  policies.rows.length === 20 && policies.rows.every((row) =>
    JSON.stringify(row.roles) === JSON.stringify(['supermega_trial_backend'])
  ),
)
const apiAcl = await database.query(`
  select exists (
    select 1 from unnest(array['anon','authenticated','service_role']) role_name,
      unnest(array['connected_sites','connected_site_devices','connected_site_leases',
        'connected_site_commands','connected_site_events','connected_site_acknowledgements',
        'connected_site_conflicts','connected_site_cursors']) relation_name,
      unnest(array['SELECT','INSERT','UPDATE','DELETE']) privilege_name
    where has_table_privilege(role_name, format('app_private.%I', relation_name), privilege_name)
  ) as exposed
`)
requireCheck('connected site catalog is API-dark', apiAcl.rows[0]?.exposed === false)
await database.exec(`
  insert into app_private.connected_sites (
    workspace_id, site_id, protocol_version, authority_generation,
    configuration_generation, revocation_generation, authority_payload_digest
  ) values ('workspace-a','site-a',1,1,1,0,repeat('a',64));
  insert into app_private.connected_site_devices (
    workspace_id, site_id, device_id, signing_key_id, signing_public_key,
    client_fingerprint, enrollment_evidence_digest, coordinator_binding_digest,
    session_generation, status
  ) values ('workspace-a','site-a','device-a','key-a',repeat('A',43),
    repeat('b',64),repeat('c',64),repeat('d',64),1,'active');
  insert into app_private.connected_site_cursors (workspace_id,site_id,device_id)
    values ('workspace-a','site-a','device-a');
  insert into app_private.connected_site_leases (
    workspace_id,site_id,lease_id,actor_id,device_id,role,capabilities,
    session_generation,revocation_generation,configuration_generation,
    issuer_key_id,issuer_public_key,lease_json,lease_digest,issued_at,expires_at,status
  ) values ('workspace-a','site-a','lease-a','actor-a','device-a','cashier',
    array['shop.sale.create'],1,0,1,'issuer-a',repeat('B',43),'{}',repeat('e',64),
    '2026-11-01T00:00:00Z','2026-11-02T00:00:00Z','active');
  insert into app_private.connected_site_commands (
    workspace_id,site_id,command_id,command_digest,command_json,proof_json,
    proof_digest,actor_id,device_id,lease_id,aggregate_type,aggregate_id,
    expected_version,state
  ) values ('workspace-a','site-a','command-a',repeat('f',64),'{}','{}',
    repeat('1',64),'actor-a','device-a','lease-a','sale','sale-a',0,'accepted');
  insert into app_private.connected_site_events (
    workspace_id,site_id,event_sequence,event_id,event_digest,previous_event_digest,
    event_json,command_id,command_digest,aggregate_type,aggregate_id,aggregate_version
  ) values ('workspace-a','site-a',1,'event-a',repeat('2',64),null,'{}',
    'command-a',repeat('f',64),'sale','sale-a',1);
`)
requireCheck(
  'connected mode cannot be enabled by this source migration',
  await rejected(() => database.exec(
    "update app_private.connected_sites set connected_enabled=true where workspace_id='workspace-a' and site_id='site-a'",
  )),
)
await database.exec(`update app_private.connected_site_cursors set upload_cursor=1
  where workspace_id='workspace-a' and site_id='site-a' and device_id='device-a'`)
requireCheck(
  'connected cursors cannot move backwards',
  await rejected(() => database.exec(`update app_private.connected_site_cursors set upload_cursor=0
    where workspace_id='workspace-a' and site_id='site-a' and device_id='device-a'`)),
)
requireCheck(
  'accepted commands and events are immutable',
  await rejected(() => database.exec(`update app_private.connected_site_events
    set event_json='{"changed":true}' where workspace_id='workspace-a' and site_id='site-a'`)),
)
requireCheck(
  'event chain rejects missing predecessor',
  await rejected(() => database.exec(`insert into app_private.connected_site_events (
    workspace_id,site_id,event_sequence,event_id,event_digest,previous_event_digest,
    event_json,command_id,command_digest,aggregate_type,aggregate_id,aggregate_version
  ) values ('workspace-a','site-a',3,'event-c',repeat('3',64),repeat('9',64),'{}',
    'command-a',repeat('f',64),'sale','sale-a',2)`)),
)
requireCheck(
  'events reject mismatched command evidence',
  await rejected(() => database.exec(`insert into app_private.connected_site_events (
    workspace_id,site_id,event_sequence,event_id,event_digest,previous_event_digest,
    event_json,command_id,command_digest,aggregate_type,aggregate_id,aggregate_version
  ) values ('workspace-a','site-a',2,'event-b',repeat('4',64),repeat('2',64),'{}',
    'command-a',repeat('0',64),'sale','sale-a',2)`)),
)
requireCheck(
  'acknowledgements reject mismatched command evidence',
  await rejected(() => database.exec(`insert into app_private.connected_site_acknowledgements (
    workspace_id,site_id,command_id,command_digest,ack_state,canonical_version,event_digest,ack_json
  ) values ('workspace-a','site-a','command-a',repeat('0',64),'accepted',1,repeat('2',64),'{}')`)),
)
requireCheck(
  'conflicts cannot attach to accepted commands',
  await rejected(() => database.exec(`insert into app_private.connected_site_conflicts (
    workspace_id,site_id,conflict_id,command_id,command_digest,aggregate_type,aggregate_id,
    expected_version,canonical_version,reason,conflict_json
  ) values ('workspace-a','site-a','conflict-a','command-a',repeat('f',64),'sale','sale-a',
    0,1,'aggregate_version_conflict','{}')`)),
)
await database.exec(`
  set role supermega_trial_backend;
  select set_config('app.workspace_id','workspace-a',false);
  select set_config('app.site_id','site-a',false);
`)
const scoped = await database.query('select workspace_id,site_id from app_private.connected_sites')
requireCheck('backend sees only its exact workspace and site', scoped.rows.length === 1)
await database.exec("select set_config('app.site_id','site-b',false)")
const otherSite = await database.query('select workspace_id,site_id from app_private.connected_sites')
requireCheck('backend cannot cross site boundary', otherSite.rows.length === 0)
await database.exec('reset role')
console.log(JSON.stringify({ ok: true, checks: checks.length, migrations: names.length, schema_version: 15 }))
await database.close()
