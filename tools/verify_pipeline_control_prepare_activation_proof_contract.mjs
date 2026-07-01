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
if (typeof internals.prepareActivationFirstProof !== 'function') fail('prepare_activation_first_proof_missing')
if (typeof internals.buildActivationFirstProof !== 'function') fail('activation_first_proof_builder_missing')

const baseRow = {
  action_id: 'TASK-PROOF123',
  lead_id: 'LEAD-PROOF123',
  task_id: 'TASK-PROOF123',
  action_type: 'activation_session_first_proof',
  status: 'queued',
  priority: 'high',
  owner: 'Revenue Pod',
  title: 'Start Inbox and Calendar Agent first proof for Yangon Import Co',
  next_step: 'Build the first proof from the approved source sample.',
  approval_required: true,
  approval_state: 'pending',
  notification_channel: 'operator_console',
  notification_status: 'queued',
  created_at: '2026-07-01T00:00:00.000Z',
  payload: {
    lead: {
      lead_id: 'LEAD-PROOF123',
      task_id: 'TASK-PROOF123',
      company: 'Yangon Import Co',
      name: 'Daw May',
      requested_package: 'Inbox and Calendar Agent',
      public_package: 'Inbox and Calendar Agent',
      first_proof_target: 'Daily customer priority brief with reply drafts.',
      source_links: 'initial source note',
      goal: 'Summarize sales messages and identify urgent customers.',
      price_hint: '8,000,000 MMK setup',
    },
    first_proof_task: {
      type: 'first_proof_build',
      template_id: 'inbox-and-calendar-agent',
      template_name: 'Inbox and Calendar Agent',
      first_proof_target: 'Daily customer priority brief with reply drafts.',
      source_trace: ['operator_session: initial source note'],
      checklist: ['Review source sample', 'Build first proof', 'Queue reply for owner approval'],
      acceptance_tests: ['Mentions urgent customers', 'Shows source trace', 'Keeps reply drafts approval-only'],
      approval_required: true,
      human_gate: 'owner approval before send/write/payment/browser actions',
    },
  },
  result: {
    status: 'ready',
    type: 'first_proof_operator_brief',
    template_id: 'inbox-and-calendar-agent',
    template_name: 'Inbox and Calendar Agent',
    first_proof_target: 'Daily customer priority brief with reply drafts.',
    checklist: ['Review source sample', 'Build first proof', 'Queue reply for owner approval'],
    acceptance_tests: ['Mentions urgent customers', 'Shows source trace', 'Keeps reply drafts approval-only'],
    approval_required: true,
    human_gate: 'owner approval before send/write/payment/browser actions',
  },
}

let updatePatch = null

try {
  process.env.SUPERMEGA_OPS_KEY = 'test-ops-key'
  datastore.postgresConfigured = () => false
  blobQueue.findActionRecord = async (selector) => {
    assert.equal(selector.action_id, 'TASK-PROOF123')
    assert.equal(selector.lead_id, 'LEAD-PROOF123')
    return { status: 'ready', adapter: 'vercel_blob', row: baseRow }
  }
  blobQueue.updateActionRecord = async (selector, patch) => {
    assert.equal(selector.action_id, 'TASK-PROOF123')
    assert.equal(selector.lead_id, 'LEAD-PROOF123')
    updatePatch = patch
    return {
      status: 'ready',
      adapter: 'vercel_blob',
      record: {
        ...baseRow,
        ...patch,
        result: {
          ...baseRow.result,
          ...patch.result,
        },
      },
    }
  }

  const response = await callHandler({
    body: JSON.stringify({
      operation: 'prepare_activation_first_proof',
      action_id: 'TASK-PROOF123',
      lead_id: 'LEAD-PROOF123',
      approved_source_sample: [
        '09:10 - Customer A asked if the missing invoice can be resent today.',
        '09:25 - Customer B has paid but receipt is not matched to the order.',
        '10:05 - Customer C asked for tomorrow delivery confirmation.',
      ].join('\n'),
      source_reference: 'operator-approved WhatsApp export 2026-07-01',
      operator_note: 'Use only this source sample for the proof.',
    }),
  })
  const body = parseJson(response)

  assert.equal(response.statusCode, 200)
  assert.equal(body.status, 'ready')
  assert.equal(body.operation, 'prepare_activation_first_proof')
  assert.equal(body.operation_status, 'prepared')
  assert.equal(body.adapter, 'vercel_blob')
  assert.equal(body.activation_first_proof.status, 'activation_first_proof_ready')
  assert.equal(body.activation_first_proof.approval_required, true)
  assert.equal(body.activation_first_proof.external_action_state, 'blocked_until_owner_approval')
  assert.equal(body.activation_first_proof.connector_write_state, 'blocked_until_owner_approval')
  assert.equal(body.activation_first_proof.browser_action_state, 'blocked_until_owner_approval')
  assert.equal(body.activation_first_proof.payment_request_state, 'blocked_until_owner_approval')
  assert.equal(body.activation_first_proof.real_mrr_delta, 0)
  assert.ok(body.activation_first_proof.source_trace.some((item) => item.includes('operator-approved WhatsApp export')))
  assert.ok(body.activation_first_proof.extracted_signals.length >= 3)
  assert.ok(body.activation_first_proof.proof_delivery_packet.includes('Customer A'))
  assert.ok(body.activation_first_proof.proof_delivery_packet.includes('Customer B'))
  assert.ok(body.activation_first_proof.proof_delivery_packet.includes('Customer C'))
  assert.ok(body.activation_first_proof.proof_delivery_packet.includes('owner approval'))
  assert.ok(body.activation_first_proof.buyer_reply_draft.includes('will not send'))
  assert.equal(body.action.status, 'proof_ready')
  assert.equal(body.action.first_proof.status, 'operator_brief_ready')
  assert.ok(body.action.first_proof.proof_delivery_packet.includes('Customer A'))
  assert.ok(updatePatch, 'blob_update_patch_missing')
  assert.equal(updatePatch.status, 'proof_ready')
  assert.equal(updatePatch.result.activation_first_proof.real_mrr_delta, 0)

  console.log(
    JSON.stringify(
      {
        status: 'ready',
        audit: 'pipeline-control-prepare-activation-proof',
        adapter: body.adapter,
        operation_status: body.operation_status,
        extracted_signals: body.activation_first_proof.extracted_signals.length,
        real_mrr_delta: body.activation_first_proof.real_mrr_delta,
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
