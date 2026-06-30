import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { Readable, Writable } from 'node:stream'

const require = createRequire(import.meta.url)
const datastore = require('../api/lib/supermega-datastore.js')
const handler = require('../api/pipeline-control.js')

const originalOpsKey = process.env.SUPERMEGA_OPS_KEY
const originalPostgresConfigured = datastore.postgresConfigured
const originalQuery = datastore.query

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
  action_id: 'TASK-TEST123',
  lead_id: 'LEAD-TEST123',
  scope_approval_state: 'approved',
  price_approval_state: 'approved',
  payment_route_state: 'approved',
  payment_request_state: 'sent',
  payment_proof_state: 'proof_attached',
  private_workspace_state: 'created_after_payment_proof',
  private_workspace_slug: 'pilot-daily-intelligence-brief-lead-test123',
  private_workspace_url: 'https://app.supermega.dev/login?next=%2Fapp%2Fstart%3Fworkspace%3Dpilot-daily-intelligence-brief-lead-test123%26lead%3DLEAD-TEST123',
  payment_proof_reference: 'KBZ transfer screenshot 123',
  workspace_created_at: '2026-06-30T01:00:00.000Z',
  workspace_created_by: 'operator_console',
  real_mrr_delta: 0,
}

const firstRunAcceptance = {
  status: 'first_run_acceptance_packet_ready',
  workspace_slug: 'pilot-daily-intelligence-brief-lead-test123',
  lead_id: 'LEAD-TEST123',
  template_id: 'daily-intelligence-brief',
  template_name: 'Daily Intelligence Brief Agent',
  first_run_state: 'draft_ready_for_owner_review',
  acceptance_state: 'owner_acceptance_required',
  external_action_state: 'blocked_until_owner_acceptance',
  connector_write_state: 'blocked_until_owner_acceptance',
  recurring_revenue_state: 'not_claimed',
  evidence_reference: 'workspace output draft 001',
  real_mrr_delta: 0,
}

const ownerAcceptance = {
  status: 'owner_acceptance_recorded',
  decision: 'accepted',
  workspace_slug: 'pilot-daily-intelligence-brief-lead-test123',
  lead_id: 'LEAD-TEST123',
  template_name: 'Daily Intelligence Brief Agent',
  evidence_reference: 'owner approval message 001',
  first_run_state: 'accepted_for_next_approval_only_run',
  external_action_state: 'approval_only_next_run_allowed',
  connector_write_state: 'blocked_until_explicit_policy',
  recurring_revenue_state: 'not_claimed',
  real_mrr_delta: 0,
}

function baseRow(resultExtra = {}) {
  return {
    action_id: 'TASK-TEST123',
    lead_id: 'LEAD-TEST123',
    task_id: 'task-test123',
    action_type: 'lead_followup',
    status: 'owner_accepted_first_run',
    priority: 'high',
    owner: 'Revenue Pod',
    title: 'Build first proof',
    next_step: 'Run the next production cycle approval-only.',
    approval_required: true,
    approval_state: 'approved',
    notification_channel: 'console',
    notification_status: 'queued',
    created_at: '2026-06-30T00:00:00.000Z',
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
      first_run_acceptance: firstRunAcceptance,
      ...resultExtra,
    },
  }
}

