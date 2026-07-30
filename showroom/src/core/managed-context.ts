import type { BehaviorPreferenceSnapshot } from './behavior-trail'
import type { ManagedIdentity } from './managed-trial'
import { sha256Hex } from './managed-trial-proof.ts'


export const MANAGED_CONTEXT_ALLOWED_USES = [
  'rank_next_actions',
  'draft_internal_recommendations',
  'prepare_import_mapping',
  'summarize_workspace_evidence',
] as const

export const MANAGED_CONTEXT_FORBIDDEN_ACTIONS = [
  'customer_message_send',
  'payment_capture',
  'stock_move',
  'production_write',
  'domain_publish',
  'crm_write',
  'model_training',
] as const

const PRODUCT_TEMPLATES = {
  shop: ['social-commerce', 'retail-wholesale', 'restaurant-ordering'],
  plant: ['production-control', 'maintenance-downtime', 'quality-traceability'],
  website: ['business-presence', 'lead-generation', 'catalog-showcase'],
  ecommerce: ['social-storefront', 'pickup-preorder', 'wholesale-request'],
} as const

export type ManagedContextProduct = keyof typeof PRODUCT_TEMPLATES
export type ManagedBehaviorProduct = 'commerce' | 'production' | 'website' | 'ecommerce'

export type ManagedContextProfileRequest = {
  contract: 'supermega.managed_context_profile_request.v1'
  version: 1
  product: ManagedContextProduct
  templateId: string
  sourceCounts: {
    selectedProductRecords: number
    behaviorSignals: number
    reviewedDecisions: number
  }
  behaviorPreference: {
    product: ManagedBehaviorProduct
    chosenCount: number
  }
  allowedUses: [...typeof MANAGED_CONTEXT_ALLOWED_USES]
  forbiddenActions: [...typeof MANAGED_CONTEXT_FORBIDDEN_ACTIONS]
  ownerApproved: true
  rawProductRecordsIncluded: false
  modelTrainingAllowed: false
}

export type ManagedContextProfile = {
  contract: 'supermega.managed_context_profile.v2'
  version: 2
  workspaceId: string
  retainedBy: string
  approvedContextDigest: string
  product: ManagedContextProduct
  templateId: string
  sourceCounts: ManagedContextProfileRequest['sourceCounts']
  behaviorPreference: ManagedContextProfileRequest['behaviorPreference']
  outcome: {
    status: 'target_met' | 'improved'
    digest: string
    accepted: true
  }
  approvedBy: string
  approvedAt: string
  allowedUses: [...typeof MANAGED_CONTEXT_ALLOWED_USES]
  forbiddenActions: [...typeof MANAGED_CONTEXT_FORBIDDEN_ACTIONS]
  profileDigest: string
  rawProductRecordsIncluded: false
  rawBehaviorEntriesIncluded: false
  rawDecisionRecordsIncluded: false
  modelTrainingAllowed: false
}

export type ManagedContextBriefProjection =
  | {
      contract: 'supermega.managed_context_brief_projection.v1'
      version: 1
      profileDigest: string
      preferredProduct: ManagedBehaviorProduct
    }
  | {
      contract: 'supermega.managed_context_brief_projection.v2'
      version: 2
      profileDigest: string
      approvedContextDigest: string
      acceptedOutcomeDigest: string
      preferredProduct: ManagedBehaviorProduct
    }

export type ManagedAiContextExport = {
  contract: 'supermega.ai_context_export.v1'
  version: 1
  product: ManagedContextProduct
  templateId: string
  sourceCounts: ManagedContextProfileRequest['sourceCounts']
  behaviorPreference: ManagedContextProfileRequest['behaviorPreference']
  outcome: {
    status: 'target_met' | 'improved'
    digest: string
    accepted: true
  }
  allowedUses: [...typeof MANAGED_CONTEXT_ALLOWED_USES]
  forbiddenActions: [...typeof MANAGED_CONTEXT_FORBIDDEN_ACTIONS]
  handoff: {
    route: 'managed_activation_review'
    activationRequired: true
  }
  ownerReview: {
    status: 'approved_for_managed_review'
    reviewedBy: string
    reviewedAt: string
  }
  privacyBoundary: {
    rawProductRecordsIncluded: false
    rawBehaviorEntriesIncluded: false
    rawDecisionRecordsIncluded: false
    externalSendPerformed: false
    managedWritePerformed: false
    modelTrainingAllowed: false
  }
  contextDigest: string
}

