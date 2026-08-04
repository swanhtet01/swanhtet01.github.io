import { createHash } from 'node:crypto'

export const MANAGED_PILOT_READINESS_CONTRACT = 'supermega.managed-pilot-readiness.v1'

const PRODUCT_IDS = ['shop', 'plant', 'website', 'ecommerce']
const GATE_IDS = [
  'local_postgres17',
  'hosted_postgres17',
  'hosted_storage_privacy',
  'live_product_contract',
  'managed_persistence',
  'security',
  'named_pilot',
  'production_activation',
]

const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)

function fail(code) {
  throw new Error(code)
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

export function readinessDigest(value) {
  const canonical = typeof value === 'string'
    ? value.replace(/\r\n?/g, '\n')
    : stableStringify(value)
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`
}

function field(markdown, label) {
  const match = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*(.+)$`, 'm').exec(markdown)
  if (!match?.[1]) fail(`managed_pilot_readiness_${label.toLowerCase().replaceAll(' ', '_')}_missing`)
  const value = match[1].trim()
  return /^`[^`]+`$/.test(value) ? value.slice(1, -1) : value
}

function gate(id, status, evidence, nextAction) {
  return { id, status, evidence, nextAction }
}

export function buildManagedPilotReadiness(input = {}) {
  const portfolio = input.portfolio
  const database = input.databaseEvidence
  const now = String(input.hqNow || '')
  const storage = String(input.storageAudit || '')
  const securityAudit = input.securityAudit
  const packageManifest = input.packageManifest
  const sourceReceipts = input.sourceReceipts
  if (!isRecord(portfolio) || portfolio.schemaVersion !== 'supermega.hq.portfolio.v3' || !Array.isArray(portfolio.products)) fail('managed_pilot_readiness_portfolio_invalid')
  if (!isRecord(database) || database.schemaVersion !== 'supermega.hq.database-rehearsal.v2' || Object.keys(database.checks || {}).length !== 56 || Object.values(database.checks || {}).some((value) => value !== true)) fail('managed_pilot_readiness_database_evidence_invalid')
  if (database.checks?.publicBrowserQuarantineEnforced !== true
    || database.checks?.publicBrowserQuarantineIdempotent !== true
    || database.checks?.restoredPublicBrowserQuarantinePreserved !== true) fail('managed_pilot_readiness_database_quarantine_invalid')
  if (database.storage?.hostedStoragePrivacyProofRequired !== true || database.localVerification?.externallyHosted !== false) fail('managed_pilot_readiness_database_scope_invalid')
  if (!storage.includes('Status: local verifier ready; hosted proof blocked')) fail('managed_pilot_readiness_storage_evidence_invalid')
  if (!isRecord(packageManifest?.supermega) || packageManifest.supermega.productionSupabaseTargetStatus !== 'protected-unapproved') fail('managed_pilot_readiness_production_boundary_invalid')
  if (!isRecord(securityAudit)
    || securityAudit.contract !== 'supermega.supabase-security-advisor-audit.v1'
    || securityAudit.targetClassification !== 'protected-production'
    || securityAudit.projectRef !== packageManifest.supermega.productionSupabaseProjectRef
    || securityAudit.postgres?.major !== 17
    || securityAudit.advisor?.status !== 'blocked'
    || !Number.isInteger(securityAudit.advisor?.findingCount)
    || securityAudit.advisor.findingCount < 1
    || securityAudit.managedBackend?.liveSchemaVersion !== 7
    || securityAudit.managedBackend?.localTargetVersion !== 10
    || securityAudit.managedBackend?.versionDrift !== 3
    || securityAudit.managedBackend?.browserRolesDenied !== true
    || securityAudit.managedBackend?.metadataRlsEnabled !== false
    || securityAudit.managedBackend?.storageBucketCount !== 0
    || securityAudit.catalog?.sequenceCount !== 2
    || securityAudit.catalog?.nonTableRelationCount !== 0
    || securityAudit.catalog?.publicRoutineCount !== 0
    || securityAudit.catalog?.browserCallableRoutineCount !== 0
    || securityAudit.conclusion?.indirectExposureAudited !== true
    || securityAudit.conclusion?.productionMutationAuthorized !== false
    || securityAudit.controls?.databaseWrites !== 0
    || !Number.isFinite(Date.parse(securityAudit.asOf))) fail('managed_pilot_readiness_security_audit_invalid')
  if (!Array.isArray(sourceReceipts) || sourceReceipts.length !== 7 || sourceReceipts.some((receipt) => !/^[a-z0-9_./-]+$/i.test(receipt?.path || '') || !/^sha256:[0-9a-f]{64}$/.test(receipt?.digest || ''))) fail('managed_pilot_readiness_sources_invalid')

  const liveMode = field(now, 'Live operating mode')
  const managedPersistence = field(now, 'Live managed persistence ready')
  const securityReady = field(now, 'Live security ready')
  if (liveMode !== 'isolated_demo' || managedPersistence !== 'false' || securityReady !== 'false') fail('managed_pilot_readiness_live_boundary_invalid')
  if (!now.includes('exact current-head verification reports release drift') || !now.includes('No named pilot customer')) fail('managed_pilot_readiness_live_blockers_missing')

  const products = portfolio.products.map((product) => {
    const automation = product?.localAutomation
    if (!PRODUCT_IDS.includes(product?.id)
      || product.status !== 'release-candidate-local'
      || automation?.contract !== 'supermega.product-work-authority.v2'
      || automation?.productId !== product.id
      || automation?.status !== 'owner-gated'
      || !String(automation?.reason || '').trim()
      || !String(product?.nextGate || '').trim()) fail('managed_pilot_readiness_product_invalid')
    return {
      productId: product.id,
      localStatus: product.status,
      managedPilotStatus: 'blocked',
      automationStatus: automation.status,
      workOrderId: automation.workOrderId,
      proposedWork: automation.workOrder,
      blockingReason: automation.reason,
      requiredProof: product.nextGate,
    }
  })
  if (products.map((product) => product.productId).join(',') !== PRODUCT_IDS.join(',')) fail('managed_pilot_readiness_product_order_invalid')

  const gates = [
    gate('local_postgres17', 'ready-local', '56 checks, TLS, RLS, tenant isolation, active-session revocation, public browser quarantine, durable owner control, backup and restore.', 'Keep the digest-bound rehearsal current.'),
    gate('hosted_postgres17', 'blocked', `Protected production is PostgreSQL 17 at managed schema v${securityAudit.managedBackend.liveSchemaVersion}; no owner-approved isolated hosted rehearsal exists.`, 'Apply v8 through v10 plus the digest-bound public browser quarantine on an approved isolated Supabase target, then rerun the hosted validator and session-revocation proof.'),
    gate('hosted_storage_privacy', 'blocked', 'The six-request verifier is ready, but hosted proof is absent.', 'Run the verifier against an owner-approved isolated private bucket.'),
    gate('live_product_contract', 'blocked', 'The exact paired release is verified, but its managed product contract remains isolated_demo.', 'Prove managed persistence and security on the approved isolated target before any managed-pilot claim.'),
    gate('managed_persistence', 'blocked', 'Live managed persistence ready is false.', 'Prove durable commands, recovery, and tenant isolation on the isolated target.'),
    gate('security', 'blocked', `${securityAudit.advisor.findingCount} fail-closed public-table advisor findings remain; browser object/default grants are not yet quarantined on hosted Supabase, and protected managed schema v${securityAudit.managedBackend.liveSchemaVersion} trails local target v${securityAudit.managedBackend.localTargetVersion}.`, securityAudit.conclusion.nextAction),
    gate('named_pilot', 'blocked', 'HQ records no named pilot customer or measured baseline.', 'Select one Shop design partner, named operator, baseline, and acceptance evidence.'),
    gate('production_activation', 'blocked', 'The production Supabase target remains protected-unapproved.', 'Keep writes disabled until separate founder approval after every hosted gate passes.'),
  ]

  const result = {
    contract: MANAGED_PILOT_READINESS_CONTRACT,
    asOf: securityAudit.asOf,
    sourceDigest: readinessDigest(sourceReceipts),
    overall: {
      status: 'blocked',
      localDatabaseProofReady: true,
      hostedActivationReady: false,
      blockingGateCount: gates.filter((entry) => entry.status === 'blocked').length,
      nextAction: 'Approve one isolated non-production Supabase target and one named Shop pilot operator; protected production remains unchanged.',
    },
    gates,
    products,
    controls: {
      externalWritesPerformed: false,
      connectorRequestsPerformed: 0,
      modelCallsRequiredToBuild: 0,
      productionWritesEnabled: false,
      ownerApprovalRequired: true,
      safeAutomatedActions: ['rebuild_local_evidence', 'verify_current_ledger', 'rehearse_local_client_package'],
      forbiddenUntilReady: ['deploy', 'publish', 'production_write', 'customer_message', 'payment', 'hosted_scheduler_activation'],
    },
    sourceReceipts,
  }
  return validateManagedPilotReadiness(result)
}

export function validateManagedPilotReadiness(value) {
  if (!isRecord(value) || value.contract !== MANAGED_PILOT_READINESS_CONTRACT || !Number.isFinite(Date.parse(value.asOf))) fail('managed_pilot_readiness_contract_invalid')
  if (!/^sha256:[0-9a-f]{64}$/.test(value.sourceDigest || '') || value.sourceDigest !== readinessDigest(value.sourceReceipts)) fail('managed_pilot_readiness_digest_invalid')
  if (value.overall?.status !== 'blocked' || value.overall?.hostedActivationReady !== false || value.overall?.localDatabaseProofReady !== true || value.overall?.blockingGateCount !== 7) fail('managed_pilot_readiness_overall_invalid')
  if (!Array.isArray(value.gates) || value.gates.map((entry) => entry.id).join(',') !== GATE_IDS.join(',') || value.gates[0]?.status !== 'ready-local' || value.gates.slice(1).some((entry) => entry.status !== 'blocked')) fail('managed_pilot_readiness_gates_invalid')
  if (!Array.isArray(value.products) || value.products.map((product) => product.productId).join(',') !== PRODUCT_IDS.join(',') || value.products.some((product) => product.managedPilotStatus !== 'blocked' || product.automationStatus !== 'owner-gated')) fail('managed_pilot_readiness_products_invalid')
  if (value.controls?.externalWritesPerformed !== false || value.controls?.connectorRequestsPerformed !== 0 || value.controls?.modelCallsRequiredToBuild !== 0 || value.controls?.productionWritesEnabled !== false || value.controls?.ownerApprovalRequired !== true) fail('managed_pilot_readiness_controls_invalid')
  const serialized = JSON.stringify(value).toLowerCase()
  if (serialized.includes('postgresql://') || serialized.includes('password=') || serialized.includes('service_role')) fail('managed_pilot_readiness_sensitive_value')
  return value
}
