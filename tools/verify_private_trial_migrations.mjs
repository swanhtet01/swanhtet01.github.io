import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import { PGlite } from '@electric-sql/pglite'

const root = resolve(import.meta.dirname, '..')
const migrationDirectory = resolve(root, 'supabase', 'migrations')
// Present in the directory but deliberately outside this verifier's scope. The legacy
// baseline rebuilds the pre-existing public catalog (27 tables the earlier enterprise app
// created outside migrations) so a fresh database can be built from history at all. It is
// not part of the private-trial backend contract these checks cover, and it requires
// pgvector, which PGlite does not provide — applying it here would fail for reasons
// unrelated to what is being verified.
const outOfScopeMigrations = ['20260711081300_public_legacy_baseline.sql']
const expectedMigrations = [
  '20260722004500_private_trial_backend_role_preflight.sql',
  '20260722005134_private_trial_backend_foundation.sql',
  '20260722142801_private_trial_backend_v2.sql',
  '20260723094500_private_trial_backend_v3_website.sql',
  '20260723144500_private_trial_backend_v4_hardening.sql',
  '20260724204920_private_trial_backend_v5_read_capabilities.sql',
  '20260730113000_private_trial_backend_v6_managed_activation.sql',
  '20260730123000_private_trial_backend_v7_workspace_discovery.sql',
  '20260802161500_private_trial_backend_v8_rls_initplan.sql',
  '20260803063822_private_trial_backend_v9_metadata_rls.sql',
  '20260804102000_private_trial_backend_v10_supabase_session_revocation.sql',
  '20260816120000_private_trial_backend_v11_self_serve_grants.sql',
  '20260817090000_private_trial_backend_v12_billing_rail.sql',
  '20260818090000_private_trial_backend_v13_billing_entitlement_read.sql',
]
const expectedPolicyFingerprints = {
  approval_requests_access_gate: {
    command: 'ALL',
    permissive: 'RESTRICTIVE',
    qual: '62b06512b305b9314444df79e58ab5aa64b5d67d60e3449a110f7e1393fa0a5b',
    check: '62b06512b305b9314444df79e58ab5aa64b5d67d60e3449a110f7e1393fa0a5b',
  },
  approval_requests_capability_insert: {
    command: 'INSERT',
    permissive: 'PERMISSIVE',
    qual: null,
    check: 'dc2558473062987c688a49447b746d338d158df17178883ede511877b5f70841',
  },
  approval_requests_capability_update: {
    command: 'UPDATE',
    permissive: 'PERMISSIVE',
    qual: '44ecbdc576a99c7e56324a4c1564bcac5c6a81c0057a2bf14a929966bbf725f6',
    check: 'edc4e0b608fcb144beadf0ab88c9647a553f51306071851ce4afd33ad691dfca',
  },
  approval_requests_member_read: {
    command: 'SELECT',
    permissive: 'PERMISSIVE',
    qual: '59ee715578ea24aa2483ddaa0debdcd467fb15e23d0c39e5fd6ac9ea360e9f99',
    check: null,
  },
  billing_entitlements_self_read: {
    command: 'SELECT',
    permissive: 'PERMISSIVE',
    qual: '28369fc95fa5a46002daf06b67038c4c9c8695d9defe59a69014c7c40a44d5b5',
    check: null,
  },
  trial_schema_meta_backend_read: {
    command: 'SELECT',
    permissive: 'PERMISSIVE',
    qual: 'f6f657b1a947cd58fbd8d345a7c33c2192946c21de560121a208f3993d754cd3',
    check: null,
  },
  workspace_access_controls_member_read: {
    command: 'SELECT',
    permissive: 'PERMISSIVE',
    qual: '69de59bcd4afae8fbd45a1f90dbe0513d14c3b4b168ea102636f9abb6f6daadd',
    check: null,
  },
  workspace_access_controls_self_serve_insert: {
    command: 'INSERT',
    permissive: 'PERMISSIVE',
    qual: null,
    check: '5ad38c2accb211f72152b09fc0d9ecf0af10b3d446f594bed9d91111a943b3ab',
  },
  workspace_events_access_gate: {
    command: 'ALL',
    permissive: 'RESTRICTIVE',
    qual: '62b06512b305b9314444df79e58ab5aa64b5d67d60e3449a110f7e1393fa0a5b',
    check: '62b06512b305b9314444df79e58ab5aa64b5d67d60e3449a110f7e1393fa0a5b',
  },
  workspace_events_capability_insert: {
    command: 'INSERT',
    permissive: 'PERMISSIVE',
    qual: null,
    check: '0a293401b67ab4c0082a97e208379e2764fb9341e1b54f377b28d7781dc05085',
  },
  workspace_events_member_read: {
    command: 'SELECT',
    permissive: 'PERMISSIVE',
    qual: 'a8a421f4fa52e36ac3f5f97e0ac2fab27f4ba9424bd318596cd7274b05f5f669',
    check: null,
  },
  workspace_memberships_access_gate: {
    command: 'ALL',
    permissive: 'RESTRICTIVE',
    qual: '62b06512b305b9314444df79e58ab5aa64b5d67d60e3449a110f7e1393fa0a5b',
    check: '62b06512b305b9314444df79e58ab5aa64b5d67d60e3449a110f7e1393fa0a5b',
  },
  workspace_memberships_self_read: {
    command: 'SELECT',
    permissive: 'PERMISSIVE',
    qual: 'c80e91747fc9319e19ff36d373cb2d07e01ea65c4085d8e766902b67b488b0b7',
    check: null,
  },
  workspace_memberships_self_serve_insert: {
    command: 'INSERT',
    permissive: 'PERMISSIVE',
    qual: null,
    check: '07bf986e840d33e2681b98000b0c30e16907bb17148cbcfed045fa8674bd11d6',
  },
  workspace_state_access_gate: {
    command: 'ALL',
    permissive: 'RESTRICTIVE',
    qual: '62b06512b305b9314444df79e58ab5aa64b5d67d60e3449a110f7e1393fa0a5b',
    check: '62b06512b305b9314444df79e58ab5aa64b5d67d60e3449a110f7e1393fa0a5b',
  },
  workspace_state_capability_insert: {
    command: 'INSERT',
    permissive: 'PERMISSIVE',
    qual: null,
    check: 'df44792058a637c1aac27a21f11556137aa4bb494b20f9ff594d1f383c451777',
  },
  workspace_state_capability_update: {
    command: 'UPDATE',
    permissive: 'PERMISSIVE',
    qual: '3630de71f046f89fac9d5166b86b9e7e894a99b3d2bd674c27bc31c2205be2eb',
    check: '912ad42025817aac4572b645e16d22447334cb632a7fde7dceabf9831846360f',
  },
  workspace_state_member_read: {
    command: 'SELECT',
    permissive: 'PERMISSIVE',
    qual: '0fd69d13f5845335429f2bc0254d43285c74db27185502b49d71277a1b037e29',
    check: null,
  },
}
const initplanPolicyNames = [
  'approval_requests_capability_insert',
  'approval_requests_capability_update',
  'approval_requests_member_read',
  'billing_entitlements_self_read',
  'workspace_access_controls_member_read',
  'workspace_events_capability_insert',
  'workspace_events_member_read',
  'workspace_memberships_self_read',
  'workspace_state_capability_insert',
  'workspace_state_capability_update',
  'workspace_state_member_read',
]
const expectedAccessFunction = {
  name: 'workspace_is_active',
  identityArguments: 'target_workspace_id text',
  resultType: 'boolean',
  language: 'sql',
  sourceHash: 'db273aa3f0342e648db5b5e37560b08009ee22a3e274f9395718bdfbbd257a35',
}
const expectedDirectoryFunction = {
  name: 'actor_workspace_directory',
  identityArguments: '',
  resultType: 'TABLE(workspace_id text, capabilities text[], display_name text)',
  language: 'sql',
  sourceHash: '6f7002c211b52aef98a7dd702a1ca112163570ceb03446883ee3d332bea867d0',
}
const expectedSessionFunction = {
  name: 'supabase_session_is_active',
  identityArguments: 'target_user_id uuid, target_session_id uuid',
  resultType: 'boolean',
  language: 'sql',
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
  workspace_access_control_guard: {
    table: 'workspace_access_controls',
    eventMask: 31,
    functionName: 'guard_workspace_access_control',
    sourceHash: '51191bb0425231cab316424b5fbe6cf397e7a27468d8f4df1a771cdbeab272a4',
  },
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
  billing_invoice_guard: {
    table: 'billing_invoices',
    eventMask: 31,
    functionName: 'guard_billing_invoice',
    sourceHash: '9357f8bb46f9e3926b482424566ee1569e2ed52bc1b27b92a8d0bfa95ca69bb2',
  },
  billing_events_immutable: {
    table: 'billing_events',
    eventMask: 27,
    functionName: 'reject_billing_event_mutation',
    sourceHash: 'e842b7e9fa37239f1ad70f54cb401cf80a6eeda7ecdbb1259089c5118fb6bef0',
  },
  billing_events_server_timestamp: {
    table: 'billing_events',
    eventMask: 7,
    functionName: 'stamp_billing_event_insert',
    sourceHash: '84db3637f01c535294d6df96798fc64c7fc7fe891eb21e977c9d17a1fc7fd338',
  },
  billing_entitlement_guard: {
    table: 'billing_entitlements',
    eventMask: 31,
    functionName: 'guard_billing_entitlement',
    sourceHash: '68ccc18d3e389d4647204098815da29fcc9f0bf09040a97032d9ccea1811178a',
  },
}
const expectedIndexes = {
  approval_requests_pkey: ['approval_requests', ['approval_id'], [0], true, true, 'p'],
  billing_entitlements_pkey: [
    'billing_entitlements',
    ['workspace_id'],
    [0],
    true,
    true,
    'p',
  ],
  billing_events_pkey: ['billing_events', ['event_id'], [0], true, true, 'p'],
  billing_events_timeline_idx: [
    'billing_events',
    ['workspace_id', 'created_at'],
    [0, 3],
    false,
    false,
    null,
  ],
  billing_events_workspace_id_command_id_key: [
    'billing_events',
    ['workspace_id', 'command_id'],
    [0, 0],
    true,
    false,
    'u',
  ],
  billing_invoices_pkey: [
    'billing_invoices',
    ['workspace_id', 'invoice_id'],
    [0, 0],
    true,
    true,
    'p',
  ],
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
  workspace_access_controls_activation_id_key: [
    'workspace_access_controls',
    ['activation_id'],
    [0],
    true,
    false,
    'u',
  ],
  workspace_access_controls_authorization_id_key: [
    'workspace_access_controls',
    ['authorization_id'],
    [0],
    true,
    false,
    'u',
  ],
  workspace_access_controls_pkey: [
    'workspace_access_controls',
    ['workspace_id'],
    [0],
    true,
    true,
    'p',
  ],
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
  workspace_memberships_actor_directory_idx: [
    'workspace_memberships',
    ['actor_id', 'actor_kind', 'status', 'workspace_id'],
    [0, 0, 0, 0],
    false,
    false,
    null,
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
    `
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin;
      create schema auth authorization postgres;
      create table auth.sessions (
        id uuid primary key,
        user_id uuid not null
      );
    `,
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

const allMigrationNames = (await readdir(migrationDirectory))
  .filter((name) => name.endsWith('.sql'))
  .sort()
// Still an exact inventory: every file must be either an in-scope trial migration or a
// named out-of-scope one, so a new file can never enter the directory unnoticed.
requireCheck(
  'exact migration inventory',
  JSON.stringify(allMigrationNames) === JSON.stringify([...outOfScopeMigrations, ...expectedMigrations].sort()),
)
const migrationNames = allMigrationNames.filter((name) => !outOfScopeMigrations.includes(name))

const database = new PGlite()
await database.waitReady
await seedSupabaseRoles(database)
await applyMigrations(database)

const version = await database.query(
  "select schema_version from app_private.trial_schema_meta where component = 'private_trial_backend'",
)
requireCheck('schema version thirteen', version.rows[0]?.schema_version === 13)

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
        'billing_entitlements',
        'billing_events',
        'billing_invoices',
        'trial_schema_meta',
        'workspace_access_controls',
        'workspace_events',
        'workspace_memberships',
        'workspace_state',
      ].map((relation_name) => ({ relation_name, relation_kind: 'r', owner_name: 'postgres' })),
    ),
)

