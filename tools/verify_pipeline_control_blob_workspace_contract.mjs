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

let row = {
  id: 'BLOB-WORKSPACE-ACTION-001',
  action_id: 'BLOB-WORKSPACE-ACTION-001',
  lead_id: 'BLOB-WORKSPACE-LEAD',
  task_id: 'BLOB-WORKSPACE-TASK',
  action_type: 'lead_followup',
  status: 'done',
  priority: 'high',
  owner: 'Revenue Pod',
  title: 'Daily Intelligence Brief Agent first proof',
  next_step: 'Attach payment proof, then create the private workspace.',
  approval_required: true,
  approval_state: 'pending',
  notification_channel: 'blob_queue',
  notification_status: 'queued',
  created_at: '2026-07-01T00:00:00.000Z',
  payload: {
    first_proof_task: {
      type: 'first_proof_build',
      template_id: 'daily-intelligence-brief',
      template_name: 'Daily Intelligence Brief Agent',
      starter_kit_url: '/site/agent-templates/daily-intelligence-brief.json',
      price_hint: '11,000,000 MMK setup',
      first_proof_target: 'One-page morning brief with source trace and exact follow-up actions.',
      checklist: ['Open starter kit', 'Build first proof', 'Keep approval-only'],
      acceptance_tests: ['Shows source trace', 'Approval-only external actions', 'Uses approved source'],
      approval_required: true,
      human_gate: 'owner approval before send/write/payment actions',
    },
  },
  result: {
    status: 'ready',
    type: 'first_proof_operator_brief',
    template_id: 'daily-intelligence-brief',
    title: 'Daily Intelligence Brief Agent first proof',
    starter_kit_url: '/site/agent-templates/daily-intelligence-brief.json',
    first_proof_target: 'One-page morning brief with source trace and exact follow-up actions.',
    checklist: ['Open starter kit', 'Build first proof', 'Keep approval-only'],
    acceptance_tests: ['Shows source trace', 'Approval-only external actions', 'Uses approved source'],
    approval_required: true,
    human_gate: 'owner approval before send/write/payment actions',
  },
}

try {
  process.env.SUPERMEGA_OPS_KEY = 'test-ops-key'
  datastore.postgresConfigured = () => false
  blobQueue.findActionRecord = async ({ action_id: actionId, lead_id: leadId }) => {
    if ((actionId && actionId === row.action_id) || (leadId && leadId === row.lead_id)) {
      return { status: 'ready', adapter: 'vercel_blob', row }
    }
    return { status: 'error', adapter: 'vercel_blob', reason: 'action_not_found' }
  }
  blobQueue.updateActionRecord = async (_selector, patch = {}) => {
    row = {
      ...row,
      ...patch,
      payload: Object.prototype.hasOwnProperty.call(patch, 'payload') ? patch.payload : row.payload,
      result: Object.prototype.hasOwnProperty.call(patch, 'result') ? patch.result : row.result,
      updated_at: '2026-07-01T00:10:00.000Z',
    }
    return { status: 'ready', adapter: 'vercel_blob', action_id: row.action_id, record: row }
  }

  const orderRoom = await callHandler({
    body: JSON.stringify({
      operation: 'update_order_room',
      action_id: row.action_id,
      lead_id: row.lead_id,
      scope_approval_state: 'approved',
      price_approval_state: 'approved',
      payment_route_state: 'approved',
      payment_request_state: 'sent',
      payment_proof_state: 'proof_attached',
      payment_proof_reference: 'KBZ transfer screenshot BLOB-001',
      owner_note: 'Owner approved pilot scope and payment proof.',
    }),
  })
  const orderRoomBody = parseJson(orderRoom)
  assert.equal(orderRoom.statusCode, 200)
  assert.equal(orderRoomBody.operation, 'update_order_room')
  assert.equal(orderRoomBody.adapter, 'vercel_blob')
  assert.equal(orderRoomBody.primary_database.reason, 'postgres_not_configured')
  assert.equal(orderRoomBody.order_room_state.payment_proof_state, 'proof_attached')
  assert.equal(orderRoomBody.order_room_state.real_mrr_delta, 0)
  assert.equal(orderRoomBody.action.approval_state, 'approved')
  assert.equal(orderRoomBody.action.first_proof.pilot_order_room.private_workspace_manifest.status, 'ready_to_create_private_workspace')
  assert.equal(orderRoomBody.action.first_proof.pilot_order_room.private_workspace_manifest.create_workspace_allowed, true)
  assert.equal(orderRoomBody.action.first_proof.pilot_order_room.private_workspace_manifest.real_mrr_delta, 0)

  const workspace = await callHandler({
    body: JSON.stringify({
      operation: 'start_private_workspace',
      action_id: row.action_id,
      lead_id: row.lead_id,
    }),
  })
  const workspaceBody = parseJson(workspace)
  assert.equal(workspace.statusCode, 200)
  assert.equal(workspaceBody.operation, 'start_private_workspace')
  assert.equal(workspaceBody.adapter, 'vercel_blob')
  assert.equal(workspaceBody.operation_status, 'created')
  assert.equal(workspaceBody.primary_database.reason, 'postgres_not_configured')
  assert.equal(workspaceBody.private_workspace_manifest.status, 'private_workspace_created')
  assert.equal(workspaceBody.private_workspace_manifest.workspace_created, true)
  assert.equal(workspaceBody.private_workspace_manifest.payment_proof_reference, 'KBZ transfer screenshot BLOB-001')
  assert.equal(workspaceBody.private_workspace_manifest.real_mrr_delta, 0)
  assert.equal(workspaceBody.action.status, 'workspace_ready')
  assert.equal(workspaceBody.action.first_proof.pilot_order_room.private_workspace_manifest.status, 'private_workspace_created')
  assert.ok(workspaceBody.action.first_proof.pilot_order_room.private_workspace_handoff_packet.includes('First run mode: approval_only'))
  assert.ok(workspaceBody.private_workspace_manifest.guardrails.includes('no_real_mrr_claim_without_payment_proof'))

  console.log(
    JSON.stringify(
      {
        status: 'ready',
        contract: 'pipeline_control_blob_workspace',
        adapter: workspaceBody.adapter,
        order_room_state: orderRoomBody.order_room_state.payment_proof_state,
        workspace_status: workspaceBody.private_workspace_manifest.status,
        real_mrr_delta: workspaceBody.private_workspace_manifest.real_mrr_delta,
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
