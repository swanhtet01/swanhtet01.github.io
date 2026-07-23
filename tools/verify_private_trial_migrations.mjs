import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import { PGlite } from '@electric-sql/pglite'

const root = resolve(import.meta.dirname, '..')
const migrationDirectory = resolve(root, 'supabase', 'migrations')
const expectedMigrations = [
  '20260722004500_private_trial_backend_role_preflight.sql',
  '20260722005134_private_trial_backend_foundation.sql',
  '20260722142801_private_trial_backend_v2.sql',
  '20260723094500_private_trial_backend_v3_website.sql',
  '20260723144500_private_trial_backend_v4_hardening.sql',
]
const expectedPolicyFingerprints = {
  approval_requests_capability_insert: {
    qual: null,
    check: 'f47353f3c26c797e3216f3197dc2f0b10ec86632815135720719dd47bfd0151f',
  },
  approval_requests_capability_update: {
    qual: '755a51d7490c8803959e92f46e77feeb754aa436d8ebeb788392f809c63986f8',
    check: '33e38466ad153ad850fb4620e290dd1c78c0bae1fe18d89e4f7bbefe0ce091fd',
  },
  approval_requests_member_read: {
    qual: 'd3b1ca91bdb376190b1b6fa144943079c3b403c29449231d5f9a74f8dfb9e7d9',
    check: null,
  },
  workspace_events_capability_insert: {
    qual: null,
    check: 'c66753e2421b833b77a5b47f7248bc6fa8a7907fc7a217b520a1eb0af2b91462',
  },
  workspace_events_member_read: {
    qual: 'dbd92612761332506cb8000e88bcff3b04fb0a499486c3e4d214dfbdaaf6cbae',
    check: null,
  },
  workspace_memberships_self_read: {
    qual: '4c3f673c1afe3e423619aed98c55d2a41a7cd22c408a35542e546bc3a0dc0c21',
    check: null,
  },
  workspace_state_capability_insert: {
    qual: null,
    check: '467bb07bd20d8980c3f389caf0378871d70f5018bd7af8d95c6947e14f8670d8',
  },
  workspace_state_capability_update: {
    qual: '526eb69cc66c78743dc9f35f33c1c189d03b746e18706a7b3c977b907ceb15fd',
    check: '5ba3422b3b6e3439bab09012219d76dde5e1770a47f7a35b70baee218a086d9c',
  },
  workspace_state_member_read: {
    qual: 'a9d2ddd3b6c10273885205138d7bec47b870b0158840e0cc3e93a38cdafdb15d',
    check: null,
  },
}
const expectedConstraintFingerprints = {
  approval_requests_decision_packet_v2_check:
    '2a65522b7475a40847f181426330ca54ca185c823b539c7471278c03ac835839',
  approval_requests_terminal_decision_v2_check:
    '7891087b1b69ffddbd350a3f1bfd0417e1b97c4b68da6cdaafb9851dad88a839',
  workspace_events_approval_surface_v4_check:
    '61c55fa60aa2b47ea8cbc5292aad5351fd54a43d15752413c0d6c511d1f5ea10',
}
const expectedTriggerContract = {
  approval_requests_controlled_mutation: {
    table: 'approval_requests',
    eventMask: 31,
    functionName: 'guard_approval_mutation',
    sourceHash: 'b464962cef378ede50ba2aaa5ba92694fa18cdd8d393646e859c2f291a4b7429',
  },
  workspace_events_immutable: {
    table: 'workspace_events',
    eventMask: 27,
    functionName: 'reject_workspace_event_mutation',
    sourceHash: '39bb1c5506821dafad44cab7e81028001162a481ba5ac9aac13943aa84609018',
  },
  workspace_events_server_timestamp: {
    table: 'workspace_events',
    eventMask: 7,
    functionName: 'stamp_workspace_event_insert',
    sourceHash: '84db3637f01c535294d6df96798fc64c7fc7fe891eb21e977c9d17a1fc7fd338',
  },
  workspace_state_version_guard: {
    table: 'workspace_state',
    eventMask: 23,
    functionName: 'guard_workspace_state_update',
    sourceHash: '1acd37aadc59d091ef066349d0a734f776dd7aaf15218b0911bf813224f2b460',
  },
}
const expectedIndexes = {
  approval_requests_pkey: ['approval_requests', ['approval_id'], [0], true, true, 'p'],
  approval_requests_queue_idx: [
    'approval_requests',
    ['workspace_id', 'status', 'requested_at'],
    [0, 0, 3],
    false,
    false,
    null,
  ],
  approval_requests_workspace_id_command_id_key: [
    'approval_requests',
    ['workspace_id', 'command_id'],
    [0, 0],
    true,
    false,
    'u',
  ],
  trial_schema_meta_pkey: ['trial_schema_meta', ['component'], [0], true, true, 'p'],
  workspace_events_pkey: ['workspace_events', ['event_id'], [0], true, true, 'p'],
  workspace_events_timeline_idx: [
    'workspace_events',
    ['workspace_id', 'created_at'],
    [0, 3],
    false,
    false,
    null,
  ],
  workspace_events_workspace_id_command_id_key: [
    'workspace_events',
    ['workspace_id', 'command_id'],
    [0, 0],
    true,
    false,
    'u',
  ],
  workspace_memberships_pkey: [
    'workspace_memberships',
    ['workspace_id', 'actor_id'],
    [0, 0],
    true,
    true,
    'p',
  ],
  workspace_state_pkey: [
    'workspace_state',
    ['workspace_id', 'surface'],
    [0, 0],
    true,
    true,
    'p',
  ],
}

