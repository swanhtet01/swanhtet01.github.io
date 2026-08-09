import {
  PLANT_ORDER_EFFECTIVE_PLAN_CONTRACT,
  plantOrderEvidenceDigest,
  type PlantOrderMaterial,
  type PlantOrderPlan,
  type PlantOrderState,
} from './plant-order-foundation.ts'
import type { PlantIndustryPackId } from './plant-industry-packs.ts'
import { productionJobPlanSourceDigest, type ProductionJob, type ProductionJobPriority } from './production-workspace.ts'

export type ProductionJobPlanDraft = Readonly<{
  jobId: string
  owner: string
  priority: ProductionJobPriority
  dueAt: string
}>

type ProductionJobPlanSource = Readonly<{
  jobId: string
  line: string
  product: string
  target: number
  output: number
  scrap: number
  owner: string | null
  priority: ProductionJobPriority | null
  dueAt: string | null
  closureActionId: string | null
}>

export type ProductionJobPlanOpening = Readonly<{
  draft: ProductionJobPlanDraft
  source: ProductionJobPlanSource
}>

export type ProductionClosedJobPlanDraft = Readonly<{
  draft: ProductionJobPlanDraft
  openedDraft: ProductionJobPlanDraft
  source: ProductionJobPlanSource
}>

export type ProductionJobPlanDraftRecovery =
  | Readonly<{ ok: true; draft: ProductionJobPlanDraft }>
  | Readonly<{ ok: false; reason: 'already_editing' | 'invalid_recovery' | 'job_inactive' | 'job_changed' }>

const priorities = new Set<ProductionJobPriority>(['urgent', 'normal', 'low'])

function validDraft(value: unknown): value is ProductionJobPlanDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as Partial<ProductionJobPlanDraft>
  return typeof draft.jobId === 'string'
    && draft.jobId.length > 0
    && draft.jobId.length <= 80
    && typeof draft.owner === 'string'
    && draft.owner.length <= 120
    && typeof draft.dueAt === 'string'
    && draft.dueAt.length <= 64
    && priorities.has(draft.priority as ProductionJobPriority)
}

function planSource(job: ProductionJob): ProductionJobPlanSource | null {
  if (!job
    || typeof job.id !== 'string'
    || !job.id
    || typeof job.line !== 'string'
    || typeof job.product !== 'string'
    || !Number.isSafeInteger(job.target)
    || !Number.isSafeInteger(job.output)
    || !Number.isSafeInteger(job.scrap ?? 0)) return null
  return {
    jobId: job.id,
    line: job.line,
    product: job.product,
    target: job.target,
    output: job.output,
    scrap: job.scrap ?? 0,
    owner: job.owner ?? null,
    priority: job.priority ?? null,
    dueAt: job.dueAt ?? null,
    closureActionId: job.closure?.actionId ?? null,
  }
}

function sourceEqual(left: ProductionJobPlanSource, right: ProductionJobPlanSource) {
  return left.jobId === right.jobId
    && left.line === right.line
    && left.product === right.product
    && left.target === right.target
    && left.output === right.output
    && left.scrap === right.scrap
    && left.owner === right.owner
    && left.priority === right.priority
    && left.dueAt === right.dueAt
    && left.closureActionId === right.closureActionId
}

export function productionJobPlanDraftChanged(left: ProductionJobPlanDraft, right: ProductionJobPlanDraft) {
  return left.jobId !== right.jobId
    || left.owner !== right.owner
    || left.priority !== right.priority
    || left.dueAt !== right.dueAt
}

export function createProductionJobPlanOpening(draft: ProductionJobPlanDraft, job: ProductionJob): ProductionJobPlanOpening | null {
  const source = planSource(job)
  if (!validDraft(draft) || !source || draft.jobId !== source.jobId) return null
  return { draft: { ...draft }, source }
}

export function closeProductionJobPlanDraft(draft: ProductionJobPlanDraft, opening: ProductionJobPlanOpening | null): ProductionClosedJobPlanDraft | null {
  if (!opening
    || !validDraft(draft)
    || !validDraft(opening.draft)
    || draft.jobId !== opening.source.jobId
    || opening.draft.jobId !== opening.source.jobId
    || !productionJobPlanDraftChanged(draft, opening.draft)) return null
  return {
    draft: { ...draft },
    openedDraft: { ...opening.draft },
    source: { ...opening.source },
  }
}

