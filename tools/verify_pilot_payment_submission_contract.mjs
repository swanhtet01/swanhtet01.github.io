import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { Readable, Writable } from 'node:stream'

const require = createRequire(import.meta.url)
const root = process.cwd()
const apiPath = resolve(root, 'api/pilot-payment-submissions.js')

assert.ok(existsSync(apiPath), 'pilot_payment_submissions_api_missing')

const datastore = require('../api/lib/supermega-datastore.js')
const blobQueue = require('../api/lib/supermega-blob-queue.js')
const handler = require('../api/pilot-payment-submissions.js')

const originalPostgresConfigured = datastore.postgresConfigured
const originalFindActionRecord = blobQueue.findActionRecord
const originalUpdateActionRecord = blobQueue.updateActionRecord

function callHandler({ method = 'POST', body = {} } = {}) {
  return new Promise((resolveResponse, reject) => {
    const req = Readable.from(method === 'POST' ? [JSON.stringify(body)] : [])
    req.method = method
    req.url = '/api/pilot-payment-submissions'
    req.headers = { 'content-type': 'application/json' }

    let responseBody = ''
    const res = new Writable({
      write(chunk, _encoding, callback) {
        responseBody += chunk.toString()
        callback()
      },
    })
    res.statusCode = 200
    res.headers = {}
    res.setHeader = (name, value) => {
      res.headers[String(name).toLowerCase()] = value
    }
    res.end = (chunk = '') => {
      if (chunk) responseBody += chunk.toString()
      resolveResponse({ statusCode: res.statusCode, headers: res.headers, body: responseBody })
    }

    Promise.resolve(handler(req, res)).catch(reject)
  })
}

function parseJson(response) {
  return JSON.parse(response.body)
}

const {
  normalizePilotPaymentSubmission,
  publicSubmissionResponse,
} = handler.__test

assert.equal(typeof normalizePilotPaymentSubmission, 'function')
assert.equal(typeof publicSubmissionResponse, 'function')

const scopePriceApproval = {
  status: 'scope_price_payment_gate_approved',
  lead_id: 'LEAD-PAY-SUBMIT-001',
  action_id: 'TASK-PAY-SUBMIT-001',
  template_name: 'AI Workcell Pilot',
  company: 'Yangon Retail Co',
  approved_price_mmk: 11000000,
  approved_price_label: '11,000,000 MMK',
  payment_route: 'manual_invoice_or_payment_link_after_owner_approval',
  owner_approval_reference: 'Owner approved paid pilot scope and payment route.',
  payment_request_state: 'approved_to_send',
  payment_proof_state: 'payment_proof_required',
  private_workspace_state: 'not_created_until_payment_proof',
  real_mrr_delta: 0,
}

const actionRow = {
  action_id: 'TASK-PAY-SUBMIT-001',
  lead_id: 'LEAD-PAY-SUBMIT-001',
  task_id: 'TASK-PAY-SUBMIT-001',
  action_type: 'activation_session_first_proof',
  status: 'payment_request_approved',
  priority: 'high',
  owner: 'Revenue Pod',
  title: 'AI Workcell paid pilot for Yangon Retail Co',
  next_step: 'Send owner-approved payment request, then attach payment proof before workspace start.',
  approval_required: true,
  approval_state: 'approved',
  notification_channel: 'operator_console',
  notification_status: 'scope_price_approval_recorded',
  created_at: '2026-07-01T00:00:00.000Z',
  payload: {
    lead: {
      company: 'Yangon Retail Co',
      requested_package: 'AI Workcell Pilot',
      first_proof_target: 'Daily owner action queue from messages and files.',
    },
    first_proof_task: {
      type: 'first_proof_build',
      template_id: 'daily-intelligence-brief',
      template_name: 'AI Workcell Pilot',
      first_proof_target: 'Daily owner action queue from messages and files.',
    },
  },
  result: {
    type: 'first_proof_operator_brief',
    template_id: 'daily-intelligence-brief',
    template_name: 'AI Workcell Pilot',
    first_proof_target: 'Daily owner action queue from messages and files.',
    scope_price_approval: scopePriceApproval,
    pilot_order_room_state: {
      status: 'persisted_order_room_state',
      scope_approval_state: 'approved',
      price_approval_state: 'approved',
      payment_route_state: 'approved',
      payment_request_state: 'sent',
      payment_proof_state: 'payment_proof_required',
      private_workspace_state: 'not_created_until_payment_proof',
      real_mrr_delta: 0,
    },
  },
}

