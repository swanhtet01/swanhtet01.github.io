import { createHash } from 'node:crypto'

export const MANAGED_PILOT_READINESS_CONTRACT = 'supermega.managed-pilot-readiness.v5'
export const SECURITY_AUDIT_CONTRACT = 'supermega.supabase-security-advisor-audit.v2'

const PRODUCT_IDS = ['shop', 'plant', 'website', 'ecommerce']
export const MANAGED_PILOT_READINESS_SOURCE_PATHS = [
  'hq/portfolio.json',
  'hq/research/postgres17-rehearsal.json',
  'hq/pilots/private-storage-privacy-audit.md',
  'hq/readiness/supabase-security-advisor-audit.json',
  'hq/NOW.md',
  'package.json',
  'kernel/managed-pilot-readiness.mjs',
]
const GATE_IDS = [
  'local_database_rehearsal',
  'production_source_parity',
  'preview_rehearsal',
  'managed_persistence',
  'hosted_storage_privacy',
  'managed_security',
  'owner_named_pilot',
  'production_activation',
]
const PROPOSED_ACTIONS = [
  'delete_failed_preview_branch',
  'create_one_empty_preview_branch',
  'apply_reviewed_migrations_to_preview',
  'create_one_owner_named_preview_operator',
  'run_hosted_isolation_storage_recovery_proof',
  'delete_preview_branch_after_evidence',
]
const FORBIDDEN_ACTIONS = [
  'production_database_change',
  'production_deploy',
  'customer_message',
  'payment',
  'stock_move',
  'managed_product_activation',
  'hosted_scheduler_activation',
]
const REQUIRED_QUARANTINE_CHECKS = [
  'publicBrowserQuarantineEnforced',
  'publicBrowserQuarantineIdempotent',
  'restoredPublicBrowserQuarantinePreserved',
]
const NEXT_ACTION_REQUIREMENTS = [
  'approve_failed_preview_branch_deletion',
  'confirm_preview_branch_cost',
  'approve_preview_branch_target',
  'name_shop_pilot_business',
  'name_shop_pilot_operator',
]
const NEXT_ACTION_DECISION_ID = 'replace-failed-preview-and-prepare-owner-named-shop-pilot'
const LOCAL_GATE_EVIDENCE = '56 local checks prove PostgreSQL 17 compatibility, TLS, RLS, tenant isolation, active-session revocation, public browser quarantine, durable owner control, backup, and restore.'
const REQUIRED_DATABASE_CHECK_COUNT = 56
const REQUIRED_SOURCE_RECEIPT_COUNT = 7

const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)

