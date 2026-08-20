#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const CONTRACT = 'supermega.supabase-security-advisor-audit.v2'
const QUERY_CONTRACT = 'supermega.supabase-security-metadata-query.v2'
const root = resolve(import.meta.dirname, '..')
const auditPath = resolve(root, 'hq', 'readiness', 'supabase-security-advisor-audit.json')
const packagePath = resolve(root, 'package.json')
const REMEDIATION_URL = 'https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy'
const PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
const SEQUENCE_PRIVILEGES = ['USAGE', 'SELECT']
const PUBLIC_SEQUENCES = ['supermega_leads_id_seq', 'supermega_sales_runs_id_seq']
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
  {
    version: 11,
    path: 'supabase/migrations/20260816120000_private_trial_backend_v11_self_serve_grants.sql',
    digest: 'sha256:133105acb69e7c305876d86e0c6a55b53164efabd166a962b5fb90dfac0ab2de',
  },
]
// v2: the audit records STATE, so the required next action depends on it.
const NEXT_ACTION_BLOCKED = 'Apply the digest-bound v8 through v11 chain and prepared public browser quarantine only on an owner-approved isolated target, then rerun advisor, exact relation and owner-scoped default-grant catalog, active-session revocation, role-boundary, storage, backup, and restore checks before any production proposal.'
const NEXT_ACTION_CLEAR = 'Schema v11 and the public browser quarantine are live with a clear advisor. Current objects and postgres-owned application defaults deny browser roles; monitor provider-owned supabase_admin defaults, provision the dedicated runtime login, and complete hosted activation proofs.'

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

  // v2: findingCount counts ACTIONABLE findings (ERROR/WARN). The rls_enabled_no_policy INFO
  // entries on the quarantined legacy tables are the accepted default-deny posture and are
  // recorded separately under acceptedInfo so a clear advisor stays honest about them.
  const advisor = value.advisor
  if (!isRecord(advisor)
    || advisor.type !== 'security'
    || !['blocked', 'clear'].includes(advisor.status)
    || !Number.isInteger(advisor.findingCount)
    || advisor.findingCount < 0
    || advisor.status !== (advisor.findingCount === 0 ? 'clear' : 'blocked')
    || !isRecord(advisor.acceptedInfo)
    || advisor.acceptedInfo.lint !== 'rls_enabled_no_policy'
    || advisor.acceptedInfo.level !== 'INFO'
    || advisor.acceptedInfo.count !== advisor.acceptedInfo.tables?.length
    || advisor.acceptedInfo.count < 1
    || advisor.remediationUrl !== REMEDIATION_URL) fail('supabase_security_audit_advisor_invalid')
  if (advisor.acceptedInfo.tables.some((table) => !/^[a-z][a-z0-9_]{0,62}$/.test(table))
    || advisor.acceptedInfo.tables.join(',') !== sortedUnique(advisor.acceptedInfo.tables).join(',')) fail('supabase_security_audit_advisor_tables_invalid')

  // v2: expected browser privileges derive from the hardening state. Before the quarantine the
  // legacy grants are recorded as-found; after it every browser privilege list must be empty.
  const hardened = value.conclusion?.browserGrantHardeningRequired === false
  const expectedTablePrivileges = hardened ? '' : PRIVILEGES.join(',')
  const expectedSequencePrivileges = hardened ? '' : SEQUENCE_PRIVILEGES.join(',')
  const catalog = value.catalog
  if (!isRecord(catalog)
    || catalog.queryContract !== QUERY_CONTRACT
    || catalog.scope !== 'pg_catalog_metadata_only'
    || catalog.businessRowsRead !== 0
    || catalog.tableCount !== catalog.tables?.length
    || catalog.tableCount !== advisor.acceptedInfo.count
    || catalog.nonTableRelationCount !== 0
    || catalog.publicRoutineCount !== 0
    || catalog.browserCallableRoutineCount !== 0
    || catalog.sequenceCount !== catalog.sequences?.length
    || catalog.sequenceCount !== PUBLIC_SEQUENCES.length
    || catalog.defaultPrivilegeOwners?.join(',') !== 'postgres,supabase_admin'
    || catalog.defaultBrowserTablePrivilegesPresent !== true
    || catalog.defaultBrowserSequencePrivilegesPresent !== true
    || catalog.defaultBrowserFunctionExecutePresent !== true
    || catalog.applicationOwnerDefaultBrowserTablePrivilegesPresent !== !hardened
    || catalog.applicationOwnerDefaultBrowserSequencePrivilegesPresent !== !hardened
    || catalog.applicationOwnerDefaultBrowserFunctionExecutePresent !== !hardened
    || catalog.providerOwnerDefaultBrowserTablePrivilegesPresent !== true
    || catalog.providerOwnerDefaultBrowserSequencePrivilegesPresent !== true
    || catalog.providerOwnerDefaultBrowserFunctionExecutePresent !== true) fail('supabase_security_audit_catalog_invalid')
  const catalogNames = []
  for (const table of catalog.tables) {
    if (!isRecord(table)
      || !/^[a-z][a-z0-9_]{0,62}$/.test(table.name || '')
      || table.schema !== 'public'
      || table.rlsEnabled !== true
      || table.rlsForced !== false
      || table.policyCount !== 0
      || table.anonPrivileges?.join(',') !== expectedTablePrivileges
      || table.authenticatedPrivileges?.join(',') !== expectedTablePrivileges) fail('supabase_security_audit_catalog_table_invalid')
    catalogNames.push(table.name)
  }
  if (catalogNames.join(',') !== sortedUnique(catalogNames).join(',')
    || catalogNames.join(',') !== advisor.acceptedInfo.tables.join(',')) fail('supabase_security_audit_catalog_table_set_invalid')
  if (catalog.sequences.map((sequence) => sequence.name).join(',') !== PUBLIC_SEQUENCES.join(',')) {
    fail('supabase_security_audit_catalog_sequence_set_invalid')
  }
  for (const sequence of catalog.sequences) {
    if (!isRecord(sequence)
      || sequence.schema !== 'public'
      || sequence.anonPrivileges?.join(',') !== expectedSequencePrivileges
      || sequence.authenticatedPrivileges?.join(',') !== expectedSequencePrivileges) {
      fail('supabase_security_audit_catalog_sequence_invalid')
    }
  }

  // v2: schema version may sit anywhere on the approved v7 -> v11 path; every dependent count
  // must be arithmetically consistent with it (v9 adds metadata RLS + one policy, v10 adds the
  // session-revocation definer, and v11 adds two self-serve policies), while pendingMigrations
  // must be exactly the not-yet-applied tail.
  const managed = value.managedBackend
  if (!isRecord(managed)
    || managed.queryContract !== MANAGED_QUERY_CONTRACT
    || managed.schema !== 'app_private'
    || !Number.isInteger(managed.liveSchemaVersion)
    || managed.liveSchemaVersion < 7
    || managed.liveSchemaVersion > 11
    || managed.localTargetVersion !== 11
    || managed.versionDrift !== managed.localTargetVersion - managed.liveSchemaVersion
    || managed.tableCount !== 6
    || typeof managed.metadataRlsEnabled !== 'boolean'
    || managed.metadataRlsEnabled !== managed.liveSchemaVersion >= 9
    || managed.rlsTableCount !== (managed.metadataRlsEnabled ? 6 : 5)
    || managed.policyCount !== (managed.liveSchemaVersion >= 11 ? 17 : (managed.metadataRlsEnabled ? 15 : 14))
    || managed.performancePolicyFindingCount !== (managed.liveSchemaVersion >= 8 ? 0 : 10)
    || managed.browserRolesDenied !== true
    || managed.serverBypassRoleDenied !== true
    || managed.runtimeRoleSchemaUsage !== true
    || managed.runtimeRoleSchemaCreate !== false
    || managed.securityDefinerFunctionCount !== (managed.liveSchemaVersion >= 10 ? 2 : 1)
    || managed.securityDefinerPublicExecute !== false
    || managed.securityDefinerActorContextChecked !== true
    || managed.securityDefinerSearchPathFixed !== true
    || managed.viewCount !== 0
    || managed.storageBucketCount !== 0
    || managed.postgrestSchemaSettingObservable !== false
    || JSON.stringify(managed.pendingMigrations) !== JSON.stringify(PENDING_MIGRATIONS.filter((migration) => migration.version > managed.liveSchemaVersion))) fail('supabase_security_audit_managed_backend_invalid')

  const conclusion = value.conclusion
  const expectClear = advisor.status === 'clear' && managed.versionDrift === 0 && hardened
  if (!isRecord(conclusion)
    || conclusion.status !== (expectClear ? 'clear' : 'blocked')
    || conclusion.directBrowserTableAccessDefaultDenied !== true
    || conclusion.indirectExposureAudited !== true
    || conclusion.currentRowExposureProven !== false
    || typeof conclusion.browserGrantHardeningRequired !== 'boolean'
    || conclusion.productionMutationAuthorized !== false
    || conclusion.nextAction !== (expectClear ? NEXT_ACTION_CLEAR : NEXT_ACTION_BLOCKED)) fail('supabase_security_audit_conclusion_invalid')

  const controls = value.controls
  if (!isRecord(controls)
    || !Number.isInteger(controls.connectorReadRequests)
    || controls.connectorReadRequests < 1
    || !Number.isInteger(controls.failedReadRequests)
    || controls.failedReadRequests < 0
    || controls.failedReadRequests > controls.connectorReadRequests
    || controls.providerMutations !== 0
    || controls.databaseWrites !== 0
    || controls.businessRowsRead !== 0
    || controls.credentialsRecorded !== false) fail('supabase_security_audit_controls_invalid')

  const serialized = JSON.stringify(value).toLowerCase()
  if (serialized.includes('postgresql://') || serialized.includes('password=') || serialized.includes('service_role') || serialized.includes('sb_secret_')) fail('supabase_security_audit_sensitive_value')
  if (!skipDigest && (!/^sha256:[0-9a-f]{64}$/.test(value.evidenceDigest || '') || value.evidenceDigest !== auditDigest(value))) fail('supabase_security_audit_digest_invalid')
  return value
}

