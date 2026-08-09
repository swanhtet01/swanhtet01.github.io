import { plantOrderEvidenceDigest, type PlantOrderPlan, type PlantOrderState } from './plant-order-foundation.ts'
import { productionJobPlanSourceDigest, type ProductionJob } from './production-workspace.ts'

export const PLANT_CLOSED_AVAILABILITY_DRAFT_CONTRACT = 'supermega.plant.closed_availability_draft.v1' as const

export type PlantAvailabilityDraft = Readonly<{
  materials: Readonly<Record<string, Readonly<{ inputLotId: string; availableQuantity: string }>>>
  workCentres: Readonly<Record<string, string>>
}>

export type PlantAvailabilityOpening = Readonly<{ draft: PlantAvailabilityDraft; orderJobId: string; sourceDigest: string }>
export type PlantClosedAvailabilityDraft = Readonly<{
  contract: typeof PLANT_CLOSED_AVAILABILITY_DRAFT_CONTRACT
  draft: PlantAvailabilityDraft
  openedDraft: PlantAvailabilityDraft
  orderJobId: string
  sourceDigest: string
}>
export type PlantAvailabilityDraftRecovery =
  | Readonly<{ ok: true; draft: PlantAvailabilityDraft; opening: PlantAvailabilityOpening }>
  | Readonly<{ ok: false; reason: 'already_editing' | 'invalid_recovery' | 'availability_unavailable' | 'source_changed' }>

function exactKeys(value: object, keys: readonly string[]) {
  const actual = Object.keys(value)
  return actual.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}

function clone(draft: PlantAvailabilityDraft): PlantAvailabilityDraft {
  return {
    materials: Object.fromEntries(Object.entries(draft.materials).map(([id, row]) => [id, { ...row }])),
    workCentres: { ...draft.workCentres },
  }
}

function validDraft(value: unknown): value is PlantAvailabilityDraft {
  if (!value || typeof value !== 'object' || !exactKeys(value, ['materials', 'workCentres'])) return false
  const draft = value as PlantAvailabilityDraft
  const materials = draft.materials && typeof draft.materials === 'object' && !Array.isArray(draft.materials) ? Object.entries(draft.materials) : []
  const centres = draft.workCentres && typeof draft.workCentres === 'object' && !Array.isArray(draft.workCentres) ? Object.entries(draft.workCentres) : []
  return materials.length > 0 && materials.length <= 12 && centres.length > 0 && centres.length <= 12
    && materials.every(([id, row]) => id.length > 0 && id.length <= 80 && row && typeof row === 'object'
      && exactKeys(row, ['inputLotId', 'availableQuantity']) && typeof row.inputLotId === 'string' && row.inputLotId.length <= 80
      && typeof row.availableQuantity === 'string' && row.availableQuantity.length <= 64)
    && centres.every(([id, minutes]) => id.length > 0 && id.length <= 80 && typeof minutes === 'string' && minutes.length <= 32)
}

function sameIds(actual: readonly string[], expected: readonly string[]) {
  return actual.length === expected.length && [...actual].sort().join('\n') === [...expected].sort().join('\n')
}

export function plantAvailabilityDraftChanged(left: PlantAvailabilityDraft, right: PlantAvailabilityDraft) {
  return !validDraft(left) || !validDraft(right) || plantOrderEvidenceDigest(left) !== plantOrderEvidenceDigest(right)
}

function sourceDigest(state: PlantOrderState, plan: PlantOrderPlan, job: ProductionJob, scope: string, ready: boolean) {
  if (!ready || !state || !Number.isSafeInteger(state.revision) || state.revision < 1 || typeof state.headDigest !== 'string'
    || !plan || plan.job.jobId !== job?.id || job.closure || job.qualityHold || !Number.isSafeInteger(job.target)
    || !Number.isSafeInteger(job.output) || !Number.isSafeInteger(job.scrap ?? 0) || job.output + (job.scrap ?? 0) >= job.target
    || typeof scope !== 'string' || !scope) return null
  const jobSourceDigest = productionJobPlanSourceDigest(scope, job)
  return plan.sourceDigest === jobSourceDigest
    ? plantOrderEvidenceDigest({ contract: PLANT_CLOSED_AVAILABILITY_DRAFT_CONTRACT, state, plan, jobSourceDigest, scope })
    : null
}

export function createPlantAvailabilityOpening(draft: PlantAvailabilityDraft, state: PlantOrderState, plan: PlantOrderPlan, job: ProductionJob, scope: string, ready: boolean): PlantAvailabilityOpening | null {
  const digest = sourceDigest(state, plan, job, scope, ready)
  if (!validDraft(draft) || !sameIds(Object.keys(draft.materials), plan.materials.map((row) => row.materialId))
    || !sameIds(Object.keys(draft.workCentres), plan.workCentres.map((row) => row.workCentreId)) || !digest) return null
  return { draft: clone(draft), orderJobId: job.id, sourceDigest: digest }
}

export function closePlantAvailabilityDraft(draft: PlantAvailabilityDraft, opening: PlantAvailabilityOpening | null): PlantClosedAvailabilityDraft | null {
  if (!validDraft(draft) || !opening || !validDraft(opening.draft) || !opening.orderJobId || !opening.sourceDigest
    || !plantAvailabilityDraftChanged(draft, opening.draft)) return null
  return { contract: PLANT_CLOSED_AVAILABILITY_DRAFT_CONTRACT, draft: clone(draft), openedDraft: clone(opening.draft), orderJobId: opening.orderJobId, sourceDigest: opening.sourceDigest }
}

export function recoverPlantAvailabilityDraft(currentDraft: PlantAvailabilityDraft | null, closed: PlantClosedAvailabilityDraft, state: PlantOrderState, plan: PlantOrderPlan, job: ProductionJob, scope: string, ready: boolean): PlantAvailabilityDraftRecovery {
  if (currentDraft) return { ok: false, reason: 'already_editing' }
  if (!closed || closed.contract !== PLANT_CLOSED_AVAILABILITY_DRAFT_CONTRACT || !validDraft(closed.draft) || !validDraft(closed.openedDraft)
    || !plantAvailabilityDraftChanged(closed.draft, closed.openedDraft) || closed.orderJobId !== job?.id || !closed.sourceDigest) {
    return { ok: false, reason: 'invalid_recovery' }
  }
  const digest = sourceDigest(state, plan, job, scope, ready)
  if (!digest) return { ok: false, reason: 'availability_unavailable' }
  if (digest !== closed.sourceDigest) return { ok: false, reason: 'source_changed' }
  const draft = clone(closed.draft)
  return { ok: true, draft, opening: { draft: clone(draft), orderJobId: job.id, sourceDigest: digest } }
}
