import { type LocalBusinessSnapshot } from './business-command.ts'
import { sha256Hex } from './managed-trial-proof.ts'

export const PILOT_OUTCOME_STORAGE_KEY = 'supermega.pilot-outcome.v1'

export type PilotOutcomeProduct = 'commerce' | 'production' | 'website' | 'ecommerce'
export type PilotOutcomeStatus = 'collecting' | 'target_met' | 'improved' | 'unchanged' | 'regressed'

export type PilotOutcomeSetup = {
  product: PilotOutcomeProduct
  workspace: string
  owner: string
  templateId: string
}

export type PilotOutcomeMetric = {
  metricId: string
  label: string
  value: number
  unit: string
  better: 'lower'
  detail: string
  sourceDigest: string
}

type PilotOutcomeCheckpoint = {
  contract: 'supermega.local_pilot_outcome_checkpoint.v1'
  checkpointDigest: string
  setupDigest: string
  product: PilotOutcomeProduct
  workspace: string
  owner: string
  templateId: string
  startedAt: string
  metric: PilotOutcomeMetric
  rawRecordsIncluded: false
}

export type PilotOutcomeReview = {
  contract: 'supermega.local_pilot_outcome_review.v1'
  reportDigest: string
  reviewedBy: string
  reviewedAt: string
  decision: 'accepted'
}

export type PilotOutcomeReport = {
  contract: 'supermega.pilot_outcome_report.v1'
  version: 1
  product: PilotOutcomeProduct
  workspace: string
  owner: string
  templateId: string
  checkpointDigest: string
  startedAt: string
  measuredAt: string
  baseline: PilotOutcomeMetric
  current: PilotOutcomeMetric
  outcomeStatus: PilotOutcomeStatus
  change: number
  recommendation: string
  review: PilotOutcomeReview | null
  rawRecordsIncluded: false
  externalWritesPerformed: false
  reportDigest: string
}

type PilotOutcomeStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

type StoredPilotOutcomes = {
  contract: 'supermega.local_pilot_outcome_state.v1'
  version: 1
  checkpoints: PilotOutcomeCheckpoint[]
  reviews: PilotOutcomeReview[]
}

const PRODUCT_IDS = new Set<PilotOutcomeProduct>(['commerce', 'production', 'website', 'ecommerce'])
const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/

function digest(value: unknown) {
  return `sha256:${sha256Hex(JSON.stringify(value))}`
}

function visibleText(value: unknown, maximum: number) {
  if (typeof value !== 'string') return ''
  const normalized = value.trim()
  return normalized.length <= maximum && !Array.from(normalized).some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  }) ? normalized : ''
}

function validTimestamp(value: unknown) {
  return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value))
}

function setupProjection(setup: PilotOutcomeSetup) {
  return [
    'supermega.local_pilot_outcome_setup.v1',
    setup.product,
    visibleText(setup.workspace, 80),
    visibleText(setup.owner, 80),
    visibleText(setup.templateId, 120),
  ] as const
}

function setupDigest(setup: PilotOutcomeSetup) {
  return digest(setupProjection(setup))
}

function metricProjection(metric: PilotOutcomeMetric) {
  return [
    metric.metricId,
    metric.label,
    metric.value,
    metric.unit,
    metric.better,
    metric.detail,
    metric.sourceDigest,
  ] as const
}

function validMetric(value: unknown): value is PilotOutcomeMetric {
  if (!value || typeof value !== 'object') return false
  const metric = value as Partial<PilotOutcomeMetric>
  return visibleText(metric.metricId, 80) === metric.metricId
    && visibleText(metric.label, 120) === metric.label
    && Number.isSafeInteger(metric.value)
    && Number(metric.value) >= 0
    && Number(metric.value) <= 1_000_000
    && visibleText(metric.unit, 40) === metric.unit
    && metric.better === 'lower'
    && visibleText(metric.detail, 300) === metric.detail
    && typeof metric.sourceDigest === 'string'
    && SHA256_DIGEST.test(metric.sourceDigest)
}

