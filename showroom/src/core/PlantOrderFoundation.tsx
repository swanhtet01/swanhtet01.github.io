import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'

import {
  PLANT_ORDER_ADDITIONAL_MATERIAL_MAX,
  PLANT_ORDER_ADDITIONAL_OPERATION_MAX,
  PLANT_ORDER_CONTROLLED_PLAN_CONTRACT,
  PLANT_ORDER_EFFECTIVE_PLAN_CONTRACT,
  PLANT_ORDER_EXECUTION_PLAN_CONTRACT,
  PLANT_ORDER_PLAN_REVISION_MAX,
  applyPlantOrderPlan,
  approvePlantOrderMaterialSubstitution,
  buildPlantOrderCostReviewPacket,
  buildPlantOrderEffectivePlan,
  checkPlantOrderAvailability,
  createEmptyPlantOrderState,
  inspectPlantOrderOutput,
  issuePlantOrderMaterial,
  issuePlantOrderSubstituteMaterial,
  loadPlantOrderWorkspace,
  parsePlantOrderDowntimePaste,
  parsePlantOrderMaterialPaste,
  parsePlantOrderMmkRate,
  parsePlantOrderQuantityMilli,
  parsePlantOrderRoutingPaste,
  plantOrderEvidenceDigest,
  projectPlantOrder,
  projectPlantOrderCostDrivers,
  projectPlantOrderFinancialCost,
  projectPlantOrderEffectiveness,
  recordPlantOrderCalibration,
  recordPlantOrderEffectiveness,
  recordPlantOrderOperation,
  recordPlantOrderOutput,
  recordPlantOrderQualityRework,
  releasePlantOrder,
  releasePlantOrderBatch,
  supersedePlantOrderPlan,
  validatePlantOrderState,
  type PlantOrderProof,
  type PlantOrderMaterial,
  type PlantOrderPlan,
  type PlantOrderState,
  type PlantOrderTransition,
  type PlantOrderTransitionResult,
} from './plant-order-foundation'
import type { CommerceState } from './commerce-workspace'
import { pendingProductionMaterialHandoffs, projectProductionMaterialRequirements, projectProductionPortfolioMrp } from './production-material-handoff'
import { validateProductionState, type ProductionJob, type ProductionState } from './production-workspace'
import {
  productionOrderExecutionForJob,
  productionOrderPortfolioEntries,
  upsertProductionOrderExecution,
} from './production-order-portfolio'
import { plantIndustryPack, plantIndustryPackSetup, type PlantIndustryPackId } from './plant-industry-packs'


type PlantOrderFoundationProps = {
  actor: string
  commerceState: CommerceState
  disabled: boolean
  jobs: ProductionJob[]
  industryPackId: PlantIndustryPackId
  productionState: ProductionState
  onProductionCommand: (
    eventType: 'production.order_execution.recorded',
    commandId: string,
    proof: PlantOrderProof,
    transition: (state: ProductionState) => ProductionState | null,
  ) => Promise<void>
  scope: string
}

type ReviewedTransition = {
  commandId: string
  title: string
  summary: string
  details?: Array<{ label: string; value: string }>
  boundary: string
  proof: PlantOrderProof
  apply: PlantOrderTransition
}

type SetupDraft = {
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
}

type AvailabilityDraft = {
  materials: Record<string, { inputLotId: string; availableQuantity: string }>
  workCentres: Record<string, string>
}

type OperationDraft = { operationId: string; quantity: string; actualMinutes: string }
type EffectivenessDraft = {
  windowStart: string
  windowEnd: string
  workCentres: Record<string, string>
  downtimeIntervals: string
}
type CalibrationDraft = { workCentreId: string; certificateId: string; calibratedAt: string; validUntil: string; standardReference: string }
type ReworkDraft = { operationId: string; actualMinutes: string; owner: string; cause: string; correctiveAction: string }
type SubstitutionDraft = {
  substituteMaterialId: string
  substituteName: string
  substituteUnit: PlantOrderMaterial['unit']
  substituteQuantityPerUnit: string
  sourceReference: string
  technicalBasis: string
  inputLotId: string
}

const setupMaterialUnits: PlantOrderMaterial['unit'][] = ['pcs', 'kg', 'g', 'l', 'ml', 'pack', 'bag', 'roll', 'sheet', 'm', 'cm']

