import { sha256Hex } from './managed-trial-proof.ts'
import { createEmptyPlantOrderState, plantOrderEvidenceDigest, projectPlantOrder, type PlantOrderState } from './plant-order-foundation.ts'
import { plantIndustryPack, type PlantIndustryPackId } from './plant-industry-packs.ts'
import { productionOrderPortfolioEntries, validateProductionOrderPortfolio, type ProductionOrderPortfolio } from './production-order-portfolio.ts'
import type { ShopProductionDemandSourceSnapshot } from './shop-production-demand.ts'

export const PRODUCTION_WORKSPACE_SCHEMA = 'supermega.production.workspace.v2' as const
export const PRODUCTION_KEY = 'supermega.production.workspace.v2'
export const LEGACY_PRODUCTION_KEYS = ['supermega.production.workspace.v1', 'supermega.plant.workspace.v2']
export const PRODUCTION_LOCK = 'supermega-production-workspace-v2'
export const PRODUCTION_SHOP_DEMAND_SOURCE_CONTRACT = 'supermega.production.shop-demand-source.v1' as const
export const PRODUCTION_BATCH_GENEALOGY_SCHEMA = 'supermega.production.batch-genealogy.v1' as const
export const PRODUCTION_RECALL_TRACE_SCHEMA = 'supermega.production.recall-trace.v1' as const
export const PRODUCTION_QUALITY_CAPA_SCHEMA = 'supermega.production.quality-capa.v1' as const
export const PRODUCTION_CERTIFICATE_OF_CONFORMANCE_SCHEMA = 'supermega.production.certificate-of-conformance.v1' as const

export type ProductionIssueKind = 'quality' | 'maintenance' | 'materials' | 'operations'
export type ProductionIssueSeverity = 'critical' | 'high' | 'medium' | 'low'
export type ProductionJobPriority = 'urgent' | 'normal' | 'low'
export type ProductionMachineState = 'running' | 'attention' | 'stopped'
export type ProductionMaterialUnit = 'kg' | 'g' | 'l' | 'ml' | 'pcs' | 'pack' | 'bag' | 'roll' | 'sheet' | 'm' | 'cm'
export type ProductionQualityCauseCategory = 'material' | 'method' | 'machine' | 'measurement' | 'people' | 'environment'

export type ProductionQualityHold = {
  actionId: string
  heldAt: string
  heldBy: string
  reason: string
  evidenceReference: string
}

export type ProductionJobClosure = {
  actionId: string
  closedAt: string
  closedBy: string
  reason: string
  evidenceReference: string
  shiftRef: string
  remainingUnits: number
}

export type ProductionShopDemandSource = {
  contract: typeof PRODUCTION_SHOP_DEMAND_SOURCE_CONTRACT
  sourceDigest: string
  evidenceReference: string
  snapshot: ShopProductionDemandSourceSnapshot
}

export type ProductionJob = {
  id: string
  line: string
  product: string
  target: number
  output: number
  owner?: string
  priority?: ProductionJobPriority
  dueAt?: string
  scrap?: number
  qualityHold?: ProductionQualityHold
  closure?: ProductionJobClosure
  shopDemandSource?: ProductionShopDemandSource
}

export function productionJobPlanSourceDigest(scope: string, job: ProductionJob) {
  return plantOrderEvidenceDigest({
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
  })
}

export type ProductionIssueResolution = {
  actionId: string
  resolvedAt: string
  resolvedBy: string
  reason: string
  evidenceReference: string
  maintenanceCorrectiveAction?: ProductionMaintenanceCorrectiveAction
  qualityCorrectiveAction?: ProductionQualityCorrectiveAction
}

export type ProductionQualityCorrectiveAction = {
  contract: typeof PRODUCTION_QUALITY_CAPA_SCHEMA
  failureMode: string
  causeCategory: ProductionQualityCauseCategory
  rootCause: string
  correctiveAction: string
  verificationResult: string
  effectivenessOwner: string
  effectivenessDue: string
  recurrenceKey: string
  priorIssueIds: string[]
}

export type ProductionMaintenanceCorrectiveAction = {
  contract: 'supermega.production.maintenance-corrective-action.v1'
  correctiveAction: string
  verificationResult: string
  finalDisposition: ProductionMaintenanceReturnToService
}

export type ProductionMaintenanceFindingSource = {
  contract: 'supermega.production.maintenance-finding-source.v1'
  equipmentId: string
  equipmentName: string
  maintenanceOwner: string
  completionActionId: string
  completedAt: string
  strategyActionId: string
  strategyRevision: number
  returnToService: 'restricted' | 'not_recommended'
  findings: string
  evidenceReference: string
}

export type ProductionIssue = {
  id: string
  createdAt: string
  area: string
  kind: ProductionIssueKind
  summary: string
  status: 'open' | 'resolved'
  severity?: ProductionIssueSeverity
  owner?: string
  dueAt?: string
  containment?: string
  maintenanceFindingSource?: ProductionMaintenanceFindingSource
  resolution?: ProductionIssueResolution
}

export type ProductionMachine = {
  id: string
  name: string
  state: ProductionMachineState
}

export type ProductionEquipmentCriticality = 'critical' | 'high' | 'medium' | 'low'

export type ProductionEquipmentCommissioning = {
  actionId: string
  commissionedAt: string
  commissionedBy: string
  installedAt: string
  initialState: ProductionMachineState
  safetyBaselineReference: string
}

export type ProductionEquipmentMaintenanceStrategy = {
  revision: number
  actionId: string
  savedAt: string
  savedBy: string
  maintenanceOwner: string
  intervalDays: number
  nextDueAt: string
  procedureReference: string
  safetyBaselineReference: string
}

export type ProductionEquipmentAsset = {
  id: string
  name: string
  workCentreId: string
  criticality: ProductionEquipmentCriticality
  owner: string
  commissioningStatus: 'not_commissioned' | 'commissioned'
  commissioning?: ProductionEquipmentCommissioning
  maintenanceStrategy?: ProductionEquipmentMaintenanceStrategy
  sourceActionId: string
  sourcePackageDigest: string
  importedAt: string
}

export type ProductionEquipmentMaster = {
  contract: 'supermega.production.equipment-master.v1'
  assets: ProductionEquipmentAsset[]
}

export type ProductionOpeningPlan = {
  contract: 'supermega.production.opening-plan.v1'
  packageDigest: string
  confirmedAt: string
  industryPackId?: PlantIndustryPackId
  jobIds: string[]
  machineIds: string[]
}

export type ProductionEventKind = 'job_created' | 'job_schedule_updated' | 'job_closed' | 'output_recorded' | 'material_consumed' | 'issue_opened' | 'issue_resolved' | 'quality_hold_placed' | 'quality_hold_released' | 'machine_state_changed' | 'equipment_master_imported' | 'equipment_commissioned' | 'equipment_maintenance_strategy_saved' | 'downtime_started' | 'downtime_ended' | 'maintenance_started' | 'maintenance_completed' | 'shift_closed'
export type ProductionOutputKind = 'good' | 'scrap'

export type ProductionEvent = {
  id: string
  actionId: string
  createdAt: string
  actor: string
  reason: string
  evidenceReference: string
  kind: ProductionEventKind
  subjectId: string
  summary: string
  quantity?: number
  remainingQuantity?: number
  shiftRef?: string
  outputKind?: ProductionOutputKind
  materialRef?: string
  materialLot?: string
  materialUnit?: ProductionMaterialUnit
  issueSeverity?: ProductionIssueSeverity
  issueOwner?: string
  issueDueAt?: string
  issueContainment?: string
  jobPriority?: ProductionJobPriority
  jobDueAt?: string
  jobOwner?: string
  fromJobPriority?: ProductionJobPriority
  fromJobDueAt?: string
  fromJobOwner?: string
  fromState?: ProductionMachineState
  toState?: ProductionMachineState
  downtimeStartActionId?: string
  maintenanceOwner?: string
  maintenanceStartActionId?: string
  sourceRevision?: number
  sourceDigest?: string
  goodUnits?: number
  scrapUnits?: number
  outputEntryCount?: number
  materialEntryCount?: number
  maintenanceStrategyActionId?: string
  maintenanceStrategyRevision?: number
  maintenanceProcedureReference?: string
  maintenancePlannedDueAt?: string
  maintenanceOutcome?: ProductionMaintenanceOutcome
  maintenanceFindings?: string
  maintenanceProcedureCompleted?: boolean
  maintenanceReturnToService?: ProductionMaintenanceReturnToService
  maintenanceFindingSource?: ProductionMaintenanceFindingSource
  maintenanceCorrectiveAction?: ProductionMaintenanceCorrectiveAction
  qualityCorrectiveAction?: ProductionQualityCorrectiveAction
  equipmentIds?: string[]
  installedAt?: string
  workCentreId?: string
  strategyRevision?: number
  intervalDays?: number
  nextDueAt?: string
  procedureReference?: string
}

export type ProductionState = {
  schema: typeof PRODUCTION_WORKSPACE_SCHEMA
  revision: number
  jobs: ProductionJob[]
  issues: ProductionIssue[]
  machines: ProductionMachine[]
  events: ProductionEvent[]
  openingPlan?: ProductionOpeningPlan
  orderExecution?: PlantOrderState
  orderPortfolio?: ProductionOrderPortfolio
  equipmentMaster?: ProductionEquipmentMaster
}

export type ProductionActionProof = {
  actionId: string
  capturedAt: string
  actor: string
  reason: string
  evidenceReference: string
}

type ProductionStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

type ProductionLockManager = {
  request: <T>(name: string, options: { mode: 'exclusive' }, callback: () => T | Promise<T>) => Promise<T>
}

export type ProductionWorkspaceSnapshot = {
  state: ProductionState
  source: 'current' | 'legacy' | 'seed' | 'recovery'
  error: string
}

export type ProductionWorkspaceReadSnapshot = {
  state: ProductionState
  source: 'current' | 'legacy' | 'absent' | 'recovery'
  error: string
}

export type ProductionMutationResult =
  | { ok: true; state: ProductionState; replayed: boolean }
  | { ok: false; error: string }

export type ProductionWorkspaceMutationKind = 'operating-event' | 'order-execution' | 'working-sample'

export type ProductionShiftOutput = {
  goodUnits: number
  scrapUnits: number
  entryCount: number
}

export type ProductionShiftHandoff = {
  shiftRef: string
  plantOrderScope: string
  sourceRevision: number
  sourceCanonical: string
  shiftOutput: ProductionShiftOutput
  shiftEntries: Array<{
    actionId: string
    jobId: string
    product: string
    outputKind: ProductionOutputKind
    quantity: number
    recordedAt: string
    recordedBy: string
    reason: string
    evidenceReference: string
  }>
  materialEntries: Array<{
    actionId: string
    jobId: string
    product: string
    materialRef: string
    materialLot?: string
    materialUnit: ProductionMaterialUnit
    quantity: number
    recordedAt: string
    recordedBy: string
    reason: string
    evidenceReference: string
  }>
  materialTotals: Array<{
    materialRef: string
    materialUnit: ProductionMaterialUnit
    quantity: number
    entryCount: number
  }>
  shortCloses: Array<{
    actionId: string
    jobId: string
    product: string
    shiftRef: string
    goodUnits: number
    scrapUnits: number
    remainingUnits: number
    recordedAt: string
    recordedBy: string
    reason: string
    evidenceReference: string
  }>
  controlledOrders: Array<{
    jobId: string
    product: string
    planId: string
    planDigest: string
    bindingCurrent: boolean
    status: 'planned' | 'shortfall' | 'ready' | 'released' | 'in_process' | 'inspection_due' | 'quality_hold' | 'ready_to_release' | 'released_to_stock'
    disposition: 'released' | 'complete_not_released' | 'carry_forward'
    targetUnits: number
    outputUnits: number
    acceptedUnits: number
    completedOperationCount: number
    operationCount: number
    genealogyLinkCount: number
    owner?: string
    dueAt?: string
    nextOperation?: {
      operationId: string
      name: string
      status: 'blocked' | 'ready' | 'in_progress'
      remainingUnits: number
    }
    inspection?: {
      inspectionId: string
      result: 'pass' | 'fail'
      inspectedUnits: number
      acceptedUnits: number
      rejectedUnits: number
      actionId: string
      evidenceReference: string
    }
    batchRelease?: {
      releaseId: string
      actionId: string
      releasedAt: string
      releasedBy: string
      evidenceReference: string
    }
    exceptions: string[]
    blockingReasons: string[]
  }>
  unfinishedJobs: Array<{
    id: string
    line: string
    product: string
    target: number
    goodUnits: number
    scrapUnits: number
    remainingUnits: number
    owner?: string
    priority?: ProductionJobPriority
    dueAt?: string
    qualityHold?: ProductionQualityHold
  }>
  activeHolds: Array<{
    id: string
    line: string
    product: string
    target: number
    goodUnits: number
    scrapUnits: number
    remainingUnits: number
    qualityHold: ProductionQualityHold
  }>
  priorityProblems: Array<{
    id: string
    severity: 'critical' | 'high'
    area: string
    summary: string
    openedAt: string
    owner: string
    dueAt: string
    containment: string
    actionId: string
    openedBy: string
    evidenceReference: string
  }>
  openQualityIssues: Array<{
    id: string
    severity: ProductionIssueSeverity
    area: string
    summary: string
    owner: string
    dueAt: string
    containment: string
  }>
  activeDowntime: ProductionDowntimeInterval[]
  activeMaintenance: Array<Omit<ProductionMaintenanceRecord, 'completion'>>
  machineObservations: Array<{
    id: string
    name: string
    state: ProductionMachineState
    observation: null | {
      actionId: string
      observedAt: string
      observedBy: string
      reason: string
      evidenceReference: string
    }
  }>
}

export type ProductionDowntimeInterval = {
  startActionId: string
  machineId: string
  machineName: string
  startedAt: string
  startedBy: string
  startReason: string
  startEvidenceReference: string
  end?: {
    actionId: string
    endedAt: string
    endedBy: string
    reason: string
    evidenceReference: string
  }
  durationMs?: number
}

export type ProductionMaintenanceRecord = {
  startActionId: string
  machineId: string
  machineName: string
  owner: string
  startedAt: string
  startedBy: string
  scope: string
  startEvidenceReference: string
  strategy?: {
    actionId: string
    revision: number
    procedureReference: string
    plannedDueAt: string
  }
  completion?: {
    actionId: string
    completedAt: string
    completedBy: string
    outcome: string
    evidenceReference: string
    nextDueAt?: string
    result?: ProductionMaintenanceResult
  }
}

export type ProductionMaintenanceOutcome = 'completed' | 'completed_with_findings'
export type ProductionMaintenanceReturnToService = 'recommended' | 'restricted' | 'not_recommended'

export type ProductionMaintenanceResult = {
  outcome: ProductionMaintenanceOutcome
  findings: string
  procedureCompleted: true
  returnToService: ProductionMaintenanceReturnToService
}

export type ProductionMaintenanceDueItem = {
  assetId: string
  assetName: string
  criticality: ProductionEquipmentCriticality
  owner: string
  strategyActionId: string
  strategyRevision: number
  procedureReference: string
  dueAt: string
  status: 'overdue' | 'due_soon' | 'planned'
  daysUntilDue: number
  lastCompletionActionId?: string
  lastCompletedAt?: string
}

export type ProductionMaintenanceDueQueue = {
  contract: 'supermega.production.maintenance-due-queue.v1'
  asOf: string
  items: ProductionMaintenanceDueItem[]
}

const issueKinds: ProductionIssueKind[] = ['quality', 'maintenance', 'materials', 'operations']
export const productionIssueSeverities: ProductionIssueSeverity[] = ['critical', 'high', 'medium', 'low']
export const productionJobPriorities: ProductionJobPriority[] = ['urgent', 'normal', 'low']
export const productionMachineStates: ProductionMachineState[] = ['running', 'attention', 'stopped']
export const productionMaterialUnits: ProductionMaterialUnit[] = ['kg', 'g', 'l', 'ml', 'pcs', 'pack', 'bag', 'roll', 'sheet', 'm', 'cm']
export const productionQualityCauseCategories: ProductionQualityCauseCategory[] = ['material', 'method', 'machine', 'measurement', 'people', 'environment']
const eventKinds: ProductionEventKind[] = ['job_created', 'job_schedule_updated', 'job_closed', 'output_recorded', 'material_consumed', 'issue_opened', 'issue_resolved', 'quality_hold_placed', 'quality_hold_released', 'machine_state_changed', 'equipment_master_imported', 'equipment_commissioned', 'equipment_maintenance_strategy_saved', 'downtime_started', 'downtime_ended', 'maintenance_started', 'maintenance_completed', 'shift_closed']
const baseEventFields = ['id', 'actionId', 'createdAt', 'actor', 'reason', 'evidenceReference', 'kind', 'subjectId', 'summary']
const jobCreatedEventFields = [...baseEventFields, 'jobPriority', 'jobDueAt', 'jobOwner']
const jobScheduleUpdateEventFields = [...jobCreatedEventFields, 'fromJobPriority', 'fromJobDueAt', 'fromJobOwner']
const jobClosedEventFields = [...baseEventFields, 'shiftRef', 'remainingQuantity']
const qualityHoldEventFields = baseEventFields
const materialEventFields = [...baseEventFields, 'quantity', 'shiftRef', 'materialRef', 'materialUnit']
const materialOptionalEventFields = ['materialLot']
const downtimeEndEventFields = [...baseEventFields, 'downtimeStartActionId']
const shiftClosedEventFields = [...baseEventFields, 'shiftRef', 'sourceRevision', 'sourceDigest', 'goodUnits', 'scrapUnits', 'outputEntryCount', 'materialEntryCount']
const maintenanceStrategyBindingFields = ['maintenanceStrategyActionId', 'maintenanceStrategyRevision', 'maintenanceProcedureReference', 'maintenancePlannedDueAt']
const maintenanceResultFields = ['maintenanceOutcome', 'maintenanceFindings', 'maintenanceProcedureCompleted', 'maintenanceReturnToService']
const maintenanceStartEventFields = [...baseEventFields, 'maintenanceOwner', ...maintenanceStrategyBindingFields]
const maintenanceCompleteEventFields = [...baseEventFields, 'maintenanceStartActionId', ...maintenanceStrategyBindingFields, ...maintenanceResultFields, 'nextDueAt']
const maintenanceHistoricalCompleteEventFields = maintenanceCompleteEventFields.filter((field) => !maintenanceResultFields.includes(field))
const equipmentImportEventFields = [...baseEventFields, 'equipmentIds']
const equipmentCommissionEventFields = [...baseEventFields, 'installedAt', 'toState', 'workCentreId']
const equipmentMaintenanceStrategyEventFields = [...baseEventFields, 'strategyRevision', 'maintenanceOwner', 'intervalDays', 'nextDueAt', 'procedureReference']
const productionStateFields = ['schema', 'revision', 'jobs', 'issues', 'machines', 'events', 'openingPlan', 'orderExecution', 'orderPortfolio', 'equipmentMaster']
const productionOpeningPlanFields = ['contract', 'packageDigest', 'confirmedAt', 'industryPackId', 'jobIds', 'machineIds']
const productionJobFields = ['id', 'line', 'product', 'target', 'output', 'owner', 'priority', 'dueAt', 'scrap', 'qualityHold', 'closure', 'shopDemandSource']
const productionShopDemandSourceFields = ['contract', 'sourceDigest', 'evidenceReference', 'snapshot']
const productionShopDemandSnapshotFields = ['schema', 'operatingUnitLocationId', 'sku', 'productName', 'sourceOrderIds', 'activeDemandUnits', 'uncoveredDemandUnits', 'availableToPromiseUnits', 'reorderAtUnits', 'replenishmentGapUnits', 'recommendedBatchUnits']
const productionIssueFields = ['id', 'createdAt', 'area', 'kind', 'summary', 'status', 'severity', 'owner', 'dueAt', 'containment', 'maintenanceFindingSource', 'resolution']
const productionMaintenanceFindingSourceFields = ['contract', 'equipmentId', 'equipmentName', 'maintenanceOwner', 'completionActionId', 'completedAt', 'strategyActionId', 'strategyRevision', 'returnToService', 'findings', 'evidenceReference']
const productionMaintenanceCorrectiveActionFields = ['contract', 'correctiveAction', 'verificationResult', 'finalDisposition']
const productionQualityCorrectiveActionFields = ['contract', 'failureMode', 'causeCategory', 'rootCause', 'correctiveAction', 'verificationResult', 'effectivenessOwner', 'effectivenessDue', 'recurrenceKey', 'priorIssueIds']
const productionIssueResolutionFields = ['actionId', 'resolvedAt', 'resolvedBy', 'reason', 'evidenceReference', 'maintenanceCorrectiveAction', 'qualityCorrectiveAction']
const productionMachineFields = ['id', 'name', 'state']
const productionEquipmentMasterFields = ['contract', 'assets']
const productionEquipmentAssetFields = ['id', 'name', 'workCentreId', 'criticality', 'owner', 'commissioningStatus', 'sourceActionId', 'sourcePackageDigest', 'importedAt']
const productionEquipmentCommissioningFields = ['actionId', 'commissionedAt', 'commissionedBy', 'installedAt', 'initialState', 'safetyBaselineReference']
const productionEquipmentMaintenanceStrategyFields = ['revision', 'actionId', 'savedAt', 'savedBy', 'maintenanceOwner', 'intervalDays', 'nextDueAt', 'procedureReference', 'safetyBaselineReference']
const productionEquipmentCriticalities: ProductionEquipmentCriticality[] = ['critical', 'high', 'medium', 'low']
const productionMaintenanceOutcomes: ProductionMaintenanceOutcome[] = ['completed', 'completed_with_findings']
const productionMaintenanceReturnToServiceValues: ProductionMaintenanceReturnToService[] = ['recommended', 'restricted', 'not_recommended']
const eventFieldsByKind: Record<ProductionEventKind, string[]> = {
  job_created: jobCreatedEventFields,
  job_schedule_updated: jobScheduleUpdateEventFields,
  job_closed: jobClosedEventFields,
  output_recorded: [...baseEventFields, 'quantity', 'shiftRef', 'outputKind'],
  material_consumed: [...materialEventFields, ...materialOptionalEventFields],
  issue_opened: [...baseEventFields, 'issueSeverity', 'issueOwner', 'issueDueAt', 'issueContainment', 'maintenanceFindingSource'],
  issue_resolved: [...baseEventFields, 'maintenanceCorrectiveAction', 'qualityCorrectiveAction'],
  quality_hold_placed: qualityHoldEventFields,
  quality_hold_released: qualityHoldEventFields,
  machine_state_changed: [...baseEventFields, 'fromState', 'toState'],
  equipment_master_imported: equipmentImportEventFields,
  equipment_commissioned: equipmentCommissionEventFields,
  equipment_maintenance_strategy_saved: equipmentMaintenanceStrategyEventFields,
  downtime_started: baseEventFields,
  downtime_ended: downtimeEndEventFields,
  maintenance_started: maintenanceStartEventFields,
  maintenance_completed: maintenanceCompleteEventFields,
  shift_closed: shiftClosedEventFields,
}
const deterministicSeedNow = Date.parse('2026-07-23T08:00:00.000Z')
const productionSeedAnchorIssueId = 'ISS-301'
const productionSeedAnchorOffsetMs = 82 * 60 * 1000

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertOnlyFields(value: Record<string, unknown>, allowedFields: string[], field: string) {
  const unexpected = Object.keys(value).filter((key) => !allowedFields.includes(key))
  if (unexpected.length) throw new Error(`${field} has unsupported fields: ${unexpected.sort().join(', ')}.`)
}

