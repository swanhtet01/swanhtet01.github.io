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
if (typeof internals.attachActivationSourcePack !== 'function') fail('attach_activation_source_pack_missing')
if (typeof internals.buildActivationSourcePack !== 'function') fail('activation_source_pack_builder_missing')

const baseRow = {
  action_id: 'TASK-SOURCEPACK123',
  lead_id: 'LEAD-SOURCEPACK123',
  task_id: 'TASK-SOURCEPACK123',
  action_type: 'activation_session_first_proof',
  status: 'queued',
  priority: 'high',
  owner: 'Revenue Pod',
  title: 'Start Owner Ops Agent first proof for Yangon Retail Co',
  next_step: 'Attach approved sources before proof generation.',
  approval_required: true,
  approval_state: 'pending',
  notification_channel: 'operator_console',
  notification_status: 'queued',
  created_at: '2026-07-01T00:00:00.000Z',
  payload: {
    lead: {
      lead_id: 'LEAD-SOURCEPACK123',
      task_id: 'TASK-SOURCEPACK123',
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
      checklist: ['Attach sources', 'Build proof', 'Queue reply for approval'],
      acceptance_tests: ['Uses source pack', 'Shows source trace', 'Approval-only buyer reply'],
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
    approval_required: true,
    human_gate: 'owner approval before send/write/payment/browser actions',
  },
}

let currentRow = JSON.parse(JSON.stringify(baseRow))
let attachPatch = null
let proofPatch = null

try {
  process.env.SUPERMEGA_OPS_KEY = 'test-ops-key'
  datastore.postgresConfigured = () => false
  blobQueue.findActionRecord = async (selector) => {
    assert.equal(selector.action_id, 'TASK-SOURCEPACK123')
    assert.equal(selector.lead_id, 'LEAD-SOURCEPACK123')
    return { status: 'ready', adapter: 'vercel_blob', row: currentRow }
  }
  blobQueue.updateActionRecord = async (selector, patch) => {
    assert.equal(selector.action_id, 'TASK-SOURCEPACK123')
    assert.equal(selector.lead_id, 'LEAD-SOURCEPACK123')
    if (patch.result?.activation_source_pack) attachPatch = patch
    if (patch.result?.activation_first_proof) proofPatch = patch
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

  const attachResponse = await callHandler({
    body: JSON.stringify({
      operation: 'attach_activation_source_pack',
      action_id: 'TASK-SOURCEPACK123',
      lead_id: 'LEAD-SOURCEPACK123',
      source_pack_name: 'Day 1 owner ops samples',
      sources: [
        {
          source_type: 'google_drive',
          reference: 'Drive folder: Owner Ops July',
          content: 'Invoice spreadsheet has 14 unpaid rows. Three rows have no follow-up owner.',
        },
        {
          source_type: 'gmail',
          reference: 'Gmail label: urgent-customers',
          content: 'Customer A asked for invoice resend. Customer B sent transfer screenshot.',
        },
        {
          source_type: 'uploaded_file',
          reference: 'POS export July 1',
          content: 'Top unpaid order is 820,000 MMK. Delivery confirmation missing for tomorrow.',
        },
      ],
    }),
  })
  const attachBody = parseJson(attachResponse)

  assert.equal(attachResponse.statusCode, 200)
  assert.equal(attachBody.status, 'ready')
  assert.equal(attachBody.operation, 'attach_activation_source_pack')
  assert.equal(attachBody.operation_status, 'attached')
  assert.equal(attachBody.adapter, 'vercel_blob')
  assert.equal(attachBody.activation_source_pack.status, 'source_pack_attached')
  assert.equal(attachBody.activation_source_pack.source_count, 3)
  assert.equal(attachBody.activation_source_pack.approved_source_count, 3)
  assert.equal(attachBody.activation_source_pack.connector_state, 'reference_only_until_connector_approval')
  assert.equal(attachBody.activation_source_pack.external_action_state, 'blocked_until_owner_approval')
  assert.equal(attachBody.activation_source_pack.real_mrr_delta, 0)
  assert.ok(attachBody.activation_source_pack.combined_source_text.includes('Customer A'))
  assert.ok(attachBody.activation_source_pack.combined_source_text.includes('820,000 MMK'))
  assert.equal(attachBody.action.status, 'source_pack_attached')
  assert.ok(attachPatch, 'source_pack_update_patch_missing')

  const proofResponse = await callHandler({
    body: JSON.stringify({
      operation: 'prepare_activation_first_proof',
      action_id: 'TASK-SOURCEPACK123',
      lead_id: 'LEAD-SOURCEPACK123',
      operator_note: 'Use attached source pack. No additional pasted source.',
    }),
  })
  const proofBody = parseJson(proofResponse)

  assert.equal(proofResponse.statusCode, 200)
  assert.equal(proofBody.status, 'ready')
  assert.equal(proofBody.operation_status, 'prepared')
  assert.equal(proofBody.activation_first_proof.status, 'activation_first_proof_ready')
  assert.equal(proofBody.activation_first_proof.human_gate, 'owner approval before send/write/payment/browser actions')
  assert.ok(proofBody.activation_first_proof.proof_delivery_packet.includes('Customer A'))
  assert.ok(proofBody.activation_first_proof.proof_delivery_packet.includes('820,000 MMK'))
  assert.ok(proofBody.activation_first_proof.source_trace.some((item) => item.includes('Drive folder')))
  assert.equal(proofBody.activation_first_proof.real_mrr_delta, 0)
  assert.equal(proofBody.action.status, 'proof_ready')
  assert.ok(proofPatch, 'source_pack_proof_update_patch_missing')

  console.log(
    JSON.stringify(
      {
        status: 'ready',
        audit: 'pipeline-control-attach-source-pack',
        operation_status: attachBody.operation_status,
        source_count: attachBody.activation_source_pack.source_count,
        proof_status: proofBody.activation_first_proof.status,
        real_mrr_delta: proofBody.activation_first_proof.real_mrr_delta,
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
