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

const createdState = {
  status: 'persisted_order_room_state',
  action_id: 'TASK-FALLBACK123',
  lead_id: 'LEAD-FALLBACK123',
  scope_approval_state: 'approved',
  price_approval_state: 'approved',
  payment_route_state: 'approved',
  payment_request_state: 'sent',
  payment_proof_state: 'proof_attached',
  private_workspace_state: 'created_after_payment_proof',
  private_workspace_slug: 'pilot-daily-intelligence-brief-lead-fallback123',
  private_workspace_url: 'https://supermega.dev/app/start?workspace=pilot-daily-intelligence-brief-lead-fallback123&lead=LEAD-FALLBACK123',
  payment_proof_reference: 'payment-proof-fallback',
  workspace_created_at: '2026-07-01T01:00:00.000Z',
  workspace_created_by: 'operator_console',
  real_mrr_delta: 0,
}

const firstProductionRun = {
  status: 'first_production_run_recorded',
  workspace_slug: createdState.private_workspace_slug,
  lead_id: createdState.lead_id,
  template_id: 'daily-intelligence-brief',
  template_name: 'Daily Intelligence Brief Agent',
  output: 'Daily owner brief with invoices, urgent replies, delivery follow-up, and refund checks.',
  source_trace: ['Gmail urgent-customers', 'Drive owner-ops sheet', 'POS export'],
  evidence_reference: 'first-run-output-fallback',
  first_run_state: 'ready_for_owner_acceptance',
  external_action_state: 'approval_only_until_owner_acceptance',
  connector_write_state: 'blocked_until_owner_acceptance',
  recurring_revenue_state: 'not_claimed',
  real_mrr_delta: 0,
  packet: '# first run packet',
  ledger_csv: '"run_status"\n"first_production_run_recorded"',
}

function baseRow(resultExtra = {}) {
  return {
    action_id: 'TASK-FALLBACK123',
    lead_id: 'LEAD-FALLBACK123',
    task_id: 'task-fallback123',
    action_type: 'lead_followup',
    status: 'first_run_output_ready',
    priority: 'high',
    owner: 'Revenue Pod',
    title: 'Build first proof',
    next_step: 'Prepare owner acceptance.',
    approval_required: true,
    approval_state: 'approved',
    notification_channel: 'console',
    notification_status: 'queued',
    created_at: '2026-07-01T00:00:00.000Z',
    payload: {
      first_proof_task: {
        type: 'first_proof_build',
        template_id: 'daily-intelligence-brief',
        template_name: 'Daily Intelligence Brief Agent',
        starter_kit_url: '/site/agent-templates/daily-intelligence-brief.json',
        price_hint: '11,000,000 MMK setup',
        first_proof_target: 'One-page morning brief with what changed.',
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
      first_proof_target: 'One-page morning brief with what changed.',
      checklist: ['Open starter kit', 'Build first proof', 'Keep approval-only'],
      acceptance_tests: ['Shows source trace', 'Approval-only external actions', 'Uses approved source'],
      approval_required: true,
      human_gate: 'owner approval before send/write/payment actions',
      pilot_order_room_state: createdState,
      first_production_run: firstProductionRun,
      ...resultExtra,
    },
  }
}

try {
  process.env.SUPERMEGA_OPS_KEY = 'test-ops-key'
  datastore.postgresConfigured = () => true
  datastore.query = async () => ({ status: 'error', reason: 'column "result" does not exist', code: '42703' })

  let currentRow = baseRow()
  let acceptancePatch = null
  let ownerPatch = null
  blobQueue.findActionRecord = async (selector) => {
    assert.equal(selector.action_id, 'TASK-FALLBACK123')
    assert.equal(selector.lead_id, 'LEAD-FALLBACK123')
    return { status: 'ready', adapter: 'vercel_blob', row: currentRow }
  }
  blobQueue.updateActionRecord = async (selector, patch) => {
    assert.equal(selector.action_id, 'TASK-FALLBACK123')
    assert.equal(selector.lead_id, 'LEAD-FALLBACK123')
    if (patch.result?.first_run_acceptance) acceptancePatch = patch
    if (patch.result?.owner_acceptance) ownerPatch = patch
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

  const prepared = await callHandler({
    body: JSON.stringify({
      operation: 'prepare_first_run_acceptance',
      action_id: 'TASK-FALLBACK123',
      lead_id: 'LEAD-FALLBACK123',
      first_run_evidence_reference: 'first-run-output-fallback',
    }),
  })
  const preparedBody = parseJson(prepared)
  assert.equal(prepared.statusCode, 200)
  assert.equal(preparedBody.adapter, 'vercel_blob')
  assert.equal(preparedBody.operation_status, 'prepared')
  assert.equal(preparedBody.first_run_acceptance.status, 'first_run_acceptance_packet_ready')
  assert.equal(preparedBody.first_run_acceptance.first_production_run_status, 'first_production_run_recorded')
  assert.ok(preparedBody.first_run_acceptance.acceptance_packet.includes('Daily owner brief with invoices'))
  assert.ok(acceptancePatch, 'blob_first_run_acceptance_patch_missing')

  const accepted = await callHandler({
    body: JSON.stringify({
      operation: 'record_owner_acceptance',
      action_id: 'TASK-FALLBACK123',
      lead_id: 'LEAD-FALLBACK123',
      owner_acceptance_decision: 'accepted',
      owner_acceptance_reference: 'owner-accepted-fallback',
      owner_note: 'Accepted after Blob fallback acceptance packet.',
    }),
  })
  const acceptedBody = parseJson(accepted)
  assert.equal(accepted.statusCode, 200)
  assert.equal(acceptedBody.adapter, 'vercel_blob')
  assert.equal(acceptedBody.operation_status, 'recorded')
  assert.equal(acceptedBody.owner_acceptance.status, 'owner_acceptance_recorded')
  assert.equal(acceptedBody.owner_acceptance.decision, 'accepted')
  assert.equal(acceptedBody.action.status, 'owner_accepted_first_run')
  assert.ok(ownerPatch, 'blob_owner_acceptance_patch_missing')

  console.log(
    JSON.stringify(
      {
        status: 'ready',
        audit: 'pipeline-control-acceptance-blob-fallback',
        acceptance_adapter: preparedBody.adapter,
        owner_acceptance_adapter: acceptedBody.adapter,
        acceptance_status: preparedBody.first_run_acceptance.status,
        owner_acceptance_status: acceptedBody.owner_acceptance.status,
      },
      null,
      2,
    ),
  )
} finally {
  if (originalOpsKey === undefined) delete process.env.SUPERMEGA_OPS_KEY
  else process.env.SUPERMEGA_OPS_KEY = originalOpsKey
  datastore.postgresConfigured = originalPostgresConfigured
  datastore.query = originalQuery
  blobQueue.findActionRecord = originalFindActionRecord
  blobQueue.updateActionRecord = originalUpdateActionRecord
}
