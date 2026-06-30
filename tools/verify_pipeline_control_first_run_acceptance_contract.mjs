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

const blockedState = {
  ...createdState,
  private_workspace_state: 'ready_after_payment_proof',
  private_workspace_slug: undefined,
  private_workspace_url: undefined,
}

function baseRow(state, resultExtra = {}) {
  return {
    action_id: 'TASK-TEST123',
    lead_id: 'LEAD-TEST123',
    task_id: 'task-test123',
    action_type: 'lead_followup',
    status: state.private_workspace_state === 'created_after_payment_proof' ? 'workspace_ready' : 'queued',
    priority: 'high',
    owner: 'Revenue Pod',
    title: 'Build first proof',
    next_step: 'Prepare acceptance packet.',
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
      pilot_order_room_state: state,
      ...resultExtra,
    },
  }
}

try {
  process.env.SUPERMEGA_OPS_KEY = 'test-ops-key'
  datastore.postgresConfigured = () => true

  datastore.query = async () => ({ status: 'ready', rows: [baseRow(blockedState)], rowCount: 1 })
  const blocked = await callHandler({
    body: JSON.stringify({
      operation: 'prepare_first_run_acceptance',
      action_id: 'TASK-TEST123',
      lead_id: 'LEAD-TEST123',
    }),
  })
  const blockedBody = parseJson(blocked)
  assert.equal(blocked.statusCode, 409)
  assert.equal(blockedBody.reason, 'private_workspace_required')
  assert.equal(blockedBody.activation_status, 'ready_to_create_private_workspace')

  let queryCount = 0
  datastore.query = async (sql, params) => {
    queryCount += 1
    if (queryCount === 1) {
      assert.ok(sql.includes('from public.supermega_pipeline_actions'), 'acceptance_select_missing')
      assert.equal(params[0], 'TASK-TEST123')
      assert.equal(params[1], 'LEAD-TEST123')
      return { status: 'ready', rows: [baseRow(createdState)], rowCount: 1 }
    }
    assert.ok(sql.includes("'{first_run_acceptance}'"), 'first_run_acceptance_jsonb_set_missing')
    assert.ok(sql.includes("'{first_run_acceptance_prepared_at}'"), 'first_run_acceptance_prepared_at_missing')
    const acceptance = JSON.parse(params[2])
    assert.equal(acceptance.status, 'first_run_acceptance_packet_ready')
    assert.equal(acceptance.acceptance_state, 'owner_acceptance_required')
    assert.equal(acceptance.connector_write_state, 'blocked_until_owner_acceptance')
    assert.equal(acceptance.recurring_revenue_state, 'not_claimed')
    assert.equal(acceptance.real_mrr_delta, 0)
    assert.ok(acceptance.acceptance_packet.includes('No connector write before owner acceptance.'))
    assert.ok(acceptance.acceptance_queue_csv.includes('"owner_acceptance_review"'))
    return {
      status: 'ready',
      rows: [
        {
          ...baseRow(createdState, {
            first_run_acceptance: acceptance,
            first_run_acceptance_prepared_at: params[3],
          }),
          status: 'first_run_ready',
          next_step: 'Review the first-run acceptance packet with the owner before any external send or connector write.',
        },
      ],
      rowCount: 1,
    }
  }

  const prepared = await callHandler({
    body: JSON.stringify({
      operation: 'prepare_first_run_acceptance',
      action_id: 'TASK-TEST123',
      lead_id: 'LEAD-TEST123',
      first_run_evidence_reference: 'workspace output draft 001',
    }),
  })
  const preparedBody = parseJson(prepared)
  assert.equal(prepared.statusCode, 200)
  assert.equal(preparedBody.operation, 'prepare_first_run_acceptance')
  assert.equal(preparedBody.operation_status, 'prepared')
  assert.equal(preparedBody.first_run_acceptance.status, 'first_run_acceptance_packet_ready')
  assert.equal(preparedBody.first_run_acceptance.evidence_reference, 'workspace output draft 001')
  assert.equal(preparedBody.first_run_acceptance.real_mrr_delta, 0)
  assert.equal(preparedBody.action.status, 'first_run_ready')
  assert.ok(preparedBody.action.first_proof.pilot_order_room.first_run_acceptance_packet.includes('Recurring revenue state: not_claimed'))
  assert.ok(preparedBody.action.first_proof.pilot_order_room.first_run_acceptance_queue_csv.includes('"connector_policy_review"'))
  assert.equal(queryCount, 2)

  const existingAcceptance = preparedBody.first_run_acceptance
  datastore.query = async () => ({
    status: 'ready',
    rows: [baseRow(createdState, { first_run_acceptance: existingAcceptance })],
    rowCount: 1,
  })
  const idempotent = await callHandler({
    body: JSON.stringify({
      operation: 'prepare_first_run_acceptance',
      action_id: 'TASK-TEST123',
      lead_id: 'LEAD-TEST123',
    }),
  })
  const idempotentBody = parseJson(idempotent)
  assert.equal(idempotent.statusCode, 200)
  assert.equal(idempotentBody.operation_status, 'already_prepared')
  assert.equal(idempotentBody.first_run_acceptance.status, 'first_run_acceptance_packet_ready')

  console.log(
    JSON.stringify(
      {
        status: 'ready',
        audit: 'pipeline-control-first-run-acceptance',
        blocked_status: blocked.statusCode,
        operation_status: preparedBody.operation_status,
        first_run_status: preparedBody.first_run_acceptance.status,
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