function requiredText(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be a non-empty string.`)
  return value.trim()
}

function canonicalText(value: unknown, field: string, maximum = 180) {
  const text = requiredText(value, field)
  if (value !== text || text.length > maximum) throw new Error(`${field} must be canonical text of at most ${maximum} characters.`)
  return text
}

function validCanonicalText(value: unknown, maximum = 180) {
  return typeof value === 'string' && value === value.trim() && value.length > 0 && value.length <= maximum
}

function materialQuantityMilli(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  const match = /^(\d+)(?:\.(\d{1,3}))?$/.exec(String(value))
  if (!match) return null
  const scaled = (BigInt(match[1]) * 1_000n) + BigInt((match[2] ?? '').padEnd(3, '0'))
  if (scaled < 1n || scaled > BigInt(Number.MAX_SAFE_INTEGER)) return null
  return Number(scaled)
}

function validMaterialQuantity(value: unknown): value is number {
  return materialQuantityMilli(value) !== null
}

function materialQuantityText(value: number) {
  return String(value)
}

export function parseProductionMaterialQuantity(value: string) {
  const match = /^(\d+)(?:\.(\d{1,3}))?$/.exec(value.trim())
  if (!match) return null
  const scaled = (BigInt(match[1]) * 1_000n) + BigInt((match[2] ?? '').padEnd(3, '0'))
  if (scaled < 1n || scaled > BigInt(Number.MAX_SAFE_INTEGER)) return null
  const quantity = Number(value)
  return Number.isFinite(quantity) && materialQuantityMilli(quantity) === Number(scaled)
    ? quantity
    : null
}

const timestampPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/

function timestampMicros(value: unknown) {
  if (typeof value !== 'string' || value !== value.trim()) return null
  const match = timestampPattern.exec(value)
  if (!match) return null
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number)
  const offsetHour = Number(match[10] ?? 0)
  const offsetMinute = Number(match[11] ?? 0)
  if (year < 1 || offsetHour > 23 || offsetMinute > 59) return null
  const local = new Date(0)
  local.setUTCFullYear(year, month - 1, day)
  local.setUTCHours(hour, minute, second, 0)
  if (local.getUTCFullYear() !== year
    || local.getUTCMonth() !== month - 1
    || local.getUTCDate() !== day
    || local.getUTCHours() !== hour
    || local.getUTCMinutes() !== minute
    || local.getUTCSeconds() !== second) return null
  const fractionMicros = BigInt((match[7] ?? '').padEnd(6, '0'))
  const offsetSign = match[9] === '-' ? -1n : 1n
  const offsetMicros = offsetSign * BigInt((offsetHour * 60) + offsetMinute) * 60_000_000n
  return (BigInt(local.getTime()) * 1_000n) + fractionMicros - offsetMicros
}

function validTimestamp(value: unknown) {
  return timestampMicros(value) !== null
}

function timestampBefore(left: string, right: string) {
  const leftMicros = timestampMicros(left)
  const rightMicros = timestampMicros(right)
  return leftMicros !== null && rightMicros !== null && leftMicros < rightMicros
}

function timestampAtOrBefore(left: string, right: string) {
  const leftMicros = timestampMicros(left)
  const rightMicros = timestampMicros(right)
  return leftMicros !== null && rightMicros !== null && leftMicros <= rightMicros
}

function compareTimestamps(left: string, right: string) {
  const leftMicros = timestampMicros(left)
  const rightMicros = timestampMicros(right)
  if (leftMicros === null || rightMicros === null || leftMicros === rightMicros) return 0
  return leftMicros < rightMicros ? -1 : 1
}

const productionJobPriorityRank: Record<ProductionJobPriority, number> = {
  urgent: 0,
  normal: 1,
  low: 2,
}

export function compareProductionJobSchedule(left: ProductionJob, right: ProductionJob) {
  const priorityDifference = (left.priority ? productionJobPriorityRank[left.priority] : 3)
    - (right.priority ? productionJobPriorityRank[right.priority] : 3)
  if (priorityDifference) return priorityDifference
  const dueDifference = left.dueAt && right.dueAt
    ? compareTimestamps(left.dueAt, right.dueAt)
    : left.dueAt
      ? -1
      : right.dueAt
        ? 1
        : 0
  return dueDifference || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
}

function validDowntimeTimestamp(value: unknown) {
  return validTimestamp(value)
    && /^(?!0000)\d{4}-/.test(String(value))
    && new Date(Date.parse(value as string)).toISOString() === value
}

function assertSafeInteger(value: unknown, field: string, minimum = 0) {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) throw new Error(`${field} must be a safe integer of at least ${minimum}.`)
}

function assertUnique(values: string[], field: string) {
  if (new Set(values).size !== values.length) throw new Error(`${field} values must be unique.`)
}

function validateProductionMaintenanceFindingSource(value: unknown, field: string): ProductionMaintenanceFindingSource {
  if (!isRecord(value)) throw new Error(`${field} is invalid.`)
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...productionMaintenanceFindingSourceFields].sort())) throw new Error(`${field} fields are invalid.`)
  if (value.contract !== 'supermega.production.maintenance-finding-source.v1') throw new Error(`${field}.contract is invalid.`)
  canonicalText(value.equipmentId, `${field}.equipmentId`, 80)
  canonicalText(value.equipmentName, `${field}.equipmentName`, 120)
  canonicalText(value.maintenanceOwner, `${field}.maintenanceOwner`, 120)
  canonicalText(value.completionActionId, `${field}.completionActionId`, 160)
  if (!validDowntimeTimestamp(value.completedAt)) throw new Error(`${field}.completedAt is invalid.`)
  canonicalText(value.strategyActionId, `${field}.strategyActionId`, 160)
  assertSafeInteger(value.strategyRevision, `${field}.strategyRevision`, 1)
  if (value.returnToService !== 'restricted' && value.returnToService !== 'not_recommended') throw new Error(`${field}.returnToService is invalid.`)
  canonicalText(value.findings, `${field}.findings`, 360)
  canonicalText(value.evidenceReference, `${field}.evidenceReference`)
  return value as unknown as ProductionMaintenanceFindingSource
}

function validateProductionMaintenanceCorrectiveAction(value: unknown, field: string): ProductionMaintenanceCorrectiveAction {
  if (!isRecord(value)) throw new Error(`${field} is invalid.`)
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...productionMaintenanceCorrectiveActionFields].sort())) throw new Error(`${field} fields are invalid.`)
  if (value.contract !== 'supermega.production.maintenance-corrective-action.v1') throw new Error(`${field}.contract is invalid.`)
  canonicalText(value.correctiveAction, `${field}.correctiveAction`, 360)
  canonicalText(value.verificationResult, `${field}.verificationResult`, 360)
  if (!productionMaintenanceReturnToServiceValues.includes(value.finalDisposition as ProductionMaintenanceReturnToService)) throw new Error(`${field}.finalDisposition is invalid.`)
  return value as unknown as ProductionMaintenanceCorrectiveAction
}

function productionQualityRecurrenceToken(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

function productionQualityRecurrenceKey(failureMode: string, causeCategory: ProductionQualityCauseCategory) {
  return `${causeCategory}:${productionQualityRecurrenceToken(failureMode)}`
}

function validateProductionQualityCorrectiveAction(value: unknown, field: string): ProductionQualityCorrectiveAction {
  if (!isRecord(value)) throw new Error(`${field} is invalid.`)
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...productionQualityCorrectiveActionFields].sort())) throw new Error(`${field} fields are invalid.`)
  if (value.contract !== PRODUCTION_QUALITY_CAPA_SCHEMA) throw new Error(`${field}.contract is invalid.`)
  const failureMode = canonicalText(value.failureMode, `${field}.failureMode`, 120)
  if (!productionQualityCauseCategories.includes(value.causeCategory as ProductionQualityCauseCategory)) throw new Error(`${field}.causeCategory is invalid.`)
  canonicalText(value.rootCause, `${field}.rootCause`, 360)
  canonicalText(value.correctiveAction, `${field}.correctiveAction`, 360)
  canonicalText(value.verificationResult, `${field}.verificationResult`, 360)
  canonicalText(value.effectivenessOwner, `${field}.effectivenessOwner`, 120)
  if (!validTimestamp(value.effectivenessDue)) throw new Error(`${field}.effectivenessDue is invalid.`)
  const recurrenceKey = canonicalText(value.recurrenceKey, `${field}.recurrenceKey`, 160)
  if (!productionQualityRecurrenceToken(failureMode) || recurrenceKey !== productionQualityRecurrenceKey(failureMode, value.causeCategory as ProductionQualityCauseCategory)) throw new Error(`${field}.recurrenceKey is invalid.`)
  if (!Array.isArray(value.priorIssueIds) || value.priorIssueIds.length > 500) throw new Error(`${field}.priorIssueIds is invalid.`)
  const priorIssueIds = value.priorIssueIds.map((issueId, index) => canonicalText(issueId, `${field}.priorIssueIds[${index}]`, 80))
  assertUnique(priorIssueIds, `${field}.priorIssueIds`)
  return value as unknown as ProductionQualityCorrectiveAction
}

function productionQualityPriorIssueIds(issues: ProductionIssue[], issueId: string, recurrenceKey: string, resolvedBefore?: string) {
  return issues
    .filter((candidate) => candidate.id !== issueId
      && candidate.kind === 'quality'
      && candidate.status === 'resolved'
      && candidate.resolution?.qualityCorrectiveAction?.recurrenceKey === recurrenceKey
      && (!resolvedBefore || timestampBefore(candidate.resolution.resolvedAt, resolvedBefore)))
    .sort((left, right) => compareTimestamps(left.resolution?.resolvedAt ?? left.createdAt, right.resolution?.resolvedAt ?? right.createdAt)
      || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    .map((candidate) => candidate.id)
}

export function buildProductionQualityCorrectiveAction(state: ProductionState, issueId: string, input: {
  failureMode: string
  causeCategory: ProductionQualityCauseCategory
  rootCause: string
  correctiveAction: string
  verificationResult: string
  effectivenessOwner: string
  effectivenessDue: string
}) {
  const issue = state.issues.find((candidate) => candidate.id === issueId)
  if (!issue || issue.kind !== 'quality' || issue.status !== 'open'
    || !validCanonicalText(input.failureMode, 120)
    || !productionQualityCauseCategories.includes(input.causeCategory)
    || !validCanonicalText(input.rootCause, 360)
    || !validCanonicalText(input.correctiveAction, 360)
    || !validCanonicalText(input.verificationResult, 360)
    || !validCanonicalText(input.effectivenessOwner, 120)
    || !validTimestamp(input.effectivenessDue)) return null
  const recurrenceToken = productionQualityRecurrenceToken(input.failureMode)
  if (!recurrenceToken) return null
  const recurrenceKey = `${input.causeCategory}:${recurrenceToken}`
  if (recurrenceKey.length > 160) return null
  const result: ProductionQualityCorrectiveAction = {
    contract: PRODUCTION_QUALITY_CAPA_SCHEMA,
    ...input,
    recurrenceKey,
    priorIssueIds: productionQualityPriorIssueIds(state.issues, issueId, recurrenceKey),
  }
  try { return validateProductionQualityCorrectiveAction(result, 'qualityCorrectiveAction') } catch { return null }
}

export function isCapaEffectivenessOverdue(capa: ProductionQualityCorrectiveAction, asOf: string): boolean {
  return timestampBefore(capa.effectivenessDue, asOf)
}

function validateProductionShopDemandSource(value: unknown, field: string): ProductionShopDemandSource {
  if (!isRecord(value)) throw new Error(`${field} is invalid.`)
  assertOnlyFields(value, productionShopDemandSourceFields, field)
  if (value.contract !== PRODUCTION_SHOP_DEMAND_SOURCE_CONTRACT) throw new Error(`${field}.contract is invalid.`)
  if (!isRecord(value.snapshot)) throw new Error(`${field}.snapshot is invalid.`)
  const snapshot = value.snapshot
  assertOnlyFields(snapshot, productionShopDemandSnapshotFields, `${field}.snapshot`)
  if (snapshot.schema !== 'supermega.shop_production_demand.v1') throw new Error(`${field}.snapshot.schema is invalid.`)
  if (snapshot.operatingUnitLocationId !== 'LOC-MAIN') throw new Error(`${field}.snapshot operating unit is invalid.`)
  const sku = canonicalText(snapshot.sku, `${field}.snapshot.sku`, 80)
  const productName = canonicalText(snapshot.productName, `${field}.snapshot.productName`)
  if (!Array.isArray(snapshot.sourceOrderIds) || snapshot.sourceOrderIds.length > 100) throw new Error(`${field}.snapshot.sourceOrderIds is invalid.`)
  const sourceOrderIds = snapshot.sourceOrderIds.map((id, index) => canonicalText(id, `${field}.snapshot.sourceOrderIds[${index}]`, 80))
  assertUnique(sourceOrderIds, `${field}.snapshot.sourceOrderIds`)
  if (JSON.stringify(sourceOrderIds) !== JSON.stringify([...sourceOrderIds].sort((left, right) => left.localeCompare(right)))) throw new Error(`${field}.snapshot.sourceOrderIds must be sorted.`)
  const metricFields = ['activeDemandUnits', 'uncoveredDemandUnits', 'availableToPromiseUnits', 'reorderAtUnits', 'replenishmentGapUnits', 'recommendedBatchUnits'] as const
  for (const metric of metricFields) assertSafeInteger(snapshot[metric], `${field}.snapshot.${metric}`, metric === 'recommendedBatchUnits' ? 1 : 0)
  const activeDemandUnits = Number(snapshot.activeDemandUnits)
  const uncoveredDemandUnits = Number(snapshot.uncoveredDemandUnits)
  const availableToPromiseUnits = Number(snapshot.availableToPromiseUnits)
  const reorderAtUnits = Number(snapshot.reorderAtUnits)
  const replenishmentGapUnits = Number(snapshot.replenishmentGapUnits)
  const recommendedBatchUnits = Number(snapshot.recommendedBatchUnits)
  if (uncoveredDemandUnits !== Math.max(0, activeDemandUnits - availableToPromiseUnits)
    || replenishmentGapUnits !== Math.max(0, reorderAtUnits - availableToPromiseUnits)
    || recommendedBatchUnits !== Math.max(1, uncoveredDemandUnits, replenishmentGapUnits)) throw new Error(`${field}.snapshot demand metrics are inconsistent.`)
  const canonicalSnapshot: ShopProductionDemandSourceSnapshot = {
    schema: 'supermega.shop_production_demand.v1',
    operatingUnitLocationId: 'LOC-MAIN',
    sku,
    productName,
    sourceOrderIds,
    activeDemandUnits,
    uncoveredDemandUnits,
    availableToPromiseUnits,
    reorderAtUnits,
    replenishmentGapUnits,
    recommendedBatchUnits,
  }
  const sourceDigest = canonicalText(value.sourceDigest, `${field}.sourceDigest`, 71)
  if (!/^sha256:[0-9a-f]{64}$/.test(sourceDigest) || sourceDigest !== plantOrderEvidenceDigest(canonicalSnapshot)) throw new Error(`${field}.sourceDigest does not match its canonical snapshot.`)
  const evidenceReference = canonicalText(value.evidenceReference, `${field}.evidenceReference`)
  if (evidenceReference !== `SHOP-DEMAND:${sourceDigest}:LOC-MAIN`) throw new Error(`${field}.evidenceReference is invalid.`)
  return { contract: PRODUCTION_SHOP_DEMAND_SOURCE_CONTRACT, sourceDigest, evidenceReference, snapshot: canonicalSnapshot }
}

export function productionShopDemandSource(input: {
  sourceSnapshot: ShopProductionDemandSourceSnapshot
  sourceDigest: string
  evidenceReference: string
}) {
  return validateProductionShopDemandSource({
    contract: PRODUCTION_SHOP_DEMAND_SOURCE_CONTRACT,
    sourceDigest: input.sourceDigest,
    evidenceReference: input.evidenceReference,
    snapshot: input.sourceSnapshot,
  }, 'Shop demand source')
}

function validProof(proof: unknown): proof is ProductionActionProof {
  if (!isRecord(proof)) return false
  return Boolean(
    typeof proof.actionId === 'string'
    && proof.actionId === proof.actionId.trim()
    && proof.actionId.length > 0
    && proof.actionId.length <= 160
    && typeof proof.actor === 'string'
    && proof.actor === proof.actor.trim()
    && proof.actor.length > 0
    && proof.actor.length <= 180
    && typeof proof.reason === 'string'
    && proof.reason === proof.reason.trim()
    && proof.reason.length > 0
    && proof.reason.length <= 180
    && typeof proof.evidenceReference === 'string'
    && proof.evidenceReference === proof.evidenceReference.trim()
    && proof.evidenceReference.length > 0
    && proof.evidenceReference.length <= 180
    && validTimestamp(proof.capturedAt),
  )
}

function sameProof(event: ProductionEvent, proof: ProductionActionProof) {
  return event.actionId === proof.actionId
    && event.createdAt === proof.capturedAt
    && event.actor === proof.actor
    && event.reason === proof.reason
    && event.evidenceReference === proof.evidenceReference
}

function eventFor(
  proof: ProductionActionProof,
  input: Omit<ProductionEvent, 'id' | 'actionId' | 'createdAt' | 'actor' | 'reason' | 'evidenceReference'>,
): ProductionEvent {
  return {
    id: `EVT-${proof.actionId}`,
    actionId: proof.actionId,
    createdAt: proof.capturedAt,
    actor: proof.actor,
    reason: proof.reason,
    evidenceReference: proof.evidenceReference,
    ...input,
  }
}

export function createEmptyProduction(): ProductionState {
  return { schema: PRODUCTION_WORKSPACE_SCHEMA, revision: 0, jobs: [], issues: [], machines: [], events: [] }
}

export function createSeedProduction(now = deterministicSeedNow): ProductionState {
  return {
    schema: PRODUCTION_WORKSPACE_SCHEMA,
    revision: 0,
    jobs: [
      { id: 'JOB-201', line: 'Line 01', product: 'Batch Alpha', target: 1200, output: 860, owner: 'Line 01 lead', priority: 'urgent', dueAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString() },
      { id: 'JOB-202', line: 'Line 02', product: 'Batch Beta', target: 900, output: 745, owner: 'Line 02 lead', priority: 'normal', dueAt: new Date(now + 8 * 24 * 60 * 60 * 1000).toISOString() },
      { id: 'JOB-203', line: 'Line 03', product: 'Batch Gamma', target: 650, output: 650, owner: 'Line 03 lead', priority: 'low', dueAt: new Date(now + 6 * 24 * 60 * 60 * 1000).toISOString() },
    ],
    issues: [
      { id: 'ISS-301', createdAt: new Date(now - 82 * 60 * 1000).toISOString(), area: 'Line 02', kind: 'quality', summary: 'Temperature drift requires supervisor review', status: 'open' },
    ],
    machines: [
      { id: 'MC-01', name: 'Mixer 01', state: 'running' },
      { id: 'MC-02', name: 'Press 02', state: 'attention' },
      { id: 'MC-03', name: 'Finishing 01', state: 'running' },
    ],
    events: [],
  }
}

// The seed is generated relative to a caller-supplied instant so a demo opened today reads as
// today's work. Pristine-workspace checks recover that instant from the seeded issue rather than
// assuming a fixed one, mirroring how upgradeCommerceSeedPolicies recovers the catalog baseline
// time. A wrong recovery cannot pass a check: the regenerated seed simply fails to match.
export function productionSeedAnchor(state: ProductionState) {
  const issue = state.issues.find((candidate) => candidate.id === productionSeedAnchorIssueId)
  if (!issue) return null
  const createdAt = Date.parse(issue.createdAt)
  return Number.isFinite(createdAt) ? createdAt + productionSeedAnchorOffsetMs : null
}

export function validateProductionState(value: unknown): ProductionState {
  if (!isRecord(value) || value.schema !== PRODUCTION_WORKSPACE_SCHEMA) throw new Error('Production workspace schema is not v2.')
  assertOnlyFields(value, productionStateFields, 'Production workspace')
  assertSafeInteger(value.revision, 'Production workspace revision')
  if (!Array.isArray(value.jobs) || !Array.isArray(value.issues) || !Array.isArray(value.machines) || !Array.isArray(value.events)) throw new Error('Production workspace collections are incomplete.')

  const jobs = value.jobs as unknown[]
  const issues = value.issues as unknown[]
  const machines = value.machines as unknown[]
  const events = value.events as unknown[]
  const jobIds: string[] = []
  const issueIds: string[] = []
  const machineIds: string[] = []
  const equipmentIds: string[] = []
  let equipmentAssets: Record<string, unknown>[] = []
  const eventIds: string[] = []
  const actionIds: string[] = []
  let openingJobIds: string[] | null = null
  let openingMachineIds: string[] | null = null
  const shiftTotals = new Map<string, { goodUnits: number; scrapUnits: number }>()
  const materialShiftTotals = new Map<string, number>()

  for (const [index, candidate] of jobs.entries()) {
    if (!isRecord(candidate)) throw new Error(`jobs[${index}] is invalid.`)
    assertOnlyFields(candidate, productionJobFields, `jobs[${index}]`)
    jobIds.push(canonicalText(candidate.id, `jobs[${index}].id`, 80))
    canonicalText(candidate.line, `jobs[${index}].line`, 120)
    canonicalText(candidate.product, `jobs[${index}].product`)
    assertSafeInteger(candidate.target, `jobs[${index}].target`, 1)
    assertSafeInteger(candidate.output, `jobs[${index}].output`)
    if (candidate.owner !== undefined) canonicalText(candidate.owner, `jobs[${index}].owner`, 120)
    const scheduleFields = ['priority', 'dueAt'] as const
    const scheduleFieldCount = scheduleFields.filter((field) => candidate[field] !== undefined).length
    if (scheduleFieldCount !== 0 && scheduleFieldCount !== scheduleFields.length) throw new Error(`jobs[${index}] schedule fields must be complete or absent for legacy records.`)
    if (scheduleFieldCount === scheduleFields.length) {
      if (!productionJobPriorities.includes(candidate.priority as ProductionJobPriority)) throw new Error(`jobs[${index}].priority is invalid.`)
      if (!validTimestamp(candidate.dueAt)) throw new Error(`jobs[${index}].dueAt is invalid.`)
    }
    if (candidate.scrap !== undefined) assertSafeInteger(candidate.scrap, `jobs[${index}].scrap`)
    const accounted = Number(candidate.output) + Number(candidate.scrap ?? 0)
    if (!Number.isSafeInteger(accounted) || accounted > Number(candidate.target)) throw new Error(`jobs[${index}] good plus scrap exceeds target.`)
    if (candidate.shopDemandSource !== undefined) {
      const source = validateProductionShopDemandSource(candidate.shopDemandSource, `jobs[${index}].shopDemandSource`)
      const product = String(candidate.product).toLocaleLowerCase('en-US')
      if (source.snapshot.productName.toLocaleLowerCase('en-US') !== product
        && source.snapshot.sku.toLocaleLowerCase('en-US') !== product) throw new Error(`jobs[${index}] product does not match its Shop demand source.`)
      if (source.snapshot.recommendedBatchUnits !== Number(candidate.target)) throw new Error(`jobs[${index}] target does not match its Shop demand source.`)
    }
    if (candidate.qualityHold !== undefined) {
      if (!isRecord(candidate.qualityHold)) throw new Error(`jobs[${index}].qualityHold is invalid.`)
      const qualityHold = candidate.qualityHold
      const qualityHoldFields = ['actionId', 'heldAt', 'heldBy', 'reason', 'evidenceReference']
      if (JSON.stringify(Object.keys(qualityHold).sort()) !== JSON.stringify([...qualityHoldFields].sort())) throw new Error(`jobs[${index}].qualityHold fields are invalid.`)
      canonicalText(qualityHold.actionId, `jobs[${index}].qualityHold.actionId`, 160)
      if (!validTimestamp(qualityHold.heldAt)) throw new Error(`jobs[${index}].qualityHold.heldAt is invalid.`)
      canonicalText(qualityHold.heldBy, `jobs[${index}].qualityHold.heldBy`)
      canonicalText(qualityHold.reason, `jobs[${index}].qualityHold.reason`)
      canonicalText(qualityHold.evidenceReference, `jobs[${index}].qualityHold.evidenceReference`)
    }
    if (candidate.closure !== undefined) {
      if (!isRecord(candidate.closure)) throw new Error(`jobs[${index}].closure is invalid.`)
      const closure = candidate.closure
      const closureFields = ['actionId', 'closedAt', 'closedBy', 'reason', 'evidenceReference', 'shiftRef', 'remainingUnits']
      if (JSON.stringify(Object.keys(closure).sort()) !== JSON.stringify([...closureFields].sort())) throw new Error(`jobs[${index}].closure fields are invalid.`)
      canonicalText(closure.actionId, `jobs[${index}].closure.actionId`, 160)
      if (!validTimestamp(closure.closedAt)) throw new Error(`jobs[${index}].closure.closedAt is invalid.`)
      canonicalText(closure.closedBy, `jobs[${index}].closure.closedBy`)
      canonicalText(closure.reason, `jobs[${index}].closure.reason`)
      canonicalText(closure.evidenceReference, `jobs[${index}].closure.evidenceReference`)
      canonicalText(closure.shiftRef, `jobs[${index}].closure.shiftRef`, 80)
      assertSafeInteger(closure.remainingUnits, `jobs[${index}].closure.remainingUnits`, 1)
      if (Number(closure.remainingUnits) !== Number(candidate.target) - accounted) throw new Error(`jobs[${index}].closure remaining units do not match its output.`)
    }
  }
  assertUnique(jobIds, 'Production job ID')

  for (const [index, candidate] of issues.entries()) {
    if (!isRecord(candidate)) throw new Error(`issues[${index}] is invalid.`)
    assertOnlyFields(candidate, productionIssueFields, `issues[${index}]`)
    issueIds.push(canonicalText(candidate.id, `issues[${index}].id`, 80))
    if (!validTimestamp(candidate.createdAt)) throw new Error(`issues[${index}].createdAt is invalid.`)
    canonicalText(candidate.area, `issues[${index}].area`, 120)
    canonicalText(candidate.summary, `issues[${index}].summary`, 240)
    if (!issueKinds.includes(candidate.kind as ProductionIssueKind)) throw new Error(`issues[${index}].kind is invalid.`)
    if (candidate.status !== 'open' && candidate.status !== 'resolved') throw new Error(`issues[${index}].status is invalid.`)
    const actionFields = ['severity', 'owner', 'dueAt', 'containment'] as const
    const actionFieldCount = actionFields.filter((field) => candidate[field] !== undefined).length
    if (actionFieldCount !== 0 && actionFieldCount !== actionFields.length) throw new Error(`issues[${index}] action fields must be complete or absent for legacy records.`)
    if (actionFieldCount === actionFields.length) {
      if (!productionIssueSeverities.includes(candidate.severity as ProductionIssueSeverity)) throw new Error(`issues[${index}].severity is invalid.`)
      canonicalText(candidate.owner, `issues[${index}].owner`, 120)
      if (!validTimestamp(candidate.dueAt)) throw new Error(`issues[${index}].dueAt is invalid.`)
      if (timestampAtOrBefore(candidate.dueAt as string, candidate.createdAt as string)) throw new Error(`issues[${index}].dueAt must follow its creation time.`)
      canonicalText(candidate.containment, `issues[${index}].containment`, 240)
    }
    if (candidate.maintenanceFindingSource !== undefined) {
      const source = validateProductionMaintenanceFindingSource(candidate.maintenanceFindingSource, `issues[${index}].maintenanceFindingSource`)
      if (candidate.kind !== 'maintenance') throw new Error(`issues[${index}] maintenance finding source requires a maintenance issue.`)
      if (timestampBefore(candidate.createdAt as string, source.completedAt)) throw new Error(`issues[${index}] cannot predate its maintenance finding.`)
    }
    if (candidate.status === 'open' && candidate.resolution !== undefined) throw new Error(`issues[${index}] is open but has resolution evidence.`)
    if (candidate.resolution !== undefined) {
      if (!isRecord(candidate.resolution)) throw new Error(`issues[${index}].resolution is invalid.`)
      const resolution = candidate.resolution
      assertOnlyFields(resolution, productionIssueResolutionFields, `issues[${index}].resolution`)
      canonicalText(resolution.actionId, `issues[${index}].resolution.actionId`, 160)
      if (!validTimestamp(resolution.resolvedAt)) throw new Error(`issues[${index}].resolution.resolvedAt is invalid.`)
      canonicalText(resolution.resolvedBy, `issues[${index}].resolution.resolvedBy`)
      canonicalText(resolution.reason, `issues[${index}].resolution.reason`)
      canonicalText(resolution.evidenceReference, `issues[${index}].resolution.evidenceReference`)
      const correctiveAction = resolution.maintenanceCorrectiveAction === undefined ? undefined : validateProductionMaintenanceCorrectiveAction(resolution.maintenanceCorrectiveAction, `issues[${index}].resolution.maintenanceCorrectiveAction`)
      const qualityCorrectiveAction = resolution.qualityCorrectiveAction === undefined ? undefined : validateProductionQualityCorrectiveAction(resolution.qualityCorrectiveAction, `issues[${index}].resolution.qualityCorrectiveAction`)
      if (Boolean(candidate.maintenanceFindingSource) !== Boolean(correctiveAction)) throw new Error(`issues[${index}] maintenance finding resolution requires one structured corrective action only.`)
      if (candidate.kind === 'quality' && candidate.status === 'resolved' && actionFieldCount === actionFields.length && !qualityCorrectiveAction) throw new Error(`issues[${index}] actionable quality resolution requires structured CAPA evidence.`)
      if (qualityCorrectiveAction && candidate.kind !== 'quality') throw new Error(`issues[${index}] quality corrective action requires a quality issue.`)
      if (correctiveAction && qualityCorrectiveAction) throw new Error(`issues[${index}] cannot carry maintenance and quality corrective actions together.`)
    }
  }
  assertUnique(issueIds, 'Production issue ID')

  for (const [index, candidate] of machines.entries()) {
    if (!isRecord(candidate)) throw new Error(`machines[${index}] is invalid.`)
    assertOnlyFields(candidate, productionMachineFields, `machines[${index}]`)
    machineIds.push(canonicalText(candidate.id, `machines[${index}].id`, 80))
    canonicalText(candidate.name, `machines[${index}].name`)
    if (!productionMachineStates.includes(candidate.state as ProductionMachineState)) throw new Error(`machines[${index}].state is invalid.`)
  }
  assertUnique(machineIds, 'Production machine ID')

  if (Object.hasOwn(value, 'equipmentMaster')) {
    if (!isRecord(value.equipmentMaster)) throw new Error('Production equipment master is invalid.')
    assertOnlyFields(value.equipmentMaster, productionEquipmentMasterFields, 'Production equipment master')
    if (JSON.stringify(Object.keys(value.equipmentMaster).sort()) !== JSON.stringify([...productionEquipmentMasterFields].sort())) throw new Error('Production equipment master fields are incomplete.')
    if (value.equipmentMaster.contract !== 'supermega.production.equipment-master.v1') throw new Error('Production equipment master contract is invalid.')
    if (!Array.isArray(value.equipmentMaster.assets) || value.equipmentMaster.assets.length < 1 || value.equipmentMaster.assets.length > 100) throw new Error('Production equipment master assets are invalid.')
    equipmentAssets = value.equipmentMaster.assets.map((candidate, index) => {
      if (!isRecord(candidate)) throw new Error(`equipmentMaster.assets[${index}] is invalid.`)
      const commissioningStatus = candidate.commissioningStatus
      const expectedAssetFields = commissioningStatus === 'commissioned'
        ? [...productionEquipmentAssetFields, 'commissioning', ...(candidate.maintenanceStrategy === undefined ? [] : ['maintenanceStrategy'])]
        : productionEquipmentAssetFields
      if (JSON.stringify(Object.keys(candidate).sort()) !== JSON.stringify([...expectedAssetFields].sort())) throw new Error(`equipmentMaster.assets[${index}] fields are invalid.`)
      const equipmentId = canonicalText(candidate.id, `equipmentMaster.assets[${index}].id`, 80)
      const workCentreId = canonicalText(candidate.workCentreId, `equipmentMaster.assets[${index}].workCentreId`, 80)
      if (!/^[A-Z0-9][A-Z0-9._/-]{0,79}$/.test(equipmentId) || !/^[A-Z0-9][A-Z0-9._/-]{0,79}$/.test(workCentreId)) throw new Error(`equipmentMaster.assets[${index}] IDs are invalid.`)
      canonicalText(candidate.name, `equipmentMaster.assets[${index}].name`, 180)
      canonicalText(candidate.owner, `equipmentMaster.assets[${index}].owner`, 120)
      if (!productionEquipmentCriticalities.includes(candidate.criticality as ProductionEquipmentCriticality)) throw new Error(`equipmentMaster.assets[${index}].criticality is invalid.`)
      if (commissioningStatus !== 'not_commissioned' && commissioningStatus !== 'commissioned') throw new Error(`equipmentMaster.assets[${index}].commissioningStatus is invalid.`)
      canonicalText(candidate.sourceActionId, `equipmentMaster.assets[${index}].sourceActionId`, 160)
      if (typeof candidate.sourcePackageDigest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(candidate.sourcePackageDigest)) throw new Error(`equipmentMaster.assets[${index}].sourcePackageDigest is invalid.`)
      if (!validDowntimeTimestamp(candidate.importedAt)) throw new Error(`equipmentMaster.assets[${index}].importedAt is invalid.`)
      if (commissioningStatus === 'commissioned') {
        if (!isRecord(candidate.commissioning)) throw new Error(`equipmentMaster.assets[${index}].commissioning is invalid.`)
        const commissioning = candidate.commissioning
        if (JSON.stringify(Object.keys(commissioning).sort()) !== JSON.stringify([...productionEquipmentCommissioningFields].sort())) throw new Error(`equipmentMaster.assets[${index}].commissioning fields are invalid.`)
        canonicalText(commissioning.actionId, `equipmentMaster.assets[${index}].commissioning.actionId`, 160)
        canonicalText(commissioning.commissionedBy, `equipmentMaster.assets[${index}].commissioning.commissionedBy`, 120)
        canonicalText(commissioning.safetyBaselineReference, `equipmentMaster.assets[${index}].commissioning.safetyBaselineReference`, 240)
        if (!validDowntimeTimestamp(commissioning.commissionedAt) || !validDowntimeTimestamp(commissioning.installedAt)) throw new Error(`equipmentMaster.assets[${index}].commissioning timestamps are invalid.`)
        if (timestampBefore(commissioning.commissionedAt as string, candidate.importedAt as string) || timestampBefore(commissioning.commissionedAt as string, commissioning.installedAt as string)) throw new Error(`equipmentMaster.assets[${index}].commissioning chronology is invalid.`)
        if (!productionMachineStates.includes(commissioning.initialState as ProductionMachineState)) throw new Error(`equipmentMaster.assets[${index}].commissioning.initialState is invalid.`)
        if (candidate.maintenanceStrategy !== undefined) {
          if (!isRecord(candidate.maintenanceStrategy)) throw new Error(`equipmentMaster.assets[${index}].maintenanceStrategy is invalid.`)
          const strategy = candidate.maintenanceStrategy
          if (JSON.stringify(Object.keys(strategy).sort()) !== JSON.stringify([...productionEquipmentMaintenanceStrategyFields].sort())) throw new Error(`equipmentMaster.assets[${index}].maintenanceStrategy fields are invalid.`)
          assertSafeInteger(strategy.revision, `equipmentMaster.assets[${index}].maintenanceStrategy.revision`, 1)
          canonicalText(strategy.actionId, `equipmentMaster.assets[${index}].maintenanceStrategy.actionId`, 160)
          canonicalText(strategy.savedBy, `equipmentMaster.assets[${index}].maintenanceStrategy.savedBy`, 120)
          canonicalText(strategy.maintenanceOwner, `equipmentMaster.assets[${index}].maintenanceStrategy.maintenanceOwner`, 120)
          canonicalText(strategy.procedureReference, `equipmentMaster.assets[${index}].maintenanceStrategy.procedureReference`, 240)
          canonicalText(strategy.safetyBaselineReference, `equipmentMaster.assets[${index}].maintenanceStrategy.safetyBaselineReference`, 240)
          assertSafeInteger(strategy.intervalDays, `equipmentMaster.assets[${index}].maintenanceStrategy.intervalDays`, 1)
          if (Number(strategy.intervalDays) > 3650) throw new Error(`equipmentMaster.assets[${index}].maintenanceStrategy.intervalDays is too large.`)
          if (!validDowntimeTimestamp(strategy.savedAt) || !validDowntimeTimestamp(strategy.nextDueAt)) throw new Error(`equipmentMaster.assets[${index}].maintenanceStrategy timestamps are invalid.`)
          if (timestampAtOrBefore(strategy.nextDueAt as string, strategy.savedAt as string)) throw new Error(`equipmentMaster.assets[${index}].maintenanceStrategy.nextDueAt must follow strategy save time.`)
        }
      } else if (candidate.maintenanceStrategy !== undefined) {
        throw new Error(`equipmentMaster.assets[${index}] cannot retain a maintenance strategy before commissioning.`)
      }
      equipmentIds.push(equipmentId)
      return candidate
    })
    assertUnique(equipmentIds, 'Production equipment ID')
    if (equipmentAssets.some((asset) => asset.commissioningStatus === 'not_commissioned' && machineIds.includes(String(asset.id)))) throw new Error('Uncommissioned equipment cannot appear as a runtime machine.')
  }

  if (Object.hasOwn(value, 'openingPlan')) {
    if (!isRecord(value.openingPlan)) throw new Error('Production opening plan is invalid.')
    const openingPlan = value.openingPlan
    assertOnlyFields(openingPlan, productionOpeningPlanFields, 'Production opening plan')
    if (openingPlan.contract !== 'supermega.production.opening-plan.v1') throw new Error('Production opening plan contract is invalid.')
    if (typeof openingPlan.packageDigest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(openingPlan.packageDigest)) throw new Error('Production opening plan package digest is invalid.')
    if (!validDowntimeTimestamp(openingPlan.confirmedAt)) throw new Error('Production opening plan confirmation time is invalid.')
    if (openingPlan.industryPackId !== undefined) plantIndustryPack(String(openingPlan.industryPackId))
    if (!Array.isArray(openingPlan.jobIds)
      || !openingPlan.jobIds.length
      || openingPlan.jobIds.length > 100
      || !Array.isArray(openingPlan.machineIds)
      || openingPlan.machineIds.length > 100) throw new Error('Production opening plan record IDs are invalid.')
    const planJobIds = openingPlan.jobIds.map((id, index) => canonicalText(id, `openingPlan.jobIds[${index}]`, 80))
    const planMachineIds = openingPlan.machineIds.map((id, index) => canonicalText(id, `openingPlan.machineIds[${index}]`, 80))
    assertUnique(planJobIds, 'Production opening job ID')
    assertUnique(planMachineIds, 'Production opening machine ID')
    if (JSON.stringify(jobIds.slice(-planJobIds.length)) !== JSON.stringify(planJobIds)) throw new Error('Production opening jobs are not the immutable job suffix.')
    if (JSON.stringify(machineIds.slice(0, planMachineIds.length)) !== JSON.stringify(planMachineIds)) throw new Error('Production opening machines are not the immutable machine prefix.')
    openingJobIds = planJobIds
    openingMachineIds = planMachineIds
  }

  if (Object.hasOwn(value, 'orderExecution')) {
    if (!isRecord(value.orderExecution)) throw new Error('Production order execution is invalid.')
    const execution = value.orderExecution
    assertOnlyFields(execution, ['schema', 'revision', 'headDigest', 'commands'], 'Production order execution')
    if (execution.schema !== 'supermega.plant.order_foundation.v1') throw new Error('Production order execution contract is invalid.')
    assertSafeInteger(execution.revision, 'Production order execution revision')
    if (!Array.isArray(execution.commands) || execution.commands.length > 2_000 || execution.commands.length !== execution.revision) throw new Error('Production order execution command count is invalid.')
    if (typeof execution.headDigest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(execution.headDigest)) throw new Error('Production order execution head digest is invalid.')
    if (execution.revision === 0 && execution.headDigest !== `sha256:${'0'.repeat(64)}`) throw new Error('Empty Production order execution digest is invalid.')
    const lastCommand = execution.commands.at(-1)
    if (lastCommand !== undefined && (!isRecord(lastCommand) || lastCommand.digest !== execution.headDigest)) throw new Error('Production order execution head does not match its latest command.')
  }

  for (const [index, candidate] of events.entries()) {
    if (!isRecord(candidate)) throw new Error(`events[${index}] is invalid.`)
    const eventId = canonicalText(candidate.id, `events[${index}].id`, 164)
    const actionId = canonicalText(candidate.actionId, `events[${index}].actionId`, 160)
    eventIds.push(eventId)
    actionIds.push(actionId)
    if (eventId !== `EVT-${actionId}`) throw new Error(`events[${index}].id does not match its action.`)
    if (!validTimestamp(candidate.createdAt)) throw new Error(`events[${index}].createdAt is invalid.`)
    for (const field of ['actor', 'reason', 'evidenceReference'] as const) canonicalText(candidate[field], `events[${index}].${field}`)
    canonicalText(candidate.subjectId, `events[${index}].subjectId`, 80)
    canonicalText(candidate.summary, `events[${index}].summary`, 360)
    if (!eventKinds.includes(candidate.kind as ProductionEventKind)) throw new Error(`events[${index}].kind is invalid.`)
    assertOnlyFields(candidate, eventFieldsByKind[candidate.kind as ProductionEventKind], `events[${index}]`)
    const issueSnapshotFields = ['issueSeverity', 'issueOwner', 'issueDueAt', 'issueContainment'] as const
    const issueSnapshotFieldCount = issueSnapshotFields.filter((field) => candidate[field] !== undefined).length
    const materialFieldCount = ['materialRef', 'materialLot', 'materialUnit'].filter((field) => candidate[field] !== undefined).length
    const maintenanceFieldCount = ['maintenanceOwner', 'maintenanceStartActionId', ...maintenanceStrategyBindingFields, ...maintenanceResultFields, 'nextDueAt'].filter((field) => candidate[field] !== undefined).length
    if (candidate.kind === 'equipment_master_imported') {
      if (candidate.subjectId !== 'equipment-master') throw new Error(`events[${index}] must reference the equipment master authority.`)
      if (!Array.isArray(candidate.equipmentIds) || candidate.equipmentIds.length < 1 || candidate.equipmentIds.length > 100) throw new Error(`events[${index}].equipmentIds are invalid.`)
      const importedEquipmentIds = candidate.equipmentIds.map((id, position) => canonicalText(id, `events[${index}].equipmentIds[${position}]`, 80))
      assertUnique(importedEquipmentIds, 'Production equipment import ID')
      if (importedEquipmentIds.some((id) => !equipmentIds.includes(id))) throw new Error(`events[${index}] references unknown equipment.`)
      if (candidate.summary !== `Imported ${importedEquipmentIds.length} equipment master records`) throw new Error(`events[${index}] equipment import summary is not canonical.`)
      if (typeof candidate.evidenceReference !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(candidate.evidenceReference)) throw new Error(`events[${index}] equipment import evidence is invalid.`)
    } else if (candidate.kind === 'equipment_commissioned') {
      if (!equipmentIds.includes(candidate.subjectId as string) || !machineIds.includes(candidate.subjectId as string)) throw new Error(`events[${index}] must reference one retained equipment runtime.`)
      if (!validDowntimeTimestamp(candidate.installedAt) || timestampBefore(candidate.createdAt as string, candidate.installedAt as string)) throw new Error(`events[${index}] equipment installation timestamp is invalid.`)
      if (!productionMachineStates.includes(candidate.toState as ProductionMachineState)) throw new Error(`events[${index}].toState is invalid.`)
      const workCentreId = canonicalText(candidate.workCentreId, `events[${index}].workCentreId`, 80)
      if (!/^[A-Z0-9][A-Z0-9._/-]{0,79}$/.test(workCentreId)) throw new Error(`events[${index}].workCentreId is invalid.`)
    } else if (candidate.kind === 'equipment_maintenance_strategy_saved') {
      if (!equipmentIds.includes(candidate.subjectId as string) || !machineIds.includes(candidate.subjectId as string)) throw new Error(`events[${index}] must reference one commissioned equipment runtime.`)
      assertSafeInteger(candidate.strategyRevision, `events[${index}].strategyRevision`, 1)
      assertSafeInteger(candidate.intervalDays, `events[${index}].intervalDays`, 1)
      if (Number(candidate.intervalDays) > 3650) throw new Error(`events[${index}].intervalDays is too large.`)
      canonicalText(candidate.maintenanceOwner, `events[${index}].maintenanceOwner`, 120)
      canonicalText(candidate.procedureReference, `events[${index}].procedureReference`, 240)
      if (!validDowntimeTimestamp(candidate.createdAt) || !validDowntimeTimestamp(candidate.nextDueAt)) throw new Error(`events[${index}] maintenance strategy timestamps are invalid.`)
      if (timestampAtOrBefore(candidate.nextDueAt as string, candidate.createdAt as string)
        || Date.parse(candidate.nextDueAt as string) > Date.parse(candidate.createdAt as string) + Number(candidate.intervalDays) * 86_400_000) throw new Error(`events[${index}].nextDueAt is outside its interval.`)
      if (candidate.summary !== `Saved maintenance strategy R${candidate.strategyRevision} for ${candidate.subjectId}`) throw new Error(`events[${index}] maintenance strategy summary is not canonical.`)
    } else if (candidate.kind === 'job_created' || candidate.kind === 'job_schedule_updated') {
      if (!jobIds.includes(candidate.subjectId as string)) throw new Error(`events[${index}] references an unknown job.`)
      const scheduleSnapshotFields = ['jobPriority', 'jobDueAt'] as const
      const scheduleSnapshotFieldCount = scheduleSnapshotFields.filter((field) => candidate[field] !== undefined).length
      if (candidate.kind === 'job_schedule_updated' && scheduleSnapshotFieldCount !== scheduleSnapshotFields.length) throw new Error(`events[${index}] updated job schedule fields are incomplete.`)
      if (candidate.kind === 'job_created' && scheduleSnapshotFieldCount !== 0 && scheduleSnapshotFieldCount !== scheduleSnapshotFields.length) throw new Error(`events[${index}] job schedule fields must be complete or absent for legacy events.`)
      if (scheduleSnapshotFieldCount === scheduleSnapshotFields.length) {
        if (!productionJobPriorities.includes(candidate.jobPriority as ProductionJobPriority)) throw new Error(`events[${index}].jobPriority is invalid.`)
        if (!validTimestamp(candidate.jobDueAt)) throw new Error(`events[${index}].jobDueAt is invalid.`)
        if (timestampAtOrBefore(candidate.jobDueAt as string, candidate.createdAt as string)) throw new Error(`events[${index}].jobDueAt must follow confirmation.`)
      }
      if (candidate.jobOwner !== undefined) canonicalText(candidate.jobOwner, `events[${index}].jobOwner`, 120)
      if (candidate.kind === 'job_created' && candidate.jobOwner !== undefined && scheduleSnapshotFieldCount !== scheduleSnapshotFields.length) throw new Error(`events[${index}] a job owner requires the complete opening plan.`)
      if (candidate.kind === 'job_schedule_updated') {
        const previousScheduleFields = ['fromJobPriority', 'fromJobDueAt'] as const
        const previousScheduleFieldCount = previousScheduleFields.filter((field) => candidate[field] !== undefined).length
        if (previousScheduleFieldCount !== 0 && previousScheduleFieldCount !== previousScheduleFields.length) throw new Error(`events[${index}] previous job schedule fields are incomplete.`)
        if (previousScheduleFieldCount === previousScheduleFields.length) {
          if (!productionJobPriorities.includes(candidate.fromJobPriority as ProductionJobPriority)) throw new Error(`events[${index}].fromJobPriority is invalid.`)
          if (!validTimestamp(candidate.fromJobDueAt)) throw new Error(`events[${index}].fromJobDueAt is invalid.`)
        }
        if (candidate.fromJobOwner !== undefined) canonicalText(candidate.fromJobOwner, `events[${index}].fromJobOwner`, 120)
        if (candidate.fromJobOwner !== undefined && candidate.jobOwner === undefined) throw new Error(`events[${index}] previous job owner cannot exist without a current owner.`)
        const job = jobs.find((entry): entry is Record<string, unknown> => isRecord(entry) && entry.id === candidate.subjectId)
        if (!job) throw new Error(`events[${index}] references an unknown job.`)
        const expectedSummary = candidate.jobOwner === undefined
          ? `Updated ${String(job.product)} schedule for ${String(job.line)}`
          : `Updated ${String(job.product)} plan for ${String(job.line)}`
        if (candidate.summary !== expectedSummary) throw new Error(`events[${index}] job plan summary is not canonical.`)
      }
      if (candidate.quantity !== undefined || candidate.remainingQuantity !== undefined || candidate.shiftRef !== undefined || candidate.outputKind !== undefined || materialFieldCount || issueSnapshotFieldCount || maintenanceFieldCount || candidate.fromState !== undefined || candidate.toState !== undefined || candidate.downtimeStartActionId !== undefined) throw new Error(`events[${index}] job event has unrelated fields.`)
    } else if (candidate.kind === 'job_closed') {
      if (!jobIds.includes(candidate.subjectId as string)) throw new Error(`events[${index}] references an unknown job.`)
      if (JSON.stringify(Object.keys(candidate).sort()) !== JSON.stringify([...jobClosedEventFields].sort())) throw new Error(`events[${index}] job close event fields are invalid.`)
      canonicalText(candidate.shiftRef, `events[${index}].shiftRef`, 80)
      assertSafeInteger(candidate.remainingQuantity, `events[${index}].remainingQuantity`, 1)
    } else if (candidate.kind === 'output_recorded') {
      if (!jobIds.includes(candidate.subjectId as string)) throw new Error(`events[${index}] references an unknown job.`)
      assertSafeInteger(candidate.quantity, `events[${index}].quantity`, 1)
      const outputKind = candidate.outputKind === undefined ? 'good' : candidate.outputKind
      if (outputKind !== 'good' && outputKind !== 'scrap') throw new Error(`events[${index}].outputKind is invalid.`)
      if (candidate.shiftRef !== undefined) {
        const shiftRef = canonicalText(candidate.shiftRef, `events[${index}].shiftRef`, 80)
        const currentShiftTotal = shiftTotals.get(shiftRef) ?? { goodUnits: 0, scrapUnits: 0 }
        const nextShiftTotal = currentShiftTotal[outputKind === 'scrap' ? 'scrapUnits' : 'goodUnits'] + Number(candidate.quantity)
        if (!Number.isSafeInteger(nextShiftTotal)) throw new Error(`Output total for ${shiftRef} exceeds the safe integer limit.`)
        shiftTotals.set(shiftRef, {
          ...currentShiftTotal,
          [outputKind === 'scrap' ? 'scrapUnits' : 'goodUnits']: nextShiftTotal,
        })
      }
      if (candidate.remainingQuantity !== undefined || materialFieldCount || issueSnapshotFieldCount || maintenanceFieldCount || candidate.fromState !== undefined || candidate.toState !== undefined || candidate.downtimeStartActionId !== undefined) throw new Error(`events[${index}] output event has unrelated fields.`)
    } else if (candidate.kind === 'material_consumed') {
      if (!jobIds.includes(candidate.subjectId as string)) throw new Error(`events[${index}] references an unknown job.`)
      const expectedFields = candidate.materialLot === undefined ? materialEventFields : [...materialEventFields, ...materialOptionalEventFields]
      if (JSON.stringify(Object.keys(candidate).sort()) !== JSON.stringify([...expectedFields].sort())) throw new Error(`events[${index}] material event fields are invalid.`)
      if (!validMaterialQuantity(candidate.quantity)) throw new Error(`events[${index}].quantity must be positive with at most three decimal places.`)
      const shiftRef = canonicalText(candidate.shiftRef, `events[${index}].shiftRef`, 80)
      const materialRef = canonicalText(candidate.materialRef, `events[${index}].materialRef`, 120)
      if (candidate.materialLot !== undefined) canonicalText(candidate.materialLot, `events[${index}].materialLot`, 120)
      if (!productionMaterialUnits.includes(candidate.materialUnit as ProductionMaterialUnit)) throw new Error(`events[${index}].materialUnit is invalid.`)
      const quantityMilli = materialQuantityMilli(candidate.quantity)
      const materialTotalKey = JSON.stringify([shiftRef, materialRef, candidate.materialUnit])
      const materialTotal = (materialShiftTotals.get(materialTotalKey) ?? 0) + (quantityMilli ?? 0)
      if (!Number.isSafeInteger(materialTotal)) throw new Error(`Material total for ${materialRef} in ${shiftRef} exceeds the safe fixed-precision limit.`)
      materialShiftTotals.set(materialTotalKey, materialTotal)
    } else if (candidate.kind === 'quality_hold_placed' || candidate.kind === 'quality_hold_released') {
      if (!jobIds.includes(candidate.subjectId as string)) throw new Error(`events[${index}] references an unknown job.`)
      if (JSON.stringify(Object.keys(candidate).sort()) !== JSON.stringify([...qualityHoldEventFields].sort())) throw new Error(`events[${index}] quality hold event fields are invalid.`)
      if (candidate.quantity !== undefined || candidate.remainingQuantity !== undefined || candidate.shiftRef !== undefined || candidate.outputKind !== undefined || materialFieldCount || issueSnapshotFieldCount || maintenanceFieldCount || candidate.fromState !== undefined || candidate.toState !== undefined) throw new Error(`events[${index}] quality hold event has unrelated fields.`)
    } else if (candidate.kind === 'machine_state_changed') {
      if (!machineIds.includes(candidate.subjectId as string)) throw new Error(`events[${index}] references an unknown machine.`)
      if (!productionMachineStates.includes(candidate.fromState as ProductionMachineState) || !productionMachineStates.includes(candidate.toState as ProductionMachineState)) throw new Error(`events[${index}] has invalid machine states.`)
      if (candidate.fromState === candidate.toState) throw new Error(`events[${index}] must record a distinct machine observation.`)
      if (candidate.quantity !== undefined || candidate.remainingQuantity !== undefined || candidate.shiftRef !== undefined || candidate.outputKind !== undefined || materialFieldCount || issueSnapshotFieldCount || maintenanceFieldCount || candidate.downtimeStartActionId !== undefined) throw new Error(`events[${index}] machine event has unrelated fields.`)
    } else if (candidate.kind === 'downtime_started' || candidate.kind === 'downtime_ended') {
      if (!machineIds.includes(candidate.subjectId as string)) throw new Error(`events[${index}] references an unknown machine.`)
      if (!validDowntimeTimestamp(candidate.createdAt)) throw new Error(`events[${index}].createdAt must be a canonical UTC millisecond timestamp for downtime.`)
      const expectedFields = candidate.kind === 'downtime_ended' ? downtimeEndEventFields : baseEventFields
      if (JSON.stringify(Object.keys(candidate).sort()) !== JSON.stringify([...expectedFields].sort())) throw new Error(`events[${index}] downtime event fields are invalid.`)
      if (candidate.kind === 'downtime_ended') canonicalText(candidate.downtimeStartActionId, `events[${index}].downtimeStartActionId`, 160)
    } else if (candidate.kind === 'maintenance_started' || candidate.kind === 'maintenance_completed') {
      if (!machineIds.includes(candidate.subjectId as string)) throw new Error(`events[${index}] references an unknown machine.`)
      if (!validDowntimeTimestamp(candidate.createdAt)) throw new Error(`events[${index}].createdAt must be a canonical UTC millisecond timestamp for maintenance.`)
      const bindingFieldCount = maintenanceStrategyBindingFields.filter((field) => candidate[field] !== undefined).length
      const strategyBound = bindingFieldCount === maintenanceStrategyBindingFields.length
      if (bindingFieldCount !== 0 && !strategyBound) throw new Error(`events[${index}] maintenance strategy binding is incomplete.`)
      const resultFieldCount = maintenanceResultFields.filter((field) => candidate[field] !== undefined).length
      const hasResult = resultFieldCount === maintenanceResultFields.length
      if (resultFieldCount !== 0 && !hasResult) throw new Error(`events[${index}] maintenance result is incomplete.`)
      if (hasResult && (candidate.kind !== 'maintenance_completed' || !strategyBound)) throw new Error(`events[${index}] maintenance result requires strategy-bound completion.`)
      const expectedFields = candidate.kind === 'maintenance_started'
        ? (strategyBound ? maintenanceStartEventFields : [...baseEventFields, 'maintenanceOwner'])
        : (strategyBound
            ? (hasResult ? maintenanceCompleteEventFields : maintenanceHistoricalCompleteEventFields)
            : [...baseEventFields, 'maintenanceStartActionId'])
      if (JSON.stringify(Object.keys(candidate).sort()) !== JSON.stringify([...expectedFields].sort())) throw new Error(`events[${index}] maintenance event fields are invalid.`)
      if (candidate.kind === 'maintenance_started') canonicalText(candidate.maintenanceOwner, `events[${index}].maintenanceOwner`, 120)
      else canonicalText(candidate.maintenanceStartActionId, `events[${index}].maintenanceStartActionId`, 160)
      if (strategyBound) {
        canonicalText(candidate.maintenanceStrategyActionId, `events[${index}].maintenanceStrategyActionId`, 160)
        assertSafeInteger(candidate.maintenanceStrategyRevision, `events[${index}].maintenanceStrategyRevision`, 1)
        canonicalText(candidate.maintenanceProcedureReference, `events[${index}].maintenanceProcedureReference`, 240)
        if (!validDowntimeTimestamp(candidate.maintenancePlannedDueAt)) throw new Error(`events[${index}].maintenancePlannedDueAt is invalid.`)
        if (candidate.kind === 'maintenance_completed') {
          if (!validDowntimeTimestamp(candidate.nextDueAt) || timestampAtOrBefore(candidate.nextDueAt as string, candidate.createdAt as string)) throw new Error(`events[${index}].nextDueAt must follow reviewed completion.`)
          if (hasResult) {
            if (!productionMaintenanceOutcomes.includes(candidate.maintenanceOutcome as ProductionMaintenanceOutcome)) throw new Error(`events[${index}].maintenanceOutcome is invalid.`)
            canonicalText(candidate.maintenanceFindings, `events[${index}].maintenanceFindings`, 360)
            if (candidate.maintenanceProcedureCompleted !== true) throw new Error(`events[${index}].maintenanceProcedureCompleted must be confirmed.`)
            if (!productionMaintenanceReturnToServiceValues.includes(candidate.maintenanceReturnToService as ProductionMaintenanceReturnToService)) throw new Error(`events[${index}].maintenanceReturnToService is invalid.`)
            if (candidate.maintenanceOutcome === 'completed' && candidate.maintenanceReturnToService !== 'recommended') throw new Error(`events[${index}] completed maintenance must recommend return to service.`)
          }
        }
      }
    } else if (candidate.kind === 'shift_closed') {
      if (JSON.stringify(Object.keys(candidate).sort()) !== JSON.stringify([...shiftClosedEventFields].sort())) throw new Error(`events[${index}] shift close event fields are invalid.`)
      const shiftRef = canonicalText(candidate.shiftRef, `events[${index}].shiftRef`, 80)
      if (candidate.subjectId !== shiftRef) throw new Error(`events[${index}] shift close subject must match its shift reference.`)
      assertSafeInteger(candidate.sourceRevision, `events[${index}].sourceRevision`)
      if (candidate.sourceRevision !== events.length - index - 1) throw new Error(`events[${index}] shift close source revision does not match its append position.`)
      if (typeof candidate.sourceDigest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(candidate.sourceDigest)) throw new Error(`events[${index}].sourceDigest is invalid.`)
      assertSafeInteger(candidate.goodUnits, `events[${index}].goodUnits`, 1)
      assertSafeInteger(candidate.scrapUnits, `events[${index}].scrapUnits`)
      assertSafeInteger(candidate.outputEntryCount, `events[${index}].outputEntryCount`, 1)
      assertSafeInteger(candidate.materialEntryCount, `events[${index}].materialEntryCount`, 1)
      const expectedSummary = `Closed shift ${shiftRef} with ${candidate.goodUnits} good, ${candidate.scrapUnits} scrap, ${candidate.outputEntryCount} output entries, ${candidate.materialEntryCount} material entries`
      if (candidate.summary !== expectedSummary) throw new Error(`events[${index}] shift close summary is not canonical.`)
    } else if (candidate.kind === 'issue_opened') {
      if (!issueIds.includes(candidate.subjectId as string)) throw new Error(`events[${index}] references an unknown issue.`)
      if (candidate.quantity !== undefined || candidate.remainingQuantity !== undefined || candidate.shiftRef !== undefined || candidate.outputKind !== undefined || materialFieldCount || maintenanceFieldCount || candidate.fromState !== undefined || candidate.toState !== undefined || candidate.downtimeStartActionId !== undefined) throw new Error(`events[${index}] issue event has unrelated fields.`)
      if (issueSnapshotFieldCount !== 0 && issueSnapshotFieldCount !== issueSnapshotFields.length) throw new Error(`events[${index}] issue snapshot fields must be complete or absent for legacy events.`)
      if (issueSnapshotFieldCount === issueSnapshotFields.length) {
        if (!productionIssueSeverities.includes(candidate.issueSeverity as ProductionIssueSeverity)) throw new Error(`events[${index}].issueSeverity is invalid.`)
        canonicalText(candidate.issueOwner, `events[${index}].issueOwner`, 120)
        if (!validTimestamp(candidate.issueDueAt)) throw new Error(`events[${index}].issueDueAt is invalid.`)
        if (timestampAtOrBefore(candidate.issueDueAt as string, candidate.createdAt as string)) throw new Error(`events[${index}].issueDueAt must follow confirmation.`)
        canonicalText(candidate.issueContainment, `events[${index}].issueContainment`, 240)
      }
      if (candidate.maintenanceFindingSource !== undefined) validateProductionMaintenanceFindingSource(candidate.maintenanceFindingSource, `events[${index}].maintenanceFindingSource`)
    } else if (candidate.kind === 'issue_resolved') {
      if (!issueIds.includes(candidate.subjectId as string)) throw new Error(`events[${index}] references an unknown issue.`)
      if (candidate.quantity !== undefined || candidate.remainingQuantity !== undefined || candidate.shiftRef !== undefined || candidate.outputKind !== undefined || materialFieldCount || issueSnapshotFieldCount || maintenanceFieldCount || candidate.fromState !== undefined || candidate.toState !== undefined || candidate.downtimeStartActionId !== undefined) throw new Error(`events[${index}] issue event has unrelated fields.`)
      if (candidate.maintenanceCorrectiveAction !== undefined) validateProductionMaintenanceCorrectiveAction(candidate.maintenanceCorrectiveAction, `events[${index}].maintenanceCorrectiveAction`)
      if (candidate.qualityCorrectiveAction !== undefined) validateProductionQualityCorrectiveAction(candidate.qualityCorrectiveAction, `events[${index}].qualityCorrectiveAction`)
      if (candidate.maintenanceCorrectiveAction !== undefined && candidate.qualityCorrectiveAction !== undefined) throw new Error(`events[${index}] cannot carry maintenance and quality corrective actions together.`)
    }
  }
  assertUnique(eventIds, 'Production event ID')
  assertUnique(actionIds, 'Production action ID')
  if (Number(value.revision) !== events.length) throw new Error('Production revision must equal the append-only event count.')
  const equipmentImportEvents = events.filter((event): event is Record<string, unknown> => isRecord(event) && event.kind === 'equipment_master_imported')
  const equipmentAssetsWithEvidence = new Set<string>()
  for (const event of equipmentImportEvents) {
    const matchingAssets = equipmentAssets.filter((asset) => asset.sourceActionId === event.actionId)
    const matchingIds = matchingAssets.map((asset) => String(asset.id))
    if (!matchingAssets.length || JSON.stringify(matchingIds) !== JSON.stringify(event.equipmentIds)) throw new Error('Equipment master records do not match their immutable import event.')
    for (const asset of matchingAssets) {
      if (asset.sourcePackageDigest !== event.evidenceReference || asset.importedAt !== event.createdAt) throw new Error('Equipment master source evidence does not match its import event.')
      if (equipmentAssetsWithEvidence.has(String(asset.id))) throw new Error('Equipment master records cannot reuse import evidence.')
      equipmentAssetsWithEvidence.add(String(asset.id))
    }
  }

  if (Object.hasOwn(value, 'orderPortfolio')) {
    if (Object.hasOwn(value, 'orderExecution')) throw new Error('Production cannot retain both legacy order execution and the order portfolio.')
    const portfolio = validateProductionOrderPortfolio(value.orderPortfolio)
    if (portfolio.entries.some((entry) => !jobIds.includes(entry.jobId))) throw new Error('Production order portfolio references an unknown job.')
  }
  if (equipmentAssetsWithEvidence.size !== equipmentAssets.length) throw new Error('Every equipment master record requires one immutable import event.')
  const equipmentCommissionEvents = events.filter((event): event is Record<string, unknown> => isRecord(event) && event.kind === 'equipment_commissioned')
  const commissionedIds = new Set<string>()
  for (const asset of equipmentAssets) {
    const equipmentId = String(asset.id)
    const matches = equipmentCommissionEvents.filter((event) => event.subjectId === equipmentId)
    const machine = machines.find((candidate): candidate is Record<string, unknown> => isRecord(candidate) && candidate.id === equipmentId)
    if (asset.commissioningStatus === 'not_commissioned') {
      if (matches.length || machine) throw new Error('Uncommissioned equipment cannot retain runtime commissioning history.')
      continue
    }
    if (matches.length !== 1 || !machine || !isRecord(asset.commissioning)) throw new Error('Commissioned equipment requires one runtime machine and one immutable event.')
    const event = matches[0]
    const commissioning = asset.commissioning
    if (commissioning.actionId !== event.actionId
      || commissioning.commissionedAt !== event.createdAt
      || commissioning.commissionedBy !== event.actor
      || commissioning.installedAt !== event.installedAt
      || commissioning.initialState !== event.toState
      || commissioning.safetyBaselineReference !== event.evidenceReference
      || asset.workCentreId !== event.workCentreId
      || machine.name !== asset.name
      || event.summary !== `Commissioned ${String(asset.name)} at ${String(asset.workCentreId)}`) throw new Error('Equipment commissioning record does not match its immutable event.')
    const laterLifecycle = events.filter((candidate): candidate is Record<string, unknown> => isRecord(candidate)
      && candidate.subjectId === equipmentId
      && ['machine_state_changed', 'downtime_started', 'downtime_ended', 'maintenance_started', 'maintenance_completed', 'equipment_maintenance_strategy_saved'].includes(String(candidate.kind)))
    if (laterLifecycle.some((candidate) => timestampBefore(candidate.createdAt as string, event.createdAt as string))) throw new Error('Equipment lifecycle history cannot predate commissioning.')
    commissionedIds.add(equipmentId)
  }
  if (equipmentCommissionEvents.length !== commissionedIds.size) throw new Error('Equipment commissioning history contains an unknown or duplicate event.')
  if (openingMachineIds) {
    const postOpeningIds = machineIds.slice(openingMachineIds.length)
    if (postOpeningIds.length !== commissionedIds.size || postOpeningIds.some((id) => !commissionedIds.has(id))) throw new Error('Every runtime machine added after opening requires equipment commissioning.')
  }
  const equipmentMaintenanceStrategyEvents = events.filter((event): event is Record<string, unknown> => isRecord(event) && event.kind === 'equipment_maintenance_strategy_saved')
  const equipmentMaintenanceEvents = events.filter((event): event is Record<string, unknown> => isRecord(event) && (event.kind === 'maintenance_started' || event.kind === 'maintenance_completed'))
  let retainedEquipmentMaintenanceStrategyEvents = 0
  for (const asset of equipmentAssets) {
    const equipmentId = String(asset.id)
    const matches = equipmentMaintenanceStrategyEvents.filter((event) => event.subjectId === equipmentId)
    if (asset.maintenanceStrategy === undefined) {
      if (matches.length) throw new Error('Equipment without a maintenance strategy cannot retain strategy history.')
      continue
    }
    if (asset.commissioningStatus !== 'commissioned' || !isRecord(asset.commissioning) || !isRecord(asset.maintenanceStrategy)) throw new Error('Only commissioned equipment can retain a maintenance strategy.')
    const commissioning = asset.commissioning
    const strategy = asset.maintenanceStrategy
    const expectedRevisions = Array.from({ length: Number(strategy.revision) }, (_, index) => Number(strategy.revision) - index)
    if (JSON.stringify(matches.map((event) => event.strategyRevision)) !== JSON.stringify(expectedRevisions)) throw new Error('Equipment maintenance strategy revisions must be complete and newest first.')
    if (matches.some((event) => timestampBefore(event.createdAt as string, commissioning.commissionedAt as string))) throw new Error('Equipment maintenance strategy history cannot predate commissioning.')
    const latest = matches[0]
    const assetMaintenanceEvents = equipmentMaintenanceEvents.filter((event) => event.subjectId === equipmentId)
    for (const maintenanceEvent of assetMaintenanceEvents) {
      const applicableStrategy = matches.find((strategyEvent) => !timestampBefore(maintenanceEvent.createdAt as string, strategyEvent.createdAt as string))
      const isBound = maintenanceEvent.maintenanceStrategyActionId !== undefined
      if (Boolean(applicableStrategy) !== isBound) throw new Error('Commissioned equipment maintenance must bind the strategy active at execution time.')
      if (!applicableStrategy) continue
      if (maintenanceEvent.maintenanceStrategyActionId !== applicableStrategy.actionId
        || maintenanceEvent.maintenanceStrategyRevision !== applicableStrategy.strategyRevision
        || maintenanceEvent.maintenanceProcedureReference !== applicableStrategy.procedureReference
        || maintenanceEvent.maintenancePlannedDueAt !== applicableStrategy.nextDueAt
        || (maintenanceEvent.kind === 'maintenance_started' && maintenanceEvent.maintenanceOwner !== applicableStrategy.maintenanceOwner)) throw new Error('Equipment maintenance execution does not match its immutable strategy revision.')
      if (maintenanceEvent.kind === 'maintenance_completed') {
        const expectedNextDueAt = new Date(Date.parse(maintenanceEvent.createdAt as string) + Number(applicableStrategy.intervalDays) * 86_400_000).toISOString()
        if (maintenanceEvent.nextDueAt !== expectedNextDueAt) throw new Error('Equipment maintenance completion next due does not match its strategy interval.')
      }
    }
    const latestCompletion = assetMaintenanceEvents.find((event) => event.kind === 'maintenance_completed'
      && event.maintenanceStrategyActionId === latest?.actionId)
    const expectedCurrentNextDueAt = latestCompletion?.nextDueAt ?? latest?.nextDueAt
    if (!latest
      || strategy.actionId !== latest.actionId
      || strategy.savedAt !== latest.createdAt
      || strategy.savedBy !== latest.actor
      || strategy.maintenanceOwner !== latest.maintenanceOwner
      || strategy.intervalDays !== latest.intervalDays
      || strategy.nextDueAt !== expectedCurrentNextDueAt
      || strategy.procedureReference !== latest.procedureReference
      || strategy.safetyBaselineReference !== latest.evidenceReference) throw new Error('Equipment maintenance strategy does not match its latest immutable event.')
    retainedEquipmentMaintenanceStrategyEvents += matches.length
  }
  if (retainedEquipmentMaintenanceStrategyEvents !== equipmentMaintenanceStrategyEvents.length) throw new Error('Equipment maintenance strategy history contains an unknown event.')
  if (openingJobIds) {
    const openingJobIdSet = new Set(openingJobIds)
    const creationEvents = events.filter((event): event is Record<string, unknown> => isRecord(event) && event.kind === 'job_created')
    if (creationEvents.length !== jobs.length - openingJobIds.length) throw new Error('Every job after the Production opening plan requires one creation event.')
    for (const jobId of jobIds) {
      const matches = creationEvents.filter((event) => event.subjectId === jobId)
      if (openingJobIdSet.has(jobId) ? matches.length !== 0 : matches.length !== 1) throw new Error(`Production job ${jobId} does not match its opening history.`)
    }
  }

  for (const [index, candidate] of jobs.entries()) {
    if (!isRecord(candidate)) continue
    const creationEvents = events.filter((event): event is Record<string, unknown> => isRecord(event) && event.kind === 'job_created' && event.subjectId === candidate.id)
    if (creationEvents.length > 1) throw new Error(`jobs[${index}] has duplicate creation events.`)
    const creationEvent = creationEvents[0]
    if (candidate.shopDemandSource !== undefined) {
      const source = validateProductionShopDemandSource(candidate.shopDemandSource, `jobs[${index}].shopDemandSource`)
      if (!creationEvent) throw new Error(`jobs[${index}] Shop demand source requires immutable creation evidence.`)
      if (creationEvent.evidenceReference !== source.evidenceReference) throw new Error(`jobs[${index}] Shop demand source does not match its creation evidence.`)
    }
    const scheduleEvents = events.filter((event): event is Record<string, unknown> => isRecord(event) && event.kind === 'job_schedule_updated' && event.subjectId === candidate.id)
    if (!creationEvent && !scheduleEvents.length) continue
    const scheduleFieldCount = ['priority', 'dueAt'].filter((field) => candidate[field] !== undefined).length
    let expectedPriority: unknown
    let expectedDueAt: unknown
    let expectedOwner: unknown
    let ownerHistoryStarted = false
    let previousActivityAt: bigint | undefined
    if (creationEvent) {
      const snapshotFieldCount = ['jobPriority', 'jobDueAt'].filter((field) => creationEvent[field] !== undefined).length
      if (snapshotFieldCount === 2) {
        expectedPriority = creationEvent.jobPriority
        expectedDueAt = creationEvent.jobDueAt
      }
      if (creationEvent.jobOwner !== undefined) {
        expectedOwner = creationEvent.jobOwner
        ownerHistoryStarted = true
      }
      previousActivityAt = timestampMicros(creationEvent.createdAt as string) ?? undefined
    } else {
      const openingEvent = scheduleEvents[scheduleEvents.length - 1]
      const openingFieldCount = ['fromJobPriority', 'fromJobDueAt'].filter((field) => openingEvent[field] !== undefined).length
      if (openingFieldCount === 2) {
        expectedPriority = openingEvent.fromJobPriority
        expectedDueAt = openingEvent.fromJobDueAt
      }
      const openingOwnerEvent = [...scheduleEvents].reverse().find((event) => event.jobOwner !== undefined)
      if (openingOwnerEvent?.fromJobOwner !== undefined) {
        expectedOwner = openingOwnerEvent.fromJobOwner
        ownerHistoryStarted = true
      }
    }
    for (const event of [...scheduleEvents].reverse()) {
      const activityAt = timestampMicros(event.createdAt as string)
      if (activityAt === null) throw new Error(`jobs[${index}] schedule update timestamp is invalid.`)
      if (creationEvent && events.indexOf(event) >= events.indexOf(creationEvent)) throw new Error(`jobs[${index}] schedule update predates job creation.`)
      if (previousActivityAt !== undefined && activityAt < previousActivityAt) throw new Error(`jobs[${index}] schedule update timestamps contradict lifecycle order.`)
      previousActivityAt = activityAt
      const previousFieldCount = ['fromJobPriority', 'fromJobDueAt'].filter((field) => event[field] !== undefined).length
      const expectedFieldCount = [expectedPriority, expectedDueAt].filter((field) => field !== undefined).length
      if (previousFieldCount !== expectedFieldCount
        || (expectedFieldCount === 2
          && (event.fromJobPriority !== expectedPriority || event.fromJobDueAt !== expectedDueAt))) {
        throw new Error(`jobs[${index}] schedule update does not continue its immutable history.`)
      }
      const scheduleUnchanged = event.jobPriority === expectedPriority && event.jobDueAt === expectedDueAt
      if (event.jobOwner === undefined) {
        if (ownerHistoryStarted) throw new Error(`jobs[${index}] plan update drops its immutable owner history.`)
        if (scheduleUnchanged) throw new Error(`jobs[${index}] schedule update does not change the plan.`)
        if (event.summary !== `Updated ${String(candidate.product)} schedule for ${String(candidate.line)}`) throw new Error(`jobs[${index}] legacy schedule update summary is not canonical.`)
      } else {
        if (expectedOwner !== undefined) {
          if (event.fromJobOwner !== expectedOwner) throw new Error(`jobs[${index}] plan update does not continue its immutable owner history.`)
        } else if (event.fromJobOwner !== undefined) {
          throw new Error(`jobs[${index}] first owner assignment invents a previous owner.`)
        }
        if (scheduleUnchanged && ownerHistoryStarted && event.jobOwner === expectedOwner) throw new Error(`jobs[${index}] plan update does not change the plan.`)
        if (event.summary !== `Updated ${String(candidate.product)} plan for ${String(candidate.line)}`) throw new Error(`jobs[${index}] plan update summary is not canonical.`)
        expectedOwner = event.jobOwner
        ownerHistoryStarted = true
      }
      expectedPriority = event.jobPriority
      expectedDueAt = event.jobDueAt
    }
    const expectedFieldCount = [expectedPriority, expectedDueAt].filter((field) => field !== undefined).length
    if (scheduleFieldCount !== expectedFieldCount
      || (expectedFieldCount === 2
        && (candidate.priority !== expectedPriority || candidate.dueAt !== expectedDueAt))) {
      throw new Error(`jobs[${index}] schedule does not match its immutable event history.`)
    }
    if (ownerHistoryStarted) {
      if (candidate.owner !== expectedOwner) throw new Error(`jobs[${index}] owner does not match its immutable plan history.`)
    } else if (candidate.owner !== undefined) {
      throw new Error(`jobs[${index}] legacy history cannot acquire an owner without a plan update.`)
    }
  }

  for (const [index, candidate] of issues.entries()) {
    if (!isRecord(candidate)) continue
    const openingEvents = events.filter((event): event is Record<string, unknown> => isRecord(event) && event.kind === 'issue_opened' && event.subjectId === candidate.id)
    const resolutionEvents = events.filter((event): event is Record<string, unknown> => isRecord(event) && event.kind === 'issue_resolved' && event.subjectId === candidate.id)
    if (openingEvents.length > 1) throw new Error(`issues[${index}] has duplicate opening events.`)
    const openingEvent = openingEvents[0]
    const actionFieldCount = ['severity', 'owner', 'dueAt', 'containment'].filter((field) => candidate[field] !== undefined).length
    if (openingEvent) {
      if (timestampBefore(openingEvent.createdAt as string, candidate.createdAt as string)) {
        throw new Error(`issues[${index}] opening event predates the issue record.`)
      }
      const snapshotFieldCount = ['issueSeverity', 'issueOwner', 'issueDueAt', 'issueContainment'].filter((field) => openingEvent[field] !== undefined).length
      if (snapshotFieldCount === 4) {
        if (actionFieldCount !== 4
          || openingEvent.issueSeverity !== candidate.severity
          || openingEvent.issueOwner !== candidate.owner
          || openingEvent.issueDueAt !== candidate.dueAt
          || openingEvent.issueContainment !== candidate.containment) {
          throw new Error(`issues[${index}] action fields do not match their immutable opening event.`)
        }
      } else if (actionFieldCount !== 0) {
        throw new Error(`issues[${index}] legacy opening event cannot acquire action fields.`)
      }
      const issueSource = candidate.maintenanceFindingSource === undefined ? undefined : validateProductionMaintenanceFindingSource(candidate.maintenanceFindingSource, `issues[${index}].maintenanceFindingSource`)
      const eventSource = openingEvent.maintenanceFindingSource === undefined ? undefined : validateProductionMaintenanceFindingSource(openingEvent.maintenanceFindingSource, `issues[${index}] opening maintenanceFindingSource`)
      if (Boolean(issueSource) !== Boolean(eventSource) || (issueSource && JSON.stringify(issueSource) !== JSON.stringify(eventSource))) throw new Error(`issues[${index}] maintenance finding source does not match its immutable opening event.`)
      if (issueSource) {
        const completionEvent = events.find((event): event is Record<string, unknown> => isRecord(event) && event.kind === 'maintenance_completed' && event.actionId === issueSource.completionActionId)
        const startEvent = completionEvent === undefined ? undefined : events.find((event): event is Record<string, unknown> => isRecord(event) && event.kind === 'maintenance_started' && event.actionId === completionEvent.maintenanceStartActionId)
        const machine = machines.find((entry): entry is Record<string, unknown> => isRecord(entry) && entry.id === issueSource.equipmentId)
        if (!completionEvent || !startEvent || !machine
          || completionEvent.subjectId !== issueSource.equipmentId
          || machine.name !== issueSource.equipmentName
          || startEvent.maintenanceOwner !== issueSource.maintenanceOwner
          || completionEvent.createdAt !== issueSource.completedAt
          || completionEvent.maintenanceStrategyActionId !== issueSource.strategyActionId
          || completionEvent.maintenanceStrategyRevision !== issueSource.strategyRevision
          || completionEvent.maintenanceReturnToService !== issueSource.returnToService
          || completionEvent.maintenanceFindings !== issueSource.findings
          || completionEvent.evidenceReference !== issueSource.evidenceReference) throw new Error(`issues[${index}] maintenance finding source does not match reviewed completion evidence.`)
        if (events.indexOf(openingEvent) >= events.indexOf(completionEvent)) throw new Error(`issues[${index}] maintenance finding problem must follow its reviewed completion.`)
        if (issues.filter((entry): entry is Record<string, unknown> => isRecord(entry) && isRecord(entry.maintenanceFindingSource) && entry.maintenanceFindingSource.completionActionId === issueSource.completionActionId).length !== 1) throw new Error(`issues[${index}] duplicates a maintenance finding problem.`)
      }
    } else if (actionFieldCount !== 0 || candidate.maintenanceFindingSource !== undefined) {
      throw new Error(`issues[${index}] action fields and maintenance source require an immutable opening event.`)
    }

    if (candidate.status === 'open') {
      if (resolutionEvents.length) throw new Error(`issues[${index}] is open but has a resolution event.`)
      continue
    }
    if (!isRecord(candidate.resolution)) {
      if (openingEvent || resolutionEvents.length) throw new Error(`issues[${index}] is resolved without matching proof.`)
      continue
    }
    const resolution = candidate.resolution
    const matchingEvents = resolutionEvents.filter((event) => isRecord(event) && event.actionId === resolution.actionId)
    if (resolutionEvents.length !== 1 || matchingEvents.length !== 1) throw new Error(`issues[${index}] resolution is not backed by exactly one event.`)
    const resolutionEvent = matchingEvents[0]
    if (!isRecord(resolutionEvent)
      || resolutionEvent.createdAt !== resolution.resolvedAt
      || resolutionEvent.actor !== resolution.resolvedBy
      || resolutionEvent.reason !== resolution.reason
      || resolutionEvent.evidenceReference !== resolution.evidenceReference
      || JSON.stringify(resolutionEvent.maintenanceCorrectiveAction) !== JSON.stringify(resolution.maintenanceCorrectiveAction)
      || JSON.stringify(resolutionEvent.qualityCorrectiveAction) !== JSON.stringify(resolution.qualityCorrectiveAction)) {
      throw new Error(`issues[${index}] resolution proof does not match its immutable event.`)
    }
    const qualityCorrectiveAction = resolution.qualityCorrectiveAction === undefined ? undefined : validateProductionQualityCorrectiveAction(resolution.qualityCorrectiveAction, `issues[${index}].resolution.qualityCorrectiveAction`)
    if (qualityCorrectiveAction) {
      const expectedPriorIssueIds = productionQualityPriorIssueIds(issues as ProductionIssue[], candidate.id as string, qualityCorrectiveAction.recurrenceKey, resolution.resolvedAt as string)
      if (JSON.stringify(qualityCorrectiveAction.priorIssueIds) !== JSON.stringify(expectedPriorIssueIds)) throw new Error(`issues[${index}] quality recurrence links do not match prior CAPA evidence.`)
    }
    if (openingEvent && events.indexOf(resolutionEvent) >= events.indexOf(openingEvent)) {
      throw new Error(`issues[${index}] resolution must follow its opening event.`)
    }
  }
  for (const jobId of jobIds) {
    const job = jobs.find((candidate) => isRecord(candidate) && candidate.id === jobId)
    const recordedGood = events.reduce<number>((total, candidate) => {
      if (!isRecord(candidate) || candidate.kind !== 'output_recorded' || candidate.subjectId !== jobId || candidate.outputKind === 'scrap') return total
      return total + Number(candidate.quantity)
    }, 0)
    const recordedScrap = events.reduce<number>((total, candidate) => {
      if (!isRecord(candidate) || candidate.kind !== 'output_recorded' || candidate.subjectId !== jobId || candidate.outputKind !== 'scrap') return total
      return total + Number(candidate.quantity)
    }, 0)
    if (!isRecord(job) || recordedGood > Number(job.output)) throw new Error(`Good output events exceed the stored output for ${jobId}.`)
    if (recordedScrap !== Number(job.scrap ?? 0)) throw new Error(`Scrap events do not match the stored scrap for ${jobId}.`)
  }
  for (const jobId of jobIds) {
    const job = jobs.find((candidate): candidate is Record<string, unknown> => isRecord(candidate) && candidate.id === jobId)
    if (!job) continue
    const closeEvents = events.filter((candidate): candidate is Record<string, unknown> => isRecord(candidate) && candidate.kind === 'job_closed' && candidate.subjectId === jobId)
    if (!isRecord(job.closure)) {
      if (closeEvents.length) throw new Error(`Job ${jobId} has a close event without closure proof.`)
      continue
    }
    const closure = job.closure
    const matchingEvents = closeEvents.filter((event) => event.actionId === closure.actionId)
    if (closeEvents.length !== 1 || matchingEvents.length !== 1) throw new Error(`Job ${jobId} closure is not backed by exactly one event.`)
    const closeEvent = matchingEvents[0]
    if (closeEvent.createdAt !== closure.closedAt
      || closeEvent.actor !== closure.closedBy
      || closeEvent.reason !== closure.reason
      || closeEvent.evidenceReference !== closure.evidenceReference
      || closeEvent.shiftRef !== closure.shiftRef
      || closeEvent.remainingQuantity !== closure.remainingUnits) {
      throw new Error(`Job ${jobId} closure proof does not match its immutable event.`)
    }
    if (closeEvent.summary !== `Closed ${String(job.product)} short with ${Number(closure.remainingUnits)} units remaining`) throw new Error(`Job ${jobId} close summary is not canonical.`)
    const closeIndex = events.indexOf(closeEvent)
    const creationEvent = events.find((candidate): candidate is Record<string, unknown> => isRecord(candidate) && candidate.kind === 'job_created' && candidate.subjectId === jobId)
    if (creationEvent && closeIndex >= events.indexOf(creationEvent)) throw new Error(`Job ${jobId} closure predates job creation.`)
    if (creationEvent && timestampBefore(closeEvent.createdAt as string, creationEvent.createdAt as string)) throw new Error(`Job ${jobId} closure timestamp predates job creation.`)
    const laterActivity = events.some((candidate, eventIndex) => isRecord(candidate)
      && eventIndex < closeIndex
      && candidate.subjectId === jobId
      && (candidate.kind === 'job_schedule_updated' || candidate.kind === 'output_recorded' || candidate.kind === 'material_consumed' || candidate.kind === 'quality_hold_placed'))
    if (laterActivity) throw new Error(`Job ${jobId} has scheduling, output, material use, or a new quality hold after closure.`)
    const laterEventHasEarlierTimestamp = events.some((candidate, eventIndex) => isRecord(candidate)
      && eventIndex < closeIndex
      && candidate.subjectId === jobId
      && timestampBefore(candidate.createdAt as string, closeEvent.createdAt as string))
    if (laterEventHasEarlierTimestamp) throw new Error(`Job ${jobId} activity appended after closure predates the close timestamp.`)
    const priorActivityHasLaterTimestamp = events.some((candidate, eventIndex) => isRecord(candidate)
      && eventIndex > closeIndex
      && candidate.subjectId === jobId
      && candidate.kind !== 'job_created'
      && timestampBefore(closeEvent.createdAt as string, candidate.createdAt as string))
    if (priorActivityHasLaterTimestamp) throw new Error(`Job ${jobId} closure timestamp contradicts earlier activity.`)
  }
  for (const event of events) {
    if (!isRecord(event) || event.kind !== 'material_consumed') continue
    const job = jobs.find((candidate): candidate is Record<string, unknown> => isRecord(candidate) && candidate.id === event.subjectId)
    if (!job) throw new Error(`Material use for ${String(event.subjectId)} references an unknown job.`)
    const materialLotSummary = event.materialLot === undefined ? '' : ` · lot ${String(event.materialLot)}`
    if (event.summary !== `Used ${materialQuantityText(event.quantity as number)} ${String(event.materialUnit)} ${String(event.materialRef)}${materialLotSummary}`) throw new Error(`Material use summary for ${String(event.subjectId)} is not canonical.`)
    const creationEvent = events.find((candidate): candidate is Record<string, unknown> => isRecord(candidate) && candidate.kind === 'job_created' && candidate.subjectId === event.subjectId)
    if (creationEvent && events.indexOf(event) >= events.indexOf(creationEvent)) throw new Error(`Material use for ${String(event.subjectId)} predates job creation.`)
    if (creationEvent && timestampBefore(event.createdAt as string, creationEvent.createdAt as string)) throw new Error(`Material use timestamp for ${String(event.subjectId)} predates job creation.`)
  }
  for (const jobId of jobIds) {
    const job = jobs.find((candidate): candidate is Record<string, unknown> => isRecord(candidate) && candidate.id === jobId)
    if (!job) continue
    const jobEvents = events
      .filter((candidate): candidate is Record<string, unknown> => isRecord(candidate)
        && candidate.subjectId === jobId
        && (candidate.kind === 'job_schedule_updated' || candidate.kind === 'output_recorded' || candidate.kind === 'material_consumed'))
      .reverse()
    const recordedGood = jobEvents.reduce((total, event) => total + (event.kind === 'output_recorded' && event.outputKind !== 'scrap' ? Number(event.quantity) : 0), 0)
    const recordedScrap = jobEvents.reduce((total, event) => total + (event.kind === 'output_recorded' && event.outputKind === 'scrap' ? Number(event.quantity) : 0), 0)
    let goodAtEvent = Number(job.output) - recordedGood
    let scrapAtEvent = Number(job.scrap ?? 0) - recordedScrap
    if (!Number.isSafeInteger(goodAtEvent) || goodAtEvent < 0 || !Number.isSafeInteger(scrapAtEvent) || scrapAtEvent < 0) throw new Error(`Job activity history for ${jobId} has an invalid opening balance.`)
    for (const event of jobEvents) {
      if (event.kind === 'job_schedule_updated') {
        if (goodAtEvent + scrapAtEvent >= Number(job.target)) throw new Error(`Job schedule for ${jobId} changed after the job reached target.`)
        continue
      }
      if (event.kind === 'material_consumed') {
        if (goodAtEvent + scrapAtEvent >= Number(job.target)) throw new Error(`Material use for ${jobId} occurred after the job reached target.`)
        continue
      }
      if (event.outputKind === 'scrap') scrapAtEvent += Number(event.quantity)
      else goodAtEvent += Number(event.quantity)
    }
  }
  for (const jobId of jobIds) {
    const job = jobs.find((candidate): candidate is Record<string, unknown> => isRecord(candidate) && candidate.id === jobId)
    if (!job) continue
    const holdEvents = events.filter((candidate): candidate is Record<string, unknown> => isRecord(candidate)
      && (candidate.kind === 'quality_hold_placed' || candidate.kind === 'quality_hold_released')
      && candidate.subjectId === jobId)
    const creationEvent = events.find((candidate): candidate is Record<string, unknown> => isRecord(candidate) && candidate.kind === 'job_created' && candidate.subjectId === jobId)
    if (creationEvent && holdEvents.some((event) => events.indexOf(event) >= events.indexOf(creationEvent))) throw new Error(`Quality hold history for ${jobId} predates job creation.`)
    if (creationEvent && holdEvents.some((event) => timestampBefore(event.createdAt as string, creationEvent.createdAt as string))) throw new Error(`Quality hold timestamp for ${jobId} predates job creation.`)
    let activeHoldEvent: Record<string, unknown> | undefined
    let previousActivityAt: bigint | undefined
    for (const event of [...holdEvents].reverse()) {
      const activityAt = timestampMicros(event.createdAt as string)
      if (activityAt === null) throw new Error(`Quality hold timestamp for ${jobId} is invalid.`)
      if (previousActivityAt !== undefined && activityAt < previousActivityAt) throw new Error(`Quality hold timestamps for ${jobId} contradict lifecycle order.`)
      previousActivityAt = activityAt
      if (event.kind === 'quality_hold_placed') {
        if (activeHoldEvent) throw new Error(`Quality hold history for ${jobId} places a second active hold.`)
        if (event.summary !== `Held ${job.product} for quality review`) throw new Error(`Quality hold summary for ${jobId} is not canonical.`)
        activeHoldEvent = event
      } else {
        if (!activeHoldEvent) throw new Error(`Quality hold history for ${jobId} releases an unheld job.`)
        if (event.summary !== `Released ${job.product} from quality hold`) throw new Error(`Quality release summary for ${jobId} is not canonical.`)
        activeHoldEvent = undefined
      }
    }
    if (activeHoldEvent) {
      if (!isRecord(job.qualityHold)
        || job.qualityHold.actionId !== activeHoldEvent.actionId
        || job.qualityHold.heldAt !== activeHoldEvent.createdAt
        || job.qualityHold.heldBy !== activeHoldEvent.actor
        || job.qualityHold.reason !== activeHoldEvent.reason
        || job.qualityHold.evidenceReference !== activeHoldEvent.evidenceReference) {
        throw new Error(`Current quality hold for ${jobId} does not match its immutable event.`)
      }
    } else if (job.qualityHold !== undefined) {
      throw new Error(`Current quality hold for ${jobId} has no unmatched hold event.`)
    }
  }
  for (const machineId of machineIds) {
    const machine = machines.find((candidate) => isRecord(candidate) && candidate.id === machineId)
    const commissioningEvent = events.find((candidate): candidate is Record<string, unknown> => isRecord(candidate) && candidate.kind === 'equipment_commissioned' && candidate.subjectId === machineId)
    const machineEvents = events.filter((candidate): candidate is Record<string, unknown> => isRecord(candidate) && candidate.kind === 'machine_state_changed' && candidate.subjectId === machineId)
    const initialState = commissioningEvent?.toState ?? (machineEvents.length ? 'running' : isRecord(machine) ? machine.state : 'running')
    const latestEvent = machineEvents[0]
    if (latestEvent && (!isRecord(machine) || latestEvent.toState !== machine.state)) throw new Error(`Latest machine event does not match ${machineId}.`)
    if (!latestEvent && (!isRecord(machine) || machine.state !== initialState)) throw new Error(`Machine ${machineId} does not match its initial observed state.`)
    const oldestFirst = [...machineEvents].reverse()
    if (oldestFirst.length && oldestFirst[0].fromState !== initialState) throw new Error(`Machine history for ${machineId} does not begin from its initial observed state.`)
    if (oldestFirst.length && commissioningEvent && timestampBefore(oldestFirst[0].createdAt as string, commissioningEvent.createdAt as string)) throw new Error(`Machine history for ${machineId} predates commissioning.`)
    for (let index = 1; index < oldestFirst.length; index += 1) {
      if (oldestFirst[index - 1].toState !== oldestFirst[index].fromState) throw new Error(`Machine history for ${machineId} contains a state gap.`)
    }
  }
  deriveProductionDowntimeIntervals(
    machines as ProductionMachine[],
    events as ProductionEvent[],
  )
  deriveProductionMaintenanceRecords(
    machines as ProductionMachine[],
    events as ProductionEvent[],
  )
  return value as ProductionState
}

function deriveProductionDowntimeIntervals(
  machines: ProductionMachine[],
  events: ProductionEvent[],
): ProductionDowntimeInterval[] {
  const intervals: ProductionDowntimeInterval[] = []
  for (const machine of machines) {
    const downtimeEvents = events.filter((event) => event.subjectId === machine.id
      && (event.kind === 'downtime_started' || event.kind === 'downtime_ended'))
    let activeInterval: ProductionDowntimeInterval | undefined
    let previousActivityAt: number | undefined
    for (const event of [...downtimeEvents].reverse()) {
      const activityAt = Date.parse(event.createdAt)
      if (previousActivityAt !== undefined && activityAt < previousActivityAt) throw new Error(`Downtime timestamps for ${machine.id} contradict lifecycle order.`)
      previousActivityAt = activityAt
      if (event.kind === 'downtime_started') {
        if (activeInterval) throw new Error(`Downtime history for ${machine.id} starts a second open interval.`)
        if (event.summary !== `Started downtime for ${machine.name}`) throw new Error(`Downtime start summary for ${machine.id} is not canonical.`)
        activeInterval = {
          startActionId: event.actionId,
          machineId: machine.id,
          machineName: machine.name,
          startedAt: event.createdAt,
          startedBy: event.actor,
          startReason: event.reason,
          startEvidenceReference: event.evidenceReference,
        }
        intervals.push(activeInterval)
        continue
      }
      if (!activeInterval) throw new Error(`Downtime history for ${machine.id} ends an interval that is not open.`)
      if (event.downtimeStartActionId !== activeInterval.startActionId) throw new Error(`Downtime end for ${machine.id} does not reference its open interval.`)
      if (event.summary !== `Ended downtime for ${machine.name}`) throw new Error(`Downtime end summary for ${machine.id} is not canonical.`)
      const durationMs = activityAt - Date.parse(activeInterval.startedAt)
      if (!Number.isSafeInteger(durationMs) || durationMs < 0) throw new Error(`Downtime duration for ${machine.id} is invalid.`)
      activeInterval.end = {
        actionId: event.actionId,
        endedAt: event.createdAt,
        endedBy: event.actor,
        reason: event.reason,
        evidenceReference: event.evidenceReference,
      }
      activeInterval.durationMs = durationMs
      activeInterval = undefined
    }
  }
  return intervals.sort((left, right) => {
    const timeDifference = Date.parse(right.startedAt) - Date.parse(left.startedAt)
    if (timeDifference) return timeDifference
    return left.startActionId < right.startActionId ? -1 : left.startActionId > right.startActionId ? 1 : 0
  })
}

function deriveProductionMaintenanceRecords(
  machines: ProductionMachine[],
  events: ProductionEvent[],
): ProductionMaintenanceRecord[] {
  const records: ProductionMaintenanceRecord[] = []
  for (const machine of machines) {
    const maintenanceEvents = events.filter((event) => event.subjectId === machine.id
      && (event.kind === 'maintenance_started' || event.kind === 'maintenance_completed'))
    let activeRecord: ProductionMaintenanceRecord | undefined
    let previousActivityAt: number | undefined
    for (const event of [...maintenanceEvents].reverse()) {
      const activityAt = Date.parse(event.createdAt)
      if (previousActivityAt !== undefined && activityAt < previousActivityAt) throw new Error(`Maintenance timestamps for ${machine.id} contradict lifecycle order.`)
      previousActivityAt = activityAt
      if (event.kind === 'maintenance_started') {
        if (activeRecord) throw new Error(`Maintenance history for ${machine.id} starts a second open record.`)
        if (event.summary !== `Started maintenance for ${machine.name}`) throw new Error(`Maintenance start summary for ${machine.id} is not canonical.`)
        activeRecord = {
          startActionId: event.actionId,
          machineId: machine.id,
          machineName: machine.name,
          owner: event.maintenanceOwner as string,
          startedAt: event.createdAt,
          startedBy: event.actor,
          scope: event.reason,
          startEvidenceReference: event.evidenceReference,
          ...(event.maintenanceStrategyActionId === undefined ? {} : {
            strategy: {
              actionId: event.maintenanceStrategyActionId,
              revision: event.maintenanceStrategyRevision as number,
              procedureReference: event.maintenanceProcedureReference as string,
              plannedDueAt: event.maintenancePlannedDueAt as string,
            },
          }),
        }
        records.push(activeRecord)
        continue
      }
      if (!activeRecord) throw new Error(`Maintenance history for ${machine.id} completes work that is not open.`)
      if (event.maintenanceStartActionId !== activeRecord.startActionId) throw new Error(`Maintenance completion for ${machine.id} does not reference its open record.`)
      if (event.summary !== `Completed maintenance for ${machine.name}`) throw new Error(`Maintenance completion summary for ${machine.id} is not canonical.`)
      if (Boolean(event.maintenanceStrategyActionId) !== Boolean(activeRecord.strategy)) throw new Error(`Maintenance completion for ${machine.id} has a mismatched strategy binding.`)
      if (activeRecord.strategy && (event.maintenanceStrategyActionId !== activeRecord.strategy.actionId
        || event.maintenanceStrategyRevision !== activeRecord.strategy.revision
        || event.maintenanceProcedureReference !== activeRecord.strategy.procedureReference
        || event.maintenancePlannedDueAt !== activeRecord.strategy.plannedDueAt)) throw new Error(`Maintenance completion for ${machine.id} does not match its reviewed strategy.`)
      activeRecord.completion = {
        actionId: event.actionId,
        completedAt: event.createdAt,
        completedBy: event.actor,
        outcome: event.reason,
        evidenceReference: event.evidenceReference,
        ...(event.nextDueAt === undefined ? {} : { nextDueAt: event.nextDueAt }),
        ...(event.maintenanceOutcome === undefined ? {} : {
          result: {
            outcome: event.maintenanceOutcome,
            findings: event.maintenanceFindings as string,
            procedureCompleted: true,
            returnToService: event.maintenanceReturnToService as ProductionMaintenanceReturnToService,
          },
        }),
      }
      activeRecord = undefined
    }
  }
  return records.sort((left, right) => {
    const timeDifference = Date.parse(right.startedAt) - Date.parse(left.startedAt)
    if (timeDifference) return timeDifference
    return left.startActionId < right.startActionId ? -1 : left.startActionId > right.startActionId ? 1 : 0
  })
}

function migrateLegacyProduction(value: unknown): ProductionState {
  if (!isRecord(value) || !Array.isArray(value.jobs) || !Array.isArray(value.issues) || !Array.isArray(value.machines)) throw new Error('Legacy Production workspace collections are incomplete.')
  const jobs = value.jobs.map((candidate, index): ProductionJob => {
    if (!isRecord(candidate)) throw new Error(`Legacy job ${index + 1} is invalid.`)
    const id = requiredText(candidate.id, `Legacy jobs[${index}].id`)
    const line = requiredText(candidate.line, `Legacy jobs[${index}].line`)
    const product = requiredText(candidate.product, `Legacy jobs[${index}].product`)
    assertSafeInteger(candidate.target, `Legacy jobs[${index}].target`, 1)
    assertSafeInteger(candidate.output, `Legacy jobs[${index}].output`)
    const target = Number(candidate.target)
    const output = Number(candidate.output)
    if (output > target) throw new Error(`Legacy job ${index + 1} output exceeds target.`)
    return { id, line, product, target, output }
  })
  const issues = value.issues.map((candidate, index): ProductionIssue => {
    if (!isRecord(candidate)) throw new Error(`Legacy issue ${index + 1} is invalid.`)
    if (!issueKinds.includes(candidate.kind as ProductionIssueKind)) throw new Error(`Legacy issue ${index + 1} kind is invalid.`)
    if (!validTimestamp(candidate.createdAt)) throw new Error(`Legacy issue ${index + 1} timestamp is invalid.`)
    if (candidate.status !== 'open' && candidate.status !== 'resolved') throw new Error(`Legacy issue ${index + 1} status is invalid.`)
    const kind = candidate.kind as ProductionIssueKind
    return {
      id: requiredText(candidate.id, `Legacy issues[${index}].id`),
      createdAt: candidate.createdAt as string,
      area: requiredText(candidate.area, `Legacy issues[${index}].area`),
      kind,
      summary: requiredText(candidate.summary, `Legacy issues[${index}].summary`),
      status: candidate.status,
    }
  })
  const machines = value.machines.map((candidate, index): ProductionMachine => {
    if (!isRecord(candidate)) throw new Error(`Legacy machine ${index + 1} is invalid.`)
    if (!productionMachineStates.includes(candidate.state as ProductionMachineState)) throw new Error(`Legacy machine ${index + 1} state is invalid.`)
    const state = candidate.state as ProductionMachineState
    return {
      id: requiredText(candidate.id, `Legacy machines[${index}].id`),
      name: requiredText(candidate.name, `Legacy machines[${index}].name`),
      state,
    }
  })
  return validateProductionState({ schema: PRODUCTION_WORKSPACE_SCHEMA, revision: 0, jobs, issues, machines, events: [] })
}

export function normalizeProduction(value: unknown): ProductionState {
  if (isRecord(value) && value.schema === PRODUCTION_WORKSPACE_SCHEMA) return validateProductionState(value)
  return migrateLegacyProduction(value)
}

function browserStorage() {
  try { return globalThis.localStorage as ProductionStorage | undefined } catch { return undefined }
}

function persistInitialState(storage: ProductionStorage, state: ProductionState, source: ProductionWorkspaceSnapshot['source']): ProductionWorkspaceSnapshot {
  try {
    const serialized = JSON.stringify(state)
    storage.setItem(PRODUCTION_KEY, serialized)
    if (storage.getItem(PRODUCTION_KEY) !== serialized) throw new Error('write_not_confirmed')
    return { state, source, error: '' }
  } catch {
    return { state, source, error: 'Production storage is unavailable. This workspace is read-only until browser storage is restored.' }
  }
}

export function readProductionWorkspace(storage = browserStorage()): ProductionWorkspaceReadSnapshot {
  if (!storage) return { state: createEmptyProduction(), source: 'recovery', error: 'Production storage is unavailable. No local data was changed.' }
  let currentRaw: string | null
  try { currentRaw = storage.getItem(PRODUCTION_KEY) } catch { return { state: createEmptyProduction(), source: 'recovery', error: 'Production storage could not be read. No local data was changed.' } }
  if (currentRaw !== null) {
    try {
      return { state: validateProductionState(JSON.parse(currentRaw)), source: 'current', error: '' }
    } catch {
      return { state: createEmptyProduction(), source: 'recovery', error: 'Production v2 data is malformed. The read failed closed without replacing data.' }
    }
  }

  for (const legacyKey of LEGACY_PRODUCTION_KEYS) {
    let legacyRaw: string | null
    try { legacyRaw = storage.getItem(legacyKey) } catch { return { state: createEmptyProduction(), source: 'recovery', error: 'Legacy Production data could not be read. The read failed closed without creating v2 data.' } }
    if (legacyRaw === null) continue
    try {
      return { state: migrateLegacyProduction(JSON.parse(legacyRaw)), source: 'legacy', error: '' }
    } catch {
      return { state: createEmptyProduction(), source: 'recovery', error: 'Legacy Production data is malformed. The read failed closed without creating v2 data.' }
    }
  }
  return { state: createEmptyProduction(), source: 'absent', error: '' }
}

export function loadProductionWorkspace(storage = browserStorage()): ProductionWorkspaceSnapshot {
  if (!storage) return { state: createEmptyProduction(), source: 'recovery', error: 'Production storage is unavailable. No local data was replaced.' }
  let currentRaw: string | null
  try { currentRaw = storage.getItem(PRODUCTION_KEY) } catch { return { state: createEmptyProduction(), source: 'recovery', error: 'Production storage could not be read. No local data was replaced.' } }
  if (currentRaw !== null) {
    try {
      return { state: validateProductionState(JSON.parse(currentRaw)), source: 'current', error: '' }
    } catch {
      return { state: createEmptyProduction(), source: 'recovery', error: 'Production v2 data is malformed. Recovery failed closed without restoring or replacing older data.' }
    }
  }

  for (const legacyKey of LEGACY_PRODUCTION_KEYS) {
    let legacyRaw: string | null
    try { legacyRaw = storage.getItem(legacyKey) } catch { return { state: createEmptyProduction(), source: 'recovery', error: 'Legacy Production data could not be read. Migration failed closed and did not create v2 data.' } }
    if (legacyRaw === null) continue
    try {
      return persistInitialState(storage, migrateLegacyProduction(JSON.parse(legacyRaw)), 'legacy')
    } catch {
      return { state: createEmptyProduction(), source: 'recovery', error: 'Legacy Production data is malformed. Migration failed closed and did not create v2 data.' }
    }
  }
  return persistInitialState(storage, createSeedProduction(Date.now()), 'seed')
}

export function productionWorkspaceCanWrite(
  storage = browserStorage(),
  lockManager = globalThis.navigator?.locks as unknown as ProductionLockManager | undefined,
) {
  if (!storage || !lockManager?.request || !storage.removeItem) return false
  const probeKey = `${PRODUCTION_KEY}.write-probe.${Date.now()}.${Math.random().toString(36).slice(2)}`
  const probeValue = `${probeKey}.confirmed`
  try {
    const raw = storage.getItem(PRODUCTION_KEY)
    if (raw === null) return false
    validateProductionState(JSON.parse(raw))
    storage.setItem(probeKey, probeValue)
    const confirmed = storage.getItem(probeKey) === probeValue
    storage.removeItem(probeKey)
    return confirmed && storage.getItem(probeKey) === null
  } catch {
    try { storage.removeItem(probeKey) } catch { /* storage remains blocked */ }
    return false
  }
}

function productionOrderExecutionAppendIsExact(current: ProductionState, candidate: ProductionState) {
  if (candidate.schema !== current.schema
    || candidate.revision !== current.revision
    || JSON.stringify(candidate.jobs) !== JSON.stringify(current.jobs)
    || JSON.stringify(candidate.issues) !== JSON.stringify(current.issues)
    || JSON.stringify(candidate.machines) !== JSON.stringify(current.machines)
    || JSON.stringify(candidate.events) !== JSON.stringify(current.events)
    || JSON.stringify(candidate.openingPlan) !== JSON.stringify(current.openingPlan)
    || JSON.stringify(candidate.equipmentMaster) !== JSON.stringify(current.equipmentMaster)) return false

  const beforeEntries = new Map(productionOrderPortfolioEntries(current).map((entry) => [entry.jobId, entry.execution]))
  const afterEntries = new Map(productionOrderPortfolioEntries(candidate).map((entry) => [entry.jobId, entry.execution]))
  const changedJobIds = [...new Set([...beforeEntries.keys(), ...afterEntries.keys()])]
    .filter((jobId) => JSON.stringify(beforeEntries.get(jobId)) !== JSON.stringify(afterEntries.get(jobId)))
  if (changedJobIds.length !== 1) return false

  const changedJobId = changedJobIds[0]
  const before = beforeEntries.get(changedJobId) ?? createEmptyPlantOrderState()
  const after = afterEntries.get(changedJobId)
  const command = after?.commands.at(-1)
  if (!after
    || !command
    || after.revision !== before.revision + 1
    || after.commands.length !== before.commands.length + 1
    || JSON.stringify(after.commands.slice(0, -1)) !== JSON.stringify(before.commands)
    || command.previousDigest !== before.headDigest
    || command.digest !== after.headDigest) return false

  const projection = projectPlantOrder(after)
  const job = current.jobs.find((candidateJob) => candidateJob.id === changedJobId)
  const remaining = job ? job.target - job.output - (job.scrap ?? 0) : 0
  if (!projection.plan
    || !job
    || job.closure
    || job.qualityHold
    || remaining < 1
    || projection.plan.job.jobId !== changedJobId
    || projection.plan.job.product !== job.product
    || projection.plan.job.targetQuantity !== remaining) return false

  const commandAt = Date.parse(command.payload.proof.capturedAt)
  const latestOperatingAt = current.events[0] ? Date.parse(current.events[0].createdAt) : Number.NEGATIVE_INFINITY
  return Number.isFinite(commandAt) && commandAt >= latestOperatingAt
}

function productionWorkingSampleTransitionIsExact(current: ProductionState, candidate: ProductionState) {
  const sampleId = productionWorkingSamplePackId(candidate)
  if (!sampleId || candidate.jobs.length < 1 || candidate.events.length !== candidate.jobs.length) return false
  const prefix = `${productionWorkingSampleActionPrefix}${sampleId.toUpperCase()}-`
  const sampleEvents = candidate.events.filter((event) => event.actionId.startsWith(prefix))
  if (sampleEvents.length !== candidate.events.length) return false
  const capturedAt = sampleEvents[0]?.createdAt
  const reasonMatch = /^Seed the (.+) working sample\.$/.exec(sampleEvents[0]?.reason ?? '')
  if (!capturedAt || !reasonMatch
    || sampleEvents.some((event) => event.createdAt !== capturedAt || event.reason !== sampleEvents[0].reason)) return false
  // Re-derived from the candidate itself, not compared against a fixed reference: this check is
  // a STRUCTURAL invariant (only installProductionWorkingSampleJobs's own construction pattern
  // can explain the delta from `current`), the same way the jobs above are re-verified without
  // being compared to any canonical job list. Leaving machines/issue out of this recompute (as
  // an earlier version of this function did) forced every candidate to match the generic seed
  // floor byte-for-byte, which silently made installProductionWorkingSampleJobs's own machines
  // and issue parameters unusable through this write boundary -- the only path app code actually
  // calls. A pack that hands over its own floor was never reachable in the running app.
  const floorIssue = candidate.issues.find((issue) => issue.id === productionSeedAnchorIssueId)
  const expected = installProductionWorkingSampleJobs(current, {
    sampleId,
    sampleName: reasonMatch[1],
    jobs: candidate.jobs.map((job) => ({ ...job })),
    capturedAt,
    machines: candidate.machines.map((machine) => ({ ...machine })),
    issue: floorIssue ? { area: floorIssue.area, summary: floorIssue.summary } : undefined,
  })
  return Boolean(expected) && JSON.stringify(expected) === JSON.stringify(candidate)
}

export async function mutateProductionWorkspace(
  transition: (state: ProductionState) => ProductionState | null,
  storage = browserStorage(),
  lockManager = globalThis.navigator?.locks as unknown as ProductionLockManager | undefined,
  mutationKind: ProductionWorkspaceMutationKind = 'operating-event',
): Promise<ProductionMutationResult> {
  if (!storage) return { ok: false, error: 'Production storage is unavailable; the change was not applied.' }
  if (!lockManager?.request) return { ok: false, error: 'This browser cannot lock Production writes; the change was not applied.' }
  try {
    return await lockManager.request(PRODUCTION_LOCK, { mode: 'exclusive' }, async () => {
      let raw: string | null
      try { raw = storage.getItem(PRODUCTION_KEY) } catch { return { ok: false, error: 'Production data could not be read; the change was not applied.' } as const }
      if (raw === null) return { ok: false, error: 'Production v2 is not initialized; reload before making a change.' } as const
      let current: ProductionState
      try { current = validateProductionState(JSON.parse(raw)) } catch { return { ok: false, error: 'Production v2 is malformed; the change failed closed.' } as const }
      let next: ProductionState | null
      try { next = transition(current) } catch { return { ok: false, error: 'The Production transition failed integrity checks. Nothing was written.' } as const }
      if (!next) return { ok: false, error: 'The Production state changed or the requested transition is not valid. Nothing was written.' } as const
      if (next === current) return { ok: true, state: current, replayed: true } as const
      let candidate: ProductionState
      try { candidate = validateProductionState(next) } catch { return { ok: false, error: 'The proposed Production state failed integrity checks. Nothing was written.' } as const }
      if (mutationKind === 'order-execution') {
        if (!productionOrderExecutionAppendIsExact(current, candidate)) {
          return { ok: false, error: 'Production order execution must append exactly one chained command without changing operating history. Nothing was written.' } as const
        }
      } else if (mutationKind === 'working-sample') {
        if (!productionWorkingSampleTransitionIsExact(current, candidate)) {
          return { ok: false, error: 'A Plant working sample can replace only untouched sample jobs. Nothing was written.' } as const
        }
      } else if (mutationKind === 'operating-event') {
        const revisionDelta = candidate.revision - current.revision
        const eventDelta = candidate.events.length - current.events.length
        if (JSON.stringify(productionOrderPortfolioEntries(candidate)) !== JSON.stringify(productionOrderPortfolioEntries(current))) {
          return { ok: false, error: 'Production order execution can change only through its dedicated write boundary. Nothing was written.' } as const
        }
        if (!Number.isSafeInteger(revisionDelta)
          || revisionDelta < 1
          || revisionDelta > 100
          || eventDelta !== revisionDelta
          || JSON.stringify(candidate.events.slice(eventDelta)) !== JSON.stringify(current.events)) {
          return { ok: false, error: 'Production changes must append one event per revision, with at most 100 events in one locked transaction. Nothing was written.' } as const
        }
      } else {
        return { ok: false, error: 'Production write boundary is invalid. Nothing was written.' } as const
      }
      let serialized: string
      try { serialized = JSON.stringify(candidate) } catch { return { ok: false, error: 'The proposed Production state could not be serialized. Nothing was written.' } as const }
      try {
        storage.setItem(PRODUCTION_KEY, serialized)
        if (storage.getItem(PRODUCTION_KEY) !== serialized) return { ok: false, error: 'Production storage did not confirm the write.' } as const
      } catch {
        return { ok: false, error: 'Production storage rejected the write. The interface was not advanced.' } as const
      }
      return { ok: true, state: next, replayed: false } as const
    })
  } catch {
    return { ok: false, error: 'The Production write lock failed. Nothing was applied.' }
  }
}

export function mutateProductionWorkingSample(
  transition: (state: ProductionState) => ProductionState | null,
  storage = browserStorage(),
  lockManager = globalThis.navigator?.locks as unknown as ProductionLockManager | undefined,
) {
  return mutateProductionWorkspace(transition, storage, lockManager, 'working-sample')
}

function actionIdIsUsed(state: ProductionState, actionId: string) {
  return state.events.some((event) => event.actionId === actionId)
}

export function productionShiftOutput(state: ProductionState, shiftRef: string): ProductionShiftOutput {
  if (!validCanonicalText(shiftRef, 80)) return { goodUnits: 0, scrapUnits: 0, entryCount: 0 }
  return state.events.reduce<ProductionShiftOutput>((subtotal, event) => {
    if (event.kind !== 'output_recorded' || event.shiftRef !== shiftRef) return subtotal
    return {
      goodUnits: subtotal.goodUnits + (event.outputKind === 'scrap' ? 0 : event.quantity ?? 0),
      scrapUnits: subtotal.scrapUnits + (event.outputKind === 'scrap' ? event.quantity ?? 0 : 0),
      entryCount: subtotal.entryCount + 1,
    }
  }, { goodUnits: 0, scrapUnits: 0, entryCount: 0 })
}

function canonicalProductionValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalProductionValue)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, nested]) => [key, canonicalProductionValue(nested)]),
  )
}

function productionCanonical(value: ProductionState) {
  return JSON.stringify(canonicalProductionValue(value))
}

export function productionStateCanonical(state: ProductionState) {
  return productionCanonical(validateProductionState(state))
}

export function productionDowntimeIntervals(state: ProductionState) {
  const current = validateProductionState(state)
  return deriveProductionDowntimeIntervals(current.machines, current.events)
}

export function productionMaintenanceRecords(state: ProductionState) {
  const current = validateProductionState(state)
  return deriveProductionMaintenanceRecords(current.machines, current.events)
}

export function productionMaintenanceFindingSource(
  state: ProductionState,
  completionActionId: string,
): ProductionMaintenanceFindingSource | null {
  if (!validCanonicalText(completionActionId, 160)) return null
  const current = validateProductionState(state)
  if (current.issues.some((issue) => issue.maintenanceFindingSource?.completionActionId === completionActionId)) return null
  const record = deriveProductionMaintenanceRecords(current.machines, current.events)
    .find((candidate) => candidate.completion?.actionId === completionActionId)
  const completion = record?.completion
  const result = completion?.result
  const strategy = record?.strategy
  if (!record || !completion || !result || !strategy
    || (result.returnToService !== 'restricted' && result.returnToService !== 'not_recommended')) return null
  return {
    contract: 'supermega.production.maintenance-finding-source.v1',
    equipmentId: record.machineId,
    equipmentName: record.machineName,
    maintenanceOwner: record.owner,
    completionActionId: completion.actionId,
    completedAt: completion.completedAt,
    strategyActionId: strategy.actionId,
    strategyRevision: strategy.revision,
    returnToService: result.returnToService,
    findings: result.findings,
    evidenceReference: completion.evidenceReference,
  }
}

export function productionMaintenanceDueQueue(
  state: ProductionState,
  asOf: string,
): ProductionMaintenanceDueQueue {
  const current = validateProductionState(state)
  if (!validDowntimeTimestamp(asOf)) throw new Error('Maintenance due queue requires a canonical UTC millisecond as-of time.')
  const asOfTime = Date.parse(asOf)
  const criticalityRank: Record<ProductionEquipmentCriticality, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  const items = (current.equipmentMaster?.assets ?? []).flatMap((asset): ProductionMaintenanceDueItem[] => {
    const strategy = asset.maintenanceStrategy
    if (asset.commissioningStatus !== 'commissioned' || !strategy) return []
    const remainingMs = Date.parse(strategy.nextDueAt) - asOfTime
    const latestCompletion = current.events.find((event) => event.kind === 'maintenance_completed'
      && event.subjectId === asset.id
      && event.maintenanceStrategyActionId === strategy.actionId)
    return [{
      assetId: asset.id,
      assetName: asset.name,
      criticality: asset.criticality,
      owner: strategy.maintenanceOwner,
      strategyActionId: strategy.actionId,
      strategyRevision: strategy.revision,
      procedureReference: strategy.procedureReference,
      dueAt: strategy.nextDueAt,
      status: remainingMs <= 0 ? 'overdue' : remainingMs <= 7 * 86_400_000 ? 'due_soon' : 'planned',
      daysUntilDue: Math.ceil(remainingMs / 86_400_000),
      ...(latestCompletion === undefined ? {} : {
        lastCompletionActionId: latestCompletion.actionId,
        lastCompletedAt: latestCompletion.createdAt,
      }),
    }]
  }).sort((left, right) => {
    const leftOverdueRank = left.status === 'overdue' ? 0 : 1
    const rightOverdueRank = right.status === 'overdue' ? 0 : 1
    return leftOverdueRank - rightOverdueRank
      || Date.parse(left.dueAt) - Date.parse(right.dueAt)
      || criticalityRank[left.criticality] - criticalityRank[right.criticality]
      || left.assetId.localeCompare(right.assetId)
  })
  return { contract: 'supermega.production.maintenance-due-queue.v1', asOf, items }
}

export function buildProductionShiftHandoff(state: ProductionState, shiftRef: string, plantOrderScope = 'plant:local-sample'): ProductionShiftHandoff | null {
  if (!validCanonicalText(shiftRef, 80)) return null
  if (!validCanonicalText(plantOrderScope, 160)) return null
  const current = validateProductionState(state)
  const shiftEntries = current.events
    .filter((event) => event.kind === 'output_recorded' && event.shiftRef === shiftRef)
    .map((event) => ({
      actionId: event.actionId,
      jobId: event.subjectId,
      product: current.jobs.find((job) => job.id === event.subjectId)?.product ?? event.subjectId,
      outputKind: event.outputKind ?? 'good',
      quantity: event.quantity ?? 0,
      recordedAt: event.createdAt,
      recordedBy: event.actor,
      reason: event.reason,
      evidenceReference: event.evidenceReference,
    }))
  const materialEntries = current.events
    .filter((event) => event.kind === 'material_consumed' && event.shiftRef === shiftRef)
    .map((event) => ({
      actionId: event.actionId,
      jobId: event.subjectId,
      product: current.jobs.find((job) => job.id === event.subjectId)?.product ?? event.subjectId,
      materialRef: event.materialRef ?? '',
      ...(event.materialLot ? { materialLot: event.materialLot } : {}),
      materialUnit: event.materialUnit as ProductionMaterialUnit,
      quantity: event.quantity ?? 0,
      recordedAt: event.createdAt,
      recordedBy: event.actor,
      reason: event.reason,
      evidenceReference: event.evidenceReference,
    }))
  const materialTotalMap = new Map<string, { materialRef: string; materialUnit: ProductionMaterialUnit; quantityMilli: number; entryCount: number }>()
  for (const entry of materialEntries) {
    const key = JSON.stringify([entry.materialRef, entry.materialUnit])
    const currentTotal = materialTotalMap.get(key) ?? { materialRef: entry.materialRef, materialUnit: entry.materialUnit, quantityMilli: 0, entryCount: 0 }
    const quantityMilli = currentTotal.quantityMilli + (materialQuantityMilli(entry.quantity) ?? 0)
    if (!Number.isSafeInteger(quantityMilli)) throw new Error(`Material total for ${entry.materialRef} exceeds the safe fixed-precision limit.`)
    materialTotalMap.set(key, { ...currentTotal, quantityMilli, entryCount: currentTotal.entryCount + 1 })
  }
  const materialTotals = [...materialTotalMap.values()]
    .sort((left, right) => (left.materialRef < right.materialRef ? -1 : left.materialRef > right.materialRef ? 1 : productionMaterialUnits.indexOf(left.materialUnit) - productionMaterialUnits.indexOf(right.materialUnit)))
    .map((entry) => ({
      materialRef: entry.materialRef,
      materialUnit: entry.materialUnit,
      quantity: entry.quantityMilli / 1_000,
      entryCount: entry.entryCount,
    }))
  const shortCloses = current.events
    .filter((event) => event.kind === 'job_closed' && event.shiftRef === shiftRef)
    .map((event) => {
      const job = current.jobs.find((candidate) => candidate.id === event.subjectId)
      if (!job?.closure) throw new Error(`Short close for ${event.subjectId} has no matching job closure.`)
      return {
        actionId: event.actionId,
        jobId: job.id,
        product: job.product,
        shiftRef: job.closure.shiftRef,
        goodUnits: job.output,
        scrapUnits: job.scrap ?? 0,
        remainingUnits: job.closure.remainingUnits,
        recordedAt: event.createdAt,
        recordedBy: event.actor,
        reason: event.reason,
        evidenceReference: event.evidenceReference,
      }
    })
  const controlledOrders: ProductionShiftHandoff['controlledOrders'] = productionOrderPortfolioEntries(current).flatMap(({ jobId, execution }) => {
    const projection = projectPlantOrder(execution)
    const plan = projection.plan
    const job = current.jobs.find((candidate) => candidate.id === jobId)
    if (!plan || !job || projection.status === 'unplanned') throw new Error(`Controlled shift order ${jobId} is missing its reviewed plan or Production job.`)
    const nextOperation = projection.operations.find((operation) => operation.status !== 'complete')
    const bindingCurrent = productionJobPlanSourceDigest(plantOrderScope, job) === plan.sourceDigest
      && job.product === plan.job.product
      && job.target - job.output - (job.scrap ?? 0) === plan.job.targetQuantity
      && !job.qualityHold
      && !job.closure
    const disposition = projection.status === 'released_to_stock'
      ? 'released' as const
      : projection.status === 'inspection_due' || projection.status === 'quality_hold' || projection.status === 'ready_to_release'
        ? 'complete_not_released' as const
        : 'carry_forward' as const
    const exceptions: string[] = []
    const blockingReasons: string[] = []
    if (!bindingCurrent) exceptions.push('The Plant job changed after this controlled plan was reviewed.')
    if (nextOperation) exceptions.push(`Next operation ${nextOperation.operationId} has ${nextOperation.remainingQuantity} units remaining.`)
    if (projection.totalOutput > 0 && !projection.latestInspection) exceptions.push('Current controlled output has no inspection.')
    if (projection.qualityHold) exceptions.push(`Inspection ${projection.qualityHold.inspectionId} retains a quality hold.`)
    if (projection.status === 'ready_to_release') exceptions.push('Accepted output is waiting for accountable batch release.')
    if (projection.materialIssues.length > projection.genealogy.length) exceptions.push('Issued material is missing an exact input-lot to output-batch link.')
    if (projection.status === 'inspection_due') blockingReasons.push('Complete output needs a current inspection before shift close.')
    if (projection.status === 'quality_hold') blockingReasons.push('A controlled batch quality hold must be resolved before shift close.')
    if (projection.status === 'ready_to_release') blockingReasons.push('Accepted output needs accountable batch release before shift close.')
    if (!bindingCurrent) blockingReasons.push('The controlled plan must be reconciled to the current Plant job before shift close.')
    if (disposition === 'carry_forward' && !job.owner) blockingReasons.push('Carry-forward work needs a responsible owner.')
    if (disposition === 'carry_forward' && !job.dueAt) blockingReasons.push('Carry-forward work needs a due time.')
    return [{
      jobId,
      product: job.product,
      planId: plan.planId,
      planDigest: plan.packageDigest,
      bindingCurrent,
      status: projection.status,
      disposition,
      targetUnits: plan.job.targetQuantity,
      outputUnits: projection.totalOutput,
      acceptedUnits: projection.metrics.acceptedQuantity,
      completedOperationCount: projection.metrics.completedOperationCount,
      operationCount: projection.operations.length,
      genealogyLinkCount: projection.genealogy.length,
      ...(job.owner ? { owner: job.owner } : {}),
      ...(job.dueAt ? { dueAt: job.dueAt } : {}),
      ...(nextOperation ? { nextOperation: {
        operationId: nextOperation.operationId,
        name: nextOperation.name,
        status: nextOperation.status as 'blocked' | 'ready' | 'in_progress',
        remainingUnits: nextOperation.remainingQuantity,
      } } : {}),
      ...(projection.latestInspection ? { inspection: {
        inspectionId: projection.latestInspection.id,
        result: projection.latestInspection.result,
        inspectedUnits: projection.latestInspection.inspectedQuantity,
        acceptedUnits: projection.latestInspection.acceptedQuantity,
        rejectedUnits: projection.latestInspection.rejectedQuantity,
        actionId: projection.latestInspection.proof.actionId,
        evidenceReference: projection.latestInspection.proof.evidenceReference,
      } } : {}),
      ...(projection.batchRelease ? { batchRelease: {
        releaseId: projection.batchRelease.id,
        actionId: projection.batchRelease.proof.actionId,
        releasedAt: projection.batchRelease.proof.capturedAt,
        releasedBy: projection.batchRelease.proof.actor,
        evidenceReference: projection.batchRelease.proof.evidenceReference,
      } } : {}),
      exceptions,
      blockingReasons,
    }]
  })
  const unfinishedJobs = current.jobs
    .filter((job) => !job.closure && job.output + (job.scrap ?? 0) < job.target)
    .sort(compareProductionJobSchedule)
    .map((job) => ({
      id: job.id,
      line: job.line,
      product: job.product,
      target: job.target,
      goodUnits: job.output,
      scrapUnits: job.scrap ?? 0,
      remainingUnits: job.target - job.output - (job.scrap ?? 0),
      ...(job.owner ? { owner: job.owner } : {}),
      ...(job.priority && job.dueAt ? { priority: job.priority, dueAt: job.dueAt } : {}),
      ...(job.qualityHold ? { qualityHold: { ...job.qualityHold } } : {}),
    }))
  const activeHolds = current.jobs
    .filter((job): job is ProductionJob & { qualityHold: ProductionQualityHold } => Boolean(job.qualityHold))
    .map((job) => ({
      id: job.id,
      line: job.line,
      product: job.product,
      target: job.target,
      goodUnits: job.output,
      scrapUnits: job.scrap ?? 0,
      remainingUnits: Math.max(0, job.target - job.output - (job.scrap ?? 0)),
      qualityHold: { ...job.qualityHold },
    }))
  const openQualityIssues = current.issues
    .filter((issue) => issue.status === 'open' && issue.kind === 'quality')
    .map((issue) => ({
      id: issue.id,
      severity: issue.severity ?? 'medium',
      area: issue.area,
      summary: issue.summary,
      owner: issue.owner ?? 'Unassigned',
      dueAt: issue.dueAt ?? issue.createdAt,
      containment: issue.containment ?? 'No containment recorded',
    }))
  const priorityProblems = current.issues
    .filter((issue): issue is ProductionIssue & {
      severity: 'critical' | 'high'
      owner: string
      dueAt: string
      containment: string
    } => issue.status === 'open'
      && (issue.severity === 'critical' || issue.severity === 'high')
      && Boolean(issue.owner && issue.dueAt && issue.containment))
    .sort((left, right) => {
      const severityDifference = productionIssueSeverities.indexOf(left.severity) - productionIssueSeverities.indexOf(right.severity)
      return severityDifference
        || compareTimestamps(left.dueAt, right.dueAt)
        || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    })
    .map((issue) => {
      const openingEvent = current.events.find((event) => event.kind === 'issue_opened' && event.subjectId === issue.id)
      if (!openingEvent) throw new Error(`Priority problem ${issue.id} has no immutable opening evidence.`)
      return {
        id: issue.id,
        severity: issue.severity,
        area: issue.area,
        summary: issue.summary,
        openedAt: openingEvent.createdAt,
        owner: issue.owner,
        dueAt: issue.dueAt,
        containment: issue.containment,
        actionId: openingEvent.actionId,
        openedBy: openingEvent.actor,
        evidenceReference: openingEvent.evidenceReference,
      }
    })
  const activeMaintenance = deriveProductionMaintenanceRecords(current.machines, current.events)
    .filter((record) => !record.completion)
    .map((record) => ({
      startActionId: record.startActionId,
      machineId: record.machineId,
      machineName: record.machineName,
      owner: record.owner,
      startedAt: record.startedAt,
      startedBy: record.startedBy,
      scope: record.scope,
      startEvidenceReference: record.startEvidenceReference,
    }))
  const activeDowntime = deriveProductionDowntimeIntervals(current.machines, current.events)
    .filter((interval) => !interval.end)
  const machineObservations = current.machines.map((machine) => {
    const observationEvent = current.events.find((event) => event.kind === 'machine_state_changed' && event.subjectId === machine.id)
    return {
      id: machine.id,
      name: machine.name,
      state: machine.state,
      observation: observationEvent ? {
        actionId: observationEvent.actionId,
        observedAt: observationEvent.createdAt,
        observedBy: observationEvent.actor,
        reason: observationEvent.reason,
        evidenceReference: observationEvent.evidenceReference,
      } : null,
    }
  })
  return {
    shiftRef,
    plantOrderScope,
    sourceRevision: current.revision,
    sourceCanonical: productionCanonical(current),
    shiftOutput: productionShiftOutput(current, shiftRef),
    shiftEntries,
    materialEntries,
    materialTotals,
    shortCloses,
    controlledOrders,
    unfinishedJobs,
    activeHolds,
    priorityProblems,
    openQualityIssues,
    activeDowntime,
    activeMaintenance,
    machineObservations,
  }
}

function handoffLine(value: string) {
  return value.replace(/\s+/g, ' ')
}

export function formatProductionShiftHandoff(handoff: ProductionShiftHandoff) {
  const lines = [
    `Plant shift handoff — ${handoffLine(handoff.shiftRef)}`,
    `Source revision: ${handoff.sourceRevision}`,
    `Recorded shift output: ${handoff.shiftOutput.goodUnits} good · ${handoff.shiftOutput.scrapUnits} scrap · ${handoff.shiftOutput.entryCount} entries`,
    '',
    `Shift entries (${handoff.shiftEntries.length})`,
  ]
  if (!handoff.shiftEntries.length) lines.push('- None')
  for (const entry of handoff.shiftEntries) {
    lines.push(`- ${entry.quantity} ${entry.outputKind} · ${handoffLine(entry.jobId)} · ${handoffLine(entry.product)} · recorded ${entry.recordedAt} by ${handoffLine(entry.recordedBy)} · ${handoffLine(entry.reason)} · evidence ${handoffLine(entry.evidenceReference)} · action ${handoffLine(entry.actionId)}`)
  }
  lines.push('', `Material totals (${handoff.materialTotals.length})`)
  if (!handoff.materialTotals.length) lines.push('- None')
  for (const total of handoff.materialTotals) {
    lines.push(`- ${materialQuantityText(total.quantity)} ${total.materialUnit} ${handoffLine(total.materialRef)} · ${total.entryCount} ${total.entryCount === 1 ? 'entry' : 'entries'}`)
  }
  lines.push('', `Material use (${handoff.materialEntries.length})`)
  if (!handoff.materialEntries.length) lines.push('- None')
  for (const entry of handoff.materialEntries) {
    lines.push(`- ${materialQuantityText(entry.quantity)} ${entry.materialUnit} ${handoffLine(entry.materialRef)}${entry.materialLot ? ` · lot ${handoffLine(entry.materialLot)}` : ''} · ${handoffLine(entry.jobId)} · ${handoffLine(entry.product)} · recorded ${entry.recordedAt} by ${handoffLine(entry.recordedBy)} · ${handoffLine(entry.reason)} · evidence ${handoffLine(entry.evidenceReference)} · action ${handoffLine(entry.actionId)}`)
  }
  lines.push('', `Closed short (${handoff.shortCloses.length})`)
  if (!handoff.shortCloses.length) lines.push('- None')
  for (const entry of handoff.shortCloses) {
    lines.push(`- ${handoffLine(entry.jobId)} · ${handoffLine(entry.product)} · ${entry.goodUnits} good · ${entry.scrapUnits} scrap · ${entry.remainingUnits} not produced · closed ${entry.recordedAt} by ${handoffLine(entry.recordedBy)} · ${handoffLine(entry.reason)} · evidence ${handoffLine(entry.evidenceReference)} · action ${handoffLine(entry.actionId)}`)
  }
  lines.push('', `Controlled orders (${handoff.controlledOrders.length})`)
  if (!handoff.controlledOrders.length) lines.push('- None touched by this shift')
  for (const order of handoff.controlledOrders) {
    const owner = order.owner ? `owner ${handoffLine(order.owner)}` : 'owner missing'
    const due = order.dueAt ? `due ${order.dueAt}` : 'due time missing'
    lines.push(`- ${handoffLine(order.jobId)} | ${handoffLine(order.product)} | ${order.disposition} | ${order.status} | binding ${order.bindingCurrent ? 'current' : 'stale'} | ${owner} | ${due} | plan ${handoffLine(order.planId)} | digest ${order.planDigest}`)
    lines.push(`  Operations ${order.completedOperationCount}/${order.operationCount} | output ${order.outputUnits}/${order.targetUnits} | accepted ${order.acceptedUnits} | genealogy ${order.genealogyLinkCount}`)
    if (order.nextOperation) lines.push(`  Next ${handoffLine(order.nextOperation.operationId)} | ${handoffLine(order.nextOperation.name)} | ${order.nextOperation.status} | ${order.nextOperation.remainingUnits} remaining`)
    if (order.inspection) lines.push(`  Inspection ${handoffLine(order.inspection.inspectionId)} | ${order.inspection.result} | ${order.inspection.acceptedUnits} accepted | ${order.inspection.rejectedUnits} rejected | evidence ${handoffLine(order.inspection.evidenceReference)} | action ${handoffLine(order.inspection.actionId)}`)
    if (order.batchRelease) lines.push(`  Release ${handoffLine(order.batchRelease.releaseId)} | ${order.batchRelease.releasedAt} by ${handoffLine(order.batchRelease.releasedBy)} | evidence ${handoffLine(order.batchRelease.evidenceReference)} | action ${handoffLine(order.batchRelease.actionId)}`)
    for (const exception of order.exceptions) lines.push(`  Exception: ${handoffLine(exception)}`)
    for (const blocker of order.blockingReasons) lines.push(`  BLOCKED: ${handoffLine(blocker)}`)
  }
  lines.push(
    '',
    `Unfinished jobs (${handoff.unfinishedJobs.length})`,
  )
  if (!handoff.unfinishedJobs.length) lines.push('- None')
  for (const job of handoff.unfinishedJobs) {
    const schedule = job.priority && job.dueAt ? ` · ${job.priority.toUpperCase()} · due ${job.dueAt}` : ' · schedule not recorded'
    const owner = job.owner ? ` · owner ${handoffLine(job.owner)}` : ' · owner not recorded'
    lines.push(`- ${handoffLine(job.id)} · ${handoffLine(job.product)} · ${handoffLine(job.line)}${owner} · ${job.remainingUnits} remaining · ${job.goodUnits} good · ${job.scrapUnits} scrap${schedule}${job.qualityHold ? ' · QUALITY HOLD' : ''}`)
  }
  lines.push('', `Active quality holds (${handoff.activeHolds.length})`)
  if (!handoff.activeHolds.length) lines.push('- None')
  for (const heldJob of handoff.activeHolds) {
    lines.push(`- ${handoffLine(heldJob.id)} · ${handoffLine(heldJob.product)} · ${handoffLine(heldJob.line)} · target ${heldJob.target} · ${heldJob.goodUnits} good · ${heldJob.scrapUnits} scrap · ${heldJob.remainingUnits} remaining · held ${heldJob.qualityHold.heldAt} by ${handoffLine(heldJob.qualityHold.heldBy)} · ${handoffLine(heldJob.qualityHold.reason)} · evidence ${handoffLine(heldJob.qualityHold.evidenceReference)} · action ${handoffLine(heldJob.qualityHold.actionId)}`)
  }
  lines.push('', `Open quality problems (${handoff.openQualityIssues.length})`)
  if (!handoff.openQualityIssues.length) lines.push('- None')
  for (const problem of handoff.openQualityIssues) {
    lines.push(`- ${problem.severity.toUpperCase()} | ${handoffLine(problem.id)} | ${handoffLine(problem.area)} | ${handoffLine(problem.summary)} | owner ${handoffLine(problem.owner)} | due ${problem.dueAt} | next ${handoffLine(problem.containment)}`)
  }
  lines.push('', `Critical/high problems (${handoff.priorityProblems.length})`)
  if (!handoff.priorityProblems.length) lines.push('- None')
  for (const problem of handoff.priorityProblems) {
    lines.push(`- ${problem.severity.toUpperCase()} · ${handoffLine(problem.id)} · ${handoffLine(problem.area)} · ${handoffLine(problem.summary)} · opened ${problem.openedAt} by ${handoffLine(problem.openedBy)} · owner ${handoffLine(problem.owner)} · due ${problem.dueAt} · next ${handoffLine(problem.containment)} · evidence ${handoffLine(problem.evidenceReference)} · action ${handoffLine(problem.actionId)}`)
  }
  lines.push('', `Active downtime (${handoff.activeDowntime.length})`)
  if (!handoff.activeDowntime.length) lines.push('- None')
  for (const interval of handoff.activeDowntime) {
    lines.push(`- ${handoffLine(interval.machineId)} | ${handoffLine(interval.machineName)} | started ${interval.startedAt} by ${handoffLine(interval.startedBy)} | ${handoffLine(interval.startReason)} | evidence ${handoffLine(interval.startEvidenceReference)} | action ${handoffLine(interval.startActionId)}`)
  }
  lines.push('', `Active maintenance (${handoff.activeMaintenance.length})`)
  if (!handoff.activeMaintenance.length) lines.push('- None')
  for (const record of handoff.activeMaintenance) {
    lines.push(`- ${handoffLine(record.machineId)} · ${handoffLine(record.machineName)} · owner ${handoffLine(record.owner)} · started ${record.startedAt} by ${handoffLine(record.startedBy)} · scope ${handoffLine(record.scope)} · evidence ${handoffLine(record.startEvidenceReference)} · action ${handoffLine(record.startActionId)}`)
  }
  lines.push('', `Machine observations (${handoff.machineObservations.length})`)
  if (!handoff.machineObservations.length) lines.push('- None')
  for (const machine of handoff.machineObservations) {
    if (!machine.observation) {
      lines.push(`- ${handoffLine(machine.id)} · ${handoffLine(machine.name)} · recorded ${machine.state} · no attributed observation recorded`)
      continue
    }
    lines.push(`- ${handoffLine(machine.id)} · ${handoffLine(machine.name)} · recorded ${machine.state} · observed ${machine.observation.observedAt} by ${handoffLine(machine.observation.observedBy)} · ${handoffLine(machine.observation.reason)} · evidence ${handoffLine(machine.observation.evidenceReference)} · action ${handoffLine(machine.observation.actionId)}`)
  }
  return lines.join('\n')
}

export function productionShiftCloseSourceDigest(handoff: ProductionShiftHandoff) {
  return `sha256:${sha256Hex(handoff.sourceCanonical)}`
}

function shiftCloseSummary(
  shiftRef: string,
  goodUnits: number,
  scrapUnits: number,
  outputEntryCount: number,
  materialEntryCount: number,
) {
  return `Closed shift ${shiftRef} with ${goodUnits} good, ${scrapUnits} scrap, ${outputEntryCount} output entries, ${materialEntryCount} material entries`
}

export function currentProductionShiftCloseEvidence(state: ProductionState, shiftRef?: string, plantOrderScope = 'plant:local-sample') {
  const current = validateProductionState(state)
  const event = current.events[0]
  const closeShiftRef = event?.shiftRef
  if (!event
    || event.kind !== 'shift_closed'
    || typeof closeShiftRef !== 'string'
    || event.sourceRevision !== current.revision - 1
    || (shiftRef !== undefined && closeShiftRef !== shiftRef)) return null
  const sourceState = validateProductionState({
    ...current,
    revision: current.revision - 1,
    events: current.events.slice(1),
  })
  if (`sha256:${sha256Hex(productionCanonical(sourceState))}` !== event.sourceDigest) return null
  const handoff = buildProductionShiftHandoff(sourceState, closeShiftRef, plantOrderScope)
  if (!handoff
    || handoff.sourceRevision !== event.sourceRevision
    || handoff.shiftOutput.goodUnits !== event.goodUnits
    || handoff.shiftOutput.scrapUnits !== event.scrapUnits
    || handoff.shiftOutput.entryCount !== event.outputEntryCount
    || handoff.materialEntries.length !== event.materialEntryCount
    || handoff.shiftOutput.goodUnits < 1
    || handoff.shiftOutput.entryCount < 1
    || handoff.materialEntries.length < 1
    || handoff.activeHolds.length > 0
    || handoff.openQualityIssues.length > 0
    || handoff.priorityProblems.length > 0
    || handoff.activeDowntime.length > 0
    || handoff.activeMaintenance.length > 0
    || handoff.controlledOrders.some((order) => order.blockingReasons.length > 0)) return null
  return { event, handoff }
}

export function currentProductionShiftClose(state: ProductionState, shiftRef?: string, plantOrderScope = 'plant:local-sample') {
  return currentProductionShiftCloseEvidence(state, shiftRef, plantOrderScope)?.event ?? null
}

export function recordProductionShiftClose(
  state: ProductionState,
  handoff: ProductionShiftHandoff,
  proof: ProductionActionProof,
) {
  if (!validProof(proof) || !handoff || !validCanonicalText(handoff.shiftRef, 80) || !validCanonicalText(handoff.plantOrderScope, 160)) return null
  const current = validateProductionState(state)
  const sourceDigest = productionShiftCloseSourceDigest(handoff)
  const goodUnits = handoff.shiftOutput.goodUnits
  const scrapUnits = handoff.shiftOutput.scrapUnits
  const outputEntryCount = handoff.shiftOutput.entryCount
  const materialEntryCount = handoff.materialEntries.length
  const existing = current.events.find((event) => event.actionId === proof.actionId)
  if (existing) return existing.kind === 'shift_closed'
    && existing.subjectId === handoff.shiftRef
    && existing.shiftRef === handoff.shiftRef
    && existing.sourceRevision === handoff.sourceRevision
    && existing.sourceDigest === sourceDigest
    && existing.goodUnits === goodUnits
    && existing.scrapUnits === scrapUnits
    && existing.outputEntryCount === outputEntryCount
    && existing.materialEntryCount === materialEntryCount
    && sameProof(existing, proof) ? current : null
  const expectedHandoff = buildProductionShiftHandoff(current, handoff.shiftRef, handoff.plantOrderScope)
  if (!expectedHandoff || JSON.stringify(expectedHandoff) !== JSON.stringify(handoff)) return null
  const latestEvent = current.events[0]
  if (actionIdIsUsed(current, proof.actionId)
    || current.revision >= Number.MAX_SAFE_INTEGER
    || currentProductionShiftClose(current, undefined, handoff.plantOrderScope) !== null
    || (latestEvent && timestampBefore(proof.capturedAt, latestEvent.createdAt))
    || (current.orderExecution?.commands.length
      && timestampBefore(proof.capturedAt, current.orderExecution.commands[current.orderExecution.commands.length - 1].payload.proof.capturedAt))
    || handoff.sourceRevision !== current.revision
    || handoff.sourceCanonical !== productionCanonical(current)
    || goodUnits < 1
    || outputEntryCount < 1
    || materialEntryCount < 1
    || handoff.activeHolds.length > 0
    || handoff.openQualityIssues.length > 0
    || handoff.priorityProblems.length > 0
    || handoff.activeDowntime.length > 0
    || handoff.activeMaintenance.length > 0
    || handoff.controlledOrders.some((order) => order.blockingReasons.length > 0)) return null
  const event = eventFor(proof, {
    kind: 'shift_closed',
    subjectId: handoff.shiftRef,
    summary: shiftCloseSummary(handoff.shiftRef, goodUnits, scrapUnits, outputEntryCount, materialEntryCount),
    shiftRef: handoff.shiftRef,
    sourceRevision: handoff.sourceRevision,
    sourceDigest,
    goodUnits,
    scrapUnits,
    outputEntryCount,
    materialEntryCount,
  })
  return validateProductionState({
    ...current,
    revision: current.revision + 1,
    events: [event, ...current.events],
  })
}

function compareProductionEvidence(left: { createdAt: string; actionId: string }, right: { createdAt: string; actionId: string }) {
  return compareTimestamps(left.createdAt, right.createdAt)
    || (left.actionId < right.actionId ? -1 : left.actionId > right.actionId ? 1 : 0)
}

export function buildProductionBatchGenealogy(state: ProductionState, jobId: string) {
  if (!validCanonicalText(jobId, 80)) return null
  const current = validateProductionState(state)
  const job = current.jobs.find((candidate) => candidate.id === jobId)
  if (!job) return null
  const creationEvent = current.events.find((event) => event.kind === 'job_created' && event.subjectId === job.id)
  const materialEntries = current.events
    .filter((event) => event.kind === 'material_consumed' && event.subjectId === job.id)
    .map((event) => ({
      actionId: event.actionId,
      createdAt: event.createdAt,
      actor: event.actor,
      reason: event.reason,
      evidenceReference: event.evidenceReference,
      shiftRef: event.shiftRef ?? '',
      materialRef: event.materialRef ?? '',
      materialLot: event.materialLot ?? null,
      materialUnit: event.materialUnit as ProductionMaterialUnit,
      quantity: event.quantity ?? 0,
    }))
    .sort(compareProductionEvidence)
  const outputEntries = current.events
    .filter((event) => event.kind === 'output_recorded' && event.subjectId === job.id)
    .map((event) => ({
      actionId: event.actionId,
      createdAt: event.createdAt,
      actor: event.actor,
      reason: event.reason,
      evidenceReference: event.evidenceReference,
      shiftRef: event.shiftRef ?? '',
      outputKind: event.outputKind ?? 'good',
      quantity: event.quantity ?? 0,
    }))
    .sort(compareProductionEvidence)
  const qualityEvents = current.events
    .filter((event) => (event.kind === 'quality_hold_placed' || event.kind === 'quality_hold_released') && event.subjectId === job.id)
    .map((event) => ({
      actionId: event.actionId,
      createdAt: event.createdAt,
      actor: event.actor,
      reason: event.reason,
      evidenceReference: event.evidenceReference,
      action: event.kind === 'quality_hold_placed' ? 'hold_placed' as const : 'hold_released' as const,
    }))
    .sort(compareProductionEvidence)
  const retainedOrderExecution = productionOrderPortfolioEntries(current).find((entry) => entry.jobId === job.id)?.execution
  const controlled = retainedOrderExecution ? projectPlantOrder(retainedOrderExecution) : null
  const controlledExecution = controlled?.plan?.job.jobId === job.id ? {
    planId: controlled.plan.planId,
    planDigest: controlled.plan.packageDigest,
    status: controlled.status,
    outputBatchId: controlled.plan.job.outputBatchId,
    genealogy: controlled.genealogy.map((entry) => ({ ...entry })),
    outputEntries: controlled.outputEntries.map((entry) => ({ id: entry.id, quantity: entry.quantity, proof: { ...entry.proof } })),
    inspections: controlled.inspections.map((entry) => ({
      id: entry.id,
      inspectedQuantity: entry.inspectedQuantity,
      acceptedQuantity: entry.acceptedQuantity,
      rejectedQuantity: entry.rejectedQuantity,
      result: entry.result,
      proof: { ...entry.proof },
    })),
    qualityHold: controlled.qualityHold ? { ...controlled.qualityHold, proof: { ...controlled.qualityHold.proof } } : null,
    batchRelease: controlled.batchRelease ? { id: controlled.batchRelease.id, inspectionId: controlled.batchRelease.inspectionId, proof: { ...controlled.batchRelease.proof } } : null,
  } : null
  const payload = {
    schema: PRODUCTION_BATCH_GENEALOGY_SCHEMA,
    sourceRevision: current.revision,
    sourceStateDigest: plantOrderEvidenceDigest(current),
    job: {
      id: job.id,
      line: job.line,
      product: job.product,
      targetUnits: job.target,
      goodUnits: job.output,
      scrapUnits: job.scrap ?? 0,
      remainingUnits: Math.max(0, job.target - job.output - (job.scrap ?? 0)),
      owner: job.owner ?? null,
      priority: job.priority ?? null,
      dueAt: job.dueAt ?? null,
      status: job.closure ? 'closed_short' as const : job.qualityHold ? 'quality_hold' as const : job.output + (job.scrap ?? 0) >= job.target ? 'complete' as const : 'active' as const,
    },
    shopDemandSource: job.shopDemandSource ? validateProductionShopDemandSource(job.shopDemandSource, `job ${job.id}.shopDemandSource`) : null,
    creationEvidence: creationEvent ? {
      source: 'job_created_event' as const,
      actionId: creationEvent.actionId,
      createdAt: creationEvent.createdAt,
      actor: creationEvent.actor,
      reason: creationEvent.reason,
      evidenceReference: creationEvent.evidenceReference,
    } : current.openingPlan?.jobIds.includes(job.id) ? {
      source: 'opening_plan' as const,
      packageDigest: current.openingPlan.packageDigest,
      confirmedAt: current.openingPlan.confirmedAt,
    } : { source: 'legacy_record' as const },
    materialEntries,
    outputEntries,
    qualityEvents,
    closure: job.closure ? { ...job.closure } : null,
    controlledExecution,
    evidenceCoverage: {
      shopDemandLinked: Boolean(job.shopDemandSource),
      materialEntryCount: materialEntries.length,
      materialLotEntryCount: materialEntries.filter((entry) => entry.materialLot).length,
      outputEntryCount: outputEntries.length,
      qualityEventCount: qualityEvents.length,
      controlledExecutionLinked: Boolean(controlledExecution),
    },
    controls: {
      issuesInventory: false,
      changesEquipment: false,
      postsCosting: false,
      issuesCertificate: false,
      performsExternalAction: false,
    },
  }
  return { ...payload, digest: plantOrderEvidenceDigest(payload) }
}

export type ProductionBatchGenealogy = NonNullable<ReturnType<typeof buildProductionBatchGenealogy>>

export function formatProductionBatchGenealogy(report: ProductionBatchGenealogy) {
  const { digest, ...payload } = report
  if (digest !== plantOrderEvidenceDigest(payload)) throw new Error('Production batch genealogy digest does not match its evidence.')
  return `${JSON.stringify(report, null, 2)}\n`
}

function recallIdentity(value: unknown) {
  if (!validCanonicalText(value, 120)) return null
  return String(value).toUpperCase()
}

function uniqueRecallIdentities(values: unknown[]) {
  return [...new Set(values.map(recallIdentity).filter((value): value is string => Boolean(value)))].sort()
}

export function buildProductionRecallTrace(state: ProductionState, lotOrBatchId: string) {
  const query = recallIdentity(lotOrBatchId)
  if (!query) return null
  const current = validateProductionState(state)
  const reports = current.jobs.map((job) => buildProductionBatchGenealogy(current, job.id)).filter((report): report is ProductionBatchGenealogy => Boolean(report))
  const records = reports.map((report) => {
    const inputLotIds = uniqueRecallIdentities([
      ...report.materialEntries.map((entry) => entry.materialLot),
      ...(report.controlledExecution?.genealogy.map((entry) => entry.inputLotId) ?? []),
    ])
    const outputBatchId = recallIdentity(report.controlledExecution?.outputBatchId)
    const latestInspection = report.controlledExecution?.inspections[report.controlledExecution.inspections.length - 1]
    return {
      report,
      inputLotIds,
      outputBatchId,
      link: outputBatchId ? {
        jobId: report.job.id,
        product: report.job.product,
        line: report.job.line,
        jobStatus: report.job.status,
        inputLotIds,
        outputBatchId,
        acceptedUnits: latestInspection?.acceptedQuantity ?? report.job.goodUnits,
        qualityStatus: report.controlledExecution?.batchRelease
          ? 'released' as const
          : report.controlledExecution?.qualityHold
            ? 'held' as const
            : 'not_released' as const,
        releaseActionId: report.controlledExecution?.batchRelease?.id ?? null,
        linkedShopDemandOrderIds: [...(report.shopDemandSource?.snapshot.sourceOrderIds ?? [])].sort(),
        evidenceDigest: report.digest,
        complete: inputLotIds.length > 0,
      } : null,
    }
  })
  const matchedAsInputLot = records.some((record) => record.inputLotIds.includes(query))
  const matchedAsOutputBatch = records.some((record) => record.outputBatchId === query)
  if (!matchedAsInputLot && !matchedAsOutputBatch) return null

  const links = records.flatMap((record) => record.link ? [record.link] : [])
  const downstream: Array<(typeof links)[number] & { depth: number }> = []
  const downstreamBatches = new Set([query])
  const downstreamSeen = new Set<string>()
  let downstreamFrontier = new Set([query])
  for (let depth = 1; downstreamFrontier.size && depth <= links.length; depth += 1) {
    const next = new Set<string>()
    for (const link of links) {
      const key = `${link.jobId}:${link.outputBatchId}`
      if (downstreamSeen.has(key) || !link.inputLotIds.some((inputLotId) => downstreamFrontier.has(inputLotId))) continue
      downstreamSeen.add(key)
      downstream.push({ ...link, depth })
      if (!downstreamBatches.has(link.outputBatchId)) {
        downstreamBatches.add(link.outputBatchId)
        next.add(link.outputBatchId)
      }
    }
    downstreamFrontier = next
  }

  const upstream: Array<(typeof links)[number] & { depth: number }> = []
  const upstreamBatches = new Set([query])
  const upstreamSeen = new Set<string>()
  let upstreamFrontier = new Set([query])
  for (let depth = 1; upstreamFrontier.size && depth <= links.length; depth += 1) {
    const next = new Set<string>()
    for (const link of links) {
      const key = `${link.jobId}:${link.outputBatchId}`
      if (upstreamSeen.has(key) || !upstreamFrontier.has(link.outputBatchId)) continue
      upstreamSeen.add(key)
      upstream.push({ ...link, depth })
      for (const inputLotId of link.inputLotIds) {
        if (upstreamBatches.has(inputLotId)) continue
        upstreamBatches.add(inputLotId)
        next.add(inputLotId)
      }
    }
    upstreamFrontier = next
  }

  const directJobIds = records
    .filter((record) => record.outputBatchId === query || record.inputLotIds.includes(query))
    .map((record) => record.report.job.id)
    .sort()
  const unresolvedJobIds = records
    .filter((record) => !record.outputBatchId && record.inputLotIds.some((inputLotId) => downstreamBatches.has(inputLotId)))
    .map((record) => record.report.job.id)
    .sort()
  const incompleteJobIds = [...new Set([
    ...unresolvedJobIds,
    ...downstream.filter((link) => !link.complete).map((link) => link.jobId),
    ...upstream.filter((link) => !link.complete).map((link) => link.jobId),
  ])].sort()
  const linkedShopDemandOrderIds = [...new Set([...downstream, ...upstream].flatMap((link) => link.linkedShopDemandOrderIds))].sort()
  const payload = {
    schema: PRODUCTION_RECALL_TRACE_SCHEMA,
    query,
    sourceRevision: current.revision,
    sourceStateDigest: plantOrderEvidenceDigest(current),
    match: {
      matchedAsInputLot,
      matchedAsOutputBatch,
      directJobIds,
    },
    downstream: {
      links: downstream.sort((left, right) => left.depth - right.depth || left.jobId.localeCompare(right.jobId)),
      outputBatchIds: [...downstreamBatches].filter((batchId) => batchId !== query).sort(),
    },
    upstream: {
      links: upstream.sort((left, right) => left.depth - right.depth || left.jobId.localeCompare(right.jobId)),
      inputLotIds: [...upstreamBatches].filter((batchId) => batchId !== query).sort(),
    },
    linkedShopDemandOrderIds,
    completeness: {
      status: incompleteJobIds.length ? 'partial' as const : 'complete' as const,
      incompleteJobIds,
      reason: incompleteJobIds.length
        ? 'Some retained material use has no exact output-batch link; review those jobs before a recall decision.'
        : 'Every retained matching path has an exact input-lot to output-batch link.',
    },
    controls: {
      recallDecisionRecorded: false,
      inventoryBlocked: false,
      customerContacted: false,
      customerDataIncluded: false,
      externalActionPerformed: false,
    },
  }
  return { ...payload, digest: plantOrderEvidenceDigest(payload) }
}

export type ProductionRecallTrace = NonNullable<ReturnType<typeof buildProductionRecallTrace>>

export function formatProductionRecallTrace(report: ProductionRecallTrace) {
  const { digest, ...payload } = report
  if (digest !== plantOrderEvidenceDigest(payload)) throw new Error('Production recall trace digest does not match its evidence.')
  return `${JSON.stringify(report, null, 2)}\n`
}

/**
 * A read-only Certificate of Conformance for one closed Plant job. It is a pure
 * projection of buildProductionBatchGenealogy's own evidence — no new fact is
 * derived or fabricated here.
 *
 * Eligibility (returns null otherwise):
 * - The job must carry closure evidence (`genealogy.job.status === 'closed_short'`):
 *   this is the only Plant job lifecycle event that records who closed the job,
 *   when, and why. A job that merely reached its target without an explicit,
 *   evidenced close (`status === 'complete'`) has no such accountable record to
 *   certify against, so it is not eligible.
 * - The job must carry no unresolved controlled-batch quality hold. A job-level
 *   quality hold (`job.qualityHold`) can never coexist with `job.closure` — the
 *   closure action itself is blocked while one is active — but a job bound to a
 *   controlled execution plan (BOM/routing/quality) carries its own, separate
 *   hold/release state. If that controlled plan still shows an unreleased
 *   quality hold, a certificate would misrepresent the batch as clean, so it is
 *   blocked.
 */
export function buildProductionCertificateOfConformance(state: ProductionState, jobId: string) {
  const genealogy = buildProductionBatchGenealogy(state, jobId)
  if (!genealogy) return null
  if (genealogy.job.status !== 'closed_short' || !genealogy.closure) return null
  const controlledExecution = genealogy.controlledExecution
  const qualityReleaseStatus = controlledExecution?.batchRelease
    ? 'released' as const
    : controlledExecution?.qualityHold
      ? 'held' as const
      : controlledExecution
        ? 'not_released' as const
        : 'not_tracked' as const
  if (qualityReleaseStatus === 'held') return null
  const materialLots = [...new Set(genealogy.materialEntries.map((entry) => entry.materialLot).filter((lot): lot is string => Boolean(lot)))].sort()
  const payload = {
    schema: PRODUCTION_CERTIFICATE_OF_CONFORMANCE_SCHEMA,
    sourceRevision: genealogy.sourceRevision,
    sourceStateDigest: genealogy.sourceStateDigest,
    genealogyDigest: genealogy.digest,
    job: { ...genealogy.job },
    closure: { ...genealogy.closure },
    materialLots,
    materialEntryCount: genealogy.materialEntries.length,
    materialLotEntryCount: genealogy.evidenceCoverage.materialLotEntryCount,
    outputEntryCount: genealogy.outputEntries.length,
    qualityEvents: genealogy.qualityEvents.map((event) => ({ ...event })),
    qualityReleaseStatus,
    controlledExecution: controlledExecution ? {
      planId: controlledExecution.planId,
      outputBatchId: controlledExecution.outputBatchId,
      batchRelease: controlledExecution.batchRelease ? {
        id: controlledExecution.batchRelease.id,
        inspectionId: controlledExecution.batchRelease.inspectionId,
        proof: { ...controlledExecution.batchRelease.proof },
      } : null,
    } : null,
    controls: {
      issuesInventory: false,
      changesEquipment: false,
      postsCosting: false,
      confirmsRegulatoryCompliance: false,
      performsExternalAction: false,
    },
  }
  return { ...payload, digest: plantOrderEvidenceDigest(payload) }
}

export type ProductionCertificateOfConformance = NonNullable<ReturnType<typeof buildProductionCertificateOfConformance>>

export function formatProductionCertificateOfConformance(certificate: ProductionCertificateOfConformance) {
  const { digest, ...payload } = certificate
  if (digest !== plantOrderEvidenceDigest(payload)) throw new Error('Production certificate of conformance digest does not match its evidence.')
  return `${JSON.stringify(certificate, null, 2)}\n`
}

export function productionCertificateOfConformanceText(certificate: ProductionCertificateOfConformance) {
  const lines = [
    'SUPERMEGA CERTIFICATE OF CONFORMANCE',
    'Read-only production record. Not a legal, regulatory, or contractual certification beyond the retained evidence listed below.',
    '',
    `Job / batch: ${handoffLine(certificate.job.id)}`,
    `Product: ${handoffLine(certificate.job.product)}`,
    `Line: ${handoffLine(certificate.job.line)}`,
    `Owner: ${certificate.job.owner ? handoffLine(certificate.job.owner) : 'Not recorded'}`,
    '',
    'OUTPUT',
    `Good units: ${certificate.job.goodUnits}`,
    `Scrap units: ${certificate.job.scrapUnits}`,
    `Target units: ${certificate.job.targetUnits}`,
    `Units not produced at close: ${certificate.closure.remainingUnits}`,
    '',
    `Quality release status: ${certificate.qualityReleaseStatus === 'released' ? 'Released' : certificate.qualityReleaseStatus === 'not_released' ? 'Controlled batch recorded, not formally released' : 'No controlled batch execution bound to this job'}`,
    ...(certificate.controlledExecution?.batchRelease ? [
      `Batch release: ${certificate.controlledExecution.batchRelease.proof.capturedAt} by ${handoffLine(certificate.controlledExecution.batchRelease.proof.actor)} · evidence ${handoffLine(certificate.controlledExecution.batchRelease.proof.evidenceReference)} · action ${handoffLine(certificate.controlledExecution.batchRelease.proof.actionId)}`,
    ] : []),
    ...(certificate.controlledExecution?.outputBatchId ? [`Output batch ID: ${handoffLine(certificate.controlledExecution.outputBatchId)}`] : []),
    '',
    `Material lot traceability (${certificate.materialLots.length} lot${certificate.materialLots.length === 1 ? '' : 's'} · ${certificate.materialEntryCount} recorded ${certificate.materialEntryCount === 1 ? 'entry' : 'entries'})`,
  ]
  if (!certificate.materialLots.length) lines.push('- No material lot was recorded for this job.')
  for (const lot of certificate.materialLots) lines.push(`- ${lot}`)
  lines.push('', `Quality hold history during this job (${certificate.qualityEvents.length} event${certificate.qualityEvents.length === 1 ? '' : 's'})`)
  if (!certificate.qualityEvents.length) lines.push('- No quality hold was placed on this job.')
  for (const event of certificate.qualityEvents) {
    lines.push(`- ${event.action === 'hold_placed' ? 'Held' : 'Released'} ${event.createdAt} by ${handoffLine(event.actor)} · ${handoffLine(event.reason)} · evidence ${handoffLine(event.evidenceReference)} · action ${handoffLine(event.actionId)}`)
  }
  lines.push(
    '',
    'CLOSURE',
    `Closed: ${certificate.closure.closedAt} by ${handoffLine(certificate.closure.closedBy)}`,
    `Shift: ${handoffLine(certificate.closure.shiftRef)}`,
    `Reason: ${handoffLine(certificate.closure.reason)}`,
    `Evidence: ${handoffLine(certificate.closure.evidenceReference)}`,
    `Closure action: ${handoffLine(certificate.closure.actionId)}`,
    '',
    `Source Plant record revision: ${certificate.sourceRevision}`,
    `Batch genealogy evidence digest: ${certificate.genealogyDigest}`,
    `Document digest: ${certificate.digest}`,
    '',
    'This certificate reflects exactly the retained Plant record above. It issues no inventory, changes no equipment, posts no cost, and sends no message to any customer or external system.',
  )
  return lines.join('\n')
}

export function registerProductionJob(state: ProductionState, job: ProductionJob, proof: ProductionActionProof) {
  if (!isRecord(job)) return null
  const jobPriority = job.priority
  const jobDueAt = job.dueAt
  const jobOwner = job.owner
  let shopDemandSource: ProductionShopDemandSource | undefined
  try {
    if (job.shopDemandSource !== undefined) shopDemandSource = validateProductionShopDemandSource(job.shopDemandSource, 'job.shopDemandSource')
  } catch {
    return null
  }
  if (!validProof(proof)
    || !validCanonicalText(job.id, 80)
    || !validCanonicalText(job.line, 120)
    || !validCanonicalText(job.product)
    || !Number.isSafeInteger(job.target)
    || job.target < 1
    || job.output !== 0
    || !jobPriority
    || !productionJobPriorities.includes(jobPriority)
    || !jobDueAt
    || !validTimestamp(jobDueAt)
    || timestampAtOrBefore(jobDueAt, proof.capturedAt)
    || !jobOwner
    || !validCanonicalText(jobOwner, 120)
    || job.scrap !== undefined
    || job.qualityHold !== undefined
    || job.closure !== undefined
    || (shopDemandSource !== undefined && (
      proof.evidenceReference !== shopDemandSource.evidenceReference
      || shopDemandSource.snapshot.recommendedBatchUnits !== job.target
      || (shopDemandSource.snapshot.productName.toLocaleLowerCase('en-US') !== job.product.toLocaleLowerCase('en-US')
        && shopDemandSource.snapshot.sku.toLocaleLowerCase('en-US') !== job.product.toLocaleLowerCase('en-US'))
    ))) return null
  const existing = state.events.find((event) => event.actionId === proof.actionId)
  if (existing) {
    const storedJob = state.jobs.find((candidate) => candidate.id === job.id)
    return existing.kind === 'job_created'
      && existing.subjectId === job.id
      && sameProof(existing, proof)
      && JSON.stringify(storedJob) === JSON.stringify(job) ? state : null
  }
  if (actionIdIsUsed(state, proof.actionId) || state.jobs.some((candidate) => candidate.id === job.id) || state.revision >= Number.MAX_SAFE_INTEGER) return null
  const event = eventFor(proof, {
    kind: 'job_created',
    subjectId: job.id,
    summary: `Created ${job.product} job for ${job.line}`,
    jobPriority,
    jobDueAt,
    jobOwner,
  })
  return validateProductionState({
    ...state,
    revision: state.revision + 1,
    jobs: [job, ...state.jobs],
    events: [event, ...state.events],
  })
}

export type ProductionJobsImportResult = {
  state: ProductionState
  created: number
  alreadyPresent: number
  replayed: boolean
}

const productionWorkingSampleActionPrefix = 'ACT-DEMO-WORKING-SAMPLE-'

export function installProductionWorkingSampleJobs(stateValue: ProductionState, input: {
  sampleId: string
  sampleName: string
  jobs: ProductionJob[]
  capturedAt: string
  // The seed floor carries a mixer, a press, and a temperature-drift issue. On a
  // sewing line or an assembly cell that is somebody else's factory, so a caller
  // may hand over the equipment and opening issue that belong to its own pack.
  machines?: ProductionMachine[]
  issue?: { area: string; summary: string }
}) {
  let source: ProductionState
  try { source = validateProductionState(stateValue) } catch { return null }
  const sampleId = typeof input?.sampleId === 'string' ? input.sampleId.trim().toLowerCase() : ''
  const sampleName = typeof input?.sampleName === 'string' ? input.sampleName.trim() : ''
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(sampleId)
    || !validCanonicalText(sampleName, 80)
    || !Array.isArray(input?.jobs) || input.jobs.length < 1 || input.jobs.length > 20
    || typeof input.capturedAt !== 'string' || !validTimestamp(input.capturedAt)) return null
  const uniqueJobIds = new Set(input.jobs.map((job) => job.id))
  if (uniqueJobIds.size !== input.jobs.length) return null

  const sampleEvents = source.events.filter((event) => event.actionId.startsWith(productionWorkingSampleActionPrefix))
  if (sampleEvents.some((event) => event.kind !== 'job_created')) return null
  const sampleJobIds = new Set(sampleEvents.map((event) => event.subjectId))
  const requestedPrefix = `${productionWorkingSampleActionPrefix}${sampleId.toUpperCase()}-`
  const compareJobId = (left: ProductionJob, right: ProductionJob) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0
  const currentSampleJobs = source.jobs.filter((job) => sampleJobIds.has(job.id)).sort(compareJobId)
  const requestedJobs = input.jobs.map((job) => ({ ...job })).sort(compareJobId)
  if (sampleJobIds.size === requestedJobs.length
    && sampleEvents.length === requestedJobs.length
    && sampleEvents.every((event) => event.actionId.startsWith(requestedPrefix))
    && JSON.stringify(currentSampleJobs) === JSON.stringify(requestedJobs)) return source

  const seedAnchor = productionSeedAnchor(source)
  if (seedAnchor === null) return null
  const seed = createSeedProduction(seedAnchor)
  const seedWithoutJobs = validateProductionState({ ...seed, jobs: [] })
  // Installing a sample is the only path that writes these, and every other way
  // to touch a machine appends an event this comparison still rejects. So a
  // previously installed pack's floor normalises back to the seed's rather than
  // reading as tampering and refusing the next pack.
  const withSeedFloor = (state: ProductionState) => ({ ...state, machines: seed.machines, issues: seed.issues })
  let base = source
  if (sampleEvents.length || sampleJobIds.size) {
    const baseRevision = source.revision - sampleEvents.length
    if (baseRevision < 0) return null
    try {
      base = validateProductionState({
        ...withSeedFloor(source),
        revision: baseRevision,
        jobs: source.jobs.filter((job) => !sampleJobIds.has(job.id)),
        events: source.events.filter((event) => !event.actionId.startsWith(productionWorkingSampleActionPrefix)),
      })
    } catch {
      return null
    }
    if (JSON.stringify(base) !== JSON.stringify(seed) && JSON.stringify(base) !== JSON.stringify(seedWithoutJobs)) return null
    base = seed
  } else if (JSON.stringify(withSeedFloor(base)) !== JSON.stringify(seed)) {
    return null
  }
  if (requestedJobs.some((job) => base.jobs.some((existing) => existing.id === job.id))) return null

  const requestedMachines = Array.isArray(input.machines) && input.machines.length
    ? input.machines.map((machine) => ({ ...machine }))
    : seed.machines
  const requestedIssues = input.issue
    ? seed.issues.map((issue) => ({ ...issue, area: input.issue!.area, summary: input.issue!.summary }))
    : seed.issues
  let next: ProductionState
  try {
    next = validateProductionState({ ...seedWithoutJobs, machines: requestedMachines, issues: requestedIssues })
  } catch {
    return null
  }
  for (const [index, job] of requestedJobs.entries()) {
    const registered = registerProductionJob(next, job, {
      actionId: `${requestedPrefix}${String(index + 1).padStart(3, '0')}`,
      capturedAt: input.capturedAt,
      actor: WORKING_SAMPLE_SETUP_ACTOR,
      reason: `Seed the ${sampleName} working sample.`,
      evidenceReference: `SETUP-${sampleId.toUpperCase()}-${String(index + 1).padStart(3, '0')}`,
    })
    if (!registered) return null
    next = registered
  }
  return next
}

export function productionWorkingSamplePackId(stateValue: ProductionState) {
  let state: ProductionState
  try { state = validateProductionState(stateValue) } catch { return null }
  const sampleIds = new Set(state.events.flatMap((event) => {
    if (!event.actionId.startsWith(productionWorkingSampleActionPrefix)) return []
    const suffix = event.actionId.slice(productionWorkingSampleActionPrefix.length)
    const match = /^([A-Z][A-Z0-9-]{1,39})-\d{3}$/.exec(suffix)
    return match ? [match[1].toLowerCase()] : []
  }))
  return sampleIds.size === 1 ? [...sampleIds][0] : null
}

export function importProductionJobs(stateValue: ProductionState, input: {
  jobs: ProductionJob[]
  sourceDigest: string
  capturedAt: string
  actor: string
}): ProductionJobsImportResult | null {
  if (!Array.isArray(input?.jobs) || input.jobs.length < 1 || input.jobs.length > 100
    || typeof input.sourceDigest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(input.sourceDigest)
    || typeof input.capturedAt !== 'string' || !validTimestamp(input.capturedAt)
    || typeof input.actor !== 'string' || !validCanonicalText(input.actor, 80)) return null
  const sourceState = validateProductionState(stateValue)
  const uniqueJobIds = new Set(input.jobs.map((job) => job.id))
  if (uniqueJobIds.size !== input.jobs.length) return null
  let state = sourceState
  let created = 0
  let alreadyPresent = 0
  for (const [index, job] of input.jobs.entries()) {
    const existing = state.jobs.find((candidate) => candidate.id === job.id)
    if (existing) {
      if (existing.line !== job.line
        || existing.product !== job.product
        || existing.target !== job.target
        || existing.output !== job.output
        || existing.owner !== job.owner
        || existing.priority !== job.priority
        || existing.dueAt !== job.dueAt
        || existing.scrap !== job.scrap
        || existing.qualityHold !== job.qualityHold
        || existing.closure !== job.closure
        || JSON.stringify(existing.shopDemandSource) !== JSON.stringify(job.shopDemandSource)) return null
      alreadyPresent += 1
      continue
    }
    const sourceId = input.sourceDigest.slice(7, 19).toUpperCase()
    const proof: ProductionActionProof = {
      actionId: `ACT-CLIENT-PLAN-${sourceId}-${String(index + 1).padStart(3, '0')}`,
      capturedAt: input.capturedAt,
      actor: input.actor,
      reason: `Approved client production plan row ${index + 1}.`,
      evidenceReference: `CLIENT-PLAN-${sourceId}-${job.id}`,
    }
    const next = registerProductionJob(state, job, proof)
    if (!next) return null
    state = next
    created += 1
  }
  return { state, created, alreadyPresent, replayed: created === 0 }
}

export function updateProductionJobPlan(
  state: ProductionState,
  jobId: string,
  priority: ProductionJobPriority,
  dueAt: string,
  owner: string,
  proof: ProductionActionProof,
) {
  if (!validProof(proof)
    || !validCanonicalText(jobId, 80)
    || !productionJobPriorities.includes(priority)
    || !validTimestamp(dueAt)
    || timestampAtOrBefore(dueAt, proof.capturedAt)
    || !validCanonicalText(owner, 120)) return null
  const existing = state.events.find((event) => event.actionId === proof.actionId)
  const job = state.jobs.find((candidate) => candidate.id === jobId)
  if (existing) return existing.kind === 'job_schedule_updated'
    && existing.subjectId === jobId
    && existing.jobPriority === priority
    && existing.jobDueAt === dueAt
    && existing.jobOwner === owner
    && job?.priority === priority
    && job?.dueAt === dueAt
    && job?.owner === owner
    && sameProof(existing, proof) ? state : null
  const accounted = job ? job.output + (job.scrap ?? 0) : 0
  const latestJobEvent = state.events.find((event) => event.subjectId === jobId)
  if (!job
    || job.closure
    || accounted >= job.target
    || (job.priority === priority && job.dueAt === dueAt && job.owner === owner)
    || (latestJobEvent && timestampBefore(proof.capturedAt, latestJobEvent.createdAt))
    || actionIdIsUsed(state, proof.actionId)
    || state.revision >= Number.MAX_SAFE_INTEGER) return null
  const event = eventFor(proof, {
    kind: 'job_schedule_updated',
    subjectId: jobId,
    summary: `Updated ${job.product} plan for ${job.line}`,
    ...(job.priority && job.dueAt ? { fromJobPriority: job.priority, fromJobDueAt: job.dueAt } : {}),
    ...(job.owner ? { fromJobOwner: job.owner } : {}),
    jobPriority: priority,
    jobDueAt: dueAt,
    jobOwner: owner,
  })
  return validateProductionState({
    ...state,
    revision: state.revision + 1,
    jobs: state.jobs.map((candidate) => candidate.id === jobId ? { ...candidate, priority, dueAt, owner } : candidate),
    events: [event, ...state.events],
  })
}

export function closeProductionJob(state: ProductionState, jobId: string, shiftRef: string, proof: ProductionActionProof) {
  if (!validProof(proof) || !validCanonicalText(jobId, 80) || !validCanonicalText(shiftRef, 80)) return null
  const existing = state.events.find((event) => event.actionId === proof.actionId)
  const job = state.jobs.find((candidate) => candidate.id === jobId)
  if (existing) return existing.kind === 'job_closed'
    && existing.subjectId === jobId
    && existing.shiftRef === shiftRef
    && existing.remainingQuantity === job?.closure?.remainingUnits
    && job?.closure?.actionId === proof.actionId
    && sameProof(existing, proof) ? state : null
  const remainingUnits = job ? job.target - job.output - (job.scrap ?? 0) : 0
  const latestJobEvent = state.events.find((event) => event.subjectId === jobId)
  if (!job
    || job.closure
    || job.qualityHold
    || !Number.isSafeInteger(remainingUnits)
    || remainingUnits < 1
    || (latestJobEvent && timestampBefore(proof.capturedAt, latestJobEvent.createdAt))
    || actionIdIsUsed(state, proof.actionId)
    || state.revision >= Number.MAX_SAFE_INTEGER) return null
  const closure: ProductionJobClosure = {
    actionId: proof.actionId,
    closedAt: proof.capturedAt,
    closedBy: proof.actor,
    reason: proof.reason,
    evidenceReference: proof.evidenceReference,
    shiftRef,
    remainingUnits,
  }
  const event = eventFor(proof, {
    kind: 'job_closed',
    subjectId: jobId,
    summary: `Closed ${job.product} short with ${remainingUnits} units remaining`,
    shiftRef,
    remainingQuantity: remainingUnits,
  })
  return validateProductionState({
    ...state,
    revision: state.revision + 1,
    jobs: state.jobs.map((candidate) => candidate.id === jobId ? { ...candidate, closure } : candidate),
    events: [event, ...state.events],
  })
}

export function recordProductionOutput(state: ProductionState, jobId: string, quantity: number, shiftRef: string, proof: ProductionActionProof) {
  if (!validProof(proof) || !validCanonicalText(shiftRef, 80) || !Number.isSafeInteger(quantity) || quantity < 1) return null
  const existing = state.events.find((event) => event.actionId === proof.actionId)
  if (existing) return existing.kind === 'output_recorded' && (existing.outputKind ?? 'good') === 'good' && existing.subjectId === jobId && existing.quantity === quantity && existing.shiftRef === shiftRef && sameProof(existing, proof) ? state : null
  if (actionIdIsUsed(state, proof.actionId)) return null
  const matchingJobs = state.jobs.filter((job) => job.id === jobId)
  const job = matchingJobs.length === 1 ? matchingJobs[0] : undefined
  if (!job || job.closure || job.qualityHold) return null
  const nextOutput = job.output + quantity
  const scrap = job.scrap ?? 0
  const shiftOutput = productionShiftOutput(state, shiftRef)
  if (!Number.isSafeInteger(nextOutput)
    || !Number.isSafeInteger(shiftOutput.goodUnits + quantity)
    || nextOutput + scrap > job.target
    || state.revision >= Number.MAX_SAFE_INTEGER) return null
  const event = eventFor(proof, { kind: 'output_recorded', subjectId: jobId, summary: `Recorded ${quantity} good units`, quantity, shiftRef })
  return validateProductionState({
    ...state,
    revision: state.revision + 1,
    jobs: state.jobs.map((candidate) => candidate.id === jobId ? { ...candidate, output: nextOutput } : candidate),
    events: [event, ...state.events],
  })
}

export function recordProductionScrap(state: ProductionState, jobId: string, quantity: number, shiftRef: string, proof: ProductionActionProof) {
  if (!validProof(proof) || !validCanonicalText(shiftRef, 80) || !Number.isSafeInteger(quantity) || quantity < 1) return null
  const existing = state.events.find((event) => event.actionId === proof.actionId)
  if (existing) return existing.kind === 'output_recorded'
    && existing.outputKind === 'scrap'
    && existing.subjectId === jobId
    && existing.quantity === quantity
    && existing.shiftRef === shiftRef
    && sameProof(existing, proof) ? state : null
  if (actionIdIsUsed(state, proof.actionId)) return null
  const matchingJobs = state.jobs.filter((job) => job.id === jobId)
  const job = matchingJobs.length === 1 ? matchingJobs[0] : undefined
  if (!job || job.closure || job.qualityHold) return null
  const currentScrap = job.scrap ?? 0
  const nextScrap = currentScrap + quantity
  const shiftOutput = productionShiftOutput(state, shiftRef)
  if (!Number.isSafeInteger(nextScrap)
    || !Number.isSafeInteger(shiftOutput.scrapUnits + quantity)
    || job.output + nextScrap > job.target
    || state.revision >= Number.MAX_SAFE_INTEGER) return null
  const event = eventFor(proof, { kind: 'output_recorded', subjectId: jobId, summary: `Recorded ${quantity} scrap units`, quantity, shiftRef, outputKind: 'scrap' })
  return validateProductionState({
    ...state,
    revision: state.revision + 1,
    jobs: state.jobs.map((candidate) => candidate.id === jobId ? { ...candidate, scrap: nextScrap } : candidate),
    events: [event, ...state.events],
  })
}

export function recordProductionMaterialConsumption(
  state: ProductionState,
  jobId: string,
  materialRef: string,
  materialLot: string | undefined,
  quantity: number,
  materialUnit: ProductionMaterialUnit,
  shiftRef: string,
  proof: ProductionActionProof,
) {
  if (!validProof(proof)
    || !validCanonicalText(jobId, 80)
    || !validCanonicalText(materialRef, 120)
    || (materialLot !== undefined && !validCanonicalText(materialLot, 120))
    || !productionMaterialUnits.includes(materialUnit)
    || !validCanonicalText(shiftRef, 80)
    || !validMaterialQuantity(quantity)) return null
  const existing = state.events.find((event) => event.actionId === proof.actionId)
  if (existing) return existing.kind === 'material_consumed'
    && existing.subjectId === jobId
    && existing.materialRef === materialRef
    && existing.materialLot === materialLot
    && existing.materialUnit === materialUnit
    && existing.quantity === quantity
    && existing.shiftRef === shiftRef
    && sameProof(existing, proof) ? state : null
  if (actionIdIsUsed(state, proof.actionId) || state.revision >= Number.MAX_SAFE_INTEGER) return null
  const matchingJobs = state.jobs.filter((job) => job.id === jobId)
  const job = matchingJobs.length === 1 ? matchingJobs[0] : undefined
  if (!job || job.closure || job.qualityHold || job.output + (job.scrap ?? 0) >= job.target) return null
  const creationEvent = state.events.find((event) => event.kind === 'job_created' && event.subjectId === jobId)
  if (creationEvent && timestampBefore(proof.capturedAt, creationEvent.createdAt)) return null
  const event = eventFor(proof, {
    kind: 'material_consumed',
    subjectId: jobId,
    summary: `Used ${materialQuantityText(quantity)} ${materialUnit} ${materialRef}${materialLot ? ` · lot ${materialLot}` : ''}`,
    quantity,
    shiftRef,
    materialRef,
    ...(materialLot ? { materialLot } : {}),
    materialUnit,
  })
  return validateProductionState({
    ...state,
    revision: state.revision + 1,
    events: [event, ...state.events],
  })
}

export function placeProductionQualityHold(state: ProductionState, jobId: string, proof: ProductionActionProof) {
  if (!validProof(proof)) return null
  const existing = state.events.find((event) => event.actionId === proof.actionId)
  const job = state.jobs.find((candidate) => candidate.id === jobId)
  if (existing) return existing.kind === 'quality_hold_placed'
    && existing.subjectId === jobId
    && sameProof(existing, proof) ? state : null
  const latestLifecycleEvent = state.events.find((event) => event.subjectId === jobId
    && (event.kind === 'job_created' || event.kind === 'quality_hold_placed' || event.kind === 'quality_hold_released'))
  if (!job
    || job.qualityHold
    || job.closure
    || (latestLifecycleEvent && timestampBefore(proof.capturedAt, latestLifecycleEvent.createdAt))
    || actionIdIsUsed(state, proof.actionId)
    || state.revision >= Number.MAX_SAFE_INTEGER) return null
  const qualityHold: ProductionQualityHold = {
    actionId: proof.actionId,
    heldAt: proof.capturedAt,
    heldBy: proof.actor,
    reason: proof.reason,
    evidenceReference: proof.evidenceReference,
  }
  const event = eventFor(proof, { kind: 'quality_hold_placed', subjectId: jobId, summary: `Held ${job.product} for quality review` })
  return validateProductionState({
    ...state,
    revision: state.revision + 1,
    jobs: state.jobs.map((candidate) => candidate.id === jobId ? { ...candidate, qualityHold } : candidate),
    events: [event, ...state.events],
  })
}

export function releaseProductionQualityHold(state: ProductionState, jobId: string, proof: ProductionActionProof) {
  if (!validProof(proof)) return null
  const existing = state.events.find((event) => event.actionId === proof.actionId)
  const job = state.jobs.find((candidate) => candidate.id === jobId)
  const latestJobEvent = state.events.find((event) => event.subjectId === jobId)
  if (existing) return existing.kind === 'quality_hold_released'
    && existing.subjectId === jobId
    && sameProof(existing, proof) ? state : null
  if (!job?.qualityHold
    || timestampBefore(proof.capturedAt, job.qualityHold.heldAt)
    || (latestJobEvent && timestampBefore(proof.capturedAt, latestJobEvent.createdAt))
    || actionIdIsUsed(state, proof.actionId)
    || state.revision >= Number.MAX_SAFE_INTEGER) return null
  const event = eventFor(proof, { kind: 'quality_hold_released', subjectId: jobId, summary: `Released ${job.product} from quality hold` })
  return validateProductionState({
    ...state,
    revision: state.revision + 1,
    jobs: state.jobs.map((candidate) => {
      if (candidate.id !== jobId) return candidate
      const releasedJob = { ...candidate }
      delete releasedJob.qualityHold
      return releasedJob
    }),
    events: [event, ...state.events],
  })
}

export function openProductionIssue(state: ProductionState, issue: ProductionIssue, proof: ProductionActionProof) {
  if (!validProof(proof)
    || !isRecord(issue)
    || issue.status !== 'open'
    || issue.resolution
    || !validTimestamp(issue.createdAt)
    || !validCanonicalText(issue.id, 80)
    || !validCanonicalText(issue.area, 120)
    || !validCanonicalText(issue.summary, 240)
    || !productionIssueSeverities.includes(issue.severity as ProductionIssueSeverity)
    || !validCanonicalText(issue.owner, 120)
    || !validTimestamp(issue.dueAt)
    || timestampBefore(proof.capturedAt, issue.createdAt)
    || timestampAtOrBefore(issue.dueAt as string, issue.createdAt)
    || timestampAtOrBefore(issue.dueAt as string, proof.capturedAt)
    || !validCanonicalText(issue.containment, 240)
    || !issueKinds.includes(issue.kind)) return null
  const existing = state.events.find((event) => event.actionId === proof.actionId)
  if (existing) {
    const storedIssue = state.issues.find((candidate) => candidate.id === issue.id)
    return existing.kind === 'issue_opened' && existing.subjectId === issue.id && sameProof(existing, proof) && JSON.stringify(storedIssue) === JSON.stringify(issue) ? state : null
  }
  if (actionIdIsUsed(state, proof.actionId) || state.issues.some((candidate) => candidate.id === issue.id) || state.revision >= Number.MAX_SAFE_INTEGER) return null
  const event = eventFor(proof, {
    kind: 'issue_opened',
    subjectId: issue.id,
    summary: `Opened ${issue.kind} issue for ${issue.area}`,
    issueSeverity: issue.severity,
    issueOwner: issue.owner,
    issueDueAt: issue.dueAt,
    issueContainment: issue.containment,
    ...(issue.maintenanceFindingSource === undefined ? {} : { maintenanceFindingSource: issue.maintenanceFindingSource }),
  })
  return validateProductionState({ ...state, revision: state.revision + 1, issues: [issue, ...state.issues], events: [event, ...state.events] })
}

export function resolveProductionIssue(
  state: ProductionState,
  issueId: string,
  proof: ProductionActionProof,
  maintenanceCorrectiveAction?: ProductionMaintenanceCorrectiveAction,
  qualityCorrectiveAction?: ProductionQualityCorrectiveAction,
) {
  if (!validProof(proof)) return null
  if (maintenanceCorrectiveAction !== undefined && qualityCorrectiveAction !== undefined) return null
  if (maintenanceCorrectiveAction !== undefined) {
    try { validateProductionMaintenanceCorrectiveAction(maintenanceCorrectiveAction, 'maintenanceCorrectiveAction') } catch { return null }
  }
  if (qualityCorrectiveAction !== undefined) {
    try { validateProductionQualityCorrectiveAction(qualityCorrectiveAction, 'qualityCorrectiveAction') } catch { return null }
  }
  const existing = state.events.find((event) => event.actionId === proof.actionId)
  if (existing) {
    const issue = state.issues.find((candidate) => candidate.id === issueId)
    return existing.kind === 'issue_resolved'
      && existing.subjectId === issueId
      && sameProof(existing, proof)
      && issue?.status === 'resolved'
      && issue.resolution?.actionId === proof.actionId
      && issue.resolution.resolvedAt === proof.capturedAt
      && issue.resolution.resolvedBy === proof.actor
      && issue.resolution.reason === proof.reason
      && issue.resolution.evidenceReference === proof.evidenceReference
      && JSON.stringify(issue.resolution.maintenanceCorrectiveAction) === JSON.stringify(maintenanceCorrectiveAction)
      && JSON.stringify(existing.maintenanceCorrectiveAction) === JSON.stringify(maintenanceCorrectiveAction)
      && JSON.stringify(issue.resolution.qualityCorrectiveAction) === JSON.stringify(qualityCorrectiveAction)
      && JSON.stringify(existing.qualityCorrectiveAction) === JSON.stringify(qualityCorrectiveAction) ? state : null
  }
  if (actionIdIsUsed(state, proof.actionId)) return null
  const issue = state.issues.find((candidate) => candidate.id === issueId)
  if (!issue || issue.status !== 'open'
    || Boolean(issue.maintenanceFindingSource) !== Boolean(maintenanceCorrectiveAction)
    || (issue.kind === 'quality' && Boolean(issue.severity && issue.owner && issue.dueAt && issue.containment) && qualityCorrectiveAction === undefined)
    || (issue.kind !== 'quality' && qualityCorrectiveAction !== undefined)
    || (qualityCorrectiveAction !== undefined && JSON.stringify(qualityCorrectiveAction.priorIssueIds) !== JSON.stringify(productionQualityPriorIssueIds(state.issues, issueId, qualityCorrectiveAction.recurrenceKey)))
    || state.revision >= Number.MAX_SAFE_INTEGER) return null
  const resolution: ProductionIssueResolution = {
    actionId: proof.actionId,
    resolvedAt: proof.capturedAt,
    resolvedBy: proof.actor,
    reason: proof.reason,
    evidenceReference: proof.evidenceReference,
    ...(maintenanceCorrectiveAction === undefined ? {} : { maintenanceCorrectiveAction }),
    ...(qualityCorrectiveAction === undefined ? {} : { qualityCorrectiveAction }),
  }
  const event = eventFor(proof, {
    kind: 'issue_resolved',
    subjectId: issueId,
    summary: `Resolved ${issue.kind} issue for ${issue.area}`,
    ...(maintenanceCorrectiveAction === undefined ? {} : { maintenanceCorrectiveAction }),
    ...(qualityCorrectiveAction === undefined ? {} : { qualityCorrectiveAction }),
  })
  return validateProductionState({
    ...state,
    revision: state.revision + 1,
    issues: state.issues.map((candidate) => candidate.id === issueId ? { ...candidate, status: 'resolved' as const, resolution } : candidate),
    events: [event, ...state.events],
  })
}

export function recordProductionMachineState(
  state: ProductionState,
  machineId: string,
  expectedState: ProductionMachineState,
  toState: ProductionMachineState,
  proof: ProductionActionProof,
) {
  if (!validProof(proof)
    || !productionMachineStates.includes(expectedState)
    || !productionMachineStates.includes(toState)
    || expectedState === toState) return null
  const existing = state.events.find((event) => event.actionId === proof.actionId)
  if (existing) return existing.kind === 'machine_state_changed'
    && existing.subjectId === machineId
    && existing.fromState === expectedState
    && existing.toState === toState
    && sameProof(existing, proof) ? state : null
  if (actionIdIsUsed(state, proof.actionId)) return null
  const matchingMachines = state.machines.filter((machine) => machine.id === machineId)
  const machine = matchingMachines.length === 1 ? matchingMachines[0] : undefined
  if (!machine || machine.state !== expectedState || state.revision >= Number.MAX_SAFE_INTEGER) return null
  const event = eventFor(proof, { kind: 'machine_state_changed', subjectId: machineId, summary: `${machine.name}: ${expectedState} to ${toState}`, fromState: expectedState, toState })
  return validateProductionState({
    ...state,
    revision: state.revision + 1,
    machines: state.machines.map((candidate) => candidate.id === machineId ? { ...candidate, state: toState } : candidate),
    events: [event, ...state.events],
  })
}

export function startProductionDowntime(
  state: ProductionState,
  machineId: string,
  proof: ProductionActionProof,
) {
  if (!validProof(proof) || !validDowntimeTimestamp(proof.capturedAt)) return null
  const existing = state.events.find((event) => event.actionId === proof.actionId)
  if (existing) return existing.kind === 'downtime_started'
    && existing.subjectId === machineId
    && sameProof(existing, proof) ? state : null
  const machine = state.machines.find((candidate) => candidate.id === machineId)
  const currentInterval = productionDowntimeIntervals(state).find((interval) => interval.machineId === machineId && !interval.end)
  const latestLifecycleEvent = state.events.find((event) => event.subjectId === machineId
    && (event.kind === 'downtime_started' || event.kind === 'downtime_ended'))
  if (!machine
    || currentInterval
    || (latestLifecycleEvent && timestampBefore(proof.capturedAt, latestLifecycleEvent.createdAt))
    || actionIdIsUsed(state, proof.actionId)
    || state.revision >= Number.MAX_SAFE_INTEGER) return null
  const event = eventFor(proof, { kind: 'downtime_started', subjectId: machineId, summary: `Started downtime for ${machine.name}` })
  return validateProductionState({
    ...state,
    revision: state.revision + 1,
    events: [event, ...state.events],
  })
}

export function endProductionDowntime(
  state: ProductionState,
  machineId: string,
  downtimeStartActionId: string,
  proof: ProductionActionProof,
) {
  if (!validProof(proof) || !validDowntimeTimestamp(proof.capturedAt) || !validCanonicalText(downtimeStartActionId, 160)) return null
  const existing = state.events.find((event) => event.actionId === proof.actionId)
  if (existing) return existing.kind === 'downtime_ended'
    && existing.subjectId === machineId
    && existing.downtimeStartActionId === downtimeStartActionId
    && sameProof(existing, proof) ? state : null
  const machine = state.machines.find((candidate) => candidate.id === machineId)
  const currentInterval = productionDowntimeIntervals(state).find((interval) => interval.machineId === machineId && !interval.end)
  if (!machine
    || !currentInterval
    || currentInterval.startActionId !== downtimeStartActionId
    || timestampBefore(proof.capturedAt, currentInterval.startedAt)
    || actionIdIsUsed(state, proof.actionId)
    || state.revision >= Number.MAX_SAFE_INTEGER) return null
  const event = eventFor(proof, {
    kind: 'downtime_ended',
    subjectId: machineId,
    summary: `Ended downtime for ${machine.name}`,
    downtimeStartActionId,
  })
  return validateProductionState({
    ...state,
    revision: state.revision + 1,
    events: [event, ...state.events],
  })
}

export function startProductionMaintenance(
  state: ProductionState,
  machineId: string,
  maintenanceOwner: string,
  proof: ProductionActionProof,
) {
  validateProductionState(state)
  if (!validProof(proof)
    || !validDowntimeTimestamp(proof.capturedAt)
    || !validCanonicalText(maintenanceOwner, 120)) return null
  const existing = state.events.find((event) => event.actionId === proof.actionId)
  if (existing) return existing.kind === 'maintenance_started'
    && existing.subjectId === machineId
    && existing.maintenanceOwner === maintenanceOwner
    && sameProof(existing, proof) ? state : null
  const machine = state.machines.find((candidate) => candidate.id === machineId)
  const strategy = state.equipmentMaster?.assets.find((candidate) => candidate.id === machineId)?.maintenanceStrategy
  const openRecord = productionMaintenanceRecords(state).find((record) => record.machineId === machineId && !record.completion)
  const latestLifecycleEvent = state.events.find((event) => event.subjectId === machineId
    && (event.kind === 'maintenance_started' || event.kind === 'maintenance_completed'))
  if (!machine
    || openRecord
    || (strategy !== undefined && maintenanceOwner !== strategy.maintenanceOwner)
    || (latestLifecycleEvent && timestampBefore(proof.capturedAt, latestLifecycleEvent.createdAt))
    || actionIdIsUsed(state, proof.actionId)
    || state.revision >= Number.MAX_SAFE_INTEGER) return null
  const event = eventFor(proof, {
    kind: 'maintenance_started',
    subjectId: machineId,
    summary: `Started maintenance for ${machine.name}`,
    maintenanceOwner,
    ...(strategy === undefined ? {} : {
      maintenanceStrategyActionId: strategy.actionId,
      maintenanceStrategyRevision: strategy.revision,
      maintenanceProcedureReference: strategy.procedureReference,
      maintenancePlannedDueAt: strategy.nextDueAt,
    }),
  })
  const next = structuredClone(state)
  return validateProductionState({
    ...next,
    revision: next.revision + 1,
    events: [event, ...next.events],
  })
}

export function completeProductionMaintenance(
  state: ProductionState,
  machineId: string,
  maintenanceStartActionId: string,
  proof: ProductionActionProof,
  result?: ProductionMaintenanceResult,
) {
  validateProductionState(state)
  if (!validProof(proof)
    || !validDowntimeTimestamp(proof.capturedAt)
    || !validCanonicalText(maintenanceStartActionId, 160)
    || (result !== undefined && (!isRecord(result)
      || JSON.stringify(Object.keys(result).sort()) !== JSON.stringify(['findings', 'outcome', 'procedureCompleted', 'returnToService'])
      || !productionMaintenanceOutcomes.includes(result.outcome)
      || !validCanonicalText(result.findings, 360)
      || result.procedureCompleted !== true
      || !productionMaintenanceReturnToServiceValues.includes(result.returnToService)
      || (result.outcome === 'completed' && result.returnToService !== 'recommended')))) return null
  const existing = state.events.find((event) => event.actionId === proof.actionId)
  if (existing) return existing.kind === 'maintenance_completed'
    && existing.subjectId === machineId
    && existing.maintenanceStartActionId === maintenanceStartActionId
    && (existing.maintenanceStrategyActionId === undefined
      ? result === undefined
      : result !== undefined
        && existing.maintenanceOutcome === result.outcome
        && existing.maintenanceFindings === result.findings
        && existing.maintenanceProcedureCompleted === result.procedureCompleted
        && existing.maintenanceReturnToService === result.returnToService)
    && sameProof(existing, proof) ? state : null
  const machine = state.machines.find((candidate) => candidate.id === machineId)
  const equipmentAsset = state.equipmentMaster?.assets.find((candidate) => candidate.id === machineId)
  const strategy = equipmentAsset?.maintenanceStrategy
  const openRecord = productionMaintenanceRecords(state).find((record) => record.machineId === machineId && !record.completion)
  if (!machine
    || !openRecord
    || openRecord.startActionId !== maintenanceStartActionId
    || timestampBefore(proof.capturedAt, openRecord.startedAt)
    || actionIdIsUsed(state, proof.actionId)
    || state.revision >= Number.MAX_SAFE_INTEGER) return null
  if (Boolean(strategy) !== Boolean(openRecord.strategy)
    || Boolean(strategy) !== Boolean(result)
    || (strategy && openRecord.strategy && (strategy.actionId !== openRecord.strategy.actionId
      || strategy.revision !== openRecord.strategy.revision
      || strategy.procedureReference !== openRecord.strategy.procedureReference
      || strategy.nextDueAt !== openRecord.strategy.plannedDueAt))) return null
  const nextDueAt = strategy === undefined
    ? undefined
    : new Date(Date.parse(proof.capturedAt) + strategy.intervalDays * 86_400_000).toISOString()
  const event = eventFor(proof, {
    kind: 'maintenance_completed',
    subjectId: machineId,
    summary: `Completed maintenance for ${machine.name}`,
    maintenanceStartActionId,
    ...(strategy === undefined || nextDueAt === undefined ? {} : {
      maintenanceStrategyActionId: strategy.actionId,
      maintenanceStrategyRevision: strategy.revision,
      maintenanceProcedureReference: strategy.procedureReference,
      maintenancePlannedDueAt: strategy.nextDueAt,
      maintenanceOutcome: result?.outcome,
      maintenanceFindings: result?.findings,
      maintenanceProcedureCompleted: result?.procedureCompleted,
      maintenanceReturnToService: result?.returnToService,
      nextDueAt,
    }),
  })
  const next = structuredClone(state)
  if (strategy && nextDueAt && next.equipmentMaster) {
    const nextAsset = next.equipmentMaster.assets.find((candidate) => candidate.id === machineId)
    if (!nextAsset?.maintenanceStrategy) return null
    nextAsset.maintenanceStrategy.nextDueAt = nextDueAt
  }
  return validateProductionState({
    ...next,
    revision: next.revision + 1,
    events: [event, ...next.events],
  })
}

export const GUIDED_SAMPLE_PRODUCTION_ACTOR = 'Shift supervisor'
const WORKING_SAMPLE_SETUP_ACTOR = 'Production planner'

const guidedSampleActionPrefix = 'ACT-GUIDED-SAMPLE-'

export function isGuidedSampleProduction(stateValue: ProductionState) {
  let state: ProductionState
  try { state = validateProductionState(stateValue) } catch { return false }
  // Controlled-order and equipment work append no events, so the event log alone
  // cannot prove this workspace is still a pure sample. A released batch is the
  // only Plant proof; treating such a workspace as replaceable would destroy it.
  // The legacy single-order field and the equipment master stay hard bars regardless
  // of content. A populated order portfolio is narrower: it is still replaceable when
  // every retained entry's every command carries guided-sample proof end to end, since
  // that is proof of the same guided walkthrough the event log already accepts below --
  // not a human-authored plan or execution step.
  if (state.orderExecution || state.equipmentMaster) return false
  if (state.orderPortfolio && !productionOrderPortfolioEntries(state).every((entry) => entry.execution.commands
    .every((command) => command.payload.proof.actionId.startsWith(guidedSampleActionPrefix)))) return false
  return state.events.every((event) => event.actionId.startsWith(productionWorkingSampleActionPrefix)
    || event.actionId.startsWith(guidedSampleActionPrefix))
}

export function hasGuidedSampleProductionActivity(stateValue: ProductionState) {
  let state: ProductionState
  try { state = validateProductionState(stateValue) } catch { return false }
  return state.events.some((event) => event.actionId.startsWith(guidedSampleActionPrefix))
}

export function appendGuidedSampleProductionActivity(stateValue: ProductionState, input: {
  planningDay: string
  materialRef: string
  materialUnit: ProductionMaterialUnit
}): ProductionState | null {
  let state: ProductionState
  try { state = validateProductionState(stateValue) } catch { return null }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.planningDay) || !Number.isFinite(Date.parse(`${input.planningDay}T00:00:00.000Z`))) return null
  // Nothing to seed is a legitimate no-op, not a failure: returning the exact input
  // makes the write boundary report an unchanged replay rather than an error, so a
  // caller can treat any { ok: false } as a real problem worth surfacing.
  if (!isGuidedSampleProduction(state) || hasGuidedSampleProductionActivity(state)) return stateValue
  const activeJobs = state.jobs
    .filter((job) => !job.closure && job.output + (job.scrap ?? 0) < job.target)
    .sort(compareProductionJobSchedule)
    .slice(0, 2)
  if (!activeJobs.length) return stateValue
  const shiftRef = `${input.planningDay} Day`
  const latestEventAt = state.events.length ? Date.parse(state.events[0].createdAt) : 0
  const base = latestEventAt ? latestEventAt + 60_000 : Date.parse(`${input.planningDay}T01:30:00.000Z`)
  let step = 0
  const proof = (reason: string): ProductionActionProof => ({
    actionId: `${guidedSampleActionPrefix}${String(step += 1).padStart(3, '0')}`,
    capturedAt: new Date(base + step * 90_000).toISOString(),
    actor: GUIDED_SAMPLE_PRODUCTION_ACTOR,
    reason,
    evidenceReference: 'SHIFT-LOG-001',
  })
  const primary = activeJobs[0]
  const primaryOutput = Math.max(1, Math.floor(primary.target * 0.4))
  const primaryScrap = Math.max(1, Math.floor(primary.target * 0.02))
  let next = recordProductionOutput(state, primary.id, primaryOutput, shiftRef, proof('Recorded good output for the running shift.'))
  if (!next) return null
  next = recordProductionScrap(next, primary.id, primaryScrap, shiftRef, proof('Recorded scrap against the same shift.'))
  if (!next) return null
  next = recordProductionMaterialConsumption(
    next,
    primary.id,
    input.materialRef,
    undefined,
    primaryOutput * 2,
    input.materialUnit,
    shiftRef,
    proof('Issued material against the recorded output.'),
  )
  if (!next) return null
  const secondary = activeJobs[1]
  if (secondary) {
    next = recordProductionOutput(next, secondary.id, Math.max(1, Math.floor(secondary.target * 0.25)), shiftRef, proof('Recorded good output on the second active job.'))
    if (!next) return null
  }
  try { return validateProductionState(next) } catch { return null }
}
