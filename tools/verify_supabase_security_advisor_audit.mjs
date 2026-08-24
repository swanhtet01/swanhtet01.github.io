#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export const CONTRACT = 'supermega.supabase-security-advisor-audit.v2'
const QUERY_CONTRACT = 'supermega.supabase-security-metadata-query.v3'
const MANAGED_QUERY_CONTRACT = 'supermega.supabase-managed-schema-metadata.v2'
const REMEDIATION_URL = 'https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy'
const PUBLIC_TABLES = [
  'assets',
  'enterprise_agent_runs',
  'enterprise_audit_events',
  'enterprise_connector_events',
  'enterprise_knowledge_chunks',
  'enterprise_knowledge_embeddings',
  'enterprise_lead_activities',
  'enterprise_lead_hunt_profiles',
  'enterprise_leads',
  'enterprise_memberships',
  'enterprise_metric_records',
  'enterprise_module_definitions',
  'enterprise_sessions',
  'enterprise_source_change_events',
  'enterprise_source_records',
  'enterprise_users',
  'enterprise_workspace_domains',
  'enterprise_workspace_modules',
  'enterprise_workspace_profiles',
  'enterprise_workspace_tasks',
  'enterprise_workspaces',
  'iot_telemetry',
  'production_ledger',
  'supermega_campaign_clicks',
  'supermega_leads',
  'supermega_sales_runs',
  'wcm_incidents',
]
const PUBLIC_SEQUENCES = ['supermega_leads_id_seq', 'supermega_sales_runs_id_seq']
const REQUIRED_MIGRATION_VERSIONS = [
  '20260711081400',
  '20260802072648',
  '20260802072815',
  '20260802082228',
  '20260802092247',
  '20260802095327',
  '20260802104310',
  '20260802114122',
  '20260812141150',
  '20260812141228',
  '20260812141259',
  '20260812141352',
]
const NEXT_ACTION = 'Restore source parity through R1, then run the digest-bound chain on one owner-approved empty preview branch for at most 24 hours; prove tenant isolation, active-session revocation, private Storage, backup and clean restore, and rerun both advisors before proposing any managed activation.'

const root = resolve(import.meta.dirname, '..')
const auditPath = resolve(root, 'hq', 'readiness', 'supabase-security-advisor-audit.json')
const packagePath = resolve(root, 'package.json')

function fail(code) {
  throw new Error(code)
}

function isRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

export function auditDigest(value) {
  const canonical = structuredClone(value)
  delete canonical.evidenceDigest
  return `sha256:${createHash('sha256').update(stableStringify(canonical)).digest('hex')}`
}

function exact(value, expected) {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((entry, index) => entry === expected[index])
}

