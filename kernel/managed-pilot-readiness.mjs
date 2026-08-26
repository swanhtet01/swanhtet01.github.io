import { createHash } from 'node:crypto'

export const MANAGED_PILOT_READINESS_CONTRACT = 'supermega.managed-pilot-readiness.v5'
export const SECURITY_AUDIT_CONTRACT = 'supermega.supabase-security-advisor-audit.v2'

const PRODUCT_IDS = ['shop', 'plant', 'website', 'ecommerce']
const GATE_IDS = [
  'preview_rehearsal',
  'managed_persistence',
  'storage_privacy',
  'security',
  'pilot_evidence',
  'production_activation',
]
const PILOT_MODE = 'owner_named'
const PROPOSED_ACTIONS = [
  'provision_dedicated_runtime_login',
  'validate_runtime_connection',
  'create_first_named_owner',
  'activate_one_shop_workspace',
  'stage_managed_vercel_environment',
  'deploy_exact_reviewed_release',
  'run_post_activation_tenant_isolation_proof',
]
const FORBIDDEN_ACTIONS = [
  'customer_message',
  'payment',
  'stock_move',
  'hosted_scheduler_activation',
  'additional_tenant_activation',
  'billing_activation',
  'autonomous_external_write',
]
const REQUIRED_QUARANTINE_CHECKS = [
  'publicBrowserQuarantineEnforced',
  'publicBrowserQuarantineIdempotent',
  'restoredPublicBrowserQuarantinePreserved',
]
const NEXT_ACTION_REQUIREMENTS = ['approve_runtime_role_provisioning', 'approve_first_named_owner_identity', 'approve_exact_production_release', 'approve_managed_activation_window']
const NEXT_ACTION_DECISION_ID = 'managed-production-activation'
const LOCAL_GATE_EVIDENCE = '56 checks, TLS, RLS, tenant isolation, active-session revocation, public browser quarantine, durable owner control, backup and restore.'
const REQUIRED_DATABASE_CHECK_COUNT = 56
const REQUIRED_SOURCE_RECEIPT_COUNT = 10
const REQUIRED_ACCEPTED_PILOT_RUNS = 20
const REQUIRED_PILOT_DAY_INDEXES = Object.freeze([1, 2, 3, 4, 5])
export const STORAGE_PRIVACY_PROOF_CONTRACT = 'supermega.hosted-storage-privacy-proof.v1'
export const MANAGED_PERSISTENCE_PROOF_CONTRACT = 'supermega.managed-persistence-proof.v1'
export const SELF_SERVE_PILOT_PROOF_CONTRACT = 'supermega.self-serve-pilot-proof.v1'
// The self-serve pilot gate is evidence-only. Once the six-proof hosted audit exists and the
// protected schema is v11, it is ready; opening production remains a separate owner-gated gate.
const SELF_SERVE_PILOT_BLOCKED_EVIDENCE = 'HQ records no completed self-serve pilot proof or measured baseline.'
const SELF_SERVE_PILOT_PROVEN_EVIDENCE = 'Self-serve tenant creation is proven six-for-six on a deleted isolated v11 branch through the session pooler under real RLS, and protected production now carries the reviewed v11 grants. Runtime-login provisioning, the first named owner, deployment, and the activation window remain under the separate production_activation decision.'
const SELF_SERVE_PILOT_BLOCKED_NEXT_ACTION = 'Open the self-serve activation window on the approved isolated target.'
const SELF_SERVE_PILOT_PROVEN_NEXT_ACTION = 'Keep the six-proof evidence current; execute runtime-login provisioning and the first named-owner activation only through the exact founder-approved production handoff.'

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

function securityGateReady(audit) {
  return audit.advisorStatus === 'clear' && audit.versionDrift === 0 && audit.metadataRlsEnabled === true
}

function hostedGateReady(audit) {
  return audit.liveSchemaVersion === 11 && audit.versionDrift === 0
}

function securityGateEvidence(audit) {
  if (securityGateReady(audit)) {
    return `Advisor is clear on protected managed schema v${audit.liveSchemaVersion} with metadata RLS enabled and zero drift from local target v${audit.localTargetVersion}.`
  }
  return `${audit.findingCount} fail-closed public-table advisor findings remain; browser object/default grants are not yet quarantined on hosted Supabase, and protected managed schema v${audit.liveSchemaVersion} trails local target v${audit.localTargetVersion}.`
}

