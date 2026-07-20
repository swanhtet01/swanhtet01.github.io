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
    if (total > 40_000) throw new Error('request_too_large')
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('invalid_json')
  }
}

function firstRunAcceptanceActionStatus(decision) {
  if (decision === 'accepted') return 'client_accepted_first_run'
  return 'client_first_run_changes_requested'
}

function firstRunAcceptanceNextGate(decision) {
  if (decision === 'accepted') return 'operator_owner_acceptance_record_required'
  return 'first_run_revision_required'
}

function firstRunAcceptanceNextStep(decision) {
  if (decision === 'accepted') return 'Operator records owner acceptance, then prepares retainer or connector policy only after explicit approval.'
  return 'Revise the first production run from the requested changes before owner acceptance.'
}

function normalizeFirstRunAcceptanceSubmission(payload = {}) {
  const imported = parseJsonObject(
    payload.first_run_acceptance_json ||
      payload.client_first_run_acceptance_json ||
      payload.acceptance_json ||
      payload.client_first_run_acceptance ||
      payload,
  )
  const merged = { ...imported, ...payload }
  const leadId = truncate(merged.lead_id, 80)
  const actionId = truncate(merged.action_id, 80)
  if (!leadId || !actionId) return { status: 'error', reason: 'missing_action_or_lead_id' }

  const decision = truncate(merged.decision || merged.acceptance_decision, 80)
  if (!['accepted', 'changes_requested'].includes(decision)) {
    return { status: 'error', reason: 'invalid_first_run_acceptance_decision' }
  }

  const recordedAt = new Date().toISOString()
  const clientNote = truncate(merged.client_note || merged.note, 1600)
  const firstRunPacketExcerpt = truncate(merged.first_run_packet_excerpt || merged.first_run_excerpt || merged.output_excerpt, 1800)
  const nextGate = firstRunAcceptanceNextGate(decision)
  const packet = [
    '# AI Workcell first-run acceptance',
    '',
    `Decision: ${decision}`,
    `Lead: ${leadId}`,
    `Action: ${actionId}`,
    `Next gate: ${nextGate}`,
    `Recorded at: ${recordedAt}`,
    'Real MRR delta: 0',
    '',
    '## Client note',
    clientNote || 'No client note recorded.',
    '',
    '## First-run excerpt',
    firstRunPacketExcerpt || 'No first-run excerpt pasted.',
    '',
    '## Guardrails',
    '- This accepts or rejects the first production run only.',
    '- Operator still must record owner acceptance before connector policy, sends, writes, or recurring work.',
    '- No external send/write/browser/payment action is authorized by this record.',
    '- Real MRR remains 0 until recurring payment proof is recorded.',
  ].join('\n')

  return {
    status: 'first_run_acceptance_submitted',
    acceptance_type: 'client_first_run_acceptance',
    submission_type: 'client_first_run_acceptance_submission',
    lead_id: leadId,
    action_id: actionId,
    decision,
    client_note: clientNote,
    first_run_packet_excerpt: firstRunPacketExcerpt,
    next_gate: nextGate,
    next_step: firstRunAcceptanceNextStep(decision),
    external_action_state: 'blocked_until_operator_owner_acceptance',
    connector_write_state: 'blocked_until_operator_owner_acceptance',
    browser_action_state: 'blocked_until_operator_owner_acceptance',
    payment_request_state: 'blocked_until_retainer_offer_approval',
    recurring_revenue_state: 'not_claimed',
    approval_required: true,
    human_gate: 'operator owner acceptance before send/write/payment/browser actions',
    real_mrr_delta: 0,
    recorded_at: recordedAt,
    reviewed_at: truncate(merged.reviewed_at, 80) || recordedAt,
    recorded_by: 'client_delivery_room',
    packet,
    guardrails: [
      'client_first_run_submission_only',
      'operator_owner_acceptance_required',
      'no_external_send',
      'no_connector_write',
      'no_browser_action',
      'no_payment_request',
      'no_recurring_revenue_claim',
      'no_mrr_delta_without_recurring_payment_proof',
    ],
  }
}

