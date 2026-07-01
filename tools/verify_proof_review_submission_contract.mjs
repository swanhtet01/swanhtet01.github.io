import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { Readable, Writable } from 'node:stream'

const require = createRequire(import.meta.url)
const root = process.cwd()
const apiPath = resolve(root, 'api/proof-review-submissions.js')

assert.ok(existsSync(apiPath), 'proof_review_submissions_api_missing')

const datastore = require('../api/lib/supermega-datastore.js')
const blobQueue = require('../api/lib/supermega-blob-queue.js')
const handler = require('../api/proof-review-submissions.js')

const originalPostgresConfigured = datastore.postgresConfigured
const originalFindActionRecord = blobQueue.findActionRecord
const originalUpdateActionRecord = blobQueue.updateActionRecord

function callHandler({ method = 'POST', body = {} } = {}) {
  return new Promise((resolveResponse, reject) => {
    const req = Readable.from(method === 'POST' ? [JSON.stringify(body)] : [])
    req.method = method
    req.url = '/api/proof-review-submissions'
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
  normalizeProofReviewSubmission,
  publicSubmissionResponse,
} = handler.__test

assert.equal(typeof normalizeProofReviewSubmission, 'function')
assert.equal(typeof publicSubmissionResponse, 'function')

const actionRow = {
  action_id: 'TASK-PROOF-SUBMIT-001',
  lead_id: 'LEAD-PROOF-SUBMIT-001',
  task_id: 'TASK-PROOF-SUBMIT-001',
  action_type: 'activation_session_first_proof',
  status: 'proof_ready',
  priority: 'high',
  owner: 'Revenue Pod',
  title: 'AI Workcell first proof for Yangon Retail Co',
  next_step: 'Send proof review request and record buyer decision.',
  approval_required: true,
  approval_state: 'pending_owner_review',
  notification_channel: 'operator_console',
  notification_status: 'proof_ready',
  created_at: '2026-07-01T00:00:00.000Z',
  payload: {
    lead: {
      company: 'Yangon Retail Co',
      name: 'Ko Tun',
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
    activation_first_proof: {
      status: 'activation_first_proof_ready',
      proof_delivery_packet: 'Customer A has 820,000 MMK unpaid and needs delivery follow-up.',
      proof_review_request: {
        status: 'proof_review_request_ready',
        review_url: 'https://supermega.dev/app/proof-review?lead=LEAD-PROOF-SUBMIT-001&action=TASK-PROOF-SUBMIT-001',
      },
      real_mrr_delta: 0,
    },
  },
}

let currentRow = JSON.parse(JSON.stringify(actionRow))
let recordedPatch = null

try {
  const normalized = normalizeProofReviewSubmission({
    lead_id: 'LEAD-PROOF-SUBMIT-001',
    action_id: 'TASK-PROOF-SUBMIT-001',
    decision: 'ready_for_paid_pilot',
    client_note: 'Useful enough to scope the paid pilot after owner approval.',
    proof_packet_excerpt: 'Customer A has 820,000 MMK unpaid and needs delivery follow-up.',
  })
  assert.equal(normalized.status, 'proof_review_acceptance_recorded')
  assert.equal(normalized.acceptance_type, 'first_proof_review')
  assert.equal(normalized.lead_id, 'LEAD-PROOF-SUBMIT-001')
  assert.equal(normalized.action_id, 'TASK-PROOF-SUBMIT-001')
  assert.equal(normalized.decision, 'ready_for_paid_pilot')
  assert.equal(normalized.next_gate, 'scope_price_owner_approval_required')
  assert.equal(normalized.external_action_state, 'blocked_until_owner_approval')
  assert.equal(normalized.payment_request_state, 'blocked_until_owner_approval')
  assert.equal(normalized.real_mrr_delta, 0)
  assert.ok(normalized.guardrails.includes('no_external_send'))
  assert.ok(normalized.guardrails.includes('no_mrr_delta_without_payment_proof'))

  const publicResponse = publicSubmissionResponse({
    submission: normalized,
    action: {
      action_id: 'TASK-PROOF-SUBMIT-001',
      lead_id: 'LEAD-PROOF-SUBMIT-001',
      status: 'proof_accepted_for_scope',
      approval_state: 'pending_owner_review',
      notification_status: 'proof_review_acceptance_received',
    },
    adapter: 'vercel_blob',
  })
  assert.equal(publicResponse.status, 'ready')
  assert.equal(publicResponse.submission_status, 'proof_review_acceptance_received')
  assert.equal(publicResponse.proof_review_acceptance.decision, 'ready_for_paid_pilot')
  assert.equal(publicResponse.proof_review_acceptance.real_mrr_delta, 0)
  assert.equal(publicResponse.proof_review_acceptance.proof_packet_excerpt, undefined, 'public_response_must_not_echo_proof_packet')
  assert.equal(publicResponse.proof_review_acceptance.client_note, undefined, 'public_response_must_not_echo_client_note')

  datastore.postgresConfigured = () => false
  blobQueue.findActionRecord = async (selector) => {
    assert.equal(selector.action_id, 'TASK-PROOF-SUBMIT-001')
    assert.equal(selector.lead_id, 'LEAD-PROOF-SUBMIT-001')
    return { status: 'ready', adapter: 'vercel_blob', row: currentRow }
  }
  blobQueue.updateActionRecord = async (selector, patch) => {
    assert.equal(selector.action_id, 'TASK-PROOF-SUBMIT-001')
    assert.equal(selector.lead_id, 'LEAD-PROOF-SUBMIT-001')
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
      lead_id: 'LEAD-PROOF-SUBMIT-001',
      action_id: 'TASK-PROOF-SUBMIT-001',
      decision: 'ready_for_paid_pilot',
      client_note: 'Useful enough to scope the paid pilot after owner approval.',
      proof_packet_excerpt: 'Customer A has 820,000 MMK unpaid and needs delivery follow-up.',
    },
  })
  const body = parseJson(response)
  assert.equal(response.statusCode, 200)
  assert.equal(body.status, 'ready')
  assert.equal(body.endpoint, 'proof-review-submissions')
  assert.equal(body.submission_status, 'proof_review_acceptance_received')
  assert.equal(body.action.status, 'proof_accepted_for_scope')
  assert.equal(body.action.approval_state, 'pending_owner_review')
  assert.equal(body.proof_review_acceptance.decision, 'ready_for_paid_pilot')
  assert.equal(body.proof_review_acceptance.next_gate, 'scope_price_owner_approval_required')
  assert.equal(body.proof_review_acceptance.external_action_state, 'blocked_until_owner_approval')
  assert.equal(body.proof_review_acceptance.payment_request_state, 'blocked_until_owner_approval')
  assert.equal(body.proof_review_acceptance.real_mrr_delta, 0)
  assert.equal(body.proof_review_acceptance.proof_packet_excerpt, undefined, 'handler_response_must_not_echo_proof_packet')
  assert.ok(recordedPatch, 'proof_review_acceptance_patch_missing')
  assert.equal(recordedPatch.status, 'proof_accepted_for_scope')
  assert.equal(recordedPatch.result.proof_review_acceptance.decision, 'ready_for_paid_pilot')
  assert.equal(recordedPatch.result.proof_review_acceptance.real_mrr_delta, 0)

  const missingDecision = await callHandler({
    body: {
      lead_id: 'LEAD-PROOF-SUBMIT-001',
      action_id: 'TASK-PROOF-SUBMIT-001',
      decision: 'maybe',
    },
  })
  const missingDecisionBody = parseJson(missingDecision)
  assert.equal(missingDecision.statusCode, 400)
  assert.equal(missingDecisionBody.status, 'error')
  assert.equal(missingDecisionBody.reason, 'invalid_proof_review_decision')

  const proofReviewPage = existsSync(resolve(root, '.vercel/output/static/app/proof-review/index.html'))
    ? readFileSync(resolve(root, '.vercel/output/static/app/proof-review/index.html'), 'utf8')
    : ''
  if (proofReviewPage) {
    for (const token of ['Submit proof review', '/api/proof-review-submissions', 'Submitted for operator review', 'proof_review_acceptance_recorded']) {
      assert.ok(proofReviewPage.includes(token), `proof_review_page_missing_${token}`)
    }
  }

  console.log(JSON.stringify({
    status: 'ready',
    contract: 'proof_review_submission',
    decision: body.proof_review_acceptance.decision,
    next_gate: body.proof_review_acceptance.next_gate,
    action_status: body.action.status,
    real_mrr_delta: body.proof_review_acceptance.real_mrr_delta,
  }, null, 2))
} finally {
  datastore.postgresConfigured = originalPostgresConfigured
  blobQueue.findActionRecord = originalFindActionRecord
  blobQueue.updateActionRecord = originalUpdateActionRecord
}
