#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const CONTRACT = 'supermega.supabase-security-advisor-audit.v1'
const QUERY_CONTRACT = 'supermega.supabase-security-metadata-query.v1'
const root = resolve(import.meta.dirname, '..')
const auditPath = resolve(root, 'hq', 'readiness', 'supabase-security-advisor-audit.json')
const packagePath = resolve(root, 'package.json')
const REMEDIATION_URL = 'https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy'
const PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
const MANAGED_QUERY_CONTRACT = 'supermega.supabase-managed-schema-metadata.v1'
const PENDING_MIGRATIONS = [
  {
    version: 8,
    path: 'supabase/migrations/20260802161500_private_trial_backend_v8_rls_initplan.sql',
    digest: 'sha256:2886d53c39a08cbd129ca0a3def051b9129bbc96c49add058122520ee3d7d0ab',
  },
  {
    version: 9,
    path: 'supabase/migrations/20260803063822_private_trial_backend_v9_metadata_rls.sql',
    digest: 'sha256:1dc908aeaf88bc91e03c566e31652816fba699aaf0bcce5b0d5c512ad9ab0115',
  },
  {
    version: 10,
    path: 'supabase/migrations/20260804102000_private_trial_backend_v10_supabase_session_revocation.sql',
    digest: 'sha256:0a112ee27bda7ca238f3992ffab841c414268e44aad6b68023c75915afa40cde',
  },
]
const NEXT_ACTION = 'Apply local v8 through v10 plus explicit public browser-grant hardening only on an owner-approved isolated target, then rerun migration, advisor, active-session revocation, role-boundary, and storage checks before any production proposal.'

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

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

