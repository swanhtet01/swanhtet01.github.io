export const PRODUCTION_WORKSPACE_SCHEMA = 'supermega.production.workspace.v2' as const
export const PRODUCTION_KEY = 'supermega.production.workspace.v2'
export const LEGACY_PRODUCTION_KEYS = ['supermega.production.workspace.v1', 'supermega.plant.workspace.v2']
export const PRODUCTION_LOCK = 'supermega-production-workspace-v2'

export type ProductionIssueKind = 'quality' | 'maintenance' | 'materials' | 'operations'
export type ProductionMachineState = 'running' | 'attention' | 'stopped'

export type ProductionJob = {
  id: string
  line: string
  product: string
  target: number
  output: number
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
  resolution?: ProductionIssueResolution
}

export type ProductionMachine = {
  id: string
  name: string
  state: ProductionMachineState
}

export type ProductionEventKind = 'job_created' | 'output_recorded' | 'issue_opened' | 'issue_resolved' | 'machine_state_changed'

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
  fromState?: ProductionMachineState
  toState?: ProductionMachineState
}

export type ProductionState = {
  schema: typeof PRODUCTION_WORKSPACE_SCHEMA
  revision: number
  jobs: ProductionJob[]
  issues: ProductionIssue[]
  machines: ProductionMachine[]
  events: ProductionEvent[]
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

const issueKinds: ProductionIssueKind[] = ['quality', 'maintenance', 'materials', 'operations']
export const productionMachineStates: ProductionMachineState[] = ['running', 'attention', 'stopped']
const eventKinds: ProductionEventKind[] = ['job_created', 'output_recorded', 'issue_opened', 'issue_resolved', 'machine_state_changed']
const deterministicSeedNow = Date.parse('2026-07-23T08:00:00.000Z')

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
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

function validTimestamp(value: unknown) {
  return typeof value === 'string'
    && value === value.trim()
    && /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value))
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
      { id: 'JOB-201', line: 'Line 01', product: 'Batch Alpha', target: 1200, output: 860 },
      { id: 'JOB-202', line: 'Line 02', product: 'Batch Beta', target: 900, output: 745 },
      { id: 'JOB-203', line: 'Line 03', product: 'Batch Gamma', target: 650, output: 650 },
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

  for (const [index, candidate] of jobs.entries()) {
    if (!isRecord(candidate)) throw new Error(`jobs[${index}] is invalid.`)
    jobIds.push(canonicalText(candidate.id, `jobs[${index}].id`, 80))
    canonicalText(candidate.line, `jobs[${index}].line`, 120)
    canonicalText(candidate.product, `jobs[${index}].product`)
    assertSafeInteger(candidate.target, `jobs[${index}].target`, 1)
    assertSafeInteger(candidate.output, `jobs[${index}].output`)
    if (Number(candidate.output) > Number(candidate.target)) throw new Error(`jobs[${index}].output exceeds target.`)
  }
  assertUnique(jobIds, 'Production job ID')

  for (const [index, candidate] of issues.entries()) {
    if (!isRecord(candidate)) throw new Error(`issues[${index}] is invalid.`)
    issueIds.push(canonicalText(candidate.id, `issues[${index}].id`, 80))
    if (!validTimestamp(candidate.createdAt)) throw new Error(`issues[${index}].createdAt is invalid.`)
    canonicalText(candidate.area, `issues[${index}].area`, 120)
    canonicalText(candidate.summary, `issues[${index}].summary`, 240)
    if (!issueKinds.includes(candidate.kind as ProductionIssueKind)) throw new Error(`issues[${index}].kind is invalid.`)
    if (candidate.status !== 'open' && candidate.status !== 'resolved') throw new Error(`issues[${index}].status is invalid.`)
    if (candidate.status === 'open' && candidate.resolution !== undefined) throw new Error(`issues[${index}] is open but has resolution evidence.`)
    if (candidate.resolution !== undefined) {
      if (!isRecord(candidate.resolution)) throw new Error(`issues[${index}].resolution is invalid.`)
      const resolution = candidate.resolution
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
    machineIds.push(canonicalText(candidate.id, `machines[${index}].id`, 80))
    canonicalText(candidate.name, `machines[${index}].name`)
    if (!productionMachineStates.includes(candidate.state as ProductionMachineState)) throw new Error(`machines[${index}].state is invalid.`)
  }
  assertUnique(machineIds, 'Production machine ID')

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
    if (candidate.kind === 'job_created') {
      if (!jobIds.includes(candidate.subjectId as string)) throw new Error(`events[${index}] references an unknown job.`)
      if (candidate.quantity !== undefined || candidate.fromState !== undefined || candidate.toState !== undefined) throw new Error(`events[${index}] job event has unrelated fields.`)
    } else if (candidate.kind === 'output_recorded') {
      if (!jobIds.includes(candidate.subjectId as string)) throw new Error(`events[${index}] references an unknown job.`)
      assertSafeInteger(candidate.quantity, `events[${index}].quantity`, 1)
      if (candidate.fromState !== undefined || candidate.toState !== undefined) throw new Error(`events[${index}] output event has machine state fields.`)
    } else if (candidate.kind === 'machine_state_changed') {
      if (!machineIds.includes(candidate.subjectId as string)) throw new Error(`events[${index}] references an unknown machine.`)
      if (!productionMachineStates.includes(candidate.fromState as ProductionMachineState) || !productionMachineStates.includes(candidate.toState as ProductionMachineState)) throw new Error(`events[${index}] has invalid machine states.`)
      if (candidate.fromState === candidate.toState) throw new Error(`events[${index}] must record a distinct machine observation.`)
      if (candidate.quantity !== undefined) throw new Error(`events[${index}] machine event has a quantity.`)
    } else {
      if (!issueIds.includes(candidate.subjectId as string)) throw new Error(`events[${index}] references an unknown issue.`)
      if (candidate.quantity !== undefined || candidate.fromState !== undefined || candidate.toState !== undefined) throw new Error(`events[${index}] issue event has unrelated fields.`)
    }
  }
  assertUnique(eventIds, 'Production event ID')
  assertUnique(actionIds, 'Production action ID')
  if (Number(value.revision) !== events.length) throw new Error('Production revision must equal the append-only event count.')

  for (const [index, candidate] of issues.entries()) {
    if (!isRecord(candidate) || !isRecord(candidate.resolution)) continue
    const resolution = candidate.resolution
    const matchingEvents = events.filter((event) => isRecord(event) && event.kind === 'issue_resolved' && event.subjectId === candidate.id && event.actionId === resolution.actionId)
    if (matchingEvents.length !== 1) throw new Error(`issues[${index}] resolution is not backed by exactly one event.`)
  }
  for (const [index, candidate] of events.entries()) {
    if (!isRecord(candidate) || candidate.kind !== 'issue_resolved') continue
    const issue = issues.find((value) => isRecord(value) && value.id === candidate.subjectId)
    if (!isRecord(issue) || issue.status !== 'resolved' || !isRecord(issue.resolution) || issue.resolution.actionId !== candidate.actionId) {
      throw new Error(`events[${index}] is not backed by matching issue resolution evidence.`)
    }
  }
  for (const jobId of jobIds) {
    const job = jobs.find((candidate) => isRecord(candidate) && candidate.id === jobId)
    const recorded = events.reduce<number>((total, candidate) => {
      if (!isRecord(candidate) || candidate.kind !== 'output_recorded' || candidate.subjectId !== jobId) return total
      return total + Number(candidate.quantity)
    }, 0)
    if (!isRecord(job) || recorded > Number(job.output)) throw new Error(`Output events exceed the stored output for ${jobId}.`)
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
  return value as ProductionState
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

export function registerProductionJob(state: ProductionState, job: ProductionJob, proof: ProductionActionProof) {
  if (!validProof(proof)
    || !isRecord(job)
    || !validCanonicalText(job.id, 80)
    || !validCanonicalText(job.line, 120)
    || !validCanonicalText(job.product)
    || !Number.isSafeInteger(job.target)
    || job.target < 1
    || job.output !== 0) return null
  const existing = state.events.find((event) => event.actionId === proof.actionId)
  if (existing) {
    const storedJob = state.jobs.find((candidate) => candidate.id === job.id)
    return existing.kind === 'job_created'
      && existing.subjectId === job.id
      && sameProof(existing, proof)
      && JSON.stringify(storedJob) === JSON.stringify(job) ? state : null
  }
  if (actionIdIsUsed(state, proof.actionId) || state.jobs.some((candidate) => candidate.id === job.id) || state.revision >= Number.MAX_SAFE_INTEGER) return null
  const event = eventFor(proof, { kind: 'job_created', subjectId: job.id, summary: `Created ${job.product} job for ${job.line}` })
  return validateProductionState({
    ...state,
    revision: state.revision + 1,
    jobs: [job, ...state.jobs],
    events: [event, ...state.events],
  })
}

export function recordProductionOutput(state: ProductionState, jobId: string, quantity: number, proof: ProductionActionProof) {
  if (!validProof(proof) || !Number.isSafeInteger(quantity) || quantity < 1) return null
  const existing = state.events.find((event) => event.actionId === proof.actionId)
  if (existing) return existing.kind === 'output_recorded' && existing.subjectId === jobId && existing.quantity === quantity && sameProof(existing, proof) ? state : null
  if (actionIdIsUsed(state, proof.actionId)) return null
  const matchingJobs = state.jobs.filter((job) => job.id === jobId)
  const job = matchingJobs.length === 1 ? matchingJobs[0] : undefined
  if (!job) return null
  const nextOutput = job.output + quantity
  if (!Number.isSafeInteger(nextOutput) || nextOutput > job.target || state.revision >= Number.MAX_SAFE_INTEGER) return null
  const event = eventFor(proof, { kind: 'output_recorded', subjectId: jobId, summary: `Recorded ${quantity} good units`, quantity })
  return validateProductionState({
    ...state,
    revision: state.revision + 1,
    jobs: state.jobs.map((candidate) => candidate.id === jobId ? { ...candidate, output: nextOutput } : candidate),
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
    || !issueKinds.includes(issue.kind)) return null
  const existing = state.events.find((event) => event.actionId === proof.actionId)
  if (existing) {
    const storedIssue = state.issues.find((candidate) => candidate.id === issue.id)
    return existing.kind === 'issue_opened' && existing.subjectId === issue.id && sameProof(existing, proof) && JSON.stringify(storedIssue) === JSON.stringify(issue) ? state : null
  }
  if (actionIdIsUsed(state, proof.actionId) || state.issues.some((candidate) => candidate.id === issue.id) || state.revision >= Number.MAX_SAFE_INTEGER) return null
  const event = eventFor(proof, { kind: 'issue_opened', subjectId: issue.id, summary: `Opened ${issue.kind} issue for ${issue.area}` })
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
      && issue.resolution?.actionId === proof.actionId ? state : null
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
