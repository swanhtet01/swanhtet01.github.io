import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { Readable, Writable } from 'node:stream'

const require = createRequire(import.meta.url)
const datastore = require('../api/lib/supermega-datastore.js')
const blobQueue = require('../api/lib/supermega-blob-queue.js')
const handler = require('../api/pipeline-control.js')

const originalOpsKey = process.env.SUPERMEGA_OPS_KEY
const originalPostgresConfigured = datastore.postgresConfigured
const originalQuery = datastore.query
const originalFindActionRecord = blobQueue.findActionRecord
const originalUpdateActionRecord = blobQueue.updateActionRecord

function callHandler({ body }) {
  return new Promise((resolve, reject) => {
    const req = Readable.from([JSON.stringify(body)])
    req.method = 'POST'
    req.url = '/api/pipeline-control'
    req.headers = {
      authorization: 'Bearer test-ops-key',
      'content-type': 'application/json',
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
      resolve({ statusCode: res.statusCode, body: responseBody })
    }

    Promise.resolve(handler(req, res)).catch(reject)
  })
}

function parseJson(response) {
  return JSON.parse(response.body)
}

const submittedPack = {
  status: 'client_source_pack_submitted',
  submission_type: 'client_source_pack',
  lead_id: 'LEAD-SUBMITTED-PROOF-001',
  action_id: 'TASK-SUBMITTED-PROOF-001',
  source_pack_name: 'Client approved first-proof source pack',
  source_count: 2,
  sources: [
    {
      source_id: 'SRC-01',
      source_type: 'gmail_or_chat',
      reference: 'Customer message sample',
      content: 'Customer asks for weekly stock, unpaid orders, and urgent follow-up summary.',
      approved: true,
    },
    {
      source_id: 'SRC-02',
      source_type: 'spreadsheet_or_pos_export',
      reference: 'Order export sample',
      content: 'order_id,total,status\\nA-100,120000,unpaid',
      approved: true,
    },
  ],
  external_action_state: 'blocked_until_owner_approval',
  connector_write_state: 'blocked_until_owner_approval',
  payment_request_state: 'blocked_until_owner_approval',
  real_mrr_delta: 0,
}

const actionRow = {
  id: 101,
  action_id: 'TASK-SUBMITTED-PROOF-001',
  lead_id: 'LEAD-SUBMITTED-PROOF-001',
  task_id: 'TASK-SUBMITTED-PROOF-001',
  action_type: 'activation_session_first_proof',
  status: 'client_source_pack_received',
  priority: 'high',
  owner: 'Revenue Pod',
  title: 'AI Workcell first proof for Yangon Import Co',
  next_step: 'Review submitted source pack, attach it for first proof, then prepare first proof.',
  approval_required: true,
  approval_state: 'pending_source_review',
  notification_channel: 'email',
  notification_status: 'client_source_pack_received',
  payload: {
    lead: { company: 'Yangon Import Co', name: 'Daw May' },
    first_proof_task: {
      type: 'first_proof_build',
      template_name: 'AI Workcell Pilot',
      first_proof_target: 'Daily customer priority brief with three owner-approved reply drafts.',
      acceptance_tests: ['Shows useful output from approved source pack.', 'Keeps external actions blocked.'],
    },
    client_source_pack_submission: submittedPack,
  },
  result: {
    type: 'first_proof_operator_brief',
    template_name: 'AI Workcell Pilot',
    first_proof_target: 'Daily customer priority brief with three owner-approved reply drafts.',
    client_source_pack_submission: submittedPack,
  },
  created_at: '2026-07-01T00:00:00.000Z',
}

let updateSql = ''
let updateParams = []