export function validateSupabaseSecurityAdvisorAudit(value, expectedProjectRef, { skipDigest = false } = {}) {
  if (!isRecord(value) || value.contract !== CONTRACT || !Number.isFinite(Date.parse(value.asOf))) fail('supabase_security_audit_contract_invalid')
  if (!/^[a-z]{20}$/.test(expectedProjectRef || '') || value.projectRef !== expectedProjectRef || value.targetClassification !== 'protected-production') fail('supabase_security_audit_target_invalid')
  if (value.postgres?.major !== 17 || value.postgres?.status !== 'ACTIVE_HEALTHY') fail('supabase_security_audit_postgres_invalid')

  const advisor = value.advisor
  if (!isRecord(advisor)
    || advisor.type !== 'security'
    || advisor.status !== 'blocked'
    || advisor.findingCount !== advisor.tables?.length
    || advisor.findingCount < 1
    || advisor.lintCounts?.rls_enabled_no_policy !== advisor.findingCount
    || advisor.levelCounts?.INFO !== advisor.findingCount
    || Object.keys(advisor.lintCounts || {}).length !== 1
    || Object.keys(advisor.levelCounts || {}).length !== 1
    || advisor.remediationUrl !== REMEDIATION_URL) fail('supabase_security_audit_advisor_invalid')
  if (advisor.tables.some((table) => !/^[a-z][a-z0-9_]{0,62}$/.test(table))
    || advisor.tables.join(',') !== sortedUnique(advisor.tables).join(',')) fail('supabase_security_audit_advisor_tables_invalid')

  const catalog = value.catalog
  if (!isRecord(catalog)
    || catalog.queryContract !== QUERY_CONTRACT
    || catalog.scope !== 'pg_catalog_metadata_only'
    || catalog.businessRowsRead !== 0
    || catalog.tableCount !== catalog.tables?.length
    || catalog.tableCount !== advisor.findingCount) fail('supabase_security_audit_catalog_invalid')
  const catalogNames = []
  for (const table of catalog.tables) {
    if (!isRecord(table)
      || !/^[a-z][a-z0-9_]{0,62}$/.test(table.name || '')
      || table.schema !== 'public'
      || table.rlsEnabled !== true
      || table.rlsForced !== false
      || table.policyCount !== 0
      || table.anonPrivileges?.join(',') !== PRIVILEGES.join(',')
      || table.authenticatedPrivileges?.join(',') !== PRIVILEGES.join(',')) fail('supabase_security_audit_catalog_table_invalid')
    catalogNames.push(table.name)
  }
  if (catalogNames.join(',') !== sortedUnique(catalogNames).join(',')
    || catalogNames.join(',') !== advisor.tables.join(',')) fail('supabase_security_audit_catalog_table_set_invalid')

  const managed = value.managedBackend
  if (!isRecord(managed)
    || managed.queryContract !== MANAGED_QUERY_CONTRACT
    || managed.schema !== 'app_private'
    || managed.liveSchemaVersion !== 7
    || managed.localTargetVersion !== 10
    || managed.versionDrift !== 3
    || managed.tableCount !== 6
    || managed.rlsTableCount !== 5
    || managed.policyCount !== 14
    || managed.performancePolicyFindingCount !== 10
    || managed.metadataRlsEnabled !== false
    || managed.browserRolesDenied !== true
    || managed.serverBypassRoleDenied !== true
    || managed.runtimeRoleSchemaUsage !== true
    || managed.runtimeRoleSchemaCreate !== false
    || managed.securityDefinerFunctionCount !== 1
    || managed.securityDefinerPublicExecute !== false
    || managed.securityDefinerActorContextChecked !== true
    || managed.securityDefinerSearchPathFixed !== true
    || managed.viewCount !== 0
    || managed.storageBucketCount !== 0
    || managed.postgrestSchemaSettingObservable !== false
    || JSON.stringify(managed.pendingMigrations) !== JSON.stringify(PENDING_MIGRATIONS)) fail('supabase_security_audit_managed_backend_invalid')

  const conclusion = value.conclusion
  if (!isRecord(conclusion)
    || conclusion.status !== 'blocked'
    || conclusion.directBrowserTableAccessDefaultDenied !== true
    || conclusion.indirectExposureAudited !== false
    || conclusion.currentRowExposureProven !== false
    || conclusion.browserGrantHardeningRequired !== true
    || conclusion.productionMutationAuthorized !== false
    || conclusion.nextAction !== NEXT_ACTION) fail('supabase_security_audit_conclusion_invalid')

  const controls = value.controls
  if (!isRecord(controls)
    || controls.connectorReadRequests !== 16
    || controls.failedReadRequests !== 1
    || controls.providerMutations !== 0
    || controls.databaseWrites !== 0
    || controls.businessRowsRead !== 0
    || controls.credentialsRecorded !== false) fail('supabase_security_audit_controls_invalid')

  const serialized = JSON.stringify(value).toLowerCase()
  if (serialized.includes('postgresql://') || serialized.includes('password=') || serialized.includes('service_role') || serialized.includes('sb_secret_')) fail('supabase_security_audit_sensitive_value')
  if (!skipDigest && (!/^sha256:[0-9a-f]{64}$/.test(value.evidenceDigest || '') || value.evidenceDigest !== auditDigest(value))) fail('supabase_security_audit_digest_invalid')
  return value
}

function fixture() {
  const value = {
    contract: CONTRACT,
    asOf: '2026-08-03T19:24:36.522Z',
    projectRef: 'abcdefghijklmnopqrst',
    targetClassification: 'protected-production',
    postgres: { major: 17, status: 'ACTIVE_HEALTHY' },
    advisor: {
      type: 'security',
      status: 'blocked',
      findingCount: 1,
      lintCounts: { rls_enabled_no_policy: 1 },
      levelCounts: { INFO: 1 },
      remediationUrl: REMEDIATION_URL,
      tables: ['example_records'],
    },
    catalog: {
      queryContract: QUERY_CONTRACT,
      scope: 'pg_catalog_metadata_only',
      businessRowsRead: 0,
      tableCount: 1,
      tables: [{ name: 'example_records', schema: 'public', rlsEnabled: true, rlsForced: false, policyCount: 0, anonPrivileges: PRIVILEGES, authenticatedPrivileges: PRIVILEGES }],
    },
    managedBackend: {
      queryContract: MANAGED_QUERY_CONTRACT,
      schema: 'app_private',
      liveSchemaVersion: 7,
      localTargetVersion: 10,
      versionDrift: 3,
      tableCount: 6,
      rlsTableCount: 5,
      policyCount: 14,
      performancePolicyFindingCount: 10,
      metadataRlsEnabled: false,
      browserRolesDenied: true,
      serverBypassRoleDenied: true,
      runtimeRoleSchemaUsage: true,
      runtimeRoleSchemaCreate: false,
      securityDefinerFunctionCount: 1,
      securityDefinerPublicExecute: false,
      securityDefinerActorContextChecked: true,
      securityDefinerSearchPathFixed: true,
      viewCount: 0,
      storageBucketCount: 0,
      postgrestSchemaSettingObservable: false,
      pendingMigrations: PENDING_MIGRATIONS,
    },
    conclusion: {
      status: 'blocked',
      directBrowserTableAccessDefaultDenied: true,
      indirectExposureAudited: false,
      currentRowExposureProven: false,
      browserGrantHardeningRequired: true,
      productionMutationAuthorized: false,
      nextAction: NEXT_ACTION,
    },
    controls: { connectorReadRequests: 16, failedReadRequests: 1, providerMutations: 0, databaseWrites: 0, businessRowsRead: 0, credentialsRecorded: false },
    evidenceDigest: '',
  }
  value.evidenceDigest = auditDigest(value)
  return value
}

