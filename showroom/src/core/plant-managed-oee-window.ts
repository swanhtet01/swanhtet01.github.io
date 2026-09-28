import { sha256Hex } from './managed-trial-proof.ts'
import type { ProductionEvent, ProductionJob, ProductionState } from './production-workspace.ts'

export const PLANT_MANAGED_OEE_WINDOW_CONTRACT = 'supermega.plant-managed-oee-window.v1' as const
export const PLANT_MANAGED_OEE_SOURCE_MAP_CONTRACT = 'supermega.plant-managed-oee-source-map.v1' as const

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
  | 'source_quantity_mapping_unambiguous'
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
  sourceMapDigest: string
  operatorReviewDigest: string | null
  supervisorReviewDigest: string | null
}

export type PlantManagedOeeSourceTrust = {
  contract: typeof PLANT_MANAGED_OEE_SOURCE_MAP_CONTRACT
  sourceMapDigest: string
  passed: boolean
  canonicalQuantityFields: string[]
  supportingCountFields: string[]
  rejectedQuantityLikeFields: string[]
  reason: string
}

export type PlantManagedOeeWindow = {
  contract: typeof PLANT_MANAGED_OEE_WINDOW_CONTRACT
  readyForManagedRehearsal: boolean
  blockingCount: number
  gates: PlantManagedOeeWindowGate[]
  metrics: PlantManagedOeeWindowMetrics
  evidence: PlantManagedOeeWindowEvidence
  sourceTrust: PlantManagedOeeSourceTrust
  windowDigest: string
}

const digestPattern = /^sha256:[0-9a-f]{64}$/i
const sourceQuantityFieldPattern = /(?:quantity|qty|units?|output|scrap|good|count|reject|waste)/i
const plantManagedOeeSourceMap = {
  contract: PLANT_MANAGED_OEE_SOURCE_MAP_CONTRACT,
  windowUnitSourceEventKind: 'output_recorded',
  windowUnitFields: ['quantity', 'outputKind'],
  windowScopeFields: ['createdAt', 'subjectId', 'shiftRef'],
  reconciliationEventKind: 'shift_closed',
  canonicalQuantityFields: ['goodUnits', 'scrapUnits'],
  supportingCountFields: ['outputEntryCount', 'materialEntryCount'],
  rejectedQuantityLikeFieldPolicy: 'any non-canonical quantity-like field on window output or shift-close evidence blocks managed OEE readiness',
}
const plantManagedOeeSourceMapDigest = `sha256:${sha256Hex(JSON.stringify(plantManagedOeeSourceMap))}`

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
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.actionId.localeCompare(a.actionId))[0]
}

function eventWithin(event: ProductionEvent, startedAt: number, endedAt: number) {
  const createdAt = safeTimestamp(event.createdAt)
  return createdAt !== null && createdAt >= startedAt && createdAt <= endedAt
}

