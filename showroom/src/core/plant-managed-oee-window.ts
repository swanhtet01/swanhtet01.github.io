import { sha256Hex } from './managed-trial-proof.ts'
import type { ProductionEvent, ProductionJob, ProductionState } from './production-workspace.ts'

export const PLANT_MANAGED_OEE_WINDOW_CONTRACT = 'supermega.plant-managed-oee-window.v1' as const

export type PlantManagedOeeWindowInput = {
  windowId: string
  startedAt: string
  endedAt: string
  jobId: string
  machineId: string
  shiftRef: string
  idealUnitsPerHour: number
  operatorReviewDigest?: string
  supervisorReviewDigest?: string
}

export type PlantManagedOeeWindowGateId =
  | 'window_time_valid'
  | 'job_present'
  | 'machine_present'
  | 'shift_close_present'
  | 'shift_close_inside_window'
  | 'job_shift_linked'
  | 'ideal_rate_present'
  | 'downtime_pairs_closed'
  | 'machine_not_stopped'
  | 'operator_review_digest_present'
  | 'supervisor_review_digest_present'
  | 'independent_review_digests'

export type PlantManagedOeeWindowGate = {
  id: PlantManagedOeeWindowGateId
  passed: boolean
  reason: string
}

export type PlantManagedOeeWindowMetrics = {
  plannedMinutes: number
  downtimeMinutes: number
  runtimeMinutes: number
  idealUnitsPerHour: number
  expectedUnitsAtRuntime: number
  goodUnits: number
  scrapUnits: number
  totalUnits: number
  availabilityRate: number
  performanceRate: number
  qualityRate: number
  oeeRate: number
}

export type PlantManagedOeeWindowEvidence = {
  windowId: string
  jobId: string
  machineId: string
  shiftRef: string
  startedAt: string
  endedAt: string
  sourceRevision: number
  shiftSourceDigest: string | null
  operatorReviewDigest: string | null
  supervisorReviewDigest: string | null
}

export type PlantManagedOeeWindow = {
  contract: typeof PLANT_MANAGED_OEE_WINDOW_CONTRACT
  readyForManagedRehearsal: boolean
  blockingCount: number
  gates: PlantManagedOeeWindowGate[]
  metrics: PlantManagedOeeWindowMetrics
  evidence: PlantManagedOeeWindowEvidence
  windowDigest: string
}

const digestPattern = /^sha256:[0-9a-f]{64}$/i

