import type { PlantOrderState } from './plant-order-foundation'

export const PRODUCTION_WORKSPACE_SCHEMA = 'supermega.production.workspace.v2' as const
export const PRODUCTION_KEY = 'supermega.production.workspace.v2'
export const LEGACY_PRODUCTION_KEYS = ['supermega.production.workspace.v1', 'supermega.plant.workspace.v2']
export const PRODUCTION_LOCK = 'supermega-production-workspace-v2'

export type ProductionIssueKind = 'quality' | 'maintenance' | 'materials' | 'operations'
export type ProductionIssueSeverity = 'critical' | 'high' | 'medium' | 'low'
export type ProductionJobPriority = 'urgent' | 'normal' | 'low'
export type ProductionMachineState = 'running' | 'attention' | 'stopped'
export type ProductionMaterialUnit = 'kg' | 'g' | 'l' | 'ml' | 'pcs' | 'pack' | 'bag' | 'roll' | 'sheet' | 'm' | 'cm'

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
}

export type ProductionIssueResolution = {
  actionId: string
  resolvedAt: string
  resolvedBy: string
  reason: string
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
  resolution?: ProductionIssueResolution
}

export type ProductionMachine = {
  id: string
  name: string
  state: ProductionMachineState
}

export type ProductionOpeningPlan = {
  contract: 'supermega.production.opening-plan.v1'
  packageDigest: string
  confirmedAt: string
  jobIds: string[]
  machineIds: string[]
}

export type ProductionEventKind = 'job_created' | 'job_schedule_updated' | 'job_closed' | 'output_recorded' | 'material_consumed' | 'issue_opened' | 'issue_resolved' | 'quality_hold_placed' | 'quality_hold_released' | 'machine_state_changed' | 'downtime_started' | 'downtime_ended' | 'maintenance_started' | 'maintenance_completed'
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

export type ProductionMutationResult =
  | { ok: true; state: ProductionState; replayed: boolean }
  | { ok: false; error: string }

export type ProductionShiftOutput = {
  goodUnits: number
  scrapUnits: number
  entryCount: number
}

export type ProductionShiftHandoff = {
  shiftRef: string
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
  completion?: {
    actionId: string
    completedAt: string
    completedBy: string
    outcome: string
    evidenceReference: string
  }
}