export function recoverProductionJobPlanDraft(
  currentDraft: ProductionJobPlanDraft | null,
  closed: ProductionClosedJobPlanDraft,
  currentJobs: readonly ProductionJob[],
): ProductionJobPlanDraftRecovery {
  if (currentDraft) return { ok: false, reason: 'already_editing' }
  if (!closed
    || !validDraft(closed.draft)
    || !validDraft(closed.openedDraft)
    || !productionJobPlanDraftChanged(closed.draft, closed.openedDraft)
    || closed.draft.jobId !== closed.source?.jobId
    || closed.openedDraft.jobId !== closed.source?.jobId
    || !Array.isArray(currentJobs)) return { ok: false, reason: 'invalid_recovery' }
  const job = currentJobs.find((candidate) => candidate.id === closed.source.jobId)
  if (!job || job.closure || job.output + (job.scrap ?? 0) >= job.target) return { ok: false, reason: 'job_inactive' }
  const currentSource = planSource(job)
  if (!currentSource || !sourceEqual(currentSource, closed.source)) return { ok: false, reason: 'job_changed' }
  return { ok: true, draft: { ...closed.draft } }
}

export const PLANT_CLOSED_PLAN_REVISION_DRAFT_CONTRACT = 'supermega.plant.closed_plan_revision_draft.v1' as const

export type PlantPlanRevisionDraft = Readonly<{
  jobId: string
  outputBatchId: string
  effectiveFrom: string
  effectiveUntil: string
  revisionReason: string
  materialId: string
  materialName: string
  materialUnit: PlantOrderMaterial['unit']
  quantityPerUnit: string
  standardCostPerUnitMmk: string
  shopSku: string
  materialQuantityPerStockUnit: string
  additionalMaterials: string
  workCentreId: string
  workCentreName: string
  minutesPerUnit: string
  standardCostPerMinuteMmk: string
  additionalOperations: string
}>

export type PlantPlanRevisionOpening = Readonly<{
  draft: PlantPlanRevisionDraft
  sourceDigest: string
}>

export type PlantClosedPlanRevisionDraft = Readonly<{
  contract: typeof PLANT_CLOSED_PLAN_REVISION_DRAFT_CONTRACT
  draft: PlantPlanRevisionDraft
  openedDraft: PlantPlanRevisionDraft
  sourceDigest: string
}>

export type PlantPlanRevisionDraftRecovery =
  | Readonly<{ ok: true; draft: PlantPlanRevisionDraft; opening: PlantPlanRevisionOpening }>
  | Readonly<{ ok: false; reason: 'already_editing' | 'invalid_recovery' | 'revision_unavailable' | 'source_changed' }>

const plantMaterialUnits = new Set<PlantOrderMaterial['unit']>(['pcs', 'kg', 'g', 'l', 'ml', 'pack', 'bag', 'roll', 'sheet', 'm', 'cm'])
const plantIndustryPacks = new Set<PlantIndustryPackId>(['general-manufacturing', 'batch-process', 'food-beverage', 'apparel', 'assembly'])
const revisionDraftKeys = [
  'jobId', 'outputBatchId', 'effectiveFrom', 'effectiveUntil', 'revisionReason', 'materialId',
  'materialName', 'materialUnit', 'quantityPerUnit', 'standardCostPerUnitMmk', 'shopSku',
  'materialQuantityPerStockUnit', 'additionalMaterials', 'workCentreId', 'workCentreName',
  'minutesPerUnit', 'standardCostPerMinuteMmk', 'additionalOperations',
] as const satisfies readonly (keyof PlantPlanRevisionDraft)[]
const revisionDraftLimits = [80, 80, 64, 64, 300, 80, 180, 8, 64, 64, 80, 64, 16_000, 80, 180, 64, 64, 16_000] as const

function exactKeys(value: object, keys: readonly string[]) {
  const actual = Object.keys(value)
  return actual.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}

function validPlantPlanRevisionDraft(value: unknown): value is PlantPlanRevisionDraft {
  if (!value || typeof value !== 'object' || !exactKeys(value, revisionDraftKeys)) return false
  const draft = value as PlantPlanRevisionDraft
  return revisionDraftKeys.every((key, index) => typeof draft[key] === 'string' && draft[key].length <= revisionDraftLimits[index])
    && draft.jobId.length > 0
    && plantMaterialUnits.has(draft.materialUnit)
}

function validPlantPlanRevisionOpening(value: unknown): value is PlantPlanRevisionOpening {
  if (!value || typeof value !== 'object' || !exactKeys(value, ['draft', 'sourceDigest'])) return false
  const opening = value as PlantPlanRevisionOpening
  return validPlantPlanRevisionDraft(opening.draft)
    && typeof opening.sourceDigest === 'string'
    && opening.sourceDigest.length <= 96
}