try {
  process.env.SUPERMEGA_OPS_KEY = 'test-ops-key'
  datastore.postgresConfigured = () => true

  const missingReference = await callHandler({
    body: JSON.stringify({
      operation: 'record_connector_policy',
      action_id: 'TASK-TEST123',
      lead_id: 'LEAD-TEST123',
      connector_policy_mode: 'approval_only',
    }),
  })
  assert.equal(missingReference.statusCode, 400)
  assert.equal(parseJson(missingReference).reason, 'missing_connector_policy_reference')

  datastore.query = async () => ({ status: 'ready', rows: [baseRow()], rowCount: 1 })
  const blocked = await callHandler({
    body: JSON.stringify({
      operation: 'record_connector_policy',
      action_id: 'TASK-TEST123',
      lead_id: 'LEAD-TEST123',
      connector_policy_mode: 'approval_only',
      connector_policy_reference: 'owner connector policy note 001',
    }),
  })
  assert.equal(blocked.statusCode, 409)
  assert.equal(parseJson(blocked).reason, 'owner_acceptance_required')

  datastore.query = async () => ({
    status: 'ready',
    rows: [baseRow({ owner_acceptance: { ...ownerAcceptance, decision: 'changes_requested' } })],
    rowCount: 1,
  })
  const rejected = await callHandler({
    body: JSON.stringify({
      operation: 'record_connector_policy',
      action_id: 'TASK-TEST123',
      lead_id: 'LEAD-TEST123',
      connector_policy_mode: 'approval_only',
      connector_policy_reference: 'owner connector policy note 001',
    }),
  })
  assert.equal(rejected.statusCode, 409)
  assert.equal(parseJson(rejected).reason, 'owner_acceptance_not_accepted')

  let queryCount = 0
  datastore.query = async (sql, params) => {
    queryCount += 1
    if (queryCount === 1) {
      assert.ok(sql.includes('from public.supermega_pipeline_actions'), 'connector_policy_select_missing')
      assert.equal(params[0], 'TASK-TEST123')
      assert.equal(params[1], 'LEAD-TEST123')
      return { status: 'ready', rows: [baseRow({ owner_acceptance: ownerAcceptance })], rowCount: 1 }
    }
    assert.ok(sql.includes("'{connector_policy}'"), 'connector_policy_jsonb_set_missing')
    assert.ok(sql.includes("'{connector_policy_recorded_at}'"), 'connector_policy_recorded_at_missing')
    const connectorPolicy = JSON.parse(params[2])
    assert.equal(connectorPolicy.status, 'connector_policy_recorded')
    assert.equal(connectorPolicy.policy_mode, 'approval_only')
    assert.equal(connectorPolicy.evidence_reference, 'owner connector policy note 001')
    assert.equal(connectorPolicy.external_send_state, 'approval_required_per_action')
    assert.equal(connectorPolicy.connector_write_state, 'approval_required_per_action')
    assert.equal(connectorPolicy.recurring_revenue_state, 'not_claimed')
    assert.equal(connectorPolicy.real_mrr_delta, 0)
    assert.ok(connectorPolicy.allowed_connector_actions.includes('draft_next_run'))
    assert.ok(connectorPolicy.packet.includes('Every external send or connector write still needs a named owner approval event.'))
    assert.ok(connectorPolicy.queue_csv.includes('"approval_required_per_action"'))
    assert.ok(connectorPolicy.config_json.includes('"per_action_approval_required": true'))
    return {
      status: 'ready',
      rows: [
        {
          ...baseRow({
            owner_acceptance: ownerAcceptance,
            connector_policy: connectorPolicy,
            connector_policy_recorded_at: params[3],
          }),
          status: 'connector_policy_recorded',
          next_step: 'Run the next production cycle under the approval-only connector policy; per-action approval is still required.',
        },
      ],
      rowCount: 1,
    }
  }

  const recorded = await callHandler({
    body: JSON.stringify({
      operation: 'record_connector_policy',
      action_id: 'TASK-TEST123',
      lead_id: 'LEAD-TEST123',
      connector_policy_mode: 'approval_only',
      connector_policy_reference: 'owner connector policy note 001',
      allowed_connector_actions: ['read_approved_sources', 'draft_next_run', 'queue_external_send_for_owner_approval', 'queue_connector_write_for_owner_approval', 'record_source_trace'],
      owner_note: 'Policy accepted for approval-only production cycles.',
    }),
  })
  const recordedBody = parseJson(recorded)
  assert.equal(recorded.statusCode, 200)
  assert.equal(recordedBody.operation, 'record_connector_policy')
  assert.equal(recordedBody.operation_status, 'recorded')
  assert.equal(recordedBody.connector_policy.status, 'connector_policy_recorded')
  assert.equal(recordedBody.connector_policy.real_mrr_delta, 0)
  assert.equal(recordedBody.action.status, 'connector_policy_recorded')
  assert.ok(recordedBody.action.first_proof.pilot_order_room.connector_policy_packet.includes('Real MRR delta: 0'))
  assert.ok(recordedBody.action.first_proof.pilot_order_room.connector_policy_queue_csv.includes('"not_claimed"'))
  assert.ok(recordedBody.action.first_proof.pilot_order_room.connector_policy_config_json.includes('"approval_required_per_action"'))
  assert.equal(queryCount, 2)

  datastore.query = async () => ({
    status: 'ready',
    rows: [baseRow({ owner_acceptance: ownerAcceptance, connector_policy: recordedBody.connector_policy })],
    rowCount: 1,
  })
  const idempotent = await callHandler({
    body: JSON.stringify({
      operation: 'record_connector_policy',
      action_id: 'TASK-TEST123',
      lead_id: 'LEAD-TEST123',
      connector_policy_mode: 'approval_only',
      connector_policy_reference: 'owner connector policy note 001',
    }),
  })
  const idempotentBody = parseJson(idempotent)
  assert.equal(idempotent.statusCode, 200)
  assert.equal(idempotentBody.operation_status, 'already_recorded')
  assert.equal(idempotentBody.connector_policy.status, 'connector_policy_recorded')

  console.log(
    JSON.stringify(
      {
        status: 'ready',
        audit: 'pipeline-control-connector-policy',
        missing_reference_status: missingReference.statusCode,
        blocked_status: blocked.statusCode,
        rejected_status: rejected.statusCode,
        operation_status: recordedBody.operation_status,
        policy_mode: recordedBody.connector_policy.policy_mode,
        idempotent_status: idempotentBody.operation_status,
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
}