function hostedGateEvidence(audit) {
  if (hostedGateReady(audit)) {
    return `Protected production is PostgreSQL 17 at managed schema v${audit.liveSchemaVersion} with zero drift from local target v${audit.localTargetVersion}.`
  }
  return `Protected production is PostgreSQL 17 at managed schema v${audit.liveSchemaVersion}; no owner-approved isolated hosted rehearsal exists.`
}

function selfServePilotGateEvidence(complete) {
  return complete ? SELF_SERVE_PILOT_PROVEN_EVIDENCE : SELF_SERVE_PILOT_BLOCKED_EVIDENCE
}

function selfServePilotGateNextAction(complete) {
  return complete ? SELF_SERVE_PILOT_PROVEN_NEXT_ACTION : SELF_SERVE_PILOT_BLOCKED_NEXT_ACTION
}

function previewRehearsalEvidence(complete) {
  return complete
    ? 'The exact reviewed candidate has a protected preview rehearsal bound to the source-controlled migration digests and rejects production refs, production data, unreviewed URLs, and privileged runtime credentials.'
    : 'No exact-candidate protected preview rehearsal receipt is present for this local branch; release handoff still requires a current HEAD and fresh preview proof.'
}

function pilotEvidence(complete, shopNextGate) {
  return complete
    ? `Owner-named Shop pilot has ${REQUIRED_ACCEPTED_PILOT_RUNS} consecutive accepted receipt-and-anchor-bound runs covering pilot days 1 through 5, with private identity retained outside public source.`
    : `Owner-named Shop pilot proof is absent. Required proof remains: ${shopNextGate}`
}