function checkpointProjection(checkpoint: Omit<PilotOutcomeCheckpoint, 'checkpointDigest'>) {
  return [
    checkpoint.contract,
    checkpoint.setupDigest,
    checkpoint.product,
    checkpoint.workspace,
    checkpoint.owner,
    checkpoint.templateId,
    checkpoint.startedAt,
    metricProjection(checkpoint.metric),
    checkpoint.rawRecordsIncluded,
  ] as const
}

function normalizeCheckpoint(value: unknown): PilotOutcomeCheckpoint | null {
  if (!value || typeof value !== 'object') return null
  const checkpoint = value as Partial<PilotOutcomeCheckpoint>
  if (checkpoint.contract !== 'supermega.local_pilot_outcome_checkpoint.v1'
    || typeof checkpoint.product !== 'string'
    || !PRODUCT_IDS.has(checkpoint.product as PilotOutcomeProduct)
    || visibleText(checkpoint.workspace, 80) !== checkpoint.workspace
    || visibleText(checkpoint.owner, 80) !== checkpoint.owner
    || visibleText(checkpoint.templateId, 120) !== checkpoint.templateId
    || !validTimestamp(checkpoint.startedAt)
    || !validMetric(checkpoint.metric)
    || checkpoint.rawRecordsIncluded !== false
    || typeof checkpoint.setupDigest !== 'string'
    || !SHA256_DIGEST.test(checkpoint.setupDigest)
    || typeof checkpoint.checkpointDigest !== 'string'
    || !SHA256_DIGEST.test(checkpoint.checkpointDigest)) return null
  const normalized = checkpoint as PilotOutcomeCheckpoint
  if (normalized.setupDigest !== setupDigest(normalized)
    || normalized.checkpointDigest !== digest(checkpointProjection(normalized))) return null
  return normalized
}

function normalizeReview(value: unknown): PilotOutcomeReview | null {
  if (!value || typeof value !== 'object') return null
  const review = value as Partial<PilotOutcomeReview>
  if (review.contract !== 'supermega.local_pilot_outcome_review.v1'
    || typeof review.reportDigest !== 'string'
    || !SHA256_DIGEST.test(review.reportDigest)
    || visibleText(review.reviewedBy, 80) !== review.reviewedBy
    || !validTimestamp(review.reviewedAt)
    || review.decision !== 'accepted') return null
  return review as PilotOutcomeReview
}

function emptyState(): StoredPilotOutcomes {
  return {
    contract: 'supermega.local_pilot_outcome_state.v1',
    version: 1,
    checkpoints: [],
    reviews: [],
  }
}

function readState(storage: Pick<PilotOutcomeStorage, 'getItem'>): StoredPilotOutcomes {
  try {
    const raw = storage.getItem(PILOT_OUTCOME_STORAGE_KEY)
    if (!raw) return emptyState()
    const value = JSON.parse(raw) as Partial<StoredPilotOutcomes>
    if (value.contract !== 'supermega.local_pilot_outcome_state.v1' || value.version !== 1) return emptyState()
    const checkpoints = Array.isArray(value.checkpoints)
      ? value.checkpoints.map(normalizeCheckpoint).filter((item): item is PilotOutcomeCheckpoint => Boolean(item)).slice(-4)
      : []
    const reviews = Array.isArray(value.reviews)
      ? value.reviews.map(normalizeReview).filter((item): item is PilotOutcomeReview => Boolean(item)).slice(-12)
      : []
    return { ...emptyState(), checkpoints, reviews }
  } catch {
    return emptyState()
  }
}

function writeState(storage: PilotOutcomeStorage, state: StoredPilotOutcomes) {
  storage.setItem(PILOT_OUTCOME_STORAGE_KEY, JSON.stringify(state))
}