function fixture(state = 'blocked') {
  const hardened = state === 'clear'
  const tablePrivileges = hardened ? [] : PRIVILEGES
  const sequencePrivileges = hardened ? [] : SEQUENCE_PRIVILEGES
  const value = {
    contract: CONTRACT,
    asOf: '2026-08-03T19:24:36.522Z',
    projectRef: 'abcdefghijklmnopqrst',
    targetClassification: 'protected-production',
    postgres: { major: 17, status: 'ACTIVE_HEALTHY' },
    advisor: {
      type: 'security',
      status: hardened ? 'clear' : 'blocked',
      findingCount: hardened ? 0 : 1,
      acceptedInfo: { lint: 'rls_enabled_no_policy', level: 'INFO', count: 1, tables: ['example_records'] },
      remediationUrl: REMEDIATION_URL,
    },
    catalog: {
      queryContract: QUERY_CONTRACT,
      scope: 'pg_catalog_metadata_only',
      businessRowsRead: 0,
      tableCount: 1,
      tables: [{ name: 'example_records', schema: 'public', rlsEnabled: true, rlsForced: false, policyCount: 0, anonPrivileges: tablePrivileges, authenticatedPrivileges: tablePrivileges }],
      nonTableRelationCount: 0,
      publicRoutineCount: 0,
      browserCallableRoutineCount: 0,
      sequenceCount: 2,
      sequences: PUBLIC_SEQUENCES.map((name) => ({ name, schema: 'public', anonPrivileges: sequencePrivileges, authenticatedPrivileges: sequencePrivileges })),
      defaultPrivilegeOwners: ['postgres', 'supabase_admin'],
      defaultBrowserTablePrivilegesPresent: true,
      defaultBrowserSequencePrivilegesPresent: true,
      defaultBrowserFunctionExecutePresent: true,
      applicationOwnerDefaultBrowserTablePrivilegesPresent: !hardened,
      applicationOwnerDefaultBrowserSequencePrivilegesPresent: !hardened,
      applicationOwnerDefaultBrowserFunctionExecutePresent: !hardened,
      providerOwnerDefaultBrowserTablePrivilegesPresent: true,
      providerOwnerDefaultBrowserSequencePrivilegesPresent: true,
      providerOwnerDefaultBrowserFunctionExecutePresent: true,
    },
    managedBackend: {
      queryContract: MANAGED_QUERY_CONTRACT,
      schema: 'app_private',
      liveSchemaVersion: hardened ? 11 : 7,
      localTargetVersion: 11,
      versionDrift: hardened ? 0 : 4,
      tableCount: 6,
      rlsTableCount: hardened ? 6 : 5,
      policyCount: hardened ? 17 : 14,
      performancePolicyFindingCount: hardened ? 0 : 10,
      metadataRlsEnabled: hardened,
      browserRolesDenied: true,
      serverBypassRoleDenied: true,
      runtimeRoleSchemaUsage: true,
      runtimeRoleSchemaCreate: false,
      securityDefinerFunctionCount: hardened ? 2 : 1,
      securityDefinerPublicExecute: false,
      securityDefinerActorContextChecked: true,
      securityDefinerSearchPathFixed: true,
      viewCount: 0,
      storageBucketCount: 0,
      postgrestSchemaSettingObservable: false,
      pendingMigrations: hardened ? [] : PENDING_MIGRATIONS,
    },
    conclusion: {
      status: hardened ? 'clear' : 'blocked',
      directBrowserTableAccessDefaultDenied: true,
      indirectExposureAudited: true,
      currentRowExposureProven: false,
      browserGrantHardeningRequired: !hardened,
      productionMutationAuthorized: false,
      nextAction: hardened ? NEXT_ACTION_CLEAR : NEXT_ACTION_BLOCKED,
    },
    controls: { connectorReadRequests: 20, failedReadRequests: 1, providerMutations: 0, databaseWrites: 0, businessRowsRead: 0, credentialsRecorded: false },
    evidenceDigest: '',
  }
  value.evidenceDigest = auditDigest(value)
  return value
}

