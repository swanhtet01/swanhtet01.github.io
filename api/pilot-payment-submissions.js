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

function moneyAmount(value) {
  const normalized = Number(String(value || '').replace(/[^0-9.]/g, ''))
  return Number.isFinite(normalized) && normalized > 0 ? Math.round(normalized) : 0
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

function normalizePilotPaymentSubmission(payload = {}) {
  const imported = parseJsonObject(payload.pilot_payment_submission_json || payload.payment_submission_json || payload.payment_submission || payload)
  const merged = { ...imported, ...payload }
  const leadId = truncate(merged.lead_id, 80)
  const actionId = truncate(merged.action_id, 80)
  if (!leadId || !actionId) return { status: 'error', reason: 'missing_action_or_lead_id' }

  const paymentAmountMmk = moneyAmount(merged.payment_amount_mmk || merged.amount_mmk || merged.paid_amount_mmk)
  if (!paymentAmountMmk) return { status: 'error', reason: 'invalid_pilot_payment_amount' }

  const paymentProofReference = truncate(merged.payment_proof_reference || merged.proof_reference || merged.receipt_reference, 700)
  if (!paymentProofReference) return { status: 'error', reason: 'missing_pilot_payment_proof_reference' }

  const submittedAt = new Date().toISOString()
  const clientNote = truncate(merged.client_note || merged.note, 1200)
  const paymentMethod = truncate(merged.payment_method || merged.payment_route || 'client_submitted_payment_proof', 160)
  const paidAt = truncate(merged.paid_at, 80) || submittedAt

  return {
    status: 'client_pilot_payment_submitted',
    submission_type: 'client_pilot_payment_proof',
    lead_id: leadId,
    action_id: actionId,
    payment_amount_mmk: paymentAmountMmk,
    payment_method: paymentMethod,
    payment_proof_reference: paymentProofReference,
    client_note: clientNote,
    paid_at: paidAt,
    submitted_at: submittedAt,
    payment_proof_state: 'client_submitted_owner_review_required',
    private_workspace_state: 'not_created_until_owner_reconciliation',
    payment_request_state: 'payment_proof_submitted_for_review',
    setup_cash_delta_mmk: 0,
    real_mrr_delta: 0,
    bank_reconciliation_state: 'not_bank_verified',
    owner_reconciliation_state: 'pending_owner_review',
    human_gate: 'owner reconciliation required before workspace or revenue claim',
    submitted_by: 'client_payment_proof_room',
    guardrails: [
      'client_submission_only',
      'owner_reconciliation_required_before_workspace',
      'bank_verification_is_separate',
      'setup_cash_not_recorded_until_owner_review',
      'no_mrr_delta_without_owner_verified_payment_proof',
    ],
  }
}

function publicSubmissionResponse({ submission, action, adapter, primaryDatabase }) {
  return {
    status: 'ready',
    endpoint: 'pilot-payment-submissions',
    adapter: adapter || null,
    primary_database: primaryDatabase || null,
    submission_status: 'client_payment_proof_received',
    action: {
      action_id: text(action.action_id || submission.action_id) || null,
      lead_id: text(action.lead_id || submission.lead_id) || null,
      status: text(action.status) || 'client_payment_proof_received',
      approval_state: text(action.approval_state) || 'pending_payment_review',
      notification_status: text(action.notification_status) || 'client_payment_proof_received',
      next_step: text(action.next_step) || 'Owner reconcile submitted payment proof, then record pilot payment proof before workspace start.',
    },
    pilot_payment_submission: {
      status: submission.status,
      submission_type: submission.submission_type,
      lead_id: submission.lead_id,
      action_id: submission.action_id,
      payment_amount_mmk: submission.payment_amount_mmk,
      payment_method: submission.payment_method,
      payment_proof_state: submission.payment_proof_state,
      private_workspace_state: submission.private_workspace_state,
      payment_request_state: submission.payment_request_state,
      setup_cash_delta_mmk: submission.setup_cash_delta_mmk,
      real_mrr_delta: submission.real_mrr_delta,
      bank_reconciliation_state: submission.bank_reconciliation_state,
      owner_reconciliation_state: submission.owner_reconciliation_state,
      submitted_at: submission.submitted_at,
      guardrails: submission.guardrails,
      payment_proof_reference_received: Boolean(submission.payment_proof_reference),
      client_note_received: Boolean(submission.client_note),
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
    client_pilot_payment_submission: submission,
    client_pilot_payment_submission_recorded_at: submission.submitted_at,
  }
  const updated = await blobQueue.updateActionRecord(
    { action_id: submission.action_id, lead_id: submission.lead_id },
    {
      result: nextResult,
      status: 'client_payment_proof_received',
      approval_state: 'pending_payment_review',
      next_step: 'Owner reconcile submitted payment proof, then record pilot payment proof before workspace start.',
      notification_status: 'client_payment_proof_received',
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
    ? "result = coalesce(result, '{}'::jsonb) || jsonb_build_object('client_pilot_payment_submission', $2::jsonb, 'client_pilot_payment_submission_recorded_at', $3::text),"
    : ''
  const returningResultExpression = resultColumn.has_result ? 'result' : "coalesce(payload, '{}'::jsonb) as result"
  const updated = await datastore.query(
    `
      update public.supermega_pipeline_actions
      set
        ${updateResultExpression}
        payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
          'client_pilot_payment_submission', $2::jsonb,
          'client_pilot_payment_submission_recorded_at', $3::text
        ),
        status = 'client_payment_proof_received',
        approval_state = 'pending_payment_review',
        notification_status = 'client_payment_proof_received',
        next_step = 'Owner reconcile submitted payment proof, then record pilot payment proof before workspace start.',
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
  if (['missing_action_or_lead_id', 'missing_pilot_payment_proof_reference', 'invalid_pilot_payment_amount', 'invalid_json', 'request_too_large'].includes(result.reason)) return 400
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
      endpoint: 'pilot-payment-submissions',
      method: 'POST',
      required_fields: ['lead_id', 'action_id', 'payment_amount_mmk', 'payment_proof_reference'],
      guardrails: ['owner_reconciliation_required_before_workspace', 'bank_verification_is_separate', 'no_mrr_delta_without_owner_verified_payment_proof'],
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
  const submission = normalizePilotPaymentSubmission(payload)
  if (submission.status === 'error') {
    json(res, writeStatusCode(submission), submission)
    return
  }
  const recorded = await recordSubmission(submission)
  json(res, writeStatusCode(recorded), recorded)
}

handler.__test = {
  normalizePilotPaymentSubmission,
  publicSubmissionResponse,
}

module.exports = handler