function fail(code) {
  throw new Error(code)
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

function exactStringArray(value, expected) {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((entry, index) => entry === expected[index])
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

function sourceParityEvidence(audit) {
  return `Protected production is PostgreSQL 17 at managed schema v${audit.liveSchemaVersion}; source targets v${audit.localTargetVersion}, current public objects deny browser roles, the quarantine migration is present, and managed writes remain disabled.`
}

function securityGateEvidence(audit) {
  return `Current production objects fail closed with ${audit.findingCount} INFO-only RLS-without-policy findings, but provider-owned future-object defaults remain and no accepted isolated tenant, Auth, session-revocation, Storage, backup, or restore proof exists.`
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
  if (!isRecord(database)
    || database.schemaVersion !== 'supermega.hq.database-rehearsal.v2'
    || Object.keys(database.checks || {}).length !== REQUIRED_DATABASE_CHECK_COUNT
    || Object.values(database.checks || {}).some((value) => value !== true)) fail('managed_pilot_readiness_database_evidence_invalid')
  if (REQUIRED_QUARANTINE_CHECKS.some((name) => database.checks?.[name] !== true)) fail('managed_pilot_readiness_database_quarantine_invalid')
  if (database.storage?.hostedStoragePrivacyProofRequired !== true || database.localVerification?.externallyHosted !== false) fail('managed_pilot_readiness_database_scope_invalid')
  if (!storage.includes('Status: local verifier ready; hosted proof blocked')) fail('managed_pilot_readiness_storage_evidence_invalid')
  if (!isRecord(packageManifest?.supermega)
    || packageManifest.supermega.productionSupabaseTargetStatus !== 'protected-unapproved') fail('managed_pilot_readiness_production_boundary_invalid')
  if (!isRecord(securityAudit)
    || securityAudit.contract !== SECURITY_AUDIT_CONTRACT
    || securityAudit.targetClassification !== 'protected-production'
    || securityAudit.projectRef !== packageManifest.supermega.productionSupabaseProjectRef
    || securityAudit.postgres?.major !== 17
    || securityAudit.postgres?.status !== 'ACTIVE_HEALTHY'
    || securityAudit.advisor?.status !== 'reviewed_fail_closed'
    || securityAudit.advisor?.findingCount !== 27
    || securityAudit.productionMigrations?.liveManagedSchemaVersion !== 10
    || securityAudit.productionMigrations?.sourceTargetVersion !== 10
    || securityAudit.productionMigrations?.versionDrift !== 0
    || securityAudit.productionMigrations?.publicBrowserQuarantine?.present !== true
    || securityAudit.productionMigrations?.managedWritesEnabled !== false
    || securityAudit.catalog?.publicTableCount !== 27
    || securityAudit.catalog?.publicTableRlsCount !== 27
    || securityAudit.catalog?.browserPrivilegedTableCount !== 0
    || securityAudit.catalog?.browserPrivilegedSequenceCount !== 0
    || securityAudit.catalog?.postgresOwnerDefaultBrowserGrantCount !== 0
    || securityAudit.catalog?.futureObjectRiskState !== 'provider-owned-defaults-remain'
    || securityAudit.managedBackend?.liveSchemaVersion !== 10
    || securityAudit.managedBackend?.localTargetVersion !== 10
    || securityAudit.managedBackend?.versionDrift !== 0
    || securityAudit.managedBackend?.browserRolesDenied !== true
    || securityAudit.conclusion?.productionMutationAuthorized !== false
    || securityAudit.controls?.databaseWrites !== 0
    || !Number.isFinite(Date.parse(securityAudit.asOf))) fail('managed_pilot_readiness_security_audit_invalid')
  if (!Array.isArray(sourceReceipts)
    || sourceReceipts.length !== REQUIRED_SOURCE_RECEIPT_COUNT
    || sourceReceipts.some((receipt) => !/^[a-z0-9_./-]+$/i.test(receipt?.path || '') || !/^sha256:[0-9a-f]{64}$/.test(receipt?.digest || ''))) fail('managed_pilot_readiness_sources_invalid')

  const liveMode = field(now, 'Live operating mode')
  const managedPersistence = field(now, 'Live managed persistence ready')
  const securityReady = field(now, 'Live security ready')
  if (liveMode !== 'isolated_demo' || managedPersistence !== 'false' || securityReady !== 'false') fail('managed_pilot_readiness_live_boundary_invalid')
  if (!now.includes('no release drift is present') || !now.includes('No named pilot customer')) fail('managed_pilot_readiness_live_blockers_missing')

  const auditSummary = {
    contract: SECURITY_AUDIT_CONTRACT,
    asOf: securityAudit.asOf,
    targetClassification: 'protected-production',
    advisorStatus: 'reviewed_fail_closed',
    findingCount: securityAudit.advisor.findingCount,
    liveSchemaVersion: 10,
    localTargetVersion: 10,
    versionDrift: 0,
    publicBrowserObjectAccessDenied: true,
    quarantineMigrationPresent: true,
    futureProviderOwnedDefaultGrantRisk: true,
    managedWritesEnabled: false,
    productionMutationAuthorized: false,
    databaseWrites: 0,
  }

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
    gate('local_database_rehearsal', 'ready-local', LOCAL_GATE_EVIDENCE, 'Keep the digest-bound local rehearsal current after every migration change.'),
    gate('production_source_parity', 'ready-metadata', sourceParityEvidence(auditSummary), 'Merge the reviewed R1 source-parity change before any hosted rehearsal or activation proposal.'),
    gate('preview_rehearsal', 'blocked', 'The existing preview branch ended MIGRATIONS_FAILED and is not acceptable proof; no clean, empty, maximum-24-hour rehearsal has passed.', 'After separate deletion and cost approvals, replace it with one empty branch, apply the reviewed source chain, retain metadata-only evidence, and delete it after the proof window.'),
    gate('managed_persistence', 'blocked', 'Live managed persistence ready is false and no preview persistence/recovery receipt is accepted.', 'Prove durable commands, idempotency, tenant isolation, active-session revocation, backup, and clean restore on the approved preview branch.'),
    gate('hosted_storage_privacy', 'blocked', 'The six-request privacy verifier is ready locally, but no isolated private-bucket proof is accepted.', 'Run the six-request proof on the approved preview branch without public buckets or browser grants.'),
    gate('managed_security', 'blocked', securityGateEvidence(auditSummary), securityAudit.conclusion.nextAction),
    gate('owner_named_pilot', 'blocked', 'HQ records no owner-named Shop business, operator, measured baseline, or 20 consecutive accepted runs.', 'Name the business and operator privately, observe three manual runs, execute the five-day pilot, and retain aggregate evidence only outside the private workspace.'),
    gate('production_activation', 'blocked', 'The production target remains protected-unapproved and the app remains isolated_demo.', 'Require a separate owner activation approval only after every hosted proof and pilot acceptance gate passes.'),
  ]
  const blockingGateCount = gates.filter((entry) => entry.status === 'blocked').length

  const result = {
    contract: MANAGED_PILOT_READINESS_CONTRACT,
    pilotMode: 'owner_named',
    asOf: [String(database.recordedAt || ''), String(securityAudit.asOf || '')].sort().at(-1),
    sourceDigest: readinessDigest(sourceReceipts),
    overall: {
      status: blockingGateCount === 0 ? 'ready' : 'blocked',
      localDatabaseProofReady: gates.find((entry) => entry.id === 'local_database_rehearsal')?.status === 'ready-local',
      productionSourceParityReady: gates.find((entry) => entry.id === 'production_source_parity')?.status === 'ready-metadata',
      hostedActivationReady: blockingGateCount === 0,
      blockingGateCount,
      nextAction: {
        kind: 'owner_decision',
        decisionId: NEXT_ACTION_DECISION_ID,
        requires: [...NEXT_ACTION_REQUIREMENTS],
        targetEnvironment: 'preview_branch',
        operatorProductId: 'shop',
        maximumLifetimeHours: 24,
      },
    },
    founderDecision: {
      status: 'required',
      authority: 'proposal_only',
      createsAuthority: false,
      approvalReceipt: null,
      decision: 'Approve replacement of the failed rehearsal branch and prepare one owner-named Shop pilot.',
      failedBranch: {
        name: 'security-rehearsal-24h-20260812',
        projectRef: 'usmpllbckvrucbjptiuq',
        observedStatus: 'MIGRATIONS_FAILED',
        deletionApproved: false,
      },
      target: {
        provider: 'supabase',
        environment: 'preview_branch',
        production: false,
        startsWithProductionData: false,
        requiredServices: ['database', 'auth', 'storage'],
        maximumLifetimeHours: 24,
        deleteAfterEvidence: true,
        providerUsageChargesAcknowledged: false,
      },
      operator: {
        productId: 'shop',
        pilotMode: 'owner_named',
        namedBusinessRequired: true,
        namedOperatorRequired: true,
        measuredBaselineRequired: true,
        acceptanceEvidenceRequired: true,
        requiredConsecutiveAcceptedRuns: 20,
      },
      proposedActions: [...PROPOSED_ACTIONS],
      doesNotAuthorize: [...FORBIDDEN_ACTIONS],
    },
    securityAudit: auditSummary,
    gates,
    products,
    controls: {
      externalWritesPerformed: false,
      connectorRequestsPerformedToBuild: 0,
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
  if (!isRecord(value)
    || value.contract !== MANAGED_PILOT_READINESS_CONTRACT
    || value.pilotMode !== 'owner_named'
    || !Number.isFinite(Date.parse(value.asOf))) fail('managed_pilot_readiness_contract_invalid')
  if (!Array.isArray(value.sourceReceipts) || value.sourceReceipts.length !== REQUIRED_SOURCE_RECEIPT_COUNT) fail('managed_pilot_readiness_sources_invalid')
  if (!/^sha256:[0-9a-f]{64}$/.test(value.sourceDigest || '') || value.sourceDigest !== readinessDigest(value.sourceReceipts)) fail('managed_pilot_readiness_digest_invalid')
  if (!Array.isArray(value.gates)
    || value.gates.map((entry) => entry.id).join(',') !== GATE_IDS.join(',')
    || value.gates[0]?.status !== 'ready-local'
    || value.gates[1]?.status !== 'ready-metadata'
    || value.gates.slice(2).some((entry) => entry.status !== 'blocked')
    || value.gates.some((entry) => !String(entry?.evidence || '').trim() || !String(entry?.nextAction || '').trim())) fail('managed_pilot_readiness_gates_invalid')
  const derivedBlockingGateCount = value.gates.filter((entry) => entry.status === 'blocked').length
  if (value.overall?.status !== (derivedBlockingGateCount === 0 ? 'ready' : 'blocked')
    || value.overall?.localDatabaseProofReady !== true
    || value.overall?.productionSourceParityReady !== true
    || value.overall?.hostedActivationReady !== (derivedBlockingGateCount === 0)
    || value.overall?.blockingGateCount !== derivedBlockingGateCount) fail('managed_pilot_readiness_overall_invalid')

  const decision = value.founderDecision
  if (decision?.status !== 'required'
    || decision.authority !== 'proposal_only'
    || decision.createsAuthority !== false
    || decision.approvalReceipt !== null
    || decision.failedBranch?.name !== 'security-rehearsal-24h-20260812'
    || decision.failedBranch?.projectRef !== 'usmpllbckvrucbjptiuq'
    || decision.failedBranch?.observedStatus !== 'MIGRATIONS_FAILED'
    || decision.failedBranch?.deletionApproved !== false
    || decision.target?.provider !== 'supabase'
    || decision.target?.environment !== 'preview_branch'
    || decision.target?.production !== false
    || decision.target?.startsWithProductionData !== false
    || decision.target?.maximumLifetimeHours !== 24
    || decision.target?.deleteAfterEvidence !== true
    || decision.target?.providerUsageChargesAcknowledged !== false
    || decision.target?.requiredServices?.join(',') !== 'database,auth,storage'
    || decision.operator?.productId !== 'shop'
    || decision.operator?.pilotMode !== 'owner_named'
    || decision.operator?.namedBusinessRequired !== true
    || decision.operator?.namedOperatorRequired !== true
    || decision.operator?.measuredBaselineRequired !== true
    || decision.operator?.acceptanceEvidenceRequired !== true
    || decision.operator?.requiredConsecutiveAcceptedRuns !== 20
    || !exactStringArray(decision.proposedActions, PROPOSED_ACTIONS)
    || !exactStringArray(decision.doesNotAuthorize, FORBIDDEN_ACTIONS)
    || decision.proposedActions.some((action) => decision.doesNotAuthorize.includes(action))) fail('managed_pilot_readiness_founder_decision_invalid')
  const ask = value.overall?.nextAction
  if (!isRecord(ask)
    || ask.kind !== 'owner_decision'
    || ask.decisionId !== NEXT_ACTION_DECISION_ID
    || !exactStringArray(ask.requires, NEXT_ACTION_REQUIREMENTS)
    || ask.targetEnvironment !== decision.target.environment
    || ask.operatorProductId !== decision.operator.productId
    || ask.maximumLifetimeHours !== decision.target.maximumLifetimeHours
    || Object.keys(ask).length !== 6) fail('managed_pilot_readiness_next_action_invalid')

  const audit = value.securityAudit
  if (!isRecord(audit)
    || audit.contract !== SECURITY_AUDIT_CONTRACT
    || !Number.isFinite(Date.parse(audit.asOf))
    || audit.targetClassification !== 'protected-production'
    || audit.advisorStatus !== 'reviewed_fail_closed'
    || audit.findingCount !== 27
    || audit.liveSchemaVersion !== 10
    || audit.localTargetVersion !== 10
    || audit.versionDrift !== 0
    || audit.publicBrowserObjectAccessDenied !== true
    || audit.quarantineMigrationPresent !== true
    || audit.futureProviderOwnedDefaultGrantRisk !== true
    || audit.managedWritesEnabled !== false
    || audit.productionMutationAuthorized !== false
    || audit.databaseWrites !== 0) fail('managed_pilot_readiness_security_audit_invalid')
  if (value.gates[0].evidence !== LOCAL_GATE_EVIDENCE
    || value.gates.find((entry) => entry.id === 'production_source_parity')?.evidence !== sourceParityEvidence(audit)
    || value.gates.find((entry) => entry.id === 'managed_security')?.evidence !== securityGateEvidence(audit)) fail('managed_pilot_readiness_gate_evidence_invalid')
  if (!Array.isArray(value.products)
    || value.products.map((product) => product.productId).join(',') !== PRODUCT_IDS.join(',')
    || value.products.some((product) => product.managedPilotStatus !== 'blocked' || product.automationStatus !== 'owner-gated')) fail('managed_pilot_readiness_products_invalid')
  if (value.controls?.externalWritesPerformed !== false
    || value.controls?.connectorRequestsPerformedToBuild !== 0
    || value.controls?.modelCallsRequiredToBuild !== 0
    || value.controls?.productionWritesEnabled !== false
    || value.controls?.ownerApprovalRequired !== true) fail('managed_pilot_readiness_controls_invalid')
  const serialized = JSON.stringify(value).toLowerCase()
  if (serialized.includes('postgresql://') || serialized.includes('password=') || serialized.includes('sb_secret_')) fail('managed_pilot_readiness_sensitive_value')
  return value
}
