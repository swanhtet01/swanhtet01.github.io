import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { Readable, Writable } from 'node:stream'

const require = createRequire(import.meta.url)
const datastore = require('../api/lib/supermega-datastore.js')
const blobQueue = require('../api/lib/supermega-blob-queue.js')
const handler = require('../api/pipeline-control.js')

const originalOpsKey = process.env.SUPERMEGA_OPS_KEY
const originalPostgresConfigured = datastore.postgresConfigured
const originalSaveLeadLedger = datastore.saveLeadLedger
const originalSaveDatastorePipelineAction = datastore.savePipelineAction
const originalSavePipelineAction = blobQueue.savePipelineAction

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
if (typeof internals.startActivationSession !== 'function') fail('pipeline_control_start_activation_session_missing')
if (typeof internals.buildActivationSessionLead !== 'function') fail('activation_session_lead_builder_missing')
if (typeof internals.buildActivationSessionActionPayload !== 'function') fail('activation_session_action_builder_missing')

let capturedAction = null

try {
  process.env.SUPERMEGA_OPS_KEY = 'test-ops-key'
  datastore.postgresConfigured = () => false
  blobQueue.savePipelineAction = async (payload) => {
    capturedAction = payload
    return {
      status: 'ready',
      adapter: 'vercel_blob',
      table: 'supermega_pipeline_actions',
      action_id: payload.action_id,
      pathname: `supermega/action-queue/actions/${payload.action_id}.json`,
      access: 'private',
    }
  }

  const response = await callHandler({
    body: JSON.stringify({
      operation: 'start_activation_session',
      company: 'Yangon Import Co',
      name: 'Daw May',
      email: 'owner@example.com',
      requested_package: 'Inbox and Calendar Agent',
      buyer_goal: 'Summarize sales messages, identify urgent customers, and draft owner-approved replies.',
      source_sample: 'https://drive.example.com/sample-folder',
      first_proof_target: 'Daily customer priority brief with three reply drafts.',
      price_hint: '8,000,000 MMK setup',
    }),
  })
  const body = parseJson(response)

  assert.equal(response.statusCode, 200)
  assert.equal(body.status, 'ready')
  assert.equal(body.operation, 'start_activation_session')
  assert.equal(body.operation_status, 'activation_session_started')
  assert.equal(body.adapter, 'vercel_blob')
  assert.equal(body.approval_required, true)
  assert.equal(body.approval_state, 'pending')
  assert.equal(body.external_action_state, 'blocked_until_owner_approval')
  assert.equal(body.connector_write_state, 'blocked_until_owner_approval')
  assert.equal(body.browser_action_state, 'blocked_until_owner_approval')
  assert.equal(body.payment_request_state, 'blocked_until_owner_approval')
  assert.equal(body.real_mrr_delta, 0)
  assert.ok(body.operator_next_step.includes('Refresh queue'))
  assert.ok(Array.isArray(body.runtime_guardrails))
  assert.ok(body.runtime_guardrails.some((item) => item.includes('Real MRR remains 0')))
  assert.ok(body.lead.lead_id.startsWith('LEAD-'))
  assert.ok(body.action.action_id.startsWith('TASK-'))
  assert.equal(body.action.approval_required, true)
  assert.equal(body.action.approval_state, 'pending')
  assert.equal(body.action.first_proof.status, 'operator_brief_ready')
  assert.equal(body.action.first_proof.pilot_order_room.state.real_mrr_delta, 0)
  assert.equal(body.first_proof_task.type, 'first_proof_build')
  assert.equal(body.first_proof_task.approval_required, true)
  assert.ok(body.first_proof_task.client_kickoff_pack.packet.includes('client kickoff pack'))
  assert.ok(body.first_proof_task.implementation_blueprint_pack.packet.includes('implementation blueprint'))
  assert.equal(body.activation_session.external_action_state, 'blocked_until_owner_approval')
  assert.equal(body.activation_session.real_mrr_delta, 0)

  assert.ok(capturedAction, 'blob_action_not_captured')
  assert.equal(capturedAction.action_type, 'activation_session_first_proof')
  assert.equal(capturedAction.approval_required, true)
  assert.equal(capturedAction.payload.activation_session.payment_request_state, 'blocked_until_owner_approval')
  assert.equal(capturedAction.payload.activation_session.real_mrr_delta, 0)
  assert.equal(capturedAction.result.pilot_order_room_state.real_mrr_delta, 0)

  let mirroredAction = null
  datastore.postgresConfigured = () => true
  datastore.saveLeadLedger = async (payload) => ({
    status: 'ready',
    adapter: 'vercel_postgres_neon',
    table: 'supermega_leads',
    lead_id: payload.lead_id,
  })
  datastore.savePipelineAction = async (payload) => ({
    status: 'ready',
    adapter: 'vercel_postgres_neon',
    table: 'supermega_pipeline_actions',
    action_id: payload.action_id,
  })
  blobQueue.savePipelineAction = async (payload) => {
    mirroredAction = payload
    return {
      status: 'ready',
      adapter: 'vercel_blob',
      table: 'supermega_pipeline_actions',
      action_id: payload.action_id,
      pathname: `supermega/action-queue/actions/${payload.action_id}.json`,
      access: 'private',
    }
  }

  const dualWriteResponse = await callHandler({
    body: JSON.stringify({
      operation: 'start_activation_session',
      company: 'Dual Write Smoke Co',
      requested_package: 'Managed AI Workcell',
      buyer_goal: 'Prove primary SQL writes are mirrored to the Blob cockpit queue.',
      source_sample: 'internal dual write sample',
      first_proof_target: 'Dual-write first proof packet.',
    }),
  })
  const dualWriteBody = parseJson(dualWriteResponse)
  assert.equal(dualWriteResponse.statusCode, 200)
  assert.equal(dualWriteBody.status, 'ready')
  assert.equal(dualWriteBody.adapter, 'vercel_postgres_neon_with_blob_queue')
  assert.equal(dualWriteBody.persistence.primary.action.status, 'ready')
  assert.equal(dualWriteBody.persistence.fallback.status, 'ready')
  assert.ok(mirroredAction, 'primary_success_blob_mirror_missing')
  assert.equal(mirroredAction.payload.activation_session.external_action_state, 'blocked_until_owner_approval')
  assert.equal(mirroredAction.payload.activation_session.real_mrr_delta, 0)

  console.log(
    JSON.stringify(
      {
        status: 'ready',
        audit: 'pipeline-control-activation-session',
        adapter: body.adapter,
        operation_status: body.operation_status,
        lead_id_prefix: body.lead.lead_id.slice(0, 5),
        real_mrr_delta: body.real_mrr_delta,
      },
      null,
      2,
    ),
  )
} finally {
  if (originalOpsKey === undefined) delete process.env.SUPERMEGA_OPS_KEY
  else process.env.SUPERMEGA_OPS_KEY = originalOpsKey
  datastore.postgresConfigured = originalPostgresConfigured
  datastore.saveLeadLedger = originalSaveLeadLedger
  datastore.savePipelineAction = originalSaveDatastorePipelineAction
  blobQueue.savePipelineAction = originalSavePipelineAction
}