const issueKinds: ProductionIssueKind[] = ['quality', 'maintenance', 'materials', 'operations']
export const productionIssueSeverities: ProductionIssueSeverity[] = ['critical', 'high', 'medium', 'low']
export const productionJobPriorities: ProductionJobPriority[] = ['urgent', 'normal', 'low']
export const productionMachineStates: ProductionMachineState[] = ['running', 'attention', 'stopped']
export const productionMaterialUnits: ProductionMaterialUnit[] = ['kg', 'g', 'l', 'ml', 'pcs', 'pack', 'bag', 'roll', 'sheet', 'm', 'cm']
const eventKinds: ProductionEventKind[] = ['job_created', 'job_schedule_updated', 'job_closed', 'output_recorded', 'material_consumed', 'issue_opened', 'issue_resolved', 'quality_hold_placed', 'quality_hold_released', 'machine_state_changed', 'downtime_started', 'downtime_ended', 'maintenance_started', 'maintenance_completed']
const baseEventFields = ['id', 'actionId', 'createdAt', 'actor', 'reason', 'evidenceReference', 'kind', 'subjectId', 'summary']
const jobCreatedEventFields = [...baseEventFields, 'jobPriority', 'jobDueAt', 'jobOwner']
const jobScheduleUpdateEventFields = [...jobCreatedEventFields, 'fromJobPriority', 'fromJobDueAt', 'fromJobOwner']
const jobClosedEventFields = [...baseEventFields, 'shiftRef', 'remainingQuantity']
const qualityHoldEventFields = baseEventFields
const materialEventFields = [...baseEventFields, 'quantity', 'shiftRef', 'materialRef', 'materialUnit']
const materialOptionalEventFields = ['materialLot']
const downtimeEndEventFields = [...baseEventFields, 'downtimeStartActionId']
const maintenanceStartEventFields = [...baseEventFields, 'maintenanceOwner']
const maintenanceCompleteEventFields = [...baseEventFields, 'maintenanceStartActionId']
const productionStateFields = ['schema', 'revision', 'jobs', 'issues', 'machines', 'events', 'openingPlan', 'orderExecution']
const productionOpeningPlanFields = ['contract', 'packageDigest', 'confirmedAt', 'jobIds', 'machineIds']
const productionJobFields = ['id', 'line', 'product', 'target', 'output', 'owner', 'priority', 'dueAt', 'scrap', 'qualityHold', 'closure']
const productionIssueFields = ['id', 'createdAt', 'area', 'kind', 'summary', 'status', 'severity', 'owner', 'dueAt', 'containment', 'resolution']
const productionIssueResolutionFields = ['actionId', 'resolvedAt', 'resolvedBy', 'reason', 'evidenceReference']
const productionMachineFields = ['id', 'name', 'state']
const eventFieldsByKind: Record<ProductionEventKind, string[]> = {
  job_created: jobCreatedEventFields,
  job_schedule_updated: jobScheduleUpdateEventFields,
  job_closed: jobClosedEventFields,
  output_recorded: [...baseEventFields, 'quantity', 'shiftRef', 'outputKind'],
  material_consumed: [...materialEventFields, ...materialOptionalEventFields],
  issue_opened: [...baseEventFields, 'issueSeverity', 'issueOwner', 'issueDueAt', 'issueContainment'],
  issue_resolved: baseEventFields,
  quality_hold_placed: qualityHoldEventFields,
  quality_hold_released: qualityHoldEventFields,
  machine_state_changed: [...baseEventFields, 'fromState', 'toState'],
  downtime_started: baseEventFields,
  downtime_ended: downtimeEndEventFields,
  maintenance_started: maintenanceStartEventFields,
  maintenance_completed: maintenanceCompleteEventFields,
}
const deterministicSeedNow = Date.parse('2026-07-23T08:00:00.000Z')

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
      { id: 'JOB-201', line: 'Line 01', product: 'Batch Alpha', target: 1200, output: 860, priority: 'urgent', dueAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString() },
      { id: 'JOB-202', line: 'Line 02', product: 'Batch Beta', target: 900, output: 745, priority: 'normal', dueAt: new Date(now + 8 * 24 * 60 * 60 * 1000).toISOString() },
      { id: 'JOB-203', line: 'Line 03', product: 'Batch Gamma', target: 650, output: 650, priority: 'low', dueAt: new Date(now + 6 * 24 * 60 * 60 * 1000).toISOString() },
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
  const eventIds: string[] = []
  const actionIds: string[] = []
  let openingJobIds: string[] | null = null
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

  if (Object.hasOwn(value, 'openingPlan')) {
    if (!isRecord(value.openingPlan)) throw new Error('Production opening plan is invalid.')
    const openingPlan = value.openingPlan
    assertOnlyFields(openingPlan, productionOpeningPlanFields, 'Production opening plan')
    if (openingPlan.contract !== 'supermega.production.opening-plan.v1') throw new Error('Production opening plan contract is invalid.')
    if (typeof openingPlan.packageDigest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(openingPlan.packageDigest)) throw new Error('Production opening plan package digest is invalid.')
    if (!validDowntimeTimestamp(openingPlan.confirmedAt)) throw new Error('Production opening plan confirmation time is invalid.')
    if (!Array.isArray(openingPlan.jobIds)
      || !openingPlan.jobIds.length
      || openingPlan.jobIds.length > 100
      || !Array.isArray(openingPlan.machineIds)
      || !openingPlan.machineIds.length
      || openingPlan.machineIds.length > 100) throw new Error('Production opening plan record IDs are invalid.')
    const planJobIds = openingPlan.jobIds.map((id, index) => canonicalText(id, `openingPlan.jobIds[${index}]`, 80))
    const planMachineIds = openingPlan.machineIds.map((id, index) => canonicalText(id, `openingPlan.machineIds[${index}]`, 80))
    assertUnique(planJobIds, 'Production opening job ID')
    assertUnique(planMachineIds, 'Production opening machine ID')
    if (JSON.stringify(jobIds.slice(-planJobIds.length)) !== JSON.stringify(planJobIds)) throw new Error('Production opening jobs are not the immutable job suffix.')
    if (JSON.stringify(machineIds) !== JSON.stringify(planMachineIds)) throw new Error('Production opening machines do not match the retained machines.')
    openingJobIds = planJobIds
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
    const maintenanceFieldCount = ['maintenanceOwner', 'maintenanceStartActionId'].filter((field) => candidate[field] !== undefined).length
    if (candidate.kind === 'job_created' || candidate.kind === 'job_schedule_updated') {
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
      const expectedFields = candidate.kind === 'maintenance_started' ? maintenanceStartEventFields : maintenanceCompleteEventFields
      if (JSON.stringify(Object.keys(candidate).sort()) !== JSON.stringify([...expectedFields].sort())) throw new Error(`events[${index}] maintenance event fields are invalid.`)
      if (candidate.kind === 'maintenance_started') canonicalText(candidate.maintenanceOwner, `events[${index}].maintenanceOwner`, 120)
      else canonicalText(candidate.maintenanceStartActionId, `events[${index}].maintenanceStartActionId`, 160)
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
    } else {
      if (!issueIds.includes(candidate.subjectId as string)) throw new Error(`events[${index}] references an unknown issue.`)
      if (candidate.quantity !== undefined || candidate.remainingQuantity !== undefined || candidate.shiftRef !== undefined || candidate.outputKind !== undefined || materialFieldCount || issueSnapshotFieldCount || maintenanceFieldCount || candidate.fromState !== undefined || candidate.toState !== undefined || candidate.downtimeStartActionId !== undefined) throw new Error(`events[${index}] issue event has unrelated fields.`)
    }
  }
  assertUnique(eventIds, 'Production event ID')
  assertUnique(actionIds, 'Production action ID')
  if (Number(value.revision) !== events.length) throw new Error('Production revision must equal the append-only event count.')
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
    } else if (actionFieldCount !== 0) {
      throw new Error(`issues[${index}] action fields require an immutable opening event.`)
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
      || resolutionEvent.evidenceReference !== resolution.evidenceReference) {
      throw new Error(`issues[${index}] resolution proof does not match its immutable event.`)
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
    const machineEvents = events.filter((candidate): candidate is Record<string, unknown> => isRecord(candidate) && candidate.kind === 'machine_state_changed' && candidate.subjectId === machineId)
    const latestEvent = machineEvents[0]
    if (latestEvent && (!isRecord(machine) || latestEvent.toState !== machine.state)) throw new Error(`Latest machine event does not match ${machineId}.`)
    const oldestFirst = [...machineEvents].reverse()
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
        }
        records.push(activeRecord)
        continue
      }
      if (!activeRecord) throw new Error(`Maintenance history for ${machine.id} completes work that is not open.`)
      if (event.maintenanceStartActionId !== activeRecord.startActionId) throw new Error(`Maintenance completion for ${machine.id} does not reference its open record.`)
      if (event.summary !== `Completed maintenance for ${machine.name}`) throw new Error(`Maintenance completion summary for ${machine.id} is not canonical.`)
      activeRecord.completion = {
        actionId: event.actionId,
        completedAt: event.createdAt,
        completedBy: event.actor,
        outcome: event.reason,
        evidenceReference: event.evidenceReference,
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
  return persistInitialState(storage, createSeedProduction(), 'seed')
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

export async function mutateProductionWorkspace(
  transition: (state: ProductionState) => ProductionState | null,
  storage = browserStorage(),
  lockManager = globalThis.navigator?.locks as unknown as ProductionLockManager | undefined,
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
      if (next.revision !== current.revision + 1
        || next.events.length !== current.events.length + 1
        || JSON.stringify(next.events.slice(1)) !== JSON.stringify(current.events)) {
        return { ok: false, error: 'Production changes must append one event and advance one revision. Nothing was written.' } as const
      }
      let serialized: string
      try { serialized = JSON.stringify(validateProductionState(next)) } catch { return { ok: false, error: 'The proposed Production state failed integrity checks. Nothing was written.' } as const }
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

export function buildProductionShiftHandoff(state: ProductionState, shiftRef: string): ProductionShiftHandoff | null {
  if (!validCanonicalText(shiftRef, 80)) return null
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
    sourceRevision: current.revision,
    sourceCanonical: productionCanonical(current),
    shiftOutput: productionShiftOutput(current, shiftRef),
    shiftEntries,
    materialEntries,
    materialTotals,
    shortCloses,
    unfinishedJobs,
    activeHolds,
    priorityProblems,
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
  lines.push('', `Critical/high problems (${handoff.priorityProblems.length})`)
  if (!handoff.priorityProblems.length) lines.push('- None')
  for (const problem of handoff.priorityProblems) {
    lines.push(`- ${problem.severity.toUpperCase()} · ${handoffLine(problem.id)} · ${handoffLine(problem.area)} · ${handoffLine(problem.summary)} · opened ${problem.openedAt} by ${handoffLine(problem.openedBy)} · owner ${handoffLine(problem.owner)} · due ${problem.dueAt} · next ${handoffLine(problem.containment)} · evidence ${handoffLine(problem.evidenceReference)} · action ${handoffLine(problem.actionId)}`)
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

export function registerProductionJob(state: ProductionState, job: ProductionJob, proof: ProductionActionProof) {
  if (!isRecord(job)) return null
  const jobPriority = job.priority
  const jobDueAt = job.dueAt
  const jobOwner = job.owner
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
    || job.closure !== undefined) return null
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
  if (!job || job.closure) return null
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
  if (!job || job.closure) return null
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
  if (!job || job.closure || job.output + (job.scrap ?? 0) >= job.target) return null
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
  })
  return validateProductionState({ ...state, revision: state.revision + 1, issues: [issue, ...state.issues], events: [event, ...state.events] })
}

export function resolveProductionIssue(state: ProductionState, issueId: string, proof: ProductionActionProof) {
  if (!validProof(proof)) return null
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
      && issue.resolution.evidenceReference === proof.evidenceReference ? state : null
  }
  if (actionIdIsUsed(state, proof.actionId)) return null
  const issue = state.issues.find((candidate) => candidate.id === issueId)
  if (!issue || issue.status !== 'open' || state.revision >= Number.MAX_SAFE_INTEGER) return null
  const resolution: ProductionIssueResolution = {
    actionId: proof.actionId,
    resolvedAt: proof.capturedAt,
    resolvedBy: proof.actor,
    reason: proof.reason,
    evidenceReference: proof.evidenceReference,
  }
  const event = eventFor(proof, { kind: 'issue_resolved', subjectId: issueId, summary: `Resolved ${issue.kind} issue for ${issue.area}` })
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
  const openRecord = productionMaintenanceRecords(state).find((record) => record.machineId === machineId && !record.completion)
  const latestLifecycleEvent = state.events.find((event) => event.subjectId === machineId
    && (event.kind === 'maintenance_started' || event.kind === 'maintenance_completed'))
  if (!machine
    || openRecord
    || (latestLifecycleEvent && timestampBefore(proof.capturedAt, latestLifecycleEvent.createdAt))
    || actionIdIsUsed(state, proof.actionId)
    || state.revision >= Number.MAX_SAFE_INTEGER) return null
  const event = eventFor(proof, {
    kind: 'maintenance_started',
    subjectId: machineId,
    summary: `Started maintenance for ${machine.name}`,
    maintenanceOwner,
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
) {
  validateProductionState(state)
  if (!validProof(proof)
    || !validDowntimeTimestamp(proof.capturedAt)
    || !validCanonicalText(maintenanceStartActionId, 160)) return null
  const existing = state.events.find((event) => event.actionId === proof.actionId)
  if (existing) return existing.kind === 'maintenance_completed'
    && existing.subjectId === machineId
    && existing.maintenanceStartActionId === maintenanceStartActionId
    && sameProof(existing, proof) ? state : null
  const machine = state.machines.find((candidate) => candidate.id === machineId)
  const openRecord = productionMaintenanceRecords(state).find((record) => record.machineId === machineId && !record.completion)
  if (!machine
    || !openRecord
    || openRecord.startActionId !== maintenanceStartActionId
    || timestampBefore(proof.capturedAt, openRecord.startedAt)
    || actionIdIsUsed(state, proof.actionId)
    || state.revision >= Number.MAX_SAFE_INTEGER) return null
  const event = eventFor(proof, {
    kind: 'maintenance_completed',
    subjectId: machineId,
    summary: `Completed maintenance for ${machine.name}`,
    maintenanceStartActionId,
  })
  const next = structuredClone(state)
  return validateProductionState({
    ...next,
    revision: next.revision + 1,
    events: [event, ...next.events],
  })
}
