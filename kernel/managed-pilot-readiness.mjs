import { createHash } from 'node:crypto'

export const MANAGED_PILOT_READINESS_CONTRACT = 'supermega.managed-pilot-readiness.v3'
export const MANAGED_PILOT_DECISION_PREVIEW_CONTRACT = 'supermega.managed-pilot-decision-preview.v1'
export const SECURITY_AUDIT_CONTRACT = 'supermega.supabase-security-advisor-audit.v1'

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
const PROPOSED_ACTIONS = [
  'create_one_preview_branch',
  'apply_reviewed_migrations_to_preview',
  'create_one_named_preview_operator',
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
const NEXT_ACTION_REQUIREMENTS = ['approve_preview_branch_target', 'name_shop_pilot_operator']
const NEXT_ACTION_DECISION_ID = 'bounded-managed-pilot-rehearsal'
const LOCAL_GATE_EVIDENCE = '56 checks, TLS, RLS, tenant isolation, active-session revocation, public browser quarantine, durable owner control, backup and restore.'
const REQUIRED_DATABASE_CHECK_COUNT = 56
const REQUIRED_SOURCE_RECEIPT_COUNT = 7
const DECISION_PREVIEW_COMMAND = 'npm run readiness:managed:decision'
const DECISION_PREVIEW_RECOMMENDATION = 'The current readiness contract already targets Shop for the first bounded rehearsal; this is evidence context, not an owner decision.'
const PRODUCT_OWNER_INPUTS = Object.freeze({
  shop: ['named_business', 'named_operator', 'isolated_managed_tenant_approval', 'baseline_window', 'five_day_evidence_plan'],
  plant: ['named_business', 'named_operator', 'named_supervisor', 'isolated_managed_tenant_approval', 'work_centre_downtime_source', 'correction_effort_measure'],
  website: ['named_business', 'business_brief', 'owner_reviewer', 'responsive_acceptance_criteria', 'managed_artifact_retention_target'],
  ecommerce: ['named_business', 'named_operator', 'isolated_managed_tenant_approval', 'checkout_acknowledgement_baseline', 'delivery_correction_scenario', 'shop_replacement_reviewer'],
})

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

export function managedPilotDecisionPreviewDigest(value) {
  if (!isRecord(value)) fail('managed_pilot_decision_preview_invalid')
  const unsigned = { ...value }
  delete unsigned.previewDigest
  return readinessDigest(unsigned)
}

export function buildManagedPilotDecisionPreview(readiness, requestedProductId = null) {
  const ledger = validateManagedPilotReadiness(readiness)
  if (requestedProductId !== null
    && (typeof requestedProductId !== 'string' || !PRODUCT_IDS.includes(requestedProductId))) {
    fail('managed_pilot_decision_preview_product_invalid')
  }
  const options = ledger.products.map((product) => ({
    productId: product.productId,
    workOrderId: product.workOrderId,
    localStatus: product.localStatus,
    managedPilotStatus: product.managedPilotStatus,
    proposedWork: product.proposedWork,
    blockingReason: product.blockingReason,
    requiredProof: product.requiredProof,
    ownerInputsRequired: [...PRODUCT_OWNER_INPUTS[product.productId]],
  }))
  const focusedOption = requestedProductId === null
    ? null
    : options.find((option) => option.productId === requestedProductId)
  const result = {
    contract: MANAGED_PILOT_DECISION_PREVIEW_CONTRACT,
    status: 'owner_decision_required',
    generatedFrom: {
      readinessContract: ledger.contract,
      readinessAsOf: ledger.asOf,
      readinessSourceDigest: ledger.sourceDigest,
      readinessLedgerDigest: readinessDigest(ledger),
    },
    recommendation: {
      productId: ledger.founderDecision.operator.productId,
      authority: 'evidence_context_only',
      reason: DECISION_PREVIEW_RECOMMENDATION,
    },
    decision: {
      requestedProductId,
      status: focusedOption ? 'proposal_previewed' : 'not_selected',
      decisionRecorded: false,
      authority: 'proposal_only',
      createsAuthority: false,
      approvalReceipt: null,
      selectedWorkOrderId: focusedOption?.workOrderId || null,
    },
    options,
    focusedOption: focusedOption || null,
    rules: {
      chooseAtMostOne: true,
      zeroSelectionsAllowed: true,
      defaultSelection: null,
      noDecisionLeavesAllExternalGatesClosed: true,
      proposalExpiresOnReadinessDigestChange: true,
      doesNotAuthorize: [...FORBIDDEN_ACTIONS],
    },
    nextAction: {
      kind: focusedOption ? 'owner_inputs' : 'owner_choice',
      action: focusedOption
        ? 'provide_required_inputs_for_owner_review'
        : 'choose_at_most_one_product_or_leave_all_closed',
      safeCommand: focusedOption ? null : DECISION_PREVIEW_COMMAND,
      acceptedProductIds: [...PRODUCT_IDS],
      requiredOwnerInputs: focusedOption ? [...focusedOption.ownerInputsRequired] : [],
    },
    controls: {
      localReadsPerformed: true,
      localWritesPerformed: false,
      externalWritesPerformed: false,
      connectorRequestsPerformed: 0,
      providerRequestsPerformed: 0,
      modelCallsPerformed: 0,
      activationPerformed: false,
      decisionRecorded: false,
    },
  }
  result.previewDigest = managedPilotDecisionPreviewDigest(result)
  return validateManagedPilotDecisionPreview(result)
}

export function validateManagedPilotDecisionPreview(value) {
  const rootKeys = [
    'contract', 'status', 'generatedFrom', 'recommendation', 'decision', 'options',
    'focusedOption', 'rules', 'nextAction', 'controls', 'previewDigest',
  ]
  if (!exactObjectKeys(value, rootKeys)
    || value.contract !== MANAGED_PILOT_DECISION_PREVIEW_CONTRACT
    || value.status !== 'owner_decision_required'
    || !/^sha256:[0-9a-f]{64}$/.test(value.previewDigest || '')
    || value.previewDigest !== managedPilotDecisionPreviewDigest(value)) {
    fail('managed_pilot_decision_preview_invalid')
  }
  const source = value.generatedFrom
  if (!exactObjectKeys(source, ['readinessContract', 'readinessAsOf', 'readinessSourceDigest', 'readinessLedgerDigest'])
    || source.readinessContract !== MANAGED_PILOT_READINESS_CONTRACT
    || !Number.isFinite(Date.parse(source.readinessAsOf))
    || !/^sha256:[0-9a-f]{64}$/.test(source.readinessSourceDigest || '')
    || !/^sha256:[0-9a-f]{64}$/.test(source.readinessLedgerDigest || '')) {
    fail('managed_pilot_decision_preview_source_invalid')
  }
  const recommendation = value.recommendation
  if (!exactObjectKeys(recommendation, ['productId', 'authority', 'reason'])
    || recommendation.productId !== 'shop'
    || recommendation.authority !== 'evidence_context_only'
    || recommendation.reason !== DECISION_PREVIEW_RECOMMENDATION) {
    fail('managed_pilot_decision_preview_recommendation_invalid')
  }
  if (!Array.isArray(value.options)
    || value.options.map((option) => option.productId).join(',') !== PRODUCT_IDS.join(',')) {
    fail('managed_pilot_decision_preview_options_invalid')
  }
  for (const option of value.options) {
    if (!exactObjectKeys(option, [
      'productId', 'workOrderId', 'localStatus', 'managedPilotStatus', 'proposedWork',
      'blockingReason', 'requiredProof', 'ownerInputsRequired',
    ])
      || option.localStatus !== 'release-candidate-local'
      || option.managedPilotStatus !== 'blocked'
      || !String(option.workOrderId || '').startsWith(`${option.productId}-`)
      || !String(option.proposedWork || '').trim()
      || !String(option.blockingReason || '').trim()
      || !String(option.requiredProof || '').trim()
      || !exactStringArray(option.ownerInputsRequired, PRODUCT_OWNER_INPUTS[option.productId])) {
      fail('managed_pilot_decision_preview_options_invalid')
    }
  }
  const decision = value.decision
  const selected = decision?.requestedProductId === null
    ? null
    : value.options.find((option) => option.productId === decision?.requestedProductId)
  if (!exactObjectKeys(decision, [
    'requestedProductId', 'status', 'decisionRecorded', 'authority', 'createsAuthority',
    'approvalReceipt', 'selectedWorkOrderId',
  ])
    || (decision.requestedProductId !== null && !selected)
    || decision.status !== (selected ? 'proposal_previewed' : 'not_selected')
    || decision.decisionRecorded !== false
    || decision.authority !== 'proposal_only'
    || decision.createsAuthority !== false
    || decision.approvalReceipt !== null
    || decision.selectedWorkOrderId !== (selected?.workOrderId || null)
    || stableStringify(value.focusedOption) !== stableStringify(selected)) {
    fail('managed_pilot_decision_preview_decision_invalid')
  }
  const rules = value.rules
  if (!exactObjectKeys(rules, [
    'chooseAtMostOne', 'zeroSelectionsAllowed', 'defaultSelection',
    'noDecisionLeavesAllExternalGatesClosed', 'proposalExpiresOnReadinessDigestChange',
    'doesNotAuthorize',
  ])
    || rules.chooseAtMostOne !== true
    || rules.zeroSelectionsAllowed !== true
    || rules.defaultSelection !== null
    || rules.noDecisionLeavesAllExternalGatesClosed !== true
    || rules.proposalExpiresOnReadinessDigestChange !== true
    || !exactStringArray(rules.doesNotAuthorize, FORBIDDEN_ACTIONS)) {
    fail('managed_pilot_decision_preview_rules_invalid')
  }
  const next = value.nextAction
  if (!exactObjectKeys(next, ['kind', 'action', 'safeCommand', 'acceptedProductIds', 'requiredOwnerInputs'])
    || next.kind !== (selected ? 'owner_inputs' : 'owner_choice')
    || next.action !== (selected ? 'provide_required_inputs_for_owner_review' : 'choose_at_most_one_product_or_leave_all_closed')
    || next.safeCommand !== (selected ? null : DECISION_PREVIEW_COMMAND)
    || !exactStringArray(next.acceptedProductIds, PRODUCT_IDS)
    || !exactStringArray(next.requiredOwnerInputs, selected?.ownerInputsRequired || [])) {
    fail('managed_pilot_decision_preview_next_action_invalid')
  }
  const controls = value.controls
  if (!exactObjectKeys(controls, [
    'localReadsPerformed', 'localWritesPerformed', 'externalWritesPerformed',
    'connectorRequestsPerformed', 'providerRequestsPerformed', 'modelCallsPerformed',
    'activationPerformed', 'decisionRecorded',
  ])
    || controls.localReadsPerformed !== true
    || controls.localWritesPerformed !== false
    || controls.externalWritesPerformed !== false
    || controls.connectorRequestsPerformed !== 0
    || controls.providerRequestsPerformed !== 0
    || controls.modelCallsPerformed !== 0
    || controls.activationPerformed !== false
    || controls.decisionRecorded !== false) {
    fail('managed_pilot_decision_preview_controls_invalid')
  }
  const serialized = JSON.stringify(value).toLowerCase()
  if (serialized.includes('sourcereceipts')
    || serialized.includes('hq/')
    || serialized.includes('kernel/')
    || serialized.includes('postgresql://')
    || serialized.includes('password=')
    || serialized.includes('service_role')) {
    fail('managed_pilot_decision_preview_sensitive_value')
  }
  return value
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

function exactObjectKeys(value, expected) {
  return isRecord(value)
    && Object.keys(value).sort().join(',') === [...expected].sort().join(',')
}

function securityGateEvidence(audit) {
  if (audit.previewRehearsal?.status === 'migration_failed') {
    return `Protected production remains fail-closed. The failed isolated preview has ${audit.previewRehearsal.publicTableCount} public tables without RLS, no managed private schema, and no browser/default-grant quarantine.`
  }
  return `${audit.findingCount} fail-closed public-table advisor findings remain; browser object/default grants are not yet quarantined on hosted Supabase, and protected managed schema v${audit.liveSchemaVersion} trails local target v${audit.localTargetVersion}.`
}

function hostedGateEvidence(audit) {
  if (audit.previewRehearsal?.status === 'migration_failed') {
    return `Protected production is PostgreSQL 17 at managed schema v${audit.liveSchemaVersion}. The isolated preview is MIGRATIONS_FAILED after its public baseline; quarantine lacked default-privilege authority and the managed private schema is absent.`
  }
  return `Protected production is PostgreSQL 17 at managed schema v${audit.liveSchemaVersion}; no owner-approved isolated hosted rehearsal exists.`
}

function previewRehearsalFromHq(now) {
  const publicTableCount = Number(/(\d+) (?:copied )?(?:public )?tables?(?: still)? (?:have RLS disabled|has RLS disabled|lack RLS)/i.exec(now)?.[1])
  const failed = now.includes('Preview is `MIGRATIONS_FAILED`')
    && now.includes('permission denied to change default privileges')
    && Number.isInteger(publicTableCount)
    && publicTableCount > 0
  if (!failed) return { status: 'not_proven', publicTableCount: null }
  return { status: 'migration_failed', publicTableCount }
}

function hostedGateNextAction(audit) {
  if (audit.previewRehearsal?.status === 'migration_failed') {
    return 'Keep the failed preview disconnected from Vercel and Auth invites. After PR #412 integration, repair or replace it through the direct-admin rehearsal, then apply v8 through v10 plus quarantine and rerun every hosted proof.'
  }
  return 'Apply v8 through v10 plus the digest-bound public browser quarantine on an approved isolated Supabase target, then rerun the hosted validator and session-revocation proof.'
}

function securityGateNextAction(audit, fallback) {
  if (audit.previewRehearsal?.status === 'migration_failed') {
    return 'Use PR #412 only through a direct-admin preview connection; prove relation and default grants, RLS, role boundaries, session revocation, Storage privacy, backup, and restore before any invite.'
  }
  return fallback
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
  if (!storage.includes('Status: local verifier ready; hosted proof blocked')) fail('managed_pilot_readiness_storage_evidence_invalid')
  if (!isRecord(packageManifest?.supermega) || packageManifest.supermega.productionSupabaseTargetStatus !== 'protected-unapproved') fail('managed_pilot_readiness_production_boundary_invalid')
  if (!isRecord(securityAudit)
    || securityAudit.contract !== SECURITY_AUDIT_CONTRACT
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
    || !String(securityAudit.conclusion?.nextAction || '').trim()
    || securityAudit.controls?.databaseWrites !== 0
    || !Number.isFinite(Date.parse(securityAudit.asOf))) fail('managed_pilot_readiness_security_audit_invalid')
  if (!Array.isArray(sourceReceipts) || sourceReceipts.length !== REQUIRED_SOURCE_RECEIPT_COUNT || sourceReceipts.some((receipt) => !/^[a-z0-9_./-]+$/i.test(receipt?.path || '') || !/^sha256:[0-9a-f]{64}$/.test(receipt?.digest || ''))) fail('managed_pilot_readiness_sources_invalid')

  const liveMode = field(now, 'Live operating mode')
  const managedPersistence = field(now, 'Live managed persistence ready')
  const securityReady = field(now, 'Live security ready')
  const liveObservedAt = /^Live state observed:\s*`([^`]+)`$/m.exec(now)?.[1] || ''
  if (liveMode !== 'isolated_demo' || managedPersistence !== 'false' || securityReady !== 'false') fail('managed_pilot_readiness_live_boundary_invalid')
  if (liveObservedAt && !Number.isFinite(Date.parse(liveObservedAt))) fail('managed_pilot_readiness_live_observed_at_invalid')
  if (!now.includes('no release drift is present') || !now.includes('No named pilot customer')) fail('managed_pilot_readiness_live_blockers_missing')

  const auditSummary = {
    contract: SECURITY_AUDIT_CONTRACT,
    asOf: securityAudit.asOf,
    targetClassification: 'protected-production',
    advisorStatus: 'blocked',
    findingCount: securityAudit.advisor.findingCount,
    liveSchemaVersion: securityAudit.managedBackend.liveSchemaVersion,
    localTargetVersion: securityAudit.managedBackend.localTargetVersion,
    versionDrift: securityAudit.managedBackend.versionDrift,
    browserRolesDenied: true,
    metadataRlsEnabled: false,
    storageBucketCount: 0,
    productionMutationAuthorized: false,
    databaseWrites: 0,
    previewRehearsal: previewRehearsalFromHq(now),
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
    gate('local_postgres17', 'ready-local', LOCAL_GATE_EVIDENCE, 'Keep the digest-bound rehearsal current.'),
    gate('hosted_postgres17', 'blocked', hostedGateEvidence(auditSummary), hostedGateNextAction(auditSummary)),
    gate('hosted_storage_privacy', 'blocked', 'The six-request verifier is ready, but hosted proof is absent.', 'Run the verifier against an owner-approved isolated private bucket.'),
    gate('live_product_contract', 'blocked', 'The exact paired release is verified, but its managed product contract remains isolated_demo.', 'Prove managed persistence and security on the approved isolated target before any managed-pilot claim.'),
    gate('managed_persistence', 'blocked', 'Live managed persistence ready is false.', 'Prove durable commands, recovery, and tenant isolation on the isolated target.'),
    gate('security', 'blocked', securityGateEvidence(auditSummary), securityGateNextAction(auditSummary, securityAudit.conclusion.nextAction)),
    gate('named_pilot', 'blocked', 'HQ records no named pilot customer or measured baseline.', 'Select one Shop design partner, named operator, baseline, and acceptance evidence.'),
    gate('production_activation', 'blocked', 'The production Supabase target remains protected-unapproved.', 'Keep writes disabled until separate founder approval after every hosted gate passes.'),
  ]

  const result = {
    contract: MANAGED_PILOT_READINESS_CONTRACT,
    asOf: [String(database.recordedAt || ''), String(securityAudit.asOf || ''), liveObservedAt].filter(Boolean).sort().at(-1),
    sourceDigest: readinessDigest(sourceReceipts),
    overall: {
      status: 'blocked',
      localDatabaseProofReady: true,
      hostedActivationReady: false,
      blockingGateCount: gates.filter((entry) => entry.status === 'blocked').length,
      nextAction: {
        kind: 'founder_decision',
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
      decision: 'Approve one bounded managed-pilot rehearsal.',
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
        namedBusinessRequired: true,
        namedOperatorRequired: true,
        measuredBaselineRequired: true,
        acceptanceEvidenceRequired: true,
      },
      proposedActions: [...PROPOSED_ACTIONS],
      doesNotAuthorize: [...FORBIDDEN_ACTIONS],
    },
    securityAudit: auditSummary,
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
  if (!Array.isArray(value.sourceReceipts) || value.sourceReceipts.length !== REQUIRED_SOURCE_RECEIPT_COUNT) fail('managed_pilot_readiness_sources_invalid')
  if (!/^sha256:[0-9a-f]{64}$/.test(value.sourceDigest || '') || value.sourceDigest !== readinessDigest(value.sourceReceipts)) fail('managed_pilot_readiness_digest_invalid')
  if (value.overall?.status !== 'blocked' || value.overall?.hostedActivationReady !== false || value.overall?.localDatabaseProofReady !== true || value.overall?.blockingGateCount !== 7) fail('managed_pilot_readiness_overall_invalid')
  const decision = value.founderDecision
  if (decision?.status !== 'required'
    || decision.authority !== 'proposal_only'
    || decision.createsAuthority !== false
    || decision.approvalReceipt !== null
    || decision.target?.provider !== 'supabase'
    || decision.target?.environment !== 'preview_branch'
    || decision.target?.production !== false
    || decision.target?.startsWithProductionData !== false
    || decision.target?.maximumLifetimeHours !== 24
    || decision.target?.deleteAfterEvidence !== true
    || decision.target?.providerUsageChargesAcknowledged !== false
    || decision.target?.requiredServices?.join(',') !== 'database,auth,storage'
    || decision.operator?.productId !== 'shop'
    || decision.operator?.namedBusinessRequired !== true
    || decision.operator?.namedOperatorRequired !== true
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
    || audit.advisorStatus !== 'blocked'
    || !Number.isInteger(audit.findingCount)
    || audit.findingCount < 1
    || audit.liveSchemaVersion !== 7
    || audit.localTargetVersion !== 10
    || audit.versionDrift !== 3
    || audit.browserRolesDenied !== true
    || audit.metadataRlsEnabled !== false
    || audit.storageBucketCount !== 0
    || audit.productionMutationAuthorized !== false
    || audit.databaseWrites !== 0
    || !isRecord(audit.previewRehearsal)
    || !['not_proven', 'migration_failed'].includes(audit.previewRehearsal.status)
    || (audit.previewRehearsal.status === 'not_proven' && audit.previewRehearsal.publicTableCount !== null)
    || (audit.previewRehearsal.status === 'migration_failed' && (!Number.isInteger(audit.previewRehearsal.publicTableCount) || audit.previewRehearsal.publicTableCount < 1))) fail('managed_pilot_readiness_security_audit_invalid')
  if (!Array.isArray(value.gates)
    || value.gates.map((entry) => entry.id).join(',') !== GATE_IDS.join(',')
    || value.gates[0]?.status !== 'ready-local'
    || value.gates.slice(1).some((entry) => entry.status !== 'blocked')
    || value.gates.some((entry) => !String(entry?.evidence || '').trim() || !String(entry?.nextAction || '').trim())) fail('managed_pilot_readiness_gates_invalid')
  if (value.gates[0].evidence !== LOCAL_GATE_EVIDENCE
    || value.gates.find((entry) => entry.id === 'hosted_postgres17')?.evidence !== hostedGateEvidence(audit)
    || value.gates.find((entry) => entry.id === 'security')?.evidence !== securityGateEvidence(audit)) fail('managed_pilot_readiness_gate_evidence_invalid')
  if (!Array.isArray(value.products) || value.products.map((product) => product.productId).join(',') !== PRODUCT_IDS.join(',') || value.products.some((product) => product.managedPilotStatus !== 'blocked' || product.automationStatus !== 'owner-gated')) fail('managed_pilot_readiness_products_invalid')
  if (value.controls?.externalWritesPerformed !== false || value.controls?.connectorRequestsPerformed !== 0 || value.controls?.modelCallsRequiredToBuild !== 0 || value.controls?.productionWritesEnabled !== false || value.controls?.ownerApprovalRequired !== true) fail('managed_pilot_readiness_controls_invalid')
  const serialized = JSON.stringify(value).toLowerCase()
  if (serialized.includes('postgresql://') || serialized.includes('password=') || serialized.includes('service_role')) fail('managed_pilot_readiness_sensitive_value')
  return value
}
