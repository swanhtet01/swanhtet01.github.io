import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { Readable, Writable } from 'node:stream'

const require = createRequire(import.meta.url)
const datastore = require('../api/lib/supermega-datastore.js')
const blobQueue = require('../api/lib/supermega-blob-queue.js')
const handler = require('../api/pipeline-control.js')

const originalOpsKey = process.env.SUPERMEGA_OPS_KEY
const originalPostgresConfigured = datastore.postgresConfigured
const originalFindActionRecord = blobQueue.findActionRecord
const originalUpdateActionRecord = blobQueue.updateActionRecord

function fail(message, extra = {}) {
  console.error(JSON.stringify({ status: 'error', message, ...extra }, null, 2))
  process.exit(1)
}

function callHandler({ method = 'POST', headers = {}, body = '' } = {}) {
  return new Promise((resolve, reject) => {
    const req = Readable.from(body ? [body] : [])
    req.method = method
    req.url = '/api/pipeline-control'
    req.headers = {
      authorization: 'Bearer test-ops-key',
      'content-type': 'application/json',
      ...headers,
    }

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
      resolve({ statusCode: res.statusCode, headers: res.headers, body: responseBody })
    }

    Promise.resolve(handler(req, res)).catch(reject)
  })
}

function parseJson(response) {
  try {
    return JSON.parse(response.body)
  } catch {
    throw new Error(`response_not_json=${response.statusCode}:${response.body.slice(0, 160)}`)
  }
}

const internals = handler.__test || {}
if (typeof internals.buildProofReviewAcceptanceRecord !== 'function') fail('proof_review_acceptance_builder_missing')
if (typeof internals.recordProofReviewAcceptance !== 'function') fail('record_proof_review_acceptance_missing')

const baseRow = {
  action_id: 'TASK-PROOFACCEPT123',
  lead_id: 'LEAD-PROOFACCEPT123',
  task_id: 'TASK-PROOFACCEPT123',
  action_type: 'activation_session_first_proof',
  status: 'proof_ready',
  priority: 'high',
  owner: 'Revenue Pod',
  title: 'Start Owner Ops Agent first proof for Yangon Retail Co',
  next_step: 'Send proof review request and record buyer decision.',
  approval_required: true,
  approval_state: 'pending',
  notification_channel: 'operator_console',
  notification_status: 'proof_ready',
  created_at: '2026-07-01T00:00:00.000Z',
  payload: {
    lead: {
      lead_id: 'LEAD-PROOFACCEPT123',
      task_id: 'TASK-PROOFACCEPT123',
      company: 'Yangon Retail Co',
      name: 'Ko Tun',
      requested_package: 'Owner Ops Agent',
      public_package: 'Owner Ops Agent',
      first_proof_target: 'Daily owner action queue from messages and files.',
      goal: 'Turn scattered messages and files into one owner decision queue.',
    },
    first_proof_task: {
      type: 'first_proof_build',
      template_id: 'owner-ops-agent',
      template_name: 'Owner Ops Agent',
      first_proof_target: 'Daily owner action queue from messages and files.',
      approval_required: true,
      human_gate: 'owner approval before send/write/payment/browser actions',
    },
  },
  result: {
    status: 'ready',
    type: 'first_proof_operator_brief',
    template_id: 'owner-ops-agent',
    template_name: 'Owner Ops Agent',
    first_proof_target: 'Daily owner action queue from messages and files.',
    activation_first_proof: {
      status: 'activation_first_proof_ready',
      action_id: 'TASK-PROOFACCEPT123',
      lead_id: 'LEAD-PROOFACCEPT123',
      proof_delivery_packet: 'Customer A has 820,000 MMK unpaid and needs delivery follow-up.',
      proof_review_request: {
        status: 'proof_review_request_ready',
        review_url: 'https://supermega.dev/app/proof-review?lead=LEAD-PROOFACCEPT123&action=TASK-PROOFACCEPT123',
      },
      approval_required: true,
      human_gate: 'owner approval before send/write/payment/browser actions',
      real_mrr_delta: 0,
    },
    approval_required: true,
    human_gate: 'owner approval before send/write/payment/browser actions',
  },
}

