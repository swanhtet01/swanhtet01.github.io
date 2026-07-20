const datastore = require('./lib/supermega-datastore')
const blobQueue = require('./lib/supermega-blob-queue')

function text(value) {
  return String(value || '').trim()
}

function truncate(value, max = 500) {
  return text(value).slice(0, max)
}

function parseJsonObject(value) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(String(value))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function json(res, code, payload) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(JSON.stringify(payload))
}

async function readBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > 80_000) throw new Error('request_too_large')
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('invalid_json')
  }
}

function normalizeSource(source = {}, index = 0) {
  const content = truncate(source.content || source.content_excerpt || source.text || source.sample, 4000)
  const reference = truncate(source.reference || source.label || source.name || `source ${index + 1}`, 240)
  return {
    source_id: truncate(source.source_id || `SRC-${String(index + 1).padStart(2, '0')}`, 40),
    source_type: truncate(source.source_type || source.type || 'manual_note', 80),
    label: truncate(source.label || reference, 120),
    reference,
    content,
    approved: source.approved !== false,
  }
}

function normalizeSourcePackSubmission(payload = {}) {
  const pack = parseJsonObject(payload.source_pack_json || payload.source_pack || payload)
  const leadId = truncate(pack.lead_id || payload.lead_id, 80)
  const actionId = truncate(pack.action_id || payload.action_id, 80)
  if (!leadId || !actionId) return { status: 'error', reason: 'missing_action_or_lead_id' }

  const rawSources = list(pack.sources).length ? list(pack.sources) : list(payload.sources)
  const sources = rawSources
    .slice(0, 5)
    .map(normalizeSource)
    .filter((source) => source.approved && (source.reference || source.content))
  const sourcesWithContent = sources.filter((source) => source.content)
  if (!sourcesWithContent.length) return { status: 'error', reason: 'missing_source_pack_sources' }
  const totalContentLength = sourcesWithContent.reduce((sum, source) => sum + source.content.length, 0)
  if (totalContentLength > 18_000) return { status: 'error', reason: 'source_pack_too_large' }

  return {
    status: 'client_source_pack_submitted',
    submission_type: 'client_source_pack',
    lead_id: leadId,
    action_id: actionId,
    source_pack_name: truncate(pack.source_pack_name || payload.source_pack_name || 'Client approved first-proof source pack', 160),
    approval_scope: 'first_proof_only',
    source_count: sourcesWithContent.length,
    sources: sourcesWithContent,
    human_gate: 'owner approval before send/write/payment/browser actions',
    external_action_state: 'blocked_until_owner_approval',
    connector_write_state: 'blocked_until_owner_approval',
    browser_action_state: 'blocked_until_owner_approval',
    payment_request_state: 'blocked_until_owner_approval',
    real_mrr_delta: 0,
    submitted_by: 'client_source_pack_room',
    submitted_at: new Date().toISOString(),
    guardrails: [
      'client_submission_only',
      'owner_review_required_before_first_proof',
      'no_external_send',
      'no_connector_write',
      'no_browser_action',
      'no_payment_request',
      'no_mrr_delta_without_payment_proof',
    ],
  }
}

function publicSubmissionResponse({ submission, action, adapter, primaryDatabase }) {
  return {
    status: 'ready',
    endpoint: 'source-pack-submissions',
    adapter: adapter || null,
    primary_database: primaryDatabase || null,
    submission_status: 'client_source_pack_received',
    action: {
      action_id: text(action.action_id || submission.action_id) || null,
      lead_id: text(action.lead_id || submission.lead_id) || null,
      status: text(action.status) || 'client_source_pack_received',
      approval_state: text(action.approval_state) || 'pending_source_review',
      notification_status: text(action.notification_status) || 'client_source_pack_received',
      next_step: text(action.next_step) || 'Review submitted source pack, attach it for first proof, then prepare first proof.',
    },
    source_pack_submission: {
      status: submission.status,
      submission_type: submission.submission_type,
      lead_id: submission.lead_id,
      action_id: submission.action_id,
      source_pack_name: submission.source_pack_name,
      approval_scope: submission.approval_scope,
      source_count: submission.source_count,
      external_action_state: submission.external_action_state,
      connector_write_state: submission.connector_write_state,
      browser_action_state: submission.browser_action_state,
      payment_request_state: submission.payment_request_state,
      real_mrr_delta: submission.real_mrr_delta,
      submitted_at: submission.submitted_at,
      guardrails: submission.guardrails,
    },
  }
}

let resultColumnCache = null
async function pipelineActionsResultColumnStatus() {
  if (resultColumnCache) return resultColumnCache
  const checked = await datastore.query(
    `
      select exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'supermega_pipeline_actions'
          and column_name = 'result'
      ) as has_result
    `,
  )
  if (checked.status !== 'ready') return checked
  const hasResult = checked.rows?.[0]?.has_result === true || checked.rows?.[0]?.has_result === 'true'
  resultColumnCache = { status: 'ready', has_result: hasResult }
  return resultColumnCache
}

