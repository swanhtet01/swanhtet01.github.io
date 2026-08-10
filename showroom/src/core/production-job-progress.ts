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

export type ControlledProductionEvidence = Readonly<{
  orderCount: number
  bindingCurrentCount: number
  releasedOrderCount: number
  activeOrderCount: number
  outputQuantity: number
  acceptedQuantity: number
  rejectedQuantity: number
  awaitingInspectionQuantity: number
  materialTraceCount: number
  readyForControlledCompletion: boolean
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

function safeTotal(current: number, next: number, label: string) {
  const total = current + next
  if (!Number.isSafeInteger(total) || total < 0) throw new Error(`Controlled production ${label} exceeds the safe total.`)
  return total
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

export function projectControlledProductionEvidence(
  jobs: readonly ProductionJob[],
  controlledOrders: readonly Readonly<{ jobId: string; execution: PlantOrderState }>[],
  plantOrderScope: string,
): ControlledProductionEvidence {
  const jobsById = new Map(jobs.map((job) => [job.id, job]))
  let bindingCurrentCount = 0
  let releasedOrderCount = 0
  let outputQuantity = 0
  let acceptedQuantity = 0
  let rejectedQuantity = 0
  let awaitingInspectionQuantity = 0
  let materialTraceCount = 0

  for (const order of controlledOrders) {
    const job = jobsById.get(order.jobId)
    if (!job) continue
    const progress = projectProductionJobProgress(job, order.execution, plantOrderScope)
    if (progress.authority !== 'controlled_order' || !progress.bindingCurrent) continue
    const projection = projectPlantOrder(order.execution)
    bindingCurrentCount += 1
    outputQuantity = safeTotal(outputQuantity, projection.totalOutput, 'output')
    acceptedQuantity = safeTotal(acceptedQuantity, projection.metrics.acceptedQuantity, 'accepted output')
    rejectedQuantity = safeTotal(rejectedQuantity, progress.rejectedQuantity, 'rejected output')
    awaitingInspectionQuantity = safeTotal(awaitingInspectionQuantity, progress.awaitingInspectionQuantity, 'awaiting-inspection output')
    materialTraceCount = safeTotal(materialTraceCount, projection.genealogy.length, 'material trace')
    if (projection.status === 'released_to_stock') releasedOrderCount += 1
  }

  const orderCount = controlledOrders.length
  return {
    orderCount,
    bindingCurrentCount,
    releasedOrderCount,
    activeOrderCount: orderCount - releasedOrderCount,
    outputQuantity,
    acceptedQuantity,
    rejectedQuantity,
    awaitingInspectionQuantity,
    materialTraceCount,
    readyForControlledCompletion: orderCount > 0
      && bindingCurrentCount === orderCount
      && releasedOrderCount === orderCount,
  }
}