export function validateSupabaseSecurityAdvisorAudit(value, expectedProjectRef, { skipDigest = false } = {}) {
  if (!isRecord(value)
    || value.contract !== CONTRACT
    || !Number.isFinite(Date.parse(value.asOf))
    || value.projectRef !== expectedProjectRef
    || value.targetClassification !== 'protected-production') fail('supabase_security_audit_contract_invalid')
  if (value.postgres?.major !== 17 || value.postgres?.status !== 'ACTIVE_HEALTHY') fail('supabase_security_audit_postgres_invalid')

  const migrations = value.productionMigrations
  if (!isRecord(migrations)
    || migrations.liveManagedSchemaVersion !== 10
    || migrations.sourceTargetVersion !== 10
    || migrations.versionDrift !== 0
    || !exact(migrations.appliedVersions, REQUIRED_MIGRATION_VERSIONS)
    || migrations.publicBrowserQuarantine?.version !== '20260812141352'
    || migrations.publicBrowserQuarantine?.name !== 'public_browser_quarantine'
    || migrations.publicBrowserQuarantine?.present !== true
    || migrations.managedWritesEnabled !== false) fail('supabase_security_audit_migrations_invalid')

  const advisor = value.advisor
  if (!isRecord(advisor)
    || advisor.type !== 'security'
    || advisor.status !== 'reviewed_fail_closed'
    || advisor.findingCount !== PUBLIC_TABLES.length
    || advisor.lintCounts?.rls_enabled_no_policy !== PUBLIC_TABLES.length
    || advisor.levelCounts?.INFO !== PUBLIC_TABLES.length
    || advisor.remediationUrl !== REMEDIATION_URL
    || !exact(advisor.tables, PUBLIC_TABLES)) fail('supabase_security_audit_advisor_invalid')

  const catalog = value.catalog
  if (!isRecord(catalog)
    || catalog.queryContract !== QUERY_CONTRACT
    || catalog.scope !== 'pg_catalog_metadata_only'
    || catalog.businessRowsRead !== 0
    || catalog.publicTableCount !== PUBLIC_TABLES.length
    || catalog.publicTableRlsCount !== PUBLIC_TABLES.length
    || catalog.publicTablePolicyCount !== 0
    || catalog.browserPrivilegedTableCount !== 0
    || !exact(catalog.tableNames, PUBLIC_TABLES)
    || catalog.publicSequenceCount !== PUBLIC_SEQUENCES.length
    || catalog.browserPrivilegedSequenceCount !== 0
    || !exact(catalog.sequenceNames, PUBLIC_SEQUENCES)
    || catalog.publicViewCount !== 0
    || catalog.publicRoutineCount !== 0
    || catalog.browserCallableRoutineCount !== 0
    || catalog.postgresOwnerDefaultBrowserGrantCount !== 0
    || catalog.supabaseAdminDefaultBrowserGrantCount !== 24
    || catalog.futureObjectRiskState !== 'provider-owned-defaults-remain') fail('supabase_security_audit_catalog_invalid')

  const managed = value.managedBackend
  if (!isRecord(managed)
    || managed.queryContract !== MANAGED_QUERY_CONTRACT
    || managed.schema !== 'app_private'
    || managed.liveSchemaVersion !== 10
    || managed.localTargetVersion !== 10
    || managed.versionDrift !== 0
    || managed.tableCount !== 6
    || managed.rlsTableCount !== 6
    || managed.policyCount !== 15
    || !exact(managed.policyRoleSets, ['supermega_trial_backend'])
    || managed.browserRolesDenied !== true
    || managed.runtimeRoleSchemaUsage !== true
    || managed.runtimeRoleSchemaCreate !== false
    || managed.functionCount !== 8
    || managed.securityDefinerFunctionCount !== 2
    || managed.browserCallableFunctionCount !== 0
    || managed.storageBucketCount !== 0
    || managed.postgrestSchemaSettingObservable !== false) fail('supabase_security_audit_managed_backend_invalid')

  const conclusion = value.conclusion
  if (!isRecord(conclusion)
    || conclusion.status !== 'blocked_for_managed_activation'
    || conclusion.currentPublicBrowserObjectAccessDenied !== true
    || conclusion.publicBrowserDefaultDenyIntent !== true
    || conclusion.currentRowExposureProven !== false
    || conclusion.futureProviderOwnedDefaultGrantRisk !== true
    || conclusion.previewRehearsalRequired !== true
    || conclusion.productionMutationAuthorized !== false
    || conclusion.nextAction !== NEXT_ACTION) fail('supabase_security_audit_conclusion_invalid')

  const controls = value.controls
  if (!isRecord(controls)
    || !Number.isInteger(controls.connectorReadRequests)
    || controls.connectorReadRequests < 1
    || controls.providerMutations !== 0
    || controls.databaseWrites !== 0
    || controls.businessRowsRead !== 0
    || controls.credentialsRecorded !== false) fail('supabase_security_audit_controls_invalid')

  const serialized = JSON.stringify(value).toLowerCase()
  if (serialized.includes('postgresql://') || serialized.includes('password=') || serialized.includes('sb_secret_')) fail('supabase_security_audit_sensitive_value')
  if (!skipDigest && (!/^sha256:[0-9a-f]{64}$/.test(value.evidenceDigest || '') || value.evidenceDigest !== auditDigest(value))) fail('supabase_security_audit_digest_invalid')
  return value
}

function throws(action, code) {
  try {
    action()
    return false
  } catch (error) {
    return error?.message === code
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length > 1 || (args[0] && args[0] !== '--self-test')) fail('supabase_security_audit_arguments_invalid')
  const [audit, packageManifest] = await Promise.all([
    readFile(auditPath, 'utf8').then(JSON.parse),
    readFile(packagePath, 'utf8').then(JSON.parse),
  ])
  validateSupabaseSecurityAdvisorAudit(audit, packageManifest.supermega?.productionSupabaseProjectRef)
  if (args[0] === '--self-test') {
    const stale = structuredClone(audit)
    stale.productionMigrations.liveManagedSchemaVersion = 9
    const leaked = structuredClone(audit)
    leaked.catalog.browserPrivilegedTableCount = 1
    const mutation = structuredClone(audit)
    mutation.controls.databaseWrites = 1
    const result = {
      ok: throws(() => validateSupabaseSecurityAdvisorAudit(stale, audit.projectRef, { skipDigest: true }), 'supabase_security_audit_migrations_invalid')
        && throws(() => validateSupabaseSecurityAdvisorAudit(leaked, audit.projectRef, { skipDigest: true }), 'supabase_security_audit_catalog_invalid')
        && throws(() => validateSupabaseSecurityAdvisorAudit(mutation, audit.projectRef, { skipDigest: true }), 'supabase_security_audit_controls_invalid'),
      contract: CONTRACT,
      tests: 3,
    }
    console.log(JSON.stringify(result))
    if (!result.ok) process.exitCode = 1
    return
  }
  console.log(JSON.stringify({ ok: true, contract: audit.contract, projectRef: audit.projectRef, liveSchemaVersion: audit.managedBackend.liveSchemaVersion, publicBrowserObjectAccessDenied: true, productionMutationAuthorized: false }))
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error?.message || 'supabase_security_audit_failed').slice(0, 240), externalWritesPerformed: false }))
  process.exitCode = 1
})
