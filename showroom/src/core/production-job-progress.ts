import { projectPlantOrder, type PlantOrderProjection, type PlantOrderState } from './plant-order-foundation.ts'
import { productionJobPlanSourceDigest, type ProductionJob } from './production-workspace.ts'

export type ProductionJobProgress = Readonly<{
  authority: 'workspace' | 'controlled_order'
  controlledStatus: PlantOrderProjection['status'] | null
  controlledStatusLabel: string
  bindingCurrent: boolean
  acceptedQuantity: number
  scrapQuantity: number
  rejectedQuantity: number
  awaitingInspectionQuantity: number
  progressedQuantity: number
  remainingQuantity: number
  complete: boolean
}>

const controlledStatusLabels: Record<PlantOrderProjection['status'], string> = {
  unplanned: 'Batch setup required',
  planned: 'Batch planned',
  shortfall: 'Supply shortfall',
  ready: 'Ready to release',
  released: 'Released to production',
  in_process: 'In production',
  inspection_due: 'Inspection due',
  quality_hold: 'Quality hold',
  ready_to_release: 'Ready for batch release',
  released_to_stock: 'Released to stock',
}

function workspaceProgress(job: ProductionJob): ProductionJobProgress {
  const scrapQuantity = job.scrap ?? 0
  const progressedQuantity = Math.min(job.target, job.output + scrapQuantity)
  return {
    authority: 'workspace',
    controlledStatus: null,
    controlledStatusLabel: '',
    bindingCurrent: true,
    acceptedQuantity: job.output,
    scrapQuantity,
    rejectedQuantity: 0,
    awaitingInspectionQuantity: 0,
    progressedQuantity,
    remainingQuantity: Math.max(0, job.target - progressedQuantity),
    complete: Boolean(job.closure) || progressedQuantity >= job.target,
  }
}

export function projectProductionJobProgress(
  job: ProductionJob,
  controlledExecution: PlantOrderState | null,
  plantOrderScope: string,
): ProductionJobProgress {
  const legacy = workspaceProgress(job)
  if (!controlledExecution) return legacy

  const projection = projectPlantOrder(controlledExecution)
  const plan = projection.plan
  if (!plan || plan.job.jobId !== job.id || plan.job.product !== job.product) return legacy

  const bindingCurrent = productionJobPlanSourceDigest(plantOrderScope, job) === plan.sourceDigest
  const inspectionCurrent = Boolean(projection.latestInspection
    && projection.latestInspection.inspectedQuantity === projection.totalOutput)
  const controlledAccepted = inspectionCurrent ? projection.latestInspection?.acceptedQuantity ?? 0 : 0
  const controlledRejected = inspectionCurrent ? projection.latestInspection?.rejectedQuantity ?? 0 : 0
  const awaitingInspectionQuantity = Math.max(0, projection.totalOutput - controlledAccepted - controlledRejected)
  const progressedQuantity = bindingCurrent
    ? Math.min(job.target, legacy.progressedQuantity + projection.totalOutput)
    : legacy.progressedQuantity

  return {
    authority: 'controlled_order',
    controlledStatus: projection.status,
    controlledStatusLabel: bindingCurrent ? controlledStatusLabels[projection.status] : 'Batch plan needs reconciliation',
    bindingCurrent,
    acceptedQuantity: bindingCurrent ? job.output + controlledAccepted : job.output,
    scrapQuantity: legacy.scrapQuantity,
    rejectedQuantity: bindingCurrent ? controlledRejected : 0,
    awaitingInspectionQuantity: bindingCurrent ? awaitingInspectionQuantity : 0,
    progressedQuantity,
    remainingQuantity: Math.max(0, job.target - progressedQuantity),
    complete: Boolean(job.closure)
      || (bindingCurrent && projection.status === 'released_to_stock' && progressedQuantity >= job.target),
  }
}