async function recordBlobSubmission(submission, primaryDatabase = {}) {
  const found = await blobQueue.findActionRecord({ action_id: submission.action_id, lead_id: submission.lead_id })
  if (found.status !== 'ready') return { ...found, primary_database: primaryDatabase }
  const row = found.row
  const currentResult = parseJsonObject(row.result)
  const nextResult = {
    ...currentResult,
    client_source_pack_submission: submission,
    client_source_pack_submission_recorded_at: submission.submitted_at,
  }
  const updated = await blobQueue.updateActionRecord(
    { action_id: submission.action_id, lead_id: submission.lead_id },
    {
      result: nextResult,
      status: 'client_source_pack_received',
      approval_state: 'pending_source_review',
      next_step: 'Review submitted source pack, attach it for first proof, then prepare first proof.',
      notification_status: 'client_source_pack_received',
    },
  )
  if (updated.status !== 'ready') return { ...updated, primary_database: primaryDatabase }
  return publicSubmissionResponse({
    submission,
    action: updated.record,
    adapter: 'vercel_blob',
    primaryDatabase,
  })
}

async function recordSubmission(submission) {
  if (!datastore.postgresConfigured()) {
    return recordBlobSubmission(submission, { status: 'skipped', reason: 'postgres_not_configured' })
  }
  const resultColumn = await pipelineActionsResultColumnStatus()
  if (resultColumn.status !== 'ready') return recordBlobSubmission(submission, resultColumn)
  const resultSelect = resultColumn.has_result ? 'result' : "'{}'::jsonb as result"
  const selected = await datastore.query(
    `
      select id, action_id, lead_id, status, approval_state, notification_status, payload, ${resultSelect}, next_step
      from public.supermega_pipeline_actions
      where (($1 <> '' and action_id = $1) or ($1 = '' and $2 <> '' and lead_id = $2))
      order by created_at desc
      limit 1
    `,
    [submission.action_id, submission.lead_id],
  )
  if (selected.status !== 'ready') return recordBlobSubmission(submission, selected)
  if (!selected.rows.length) {
    const fallback = await recordBlobSubmission(submission, { status: 'error', reason: 'postgres_action_not_found' })
    if (fallback.status === 'ready') return fallback
    return { status: 'error', reason: 'action_not_found' }
  }

  const updateResultExpression = resultColumn.has_result
    ? "result = coalesce(result, '{}'::jsonb) || jsonb_build_object('client_source_pack_submission', $2::jsonb, 'client_source_pack_submission_recorded_at', $3::text),"
    : ''
  const returningResultExpression = resultColumn.has_result ? 'result' : "coalesce(payload, '{}'::jsonb) as result"
  const updated = await datastore.query(
    `
      update public.supermega_pipeline_actions
      set
        ${updateResultExpression}
        payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
          'client_source_pack_submission', $2::jsonb,
          'client_source_pack_submission_recorded_at', $3::text
        ),
        status = case
          when status in ('open', 'queued', 'processing', 'done', 'failed', 'source_request_approved', 'source_pack_request_ready', 'client_source_pack_received')
          then 'client_source_pack_received'
          else status
        end,
        approval_state = 'pending_source_review',
        notification_status = 'client_source_pack_received',
        next_step = 'Review submitted source pack, attach it for first proof, then prepare first proof.',
        updated_at = now()
      where id = $1
      returning action_id, lead_id, status, approval_state, notification_status, next_step, payload, ${returningResultExpression}
    `,
    [selected.rows[0].id, JSON.stringify(submission), submission.submitted_at],
  )
  if (updated.status !== 'ready') return recordBlobSubmission(submission, updated)
  if (!updated.rows.length) return { status: 'error', reason: 'action_not_found' }
  return publicSubmissionResponse({
    submission,
    action: updated.rows[0],
    adapter: 'vercel_postgres_neon',
  })
}

function writeStatusCode(result) {
  if (result.status === 'ready') return 200
  if (result.reason === 'action_not_found') return 404
  if (['missing_action_or_lead_id', 'missing_source_pack_sources', 'source_pack_too_large', 'invalid_json', 'request_too_large'].includes(result.reason)) return 400
  return 500
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }
  if (req.method === 'GET') {
    json(res, 200, {
      status: 'ready',
      endpoint: 'source-pack-submissions',
      method: 'POST',
      required_fields: ['lead_id', 'action_id', 'sources'],
      guardrails: ['no_external_send', 'no_connector_write', 'no_browser_action', 'no_payment_request', 'no_mrr_delta_without_payment_proof'],
    })
    return
  }
  if (req.method !== 'POST') {
    json(res, 405, { status: 'error', reason: 'method_not_allowed' })
    return
  }
  let payload
  try {
    payload = await readBody(req)
  } catch (error) {
    json(res, 400, { status: 'error', reason: error.message || 'invalid_request' })
    return
  }
  const submission = normalizeSourcePackSubmission(payload)
  if (submission.status === 'error') {
    json(res, writeStatusCode(submission), submission)
    return
  }
  const recorded = await recordSubmission(submission)
  json(res, writeStatusCode(recorded), recorded)
}

handler.__test = {
  normalizeSourcePackSubmission,
  publicSubmissionResponse,
}

module.exports = handler