let currentRow = JSON.parse(JSON.stringify(baseRow))
let acceptancePatch = null

try {
  process.env.SUPERMEGA_OPS_KEY = 'test-ops-key'
  datastore.postgresConfigured = () => false
  blobQueue.findActionRecord = async (selector) => {
    assert.equal(selector.action_id, 'TASK-PROOFACCEPT123')
    assert.equal(selector.lead_id, 'LEAD-PROOFACCEPT123')
    return { status: 'ready', adapter: 'vercel_blob', row: currentRow }
  }
  blobQueue.updateActionRecord = async (selector, patch) => {
    assert.equal(selector.action_id, 'TASK-PROOFACCEPT123')
    assert.equal(selector.lead_id, 'LEAD-PROOFACCEPT123')
    if (patch.result?.proof_review_acceptance) acceptancePatch = patch
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

  const acceptanceJson = {
    acceptance_type: 'first_proof_review',
    lead_id: 'LEAD-PROOFACCEPT123',
    action_id: 'TASK-PROOFACCEPT123',
    decision: 'ready_for_paid_pilot',
    client_note: 'Useful enough to scope the paid pilot after owner approval.',
    proof_packet_excerpt: 'Customer A has 820,000 MMK unpaid and needs delivery follow-up.',
    human_gate: 'owner approval before send/write/payment/browser actions',
    external_action_state: 'blocked_until_owner_approval',
    connector_write_state: 'blocked_until_owner_approval',
    payment_request_state: 'blocked_until_owner_approval',
    real_mrr_delta: 0,
  }

  const response = await callHandler({
    body: JSON.stringify({
      operation: 'record_proof_review_acceptance',
      action_id: 'TASK-PROOFACCEPT123',
      lead_id: 'LEAD-PROOFACCEPT123',
      proof_acceptance_json: JSON.stringify(acceptanceJson),
      operator_note: 'Imported copied proof acceptance JSON.',
    }),
  })
  const body = parseJson(response)

  assert.equal(response.statusCode, 200)
  assert.equal(body.status, 'ready')
  assert.equal(body.operation, 'record_proof_review_acceptance')
  assert.equal(body.operation_status, 'recorded')
  assert.equal(body.adapter, 'vercel_blob')
  assert.equal(body.proof_review_acceptance.status, 'proof_review_acceptance_recorded')
  assert.equal(body.proof_review_acceptance.decision, 'ready_for_paid_pilot')
  assert.equal(body.proof_review_acceptance.next_gate, 'scope_price_owner_approval_required')
  assert.equal(body.proof_review_acceptance.external_action_state, 'blocked_until_owner_approval')
  assert.equal(body.proof_review_acceptance.payment_request_state, 'blocked_until_owner_approval')
  assert.equal(body.proof_review_acceptance.real_mrr_delta, 0)
  assert.equal(body.action.status, 'proof_accepted_for_scope')
  assert.ok(body.action.next_step.includes('scope and price'))
  assert.ok(acceptancePatch, 'proof_review_acceptance_patch_missing')
  assert.equal(acceptancePatch.result.proof_review_acceptance.decision, 'ready_for_paid_pilot')

  console.log(
    JSON.stringify(
      {
        status: 'ready',
        audit: 'pipeline-control-proof-review-acceptance',
        operation_status: body.operation_status,
        decision: body.proof_review_acceptance.decision,
        next_gate: body.proof_review_acceptance.next_gate,
        action_status: body.action.status,
        real_mrr_delta: body.proof_review_acceptance.real_mrr_delta,
      },
      null,
      2,
    ),
  )
} finally {
  if (originalOpsKey === undefined) delete process.env.SUPERMEGA_OPS_KEY
  else process.env.SUPERMEGA_OPS_KEY = originalOpsKey
  datastore.postgresConfigured = originalPostgresConfigured
  blobQueue.findActionRecord = originalFindActionRecord
  blobQueue.updateActionRecord = originalUpdateActionRecord
}