function metric(
  product: PilotOutcomeProduct,
  source: object,
  metricId: string,
  label: string,
  value: number,
  unit: string,
  detail: string,
): PilotOutcomeMetric {
  return {
    metricId,
    label,
    value,
    unit,
    better: 'lower',
    detail,
    sourceDigest: digest(['supermega.local_pilot_outcome_source.v1', product, source]),
  }
}

export function buildPilotOutcomeMetric(snapshot: LocalBusinessSnapshot, product: PilotOutcomeProduct): PilotOutcomeMetric | null {
  if (snapshot.contract !== 'supermega.local_business_snapshot.v1') return null
  if (product === 'commerce') {
    const source = snapshot.shop
    if (source.status !== 'ready') return null
    return metric(product, source, 'shop-exceptions', 'Shop exceptions', source.lowStock + source.paymentExceptions + source.refundsDue, 'exceptions', `${source.lowStock} low stock, ${source.paymentExceptions} payment, ${source.refundsDue} refund.`)
  }
  if (product === 'production') {
    const source = snapshot.plant
    if (source.status !== 'ready') return null
    return metric(product, source, 'plant-blockers', 'Plant blockers', source.priorityIssues + source.heldJobs + source.stoppedMachines, 'blockers', `${source.priorityIssues} priority issues, ${source.heldJobs} quality holds, ${source.stoppedMachines} stopped machines.`)
  }
  if (product === 'website') {
    const source = snapshot.website
    if (source.status !== 'ready') return null
    const gaps = Math.max(0, source.readinessTotal - source.readinessPassed) + (source.approved ? 0 : 1) + (source.released ? 0 : 1)
    return metric(product, source, 'website-release-gaps', 'Website release gaps', gaps, 'gaps', `${source.readinessPassed}/${source.readinessTotal} checks, approval ${source.approved ? 'current' : 'missing'}, release record ${source.released ? 'current' : 'missing'}.`)
  }
  const source = snapshot.ecommerce
  if (source.status !== 'ready') return null
  const gaps = (source.draftState === 'ready' ? 0 : 1) + (source.shopSourceReady ? 0 : 1) + (source.selectedSkus > 0 ? 0 : 1)
  return metric(product, source, 'ecommerce-readiness-gaps', 'Ecommerce readiness gaps', gaps, 'gaps', `${source.selectedSkus} selected SKUs, Shop source ${source.shopSourceReady ? 'ready' : 'missing'}, draft ${source.draftState}.`)
}

export function startPilotOutcome(
  storage: PilotOutcomeStorage,
  setup: PilotOutcomeSetup,
  metricValue: PilotOutcomeMetric,
  now = new Date(),
) {
  if (!validMetric(metricValue) || !visibleText(setup.workspace, 80) || !visibleText(setup.owner, 80) || !visibleText(setup.templateId, 120)) {
    throw new Error('Pilot outcome needs a named workspace, owner, template, and validated product source.')
  }
  const base = {
    contract: 'supermega.local_pilot_outcome_checkpoint.v1' as const,
    setupDigest: setupDigest(setup),
    product: setup.product,
    workspace: setup.workspace.trim(),
    owner: setup.owner.trim(),
    templateId: setup.templateId.trim(),
    startedAt: now.toISOString(),
    metric: metricValue,
    rawRecordsIncluded: false as const,
  }
  const checkpoint: PilotOutcomeCheckpoint = { ...base, checkpointDigest: digest(checkpointProjection(base)) }
  const state = readState(storage)
  writeState(storage, {
    ...state,
    checkpoints: [...state.checkpoints.filter((item) => item.product !== setup.product), checkpoint].slice(-4),
  })
  return checkpoint
}