function selfTest() {
  const valid = fixture()
  validateSupabaseSecurityAdvisorAudit(valid, valid.projectRef)
  const clearValid = fixture('clear')
  validateSupabaseSecurityAdvisorAudit(clearValid, clearValid.projectRef)
  const wrongTarget = structuredClone(valid)
  wrongTarget.projectRef = 'bcdefghijklmnopqrstu'
  const broadClaim = structuredClone(valid)
  broadClaim.conclusion.indirectExposureAudited = false
  const hiddenMutation = structuredClone(valid)
  hiddenMutation.controls.databaseWrites = 1
  const stale = structuredClone(valid)
  stale.advisor.acceptedInfo.tables = ['renamed_records']
  const migrationDrift = structuredClone(valid)
  migrationDrift.managedBackend.liveSchemaVersion = 8
  // A clear claim must be unforgeable from a blocked snapshot: flipping any single field fails.
  const launderedStatus = structuredClone(valid)
  launderedStatus.advisor.status = 'clear'
  const launderedConclusion = structuredClone(valid)
  launderedConclusion.conclusion.status = 'clear'
  const launderedGrants = structuredClone(clearValid)
  launderedGrants.catalog.tables[0].anonPrivileges = PRIVILEGES
  const checks = {
    accepts_exact_blocked_snapshot: true,
    accepts_exact_clear_snapshot: true,
    rejects_wrong_project: throws(() => validateSupabaseSecurityAdvisorAudit(wrongTarget, valid.projectRef), 'supabase_security_audit_target_invalid'),
    rejects_unproven_safety_claim: throws(() => validateSupabaseSecurityAdvisorAudit(broadClaim, valid.projectRef), 'supabase_security_audit_conclusion_invalid'),
    rejects_provider_mutation: throws(() => validateSupabaseSecurityAdvisorAudit(hiddenMutation, valid.projectRef), 'supabase_security_audit_controls_invalid'),
    rejects_stale_table_set: throws(() => validateSupabaseSecurityAdvisorAudit(stale, valid.projectRef), 'supabase_security_audit_catalog_table_set_invalid'),
    rejects_inconsistent_migration_state: throws(() => validateSupabaseSecurityAdvisorAudit(migrationDrift, valid.projectRef), 'supabase_security_audit_managed_backend_invalid'),
    rejects_laundered_advisor_status: throws(() => validateSupabaseSecurityAdvisorAudit(launderedStatus, valid.projectRef), 'supabase_security_audit_advisor_invalid'),
    rejects_laundered_conclusion: throws(() => validateSupabaseSecurityAdvisorAudit(launderedConclusion, valid.projectRef), 'supabase_security_audit_conclusion_invalid'),
    rejects_leftover_browser_grants: throws(() => validateSupabaseSecurityAdvisorAudit(launderedGrants, valid.projectRef), 'supabase_security_audit_catalog_table_invalid'),
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