try {
  process.env.SUPERMEGA_OPS_KEY = 'test-ops-key'
  datastore.postgresConfigured = () => true
  datastore.query = async (sql, params = []) => {
    if (sql.includes('information_schema.columns')) return { status: 'ready', rows: [{ has_result: true }] }
    if (sql.includes('select') && sql.includes('from public.supermega_pipeline_actions') && !sql.includes('update public.supermega_pipeline_actions')) {
      return { status: 'ready', rows: [actionRow] }
    }
    if (sql.includes('update public.supermega_pipeline_actions')) {
      updateSql = sql
      updateParams = params
      const result = JSON.parse(params[1])
      return {
        status: 'ready',
        rows: [
          {
            ...actionRow,
            status: 'proof_ready',
            approval_state: 'pending_owner_review',
            notification_status: 'first_proof_prepared_from_submitted_pack',
            next_step: 'Review the source-derived first proof, then queue the buyer reply for owner approval.',
            result,
          },
        ],
      }
    }
    return { status: 'error', reason: 'unexpected_sql' }
  }
  blobQueue.findActionRecord = async () => ({ status: 'skipped', reason: 'blob_action_not_found' })
  blobQueue.updateActionRecord = async () => ({ status: 'skipped', reason: 'blob_action_not_found' })

  const response = await callHandler({
    body: {
      operation: 'prepare_first_proof_from_submitted_source_pack',
      action_id: 'TASK-SUBMITTED-PROOF-001',
      lead_id: 'LEAD-SUBMITTED-PROOF-001',
      operator_note: 'Owner reviewed submitted pack and approved first-proof preparation only.',
    },
  })
  const body = parseJson(response)

  assert.equal(response.statusCode, 200)
  assert.equal(body.status, 'ready')
  assert.equal(body.operation, 'prepare_first_proof_from_submitted_source_pack')
  assert.equal(body.operation_status, 'prepared')
  assert.equal(body.action.status, 'proof_ready')
  assert.equal(body.action.approval_state, 'pending_owner_review')
  assert.equal(body.activation_source_pack.status, 'source_pack_attached')
  assert.equal(body.activation_source_pack.source_count, 2)
  assert.equal(body.activation_source_pack.external_action_state, 'blocked_until_owner_approval')
  assert.equal(body.activation_source_pack.real_mrr_delta, 0)
  assert.equal(body.activation_first_proof.status, 'activation_first_proof_ready')
  assert.equal(body.activation_first_proof.external_action_state, 'blocked_until_owner_approval')
  assert.equal(body.activation_first_proof.real_mrr_delta, 0)
  assert.equal(body.action.first_proof.activation_source_pack.source_count, 2)
  assert.ok(body.action.first_proof.activation_source_pack_json.includes('Customer message sample'))
  assert.ok(body.activation_first_proof.proof_delivery_packet.includes('Customer asks for weekly stock'))
  assert.ok(body.action.first_proof.activation_first_proof.proof_delivery_packet.includes('Owner action queue'))
  assert.ok(updateSql.includes('first_proof_prepared_from_submitted_pack'))
  assert.equal(updateParams.length >= 2, true)
  assert.equal(JSON.parse(updateParams[1]).activation_source_pack.source_count, 2)

  const missingSubmissionRow = {
    ...actionRow,
    payload: { first_proof_task: actionRow.payload.first_proof_task },
    result: { type: 'first_proof_operator_brief' },
  }
  datastore.query = async (sql) => {
    if (sql.includes('information_schema.columns')) return { status: 'ready', rows: [{ has_result: true }] }
    if (sql.includes('select') && sql.includes('from public.supermega_pipeline_actions') && !sql.includes('update public.supermega_pipeline_actions')) {
      return { status: 'ready', rows: [missingSubmissionRow] }
    }
    return { status: 'error', reason: 'should_not_update_without_submission' }
  }
  const missingResponse = await callHandler({
    body: {
      operation: 'prepare_first_proof_from_submitted_source_pack',
      action_id: 'TASK-SUBMITTED-PROOF-001',
    },
  })
  const missingBody = parseJson(missingResponse)
  assert.equal(missingResponse.statusCode, 409)
  assert.equal(missingBody.status, 'error')
  assert.equal(missingBody.reason, 'client_source_pack_submission_required')

  console.log(JSON.stringify({
    status: 'ready',
    contract: 'submitted_source_pack_to_first_proof',
    operation_status: body.operation_status,
    source_count: body.activation_source_pack.source_count,
    proof_status: body.activation_first_proof.status,
    real_mrr_delta: body.activation_first_proof.real_mrr_delta,
  }, null, 2))
} finally {
  if (originalOpsKey === undefined) delete process.env.SUPERMEGA_OPS_KEY
  else process.env.SUPERMEGA_OPS_KEY = originalOpsKey
  datastore.postgresConfigured = originalPostgresConfigured
  datastore.query = originalQuery
  blobQueue.findActionRecord = originalFindActionRecord
  blobQueue.updateActionRecord = originalUpdateActionRecord
}