let currentRow = JSON.parse(JSON.stringify(actionRow))
let recordedPatch = null

try {
  const normalized = normalizePilotPaymentSubmission({
    lead_id: 'LEAD-PAY-SUBMIT-001',
    action_id: 'TASK-PAY-SUBMIT-001',
    payment_amount_mmk: 5500000,
    payment_method: 'KBZPay transfer',
    payment_proof_reference: 'KBZ screenshot 7788',
    client_note: 'Paid deposit from KBZPay account ending 7788.',
  })
  assert.equal(normalized.status, 'client_pilot_payment_submitted')
  assert.equal(normalized.submission_type, 'client_pilot_payment_proof')
  assert.equal(normalized.lead_id, 'LEAD-PAY-SUBMIT-001')
  assert.equal(normalized.action_id, 'TASK-PAY-SUBMIT-001')
  assert.equal(normalized.payment_amount_mmk, 5500000)
  assert.equal(normalized.payment_proof_state, 'client_submitted_owner_review_required')
  assert.equal(normalized.private_workspace_state, 'not_created_until_owner_reconciliation')
  assert.equal(normalized.setup_cash_delta_mmk, 0)
  assert.equal(normalized.real_mrr_delta, 0)
  assert.ok(normalized.guardrails.includes('owner_reconciliation_required_before_workspace'))
  assert.ok(normalized.guardrails.includes('no_mrr_delta_without_owner_verified_payment_proof'))

  const publicResponse = publicSubmissionResponse({
    submission: normalized,
    action: {
      action_id: 'TASK-PAY-SUBMIT-001',
      lead_id: 'LEAD-PAY-SUBMIT-001',
      status: 'client_payment_proof_received',
      approval_state: 'pending_payment_review',
      notification_status: 'client_payment_proof_received',
    },
    adapter: 'vercel_blob',
  })
  assert.equal(publicResponse.status, 'ready')
  assert.equal(publicResponse.submission_status, 'client_payment_proof_received')
  assert.equal(publicResponse.pilot_payment_submission.payment_amount_mmk, 5500000)
  assert.equal(publicResponse.pilot_payment_submission.setup_cash_delta_mmk, 0)
  assert.equal(publicResponse.pilot_payment_submission.real_mrr_delta, 0)
  assert.equal(publicResponse.pilot_payment_submission.payment_proof_reference, undefined, 'public_response_must_not_echo_payment_reference')
  assert.equal(publicResponse.pilot_payment_submission.client_note, undefined, 'public_response_must_not_echo_client_note')

  datastore.postgresConfigured = () => false
  blobQueue.findActionRecord = async (selector) => {
    assert.equal(selector.action_id, 'TASK-PAY-SUBMIT-001')
    assert.equal(selector.lead_id, 'LEAD-PAY-SUBMIT-001')
    return { status: 'ready', adapter: 'vercel_blob', row: currentRow }
  }
  blobQueue.updateActionRecord = async (selector, patch) => {
    assert.equal(selector.action_id, 'TASK-PAY-SUBMIT-001')
    assert.equal(selector.lead_id, 'LEAD-PAY-SUBMIT-001')
    recordedPatch = patch
    currentRow = {
      ...currentRow,
      ...patch,
      result: {
        ...currentRow.result,
        ...patch.result,
      },
    }
    return { status: 'ready', adapter: 'vercel_blob', record: currentRow }
  }

  const response = await callHandler({
    body: {
      lead_id: 'LEAD-PAY-SUBMIT-001',
      action_id: 'TASK-PAY-SUBMIT-001',
      payment_amount_mmk: 5500000,
      payment_method: 'KBZPay transfer',
      payment_proof_reference: 'KBZ screenshot 7788',
      client_note: 'Paid deposit from KBZPay account ending 7788.',
    },
  })
  const body = parseJson(response)
  assert.equal(response.statusCode, 200)
  assert.equal(body.status, 'ready')
  assert.equal(body.endpoint, 'pilot-payment-submissions')
  assert.equal(body.submission_status, 'client_payment_proof_received')
  assert.equal(body.action.status, 'client_payment_proof_received')
  assert.equal(body.action.approval_state, 'pending_payment_review')
  assert.equal(body.pilot_payment_submission.payment_amount_mmk, 5500000)
  assert.equal(body.pilot_payment_submission.payment_proof_state, 'client_submitted_owner_review_required')
  assert.equal(body.pilot_payment_submission.private_workspace_state, 'not_created_until_owner_reconciliation')
  assert.equal(body.pilot_payment_submission.setup_cash_delta_mmk, 0)
  assert.equal(body.pilot_payment_submission.real_mrr_delta, 0)
  assert.equal(body.pilot_payment_submission.payment_proof_reference, undefined, 'handler_response_must_not_echo_payment_reference')
  assert.ok(recordedPatch, 'client_pilot_payment_submission_patch_missing')
  assert.equal(recordedPatch.status, 'client_payment_proof_received')
  assert.equal(recordedPatch.approval_state, 'pending_payment_review')
  assert.equal(recordedPatch.result.client_pilot_payment_submission.payment_amount_mmk, 5500000)
  assert.equal(recordedPatch.result.client_pilot_payment_submission.setup_cash_delta_mmk, 0)
  assert.equal(recordedPatch.result.client_pilot_payment_submission.private_workspace_state, 'not_created_until_owner_reconciliation')
  assert.equal(recordedPatch.result.pilot_payment_proof, undefined, 'client_submission_must_not_record_operator_payment_proof')

  const missingReference = await callHandler({
    body: {
      lead_id: 'LEAD-PAY-SUBMIT-001',
      action_id: 'TASK-PAY-SUBMIT-001',
      payment_amount_mmk: 5500000,
    },
  })
  const missingReferenceBody = parseJson(missingReference)
  assert.equal(missingReference.statusCode, 400)
  assert.equal(missingReferenceBody.status, 'error')
  assert.equal(missingReferenceBody.reason, 'missing_pilot_payment_proof_reference')

  const paymentProofPagePath = resolve(root, '.vercel/output/static/app/payment-proof/index.html')
  assert.ok(existsSync(paymentProofPagePath), 'payment_proof_page_missing')
  const paymentProofPage = readFileSync(paymentProofPagePath, 'utf8')
  for (const token of ['Submit payment proof', '/api/pilot-payment-submissions', 'client_pilot_payment_submitted', 'Submitted for operator reconciliation']) {
    assert.ok(paymentProofPage.includes(token), `payment_proof_page_missing_${token}`)
  }

  console.log(JSON.stringify({
    status: 'ready',
    contract: 'pilot_payment_submission',
    submission_status: body.submission_status,
    action_status: body.action.status,
    payment_amount_mmk: body.pilot_payment_submission.payment_amount_mmk,
    setup_cash_delta_mmk: body.pilot_payment_submission.setup_cash_delta_mmk,
    real_mrr_delta: body.pilot_payment_submission.real_mrr_delta,
  }, null, 2))
} finally {
  datastore.postgresConfigured = originalPostgresConfigured
  blobQueue.findActionRecord = originalFindActionRecord
  blobQueue.updateActionRecord = originalUpdateActionRecord
}
