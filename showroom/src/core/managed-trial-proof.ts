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

function rotateRight(value: number, bits: number) {
  return (value >>> bits) | (value << (32 - bits))
}

const sha256RoundConstants = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

export function sha256Hex(source: string) {
  const input = new TextEncoder().encode(source)
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLength)
  padded.set(input)
  padded[input.length] = 0x80
  const view = new DataView(padded.buffer)
  const bitLength = BigInt(input.length) * 8n
  view.setUint32(paddedLength - 8, Number(bitLength >> 32n), false)
  view.setUint32(paddedLength - 4, Number(bitLength & 0xffffffffn), false)
  const hash = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const words = new Uint32Array(64)
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false)
    for (let index = 16; index < 64; index += 1) {
      const before15 = words[index - 15]
      const before2 = words[index - 2]
      const sigma0 = rotateRight(before15, 7) ^ rotateRight(before15, 18) ^ (before15 >>> 3)
      const sigma1 = rotateRight(before2, 17) ^ rotateRight(before2, 19) ^ (before2 >>> 10)
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0
    }
    let [a, b, c, d, e, f, g, h] = hash
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
      const choice = (e & f) ^ (~e & g)
      const temporary1 = (h + sum1 + choice + sha256RoundConstants[index] + words[index]) >>> 0
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temporary2 = (sum0 + majority) >>> 0
      h = g
      g = f
      f = e
      e = (d + temporary1) >>> 0
      d = c
      c = b
      b = a
      a = (temporary1 + temporary2) >>> 0
    }
    hash[0] = (hash[0] + a) >>> 0
    hash[1] = (hash[1] + b) >>> 0
    hash[2] = (hash[2] + c) >>> 0
    hash[3] = (hash[3] + d) >>> 0
    hash[4] = (hash[4] + e) >>> 0
    hash[5] = (hash[5] + f) >>> 0
    hash[6] = (hash[6] + g) >>> 0
    hash[7] = (hash[7] + h) >>> 0
  }
  return Array.from(hash, (word) => word.toString(16).padStart(8, '0')).join('')
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