export type ManagedContextValidation = {
  contract: 'supermega.managed_context_profile_validation.v2'
  status: 'ready_for_owner_confirmation'
  profileDigest: string
  validationDigest: string
  companyVersion: number
  internalWritePerformed: false
  externalWritesPerformed: false
}

export type ManagedContextRetention = {
  contract: 'supermega.managed_context_profile_retention.v2'
  status: 'retained'
  profileDigest: string
  companyVersion: number
  internalWritePerformed: true
  externalWritesPerformed: false
  idempotentReplay: boolean
}

function validCount(value: number, minimum: number, maximum: number) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum
}

function sameStrings(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort()
  const sorted = [...expected].sort()
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isManagedContextProduct(value: unknown): value is ManagedContextProduct {
  return typeof value === 'string' && Object.hasOwn(PRODUCT_TEMPLATES, value)
}

function isManagedBehaviorProduct(value: unknown): value is ManagedBehaviorProduct {
  return value === 'commerce' || value === 'production' || value === 'website' || value === 'ecommerce'
}

export function managedContextProductLabel(product: ManagedBehaviorProduct) {
  if (product === 'commerce') return 'Shop'
  if (product === 'production') return 'Plant'
  if (product === 'website') return 'Website'
  return 'Ecommerce'
}

export function managedAiContextExportProjection(value: Omit<ManagedAiContextExport, 'contextDigest'>) {
  return [
    value.contract,
    value.version,
    value.product,
    value.templateId,
    value.sourceCounts.selectedProductRecords,
    value.sourceCounts.behaviorSignals,
    value.sourceCounts.reviewedDecisions,
    value.behaviorPreference.product,
    value.behaviorPreference.chosenCount,
    value.outcome.status,
    value.outcome.digest,
    value.outcome.accepted,
    ...value.allowedUses,
    '|',
    ...value.forbiddenActions,
    value.ownerReview.status,
    value.ownerReview.reviewedBy,
    value.ownerReview.reviewedAt,
    value.handoff.route,
    value.handoff.activationRequired,
    value.privacyBoundary.rawProductRecordsIncluded,
    value.privacyBoundary.rawBehaviorEntriesIncluded,
    value.privacyBoundary.rawDecisionRecordsIncluded,
    value.privacyBoundary.externalSendPerformed,
    value.privacyBoundary.managedWritePerformed,
    value.privacyBoundary.modelTrainingAllowed,
  ]
}

function validOwnerReview(reviewedBy: unknown, reviewedAt: unknown) {
  if (typeof reviewedBy !== 'string' || reviewedBy !== reviewedBy.trim() || reviewedBy.length < 1 || reviewedBy.length > 120) return false
  if (typeof reviewedAt !== 'string') return false
  const parsed = new Date(reviewedAt)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === reviewedAt
}

function validAcceptedOutcome(status: unknown, digest: unknown) {
  return (status === 'target_met' || status === 'improved')
    && typeof digest === 'string'
    && /^sha256:[0-9a-f]{64}$/.test(digest)
}

export function buildManagedAiContextExport(input: {
  product: ManagedContextProduct
  templateId: string
  selectedProductRecords: number
  behaviorSignals: number
  reviewedDecisions: number
  behaviorPreference: BehaviorPreferenceSnapshot
  outcomeStatus: 'target_met' | 'improved'
  outcomeDigest: string
  reviewedBy: string
  reviewedAt: string
}): ManagedAiContextExport | null {
  const request = buildManagedContextProfileRequest(input)
  const reviewedBy = input.reviewedBy.trim()
  if (!request
    || !validAcceptedOutcome(input.outcomeStatus, input.outcomeDigest)
    || !validOwnerReview(reviewedBy, input.reviewedAt)) return null
  const body: Omit<ManagedAiContextExport, 'contextDigest'> = {
    contract: 'supermega.ai_context_export.v1',
    version: 1,
    product: request.product,
    templateId: request.templateId,
    sourceCounts: { ...request.sourceCounts },
    behaviorPreference: { ...request.behaviorPreference },
    outcome: {
      status: input.outcomeStatus,
      digest: input.outcomeDigest,
      accepted: true,
    },
    allowedUses: [...MANAGED_CONTEXT_ALLOWED_USES],
    forbiddenActions: [...MANAGED_CONTEXT_FORBIDDEN_ACTIONS],
    handoff: {
      route: 'managed_activation_review',
      activationRequired: true,
    },
    ownerReview: {
      status: 'approved_for_managed_review',
      reviewedBy,
      reviewedAt: input.reviewedAt,
    },
    privacyBoundary: {
      rawProductRecordsIncluded: false,
      rawBehaviorEntriesIncluded: false,
      rawDecisionRecordsIncluded: false,
      externalSendPerformed: false,
      managedWritePerformed: false,
      modelTrainingAllowed: false,
    },
  }
  return {
    ...body,
    contextDigest: `sha256:${sha256Hex(JSON.stringify(managedAiContextExportProjection(body)))}`,
  }
}

export function structurallyValidManagedAiContextExport(value: unknown): value is ManagedAiContextExport {
  if (!isRecord(value)
    || !exactKeys(value, [
      'allowedUses', 'behaviorPreference', 'contextDigest', 'contract', 'forbiddenActions', 'handoff',
      'outcome', 'ownerReview', 'privacyBoundary', 'product', 'sourceCounts', 'templateId', 'version',
    ])
    || !isManagedContextProduct(value.product)
    || typeof value.templateId !== 'string'
    || !PRODUCT_TEMPLATES[value.product].some((template) => template === value.templateId)
    || !isRecord(value.sourceCounts)
    || !exactKeys(value.sourceCounts, ['behaviorSignals', 'reviewedDecisions', 'selectedProductRecords'])
    || !validCount(value.sourceCounts.selectedProductRecords as number, 1, 100_000)
    || !validCount(value.sourceCounts.behaviorSignals as number, 1, 80)
    || !validCount(value.sourceCounts.reviewedDecisions as number, 1, 10_000)
    || !isRecord(value.behaviorPreference)
    || !exactKeys(value.behaviorPreference, ['chosenCount', 'product'])
    || !isManagedBehaviorProduct(value.behaviorPreference.product)
    || !validCount(value.behaviorPreference.chosenCount as number, 1, value.sourceCounts.behaviorSignals as number)
    || !isRecord(value.outcome)
    || !exactKeys(value.outcome, ['accepted', 'digest', 'status'])
    || !validAcceptedOutcome(value.outcome.status, value.outcome.digest)
    || value.outcome.accepted !== true
    || !Array.isArray(value.allowedUses)
    || !sameStrings(value.allowedUses as string[], MANAGED_CONTEXT_ALLOWED_USES)
    || !Array.isArray(value.forbiddenActions)
    || !sameStrings(value.forbiddenActions as string[], MANAGED_CONTEXT_FORBIDDEN_ACTIONS)
    || !isRecord(value.handoff)
    || !exactKeys(value.handoff, ['activationRequired', 'route'])
    || value.handoff.route !== 'managed_activation_review'
    || value.handoff.activationRequired !== true
    || !isRecord(value.ownerReview)
    || !exactKeys(value.ownerReview, ['reviewedAt', 'reviewedBy', 'status'])
    || value.ownerReview.status !== 'approved_for_managed_review'
    || !validOwnerReview(value.ownerReview.reviewedBy, value.ownerReview.reviewedAt)
    || !isRecord(value.privacyBoundary)
    || !exactKeys(value.privacyBoundary, [
      'externalSendPerformed', 'managedWritePerformed', 'modelTrainingAllowed', 'rawBehaviorEntriesIncluded',
      'rawDecisionRecordsIncluded', 'rawProductRecordsIncluded',
    ])
    || value.privacyBoundary.rawProductRecordsIncluded !== false
    || value.privacyBoundary.rawBehaviorEntriesIncluded !== false
    || value.privacyBoundary.rawDecisionRecordsIncluded !== false
    || value.privacyBoundary.externalSendPerformed !== false
    || value.privacyBoundary.managedWritePerformed !== false
    || value.privacyBoundary.modelTrainingAllowed !== false
    || typeof value.contextDigest !== 'string'
    || !/^sha256:[0-9a-f]{64}$/.test(value.contextDigest)) return false
  const { contextDigest, ...body } = value as ManagedAiContextExport
  return contextDigest === `sha256:${sha256Hex(JSON.stringify(managedAiContextExportProjection(body)))}`
}

export function buildManagedContextProfileRequest(input: {
  product: ManagedContextProduct
  templateId: string
  selectedProductRecords: number
  behaviorSignals: number
  reviewedDecisions: number
  behaviorPreference: BehaviorPreferenceSnapshot
}): ManagedContextProfileRequest | null {
  const preference = input.behaviorPreference.preferred
  if (!preference
    || !PRODUCT_TEMPLATES[input.product].some((template) => template === input.templateId)
    || !validCount(input.selectedProductRecords, 1, 100_000)
    || !validCount(input.behaviorSignals, 1, 80)
    || !validCount(input.reviewedDecisions, 1, 10_000)
    || !validCount(preference.chosenCount, 1, input.behaviorSignals)) return null
  return {
    contract: 'supermega.managed_context_profile_request.v1',
    version: 1,
    product: input.product,
    templateId: input.templateId,
    sourceCounts: {
      selectedProductRecords: input.selectedProductRecords,
      behaviorSignals: input.behaviorSignals,
      reviewedDecisions: input.reviewedDecisions,
    },
    behaviorPreference: {
      product: preference.product,
      chosenCount: preference.chosenCount,
    },
    allowedUses: [...MANAGED_CONTEXT_ALLOWED_USES],
    forbiddenActions: [...MANAGED_CONTEXT_FORBIDDEN_ACTIONS],
    ownerApproved: true,
    rawProductRecordsIncluded: false,
    modelTrainingAllowed: false,
  }
}

export function managedContextProfileProjection(
  approvedContext: ManagedAiContextExport,
  identity: ManagedIdentity,
) {
  return [
    'supermega.managed_context_profile.v2',
    2,
    identity.workspaceId,
    identity.userId,
    approvedContext.contextDigest,
    approvedContext.product,
    approvedContext.templateId,
    approvedContext.sourceCounts.selectedProductRecords,
    approvedContext.sourceCounts.behaviorSignals,
    approvedContext.sourceCounts.reviewedDecisions,
    approvedContext.behaviorPreference.product,
    approvedContext.behaviorPreference.chosenCount,
    approvedContext.outcome.status,
    approvedContext.outcome.digest,
    approvedContext.outcome.accepted,
    approvedContext.ownerReview.reviewedBy,
    approvedContext.ownerReview.reviewedAt,
    ...MANAGED_CONTEXT_ALLOWED_USES,
    '|',
    ...MANAGED_CONTEXT_FORBIDDEN_ACTIONS,
    false,
    false,
    false,
    false,
  ]
}

export function managedContextValidationProjection(
  profileDigest: string,
  companyVersion: number,
  identity: ManagedIdentity,
) {
  return [
    'supermega.managed_context_profile_validation.v2',
    2,
    identity.workspaceId,
    identity.userId,
    profileDigest,
    companyVersion,
  ]
}

export function structurallyValidManagedContextProfile(
  value: unknown,
  approvedContext: ManagedAiContextExport,
  identity: ManagedIdentity,
): value is ManagedContextProfile {
  if (!isRecord(value)
    || !exactKeys(value, [
      'allowedUses', 'approvedAt', 'approvedBy', 'approvedContextDigest', 'behaviorPreference', 'contract',
      'forbiddenActions', 'modelTrainingAllowed', 'outcome', 'product', 'profileDigest',
      'rawBehaviorEntriesIncluded', 'rawDecisionRecordsIncluded', 'rawProductRecordsIncluded', 'retainedBy',
      'sourceCounts', 'templateId', 'version', 'workspaceId',
    ])
    || !isRecord(value.sourceCounts)
    || !exactKeys(value.sourceCounts, ['behaviorSignals', 'reviewedDecisions', 'selectedProductRecords'])
    || !isRecord(value.behaviorPreference)
    || !exactKeys(value.behaviorPreference, ['chosenCount', 'product'])
    || !isRecord(value.outcome)
    || !exactKeys(value.outcome, ['accepted', 'digest', 'status'])
    || !Array.isArray(value.allowedUses)
    || !Array.isArray(value.forbiddenActions)
    || !sameStrings(value.allowedUses as string[], MANAGED_CONTEXT_ALLOWED_USES)
    || !sameStrings(value.forbiddenActions as string[], MANAGED_CONTEXT_FORBIDDEN_ACTIONS)
    || !isManagedContextProduct(value.product)
    || !isManagedBehaviorProduct(value.behaviorPreference.product)) return false
  return structurallyValidManagedAiContextExport(approvedContext)
    && value.contract === 'supermega.managed_context_profile.v2'
    && value.version === 2
    && value.workspaceId === identity.workspaceId
    && value.retainedBy === identity.userId
    && value.approvedContextDigest === approvedContext.contextDigest
    && value.product === approvedContext.product
    && value.templateId === approvedContext.templateId
    && value.sourceCounts.selectedProductRecords === approvedContext.sourceCounts.selectedProductRecords
    && value.sourceCounts.behaviorSignals === approvedContext.sourceCounts.behaviorSignals
    && value.sourceCounts.reviewedDecisions === approvedContext.sourceCounts.reviewedDecisions
    && value.behaviorPreference.product === approvedContext.behaviorPreference.product
    && value.behaviorPreference.chosenCount === approvedContext.behaviorPreference.chosenCount
    && value.outcome.status === approvedContext.outcome.status
    && value.outcome.digest === approvedContext.outcome.digest
    && value.outcome.accepted === true
    && value.approvedBy === approvedContext.ownerReview.reviewedBy
    && value.approvedAt === approvedContext.ownerReview.reviewedAt
    && value.rawProductRecordsIncluded === false
    && value.rawBehaviorEntriesIncluded === false
    && value.rawDecisionRecordsIncluded === false
    && value.modelTrainingAllowed === false
    && typeof value.approvedContextDigest === 'string'
    && /^sha256:[0-9a-f]{64}$/.test(value.approvedContextDigest)
    && typeof value.profileDigest === 'string'
    && /^sha256:[0-9a-f]{64}$/.test(value.profileDigest)
}

export function structurallyValidManagedContextBriefProjection(
  value: unknown,
): value is ManagedContextBriefProjection {
  if (!isRecord(value)
    || typeof value.profileDigest !== 'string'
    || !/^sha256:[0-9a-f]{64}$/.test(value.profileDigest)
    || !isManagedBehaviorProduct(value.preferredProduct)) return false
  if (value.contract === 'supermega.managed_context_brief_projection.v1') {
    return value.version === 1 && exactKeys(value, ['contract', 'preferredProduct', 'profileDigest', 'version'])
  }
  return value.contract === 'supermega.managed_context_brief_projection.v2'
    && value.version === 2
    && exactKeys(value, [
      'acceptedOutcomeDigest', 'approvedContextDigest', 'contract', 'preferredProduct', 'profileDigest', 'version',
    ])
    && typeof value.approvedContextDigest === 'string'
    && /^sha256:[0-9a-f]{64}$/.test(value.approvedContextDigest)
    && typeof value.acceptedOutcomeDigest === 'string'
    && /^sha256:[0-9a-f]{64}$/.test(value.acceptedOutcomeDigest)
}
