import type { ProductionJobPriority } from './production-workspace'

export type LocalPlantJobRequestDraft = {
  schema_version: 'supermega.plant.job-request-draft.v1'
  status: 'ready_for_review' | 'needs_clarification'
  job_id: string
  line: string | null
  product: string | null
  target: number | null
  owner: string | null
  priority: ProductionJobPriority
  due_at: string | null
}

export class LocalPlantJobRequestError extends Error {
  code: string
  constructor(code: string) { super(code); this.code = code }
}

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const bounded = (value: unknown, limit: number) => value === null || (typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= limit)

function validDraft(value: unknown): value is LocalPlantJobRequestDraft {
  if (!record(value)) return false
  return value.schema_version === 'supermega.plant.job-request-draft.v1'
    && ['ready_for_review', 'needs_clarification'].includes(String(value.status))
    && /^JOB-AI-[0-9A-F]{10}$/.test(String(value.job_id))
    && bounded(value.line, 120) && bounded(value.product, 180) && bounded(value.owner, 120)
    && (value.target === null || (Number.isSafeInteger(value.target) && Number(value.target) > 0))
    && ['urgent', 'normal', 'low'].includes(String(value.priority))
    && (value.due_at === null || (typeof value.due_at === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value.due_at)))
}

export async function prepareLocalPlantJobRequest(sourceText: string) {
  const requestText = sourceText.trim()
  if (requestText.length < 20 || requestText.length > 1_800) throw new LocalPlantJobRequestError('local_plant_job_request_invalid')
  const response = await fetch('/api/local/v1/plant/job-request-drafts', {
    method: 'POST',
    body: JSON.stringify({ source_label: 'plant-job-request', request_text: requestText }),
    cache: 'no-store',
    credentials: 'omit',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'x-supermega-local-review': 'plant-job-request-v1' },
    redirect: 'error',
  })
  if (!response.ok) throw new LocalPlantJobRequestError(response.status === 404
    ? 'local_plant_job_request_unavailable'
    : response.status === 422 ? 'local_plant_job_request_invalid' : 'local_plant_job_request_failed')
  const body: unknown = await response.json()
  if (!record(body)
    || body.raw_request_retained !== false
    || body.jobs_created !== 0
    || body.schedule_changes_performed !== 0
    || body.material_actions_performed !== 0
    || body.equipment_actions_performed !== 0
    || body.external_writes_performed !== false
    || !validDraft(body.draft)) throw new LocalPlantJobRequestError('local_plant_job_request_response_invalid')
  return body.draft
}