function pairedDowntimeMinutes(events: ProductionEvent[], machineId: string, startedAt: number, endedAt: number) {
  const starts = new Map<string, number>()
  const ends = new Map<string, number>()
  const seenActionIds = new Set<string>()
  const intervals: Array<{ startedAt: number; endedAt: number }> = []
  let activeDowntimeCount = 0
  let completedIntervals = 0
  let invalidEvidenceCount = 0
  let totalDowntimeMilliseconds = 0

  for (const event of events) {
    if (event.subjectId !== machineId || (event.kind !== 'downtime_started' && event.kind !== 'downtime_ended')) continue
    const createdAt = safeTimestamp(event.createdAt)
    if (createdAt === null) {
      invalidEvidenceCount++
      continue
    }
    if (!event.actionId || seenActionIds.has(event.actionId)) {
      invalidEvidenceCount++
      continue
    }
    seenActionIds.add(event.actionId)
    if (event.kind === 'downtime_started') {
      starts.set(event.actionId, createdAt)
      continue
    }
    const startActionId = event.downtimeStartActionId
    if (!startActionId || ends.has(startActionId)) invalidEvidenceCount++
    else ends.set(startActionId, createdAt)
  }

  for (const [startActionId, ended] of ends) {
    const started = starts.get(startActionId)
    if (started === undefined || ended < started) {
      invalidEvidenceCount++
      continue
    }
    intervals.push({ startedAt: started, endedAt: ended })
  }

  for (const [startActionId, started] of starts) {
    if (!ends.has(startActionId) && started <= endedAt) activeDowntimeCount++
  }

  let previousRelevantEnd: number | null = null
  for (const interval of intervals.sort((left, right) => left.startedAt - right.startedAt || left.endedAt - right.endedAt)) {
    const overlapStartedAt = Math.max(startedAt, interval.startedAt)
    const overlapEndedAt = Math.min(endedAt, interval.endedAt)
    if (overlapEndedAt <= overlapStartedAt) continue
    if (previousRelevantEnd !== null && interval.startedAt < previousRelevantEnd) invalidEvidenceCount++
    previousRelevantEnd = Math.max(previousRelevantEnd ?? interval.endedAt, interval.endedAt)
    completedIntervals++
    totalDowntimeMilliseconds += overlapEndedAt - overlapStartedAt
  }

  return {
    activeDowntimeCount,
    completedIntervals,
    invalidEvidenceCount,
    evidenceValid: activeDowntimeCount === 0 && invalidEvidenceCount === 0,
    totalDowntimeMinutes: Math.round(totalDowntimeMilliseconds / 60000),
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

type PlantManagedOeeWindowOutput = {
  passed: boolean
  goodUnits: number
  scrapUnits: number
  eventCount: number
  rejectedQuantityLikeFields: string[]
  reason: string
}

function outputUnitsInsideWindow(
  events: ProductionEvent[],
  jobId: string,
  shiftRef: string,
  startedAt: number,
  endedAt: number,
  shiftClose: ProductionEvent | undefined,
): PlantManagedOeeWindowOutput {
  const allowedQuantityLikeFields = new Set(plantManagedOeeSourceMap.windowUnitFields)
  const rejectedQuantityLikeFields = new Set<string>()
  const seenActionIds = new Set<string>()
  const shiftCloseAt = shiftClose ? safeTimestamp(shiftClose.createdAt) : null
  let goodUnits = 0
  let scrapUnits = 0
  let eventCount = 0
  let invalidEvidenceCount = 0

  for (const event of events) {
    if (event.kind !== 'output_recorded' || event.subjectId !== jobId) continue
    const createdAt = safeTimestamp(event.createdAt)
    if (event.shiftRef === undefined) {
      if (createdAt === null || (createdAt >= startedAt && createdAt <= endedAt)) invalidEvidenceCount++
      continue
    }
    if (event.shiftRef !== shiftRef) continue
    if (createdAt === null) {
      invalidEvidenceCount++
      continue
    }
    if (createdAt < startedAt || createdAt > endedAt) continue

    const source = event as unknown as Record<string, unknown>
    for (const field of Object.keys(source)) {
      if (sourceQuantityFieldPattern.test(field) && !allowedQuantityLikeFields.has(field)) {
        rejectedQuantityLikeFields.add(field)
      }
    }
    const outputKind = event.outputKind ?? 'good'
    const quantity = event.quantity
    if (!event.actionId
      || seenActionIds.has(event.actionId)
      || !Number.isSafeInteger(quantity)
      || !(Number(quantity) > 0)
      || (outputKind !== 'good' && outputKind !== 'scrap')
      || shiftCloseAt === null
      || createdAt > shiftCloseAt) {
      invalidEvidenceCount++
      continue
    }
    seenActionIds.add(event.actionId)
    if (outputKind === 'scrap') scrapUnits += Number(quantity)
    else goodUnits += Number(quantity)
    eventCount++
    if (!Number.isSafeInteger(goodUnits) || !Number.isSafeInteger(scrapUnits)) invalidEvidenceCount++
  }

  const reconcilesWithShiftClose = !!shiftClose
    && shiftClose.shiftRef === shiftRef
    && typeof shiftClose.goodUnits === 'number'
    && typeof shiftClose.scrapUnits === 'number'
    && typeof shiftClose.outputEntryCount === 'number'
    && goodUnits <= shiftClose.goodUnits
    && scrapUnits <= shiftClose.scrapUnits
    && eventCount <= shiftClose.outputEntryCount
  if (!reconcilesWithShiftClose) invalidEvidenceCount++
  const rejectedFields = [...rejectedQuantityLikeFields].sort()
  if (eventCount === 0) invalidEvidenceCount++
  const passed = invalidEvidenceCount === 0 && rejectedFields.length === 0
  return {
    passed,
    goodUnits,
    scrapUnits,
    eventCount,
    rejectedQuantityLikeFields: rejectedFields,
    reason: passed
      ? 'Window units use only in-window job output records reconciled within the digest-bound shift close.'
      : rejectedFields.length > 0
        ? `Window output has unreviewed quantity-like fields: ${rejectedFields.join(', ')}.`
        : 'Window output evidence is missing, unbound, malformed, duplicated, post-close, or does not reconcile with the shift close.',
  }
}

function sourceTrustForShiftClose(shiftClose: ProductionEvent | undefined): PlantManagedOeeSourceTrust {
  const canonicalQuantityFields = [...plantManagedOeeSourceMap.canonicalQuantityFields]
  const supportingCountFields = [...plantManagedOeeSourceMap.supportingCountFields]
  const allowed = new Set([...canonicalQuantityFields, ...supportingCountFields])
  if (!shiftClose) {
    return {
      contract: PLANT_MANAGED_OEE_SOURCE_MAP_CONTRACT,
      sourceMapDigest: plantManagedOeeSourceMapDigest,
      passed: false,
      canonicalQuantityFields,
      supportingCountFields,
      rejectedQuantityLikeFields: [],
      reason: 'Shift close source is missing, so unit mapping is not trusted.',
    }
  }

  const source = shiftClose as unknown as Record<string, unknown>
  const rejectedQuantityLikeFields = Object.keys(source)
    .filter((field) => sourceQuantityFieldPattern.test(field) && !allowed.has(field))
    .sort()
  const hasCanonicalUnits = canonicalQuantityFields.every((field) => (
    typeof source[field] === 'number'
    && Number.isFinite(source[field])
    && (source[field] as number) >= 0
  ))
  const hasSupportingCounts = supportingCountFields.every((field) => (
    typeof source[field] === 'number'
    && Number.isFinite(source[field])
    && (source[field] as number) >= 0
  ))
  const passed = hasCanonicalUnits && hasSupportingCounts && rejectedQuantityLikeFields.length === 0
  return {
    contract: PLANT_MANAGED_OEE_SOURCE_MAP_CONTRACT,
    sourceMapDigest: plantManagedOeeSourceMapDigest,
    passed,
    canonicalQuantityFields,
    supportingCountFields,
    rejectedQuantityLikeFields,
    reason: passed
      ? 'Shift close unit mapping uses only digest-bound canonical fields.'
      : rejectedQuantityLikeFields.length > 0
        ? `Shift close has unreviewed quantity-like fields: ${rejectedQuantityLikeFields.join(', ')}.`
        : 'Shift close is missing canonical unit or supporting count fields.',
  }
}

function sourceTrustForWindow(
  shiftClose: ProductionEvent | undefined,
  windowOutput: PlantManagedOeeWindowOutput,
): PlantManagedOeeSourceTrust {
  const shiftCloseTrust = sourceTrustForShiftClose(shiftClose)
  const rejectedQuantityLikeFields = [...new Set([
    ...shiftCloseTrust.rejectedQuantityLikeFields,
    ...windowOutput.rejectedQuantityLikeFields,
  ])].sort()
  const passed = shiftCloseTrust.passed && windowOutput.passed
  return {
    ...shiftCloseTrust,
    passed,
    rejectedQuantityLikeFields,
    reason: passed
      ? windowOutput.reason
      : !shiftCloseTrust.passed
        ? shiftCloseTrust.reason
        : windowOutput.reason,
  }
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
    : { activeDowntimeCount: 0, completedIntervals: 0, invalidEvidenceCount: 1, evidenceValid: false, totalDowntimeMinutes: 0 }
  const windowOutput = windowTimeValid
    ? outputUnitsInsideWindow(production.events, input.jobId, input.shiftRef, startedAt as number, endedAt as number, shiftClose)
    : {
        passed: false,
        goodUnits: 0,
        scrapUnits: 0,
        eventCount: 0,
        rejectedQuantityLikeFields: [],
        reason: 'Window output cannot be trusted until the reviewed time window is valid.',
      }
  const sourceTrust = sourceTrustForWindow(shiftClose, windowOutput)

  const runtimeMinutes = Math.max(0, plannedMinutes - downtime.totalDowntimeMinutes)
  const goodUnits = sourceTrust.passed ? windowOutput.goodUnits : 0
  const scrapUnits = sourceTrust.passed ? windowOutput.scrapUnits : 0
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
      id: 'source_quantity_mapping_unambiguous',
      passed: sourceTrust.passed,
      reason: sourceTrust.reason,
    },
    {
      id: 'ideal_rate_present',
      passed: input.idealUnitsPerHour > 0,
      reason: input.idealUnitsPerHour > 0 ? 'Ideal rate is present.' : 'Ideal units per hour must be greater than zero.',
    },
    {
      id: 'downtime_pairs_closed',
      passed: downtime.evidenceValid,
      reason: downtime.evidenceValid
        ? 'All downtime intervals that can intersect the window are complete and clipped to the reviewed window.'
        : 'Downtime evidence is malformed, overlapping, or unclosed for the reviewed window.',
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
    sourceMapDigest: sourceTrust.sourceMapDigest,
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
    sourceTrust,
    windowDigest: `sha256:${sha256Hex(JSON.stringify(projection))}`,
  }
}