function selfTest() {
  const valid = fixture()
  validateSupabaseSecurityAdvisorAudit(valid, valid.projectRef)
  const wrongTarget = structuredClone(valid)
  wrongTarget.projectRef = 'bcdefghijklmnopqrstu'
  const broadClaim = structuredClone(valid)
  broadClaim.conclusion.indirectExposureAudited = true
  const hiddenMutation = structuredClone(valid)
  hiddenMutation.controls.databaseWrites = 1
  const stale = structuredClone(valid)
  stale.advisor.tables = ['renamed_records']
  const migrationDrift = structuredClone(valid)
  migrationDrift.managedBackend.liveSchemaVersion = 8
  const checks = {
    accepts_exact_blocked_snapshot: true,
    rejects_wrong_project: throws(() => validateSupabaseSecurityAdvisorAudit(wrongTarget, valid.projectRef), 'supabase_security_audit_target_invalid'),
    rejects_unproven_safety_claim: throws(() => validateSupabaseSecurityAdvisorAudit(broadClaim, valid.projectRef), 'supabase_security_audit_conclusion_invalid'),
    rejects_provider_mutation: throws(() => validateSupabaseSecurityAdvisorAudit(hiddenMutation, valid.projectRef), 'supabase_security_audit_controls_invalid'),
    rejects_stale_table_set: throws(() => validateSupabaseSecurityAdvisorAudit(stale, valid.projectRef), 'supabase_security_audit_catalog_table_set_invalid'),
    rejects_unproven_migration_state: throws(() => validateSupabaseSecurityAdvisorAudit(migrationDrift, valid.projectRef), 'supabase_security_audit_managed_backend_invalid'),
  }
  return { ok: Object.values(checks).every(Boolean), contract: CONTRACT, checks }
}

function throws(callback, code) {
  try {
    callback()
    return false
  } catch (error) {
    return error instanceof Error && error.message === code
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length > 1 || (args[0] && !['--self-test', '--print-digest'].includes(args[0]))) fail('supabase_security_audit_argument_invalid')
  if (args[0] === '--self-test') return selfTest()
  const [audit, packageManifest] = await Promise.all([
    readFile(auditPath, 'utf8').then(JSON.parse),
    readFile(packagePath, 'utf8').then(JSON.parse),
  ])
  const expectedProjectRef = packageManifest?.supermega?.productionSupabaseProjectRef
  if (packageManifest?.supermega?.productionSupabaseTargetStatus !== 'protected-unapproved') fail('supabase_security_audit_production_boundary_invalid')
  if (args[0] === '--print-digest') {
    validateSupabaseSecurityAdvisorAudit(audit, expectedProjectRef, { skipDigest: true })
    return { ok: true, contract: CONTRACT, expectedDigest: auditDigest(audit) }
  }
  validateSupabaseSecurityAdvisorAudit(audit, expectedProjectRef)
  return {
    ok: true,
    contract: CONTRACT,
    projectRef: audit.projectRef,
    status: audit.conclusion.status,
    findings: audit.advisor.findingCount,
    browserGrantHardeningRequired: audit.conclusion.browserGrantHardeningRequired,
    providerMutations: 0,
  }
}

main()
  .then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`)
    if (!result.ok) process.exitCode = 1
  })
  .catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, contract: CONTRACT, error: error instanceof Error ? error.message : 'unknown_error' })}\n`)
    process.exitCode = 1
  })
