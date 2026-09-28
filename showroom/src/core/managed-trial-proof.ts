import { sha256Hex } from "./sha256.ts"
export { sha256Hex } from "./sha256.ts"
export const MANAGED_TRIAL_PROOF_CONTRACT = 'supermega.managed_trial_proof.v2'

const MANAGED_TRIAL_PROOF_VERSION = 2
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/
const PRODUCT_PATTERN = /^(shop|plant|website|ecommerce)$/
const TEMPLATE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,119}$/
const MAX_COUNT = 1_000_000

export type ManagedTrialProof = {
  contract: typeof MANAGED_TRIAL_PROOF_CONTRACT
  version: typeof MANAGED_TRIAL_PROOF_VERSION
  summaryDigest: string
  readinessScore: number
  sourceRecordCount: number
  behaviorSignalCount: number
  reviewedDecisionCount: number
  product: string
  templateId: string
  outcomeStatus: 'not_started' | 'collecting' | 'target_met' | 'improved' | 'unchanged' | 'regressed'
  outcomeDigest: string | null
  outcomeAccepted: boolean
  rawRecordsIncluded: false
}

export type ManagedTrialProofInput = Omit<ManagedTrialProof, 'contract' | 'version' | 'summaryDigest' | 'rawRecordsIncluded'>

function boundedInteger(value: number, max: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) throw new Error(`${field} is outside the trial proof boundary.`)
  return value
}

function normalizedIdentity(value: string, pattern: RegExp, field: string) {
  const normalized = value.trim().toLowerCase()
  if (!pattern.test(normalized)) throw new Error(`${field} is invalid for trial proof.`)
  return normalized
}

function normalizedOutcome(input: ManagedTrialProofInput) {
  const statuses = new Set(['not_started', 'collecting', 'target_met', 'improved', 'unchanged', 'regressed'])
  if (!statuses.has(input.outcomeStatus)) throw new Error('Outcome status is invalid for trial proof.')
  const outcomeDigest = input.outcomeDigest
  if (!(outcomeDigest === null || DIGEST_PATTERN.test(outcomeDigest))) throw new Error('Outcome digest is invalid for trial proof.')
  if (input.outcomeStatus === 'not_started' && outcomeDigest !== null) throw new Error('An unstarted outcome cannot include a digest.')
  if (input.outcomeStatus !== 'not_started' && outcomeDigest === null) throw new Error('A started outcome must include a digest.')
  if (input.outcomeAccepted && (!['target_met', 'improved'].includes(input.outcomeStatus) || outcomeDigest === null)) {
    throw new Error('Only a clear or improved measured outcome can be accepted.')
  }
  return { outcomeStatus: input.outcomeStatus, outcomeDigest, outcomeAccepted: input.outcomeAccepted }
}

export function managedTrialProofProjection(input: ManagedTrialProofInput) {
  const product = normalizedIdentity(input.product, PRODUCT_PATTERN, 'Product')
  const templateId = normalizedIdentity(input.templateId, TEMPLATE_PATTERN, 'Template')
  const readinessScore = boundedInteger(input.readinessScore, 100, 'Readiness score')
  const sourceRecordCount = boundedInteger(input.sourceRecordCount, MAX_COUNT, 'Source record count')
  const behaviorSignalCount = boundedInteger(input.behaviorSignalCount, MAX_COUNT, 'Behavior signal count')
  const reviewedDecisionCount = boundedInteger(input.reviewedDecisionCount, MAX_COUNT, 'Reviewed decision count')
  const outcome = normalizedOutcome(input)
  return [
    MANAGED_TRIAL_PROOF_CONTRACT,
    MANAGED_TRIAL_PROOF_VERSION,
    product,
    templateId,
    readinessScore,
    sourceRecordCount,
    behaviorSignalCount,
    reviewedDecisionCount,
    outcome.outcomeStatus,
    outcome.outcomeDigest,
    outcome.outcomeAccepted,
    false,
  ] as const
}




export function buildManagedTrialProof(input: ManagedTrialProofInput): ManagedTrialProof {
  const projection = managedTrialProofProjection(input)
  return {
    contract: MANAGED_TRIAL_PROOF_CONTRACT,
    version: MANAGED_TRIAL_PROOF_VERSION,
    product: projection[2],
    templateId: projection[3],
    readinessScore: projection[4],
    sourceRecordCount: projection[5],
    behaviorSignalCount: projection[6],
    reviewedDecisionCount: projection[7],
    outcomeStatus: projection[8],
    outcomeDigest: projection[9],
    outcomeAccepted: projection[10],
    rawRecordsIncluded: false,
    summaryDigest: `sha256:${sha256Hex(JSON.stringify(projection))}`,
  }
}

export function managedTrialProofFragmentFields(proof: ManagedTrialProof, product: string, templateId: string) {
  try {
    const expected = buildManagedTrialProof({
      product,
      templateId,
      readinessScore: proof.readinessScore,
      sourceRecordCount: proof.sourceRecordCount,
      behaviorSignalCount: proof.behaviorSignalCount,
      reviewedDecisionCount: proof.reviewedDecisionCount,
      outcomeStatus: proof.outcomeStatus,
      outcomeDigest: proof.outcomeDigest,
      outcomeAccepted: proof.outcomeAccepted,
    })
    if (proof.contract !== expected.contract
      || proof.version !== expected.version
      || proof.product !== expected.product
      || proof.templateId !== expected.templateId
      || proof.rawRecordsIncluded !== false
      || !DIGEST_PATTERN.test(proof.summaryDigest)
      || proof.summaryDigest !== expected.summaryDigest) return []
    return [
      ['proof_contract', proof.contract],
      ['proof_version', String(proof.version)],
      ['proof_digest', proof.summaryDigest],
      ['proof_product', proof.product],
      ['proof_template', proof.templateId],
      ['proof_readiness', String(proof.readinessScore)],
      ['proof_sources', String(proof.sourceRecordCount)],
      ['proof_behavior', String(proof.behaviorSignalCount)],
      ['proof_decisions', String(proof.reviewedDecisionCount)],
      ['proof_outcome', proof.outcomeStatus],
      ['proof_outcome_digest', proof.outcomeDigest ?? ''],
      ['proof_outcome_accepted', String(proof.outcomeAccepted)],
      ['proof_raw_records', 'false'],
    ] as const
  } catch {
    return []
  }
}
