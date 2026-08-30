import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { PGlite } from '@electric-sql/pglite'

const root = resolve(import.meta.dirname, '..')
const auditPath = resolve(root, 'hq', 'readiness', 'supabase-security-advisor-audit.json')
const sqlPath = resolve(
  root,
  'supabase',
  'rehearsal',
  '20260804_public_browser_quarantine.sql',
)
const expectedSequences = ['supermega_leads_id_seq', 'supermega_sales_runs_id_seq']
const browserRoles = ['anon', 'authenticated']
const tablePrivileges = ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
const sequencePrivileges = ['USAGE', 'SELECT']

function fail(code) {
  throw new Error(code)
}

function quoteIdentifier(value) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value)) fail('public_quarantine_identifier_invalid')
  return `"${value}"`
}

async function fixture({ omitLastTable = false } = {}) {
  const audit = JSON.parse(await readFile(auditPath, 'utf8'))
  const expectedTables = audit.catalog?.tables?.map((table) => table.name)
  if (!Array.isArray(expectedTables) || expectedTables.length !== 27) {
    fail('public_quarantine_audit_inventory_invalid')
  }
  const tables = omitLastTable ? expectedTables.slice(0, -1) : expectedTables
  const database = new PGlite()
  await database.waitReady
  await database.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create role supabase_admin nologin;

    alter default privileges for role postgres in schema public
      grant all privileges on tables to anon, authenticated, service_role;
    alter default privileges for role postgres in schema public
      grant all privileges on sequences to anon, authenticated, service_role;
    alter default privileges for role postgres in schema public
      grant execute on functions to anon, authenticated, service_role;
    alter default privileges for role supabase_admin in schema public
      grant all privileges on tables to anon, authenticated, service_role;
    alter default privileges for role supabase_admin in schema public
      grant all privileges on sequences to anon, authenticated, service_role;
    alter default privileges for role supabase_admin in schema public
      grant execute on functions to anon, authenticated, service_role;

    ${tables.map((name) => `create table public.${quoteIdentifier(name)} (id bigint);`).join('\n')}
    ${expectedSequences.map((name) => `create sequence public.${quoteIdentifier(name)};`).join('\n')}

    grant all privileges on all tables in schema public
      to anon, authenticated, service_role;
    grant all privileges on all sequences in schema public
      to anon, authenticated, service_role;
  `)
  return { audit, database, expectedTables }
}

async function privilege(database, kind, role, objectName, privilegeName) {
  const helper = kind === 'table' ? 'has_table_privilege' : 'has_sequence_privilege'
  const result = await database.query(
    `select ${helper}($1, $2, $3) as allowed`,
    [role, `public.${objectName}`, privilegeName],
  )
  return result.rows[0]?.allowed === true
}

const sql = await readFile(sqlPath, 'utf8')
const { audit, database, expectedTables } = await fixture()

// The audit describes the live catalog on the reviewed v7 -> v13 path. The
// local rehearsal seeds unsafe grants itself, so it proves the quarantine can
// safely re-close a database even when the current live audit is already clear.
if (audit.contract !== 'supermega.supabase-security-advisor-audit.v2'
  || !Number.isInteger(audit.managedBackend?.liveSchemaVersion)
  || audit.managedBackend.liveSchemaVersion < 7
  || audit.managedBackend.liveSchemaVersion > 13
  || audit.managedBackend.localTargetVersion !== audit.managedBackend.liveSchemaVersion
  || audit.managedBackend.versionDrift !== 0) fail('public_quarantine_live_schema_drifted')
if (audit.catalog?.businessRowsRead !== 0) fail('public_quarantine_business_data_boundary_invalid')
const expectedAuditPrivileges = audit.conclusion?.browserGrantHardeningRequired === false ? '' : tablePrivileges.join(',')
if (audit.catalog?.tables?.some((table) => (
  table.schema !== 'public'
  || table.rlsEnabled !== true
  || table.policyCount !== 0
  || table.anonPrivileges?.join(',') !== expectedAuditPrivileges
  || table.authenticatedPrivileges?.join(',') !== expectedAuditPrivileges
))) fail('public_quarantine_source_grants_invalid')
if (audit.catalog?.sequences?.length !== expectedSequences.length
  || audit.catalog.sequences.some((sequence, index) => (
    sequence?.schema !== 'public'
    || sequence.name !== expectedSequences[index]
    || sequence.anonPrivileges?.join(',') !== (audit.conclusion?.browserGrantHardeningRequired === false ? '' : sequencePrivileges.join(','))
    || sequence.authenticatedPrivileges?.join(',') !== (audit.conclusion?.browserGrantHardeningRequired === false ? '' : sequencePrivileges.join(','))
  ))) fail('public_quarantine_source_sequence_grants_invalid')

await database.exec(sql)

for (const role of browserRoles) {
  for (const table of expectedTables) {
    for (const privilegeName of tablePrivileges) {
      if (await privilege(database, 'table', role, table, privilegeName)) {
        fail('public_quarantine_browser_table_grant_retained')
      }
    }
  }
  for (const sequence of expectedSequences) {
    for (const privilegeName of sequencePrivileges) {
      if (await privilege(database, 'sequence', role, sequence, privilegeName)) {
        fail('public_quarantine_browser_sequence_grant_retained')
      }
    }
  }
}

for (const table of expectedTables) {
  for (const privilegeName of tablePrivileges) {
    if (!(await privilege(database, 'table', 'service_role', table, privilegeName))) {
      fail('public_quarantine_server_table_grant_changed')
    }
  }
}
for (const sequence of expectedSequences) {
  for (const privilegeName of sequencePrivileges) {
    if (!(await privilege(database, 'sequence', 'service_role', sequence, privilegeName))) {
      fail('public_quarantine_server_sequence_grant_changed')
    }
  }
}

const defaultBrowserGrants = await database.query(`
  select count(*)::integer as grant_count
  from pg_default_acl default_acl
  join pg_roles owner_role on owner_role.oid = default_acl.defaclrole
  join pg_namespace schema_record on schema_record.oid = default_acl.defaclnamespace
  cross join lateral aclexplode(default_acl.defaclacl) privilege_record
  left join pg_roles grantee_role on grantee_role.oid = privilege_record.grantee
  where owner_role.rolname in ('postgres', 'supabase_admin')
    and schema_record.nspname = 'public'
    and default_acl.defaclobjtype in ('r', 'S', 'f')
    and (privilege_record.grantee = 0 or grantee_role.rolname in ('anon', 'authenticated'))
`)
if (defaultBrowserGrants.rows[0]?.grant_count !== 0) {
  fail('public_quarantine_default_browser_grant_retained')
}

await database.exec(sql)

const driftFixture = await fixture({ omitLastTable: true })
let driftRejected = false
try {
  await driftFixture.database.exec(sql)
} catch (error) {
  driftRejected = String(error?.message || error).includes(
    'public browser quarantine table inventory changed',
  )
  await driftFixture.database.exec('rollback')
}
if (!driftRejected) fail('public_quarantine_inventory_drift_not_rejected')
if (!(await privilege(
  driftFixture.database,
  'table',
  'anon',
  driftFixture.expectedTables[0],
  'SELECT',
))) fail('public_quarantine_drift_failure_was_not_atomic')

await Promise.all([database.close(), driftFixture.database.close()])

process.stdout.write(`${JSON.stringify({
  ok: true,
  contract: 'supermega.public-browser-quarantine.v1',
  sourceAuditDigest: audit.evidenceDigest,
  sqlDigest: `sha256:${createHash('sha256').update(sql).digest('hex')}`,
  tables: expectedTables.length,
  sequences: expectedSequences.length,
  browserRolesDenied: browserRoles,
  serviceRolePreserved: true,
  idempotent: true,
  schemaDriftRejected: true,
  productionMutated: false,
})}\n`)