const rlsRows = await database.query(`
  select relation.relname as relation_name,
         relation.relrowsecurity as rls_enabled,
         relation.relforcerowsecurity as rls_forced
  from pg_class relation
  join pg_namespace schema_record on schema_record.oid = relation.relnamespace
  where schema_record.nspname = 'app_private'
    and relation.relkind in ('r', 'p')
  order by relation.relname
`)
const expectedRls = [
  { relation_name: 'approval_requests', rls_enabled: true, rls_forced: true },
  { relation_name: 'billing_entitlements', rls_enabled: true, rls_forced: true },
  { relation_name: 'billing_events', rls_enabled: true, rls_forced: true },
  { relation_name: 'billing_invoices', rls_enabled: true, rls_forced: true },
  { relation_name: 'trial_schema_meta', rls_enabled: true, rls_forced: false },
  { relation_name: 'workspace_access_controls', rls_enabled: true, rls_forced: true },
  { relation_name: 'workspace_events', rls_enabled: true, rls_forced: true },
  { relation_name: 'workspace_memberships', rls_enabled: true, rls_forced: true },
  { relation_name: 'workspace_state', rls_enabled: true, rls_forced: true },
]
requireCheck(
  'metadata RLS and tenant force-RLS are exact',
  JSON.stringify(rlsRows.rows) === JSON.stringify(expectedRls),
)