function publicSubmissionResponse({ submission, action, adapter, primaryDatabase }) {
  return {
    status: 'ready',
    endpoint: 'first-run-acceptance-submissions',
    adapter: adapter || null,
    primary_database: primaryDatabase || null,
    submission_status: 'first_run_acceptance_received',
    action: {
      action_id: text(action.action_id || submission.action_id) || null,
      lead_id: text(action.lead_id || submission.lead_id) || null,
      status: text(action.status) || firstRunAcceptanceActionStatus(submission.decision),
      approval_state: text(action.approval_state) || 'pending_owner_review',
      notification_status: text(action.notification_status) || 'first_run_acceptance_received',
      next_step: text(action.next_step) || submission.next_step,
    },
    first_run_acceptance: {
      status: submission.status,
      acceptance_type: submission.acceptance_type,
      submission_type: submission.submission_type,
      lead_id: submission.lead_id,
      action_id: submission.action_id,
      decision: submission.decision,
      next_gate: submission.next_gate,
      next_step: submission.next_step,
      external_action_state: submission.external_action_state,
      connector_write_state: submission.connector_write_state,
      browser_action_state: submission.browser_action_state,
      payment_request_state: submission.payment_request_state,
      recurring_revenue_state: submission.recurring_revenue_state,
      real_mrr_delta: submission.real_mrr_delta,
      recorded_at: submission.recorded_at,
      guardrails: submission.guardrails,
      client_note_received: Boolean(submission.client_note),
      first_run_packet_excerpt_received: Boolean(submission.first_run_packet_excerpt),
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
    client_first_run_acceptance: submission,
    client_first_run_acceptance_recorded_at: submission.recorded_at,
  }
  const updated = await blobQueue.updateActionRecord(
    { action_id: submission.action_id, lead_id: submission.lead_id },
    {
      result: nextResult,
      status: firstRunAcceptanceActionStatus(submission.decision),
      approval_state: row.approval_state || 'pending_owner_review',
      next_step: submission.next_step,
      notification_status: 'first_run_acceptance_received',
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
    ? "result = coalesce(result, '{}'::jsonb) || jsonb_build_object('client_first_run_acceptance', $2::jsonb, 'client_first_run_acceptance_recorded_at', $3::text),"
    : ''
  const returningResultExpression = resultColumn.has_result ? 'result' : "coalesce(payload, '{}'::jsonb) as result"
  const updated = await datastore.query(
    `
      update public.supermega_pipeline_actions
      set
        ${updateResultExpression}
        payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
          'client_first_run_acceptance', $2::jsonb,
          'client_first_run_acceptance_recorded_at', $3::text
        ),
        status = $4,
        approval_state = coalesce(approval_state, 'pending_owner_review'),
        notification_status = 'first_run_acceptance_received',
        next_step = $5,
        updated_at = now()
      where id = $1
      returning action_id, lead_id, status, approval_state, notification_status, next_step, payload, ${returningResultExpression}
    `,
    [
      selected.rows[0].id,
      JSON.stringify(submission),
      submission.recorded_at,
      firstRunAcceptanceActionStatus(submission.decision),
      submission.next_step,
    ],
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
  if (['missing_action_or_lead_id', 'invalid_first_run_acceptance_decision', 'invalid_json', 'request_too_large'].includes(result.reason)) return 400
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
      endpoint: 'first-run-acceptance-submissions',
      method: 'POST',
      required_fields: ['lead_id', 'action_id', 'decision'],
      allowed_decisions: ['accepted', 'changes_requested'],
      guardrails: ['no_external_send', 'no_connector_write', 'no_browser_action', 'no_payment_request', 'no_recurring_revenue_claim'],
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
  const submission = normalizeFirstRunAcceptanceSubmission(payload)
  if (submission.status === 'error') {
    json(res, writeStatusCode(submission), submission)
    return
  }
  const recorded = await recordSubmission(submission)
  json(res, writeStatusCode(recorded), recorded)
}

handler.__test = {
  normalizeFirstRunAcceptanceSubmission,
  publicSubmissionResponse,
}

module.exports = handler