function securityGateEvidenceV5(audit, database) {
  if (securityGateReady(audit) && hostedGateReady(audit) && database.checks?.publicBrowserQuarantineEnforced === true) {
    return `Protected production is at managed schema v${audit.liveSchemaVersion}, zero drift from local target v${audit.localTargetVersion}, browser roles denied, public-browser quarantine recorded, and Security Advisor clear.`
  }
  return securityGateEvidence(audit)
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
  if (!isRecord(database) || database.schemaVersion !== 'supermega.hq.database-rehearsal.v2' || Object.keys(database.checks || {}).length !== REQUIRED_DATABASE_CHECK_COUNT || Object.values(database.checks || {}).some((value) => value !== true)) fail('managed_pilot_readiness_database_evidence_invalid')
  if (REQUIRED_QUARANTINE_CHECKS.some((name) => database.checks?.[name] !== true)) fail('managed_pilot_readiness_database_quarantine_invalid')
  if (database.storage?.hostedStoragePrivacyProofRequired !== true || database.localVerification?.externallyHosted !== false) fail('managed_pilot_readiness_database_scope_invalid')
  // Hosted storage-privacy proof intake (2026-08-15): when the six-request audit evidence exists
  // it must be internally complete -- passed audit, exactly six read-only requests, no secrets,
  // no mutations, and the disposable branch already deleted -- and the pilots doc must say so.
  // Without evidence the doc must still carry the blocked phrase; the gate computes from this.
  const storageProof = input.storagePrivacyEvidence ?? null
  if (storageProof !== null) {
    if (!isRecord(storageProof)
      || storageProof.contract !== STORAGE_PRIVACY_PROOF_CONTRACT
      || !String(storageProof.approvalId || '').trim()
      || storageProof.audit?.ok !== true
      || storageProof.audit?.provider_requests_performed !== 6
      || storageProof.audit?.secrets_exposed !== false
      || storageProof.audit?.persistent_mutations_performed !== 0
      || storageProof.branch?.deleteAfterEvidence !== true
      || !Number.isFinite(Date.parse(storageProof.branch?.deletedAt || ''))
      || !Number.isFinite(Date.parse(storageProof.recordedAt || ''))) fail('managed_pilot_readiness_storage_proof_invalid')
  }
  const storageProofComplete = storageProof !== null
  if (!storage.includes(storageProofComplete
    ? 'Status: hosted proof complete; six-request audit passed on a deleted isolated branch'
    : 'Status: local verifier ready; hosted proof blocked')) fail('managed_pilot_readiness_storage_evidence_invalid')
  // Hosted managed-persistence proof intake (2026-08-16): same two-state discipline as storage.
  // The seven-proof audit must be internally complete -- passed, exactly 4 sessions and 49
  // statements, no secrets, no tenant rows, writes confined to fixtures, branch deleted.
  const persistenceProof = input.managedPersistenceEvidence ?? null
  if (persistenceProof !== null) {
    if (!isRecord(persistenceProof)
      || persistenceProof.contract !== MANAGED_PERSISTENCE_PROOF_CONTRACT
      || !String(persistenceProof.approvalId || '').trim()
      || persistenceProof.audit?.ok !== true
      || persistenceProof.audit?.sessions_performed !== 4
      || persistenceProof.audit?.statements_performed !== 49
      || persistenceProof.audit?.secrets_exposed !== false
      || persistenceProof.audit?.tenant_rows_exposed !== false
      || persistenceProof.audit?.writes_confined_to_fixture_workspaces !== true
      || persistenceProof.branch?.deleteAfterEvidence !== true
      || !Number.isFinite(Date.parse(persistenceProof.branch?.deletedAt || ''))
      || !Number.isFinite(Date.parse(persistenceProof.recordedAt || ''))) fail('managed_pilot_readiness_persistence_proof_invalid')
  }
  const persistenceProofComplete = persistenceProof !== null
  // Hosted self-serve pilot proof intake (2026-08-16): same two-state discipline. The six-proof
  // audit must be internally complete -- passed, exactly 3 sessions / 23 statements / 4 store
  // calls, schema v11 observed, no secrets, no tenant rows, writes confined to fixtures, exactly
  // six proofs, the cross-actor collision surfaced as claim_code_conflict, and the branch deleted.
  // Completing it records the proof but does NOT flip the gate: v11 is not on production, so the
  // gate stays blocked on the founder production_activation decision.
  const selfServeProof = input.selfServePilotEvidence ?? null
  if (selfServeProof !== null) {
    const proofs = Array.isArray(selfServeProof.audit?.proofs) ? selfServeProof.audit.proofs : []
    const conflictProof = proofs.find((entry) => entry?.id === 'different_user_same_claim_rejected')
    const expectedProofIds = [
      'window_closed_refused',
      'claim_creates_isolated_tenant',
      'exact_idempotent_replay',
      'different_user_same_claim_rejected',
      'created_event_immutable',
      'cross_tenant_invisible',
    ]
    if (!isRecord(selfServeProof)
      || selfServeProof.contract !== SELF_SERVE_PILOT_PROOF_CONTRACT
      || !String(selfServeProof.approvalId || '').trim()
      || selfServeProof.audit?.ok !== true
      || selfServeProof.audit?.sessions_performed !== 3
      || selfServeProof.audit?.statements_performed !== 23
      || selfServeProof.audit?.store_calls_performed !== 4
      || selfServeProof.audit?.schema_version_observed !== 11
      || selfServeProof.audit?.secrets_exposed !== false
      || selfServeProof.audit?.tenant_rows_exposed !== false
      || selfServeProof.audit?.writes_confined_to_fixtures !== true
      || proofs.map((entry) => entry?.id).join(',') !== expectedProofIds.join(',')
      || conflictProof?.conflict_class !== 'claim_code_conflict'
      || selfServeProof.branch?.deleteAfterEvidence !== true
      || !Number.isFinite(Date.parse(selfServeProof.branch?.deletedAt || ''))
      || !Number.isFinite(Date.parse(selfServeProof.recordedAt || ''))) fail('managed_pilot_readiness_self_serve_proof_invalid')
  }
  const selfServePilotProofComplete = selfServeProof !== null
  if (!isRecord(packageManifest?.supermega) || packageManifest.supermega.productionSupabaseTargetStatus !== 'protected-unapproved') fail('managed_pilot_readiness_production_boundary_invalid')
  // v4: the audit is read as STATE, not pinned to the blocked snapshot. Schema version may sit
  // anywhere on the approved v7 -> v10 path, drift must be arithmetically consistent, and the
  // advisor may be 'blocked' (findings remain) or 'clear' (zero findings) -- the gates below
  // compute their status from these values instead of assuming them.
  if (!isRecord(securityAudit)
    || securityAudit.contract !== SECURITY_AUDIT_CONTRACT
    || securityAudit.targetClassification !== 'protected-production'
    || securityAudit.projectRef !== packageManifest.supermega.productionSupabaseProjectRef
    || securityAudit.postgres?.major !== 17
    || !['blocked', 'clear'].includes(securityAudit.advisor?.status)
    || !Number.isInteger(securityAudit.advisor?.findingCount)
    || (securityAudit.advisor.status === 'blocked' ? securityAudit.advisor.findingCount < 1 : securityAudit.advisor.findingCount !== 0)
    || !Number.isInteger(securityAudit.managedBackend?.liveSchemaVersion)
    || securityAudit.managedBackend.liveSchemaVersion < 7
    || securityAudit.managedBackend.liveSchemaVersion > 11
    || securityAudit.managedBackend?.localTargetVersion !== 11
    || securityAudit.managedBackend?.versionDrift !== securityAudit.managedBackend.localTargetVersion - securityAudit.managedBackend.liveSchemaVersion
    || securityAudit.managedBackend?.browserRolesDenied !== true
    || typeof securityAudit.managedBackend?.metadataRlsEnabled !== 'boolean'
    || !Number.isInteger(securityAudit.managedBackend?.storageBucketCount)
    || securityAudit.managedBackend.storageBucketCount < 0
    || securityAudit.catalog?.sequenceCount !== 2
    || securityAudit.catalog?.nonTableRelationCount !== 0
    || securityAudit.catalog?.publicRoutineCount !== 0
    || securityAudit.catalog?.browserCallableRoutineCount !== 0
    || securityAudit.conclusion?.indirectExposureAudited !== true
    || securityAudit.conclusion?.productionMutationAuthorized !== false
    || !String(securityAudit.conclusion?.nextAction || '').trim()
    || securityAudit.controls?.databaseWrites !== 0
    || !Number.isFinite(Date.parse(securityAudit.asOf))) fail('managed_pilot_readiness_security_audit_invalid')
  if (!Array.isArray(sourceReceipts) || sourceReceipts.length !== REQUIRED_SOURCE_RECEIPT_COUNT || sourceReceipts.some((receipt) => !/^[a-z0-9_./-]+$/i.test(receipt?.path || '') || !/^sha256:[0-9a-f]{64}$/.test(receipt?.digest || ''))) fail('managed_pilot_readiness_sources_invalid')

  const liveMode = field(now, 'Live operating mode')
  const managedPersistence = field(now, 'Live managed persistence ready')
  const securityReady = field(now, 'Live security ready')
  if (liveMode !== 'isolated_demo' || managedPersistence !== 'false' || securityReady !== 'false') fail('managed_pilot_readiness_live_boundary_invalid')
  if (!now.includes('no release drift is present') || !now.includes('No self-serve pilot tenant')) fail('managed_pilot_readiness_live_blockers_missing')

  const auditSummary = {
    contract: SECURITY_AUDIT_CONTRACT,
    asOf: securityAudit.asOf,
    targetClassification: 'protected-production',
    advisorStatus: securityAudit.advisor.status,
    findingCount: securityAudit.advisor.findingCount,
    liveSchemaVersion: securityAudit.managedBackend.liveSchemaVersion,
    localTargetVersion: securityAudit.managedBackend.localTargetVersion,
    versionDrift: securityAudit.managedBackend.versionDrift,
    browserRolesDenied: true,
    metadataRlsEnabled: securityAudit.managedBackend.metadataRlsEnabled,
    storageBucketCount: securityAudit.managedBackend.storageBucketCount,
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

  const previewRehearsalComplete = false
  const pilotEvidenceComplete = false
  const gates = [
    gate('preview_rehearsal', previewRehearsalComplete ? 'ready-preview' : 'blocked', previewRehearsalEvidence(previewRehearsalComplete), previewRehearsalComplete
      ? 'Keep preview proof bound to the reviewed SHA before release.'
      : 'Run a protected preview rehearsal for the exact candidate after owner-approved PR/review setup.'),
    gate('managed_persistence', persistenceProofComplete ? 'ready-hosted' : 'blocked', persistenceProofComplete
      ? 'Seven-proof hosted audit passed: durable writes with read-back, exact idempotent retry, version-conflict rejection, event immutability, cross-tenant denial, recovery round-trip, and induced atomic rollback, on a deleted isolated branch.'
      : 'Live managed persistence ready is false.', persistenceProofComplete
      ? 'Keep the persistence evidence and instrument current.'
      : 'Prove durable commands, recovery, and tenant isolation on the isolated target.'),
    gate('storage_privacy', storageProofComplete ? 'ready-hosted' : 'blocked', storageProofComplete
      ? 'Six-request hosted audit passed: anonymous and cross-tenant access denied with canary confirmation, owner and signed access working, zero mutations, branch deleted after evidence.'
      : 'The six-request verifier is ready, but hosted proof is absent.', storageProofComplete
      ? 'Keep the storage-privacy evidence and instrument current.'
      : 'Run the verifier against an owner-approved isolated private bucket.'),
    gate('security', (securityGateReady(auditSummary) && hostedGateReady(auditSummary)) ? 'ready-hosted' : 'blocked', securityGateEvidenceV5(auditSummary, database), securityAudit.conclusion.nextAction),
    gate('pilot_evidence', pilotEvidenceComplete ? 'ready-pilot' : 'blocked', pilotEvidence(pilotEvidenceComplete, products[0].requiredProof), pilotEvidenceComplete
      ? 'Prepare the exact activation decision packet without exposing private identity.'
      : 'Complete the private owner-named Shop pilot sequence and retain identity only in the private workspace.'),
    gate('production_activation', 'blocked', 'The production Supabase target remains protected-unapproved.', 'Keep writes disabled until separate founder approval after every hosted gate passes.'),
  ]
  const blockingGateIds = gates.filter((entry) => entry.status === 'blocked').map((entry) => entry.id)
  const hostedActivationReady = blockingGateIds.length === 0

  const result = {
    contract: MANAGED_PILOT_READINESS_CONTRACT,
    asOf: [String(database.recordedAt || ''), String(securityAudit.asOf || '')].sort().at(-1),
    pilotMode: PILOT_MODE,
    sourceDigest: readinessDigest(sourceReceipts),
    overall: {
      status: hostedActivationReady ? 'ready' : 'blocked',
      localDatabaseProofReady: true,
      hostedActivationReady,
      blockingGateCount: blockingGateIds.length,
      blockingGateIds,
      nextAction: {
        kind: 'founder_decision',
        decisionId: NEXT_ACTION_DECISION_ID,
        requires: [...NEXT_ACTION_REQUIREMENTS],
        targetEnvironment: 'production',
        operatorProductId: 'shop',
        maximumLifetimeHours: null,
      },
    },
    founderDecision: {
      status: 'required',
      authority: 'proposal_only',
      createsAuthority: false,
      approvalReceipt: null,
      decision: 'Approve one exact managed production activation.',
      target: {
        provider: 'supabase',
        environment: 'production',
        production: true,
        startsWithProductionData: false,
        requiredServices: ['database', 'auth', 'storage'],
        maximumLifetimeHours: null,
        deleteAfterEvidence: false,
        providerUsageChargesAcknowledged: false,
      },
      operator: {
        productId: 'shop',
        selfServeAllowed: true,
        verifiedEmailRequired: true,
        termsAcceptanceRequired: true,
        tenantIsolationProofRequired: true,
        measuredBaselineRequired: true,
        acceptanceEvidenceRequired: true,
      },
      proposedActions: [...PROPOSED_ACTIONS],
      doesNotAuthorize: [...FORBIDDEN_ACTIONS],
    },
    securityAudit: auditSummary,
    liveProduction: {
      operatingMode: 'isolated_demo',
      schemaVersion: auditSummary.liveSchemaVersion,
      localTargetVersion: auditSummary.localTargetVersion,
      versionDrift: auditSummary.versionDrift,
      browserRolesDenied: auditSummary.browserRolesDenied,
      publicBrowserQuarantine: database.checks.publicBrowserQuarantineEnforced === true,
      managedWritesEnabled: false,
      productionMutationAuthorized: false,
    },
    previewRehearsal: {
      proofComplete: previewRehearsalComplete,
      exactCandidateRequired: true,
      productionRefsRejected: true,
      productionDataRejected: true,
      privilegedRuntimeCredentialsRejected: true,
    },
    storagePrivacy: {
      proofComplete: storageProofComplete,
      contract: storageProofComplete ? STORAGE_PRIVACY_PROOF_CONTRACT : null,
      approvalId: storageProofComplete ? storageProof.approvalId : null,
      recordedAt: storageProofComplete ? storageProof.recordedAt : null,
      branchDeletedAt: storageProofComplete ? storageProof.branch.deletedAt : null,
    },
    managedPersistence: {
      proofComplete: persistenceProofComplete,
      contract: persistenceProofComplete ? MANAGED_PERSISTENCE_PROOF_CONTRACT : null,
      approvalId: persistenceProofComplete ? persistenceProof.approvalId : null,
      recordedAt: persistenceProofComplete ? persistenceProof.recordedAt : null,
      branchDeletedAt: persistenceProofComplete ? persistenceProof.branch.deletedAt : null,
    },
    selfServePilot: {
      proofComplete: selfServePilotProofComplete,
      contract: selfServePilotProofComplete ? SELF_SERVE_PILOT_PROOF_CONTRACT : null,
      approvalId: selfServePilotProofComplete ? selfServeProof.approvalId : null,
      recordedAt: selfServePilotProofComplete ? selfServeProof.recordedAt : null,
      branchDeletedAt: selfServePilotProofComplete ? selfServeProof.branch.deletedAt : null,
      schemaVersionProven: selfServePilotProofComplete ? 11 : null,
      liveActivationBlockedOn: 'production_activation',
    },
    pilotEvidence: {
      pilotMode: PILOT_MODE,
      productId: 'shop',
      proofComplete: pilotEvidenceComplete,
      requiredAcceptedConsecutiveRuns: REQUIRED_ACCEPTED_PILOT_RUNS,
      acceptedConsecutiveRuns: 0,
      requiredPilotDayIndexes: REQUIRED_PILOT_DAY_INDEXES,
      acceptedConsecutivePilotDayIndexes: [],
      pilotSequenceCoverageMet: false,
      syntheticEvidenceAccepted: false,
      publicIdentityAllowed: false,
      privateWorkspaceRequired: true,
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
  if (value.pilotMode !== PILOT_MODE) fail('managed_pilot_readiness_pilot_mode_invalid')
  if (!Array.isArray(value.sourceReceipts) || value.sourceReceipts.length !== REQUIRED_SOURCE_RECEIPT_COUNT) fail('managed_pilot_readiness_sources_invalid')
  if (!/^sha256:[0-9a-f]{64}$/.test(value.sourceDigest || '') || value.sourceDigest !== readinessDigest(value.sourceReceipts)) fail('managed_pilot_readiness_digest_invalid')
  if (!Array.isArray(value.overall?.blockingGateIds)
    || value.overall.status !== (value.overall.blockingGateIds.length === 0 ? 'ready' : 'blocked')
    || value.overall.hostedActivationReady !== (value.overall.blockingGateIds.length === 0)
    || value.overall.localDatabaseProofReady !== true
    || value.overall.blockingGateCount !== value.overall.blockingGateIds.length
    || value.overall.blockingGateCount < 1) fail('managed_pilot_readiness_overall_invalid')
  const decision = value.founderDecision
  if (decision?.status !== 'required'
    || decision.authority !== 'proposal_only'
    || decision.createsAuthority !== false
    || decision.approvalReceipt !== null
    || decision.target?.provider !== 'supabase'
    || decision.target?.environment !== 'production'
    || decision.target?.production !== true
    || decision.target?.startsWithProductionData !== false
    || decision.target?.maximumLifetimeHours !== null
    || decision.target?.deleteAfterEvidence !== false
    || decision.target?.providerUsageChargesAcknowledged !== false
    || decision.target?.requiredServices?.join(',') !== 'database,auth,storage'
    || decision.operator?.productId !== 'shop'
    || decision.operator?.selfServeAllowed !== true
    || decision.operator?.verifiedEmailRequired !== true
    || decision.operator?.termsAcceptanceRequired !== true
    || decision.operator?.tenantIsolationProofRequired !== true
    || decision.operator?.measuredBaselineRequired !== true
    || decision.operator?.acceptanceEvidenceRequired !== true
    || !exactStringArray(decision.proposedActions, PROPOSED_ACTIONS)
    || !exactStringArray(decision.doesNotAuthorize, FORBIDDEN_ACTIONS)
    || decision.proposedActions.some((action) => decision.doesNotAuthorize.includes(action))) fail('managed_pilot_readiness_founder_decision_invalid')
  const ask = value.overall?.nextAction
  if (!isRecord(ask)
    || ask.kind !== 'founder_decision'
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
    || !['blocked', 'clear'].includes(audit.advisorStatus)
    || !Number.isInteger(audit.findingCount)
    || (audit.advisorStatus === 'blocked' ? audit.findingCount < 1 : audit.findingCount !== 0)
    || !Number.isInteger(audit.liveSchemaVersion)
    || audit.liveSchemaVersion < 7
    || audit.liveSchemaVersion > 11
    || audit.localTargetVersion !== 11
    || audit.versionDrift !== audit.localTargetVersion - audit.liveSchemaVersion
    || audit.browserRolesDenied !== true
    || typeof audit.metadataRlsEnabled !== 'boolean'
    || !Number.isInteger(audit.storageBucketCount)
    || audit.storageBucketCount < 0
    || audit.productionMutationAuthorized !== false
    || audit.databaseWrites !== 0) fail('managed_pilot_readiness_security_audit_invalid')
  const liveProduction = value.liveProduction
  if (!isRecord(liveProduction)
    || liveProduction.operatingMode !== 'isolated_demo'
    || liveProduction.schemaVersion !== audit.liveSchemaVersion
    || liveProduction.localTargetVersion !== audit.localTargetVersion
    || liveProduction.versionDrift !== audit.versionDrift
    || liveProduction.browserRolesDenied !== true
    || liveProduction.publicBrowserQuarantine !== true
    || liveProduction.managedWritesEnabled !== false
    || liveProduction.productionMutationAuthorized !== false) fail('managed_pilot_readiness_live_production_invalid')
  const previewRehearsal = value.previewRehearsal
  if (!isRecord(previewRehearsal)
    || previewRehearsal.proofComplete !== false
    || previewRehearsal.exactCandidateRequired !== true
    || previewRehearsal.productionRefsRejected !== true
    || previewRehearsal.productionDataRejected !== true
    || previewRehearsal.privilegedRuntimeCredentialsRejected !== true) fail('managed_pilot_readiness_preview_rehearsal_invalid')
  // Only evidence-backed hosted gates may leave 'blocked', and only for their computed reason;
  // the stored blocking count must equal the count derived from the gates themselves.
  const storagePrivacy = value.storagePrivacy
  if (!isRecord(storagePrivacy)
    || typeof storagePrivacy.proofComplete !== 'boolean'
    || (storagePrivacy.proofComplete
      ? (storagePrivacy.contract !== STORAGE_PRIVACY_PROOF_CONTRACT
        || !String(storagePrivacy.approvalId || '').trim()
        || !Number.isFinite(Date.parse(storagePrivacy.recordedAt || ''))
        || !Number.isFinite(Date.parse(storagePrivacy.branchDeletedAt || '')))
      : (storagePrivacy.contract !== null
        || storagePrivacy.approvalId !== null
        || storagePrivacy.recordedAt !== null
        || storagePrivacy.branchDeletedAt !== null))) fail('managed_pilot_readiness_storage_privacy_invalid')
  const managedPersistence = value.managedPersistence
  if (!isRecord(managedPersistence)
    || typeof managedPersistence.proofComplete !== 'boolean'
    || (managedPersistence.proofComplete
      ? (managedPersistence.contract !== MANAGED_PERSISTENCE_PROOF_CONTRACT
        || !String(managedPersistence.approvalId || '').trim()
        || !Number.isFinite(Date.parse(managedPersistence.recordedAt || ''))
        || !Number.isFinite(Date.parse(managedPersistence.branchDeletedAt || '')))
      : (managedPersistence.contract !== null
        || managedPersistence.approvalId !== null
        || managedPersistence.recordedAt !== null
        || managedPersistence.branchDeletedAt !== null))) fail('managed_pilot_readiness_persistence_invalid')
  const selfServePilot = value.selfServePilot
  if (!isRecord(selfServePilot)
    || typeof selfServePilot.proofComplete !== 'boolean'
    || selfServePilot.liveActivationBlockedOn !== 'production_activation'
    || (selfServePilot.proofComplete
      ? (selfServePilot.contract !== SELF_SERVE_PILOT_PROOF_CONTRACT
        || !String(selfServePilot.approvalId || '').trim()
        || !Number.isFinite(Date.parse(selfServePilot.recordedAt || ''))
        || !Number.isFinite(Date.parse(selfServePilot.branchDeletedAt || ''))
        || selfServePilot.schemaVersionProven !== 11)
      : (selfServePilot.contract !== null
        || selfServePilot.approvalId !== null
        || selfServePilot.recordedAt !== null
        || selfServePilot.branchDeletedAt !== null
        || selfServePilot.schemaVersionProven !== null))) fail('managed_pilot_readiness_self_serve_invalid')
  const pilot = value.pilotEvidence
  if (!isRecord(pilot)
    || pilot.pilotMode !== PILOT_MODE
    || pilot.productId !== 'shop'
    || pilot.proofComplete !== false
    || pilot.requiredAcceptedConsecutiveRuns !== REQUIRED_ACCEPTED_PILOT_RUNS
    || pilot.acceptedConsecutiveRuns !== 0
    || JSON.stringify(pilot.requiredPilotDayIndexes) !== JSON.stringify(REQUIRED_PILOT_DAY_INDEXES)
    || !Array.isArray(pilot.acceptedConsecutivePilotDayIndexes)
    || pilot.acceptedConsecutivePilotDayIndexes.length !== 0
    || pilot.pilotSequenceCoverageMet !== false
    || pilot.syntheticEvidenceAccepted !== false
    || pilot.publicIdentityAllowed !== false
    || pilot.privateWorkspaceRequired !== true) fail('managed_pilot_readiness_pilot_evidence_invalid')
  if (!Array.isArray(value.gates)
    || value.gates.map((entry) => entry.id).join(',') !== GATE_IDS.join(',')
    || value.gates.some((entry) => !['blocked', 'ready-preview', 'ready-hosted', 'ready-pilot'].includes(entry.status))
    || value.gates.find((entry) => entry.id === 'preview_rehearsal')?.status !== (previewRehearsal.proofComplete ? 'ready-preview' : 'blocked')
    || value.gates.find((entry) => entry.id === 'managed_persistence')?.status !== (managedPersistence.proofComplete ? 'ready-hosted' : 'blocked')
    || value.gates.find((entry) => entry.id === 'storage_privacy')?.status !== (storagePrivacy.proofComplete ? 'ready-hosted' : 'blocked')
    || value.gates.find((entry) => entry.id === 'security')?.status !== ((securityGateReady(audit) && hostedGateReady(audit)) ? 'ready-hosted' : 'blocked')
    || value.gates.find((entry) => entry.id === 'pilot_evidence')?.status !== (pilot.proofComplete ? 'ready-pilot' : 'blocked')
    || value.gates.find((entry) => entry.id === 'production_activation')?.status !== 'blocked'
    || value.overall.blockingGateCount !== value.gates.filter((entry) => entry.status === 'blocked').length
    || value.overall.blockingGateIds.join(',') !== value.gates.filter((entry) => entry.status === 'blocked').map((entry) => entry.id).join(',')
    || value.gates.some((entry) => !String(entry?.evidence || '').trim() || !String(entry?.nextAction || '').trim())) fail('managed_pilot_readiness_gates_invalid')
  if (value.gates.find((entry) => entry.id === 'preview_rehearsal')?.evidence !== previewRehearsalEvidence(previewRehearsal.proofComplete)
    || value.gates.find((entry) => entry.id === 'security')?.evidence !== securityGateEvidenceV5(audit, { checks: { publicBrowserQuarantineEnforced: liveProduction.publicBrowserQuarantine } })
    || value.gates.find((entry) => entry.id === 'pilot_evidence')?.evidence !== pilotEvidence(pilot.proofComplete, value.products?.[0]?.requiredProof)) fail('managed_pilot_readiness_gate_evidence_invalid')
  if (!Array.isArray(value.products) || value.products.map((product) => product.productId).join(',') !== PRODUCT_IDS.join(',') || value.products.some((product) => product.managedPilotStatus !== 'blocked' || product.automationStatus !== 'owner-gated')) fail('managed_pilot_readiness_products_invalid')
  if (value.controls?.externalWritesPerformed !== false || value.controls?.connectorRequestsPerformed !== 0 || value.controls?.modelCallsRequiredToBuild !== 0 || value.controls?.productionWritesEnabled !== false || value.controls?.ownerApprovalRequired !== true) fail('managed_pilot_readiness_controls_invalid')
  const serialized = JSON.stringify(value).toLowerCase()
  if (serialized.includes('postgresql://') || serialized.includes('password=') || serialized.includes('service_role')) fail('managed_pilot_readiness_sensitive_value')
  return value
}