function safeTimestamp(value: string) {
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

function boundedRate(numerator: number, denominator: number) {
  if (!(denominator > 0) || !(numerator > 0)) return 0
  return Math.min(100, Math.round((numerator / denominator) * 100))
}

function findShiftClose(events: ProductionEvent[], shiftRef: string) {
  return events
    .filter((event) => event.kind === 'shift_closed' && event.subjectId === shiftRef)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
}

function eventWithin(event: ProductionEvent, startedAt: number, endedAt: number) {
  const createdAt = safeTimestamp(event.createdAt)
  return createdAt !== null && createdAt >= startedAt && createdAt <= endedAt
}

function pairedDowntimeMinutes(events: ProductionEvent[], machineId: string, startedAt: number, endedAt: number) {
  const starts = new Map<string, ProductionEvent>()
  let activeDowntimeCount = 0
  let completedIntervals = 0
  let totalDowntimeMinutes = 0

  for (const event of events) {
    if (event.kind !== 'downtime_started' || event.subjectId !== machineId || !eventWithin(event, startedAt, endedAt)) continue
    starts.set(event.actionId, event)
    activeDowntimeCount++
  }

  for (const event of events) {
    if (event.kind !== 'downtime_ended' || event.subjectId !== machineId || !event.downtimeStartActionId || !eventWithin(event, startedAt, endedAt)) continue
    const start = starts.get(event.downtimeStartActionId)
    if (!start) continue
    const startAt = safeTimestamp(start.createdAt)
    const endAt = safeTimestamp(event.createdAt)
    if (startAt === null || endAt === null || endAt < startAt) continue
    starts.delete(event.downtimeStartActionId)
    activeDowntimeCount--
    completedIntervals++
    totalDowntimeMinutes += Math.round((endAt - startAt) / 60000)
  }

  return {
    activeDowntimeCount,
    completedIntervals,
    totalDowntimeMinutes,
  }
}

function jobLinkedToShift(job: ProductionJob | undefined, events: ProductionEvent[], shiftRef: string) {
  if (!job) return false
  if (job.closure?.shiftRef === shiftRef) return true
  return events.some((event) => (
    event.subjectId === job.id
    && event.shiftRef === shiftRef
    && (event.kind === 'output_recorded' || event.kind === 'job_closed')
  ))
}

function reviewDigest(value: string | undefined) {
  return value && digestPattern.test(value) ? value.toLowerCase() : null
}

export function projectPlantManagedOeeWindow(
  production: ProductionState,
  input: PlantManagedOeeWindowInput,
): PlantManagedOeeWindow {
  const startedAt = safeTimestamp(input.startedAt)
  const endedAt = safeTimestamp(input.endedAt)
  const windowTimeValid = startedAt !== null && endedAt !== null && endedAt > startedAt
  const plannedMinutes = windowTimeValid ? Math.round(((endedAt as number) - (startedAt as number)) / 60000) : 0
  const job = production.jobs.find((candidate) => candidate.id === input.jobId)
  const machine = production.machines.find((candidate) => candidate.id === input.machineId)
  const shiftClose = findShiftClose(production.events, input.shiftRef)
  const shiftCloseInsideWindow = !!shiftClose && windowTimeValid && eventWithin(shiftClose, startedAt as number, endedAt as number)
  const linkedToShift = jobLinkedToShift(job, production.events, input.shiftRef)
  const downtime = windowTimeValid
    ? pairedDowntimeMinutes(production.events, input.machineId, startedAt as number, endedAt as number)
    : { activeDowntimeCount: 0, completedIntervals: 0, totalDowntimeMinutes: 0 }

  const runtimeMinutes = Math.max(0, plannedMinutes - downtime.totalDowntimeMinutes)
  const goodUnits = typeof shiftClose?.goodUnits === 'number' ? shiftClose.goodUnits : 0
  const scrapUnits = typeof shiftClose?.scrapUnits === 'number' ? shiftClose.scrapUnits : 0
  const totalUnits = goodUnits + scrapUnits
  const expectedUnitsAtRuntime = input.idealUnitsPerHour > 0
    ? Math.round((input.idealUnitsPerHour * runtimeMinutes) / 60)
    : 0
  const operatorReviewDigest = reviewDigest(input.operatorReviewDigest)
  const supervisorReviewDigest = reviewDigest(input.supervisorReviewDigest)

  const gates: PlantManagedOeeWindowGate[] = [
    {
      id: 'window_time_valid',
      passed: windowTimeValid,
      reason: windowTimeValid ? 'Window start/end timestamps are valid.' : 'Window must have valid start/end timestamps and end after start.',
    },
    {
      id: 'job_present',
      passed: !!job,
      reason: job ? 'Referenced job is present.' : 'Referenced job is missing.',
    },
    {
      id: 'machine_present',
      passed: !!machine,
      reason: machine ? 'Referenced machine is present.' : 'Referenced machine is missing.',
    },
    {
      id: 'shift_close_present',
      passed: !!shiftClose,
      reason: shiftClose ? 'Shift close event is present.' : 'Shift close event is missing.',
    },
    {
      id: 'shift_close_inside_window',
      passed: shiftCloseInsideWindow,
      reason: shiftCloseInsideWindow ? 'Shift close event is inside the reviewed window.' : 'Shift close event is missing or outside the reviewed window.',
    },
    {
      id: 'job_shift_linked',
      passed: linkedToShift,
      reason: linkedToShift
        ? 'Job is linked to the reviewed shift.'
        : 'Job is not linked to the reviewed shift by closure or output event.',
    },
    {
      id: 'ideal_rate_present',
      passed: input.idealUnitsPerHour > 0,
      reason: input.idealUnitsPerHour > 0 ? 'Ideal rate is present.' : 'Ideal units per hour must be greater than zero.',
    },
    {
      id: 'downtime_pairs_closed',
      passed: downtime.activeDowntimeCount === 0,
      reason: downtime.activeDowntimeCount === 0 ? 'All downtime starts in the window are closed.' : 'One or more downtime starts remain open.',
    },
    {
      id: 'machine_not_stopped',
      passed: !!machine && machine.state !== 'stopped',
      reason: machine && machine.state !== 'stopped' ? 'Machine is not stopped at projection time.' : 'Machine is stopped or missing at projection time.',
    },
    {
      id: 'operator_review_digest_present',
      passed: !!operatorReviewDigest,
      reason: operatorReviewDigest ? 'Operator review digest is present.' : 'Operator review digest is missing or not a sha256 digest.',
    },
    {
      id: 'supervisor_review_digest_present',
      passed: !!supervisorReviewDigest,
      reason: supervisorReviewDigest ? 'Supervisor review digest is present.' : 'Supervisor review digest is missing or not a sha256 digest.',
    },
    {
      id: 'independent_review_digests',
      passed: !!operatorReviewDigest && !!supervisorReviewDigest && operatorReviewDigest !== supervisorReviewDigest,
      reason: operatorReviewDigest && supervisorReviewDigest && operatorReviewDigest !== supervisorReviewDigest
        ? 'Operator and supervisor reviews are independently digested.'
        : 'Operator and supervisor review digests must both be present and different.',
    },
  ]

  const metrics: PlantManagedOeeWindowMetrics = {
    plannedMinutes,
    downtimeMinutes: downtime.totalDowntimeMinutes,
    runtimeMinutes,
    idealUnitsPerHour: input.idealUnitsPerHour,
    expectedUnitsAtRuntime,
    goodUnits,
    scrapUnits,
    totalUnits,
    availabilityRate: boundedRate(runtimeMinutes, plannedMinutes),
    performanceRate: boundedRate(totalUnits, expectedUnitsAtRuntime),
    qualityRate: boundedRate(goodUnits, totalUnits),
    oeeRate: 0,
  }
  metrics.oeeRate = Math.round((metrics.availabilityRate * metrics.performanceRate * metrics.qualityRate) / 10000)

  const evidence: PlantManagedOeeWindowEvidence = {
    windowId: input.windowId,
    jobId: input.jobId,
    machineId: input.machineId,
    shiftRef: input.shiftRef,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    sourceRevision: production.revision,
    shiftSourceDigest: typeof shiftClose?.sourceDigest === 'string' ? shiftClose.sourceDigest : null,
    operatorReviewDigest,
    supervisorReviewDigest,
  }
  const blockingCount = gates.filter((gate) => !gate.passed).length
  const projection = {
    contract: PLANT_MANAGED_OEE_WINDOW_CONTRACT,
    evidence,
    metrics,
    gates: gates.map((gate) => ({ id: gate.id, passed: gate.passed })),
  }

  return {
    contract: PLANT_MANAGED_OEE_WINDOW_CONTRACT,
    readyForManagedRehearsal: blockingCount === 0,
    blockingCount,
    gates,
    metrics,
    evidence,
    windowDigest: `sha256:${sha256Hex(JSON.stringify(projection))}`,
  }
}