function validClosedPlantPlanRevisionDraft(value: unknown): value is PlantClosedPlanRevisionDraft {
  if (!value || typeof value !== 'object' || !exactKeys(value, ['contract', 'draft', 'openedDraft', 'sourceDigest'])) return false
  const closed = value as PlantClosedPlanRevisionDraft
  return closed.contract === PLANT_CLOSED_PLAN_REVISION_DRAFT_CONTRACT
    && validPlantPlanRevisionDraft(closed.draft)
    && validPlantPlanRevisionDraft(closed.openedDraft)
    && closed.draft.jobId === closed.openedDraft.jobId
    && typeof closed.sourceDigest === 'string'
    && closed.sourceDigest.length <= 96
}

function plantPlanRevisionSource(
  state: PlantOrderState,
  plan: PlantOrderPlan,
  job: ProductionJob,
  scope: string,
  industryPackId: PlantIndustryPackId,
  revisionReady: boolean,
): string | null {
  if (!revisionReady
    || !state
    || !Number.isSafeInteger(state.revision)
    || state.revision < 1
    || typeof state.headDigest !== 'string'
    || plan?.contract !== PLANT_ORDER_EFFECTIVE_PLAN_CONTRACT
    || !job
    || job.closure
    || job.qualityHold
    || !Number.isSafeInteger(job.target)
    || !Number.isSafeInteger(job.output)
    || !Number.isSafeInteger(job.scrap ?? 0)
    || job.output + (job.scrap ?? 0) >= job.target
    || plan.job.jobId !== job.id
    || typeof scope !== 'string'
    || !scope
    || !plantIndustryPacks.has(industryPackId)) return null
  const jobSourceDigest = productionJobPlanSourceDigest(scope, job)
  if (plan.sourceDigest !== jobSourceDigest) return null
  return plantOrderEvidenceDigest({ state, plan, jobSourceDigest, scope, industryPackId })
}

export function plantPlanRevisionDraftChanged(left: PlantPlanRevisionDraft, right: PlantPlanRevisionDraft) {
  return revisionDraftKeys.some((key) => left[key] !== right[key])
}

export function createPlantPlanRevisionOpening(
  draft: PlantPlanRevisionDraft,
  state: PlantOrderState,
  plan: PlantOrderPlan,
  job: ProductionJob,
  scope: string,
  industryPackId: PlantIndustryPackId,
  revisionReady: boolean,
): PlantPlanRevisionOpening | null {
  const sourceDigest = plantPlanRevisionSource(state, plan, job, scope, industryPackId, revisionReady)
  if (!validPlantPlanRevisionDraft(draft) || !sourceDigest || draft.jobId !== job.id) return null
  return { draft: { ...draft }, sourceDigest }
}

export function closePlantPlanRevisionDraft(
  draft: PlantPlanRevisionDraft,
  opening: PlantPlanRevisionOpening | null,
): PlantClosedPlanRevisionDraft | null {
  if (!validPlantPlanRevisionDraft(draft)
    || !validPlantPlanRevisionOpening(opening)
    || !plantPlanRevisionDraftChanged(draft, opening.draft)) return null
  return {
    contract: PLANT_CLOSED_PLAN_REVISION_DRAFT_CONTRACT,
    draft: { ...draft },
    openedDraft: { ...opening.draft },
    sourceDigest: opening.sourceDigest,
  }
}

export function recoverPlantPlanRevisionDraft(
  currentDraft: PlantPlanRevisionDraft | null,
  closed: PlantClosedPlanRevisionDraft,
  state: PlantOrderState,
  plan: PlantOrderPlan,
  job: ProductionJob,
  scope: string,
  industryPackId: PlantIndustryPackId,
  revisionReady: boolean,
): PlantPlanRevisionDraftRecovery {
  if (currentDraft) return { ok: false, reason: 'already_editing' }
  if (!validClosedPlantPlanRevisionDraft(closed)
    || !plantPlanRevisionDraftChanged(closed.draft, closed.openedDraft)) return { ok: false, reason: 'invalid_recovery' }
  const sourceDigest = plantPlanRevisionSource(state, plan, job, scope, industryPackId, revisionReady)
  if (!sourceDigest) return { ok: false, reason: 'revision_unavailable' }
  if (sourceDigest !== closed.sourceDigest) return { ok: false, reason: 'source_changed' }
  const draft = { ...closed.draft }
  return {
    ok: true,
    draft,
    opening: { draft: { ...draft }, sourceDigest },
  }
}