function reportProjection(report: Omit<PilotOutcomeReport, 'reportDigest' | 'review'>) {
  return [
    report.contract,
    report.version,
    report.product,
    report.workspace,
    report.owner,
    report.templateId,
    report.checkpointDigest,
    report.startedAt,
    metricProjection(report.baseline),
    metricProjection(report.current),
    report.outcomeStatus,
    report.change,
    report.recommendation,
    report.rawRecordsIncluded,
    report.externalWritesPerformed,
  ] as const
}

function outcomeStatus(baseline: PilotOutcomeMetric, current: PilotOutcomeMetric): PilotOutcomeStatus {
  if (baseline.sourceDigest === current.sourceDigest) return 'collecting'
  if (current.value === 0) return 'target_met'
  if (current.value < baseline.value) return 'improved'
  if (current.value > baseline.value) return 'regressed'
  return 'unchanged'
}

function recommendation(status: PilotOutcomeStatus) {
  if (status === 'target_met') return 'Accept this clear result or continue the workflow to collect more evidence.'
  if (status === 'improved') return 'Accept the measured improvement or continue until the product is clear.'
  if (status === 'regressed') return 'Open the product and clear the new exceptions before accepting the pilot.'
  if (status === 'unchanged') return 'Complete one consequential product step, then return for a fresh comparison.'
  return 'Run one real product workflow. SuperMega will compare the next aggregate source revision automatically.'
}

export function buildPilotOutcomeReport(
  storage: Pick<PilotOutcomeStorage, 'getItem'>,
  setup: PilotOutcomeSetup,
  current: PilotOutcomeMetric | null,
  now = new Date(),
): PilotOutcomeReport | null {
  if (!current || !validMetric(current)) return null
  const state = readState(storage)
  const checkpoint = state.checkpoints.find((item) => item.product === setup.product && item.setupDigest === setupDigest(setup))
  if (!checkpoint || checkpoint.metric.metricId !== current.metricId) return null
  const status = outcomeStatus(checkpoint.metric, current)
  const base = {
    contract: 'supermega.pilot_outcome_report.v1' as const,
    version: 1 as const,
    product: setup.product,
    workspace: checkpoint.workspace,
    owner: checkpoint.owner,
    templateId: checkpoint.templateId,
    checkpointDigest: checkpoint.checkpointDigest,
    startedAt: checkpoint.startedAt,
    measuredAt: now.toISOString(),
    baseline: checkpoint.metric,
    current,
    outcomeStatus: status,
    change: current.value - checkpoint.metric.value,
    recommendation: recommendation(status),
    rawRecordsIncluded: false as const,
    externalWritesPerformed: false as const,
  }
  const reportDigest = digest(reportProjection(base))
  const review = state.reviews.find((item) => item.reportDigest === reportDigest && item.reviewedBy === checkpoint.owner) ?? null
  return { ...base, measuredAt: review?.reviewedAt ?? base.measuredAt, review, reportDigest }
}

export function acceptPilotOutcome(
  storage: PilotOutcomeStorage,
  report: PilotOutcomeReport,
  reviewer: string,
  now = new Date(),
) {
  const reviewedBy = visibleText(reviewer, 80)
  if (!reviewedBy || reviewedBy !== report.owner || !['target_met', 'improved'].includes(report.outcomeStatus)) {
    throw new Error('Only the named owner can accept a clear or improved pilot result.')
  }
  const base = { ...report }
  delete (base as Partial<PilotOutcomeReport>).reportDigest
  delete (base as Partial<PilotOutcomeReport>).review
  if (digest(reportProjection(base)) !== report.reportDigest) throw new Error('Pilot outcome changed before owner acceptance.')
  const review: PilotOutcomeReview = {
    contract: 'supermega.local_pilot_outcome_review.v1',
    reportDigest: report.reportDigest,
    reviewedBy,
    reviewedAt: now.toISOString(),
    decision: 'accepted',
  }
  const state = readState(storage)
  writeState(storage, {
    ...state,
    reviews: [...state.reviews.filter((item) => item.reportDigest !== report.reportDigest), review].slice(-12),
  })
  return review
}