const checks = []
const requireCheck = (name, condition) => {
  if (!condition) throw new Error(name)
  checks.push(name)
}
const normalizeExpression = (value) => {
  if (value == null || !String(value).trim()) return null
  return String(value)
    .toLowerCase()
    .replace(
      /::\s*(?:pg_catalog\.)?(?:text|character\s+varying|varchar|name|uuid|boolean|integer|bigint)\b/gi,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim()
}
const fingerprint = (value) => {
  const normalized = normalizeExpression(value)
  return normalized == null
    ? null
    : createHash('sha256').update(normalized).digest('hex')
}
const normalizedSourceHash = (value) =>
  createHash('sha256')
    .update(String(value || '').toLowerCase().replace(/\s+/g, ' ').trim())
    .digest('hex')
const seedSupabaseRoles = (database) =>
  database.exec(
    'create role anon nologin; create role authenticated nologin; create role service_role nologin;',
  )
const applyMigrations = async (database, names = expectedMigrations) => {
  for (const name of names) {
    await database.exec(await readFile(resolve(migrationDirectory, name), 'utf8'))
  }
}
const rejection = async (operation) => {
  try {
    await operation()
    return ''
  } catch (error) {
    return String(error?.message || error).split('\n')[0]
  }
}

const migrationNames = (await readdir(migrationDirectory))
  .filter((name) => name.endsWith('.sql'))
  .sort()
requireCheck(
  'exact migration inventory',
  JSON.stringify(migrationNames) === JSON.stringify(expectedMigrations),
)

const database = new PGlite()
await database.waitReady
await seedSupabaseRoles(database)
await applyMigrations(database)

const version = await database.query(
  "select schema_version from app_private.trial_schema_meta where component = 'private_trial_backend'",
)
requireCheck('schema version four', version.rows[0]?.schema_version === 4)

const relations = await database.query(`
  select relation.relname as relation_name, relation.relkind::text as relation_kind,
         owner_role.rolname as owner_name
  from pg_class relation
  join pg_namespace schema_record on schema_record.oid = relation.relnamespace
  join pg_roles owner_role on owner_role.oid = relation.relowner
  where schema_record.nspname = 'app_private'
    and relation.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
  order by relation.relname
`)
requireCheck(
  'exact trusted relation inventory',
  JSON.stringify(relations.rows) ===
    JSON.stringify(
      [
        'approval_requests',
        'trial_schema_meta',
        'workspace_events',
        'workspace_memberships',
        'workspace_state',
      ].map((relation_name) => ({ relation_name, relation_kind: 'r', owner_name: 'postgres' })),
    ),
)

const policyRows = await database.query(`
  select policyname, qual, with_check
  from pg_policies
  where schemaname = 'app_private'
  order by policyname
`)
const observedPolicyFingerprints = Object.fromEntries(
  policyRows.rows.map((row) => [
    row.policyname,
    { qual: fingerprint(row.qual), check: fingerprint(row.with_check) },
  ]),
)
requireCheck(
  'exact policy fingerprints',
  JSON.stringify(observedPolicyFingerprints) ===
    JSON.stringify(expectedPolicyFingerprints),
)

const constraintRows = await database.query(`
  select constraint_record.conname as constraint_name,
         pg_get_constraintdef(constraint_record.oid, true) as definition
  from pg_constraint constraint_record
  join pg_class relation on relation.oid = constraint_record.conrelid
  join pg_namespace schema_record on schema_record.oid = relation.relnamespace
  where schema_record.nspname = 'app_private'
    and constraint_record.conname in (
      'approval_requests_decision_packet_v2_check',
      'approval_requests_terminal_decision_v2_check',
      'workspace_events_approval_surface_v4_check'
    )
  order by constraint_record.conname
`)
const observedConstraintFingerprints = Object.fromEntries(
  constraintRows.rows.map((row) => [
    row.constraint_name,
    fingerprint(row.definition),
  ]),
)
requireCheck(
  'exact security constraint fingerprints',
  JSON.stringify(observedConstraintFingerprints) ===
    JSON.stringify(expectedConstraintFingerprints),
)

const triggerRows = await database.query(`
  select relation.relname as table_name, trigger_record.tgname as trigger_name,
         trigger_record.tgtype::integer as event_mask,
         trigger_record.tgenabled as enabled,
         trigger_record.tgqual is null as no_when_clause,
         trigger_record.tgnargs = 0 as no_arguments,
         cardinality(trigger_record.tgattr::int2[]) = 0 as no_column_filter,
         trigger_record.tgconstraint = 0 as no_constraint_link,
         not trigger_record.tgdeferrable as not_deferrable,
         not trigger_record.tginitdeferred as not_initially_deferred,
         trigger_record.tgoldtable is null
           and trigger_record.tgnewtable is null as no_transition_tables,
         function_record.proname as function_name,
         function_record.prosrc as function_source,
         function_record.prosecdef as security_definer,
         function_record.proconfig as function_config,
         language_record.lanname as function_language
  from pg_trigger trigger_record
  join pg_class relation on relation.oid = trigger_record.tgrelid
  join pg_namespace schema_record on schema_record.oid = relation.relnamespace
  join pg_proc function_record on function_record.oid = trigger_record.tgfoid
  join pg_language language_record on language_record.oid = function_record.prolang
  where schema_record.nspname = 'app_private'
    and not trigger_record.tgisinternal
  order by trigger_record.tgname
`)
requireCheck(
  'exact hardened trigger inventory',
  triggerRows.rows.length === Object.keys(expectedTriggerContract).length &&
    triggerRows.rows.every((row) => {
      const expected = expectedTriggerContract[row.trigger_name]
      return (
        expected &&
        row.table_name === expected.table &&
        row.event_mask === expected.eventMask &&
        row.enabled === 'O' &&
        row.no_when_clause === true &&
        row.no_arguments === true &&
        row.no_column_filter === true &&
        row.no_constraint_link === true &&
        row.not_deferrable === true &&
        row.not_initially_deferred === true &&
        row.no_transition_tables === true &&
        row.function_name === expected.functionName &&
        normalizedSourceHash(row.function_source) === expected.sourceHash &&
        row.security_definer === false &&
        JSON.stringify(row.function_config) ===
          JSON.stringify(['search_path=pg_catalog, app_private']) &&
        row.function_language === 'plpgsql'
      )
    }),
)

const indexRows = await database.query(`
  select table_record.relname as table_name,
         index_record.relname as index_name,
         access_method.amname as access_method,
         index_catalog.indisunique as is_unique,
         index_catalog.indisprimary as is_primary,
         index_catalog.indisvalid as is_valid,
         index_catalog.indisready as is_ready,
         index_catalog.indislive as is_live,
         index_catalog.indimmediate as is_immediate,
         not index_catalog.indisexclusion as not_exclusion,
         index_catalog.indnatts = index_catalog.indnkeyatts as no_included_columns,
         not index_catalog.indnullsnotdistinct as nulls_distinct,
         index_catalog.indpred is null as no_predicate,
         index_catalog.indexprs is null as no_expressions,
         array(
           select pg_get_indexdef(index_catalog.indexrelid, key_position, true)
           from generate_series(1, index_catalog.indnkeyatts) key_position
           order by key_position
         ) as key_columns,
         index_catalog.indoption::int2[] as key_options,
         constraint_record.contype::text as constraint_type
  from pg_index index_catalog
  join pg_class index_record on index_record.oid = index_catalog.indexrelid
  join pg_class table_record on table_record.oid = index_catalog.indrelid
  join pg_namespace schema_record on schema_record.oid = table_record.relnamespace
  join pg_am access_method on access_method.oid = index_record.relam
  left join pg_constraint constraint_record
    on constraint_record.conindid = index_catalog.indexrelid
  where schema_record.nspname = 'app_private'
  order by index_record.relname
`)
requireCheck(
  'exact index contract',
  indexRows.rows.length === Object.keys(expectedIndexes).length &&
    indexRows.rows.every((row) => {
      const expected = expectedIndexes[row.index_name]
      return (
        expected &&
        row.table_name === expected[0] &&
        JSON.stringify(row.key_columns) === JSON.stringify(expected[1]) &&
        JSON.stringify(row.key_options) === JSON.stringify(expected[2]) &&
        row.is_unique === expected[3] &&
        row.is_primary === expected[4] &&
        row.constraint_type === expected[5] &&
        row.access_method === 'btree' &&
        row.is_valid === true &&
        row.is_ready === true &&
        row.is_live === true &&
        row.is_immediate === true &&
        row.not_exclusion === true &&
        row.no_included_columns === true &&
        row.nulls_distinct === true &&
        row.no_predicate === true &&
        row.no_expressions === true
      )
    }),
)

const unsafeRoleDatabase = new PGlite()
await unsafeRoleDatabase.waitReady
await unsafeRoleDatabase.exec('create role supermega_trial_backend login bypassrls;')
const unsafeRoleMessage = await rejection(() =>
  applyMigrations(unsafeRoleDatabase, expectedMigrations.slice(0, 1)),
)
await unsafeRoleDatabase.exec('rollback')
const unsafeRoleSchema = await unsafeRoleDatabase.query(
  "select to_regnamespace('app_private') is null as absent",
)
requireCheck(
  'unsafe role rejected before foundation grants',
  unsafeRoleMessage.includes('role attributes are unsafe') &&
    unsafeRoleSchema.rows[0]?.absent === true,
)

const dependencyDatabase = new PGlite()
await dependencyDatabase.waitReady
await dependencyDatabase.exec(`
  create role supermega_trial_backend
    nologin inherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  create table public.preexisting_data(id integer);
  grant select on public.preexisting_data to supermega_trial_backend;
`)
const dependencyMessage = await rejection(() =>
  applyMigrations(dependencyDatabase, expectedMigrations.slice(0, 1)),
)
requireCheck(
  'pre-existing backend authority rejected',
  dependencyMessage.includes('must have no object dependencies'),
)

const memberDatabase = new PGlite()
await memberDatabase.waitReady
await seedSupabaseRoles(memberDatabase)
await applyMigrations(memberDatabase, expectedMigrations.slice(0, 4))
await memberDatabase.exec(`
  create role supermega_trial_login login;
  grant supermega_trial_backend to supermega_trial_login;
`)
const memberMessage = await rejection(() =>
  applyMigrations(memberDatabase, expectedMigrations.slice(4)),
)
requireCheck(
  'v4 rejects runtime provisioning before hardening',
  memberMessage.includes('must have no members before runtime provisioning'),
)

await Promise.all([
  database.close(),
  unsafeRoleDatabase.close(),
  dependencyDatabase.close(),
  memberDatabase.close(),
])

console.log(
  JSON.stringify(
    {
      ok: true,
      contract: 'supermega_private_trial_migrations',
      engine: 'PGlite PostgreSQL 18.3 compatibility runtime',
      migrations: expectedMigrations.length,
      checks: checks.length,
      hosted_postgres_17_proof_required: true,
    },
    null,
    2,
  ),
)