const policyRows = await database.query(`
  select policyname, roles, cmd, permissive, qual, with_check
  from pg_policies
  where schemaname = 'app_private'
  order by policyname
`)
const observedPolicyFingerprints = Object.fromEntries(
  policyRows.rows.map((row) => [
    row.policyname,
    {
      command: row.cmd,
      permissive: row.permissive,
      qual: fingerprint(row.qual),
      check: fingerprint(row.with_check),
    },
  ]),
)
requireCheck(
  'exact policy fingerprints',
  JSON.stringify(observedPolicyFingerprints) ===
    JSON.stringify(expectedPolicyFingerprints),
)
requireCheck(
  'every private policy is scoped to the backend role',
  policyRows.rows.every(
    (row) => JSON.stringify(row.roles) === JSON.stringify(['supermega_trial_backend']),
  ),
)
const initplanPolicyRows = policyRows.rows.filter((row) =>
  initplanPolicyNames.includes(row.policyname),
)
requireCheck(
  'request context is evaluated once per query in every flagged policy',
  initplanPolicyRows.length === initplanPolicyNames.length &&
    initplanPolicyRows.every((row) => {
      const expression = `${row.qual || ''} ${row.with_check || ''}`
        .toLowerCase()
        .replace(/\s+/g, ' ')
      const requestContextCalls = expression.match(/current_setting\(/g)?.length ?? 0
      const initplanCalls = expression.match(/\(\s*select\s+current_setting\(/g)?.length ?? 0
      return requestContextCalls > 0 && requestContextCalls === initplanCalls
    }),
)

// v12 billing rail: deny by default is the contract for invoices and events --
// the exact policy inventory above already proves those two tables carry no
// policies; this check proves the runtime member role and every Supabase API
// role also hold no table privilege on them whatsoever, founder-only forever.
// "Whatsoever" is all EIGHT PostgreSQL 17 table privileges, not the four this
// listed before: a role holding only TRUNCATE can empty a billing table in one
// statement, fires no row-level trigger doing it, and was invisible here.
// MAINTAIN is PG17-only and was enumerated from aclexplode() on a real 17.10
// server rather than from a hand-written list -- four consecutive revisions of
// this set were curated subsets, each missing something real.
const billingInvoicesEventsPrivilegeRows = await database.query(`
  select bool_or(
    has_table_privilege(role_name, format('app_private.%I', table_name), privilege_name)
  ) as any_privilege
  from unnest(array['billing_invoices', 'billing_events']) table_name,
       unnest(array['supermega_trial_backend', 'anon', 'authenticated', 'service_role']) role_name,
       unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) privilege_name
`)
requireCheck(
  'v12 billing invoices and events stay deny-by-default for the runtime and API roles',
  billingInvoicesEventsPrivilegeRows.rows[0]?.any_privilege === false,
)

// v13 lights up exactly one narrow read: the runtime role may SELECT (never
// write) billing_entitlements, and every Supabase API role still holds
// nothing at all -- premiumUnlocked can now resolve, and only that.
const entitlementApiPrivilegeRows = await database.query(`
  select bool_or(
    has_table_privilege(role_name, 'app_private.billing_entitlements', privilege_name)
  ) as any_privilege
  from unnest(array['anon', 'authenticated', 'service_role']) role_name,
       unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) privilege_name
`)
requireCheck(
  'v13 billing entitlements stay deny-by-default for every Supabase API role',
  entitlementApiPrivilegeRows.rows[0]?.any_privilege === false,
)
const entitlementRuntimeWriteRows = await database.query(`
  select bool_or(
    has_table_privilege('supermega_trial_backend', 'app_private.billing_entitlements', privilege_name)
  ) as any_write_privilege
  from unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) privilege_name
`)
requireCheck(
  'v13 billing entitlements grant the runtime role read-only access',
  entitlementRuntimeWriteRows.rows[0]?.any_write_privilege === false,
)
const entitlementRuntimeReadRow = await database.query(`
  select has_table_privilege(
    'supermega_trial_backend', 'app_private.billing_entitlements', 'SELECT'
  ) as select_privilege
`)
requireCheck(
  'v13 billing entitlements grant the runtime role its SELECT read',
  entitlementRuntimeReadRow.rows[0]?.select_privilege === true,
)

const accessFunctionRows = await database.query(`
  select function_record.proname as function_name,
         pg_get_function_identity_arguments(function_record.oid) as identity_arguments,
         pg_get_function_result(function_record.oid) as result_type,
         function_record.prosrc as function_source,
         function_record.prosecdef as security_definer,
         function_record.proconfig as function_config,
         language_record.lanname as function_language
  from pg_proc function_record
  join pg_namespace schema_record on schema_record.oid = function_record.pronamespace
  join pg_language language_record on language_record.oid = function_record.prolang
  where schema_record.nspname = 'app_private'
    and function_record.proname = 'workspace_is_active'
`)
requireCheck(
  'exact workspace access function',
  accessFunctionRows.rows.length === 1 &&
    accessFunctionRows.rows[0].function_name === expectedAccessFunction.name &&
    accessFunctionRows.rows[0].identity_arguments === expectedAccessFunction.identityArguments &&
    accessFunctionRows.rows[0].result_type === expectedAccessFunction.resultType &&
    accessFunctionRows.rows[0].function_language === expectedAccessFunction.language &&
    normalizedSourceHash(accessFunctionRows.rows[0].function_source) ===
      expectedAccessFunction.sourceHash &&
    accessFunctionRows.rows[0].security_definer === false &&
    JSON.stringify(accessFunctionRows.rows[0].function_config) ===
      JSON.stringify(['search_path=pg_catalog, app_private']),
)

const directoryFunctionRows = await database.query(`
  select function_record.proname as function_name,
         pg_get_function_identity_arguments(function_record.oid) as identity_arguments,
         pg_get_function_result(function_record.oid) as result_type,
         function_record.prosrc as function_source,
         function_record.prosecdef as security_definer,
         function_record.proconfig as function_config,
         language_record.lanname as function_language
  from pg_proc function_record
  join pg_namespace schema_record on schema_record.oid = function_record.pronamespace
  join pg_language language_record on language_record.oid = function_record.prolang
  where schema_record.nspname = 'app_private'
    and function_record.proname = 'actor_workspace_directory'
`)
requireCheck(
  'exact actor workspace directory function',
  directoryFunctionRows.rows.length === 1 &&
    directoryFunctionRows.rows[0].function_name === expectedDirectoryFunction.name &&
    directoryFunctionRows.rows[0].identity_arguments === expectedDirectoryFunction.identityArguments &&
    directoryFunctionRows.rows[0].result_type === expectedDirectoryFunction.resultType &&
    directoryFunctionRows.rows[0].function_language === expectedDirectoryFunction.language &&
    normalizedSourceHash(directoryFunctionRows.rows[0].function_source) ===
      expectedDirectoryFunction.sourceHash &&
    directoryFunctionRows.rows[0].security_definer === true &&
    JSON.stringify(directoryFunctionRows.rows[0].function_config) ===
      JSON.stringify(['search_path=pg_catalog, app_private']),
)

const sessionFunctionRows = await database.query(`
  select function_record.proname as function_name,
         pg_get_function_identity_arguments(function_record.oid) as identity_arguments,
         pg_get_function_result(function_record.oid) as result_type,
         function_record.prosrc as function_source,
         function_record.prosecdef as security_definer,
         function_record.provolatile as volatility,
         function_record.proconfig as function_config,
         language_record.lanname as function_language
  from pg_proc function_record
  join pg_namespace schema_record on schema_record.oid = function_record.pronamespace
  join pg_language language_record on language_record.oid = function_record.prolang
  where schema_record.nspname = 'app_private'
    and function_record.proname = 'supabase_session_is_active'
`)
requireCheck(
  'exact private Supabase session function',
  sessionFunctionRows.rows.length === 1 &&
    sessionFunctionRows.rows[0].function_name === expectedSessionFunction.name &&
    sessionFunctionRows.rows[0].identity_arguments === expectedSessionFunction.identityArguments &&
    sessionFunctionRows.rows[0].result_type === expectedSessionFunction.resultType &&
    sessionFunctionRows.rows[0].function_language === expectedSessionFunction.language &&
    sessionFunctionRows.rows[0].security_definer === true &&
    sessionFunctionRows.rows[0].volatility === 's' &&
    JSON.stringify(sessionFunctionRows.rows[0].function_config) ===
      JSON.stringify(['search_path=""']) &&
    /from auth\.sessions as session_record/.test(
      String(sessionFunctionRows.rows[0].function_source).toLowerCase(),
    ),
)

const sessionPrivileges = await database.query(`
  select
    has_function_privilege(
      'supermega_trial_backend',
      'app_private.supabase_session_is_active(uuid,uuid)',
      'EXECUTE'
    ) as backend_execute,
    has_function_privilege(
      'anon',
      'app_private.supabase_session_is_active(uuid,uuid)',
      'EXECUTE'
    ) as anon_execute,
    has_function_privilege(
      'authenticated',
      'app_private.supabase_session_is_active(uuid,uuid)',
      'EXECUTE'
    ) as authenticated_execute,
    has_function_privilege(
      'service_role',
      'app_private.supabase_session_is_active(uuid,uuid)',
      'EXECUTE'
    ) as service_execute
`)
requireCheck(
  'session revocation function is server-only',
  sessionPrivileges.rows[0]?.backend_execute === true &&
    sessionPrivileges.rows[0]?.anon_execute === false &&
    sessionPrivileges.rows[0]?.authenticated_execute === false &&
    sessionPrivileges.rows[0]?.service_execute === false,
)

const sessionUserId = '2f8d24d8-308c-4dc8-a352-7b61df756728'
const sessionId = 'd8aaab28-a5a7-4a0d-9d75-7a6265a969c3'
await database.query(
  'insert into auth.sessions (id, user_id) values ($1::uuid, $2::uuid)',
  [sessionId, sessionUserId],
)
await database.exec('set role supermega_trial_backend')
const activeSession = await database.query(
  'select app_private.supabase_session_is_active($1::uuid, $2::uuid) as active',
  [sessionUserId, sessionId],
)
await database.exec('reset role')
await database.query('delete from auth.sessions where id = $1::uuid', [sessionId])
await database.exec('set role supermega_trial_backend')
const revokedSession = await database.query(
  'select app_private.supabase_session_is_active($1::uuid, $2::uuid) as active',
  [sessionUserId, sessionId],
)
await database.exec('reset role')
requireCheck(
  'active session accepted and deleted session revoked',
  activeSession.rows[0]?.active === true && revokedSession.rows[0]?.active === false,
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

const hostedDatabase = new PGlite()
await hostedDatabase.waitReady
await seedSupabaseRoles(hostedDatabase)
await applyMigrations(hostedDatabase, expectedMigrations.slice(0, 4))
await hostedDatabase.exec(`
  grant supermega_trial_backend to postgres
    with admin true, inherit false, set false;
`)
await applyMigrations(hostedDatabase, expectedMigrations.slice(4))
const hostedVersion = await hostedDatabase.query(
  "select schema_version from app_private.trial_schema_meta where component = 'private_trial_backend'",
)
requireCheck(
  'exact Supabase hosted administrative membership accepted',
  hostedVersion.rows[0]?.schema_version === 13,
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
  memberMessage.includes('has an unsafe member before runtime provisioning'),
)

await Promise.all([
  database.close(),
  unsafeRoleDatabase.close(),
  dependencyDatabase.close(),
  hostedDatabase.close(),
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
