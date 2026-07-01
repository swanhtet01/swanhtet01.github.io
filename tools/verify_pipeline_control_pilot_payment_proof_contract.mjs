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
if (typeof internals.buildPilotPaymentProofRecord !== 'function') fail('pilot_payment_proof_builder_missing')
if (typeof internals.recordPilotPaymentProof !== 'function') fail('record_pilot_payment_proof_missing')

const scopePriceApproval = {
  status: 'scope_price_payment_gate_approved',
  approval_type: 'paid_pilot_scope_price',
  lead_id: 'LEAD-PAYPROOF123',
  action_id: 'TASK-PAYPROOF123',
  template_name: 'Owner Ops Agent',
  company: 'Yangon Retail Co',
  approved_scope_summary: 'Private owner-operated AI workcell with approved source imports and daily owner queue.',
  approved_price_mmk: 11000000,
  approved_price_label: '11,000,000 MMK',
  payment_route: 'manual_invoice_or_payment_link_after_owner_approval',
  owner_approval_reference: 'Owner approved scope and payment route.',
  payment_request_state: 'approved_to_send',
  payment_proof_state: 'payment_proof_required',
  private_workspace_state: 'not_created_until_payment_proof',
  real_mrr_delta: 0,
}

const baseRow = {
  action_id: 'TASK-PAYPROOF123',
  lead_id: 'LEAD-PAYPROOF123',
  task_id: 'TASK-PAYPROOF123',
  action_type: 'activation_session_first_proof',
  status: 'payment_request_approved',
  priority: 'high',
  owner: 'Revenue Pod',
  title: 'Start Owner Ops Agent pilot for Yangon Retail Co',
  next_step: 'Send owner-approved payment request, then attach payment proof before workspace start.',
  approval_required: true,
  approval_state: 'approved',
  notification_channel: 'operator_console',
  notification_status: 'scope_price_approval_recorded',
  created_at: '2026-07-01T00:00:00.000Z',
  payload: {
    lead: {
      lead_id: 'LEAD-PAYPROOF123',
      task_id: 'TASK-PAYPROOF123',
      company: 'Yangon Retail Co',
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
    },
  },
  result: {
    status: 'ready',
    type: 'first_proof_operator_brief',
    template_id: 'owner-ops-agent',
    template_name: 'Owner Ops Agent',
    first_proof_target: 'Daily owner action queue from messages and files.',
    scope_price_approval: scopePriceApproval,
    pilot_order_room_state: {
      status: 'persisted_order_room_state',
      action_id: 'TASK-PAYPROOF123',
      lead_id: 'LEAD-PAYPROOF123',
      scope_approval_state: 'approved',
      price_approval_state: 'approved',
      payment_route_state: 'approved',
      payment_request_state: 'approved_to_send',
      payment_proof_state: 'payment_proof_required',
      private_workspace_state: 'not_created_until_payment_proof',
      real_mrr_delta: 0,
    },
    activation_first_proof: {
      status: 'activation_first_proof_ready',
      action_id: 'TASK-PAYPROOF123',
      lead_id: 'LEAD-PAYPROOF123',
      real_mrr_delta: 0,
    },
  },
}

let currentRow = JSON.parse(JSON.stringify(baseRow))
let recordedPatch = null

try {
  process.env.SUPERMEGA_OPS_KEY = 'test-ops-key'
  datastore.postgresConfigured = () => false
  blobQueue.findActionRecord = async (selector) => {
    assert.equal(selector.action_id, 'TASK-PAYPROOF123')
    assert.equal(selector.lead_id, 'LEAD-PAYPROOF123')
    return { status: 'ready', adapter: 'vercel_blob', row: currentRow }
  }
  blobQueue.updateActionRecord = async (selector, patch) => {
    assert.equal(selector.action_id, 'TASK-PAYPROOF123')
    assert.equal(selector.lead_id, 'LEAD-PAYPROOF123')
    if (patch.result?.pilot_payment_proof) recordedPatch = patch
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
      operation: 'record_pilot_payment_proof',
      action_id: 'TASK-PAYPROOF123',
      lead_id: 'LEAD-PAYPROOF123',
      payment_amount_mmk: 5500000,
      payment_method: 'KBZPay transfer',
      payment_proof_reference: 'KBZ screenshot 7788',
      owner_reconciliation_reference: 'Owner matched transfer to invoice 7788',
    }),
  })
  const body = parseJson(response)

  assert.equal(response.statusCode, 200)
  assert.equal(body.status, 'ready')
  assert.equal(body.operation, 'record_pilot_payment_proof')
  assert.equal(body.operation_status, 'recorded')
  assert.equal(body.adapter, 'vercel_blob')
  assert.equal(body.pilot_payment_proof.status, 'pilot_payment_proof_recorded')
  assert.equal(body.pilot_payment_proof.payment_amount_mmk, 5500000)
  assert.equal(body.pilot_payment_proof.setup_cash_delta_mmk, 5500000)
  assert.equal(body.pilot_payment_proof.real_mrr_delta, 0)
  assert.equal(body.pilot_payment_proof.bank_reconciliation_state, 'owner_matched_not_bank_verified')
  assert.equal(body.order_room_state.payment_request_state, 'sent')
  assert.equal(body.order_room_state.payment_proof_state, 'proof_attached')
  assert.equal(body.order_room_state.private_workspace_state, 'ready_after_payment_proof')
  assert.equal(body.order_room_state.payment_proof_reference, 'KBZ screenshot 7788')
  assert.equal(body.order_room_state.real_mrr_delta, 0)
  assert.equal(body.action.status, 'payment_proof_recorded')
  assert.ok(body.action.next_step.includes('Create private workspace'))
  assert.ok(recordedPatch, 'pilot_payment_proof_patch_missing')
  assert.equal(recordedPatch.result.pilot_payment_proof.payment_amount_mmk, 5500000)
  assert.equal(recordedPatch.result.pilot_order_room_state.private_workspace_state, 'ready_after_payment_proof')
  assert.ok(body.action.first_proof.pilot_order_room.pilot_payment_proof_packet.includes('Workspace state: ready_after_payment_proof'))
  assert.ok(body.action.first_proof.pilot_order_room.pilot_payment_proof_ledger_csv.includes('"KBZ screenshot 7788"'))
  assert.equal(body.action.first_proof.pilot_order_room.private_workspace_manifest.status, 'ready_to_create_private_workspace')

  const workspace = await callHandler({
    body: JSON.stringify({
      operation: 'start_private_workspace',
      action_id: 'TASK-PAYPROOF123',
      lead_id: 'LEAD-PAYPROOF123',
    }),
  })
  const workspaceBody = parseJson(workspace)
  assert.equal(workspace.statusCode, 200)
  assert.equal(workspaceBody.operation_status, 'created')
  assert.equal(workspaceBody.action.status, 'workspace_ready')
  assert.equal(workspaceBody.private_workspace_manifest.status, 'private_workspace_created')

  console.log(
    JSON.stringify(
      {
        status: 'ready',
        audit: 'pipeline-control-pilot-payment-proof',
        operation_status: body.operation_status,
        action_status: body.action.status,
        payment_amount_mmk: body.pilot_payment_proof.payment_amount_mmk,
        workspace_status: workspaceBody.private_workspace_manifest.status,
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
