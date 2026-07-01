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
if (typeof internals.buildScopePriceApprovalRecord !== 'function') fail('scope_price_approval_builder_missing')
if (typeof internals.recordScopePriceApproval !== 'function') fail('record_scope_price_approval_missing')

const baseRow = {
  action_id: 'TASK-SCOPEPRICE123',
  lead_id: 'LEAD-SCOPEPRICE123',
  task_id: 'TASK-SCOPEPRICE123',
  action_type: 'activation_session_first_proof',
  status: 'proof_accepted_for_scope',
  priority: 'high',
  owner: 'Revenue Pod',
  title: 'Start Owner Ops Agent first proof for Yangon Retail Co',
  next_step: 'Prepare owner-approved scope and price, then payment route for the paid pilot.',
  approval_required: true,
  approval_state: 'pending',
  notification_channel: 'operator_console',
  notification_status: 'proof_accepted_for_scope',
  created_at: '2026-07-01T00:00:00.000Z',
  payload: {
    lead: {
      lead_id: 'LEAD-SCOPEPRICE123',
      task_id: 'TASK-SCOPEPRICE123',
      company: 'Yangon Retail Co',
      name: 'Ko Tun',
      requested_package: 'Owner Ops Agent',
      public_package: 'Owner Ops Agent',
      first_proof_target: 'Daily owner action queue from messages and files.',
      price_hint: '11,000,000 MMK',
    },
    first_proof_task: {
      type: 'first_proof_build',
      template_id: 'owner-ops-agent',
      template_name: 'Owner Ops Agent',
      first_proof_target: 'Daily owner action queue from messages and files.',
      price_hint: '11,000,000 MMK',
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
    price_hint: '11,000,000 MMK',
    proof_review_acceptance: {
      status: 'proof_review_acceptance_recorded',
      acceptance_type: 'first_proof_review',
      lead_id: 'LEAD-SCOPEPRICE123',
      action_id: 'TASK-SCOPEPRICE123',
      decision: 'ready_for_paid_pilot',
      next_gate: 'scope_price_owner_approval_required',
      real_mrr_delta: 0,
    },
    activation_first_proof: {
      status: 'activation_first_proof_ready',
      action_id: 'TASK-SCOPEPRICE123',
      lead_id: 'LEAD-SCOPEPRICE123',
      proof_delivery_packet: 'Customer A has 820,000 MMK unpaid and needs delivery follow-up.',
      approval_required: true,
      human_gate: 'owner approval before send/write/payment/browser actions',
      real_mrr_delta: 0,
    },
    approval_required: true,
    human_gate: 'owner approval before send/write/payment/browser actions',
  },
}

let currentRow = JSON.parse(JSON.stringify(baseRow))
let recordedPatch = null

try {
  process.env.SUPERMEGA_OPS_KEY = 'test-ops-key'
  datastore.postgresConfigured = () => false
  blobQueue.findActionRecord = async (selector) => {
    assert.equal(selector.action_id, 'TASK-SCOPEPRICE123')
    assert.equal(selector.lead_id, 'LEAD-SCOPEPRICE123')
    return { status: 'ready', adapter: 'vercel_blob', row: currentRow }
  }
  blobQueue.updateActionRecord = async (selector, patch) => {
    assert.equal(selector.action_id, 'TASK-SCOPEPRICE123')
    assert.equal(selector.lead_id, 'LEAD-SCOPEPRICE123')
    if (patch.result?.scope_price_approval) recordedPatch = patch
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
    body: JSON.stringify({
      operation: 'record_scope_price_approval',
      action_id: 'TASK-SCOPEPRICE123',
      lead_id: 'LEAD-SCOPEPRICE123',
      approved_scope_summary: 'Turn the accepted first proof into a private owner-operated AI workcell with approved source imports, daily action queue, source trace, and approval-only first production run.',
      approved_price_mmk: 11000000,
      deposit_terms: '50_percent_to_start',
      payment_route: 'manual_invoice_or_payment_link_after_owner_approval',
      owner_approval_reference: 'Owner approved scope and price in live smoke note.',
    }),
  })
  const body = parseJson(response)

  assert.equal(response.statusCode, 200)
  assert.equal(body.status, 'ready')
  assert.equal(body.operation, 'record_scope_price_approval')
  assert.equal(body.operation_status, 'recorded')
  assert.equal(body.adapter, 'vercel_blob')
  assert.equal(body.scope_price_approval.status, 'scope_price_payment_gate_approved')
  assert.equal(body.scope_price_approval.approved_price_mmk, 11000000)
  assert.equal(body.scope_price_approval.currency, 'MMK')
  assert.equal(body.scope_price_approval.payment_request_gate.status, 'payment_request_approved_to_send')
  assert.equal(body.scope_price_approval.payment_request_gate.payment_proof_state, 'payment_proof_required')
  assert.equal(body.scope_price_approval.payment_request_gate.real_mrr_delta, 0)
  assert.equal(body.order_room_state.scope_approval_state, 'approved')
  assert.equal(body.order_room_state.price_approval_state, 'approved')
  assert.equal(body.order_room_state.payment_route_state, 'approved')
  assert.equal(body.order_room_state.payment_request_state, 'approved_to_send')
  assert.equal(body.order_room_state.payment_proof_state, 'payment_proof_required')
  assert.equal(body.order_room_state.private_workspace_state, 'not_created_until_payment_proof')
  assert.equal(body.order_room_state.real_mrr_delta, 0)
  assert.equal(body.action.status, 'payment_request_approved')
  assert.ok(body.action.next_step.includes('payment request'))
  assert.ok(recordedPatch, 'scope_price_approval_patch_missing')
  assert.equal(recordedPatch.result.scope_price_approval.payment_request_gate.status, 'payment_request_approved_to_send')
  assert.equal(recordedPatch.result.pilot_order_room_state.real_mrr_delta, 0)
  assert.ok(body.action.first_proof.pilot_order_room.scope_price_approval_packet.includes('11,000,000 MMK'))
  assert.ok(body.action.first_proof.pilot_order_room.payment_request_gate_packet.includes('Do not claim real MRR'))

  console.log(
    JSON.stringify(
      {
        status: 'ready',
        audit: 'pipeline-control-scope-price-approval',
        operation_status: body.operation_status,
        action_status: body.action.status,
        payment_request_gate: body.scope_price_approval.payment_request_gate.status,
        approved_price_mmk: body.scope_price_approval.approved_price_mmk,
        real_mrr_delta: body.order_room_state.real_mrr_delta,
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
