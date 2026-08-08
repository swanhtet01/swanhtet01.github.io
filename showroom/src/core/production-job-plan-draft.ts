import type { ProductionJob, ProductionJobPriority } from './production-workspace.ts'

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