function commandId(prefix: string) {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().toUpperCase()
    : `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
  return `${prefix}-${random}`
}

function managedCommandId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : ''
}

function proof(actor: string, label: string): PlantOrderProof {
  const actionId = commandId('ACT')
  return {
    actionId,
    capturedAt: new Date().toISOString(),
    actor: actor.trim() || 'Local Plant supervisor',
    reason: `Review and record ${label}.`,
    evidenceReference: `PLANT-EXECUTION:${actionId}`,
  }
}

function jobSnapshot(scope: string, job: ProductionJob) {
  return {
    scope,
    job: {
      id: job.id,
      product: job.product,
      target: job.target,
      output: job.output,
      scrap: job.scrap ?? 0,
      qualityHoldActionId: job.qualityHold?.actionId ?? null,
      closureActionId: job.closure?.actionId ?? null,
    },
  }
}

function remaining(job: ProductionJob) {
  return job.target - job.output - (job.scrap ?? 0)
}

function formatMilli(value: number) {
  return (value / 1_000).toLocaleString(undefined, { maximumFractionDigits: 3 })
}

function formatBasisPoints(value: number) {
  return `${(value / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`
}

function formatMmk(value: number) {
  return `${value.toLocaleString()} MMK`
}

function explicitOffsetTimestamp(value: string, field: string) {
  if (!value) throw new Error(`Enter ${field}.`)
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) throw new Error(`Enter a valid ${field}.`)
  return parsed.toISOString()
}

function localDateTimeInput(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000
  return new Date(value.getTime() - offset).toISOString().slice(0, 16)
}

function calibrationDefaults(workCentreId = 'WC-CONTROL-01', baseTime = Date.now()): CalibrationDraft {
  const now = new Date(baseTime); const validUntil = new Date(now)
  validUntil.setFullYear(validUntil.getFullYear() + 1)
  return {
    workCentreId,
    certificateId: `CERT-${workCentreId.replace(/^WC-/, '')}-001`,
    calibratedAt: localDateTimeInput(now),
    validUntil: localDateTimeInput(validUntil),
    standardReference: 'Manufacturer procedure and approved reference standard',
  }
}

function milliInputValue(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('The required quantity exceeds the supported range.')
  const whole = Math.floor(value / 1_000)
  const fraction = String(value % 1_000).padStart(3, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : String(whole)
}

function defaultSetup(job: ProductionJob | undefined, industryPackId: PlantIndustryPackId): SetupDraft {
  const now = new Date(); const minimumUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000)
  const dueAt = job?.dueAt ? new Date(job.dueAt) : null
  const effectiveUntil = dueAt && Number.isFinite(dueAt.getTime()) && dueAt > now ? dueAt : minimumUntil
  return { ...plantIndustryPackSetup(industryPackId, job), effectiveFrom: localDateTimeInput(now), effectiveUntil: localDateTimeInput(effectiveUntil), revisionReason: '' }
}

function revisionSetup(plan: PlantOrderPlan, job: ProductionJob | undefined, industryPackId: PlantIndustryPackId): SetupDraft {
  const defaults = defaultSetup(job, industryPackId)
  const primaryMaterial = plan.materials[0]; const primaryOperation = plan.routing[0]
  const centreNames = new Map(plan.workCentres.map((centre) => [centre.workCentreId, centre.name]))
  return {
    ...defaults,
    outputBatchId: plan.job.outputBatchId,
    materialId: primaryMaterial.materialId,
    materialName: primaryMaterial.name,
    materialUnit: primaryMaterial.unit,
    quantityPerUnit: milliInputValue(primaryMaterial.quantityPerUnitMilli),
    standardCostPerUnitMmk: primaryMaterial.standardCostPerUnitMmk ? String(primaryMaterial.standardCostPerUnitMmk) : '',
    shopSku: primaryMaterial.shopSupply?.sku ?? '',
    materialQuantityPerStockUnit: primaryMaterial.shopSupply ? milliInputValue(primaryMaterial.shopSupply.materialQuantityMilliPerStockUnit) : '',
    additionalMaterials: plan.materials.slice(1).map((material) => `${material.materialId} | ${material.name} | ${material.unit} | ${milliInputValue(material.quantityPerUnitMilli)} | ${material.standardCostPerUnitMmk ?? ''}${material.shopSupply ? ` | ${material.shopSupply.sku} | ${milliInputValue(material.shopSupply.materialQuantityMilliPerStockUnit)}` : ''}`).join('\n'),
    workCentreId: primaryOperation.workCentreId,
    workCentreName: centreNames.get(primaryOperation.workCentreId) ?? primaryOperation.workCentreId,
    minutesPerUnit: milliInputValue(primaryOperation.minutesPerUnitMilli),
    standardCostPerMinuteMmk: primaryOperation.standardCostPerMinuteMmk ? String(primaryOperation.standardCostPerMinuteMmk) : '',
    additionalOperations: plan.routing.slice(1).map((operation) => `${operation.operationId} | ${operation.name} | ${operation.workCentreId} | ${centreNames.get(operation.workCentreId) ?? operation.workCentreId} | ${milliInputValue(operation.minutesPerUnitMilli)} | ${operation.standardCostPerMinuteMmk ?? ''}`).join('\n'),
  }
}

function availabilityDefaultsForPlan(plan: PlantOrderPlan): AvailabilityDraft {
  const requiredMinutes = new Map(plan.workCentres.map((centre) => [centre.workCentreId, 0]))
  plan.routing.forEach((operation) => {
    const next = (requiredMinutes.get(operation.workCentreId) ?? 0) + operation.minutesPerUnitMilli * plan.job.targetQuantity
    if (!Number.isSafeInteger(next)) throw new Error(`The required capacity for ${operation.workCentreId} exceeds the supported range.`)
    requiredMinutes.set(operation.workCentreId, next)
  })
  return {
    materials: Object.fromEntries(plan.materials.map((material) => [material.materialId, {
      inputLotId: `LOT-${material.materialId.replace(/^MAT-/, '')}`,
      availableQuantity: milliInputValue(material.quantityPerUnitMilli * plan.job.targetQuantity),
    }])),
    workCentres: Object.fromEntries(plan.workCentres.map((centre) => [
      centre.workCentreId,
      String(Math.ceil((requiredMinutes.get(centre.workCentreId) ?? 0) / 1_000)),
    ])),
  }
}

function availabilityDefaults(state: PlantOrderState) {
  const plan = projectPlantOrder(state).plan
  return plan ? availabilityDefaultsForPlan(plan) : { materials: {}, workCentres: {} }
}

function loadState(scope: string) {
  if (typeof localStorage === 'undefined') return { state: createEmptyPlantOrderState(), error: '' }
  const snapshot = loadPlantOrderWorkspace(localStorage, scope)
  if (scope === 'plant:local-sample' && snapshot.source === 'empty') {
    const legacySnapshot = loadPlantOrderWorkspace(localStorage, 'plant:')
    if (legacySnapshot.source === 'current') return { state: legacySnapshot.state, error: '' }
  }
  return { state: snapshot.state, error: snapshot.error }
}

function loadManagedState(value: PlantOrderState | null) {
  try {
    return { state: validatePlantOrderState(value ?? createEmptyPlantOrderState()), error: '' }
  } catch (error) {
    return { state: createEmptyPlantOrderState(), error: error instanceof Error ? error.message : 'Managed Plant execution could not be validated.' }
  }
}

const statusCopy = {
  unplanned: 'Set up execution',
  planned: 'Check availability',
  shortfall: 'Resolve shortfall',
  ready: 'Release order',
  released: 'Issue material',
  in_process: 'Continue execution',
  inspection_due: 'Inspect batch',
  quality_hold: 'Quality hold',
  ready_to_release: 'Release batch',
  released_to_stock: 'Batch released',
} as const

export function PlantOrderFoundation({ actor, commerceState, disabled, industryPackId, jobs, productionState, onProductionCommand, scope }: PlantOrderFoundationProps) {
  const activeJobs = jobs.filter((job) => !job.closure && !job.qualityHold && remaining(job) > 0)
  const portfolioEntries = useMemo(() => productionOrderPortfolioEntries(productionState), [productionState])
  const [initial] = useState(() => portfolioEntries[0]
    ? loadManagedState(portfolioEntries[0].execution)
    : loadState(scope))
  const [state, setState] = useState<PlantOrderState>(initial.state)
  const [selectedOrderJobId, setSelectedOrderJobId] = useState(() => projectPlantOrder(initial.state).plan?.job.jobId ?? activeJobs[0]?.id ?? '')
  const [error, setError] = useState(initial.error)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [evaluationTime, setEvaluationTime] = useState(() => Date.now())
  const [setupOpen, setSetupOpen] = useState(false)
  const industryPack = plantIndustryPack(industryPackId)
  const [setupDraft, setSetupDraft] = useState(() => defaultSetup(activeJobs[0], industryPackId))
  const [availabilityDraft, setAvailabilityDraft] = useState(() => availabilityDefaults(initial.state))
  const [operationDraft, setOperationDraft] = useState<OperationDraft>({ operationId: '', quantity: '', actualMinutes: '' })
  const [effectivenessDraft, setEffectivenessDraft] = useState<EffectivenessDraft>({ windowStart: '', windowEnd: '', workCentres: {}, downtimeIntervals: '' })
  const [calibrationDraft, setCalibrationDraft] = useState<CalibrationDraft>(() => calibrationDefaults())
  const [reworkDraft, setReworkDraft] = useState<ReworkDraft>({ operationId: '', actualMinutes: '', owner: '', cause: '', correctiveAction: '' })
  const [substitutionDraft, setSubstitutionDraft] = useState<SubstitutionDraft>({ substituteMaterialId: '', substituteName: '', substituteUnit: 'kg', substituteQuantityPerUnit: '', sourceReference: '', technicalBasis: '', inputLotId: '' })
  const [inspectionDraft, setInspectionDraft] = useState({ result: 'pass' as 'pass' | 'fail', rejected: '0' })
  const [review, setReview] = useState<ReviewedTransition | null>(null)
  const setupDialogRef = useRef<HTMLDialogElement>(null)
  const setupTriggerRef = useRef<HTMLButtonElement>(null)
  const reviewDialogRef = useRef<HTMLDialogElement>(null)
  const projection = useMemo(() => projectPlantOrder(state), [state])
  const effectiveness = useMemo(() => projectPlantOrderEffectiveness(projection), [projection])
  const costDrivers = useMemo(() => projectPlantOrderCostDrivers(projection), [projection])
  const financialCost = useMemo(() => projectPlantOrderFinancialCost(projection), [projection])
  const costReviewPacket = useMemo(() => buildPlantOrderCostReviewPacket(state), [state])
  const materialRequirements = useMemo(() => projectProductionMaterialRequirements(state, commerceState), [commerceState, state])
  const portfolioMrp = useMemo(() => projectProductionPortfolioMrp(portfolioEntries.map((entry) => {
    const job = jobs.find((candidate) => candidate.id === entry.jobId)
    const plan = projectPlantOrder(entry.execution).plan
    return {
      execution: entry.execution,
      priority: job?.priority ?? 'normal',
      dueAt: job?.dueAt ?? plan?.effectiveUntil ?? '9999-12-31T23:59:59.999Z',
    }
  }), commerceState), [commerceState, jobs, portfolioEntries])
  const selectedPortfolioOrder = portfolioMrp?.orders.find((order) => order.jobId === selectedOrderJobId)
  const costReviewDownload = useMemo(() => costReviewPacket ? {
    filename: `${costReviewPacket.plan.job.jobId.toLowerCase()}-cost-review.json`,
    href: `data:application/json;charset=utf-8,${encodeURIComponent(`${JSON.stringify(costReviewPacket, null, 2)}\n`)}`,
  } : null, [costReviewPacket])
  const materialRequirementsDownload = useMemo(() => materialRequirements ? {
    filename: `${materialRequirements.job.jobId.toLowerCase()}-material-requirements.json`,
    href: `data:application/json;charset=utf-8,${encodeURIComponent(`${JSON.stringify(materialRequirements, null, 2)}\n`)}`,
  } : null, [materialRequirements])
  const pendingWarehouseIssues = useMemo(
    () => pendingProductionMaterialHandoffs(state, commerceState),
    [commerceState, state],
  )
  const effectivePlan = projection.plan?.contract === PLANT_ORDER_EFFECTIVE_PLAN_CONTRACT
  const controlledPlan = projection.plan?.contract === PLANT_ORDER_CONTROLLED_PLAN_CONTRACT || effectivePlan
  const releaseWindowOpen = !effectivePlan || Boolean(projection.orderRelease) || (Date.parse(projection.plan!.effectiveFrom!) <= evaluationTime && evaluationTime < Date.parse(projection.plan!.effectiveUntil!))
  const releaseWindowExpired = Boolean(effectivePlan && !projection.orderRelease && evaluationTime >= Date.parse(projection.plan!.effectiveUntil!))
  const releaseWindowStatus = !effectivePlan ? 'Legacy plan · effective dates not recorded'
    : projection.orderRelease ? `Plan frozen at release · original window ${new Date(projection.plan!.effectiveFrom!).toLocaleString()} to ${new Date(projection.plan!.effectiveUntil!).toLocaleString()}`
      : evaluationTime < Date.parse(projection.plan!.effectiveFrom!) ? `Not effective until ${new Date(projection.plan!.effectiveFrom!).toLocaleString()}`
        : evaluationTime >= Date.parse(projection.plan!.effectiveUntil!) ? `Expired ${new Date(projection.plan!.effectiveUntil!).toLocaleString()}`
          : `Effective until ${new Date(projection.plan!.effectiveUntil!).toLocaleString()}`
  const calibrationByCentre = new Map(projection.calibrations.map((calibration) => [calibration.workCentreId, calibration]))
  const calibrationDueCentre = controlledPlan && !releaseWindowExpired && projection.status !== 'released_to_stock'
    ? projection.plan?.workCentres.find((centre) => projection.routing.some((operation) => operation.workCentreId === centre.workCentreId)
      && (!calibrationByCentre.has(centre.workCentreId) || Date.parse(calibrationByCentre.get(centre.workCentreId)!.validUntil) <= evaluationTime))
    : undefined
  const activeCalibrationDraft = calibrationDueCentre && calibrationDraft.workCentreId !== calibrationDueCentre.workCentreId
    ? calibrationDefaults(calibrationDueCentre.workCentreId, evaluationTime)
    : calibrationDraft
  const currentQualityRework = projection.qualityHold ? projection.qualityReworks.find((rework) => rework.inspectionId === projection.qualityHold?.inspectionId) : undefined
  const qualityReworkRequired = Boolean(controlledPlan && projection.qualityHold && !currentQualityRework)
  const activeReworkDraft = reworkDraft.operationId
    ? reworkDraft
    : { ...reworkDraft, operationId: projection.routing.at(-1)?.operationId ?? '' }
  const selectedSetupJob = activeJobs.find((job) => job.id === setupDraft.jobId) ?? activeJobs[0]
  const boundJob = projection.plan ? jobs.find((job) => job.id === projection.plan?.job.jobId) : undefined
  const bindingCurrent = Boolean(!projection.plan || (boundJob && plantOrderEvidenceDigest(jobSnapshot(scope, boundJob)) === projection.plan.sourceDigest))
  const controlsDisabled = disabled || busy || Boolean(review) || (!bindingCurrent && projection.status !== 'released_to_stock')
  const nextMaterial = projection.materials.find((material) => material.remainingToIssueMilli > 0)
  const nextMaterialSubstitution = nextMaterial ? projection.materialSubstitutions.find((approval) => approval.materialId === nextMaterial.materialId) : undefined
  const requiresOperationEvidence = projection.plan?.contract === PLANT_ORDER_EXECUTION_PLAN_CONTRACT || controlledPlan
  const nextOperation = requiresOperationEvidence ? projection.operations.find((operation) => operation.status === 'ready' || operation.status === 'in_progress') : undefined
  const nextOperationIndex = nextOperation ? projection.operations.findIndex((operation) => operation.operationId === nextOperation.operationId) : -1
  const operationInputQuantity = nextOperationIndex < 0 ? 0 : nextOperationIndex === 0
    ? projection.metrics.targetQuantity
    : projection.operations[nextOperationIndex - 1].completedQuantity
  const operationAvailableQuantity = nextOperation ? operationInputQuantity - nextOperation.completedQuantity : 0
  const activeOperationDraft = operationDraft.operationId === nextOperation?.operationId
    ? operationDraft
    : { operationId: nextOperation?.operationId ?? '', quantity: operationAvailableQuantity > 0 ? String(operationAvailableQuantity) : '', actualMinutes: '' }
  const outputRemaining = projection.metrics.targetQuantity - projection.totalOutput
  const awaitingWarehouse = !nextMaterial && pendingWarehouseIssues.length > 0
    && Boolean(nextOperation || outputRemaining > 0)
  const visibleStatus = releaseWindowExpired ? 'Plan expired' : calibrationDueCentre ? 'Calibration required' : projection.status === 'ready' && !releaseWindowOpen ? 'Plan not effective' : awaitingWarehouse ? 'Await Shop issue' : statusCopy[projection.status]
  const inspectedQuantity = projection.totalOutput
  const rejected = /^\d+$/.test(inspectionDraft.rejected) ? Number(inspectionDraft.rejected) : Number.NaN
  const inspectionValid = Number.isSafeInteger(rejected) && rejected >= 0 && rejected <= inspectedQuantity
    && (inspectionDraft.result === 'pass' ? rejected === 0 : rejected > 0)
  const flowActiveIndex = projection.status === 'unplanned' ? 0
    : projection.status === 'planned' || projection.status === 'shortfall' ? 1
      : projection.status === 'ready' ? 2
        : projection.status === 'released' || projection.status === 'in_process' ? 3
          : projection.status === 'inspection_due' || projection.status === 'quality_hold' ? 4
            : projection.status === 'ready_to_release' ? 5 : 6
  const flowBlocked = projection.status === 'shortfall' || projection.status === 'quality_hold' || Boolean(calibrationDueCentre) || awaitingWarehouse || !bindingCurrent || releaseWindowExpired || (projection.status === 'ready' && !releaseWindowOpen)
  const flowStages = [
    { id: 'plan', label: 'Plan', detail: projection.plan ? projection.plan.job.jobId : activeJobs.length ? `${activeJobs.length} active ${activeJobs.length === 1 ? 'job' : 'jobs'}` : 'Add a job first' },
    { id: 'check', label: 'Check', detail: calibrationDueCentre ? `${calibrationDueCentre.workCentreId} calibration` : projection.latestAvailability ? projection.latestAvailability.passed ? 'Material + capacity passed' : `${projection.latestAvailability.shortfalls.length} ${projection.latestAvailability.shortfalls.length === 1 ? 'shortfall' : 'shortfalls'}` : 'Calibration + material + capacity' },
    { id: 'release', label: 'Release', detail: projection.orderRelease ? 'Effective plan frozen' : releaseWindowOpen ? 'Supervisor review' : 'Outside effective window' },
    { id: 'run', label: 'Run', detail: projection.plan ? `${projection.metrics.completedOperationCount}/${projection.operations.length} operations · ${projection.totalOutput}/${projection.metrics.targetQuantity} output` : 'Issue · make · record' },
    { id: 'inspect', label: 'Inspect', detail: projection.latestInspection ? `${projection.latestInspection.acceptedQuantity} accepted · ${projection.latestInspection.rejectedQuantity} rejected` : 'Quality decision' },
    { id: 'stock', label: 'Stock', detail: projection.batchRelease ? `${projection.metrics.acceptedQuantity} units released` : 'Human batch release' },
  ].map((stage, index) => ({
    ...stage,
    state: flowActiveIndex === 6 || index < flowActiveIndex ? 'complete' : index === flowActiveIndex ? flowBlocked ? 'blocked' : 'current' : 'upcoming',
  }))
  const flowNext = projection.status === 'unplanned'
    ? activeJobs.length ? { title: 'Set up this batch', detail: 'Choose one active job, then review its BOM and routing.' } : { title: 'Add a production job first', detail: 'A controlled batch must start from one scheduled, owned job.' }
    : releaseWindowExpired
      ? { title: 'Create a current plan revision', detail: 'Keep the expired package in history and review its accountable successor.' }
    : calibrationDueCentre
      ? { title: `Review ${calibrationDueCentre.name} calibration`, detail: 'Bind one current certificate before release or routed work continues.' }
    : qualityReworkRequired
      ? { title: 'Record accountable rework', detail: `${projection.qualityHold?.rejectedQuantity ?? 0} rejected units need cause, owner, corrective action, and actual time.` }
    : projection.status === 'planned' || projection.status === 'shortfall'
      ? { title: projection.status === 'shortfall' ? 'Resolve the availability shortfall' : 'Check material and capacity', detail: 'Record exact lots and work-centre minutes before release.' }
      : projection.status === 'ready'
        ? releaseWindowOpen ? { title: 'Release the work package', detail: 'Confirm the effective reviewed plan before any material or operation record.' } : { title: effectivePlan && evaluationTime < Date.parse(projection.plan!.effectiveFrom!) ? 'Wait for the effective window' : 'Create a current plan revision', detail: releaseWindowStatus }
        : projection.status === 'released' || projection.status === 'in_process'
          ? awaitingWarehouse ? { title: 'Issue requested material in Shop', detail: 'Shop remains the stock authority; return here after the reviewed issue.' }
            : nextMaterial ? nextMaterialSubstitution
              ? { title: `Request ${nextMaterialSubstitution.substituteName}`, detail: `Use approved substitute ${nextMaterialSubstitution.substituteMaterialId} without changing the original BOM.` }
              : { title: `Request ${nextMaterial.name}`, detail: 'Use the reviewed original lot or record one approved substitute.' }
              : nextOperation ? { title: `Record ${nextOperation.name}`, detail: 'Enter completed units and actual time for the current routing step.' }
                : { title: 'Record batch output', detail: `${outputRemaining.toLocaleString()} units remain before inspection.` }
          : projection.status === 'inspection_due'
            ? { title: 'Inspect the completed batch', detail: 'Record accepted and rejected units before release.' }
            : projection.status === 'quality_hold'
              ? { title: 'Reinspect the corrected batch', detail: 'Rework is recorded; the current output still needs a new passing inspection.' }
              : projection.status === 'ready_to_release'
                ? { title: 'Release the accepted batch', detail: 'Record the final human quality release to stock.' }
                : { title: 'Batch execution complete', detail: 'The released quantity is ready for a separate reviewed Shop receipt.' }

  const orderChoices = [...new Map([
    ...portfolioEntries.map((entry) => [entry.jobId, jobs.find((job) => job.id === entry.jobId)] as const),
    ...activeJobs.map((job) => [job.id, job] as const),
  ]).entries()].map(([id, job]) => ({ id, job, execution: productionOrderExecutionForJob(productionState, id) }))
    .sort((left, right) => {
      const rank = { urgent: 0, normal: 1, low: 2 }
      const priority = rank[left.job?.priority ?? 'normal'] - rank[right.job?.priority ?? 'normal']
      if (priority) return priority
      const leftDue = Date.parse(left.job?.dueAt ?? '')
      const rightDue = Date.parse(right.job?.dueAt ?? '')
      if (Number.isFinite(leftDue) && Number.isFinite(rightDue) && leftDue !== rightDue) return leftDue - rightDue
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
    })

  useEffect(() => {
    const dialog = setupDialogRef.current
    if (!dialog) return
    if (setupOpen && !dialog.open) {
      dialog.showModal()
      requestAnimationFrame(() => dialog.querySelector('select')?.focus())
    }
    if (!setupOpen && dialog.open) dialog.close()
  }, [setupOpen])

  useEffect(() => {
    const dialog = reviewDialogRef.current
    if (!dialog) return
    if (review && !dialog.open) {
      dialog.showModal()
      requestAnimationFrame(() => dialog.querySelector<HTMLElement>('[data-plant-review-primary]')?.focus())
    }
    if (!review && dialog.open) dialog.close()
  }, [review])

  function selectOrder(jobId: string) {
    const retained = productionOrderExecutionForJob(productionState, jobId)
    const next = retained ?? createEmptyPlantOrderState()
    setSelectedOrderJobId(jobId)
    setState(next)
    setAvailabilityDraft(availabilityDefaults(next))
    setSetupDraft(defaultSetup(activeJobs.find((job) => job.id === jobId), industryPackId))
    setReview(null)
    setSetupOpen(false)
    setError('')
    setNotice(retained ? `Loaded ${jobId}.` : `${jobId} is ready for one reviewed BOM and routing.`)
  }

  function stage(next: Omit<ReviewedTransition, 'commandId'>) {
    setError('')
    setSetupOpen(false)
    setReview({ ...next, commandId: managedCommandId() })
    setNotice('Review this one change. Nothing has been written yet.')
  }

  async function mutateManaged(reviewed: ReviewedTransition) {
    if (!reviewed.commandId) throw new Error('Plant command identity is unavailable.')
    const applied: { value: PlantOrderTransitionResult | null } = { value: null }
    await onProductionCommand(
      'production.order_execution.recorded',
      reviewed.commandId,
      reviewed.proof,
      (current) => {
        if (current.events[0] && Date.parse(reviewed.proof.capturedAt) < Date.parse(current.events[0].createdAt)) return null
        const currentExecution = validatePlantOrderState(
          productionOrderExecutionForJob(current, selectedOrderJobId)
            ?? (state.revision ? state : createEmptyPlantOrderState()),
        )
        const result = reviewed.apply(currentExecution)
        applied.value = result
        if (result.replayed) return current
        return validateProductionState(upsertProductionOrderExecution(current, result.state))
      },
    )
    if (!applied.value) throw new Error('The Plant execution transition did not run.')
    return applied.value
  }

  async function confirmReview() {
    if (!review) return
    setBusy(true); setError('')
    try {
      const accepted = await mutateManaged(review)
      setState(accepted.state); setEvaluationTime(Date.now()); setReview(null); setSetupOpen(false)
      const acceptedJobId = projectPlantOrder(accepted.state).plan?.job.jobId
      if (acceptedJobId) setSelectedOrderJobId(acceptedJobId)
      setNotice(accepted.replayed ? 'The exact command was already recorded.' : `${review.title} recorded with attributed evidence.`)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Plant execution was not confirmed.')
    } finally {
      setBusy(false)
    }
  }

  function closeSetup() {
    setSetupOpen(false)
    requestAnimationFrame(() => setupTriggerRef.current?.focus())
  }

  function openPlanRevision() {
    if (!projection.plan || projection.orderRelease || projection.plan.contract !== PLANT_ORDER_EFFECTIVE_PLAN_CONTRACT) return
    const job = activeJobs.find((candidate) => candidate.id === projection.plan?.job.jobId)
    if (!job) return setError('The bound production job is no longer active. Reconcile the job before revising its execution plan.')
    setSetupDraft(revisionSetup(projection.plan, job, industryPackId))
    setReview(null)
    setSetupOpen(true)
  }

  function editReview() {
    const editsSetup = projection.status === 'unplanned' || review?.title === 'Plan revision'
    if (reviewDialogRef.current?.open) reviewDialogRef.current.close()
    setReview(null)
    if (editsSetup) setSetupOpen(true)
  }

  function reviewSetup(event: FormEvent) {
    event.preventDefault()
    if (!selectedSetupJob) return setError('Add or choose one active Plant job first.')
    try {
      const quantityPerUnitMilli = parsePlantOrderQuantityMilli(setupDraft.quantityPerUnit); const minutesPerUnitMilli = parsePlantOrderQuantityMilli(setupDraft.minutesPerUnit)
      const standardCostPerUnitMmk = parsePlantOrderMmkRate(setupDraft.standardCostPerUnitMmk); const standardCostPerMinuteMmk = parsePlantOrderMmkRate(setupDraft.standardCostPerMinuteMmk)
      const shopSku = setupDraft.shopSku.trim(); const materialQuantityMilliPerStockUnit = parsePlantOrderQuantityMilli(setupDraft.materialQuantityPerStockUnit)
      if (!quantityPerUnitMilli || !minutesPerUnitMilli) throw new Error('Material and work-centre quantities must be positive numbers with up to three decimals.')
      if (!standardCostPerUnitMmk || !standardCostPerMinuteMmk) throw new Error('Reviewed standard rates must be positive whole-MMK amounts.')
      if (Boolean(shopSku) !== Boolean(materialQuantityMilliPerStockUnit)) throw new Error('Choose both the Shop supply SKU and its material quantity per stock unit, or leave both blank.')
      const primaryMaterial: PlantOrderMaterial = {
        materialId: setupDraft.materialId.trim().toUpperCase(),
        name: setupDraft.materialName.trim(),
        unit: setupDraft.materialUnit,
        quantityPerUnitMilli,
        standardCostPerUnitMmk,
        ...(shopSku && materialQuantityMilliPerStockUnit ? { shopSupply: { sku: shopSku, materialQuantityMilliPerStockUnit } } : {}),
      }
      const materials = [primaryMaterial, ...parsePlantOrderMaterialPaste(setupDraft.additionalMaterials)]
        .sort((left, right) => left.materialId < right.materialId ? -1 : left.materialId > right.materialId ? 1 : 0)
      if (new Set(materials.map((material) => material.materialId)).size !== materials.length) throw new Error('Each BOM material ID must be unique, including the primary material.')
      if (materials.some((material) => !material.standardCostPerUnitMmk)) throw new Error('Every additional BOM row needs its reviewed MMK cost per material unit.')
      const primaryWorkCentreId = setupDraft.workCentreId.trim().toUpperCase()
      const primaryWorkCentreName = setupDraft.workCentreName.trim()
      const additionalOperations = parsePlantOrderRoutingPaste(setupDraft.additionalOperations)
      const routing = [{ operationId: `OP-${primaryWorkCentreId.replace(/^WC-/, '')}-10`, sequence: 1, name: primaryWorkCentreName, workCentreId: primaryWorkCentreId, minutesPerUnitMilli, standardCostPerMinuteMmk }, ...additionalOperations.map((operation, index) => ({ operationId: operation.operationId, sequence: index + 2, name: operation.name, workCentreId: operation.workCentreId, minutesPerUnitMilli: operation.minutesPerUnitMilli, ...(operation.standardCostPerMinuteMmk ? { standardCostPerMinuteMmk: operation.standardCostPerMinuteMmk } : {}) }))]
      if (new Set(routing.map((operation) => operation.operationId)).size !== routing.length) throw new Error('Each routing operation ID must be unique, including the primary operation.')
      if (routing.some((operation) => !operation.standardCostPerMinuteMmk)) throw new Error('Every additional routing row needs its reviewed MMK cost per minute.')
      const workCentreNames = new Map([[primaryWorkCentreId, primaryWorkCentreName]])
      additionalOperations.forEach((operation) => {
        const retainedName = workCentreNames.get(operation.workCentreId)
        if (retainedName && retainedName !== operation.workCentreName) throw new Error(`${operation.workCentreId} must use one consistent work-centre name.`)
        workCentreNames.set(operation.workCentreId, operation.workCentreName)
      })
      const workCentres = [...workCentreNames].map(([workCentreId, name]) => ({ workCentreId, name }))
        .sort((left, right) => left.workCentreId < right.workCentreId ? -1 : left.workCentreId > right.workCentreId ? 1 : 0)
      const targetQuantity = remaining(selectedSetupJob); const expectedHeadDigest = state.headDigest
      const sourceDigest = plantOrderEvidenceDigest(jobSnapshot(scope, selectedSetupJob))
      const effectiveFrom = explicitOffsetTimestamp(setupDraft.effectiveFrom, 'the plan effective date')
      const effectiveUntil = explicitOffsetTimestamp(setupDraft.effectiveUntil, 'the plan expiry date')
      if (Date.parse(effectiveUntil) <= Date.parse(effectiveFrom)) throw new Error('Plan expiry must follow its effective date.')
      const revisionReason = setupDraft.revisionReason.trim()
      if (projection.plan && !revisionReason) throw new Error('Enter why this reviewed plan is being superseded.')
      const plan = buildPlantOrderEffectivePlan({
        planId: commandId('PLN'), sourceDigest,
        effectiveFrom,
        effectiveUntil,
        job: { jobId: selectedSetupJob.id, product: selectedSetupJob.product, targetQuantity, outputBatchId: setupDraft.outputBatchId.trim().toUpperCase() },
        materials,
        workCentres,
        routing,
      })
      setAvailabilityDraft(availabilityDefaultsForPlan(plan))
      const previousPlan = projection.plan
      const revisionId = commandId('REV')
      const actionProof = proof(actor, previousPlan ? 'a successor BOM and routing plan' : 'the reviewed BOM and routing')
      stage({
        title: previousPlan ? 'Plan revision' : 'Execution plan',
        summary: `${selectedSetupJob.id} · ${targetQuantity.toLocaleString()} units remaining`,
        details: [
          ...(previousPlan ? [{ label: 'Supersedes', value: `${previousPlan.planId} · ${revisionReason}` }] : []),
          { label: 'Output batch', value: `${selectedSetupJob.product} · ${targetQuantity.toLocaleString()} units → ${plan.job.outputBatchId}` },
          { label: 'Effective release window', value: `${effectiveFrom} → ${effectiveUntil}` },
          { label: 'Materials', value: materials.map((material) => `${material.name} (${material.materialId}) · ${formatMilli(material.quantityPerUnitMilli)} ${material.unit}/unit · ${formatMmk(material.standardCostPerUnitMmk!)}/${material.unit}`).join(' · ') },
          { label: 'Routing', value: routing.map((operation) => `${operation.name} (${operation.operationId}) · ${formatMilli(operation.minutesPerUnitMilli)} min/unit · ${formatMmk(operation.standardCostPerMinuteMmk!)}/min · ${operation.workCentreId}`).join(' → ') },
        ],
        boundary: previousPlan ? 'Appends a successor while retaining the prior package and reason in immutable history. Earlier availability and calibration are invalidated; release requires a new check and current certificates. No production, stock, accounting, or machine action occurs.' : 'Creates an immutable effective-dated execution package. Release is blocked before or after its reviewed window; a released package is frozen for the batch. Current calibration is still required before release and each routed operation. No staff schedule, stock move, accounting post, or machine command occurs.',
        proof: actionProof,
        apply: (current) => previousPlan
          ? supersedePlantOrderPlan(current, { revisionId, supersededPlanId: previousPlan.planId, plan, reason: revisionReason, proof: actionProof, expectedHeadDigest })
          : applyPlantOrderPlan(current, plan, actionProof, expectedHeadDigest),
      })
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Execution plan could not be prepared.')
    }
  }

  function reviewAvailability(event: FormEvent) {
    event.preventDefault()
    if (!projection.plan) return
    try {
      const materials = projection.materials.map((material) => {
        const draft = availabilityDraft.materials[material.materialId]
        const inputLotId = draft?.inputLotId.trim().toUpperCase() ?? ''
        const availableQuantityMilli = draft ? parsePlantOrderQuantityMilli(draft.availableQuantity, true) : null
        if (!/^LOT-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(inputLotId) || availableQuantityMilli === null) {
          throw new Error(`Enter a canonical lot ID and observed quantity for ${material.materialId}. Quantity may be zero.`)
        }
        return { materialId: material.materialId, inputLotId, availableQuantityMilli }
      })
      const workCentres = projection.plan.workCentres.map((centre) => {
        const rawAvailableMinutes = availabilityDraft.workCentres[centre.workCentreId] ?? ''
        const availableMinutes = /^\d+$/.test(rawAvailableMinutes) ? Number(rawAvailableMinutes) : Number.NaN
        if (!Number.isSafeInteger(availableMinutes) || availableMinutes < 0) throw new Error(`Enter whole available minutes for ${centre.workCentreId}.`)
        return { workCentreId: centre.workCentreId, availableMinutes }
      })
      const checkId = commandId('CHK'); const expectedHeadDigest = state.headDigest
      const sourceDigest = plantOrderEvidenceDigest({ materials, workCentres }); const actionProof = proof(actor, 'material and work-centre availability')
      stage({
        title: 'Availability check',
        summary: `${materials.length} material ${materials.length === 1 ? 'lot' : 'lots'} · ${workCentres.length} work ${workCentres.length === 1 ? 'centre' : 'centres'}`,
        boundary: 'Records a reviewed snapshot only. A shortfall blocks order release; no purchase, reservation, or dispatch occurs.',
        proof: actionProof,
        apply: (current) => checkPlantOrderAvailability(current, { checkId, sourceDigest, materials, workCentres, proof: actionProof, expectedHeadDigest }),
      })
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Availability could not be prepared for review.')
    }
  }

  function updateMaterialAvailability(materialId: string, patch: Partial<AvailabilityDraft['materials'][string]>) {
    setAvailabilityDraft((current) => {
      const existing = current.materials[materialId] ?? { inputLotId: '', availableQuantity: '' }
      return { ...current, materials: { ...current.materials, [materialId]: { ...existing, ...patch } } }
    })
  }

  function updateWorkCentreAvailability(workCentreId: string, availableMinutes: string) {
    setAvailabilityDraft((current) => ({ ...current, workCentres: { ...current.workCentres, [workCentreId]: availableMinutes } }))
  }

  function reviewCalibration(event: FormEvent) {
    event.preventDefault()
    if (!projection.plan || !calibrationDueCentre) return
    try {
      const certificateId = activeCalibrationDraft.certificateId.trim().toUpperCase()
      const calibratedAt = explicitOffsetTimestamp(activeCalibrationDraft.calibratedAt, 'the calibration date')
      const validUntil = explicitOffsetTimestamp(activeCalibrationDraft.validUntil, 'the calibration expiry')
      const standardReference = activeCalibrationDraft.standardReference.trim()
      if (!standardReference) throw new Error('Enter the approved calibration procedure or standard reference.')
      const calibrationId = commandId('CAL'); const expectedHeadDigest = state.headDigest
      const actionProof = proof(actor, `calibration evidence for ${calibrationDueCentre.workCentreId}`)
      stage({
        title: 'Calibration evidence',
        summary: `${calibrationDueCentre.name} · ${certificateId}`,
        details: [
          { label: 'Work centre', value: calibrationDueCentre.workCentreId },
          { label: 'Validity', value: `${calibratedAt} → ${validUntil}` },
          { label: 'Standard', value: standardReference },
        ],
        boundary: 'Records attributable certificate evidence only. It does not calibrate, control, or certify equipment by itself; expired evidence blocks order release and routed operation recording.',
        proof: actionProof,
        apply: (current) => recordPlantOrderCalibration(current, { calibrationId, workCentreId: calibrationDueCentre.workCentreId, certificateId, calibratedAt, validUntil, standardReference, proof: actionProof, expectedHeadDigest }),
      })
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Calibration evidence could not be prepared for review.')
    }
  }

  function reviewEffectiveness(event: FormEvent) {
    event.preventDefault()
    if (!projection.plan || !projection.orderRelease) return
    try {
      const windowStart = explicitOffsetTimestamp(effectivenessDraft.windowStart, 'the production window start')
      const windowEnd = explicitOffsetTimestamp(effectivenessDraft.windowEnd, 'the production window end')
      const routedCentreIds = new Set(projection.routing.map((operation) => operation.workCentreId))
      const workCentres = projection.plan.workCentres.filter((centre) => routedCentreIds.has(centre.workCentreId)).map((centre) => {
        const plannedProductiveMinutesMilli = parsePlantOrderQuantityMilli(effectivenessDraft.workCentres[centre.workCentreId] ?? '')
        if (!plannedProductiveMinutesMilli) throw new Error(`Enter positive planned productive minutes for ${centre.workCentreId}.`)
        return { workCentreId: centre.workCentreId, plannedProductiveMinutesMilli }
      })
      const downtimeIntervals = parsePlantOrderDowntimePaste(effectivenessDraft.downtimeIntervals)
      const source = { planId: projection.plan.planId, jobId: projection.plan.job.jobId, windowStart, windowEnd, workCentres, downtimeIntervals }
      const sourceDigest = plantOrderEvidenceDigest(source); const effectivenessId = commandId('OEE'); const expectedHeadDigest = state.headDigest
      const actionProof = proof(actor, 'order-bound planned productive time and closed downtime')
      stage({
        title: 'Effectiveness evidence',
        summary: `${workCentres.length} work ${workCentres.length === 1 ? 'centre' : 'centres'} · ${downtimeIntervals.length} closed downtime ${downtimeIntervals.length === 1 ? 'interval' : 'intervals'}`,
        details: [{ label: 'Order', value: projection.plan.job.jobId }, { label: 'Window', value: `${windowStart} → ${windowEnd}` }],
        boundary: 'Records reviewed order-bound timing evidence only. It does not infer runtime from released capacity, control equipment, or post labour, cost, inventory, or accounting entries.',
        proof: actionProof,
        apply: (current) => recordPlantOrderEffectiveness(current, { effectivenessId, ...source, sourceDigest, proof: actionProof, expectedHeadDigest }),
      })
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Effectiveness evidence could not be prepared for review.')
    }
  }

  function reviewOrderRelease() {
    if (!projection.latestAvailability) return
    const releaseId = commandId('REL'); const expectedHeadDigest = state.headDigest; const actionProof = proof(actor, 'human production-order release')
    stage({ title: 'Order release', summary: `${projection.plan?.job.jobId} · materials, capacity, calibration, and effective window passed`, boundary: 'Freezes this exact effective-dated work package for the batch. It sends no machine command and makes no inventory or accounting entry.', proof: actionProof, apply: (current) => releasePlantOrder(current, { releaseId, availabilityCheckId: projection.latestAvailability!.checkId, proof: actionProof, expectedHeadDigest }) })
  }

  function reviewMaterialIssue() {
    if (!nextMaterial?.inputLotId) return
    const issueId = commandId('ISSUE'); const expectedHeadDigest = state.headDigest; const actionProof = proof(actor, `request for ${nextMaterial.materialId}`)
    stage({ title: 'Material request', summary: `${formatMilli(nextMaterial.remainingToIssueMilli)} ${nextMaterial.unit} · ${nextMaterial.inputLotId}`, boundary: 'Creates genealogy and a linked Shop request. Shop stock changes only after a separate human-reviewed issue; no purchase, costing, or accounting entry occurs.', proof: actionProof, apply: (current) => issuePlantOrderMaterial(current, { issueId, materialId: nextMaterial.materialId, inputLotId: nextMaterial.inputLotId!, quantityMilli: nextMaterial.remainingToIssueMilli, proof: actionProof, expectedHeadDigest }) })
  }

  function reviewSubstitutionApproval(event: FormEvent) {
    event.preventDefault()
    if (!nextMaterial || nextMaterialSubstitution) return
    try {
      const substituteMaterialId = substitutionDraft.substituteMaterialId.trim().toUpperCase()
      const substituteName = substitutionDraft.substituteName.trim()
      const substituteQuantityPerUnitMilli = parsePlantOrderQuantityMilli(substitutionDraft.substituteQuantityPerUnit)
      const sourceReference = substitutionDraft.sourceReference.trim()
      const technicalBasis = substitutionDraft.technicalBasis.trim()
      if (!/^MAT-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(substituteMaterialId) || substituteMaterialId === nextMaterial.materialId) throw new Error('Enter a distinct canonical substitute material ID.')
      if (!substituteName || !substituteQuantityPerUnitMilli || !sourceReference || !technicalBasis) throw new Error('Enter the substitute name, exact per-unit quantity, approval reference, and technical basis.')
      const substitutionId = commandId('SUB'); const expectedHeadDigest = state.headDigest
      const approvalSourceDigest = plantOrderEvidenceDigest({ sourceReference, originalMaterialId: nextMaterial.materialId, substituteMaterialId, originalQuantityPerUnitMilli: nextMaterial.quantityPerUnitMilli, substituteQuantityPerUnitMilli })
      const actionProof = { ...proof(actor, `substitute for ${nextMaterial.materialId}`), evidenceReference: sourceReference }
      stage({
        title: 'Material substitute',
        summary: `${substituteName} · ${formatMilli(substituteQuantityPerUnitMilli)} ${substitutionDraft.substituteUnit} per output unit`,
        details: [{ label: 'Original BOM', value: `${nextMaterial.materialId} · ${formatMilli(nextMaterial.quantityPerUnitMilli)} ${nextMaterial.unit}` }, { label: 'Approved substitute', value: `${substituteMaterialId} · ${formatMilli(substituteQuantityPerUnitMilli)} ${substitutionDraft.substituteUnit}` }, { label: 'Approval evidence', value: sourceReference }, { label: 'Technical basis', value: technicalBasis }],
        boundary: 'Records one job-bound human approval only. It does not rewrite the BOM, issue stock, infer equivalence, post cost or accounting, or control equipment.',
        proof: actionProof,
        apply: (current) => approvePlantOrderMaterialSubstitution(current, { substitutionId, materialId: nextMaterial.materialId, substituteMaterialId, substituteName, substituteUnit: substitutionDraft.substituteUnit, originalQuantityPerUnitMilli: nextMaterial.quantityPerUnitMilli, substituteQuantityPerUnitMilli, approvalSourceDigest, technicalBasis, proof: actionProof, expectedHeadDigest }),
      })
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'The substitute approval could not be prepared.')
    }
  }

  function reviewSubstituteMaterialIssue(event: FormEvent) {
    event.preventDefault()
    if (!nextMaterial || !nextMaterialSubstitution) return
    try {
      const inputLotId = substitutionDraft.inputLotId.trim().toUpperCase()
      if (!/^LOT-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(inputLotId)) throw new Error('Enter the exact canonical substitute lot ID.')
      const numerator = BigInt(nextMaterial.remainingToIssueMilli) * BigInt(nextMaterialSubstitution.substituteQuantityPerUnitMilli)
      const denominator = BigInt(nextMaterialSubstitution.originalQuantityPerUnitMilli)
      if (numerator % denominator !== 0n) throw new Error('The remaining BOM quantity cannot be converted exactly with this approval.')
      const substituteQuantityMilli = Number(numerator / denominator)
      if (!Number.isSafeInteger(substituteQuantityMilli) || substituteQuantityMilli < 1) throw new Error('The substitute issue quantity exceeds the supported range.')
      const issueId = commandId('ISSUE'); const expectedHeadDigest = state.headDigest; const actionProof = proof(actor, `approved substitute request for ${nextMaterial.materialId}`)
      stage({
        title: 'Substitute request',
        summary: `${formatMilli(substituteQuantityMilli)} ${nextMaterialSubstitution.substituteUnit} · ${inputLotId}`,
        details: [{ label: 'Original BOM credit', value: `${formatMilli(nextMaterial.remainingToIssueMilli)} ${nextMaterial.unit} · ${nextMaterial.materialId}` }, { label: 'Physical substitute', value: `${nextMaterialSubstitution.substituteMaterialId} · ${formatMilli(substituteQuantityMilli)} ${nextMaterialSubstitution.substituteUnit}` }, { label: 'Approval', value: nextMaterialSubstitution.id }],
        boundary: 'Creates one linked Shop request for the physical substitute lot. Shop remains stock authority; the original BOM and approval remain immutable.',
        proof: actionProof,
        apply: (current) => issuePlantOrderSubstituteMaterial(current, { issueId, substitutionId: nextMaterialSubstitution.id, materialId: nextMaterial.materialId, substituteMaterialId: nextMaterialSubstitution.substituteMaterialId, inputLotId, substituteQuantityMilli, proof: actionProof, expectedHeadDigest }),
      })
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'The substitute request could not be prepared.')
    }
  }

  function reviewOperation(event: FormEvent) {
    event.preventDefault()
    if (pendingWarehouseIssues.length) return setError('Shop must issue every linked material request before operation progress can be recorded.')
    if (!nextOperation || operationAvailableQuantity < 1) return
    const quantity = /^\d+$/.test(activeOperationDraft.quantity) ? Number(activeOperationDraft.quantity) : Number.NaN
    const actualMinutesMilli = parsePlantOrderQuantityMilli(activeOperationDraft.actualMinutes)
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > operationAvailableQuantity || !actualMinutesMilli) {
      return setError(`Enter 1 to ${operationAvailableQuantity.toLocaleString()} completed units and observed minutes with up to three decimals.`)
    }
    const operationRunId = commandId('OPRUN'); const expectedHeadDigest = state.headDigest; const actionProof = proof(actor, `progress for ${nextOperation.operationId}`)
    stage({ title: nextOperation.name, summary: `${quantity.toLocaleString()} units · ${formatMilli(actualMinutesMilli)} actual minutes · ${nextOperation.workCentreId}`, boundary: 'Records reviewed operation progress and time evidence only. It does not control equipment, post labour cost, or move inventory.', proof: actionProof, apply: (current) => recordPlantOrderOperation(current, { operationRunId, operationId: nextOperation.operationId, quantity, actualMinutesMilli, proof: actionProof, expectedHeadDigest }) })
  }

  function reviewOutput() {
    if (pendingWarehouseIssues.length) return setError('Shop must issue every linked material request before batch output can be recorded.')
    if (!projection.plan || outputRemaining < 1) return
    const outputId = commandId('OUT'); const expectedHeadDigest = state.headDigest; const actionProof = proof(actor, 'produced output quantity')
    stage({ title: 'Batch output', summary: `${outputRemaining.toLocaleString()} units · ${projection.plan.job.outputBatchId}`, boundary: 'Records this execution package output. The existing Plant output ledger and Shop receipt remain separate reviewed steps.', proof: actionProof, apply: (current) => recordPlantOrderOutput(current, { outputId, outputBatchId: projection.plan!.job.outputBatchId, quantity: outputRemaining, proof: actionProof, expectedHeadDigest }) })
  }

  function reviewQualityRework(event: FormEvent) {
    event.preventDefault()
    if (!projection.qualityHold || !projection.latestInspection || !qualityReworkRequired) return
    const operation = projection.routing.find((candidate) => candidate.operationId === activeReworkDraft.operationId)
    const actualMinutesMilli = parsePlantOrderQuantityMilli(activeReworkDraft.actualMinutes)
    const owner = activeReworkDraft.owner.trim(); const cause = activeReworkDraft.cause.trim(); const correctiveAction = activeReworkDraft.correctiveAction.trim()
    if (!operation || !actualMinutesMilli || !owner || !cause || !correctiveAction) return setError('Choose the rework operation and enter actual minutes, owner, cause, and corrective action.')
    const reworkId = commandId('RWK'); const expectedHeadDigest = state.headDigest; const actionProof = proof(actor, `quality rework for ${projection.latestInspection.id}`)
    stage({
      title: 'Quality rework',
      summary: `${projection.qualityHold.rejectedQuantity.toLocaleString()} units · ${operation.name} · ${formatMilli(actualMinutesMilli)} minutes`,
      details: [{ label: 'Responsible owner', value: owner }, { label: 'Cause', value: cause }, { label: 'Corrective action', value: correctiveAction }],
      boundary: 'Records attributed rework evidence and actual routed time only. It does not clear the quality hold; a separate full reinspection is still required.',
      proof: actionProof,
      apply: (current) => recordPlantOrderQualityRework(current, { reworkId, inspectionId: projection.latestInspection!.id, operationId: operation.operationId, quantity: projection.qualityHold!.rejectedQuantity, actualMinutesMilli, owner, cause, correctiveAction, proof: actionProof, expectedHeadDigest }),
    })
  }

  function reviewInspection(event: FormEvent) {
    event.preventDefault()
    if (!projection.plan || !inspectionValid || inspectedQuantity < 1) return
    const inspectionId = commandId('INSP'); const expectedHeadDigest = state.headDigest; const acceptedQuantity = inspectedQuantity - rejected
    const actionProof = proof(actor, inspectionDraft.result === 'pass' ? 'passing batch inspection' : 'failed batch inspection and quality hold')
    stage({ title: inspectionDraft.result === 'pass' ? 'Passing inspection' : 'Quality hold', summary: `${inspectedQuantity.toLocaleString()} inspected · ${acceptedQuantity.toLocaleString()} accepted · ${rejected.toLocaleString()} rejected`, boundary: inspectionDraft.result === 'pass' ? 'Acceptance remains separate from final human batch release.' : 'A failed inspection blocks more issue and output until a later passing reinspection.', proof: actionProof, apply: (current) => inspectPlantOrderOutput(current, { inspectionId, outputBatchId: projection.plan!.job.outputBatchId, inspectedQuantity, acceptedQuantity, rejectedQuantity: rejected, result: inspectionDraft.result, proof: actionProof, expectedHeadDigest }) })
  }

  function reviewBatchRelease() {
    if (!projection.plan || !projection.latestInspection) return
    const qualityReleaseId = commandId('QREL'); const expectedHeadDigest = state.headDigest; const actionProof = proof(actor, 'human batch release')
    stage({ title: 'Batch release', summary: `${projection.plan.job.outputBatchId} · ${projection.totalOutput.toLocaleString()} accepted units`, boundary: 'Records human quality release only. Shop receipt, delivery, costing, and accounting are not posted automatically.', proof: actionProof, apply: (current) => releasePlantOrderBatch(current, { qualityReleaseId, outputBatchId: projection.plan!.job.outputBatchId, inspectionId: projection.latestInspection!.id, proof: actionProof, expectedHeadDigest }) })
  }

  return <>
    <section aria-labelledby="plant-execution-title" className="core-panel plant-execution-foundation">
      <div className="plant-execution-head">
        <div>
          <span className="core-eyebrow">Execution control</span>
          <h3 id="plant-execution-title">{projection.plan ? `${projection.plan.job.jobId} · ${visibleStatus}` : 'Run one controlled batch'}</h3>
          <p>{projection.plan ? `${projection.totalOutput.toLocaleString()} / ${projection.metrics.targetQuantity.toLocaleString()} output · ${projection.genealogy.length} traced input ${projection.genealogy.length === 1 ? 'lot' : 'lots'} · revision ${projection.revision}` : 'Turn an active job into one reviewed BOM, routing, material, output, inspection, and release chain.'}</p>
          {projection.plan ? <small>{releaseWindowStatus}</small> : null}
        </div>
        {!projection.plan ? <button aria-controls="plant-execution-setup" aria-expanded={setupOpen} className="core-button primary" disabled={disabled} onClick={() => { setSetupOpen(true); setReview(null) }} ref={setupTriggerRef} type="button">Set up batch</button> : null}
        {effectivePlan && !projection.orderRelease ? <button aria-controls="plant-execution-setup" aria-expanded={setupOpen} className={`core-button ${releaseWindowExpired ? 'primary' : ''}`} disabled={disabled || busy || Boolean(review)} onClick={openPlanRevision} ref={setupTriggerRef} type="button">{releaseWindowExpired ? 'Create current revision' : 'Revise plan'}</button> : null}
        {projection.plan ? <span className={`status-pill ${calibrationDueCentre || awaitingWarehouse || projection.status === 'quality_hold' || projection.status === 'shortfall' ? 'pending' : 'bounded'}`}>{visibleStatus}</span> : null}
      </div>
      {orderChoices.length > 1 ? <label className="plant-order-switcher">Controlled order<select aria-label="Controlled production order" disabled={busy || Boolean(review)} onChange={(event) => selectOrder(event.target.value)} value={selectedOrderJobId}>{orderChoices.map((choice) => <option key={choice.id} value={choice.id}>{choice.id} · {choice.job?.product ?? 'Retained order'} · {choice.execution ? 'planned' : 'not planned'}</option>)}</select></label> : null}
      {portfolioMrp && portfolioMrp.orders.length > 1 ? <div className="plant-portfolio-mrp" role="status"><div><span className="core-eyebrow">Portfolio material plan</span><strong>{portfolioMrp.summary.orders} controlled orders share Shop supply once</strong><small>Urgent work first, then earliest due. Protected stock and open purchase quantities are never counted twice.</small></div><div className="plant-portfolio-counts"><span>{portfolioMrp.summary.ready} ready</span><span>{portfolioMrp.summary.coveredByPurchase} on purchase orders</span><span>{portfolioMrp.summary.atRisk} at risk</span><span>{portfolioMrp.summary.shortage + portfolioMrp.summary.mappingRequired} blocked</span></div>{selectedPortfolioOrder ? <small>{selectedPortfolioOrder.jobId}: {selectedPortfolioOrder.rows.map((row) => row.sku ? `${row.sku} ${row.allocatedOnHandStockUnits} stock + ${row.allocatedScheduledPurchaseStockUnits} PO + ${row.allocatedAtRiskPurchaseStockUnits} risk; ${row.shortageStockUnits} short` : `${row.materialId} needs Shop mapping`).join(' · ')}</small> : null}</div> : null}
      <section aria-label="Plant operating flow" className="plant-operating-flow" id="plant-operating-flow">
        <div className={`plant-next-work${flowBlocked ? ' is-blocked' : ''}`}>
          <div><span className="core-eyebrow">Next required step</span><strong>{flowNext.title}</strong><small>{flowNext.detail}</small></div>
          <span className={`status-pill ${flowBlocked ? 'pending' : projection.status === 'released_to_stock' ? 'bounded' : ''}`}>{projection.status === 'released_to_stock' ? 'Complete' : flowBlocked ? 'Needs attention' : `Step ${Math.min(flowActiveIndex + 1, flowStages.length)} of ${flowStages.length}`}</span>
        </div>
        <ol aria-label="Plant workflow stages" className="plant-flow-stages" tabIndex={0}>
          {flowStages.map((stage, index) => <li aria-current={stage.state === 'current' || stage.state === 'blocked' ? 'step' : undefined} className={stage.state} key={stage.id}>
            <span>{String(index + 1).padStart(2, '0')} · {stage.label}</span><strong>{stage.state === 'complete' ? 'Done' : stage.state === 'blocked' ? 'Blocked' : stage.state === 'current' ? 'Now' : 'Next'}</strong><small>{stage.detail}</small>
          </li>)}
        </ol>
      </section>

      {projection.plan && calibrationDueCentre ? <form className="core-form compact-form" onSubmit={reviewCalibration}>
        <div><strong>{calibrationDueCentre.name}</strong><small>{calibrationDueCentre.workCentreId} · current certificate required</small></div>
        <div className="form-row"><label>Certificate ID<input disabled={controlsDisabled} maxLength={80} onChange={(event) => setCalibrationDraft({ ...activeCalibrationDraft, certificateId: event.target.value })} required value={activeCalibrationDraft.certificateId} /></label><label>Procedure / standard<input disabled={controlsDisabled} maxLength={180} onChange={(event) => setCalibrationDraft({ ...activeCalibrationDraft, standardReference: event.target.value })} required value={activeCalibrationDraft.standardReference} /></label></div>
        <div className="form-row"><label>Calibrated at<input disabled={controlsDisabled} onChange={(event) => setCalibrationDraft({ ...activeCalibrationDraft, calibratedAt: event.target.value })} required type="datetime-local" value={activeCalibrationDraft.calibratedAt} /></label><label>Valid until<input disabled={controlsDisabled} onChange={(event) => setCalibrationDraft({ ...activeCalibrationDraft, validUntil: event.target.value })} required type="datetime-local" value={activeCalibrationDraft.validUntil} /></label></div>
        <p className="form-notice warning-text" role="alert">Release and routed operation records stay blocked until every required work centre has current reviewed evidence.</p>
        <button className="core-button primary" disabled={controlsDisabled} type="submit">Review calibration evidence</button>
      </form> : null}

      {projection.plan && !calibrationDueCentre && (projection.status === 'planned' || projection.status === 'shortfall') ? <form className="core-form compact-form" onSubmit={reviewAvailability}>
        <div aria-label="Material and capacity availability" className="plant-availability-fields">
          <section aria-label="Material lots" className="plant-availability-group">
            {projection.materials.map((material) => {
              const draft = availabilityDraft.materials[material.materialId] ?? { inputLotId: '', availableQuantity: '' }
              return <div className="plant-availability-item" key={material.materialId}>
                <div><strong>{material.name}</strong><small>{material.materialId} · need {formatMilli(material.requiredQuantityMilli)} {material.unit}</small></div>
                <div className="form-row"><label>Input lot<input disabled={controlsDisabled} maxLength={80} onChange={(event) => updateMaterialAvailability(material.materialId, { inputLotId: event.target.value })} required value={draft.inputLotId} /></label><label>Available {material.unit}<input disabled={controlsDisabled} inputMode="decimal" min="0" onChange={(event) => updateMaterialAvailability(material.materialId, { availableQuantity: event.target.value })} required step="0.001" type="number" value={draft.availableQuantity} /></label></div>
              </div>
            })}
          </section>
          <section aria-label="Work-centre capacity" className="plant-availability-group">
            {projection.plan.workCentres.map((centre) => <div className="plant-availability-item" key={centre.workCentreId}>
              <div><strong>{centre.name}</strong><small>{centre.workCentreId}</small></div>
              <label>Available whole minutes<input disabled={controlsDisabled} min="0" onChange={(event) => updateWorkCentreAvailability(centre.workCentreId, event.target.value)} required step="1" type="number" value={availabilityDraft.workCentres[centre.workCentreId] ?? ''} /></label>
            </div>)}
          </section>
        </div>
        {projection.status === 'shortfall' ? <p className="form-notice warning-text" role="alert">{projection.latestAvailability?.shortfalls.map((row) => `${row.subjectId}: need ${formatMilli(row.required)}, have ${formatMilli(row.available)}`).join(' · ')}</p> : null}
        <button className="core-button primary" disabled={controlsDisabled} type="submit">Review availability</button>
      </form> : null}

      {!calibrationDueCentre && projection.status === 'ready' ? <><button className="core-button primary" disabled={controlsDisabled || !releaseWindowOpen} onClick={reviewOrderRelease} type="button">Review order release</button>{!releaseWindowOpen ? <p className="form-notice warning-text" role="alert">This reviewed plan is outside its release window. Create a newly reviewed revision; the old package cannot be silently reused.</p> : null}</> : null}
      {!calibrationDueCentre && (projection.status === 'released' || projection.status === 'in_process') && nextMaterial && !nextMaterialSubstitution ? <div className="core-form compact-form">
        <button className="core-button primary" disabled={controlsDisabled} onClick={reviewMaterialIssue} type="button">Request reviewed lot</button>
        <details className="compact-disclosure production-history"><summary>Use an approved substitute <span>Optional</span></summary><form className="core-form compact-form" onSubmit={reviewSubstitutionApproval}>
          <div className="form-row"><label>Substitute material ID<input disabled={controlsDisabled} maxLength={80} onChange={(event) => setSubstitutionDraft((current) => ({ ...current, substituteMaterialId: event.target.value }))} placeholder="MAT-FILTER-ALT-01" required value={substitutionDraft.substituteMaterialId} /></label><label>Substitute name<input disabled={controlsDisabled} maxLength={180} onChange={(event) => setSubstitutionDraft((current) => ({ ...current, substituteName: event.target.value }))} required value={substitutionDraft.substituteName} /></label></div>
          <div className="form-row"><label>Substitute unit<select disabled={controlsDisabled} onChange={(event) => setSubstitutionDraft((current) => ({ ...current, substituteUnit: event.target.value as PlantOrderMaterial['unit'] }))} value={substitutionDraft.substituteUnit}>{setupMaterialUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label><label>Per output unit<input disabled={controlsDisabled} inputMode="decimal" min="0.001" onChange={(event) => setSubstitutionDraft((current) => ({ ...current, substituteQuantityPerUnit: event.target.value }))} required step="0.001" type="number" value={substitutionDraft.substituteQuantityPerUnit} /></label></div>
          <label>Approval / certificate reference<input disabled={controlsDisabled} maxLength={180} onChange={(event) => setSubstitutionDraft((current) => ({ ...current, sourceReference: event.target.value }))} required value={substitutionDraft.sourceReference} /></label>
          <label>Technical basis<textarea disabled={controlsDisabled} maxLength={300} onChange={(event) => setSubstitutionDraft((current) => ({ ...current, technicalBasis: event.target.value }))} required rows={2} value={substitutionDraft.technicalBasis} /></label>
          <button className="core-button" disabled={controlsDisabled} type="submit">Review substitute approval</button>
        </form></details>
      </div> : null}
      {!calibrationDueCentre && (projection.status === 'released' || projection.status === 'in_process') && nextMaterial && nextMaterialSubstitution ? <form className="core-form compact-form" onSubmit={reviewSubstituteMaterialIssue}>
        <div><strong>{nextMaterialSubstitution.substituteName}</strong><small>{nextMaterialSubstitution.substituteMaterialId} · approved for {nextMaterial.materialId}</small></div>
        <label>Substitute lot ID<input disabled={controlsDisabled} maxLength={80} onChange={(event) => setSubstitutionDraft((current) => ({ ...current, inputLotId: event.target.value }))} placeholder={`LOT-${nextMaterialSubstitution.substituteMaterialId.replace(/^MAT-/, '')}`} required value={substitutionDraft.inputLotId} /></label>
        <div className="form-actions"><button className="core-button" disabled={controlsDisabled} onClick={reviewMaterialIssue} type="button">Use original lot</button><button className="core-button primary" disabled={controlsDisabled} type="submit">Review substitute request</button></div>
      </form> : null}
      {awaitingWarehouse ? <div className="stock-receipt-preview" role="status"><small>Warehouse handoff required</small><strong>{pendingWarehouseIssues.length} Plant material {pendingWarehouseIssues.length === 1 ? 'request needs' : 'requests need'} Shop stock issue</strong><a className="core-button primary compact" href="/shop/?tab=inventory">Review in Shop</a></div> : null}
      {!calibrationDueCentre && (projection.status === 'released' || projection.status === 'in_process') && !nextMaterial && !awaitingWarehouse && nextOperation ? <form className="core-form compact-form" onSubmit={reviewOperation}>
        <div><strong>{nextOperation.sequence}. {nextOperation.name}</strong><small>{nextOperation.workCentreId} · {nextOperation.completedQuantity.toLocaleString()} / {projection.metrics.targetQuantity.toLocaleString()} complete</small></div>
        <div className="form-row"><label>Completed units<input disabled={controlsDisabled} inputMode="numeric" max={operationAvailableQuantity} min="1" onChange={(event) => setOperationDraft({ ...activeOperationDraft, quantity: event.target.value })} required step="1" type="number" value={activeOperationDraft.quantity} /></label><label>Actual minutes<input disabled={controlsDisabled} inputMode="decimal" min="0.001" onChange={(event) => setOperationDraft({ ...activeOperationDraft, actualMinutes: event.target.value })} placeholder={formatMilli(nextOperation.minutesPerUnitMilli * operationAvailableQuantity)} required step="0.001" type="number" value={activeOperationDraft.actualMinutes} /></label></div>
        <button className="core-button primary" disabled={controlsDisabled} type="submit">Review operation progress</button>
      </form> : null}
      {!calibrationDueCentre && projection.status === 'in_process' && !nextMaterial && !awaitingWarehouse && !nextOperation && outputRemaining > 0 ? <button className="core-button primary" disabled={controlsDisabled} onClick={reviewOutput} type="button">Review batch output</button> : null}
      {!calibrationDueCentre && qualityReworkRequired ? <form className="core-form compact-form" onSubmit={reviewQualityRework}>
        <div><strong>Quality hold · {projection.qualityHold?.rejectedQuantity.toLocaleString()} rejected</strong><small>Record the correction before reinspection.</small></div>
        <div className="form-row"><label>Rework operation<select disabled={controlsDisabled} onChange={(event) => setReworkDraft({ ...activeReworkDraft, operationId: event.target.value })} required value={activeReworkDraft.operationId}>{projection.routing.map((operation) => <option key={operation.operationId} value={operation.operationId}>{operation.name} · {operation.workCentreId}</option>)}</select></label><label>Actual rework minutes<input disabled={controlsDisabled} inputMode="decimal" min="0.001" onChange={(event) => setReworkDraft({ ...activeReworkDraft, actualMinutes: event.target.value })} required step="0.001" type="number" value={activeReworkDraft.actualMinutes} /></label></div>
        <label>Responsible owner<input disabled={controlsDisabled} maxLength={120} onChange={(event) => setReworkDraft({ ...activeReworkDraft, owner: event.target.value })} placeholder="Name or role" required value={activeReworkDraft.owner} /></label>
        <label>Observed cause<textarea disabled={controlsDisabled} maxLength={300} onChange={(event) => setReworkDraft({ ...activeReworkDraft, cause: event.target.value })} placeholder="What caused the rejected output?" required rows={2} value={activeReworkDraft.cause} /></label>
        <label>Corrective action<textarea disabled={controlsDisabled} maxLength={300} onChange={(event) => setReworkDraft({ ...activeReworkDraft, correctiveAction: event.target.value })} placeholder="What was changed before reinspection?" required rows={2} value={activeReworkDraft.correctiveAction} /></label>
        <button className="core-button primary" disabled={controlsDisabled} type="submit">Review quality rework</button>
      </form> : null}
      {!calibrationDueCentre && (projection.status === 'inspection_due' || projection.status === 'quality_hold' && !qualityReworkRequired) ? <form className="core-form compact-form" onSubmit={reviewInspection}>
        <div className="form-row"><label>Inspection result<select disabled={controlsDisabled} onChange={(event) => { const result = event.target.value as 'pass' | 'fail'; setInspectionDraft({ result, rejected: result === 'pass' ? '0' : '1' }) }} value={inspectionDraft.result}><option value="pass">Pass</option><option value="fail">Fail and hold</option></select></label><label>Rejected units<input disabled={controlsDisabled} max={inspectedQuantity} min="0" onChange={(event) => setInspectionDraft((current) => ({ ...current, rejected: event.target.value }))} required step="1" type="number" value={inspectionDraft.rejected} /></label></div>
        <button className="core-button primary" disabled={controlsDisabled || !inspectionValid} type="submit">Review inspection</button>
      </form> : null}
      {!calibrationDueCentre && projection.status === 'ready_to_release' ? <button className="core-button primary" disabled={controlsDisabled} onClick={reviewBatchRelease} type="button">Review batch release</button> : null}
      {projection.status === 'released_to_stock' ? <div className="stock-receipt-preview" role="status"><small>Human-released batch</small><strong>{projection.plan?.job.outputBatchId} · {projection.metrics.acceptedQuantity.toLocaleString()} accepted</strong></div> : null}

      {!bindingCurrent && projection.status !== 'released_to_stock' ? <p className="form-notice warning-text" role="alert">The bound Plant job changed after this execution plan was reviewed. This chain is paused; reconcile the job snapshot before continuing.</p> : null}
      {controlledPlan ? <details className="compact-disclosure production-history"><summary>Calibration control <span>{projection.calibrations.length}/{new Set(projection.routing.map((operation) => operation.workCentreId)).size} records</span></summary><div className="issue-list">{projection.plan?.workCentres.filter((centre) => projection.routing.some((operation) => operation.workCentreId === centre.workCentreId)).map((centre) => {
        const calibration = calibrationByCentre.get(centre.workCentreId); const current = Boolean(calibration && Date.parse(calibration.validUntil) > evaluationTime)
        return <article key={centre.workCentreId}><span aria-hidden="true" className={`issue-mark ${current ? 'resolved' : ''}`}>CAL</span><div><strong>{centre.name}</strong><small>{calibration ? `${calibration.certificateId} · ${calibration.standardReference} · valid until ${calibration.validUntil}` : `${centre.workCentreId} · certificate evidence required`}</small></div></article>
      })}</div><p className="panel-copy">Certificate evidence is immutable and attributable. It gates release and each routed operation but never claims SuperMega calibrated the equipment.</p></details> : null}
      {projection.qualityReworks.length ? <details className="compact-disclosure production-history"><summary>Quality rework <span>{projection.qualityReworks.length}</span></summary><div className="issue-list">{projection.qualityReworks.map((rework) => <article key={rework.id}><span aria-hidden="true" className="issue-mark resolved">RWK</span><div><strong>{rework.quantity} units · {rework.operationId}</strong><small>{formatMilli(rework.actualMinutesMilli)} minutes · owner {rework.owner} · {rework.cause} → {rework.correctiveAction}</small></div></article>)}</div><p className="panel-copy">Rework time is included in actual conversion cost and variance. Only a later full passing inspection clears the hold.</p></details> : null}
      {requiresOperationEvidence ? <details className="compact-disclosure production-history"><summary>Routing progress <span>{projection.metrics.completedOperationCount}/{projection.operations.length}</span></summary><div className="issue-list">{projection.operations.map((operation) => <article key={operation.operationId}><span aria-hidden="true" className={`issue-mark ${operation.status === 'complete' ? 'resolved' : ''}`}>{operation.sequence}</span><div><strong>{operation.name}</strong><small>{operation.completedQuantity.toLocaleString()} / {projection.metrics.targetQuantity.toLocaleString()} units · {formatMilli(operation.actualMinutesMilli)} actual / {formatMilli(operation.plannedMinutesMilli)} planned minutes · {operation.status.replace('_', ' ')}</small></div></article>)}</div></details> : null}
      {materialRequirements ? <details className="compact-disclosure production-history" open><summary>Material requirements <span>{materialRequirements.status.replaceAll('_', ' ')}</span></summary><div className="issue-list">{materialRequirements.rows.map((row) => <article key={row.materialId}><span aria-hidden="true" className={`issue-mark ${row.status === 'fulfilled' || row.status === 'ready_to_issue' ? 'resolved' : ''}`}>MRP</span><div><strong>{row.materialName} · {row.status.replaceAll('_', ' ')}</strong><small>{formatMilli(row.remainingQuantityMilli)} {row.unit} remaining{row.shopSupply ? ` · ${row.shopSupply.sku}: ${row.shopSupply.onHandStockUnits} on hand − ${row.shopSupply.protectedStockUnits} Shop floor = ${row.shopSupply.availableToIssueStockUnits} issue-ready · ${row.shopSupply.openPurchaseOrderStockUnits} open PO${row.shopSupply.atRiskPurchaseOrderStockUnits ? ` (${row.shopSupply.atRiskPurchaseOrderStockUnits} outside window or undated)` : ''} · issue ${row.shopSupply.suggestedIssueStockUnits} / expedite ${row.shopSupply.suggestedExpediteStockUnits} / order ${row.shopSupply.suggestedOrderStockUnits} stock units${row.shopSupply.nextExpectedAt ? ` · next confirmed ${new Date(row.shopSupply.nextExpectedAt).toLocaleDateString()}` : ''}` : ' · bind one Shop SKU and conversion in the reviewed BOM'}</small></div></article>)}</div>{materialRequirementsDownload ? <><a className="core-button" download={materialRequirementsDownload.filename} href={materialRequirementsDownload.href}>Download material requirements</a><p className="panel-copy">Evidence-bound planning only. Shop reorder stock stays protected; purchase orders outside the reviewed production window or without an expected date are supply at risk. No purchase order, supplier message, stock issue, production change, or provider call occurs.</p></> : null}</details> : null}
      {projection.plan ? <details className="compact-disclosure production-history"><summary>Standard vs actual <span>{financialCost.status === 'setup_required' ? 'Rates required' : formatMmk(financialCost.varianceMmk ?? 0)}</span></summary>{financialCost.status !== 'setup_required' ? <div className="form-row"><span className="status-pill">Planned {formatMmk(financialCost.planned.totalMmk)}</span><span className="status-pill">Earned {formatMmk(financialCost.earned.totalMmk)}</span><span className="status-pill">Actual {formatMmk(financialCost.actual.totalMmk)}</span><span className={`status-pill ${(financialCost.varianceMmk ?? 0) <= 0 ? 'bounded' : 'pending'}`}>Variance {formatMmk(financialCost.varianceMmk ?? 0)}</span><span className={`status-pill ${(financialCost.qualityLossMmk ?? 0) === 0 ? 'bounded' : 'pending'}`}>Quality loss {formatMmk(financialCost.qualityLossMmk ?? 0)}</span></div> : null}<div className="issue-list">
        {costDrivers.materials.map((material) => <article key={material.materialId}><span aria-hidden="true" className={`issue-mark ${material.varianceQuantityMilli <= 0 ? 'resolved' : ''}`}>MAT</span><div><strong>{material.name}</strong><small>{formatMilli(material.actualQuantityMilli)} actual / {formatMilli(material.standardQuantityMilli)} standard {material.unit} · {formatMilli(material.varianceQuantityMilli)} variance</small></div></article>)}
        {costDrivers.operations.map((operation) => <article key={operation.operationId}><span aria-hidden="true" className={`issue-mark ${operation.varianceMinutesMilli <= 0 ? 'resolved' : ''}`}>MIN</span><div><strong>{operation.name}</strong><small>{formatMilli(operation.actualMinutesMilli)} actual / {formatMilli(operation.standardMinutesMilli)} standard minutes · {formatMilli(operation.varianceMinutesMilli)} variance</small></div></article>)}
      </div><p className="panel-copy">{financialCost.status === 'setup_required' ? `${costDrivers.financialCostReason} Missing: ${financialCost.missingRates.join(', ') || 'reviewed execution plan'}.` : 'MMK costs are calculated only from the immutable reviewed rate card, BOM allowances, issued materials, completed routing units, actual minutes, and current inspection.'}</p>{costReviewDownload ? <><a className="core-button" download={costReviewDownload.filename} href={costReviewDownload.href}>Download cost review packet</a><p className="panel-copy">Internal evidence for ERP review only. No cost, inventory, journal, payroll, invoice, provider, or production write occurs.</p></> : null}</details> : null}
      {projection.plan ? <details className="compact-disclosure production-history"><summary>Effectiveness <span>{effectiveness.oeeBasisPoints !== null ? formatBasisPoints(effectiveness.oeeBasisPoints) : effectiveness.status === 'availability_setup_required' ? 'Setup availability' : 'Collecting'}</span></summary><div className="issue-list">
        <article><span aria-hidden="true" className={`issue-mark ${effectiveness.availability ? 'resolved' : ''}`}>A</span><div><strong>Availability · {effectiveness.availability ? formatBasisPoints(effectiveness.availability.basisPoints) : 'Setup required'}</strong><small>{effectiveness.availability ? `${formatMilli(effectiveness.availability.operatingMinutesMilli)} operating / ${formatMilli(effectiveness.availability.plannedProductiveMinutesMilli)} planned productive minutes · ${formatMilli(effectiveness.availability.downtimeMinutesMilli)} downtime · ${effectiveness.availability.downtimeIntervalCount} closed intervals` : 'Bind planned productive time and closed downtime to this exact order, window, and routed work centre.'}</small></div></article>
        <article><span aria-hidden="true" className={`issue-mark ${effectiveness.performance ? 'resolved' : ''}`}>P</span><div><strong>Performance · {effectiveness.performance ? formatBasisPoints(effectiveness.performance.basisPoints) : 'Collecting'}</strong><small>{effectiveness.performance ? `${formatMilli(effectiveness.performance.designedMinutesMilli)} designed / ${formatMilli(effectiveness.performance.actualMinutesMilli)} actual minutes · ${formatMilli(effectiveness.performance.speedLossMinutesMilli)} speed loss` : 'Record completed routing units and actual minutes.'}</small></div></article>
        <article><span aria-hidden="true" className={`issue-mark ${effectiveness.quality ? 'resolved' : ''}`}>Q</span><div><strong>Quality · {effectiveness.quality ? formatBasisPoints(effectiveness.quality.basisPoints) : 'Collecting'}</strong><small>{effectiveness.quality ? `${effectiveness.quality.acceptedQuantity.toLocaleString()} accepted / ${effectiveness.quality.inspectedQuantity.toLocaleString()} inspected · ${effectiveness.quality.rejectedQuantity.toLocaleString()} rejected` : 'Complete the current output inspection.'}</small></div></article>
        <article><span aria-hidden="true" className={`issue-mark ${effectiveness.oeeBasisPoints !== null ? 'resolved' : ''}`}>OEE</span><div><strong>OEE · {effectiveness.oeeBasisPoints !== null ? formatBasisPoints(effectiveness.oeeBasisPoints) : 'Not calculated'}</strong><small>Availability × Performance × Quality. Available capacity is never substituted for actual productive time.</small></div></article>
      </div>{projection.orderRelease ? <form className="core-form compact-form" onSubmit={reviewEffectiveness}>
        <div className="form-row"><label>Window start<input disabled={controlsDisabled} onChange={(event) => setEffectivenessDraft((current) => ({ ...current, windowStart: event.target.value }))} required type="datetime-local" value={effectivenessDraft.windowStart} /></label><label>Window end<input disabled={controlsDisabled} onChange={(event) => setEffectivenessDraft((current) => ({ ...current, windowEnd: event.target.value }))} required type="datetime-local" value={effectivenessDraft.windowEnd} /></label></div>
        <div className="plant-availability-fields"><section aria-label="Planned productive time" className="plant-availability-group">{projection.plan.workCentres.filter((centre) => projection.routing.some((operation) => operation.workCentreId === centre.workCentreId)).map((centre) => <div className="plant-availability-item" key={centre.workCentreId}><div><strong>{centre.name}</strong><small>{centre.workCentreId} · exact order window</small></div><label>Planned productive minutes<input disabled={controlsDisabled} inputMode="decimal" min="0.001" onChange={(event) => setEffectivenessDraft((current) => ({ ...current, workCentres: { ...current.workCentres, [centre.workCentreId]: event.target.value } }))} required step="0.001" type="number" value={effectivenessDraft.workCentres[centre.workCentreId] ?? ''} /></label></div>)}</section></div>
        <label>Closed downtime intervals (optional)<textarea disabled={controlsDisabled} maxLength={32_000} onChange={(event) => setEffectivenessDraft((current) => ({ ...current, downtimeIntervals: event.target.value }))} placeholder="DT-LINESTOP-01 | WC-ASSEMBLY-01 | 2026-07-28T08:20:00+06:30 | 2026-07-28T08:35:00+06:30" rows={3} value={effectivenessDraft.downtimeIntervals} /><small>One row per closed interval: downtime ID | work centre ID | started at | ended at. Intervals must be inside this order window and cannot overlap.</small></label>
        <button className="core-button" disabled={controlsDisabled} type="submit">Review effectiveness evidence</button>
      </form> : <p className="panel-copy">Release the reviewed order before recording its production window.</p>}</details> : null}
      {projection.planRevisions.length ? <details className="compact-disclosure production-history"><summary>Plan revisions <span>{projection.planRevisions.length}/{PLANT_ORDER_PLAN_REVISION_MAX}</span></summary><div className="issue-list">{projection.planRevisions.map((revision, index) => <article key={revision.id}><span aria-hidden="true" className="issue-mark resolved">REV</span><div><strong>{revision.supersededPlanId} → {projection.planHistory[index + 1]?.planId}</strong><small>{revision.reason} · {new Date(revision.proof.capturedAt).toLocaleString()} · {revision.proof.actor}</small></div></article>)}</div><p className="panel-copy">Every predecessor remains digest-bound. A successor clears prior availability and calibration evidence and cannot replace a released package.</p></details> : null}
      {projection.genealogy.length ? <details className="compact-disclosure production-history"><summary>Batch genealogy <span>{projection.genealogy.length}</span></summary><div className="issue-list">{projection.genealogy.map((row, index) => <article key={`${row.materialId}-${row.inputLotId}-${index}`}><span aria-hidden="true" className="issue-mark resolved">LOT</span><div><strong>{row.inputLotId} → {row.outputBatchId}</strong><small>{row.substituteMaterialId ? `${row.substituteMaterialId} · ${formatMilli(row.substituteQuantityMilli ?? 0)} ${row.substituteUnit} → ${row.materialId} credit ${formatMilli(row.issuedQuantityMilli)} ${row.unit}` : `${row.materialId} · ${formatMilli(row.issuedQuantityMilli)} ${row.unit}`}</small></div></article>)}</div></details> : null}
      <p aria-live="polite" className="form-notice">{error || notice || (projection.status === 'released_to_stock' ? 'Batch release is recorded. Post Shop receipt, costing, and accounting only through their own reviewed controls.' : 'Production workspace evidence only. No machine command, external send, inventory posting, payment, or accounting action occurs.')}</p>
    </section>

    <dialog aria-labelledby="plant-execution-setup-title" className="production-issue-dialog" id="plant-execution-setup" onCancel={(event) => { event.preventDefault(); closeSetup() }} ref={setupDialogRef}>
      <div className="panel-head"><div><span className="core-eyebrow">Plant execution</span><h2 id="plant-execution-setup-title">{projection.plan ? 'Revise controlled batch' : 'Set up controlled batch'}</h2></div><button aria-label="Close batch setup" className="text-link" onClick={closeSetup} style={{ minHeight: 44, minWidth: 44 }} type="button">Close</button></div>
      {(!projection.plan || (effectivePlan && !projection.orderRelease)) ? <form autoComplete="off" className="core-form" onSubmit={reviewSetup}>
        <p className="form-notice"><strong>{industryPack.name} pack.</strong> {projection.plan ? 'Review a successor without deleting the prior package.' : `${industryPack.firstWorkflow}. Review quantities and costs before recording.`}</p>
        <label>Active job<select disabled={disabled || Boolean(review) || Boolean(projection.plan)} onChange={(event) => { const job = activeJobs.find((candidate) => candidate.id === event.target.value); setSetupDraft(defaultSetup(job, industryPackId)) }} value={selectedSetupJob?.id ?? ''}>{activeJobs.length ? activeJobs.map((job) => <option key={job.id} value={job.id}>{job.id} · {job.product} · {remaining(job).toLocaleString()} left</option>) : <option value="">No active jobs</option>}</select></label>
        <label>Output batch ID<input disabled={disabled || Boolean(review)} maxLength={80} onChange={(event) => setSetupDraft((current) => ({ ...current, outputBatchId: event.target.value }))} required value={setupDraft.outputBatchId} /></label>
        {projection.plan ? <label>Revision reason<textarea disabled={disabled || Boolean(review)} maxLength={300} onChange={(event) => setSetupDraft((current) => ({ ...current, revisionReason: event.target.value }))} placeholder="Supplier specification changed; revise BOM and release window." required rows={2} value={setupDraft.revisionReason} /><small>This reason and both plan packages remain in the append-only evidence chain.</small></label> : null}
        <div className="form-row"><label>Plan effective from<input disabled={disabled || Boolean(review)} onChange={(event) => setSetupDraft((current) => ({ ...current, effectiveFrom: event.target.value }))} required type="datetime-local" value={setupDraft.effectiveFrom} /></label><label>Plan valid until<input disabled={disabled || Boolean(review)} onChange={(event) => setSetupDraft((current) => ({ ...current, effectiveUntil: event.target.value }))} required type="datetime-local" value={setupDraft.effectiveUntil} /></label></div>
        <small>Supervisors can release only inside this reviewed window. Once released, this exact BOM and routing remain frozen for the batch.</small>
        <details className="compact-disclosure production-history" open>
          <summary>Customize material and routing <span>Up to {PLANT_ORDER_ADDITIONAL_MATERIAL_MAX + 1} materials · {PLANT_ORDER_ADDITIONAL_OPERATION_MAX + 1} operations</span></summary>
          <div className="core-form compact-form">
            <div className="form-row"><label>Material ID<input disabled={disabled || Boolean(review)} maxLength={80} onChange={(event) => setSetupDraft((current) => ({ ...current, materialId: event.target.value }))} required value={setupDraft.materialId} /></label><label>Material name<input disabled={disabled || Boolean(review)} maxLength={180} onChange={(event) => setSetupDraft((current) => ({ ...current, materialName: event.target.value }))} required value={setupDraft.materialName} /></label></div>
            <div className="form-row"><label>Material unit<select disabled={disabled || Boolean(review)} onChange={(event) => setSetupDraft((current) => ({ ...current, materialUnit: event.target.value as PlantOrderMaterial['unit'] }))} value={setupDraft.materialUnit}>{setupMaterialUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label><label>Per output unit<input disabled={disabled || Boolean(review)} inputMode="decimal" min="0.001" onChange={(event) => setSetupDraft((current) => ({ ...current, quantityPerUnit: event.target.value }))} required step="0.001" type="number" value={setupDraft.quantityPerUnit} /></label></div>
            <label>Standard material cost (MMK per material unit)<input disabled={disabled || Boolean(review)} inputMode="numeric" min="1" onChange={(event) => setSetupDraft((current) => ({ ...current, standardCostPerUnitMmk: event.target.value }))} placeholder="Enter reviewed rate" required step="1" type="number" value={setupDraft.standardCostPerUnitMmk} /></label>
            <div className="form-row"><label>Shop supply SKU<select disabled={disabled || Boolean(review)} onChange={(event) => setSetupDraft((current) => ({ ...current, shopSku: event.target.value }))} value={setupDraft.shopSku}><option value="">Map later</option>{commerceState.items.map((item) => <option key={item.sku} value={item.sku}>{item.name} · {item.sku} · {item.onHand} available</option>)}</select></label><label>Material per Shop stock unit<input disabled={disabled || Boolean(review) || !setupDraft.shopSku} inputMode="decimal" min="0.001" onChange={(event) => setSetupDraft((current) => ({ ...current, materialQuantityPerStockUnit: event.target.value }))} placeholder="25 for one 25 kg bag" required={Boolean(setupDraft.shopSku)} step="0.001" type="number" value={setupDraft.materialQuantityPerStockUnit} /></label></div>
            <small>Explicit conversion powers MRP. Example: one Shop bag supplies 25.000 kg. No name matching is used.</small>
            <label>Additional BOM materials (optional)<textarea disabled={disabled || Boolean(review)} maxLength={16_000} onChange={(event) => setSetupDraft((current) => ({ ...current, additionalMaterials: event.target.value }))} placeholder="MAT-RUBBER-01 | Natural rubber | kg | 1.5 | 4200 | SKU-RUBBER-BAG | 25" rows={4} value={setupDraft.additionalMaterials} /><small>One row: material ID | name | unit | quantity per output unit | MMK per material unit | optional Shop SKU | material quantity per stock unit. Add up to {PLANT_ORDER_ADDITIONAL_MATERIAL_MAX}.</small></label>
            <div className="form-row"><label>Work centre ID<input disabled={disabled || Boolean(review)} maxLength={80} onChange={(event) => setSetupDraft((current) => ({ ...current, workCentreId: event.target.value }))} required value={setupDraft.workCentreId} /></label><label>Work centre name<input disabled={disabled || Boolean(review)} maxLength={180} onChange={(event) => setSetupDraft((current) => ({ ...current, workCentreName: event.target.value }))} required value={setupDraft.workCentreName} /></label></div>
            <div className="form-row"><label>Minutes per output unit<input disabled={disabled || Boolean(review)} inputMode="decimal" min="0.001" onChange={(event) => setSetupDraft((current) => ({ ...current, minutesPerUnit: event.target.value }))} required step="0.001" type="number" value={setupDraft.minutesPerUnit} /></label><label>Standard conversion cost (MMK per minute)<input disabled={disabled || Boolean(review)} inputMode="numeric" min="1" onChange={(event) => setSetupDraft((current) => ({ ...current, standardCostPerMinuteMmk: event.target.value }))} placeholder="Enter reviewed rate" required step="1" type="number" value={setupDraft.standardCostPerMinuteMmk} /></label></div>
            <label>Additional routing operations (optional)<textarea disabled={disabled || Boolean(review)} maxLength={16_000} onChange={(event) => setSetupDraft((current) => ({ ...current, additionalOperations: event.target.value }))} placeholder="OP-TEST-20 | Pressure test | WC-TEST-01 | Test bench | 1.5 | 600" rows={4} value={setupDraft.additionalOperations} /><small>One row: operation ID | name | work centre ID | work centre name | minutes per output unit | MMK per minute. Sequence follows row order.</small></label>
          </div>
        </details>
        <p className="panel-copy">One material and one operation are prefilled. Add only the BOM and routing steps this batch needs. No stock, staff, machine, costing, or accounting action occurs.</p>
        <div className="form-actions"><button className="core-button" onClick={closeSetup} type="button">Cancel</button><button className="core-button primary" disabled={disabled || Boolean(review) || !selectedSetupJob} type="submit">{projection.plan ? 'Review plan revision' : 'Review execution plan'}</button></div>
      </form> : null}
    </dialog>

    <dialog aria-labelledby="plant-execution-review-title" className="production-issue-dialog" onCancel={(event) => { event.preventDefault(); editReview() }} ref={reviewDialogRef}>
      {review ? <>
        <div className="panel-head"><div><span className="core-eyebrow">Accountable review</span><h2 id="plant-execution-review-title">{review.title}</h2></div><button aria-label={`Edit ${review.title.toLowerCase()}`} className="text-link" disabled={busy} onClick={editReview} style={{ minHeight: 44, minWidth: 44 }} type="button">Edit</button></div>
        <div className="stock-receipt-preview plant-execution-review" role="status"><small>{review.title} ready</small><strong>{review.summary}</strong></div>
        {review.details?.length ? <dl aria-label={`${review.title} details`} className="action-change-flow">{review.details.map((detail) => <div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}</dl> : null}
        <p className="panel-copy">{review.boundary}</p>
        <p className="panel-copy">Nothing changes until this one action is confirmed.</p>
        <div className="form-actions"><button className="core-button" disabled={busy} onClick={editReview} type="button">Back</button><button className="core-button primary" data-plant-review-primary disabled={busy} onClick={() => void confirmReview()} type="button">{busy ? 'Recording…' : `Confirm ${review.title.toLowerCase()}`}</button></div>
      </> : null}
    </dialog>
  </>
}
