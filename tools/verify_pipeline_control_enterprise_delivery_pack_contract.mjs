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

const productionApprovalQueue = {
  status: 'production_approval_queue_ready',
  autopilot_state: 'draft_queue_only',
  workspace_slug: 'pilot-daily-intelligence-brief-lead-test123',
  lead_id: 'LEAD-TEST123',
  template_name: 'Daily Intelligence Brief Agent',
  evidence_reference: 'first accepted production source trace 001',
  external_send_state: 'approval_required_per_action',
  connector_write_state: 'approval_required_per_action',
  recurring_revenue_state: 'not_claimed',
  real_mrr_delta: 0,
}

function baseRow(resultExtra = {}) {
  return {
    action_id: 'TASK-TEST123',
    lead_id: 'LEAD-TEST123',
    task_id: 'task-test123',
    action_type: 'lead_followup',
    status: 'production_approval_queue_ready',
    priority: 'high',
    owner: 'Revenue Pod',
    title: 'Build first proof',
    next_step: 'Let agents prepare the next run drafts.',
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
      ...resultExtra,
    },
  }
}

try {
  process.env.SUPERMEGA_OPS_KEY = 'test-ops-key'
  datastore.postgresConfigured = () => true

  const missingReference = await callHandler({
    body: JSON.stringify({
      operation: 'prepare_enterprise_delivery_pack',
      action_id: 'TASK-TEST123',
      lead_id: 'LEAD-TEST123',
    }),
  })
  assert.equal(missingReference.statusCode, 400)
  assert.equal(parseJson(missingReference).reason, 'missing_enterprise_delivery_reference')

  datastore.query = async () => ({ status: 'ready', rows: [baseRow()], rowCount: 1 })
  const blocked = await callHandler({
    body: JSON.stringify({
      operation: 'prepare_enterprise_delivery_pack',
      action_id: 'TASK-TEST123',
      lead_id: 'LEAD-TEST123',
      enterprise_delivery_reference: 'signed delivery boundary 001',
    }),
  })
  assert.equal(blocked.statusCode, 409)
  assert.equal(parseJson(blocked).reason, 'production_approval_queue_required')

  let queryCount = 0
  datastore.query = async (sql, params) => {
    queryCount += 1
    if (queryCount === 1) {
      assert.ok(sql.includes('from public.supermega_pipeline_actions'), 'enterprise_delivery_select_missing')
      assert.equal(params[0], 'TASK-TEST123')
      assert.equal(params[1], 'LEAD-TEST123')
      return { status: 'ready', rows: [baseRow({ production_approval_queue: productionApprovalQueue })], rowCount: 1 }
    }
    assert.ok(sql.includes("'{enterprise_delivery_pack}'"), 'enterprise_delivery_pack_jsonb_set_missing')
    assert.ok(sql.includes("'{enterprise_delivery_pack_prepared_at}'"), 'enterprise_delivery_pack_prepared_at_missing')
    const enterprisePack = JSON.parse(params[2])
    assert.equal(enterprisePack.status, 'enterprise_delivery_pack_ready')
    assert.equal(enterprisePack.delivery_mode, 'managed_ai_workcell')
    assert.equal(enterprisePack.evidence_reference, 'signed delivery boundary 001')
    assert.equal(enterprisePack.autopilot_state, 'draft_queue_only_with_owner_approvals')
    assert.equal(enterprisePack.connector_write_state, 'approval_required_per_action')
    assert.equal(enterprisePack.recurring_revenue_state, 'not_claimed')
    assert.equal(enterprisePack.real_mrr_delta, 0)
    assert.ok(enterprisePack.packet.includes('Enterprise posture: approval_gated_source_traced'))
    assert.ok(enterprisePack.access_matrix_csv.includes('"client_owner"'))
    assert.ok(enterprisePack.value_ledger_csv.includes('"renewal_reason"'))
    assert.ok(enterprisePack.config_json.includes('"managed_ai_workcell"'))
    return {
      status: 'ready',
      rows: [
        {
          ...baseRow({
            production_approval_queue: productionApprovalQueue,
            enterprise_delivery_pack: enterprisePack,
            enterprise_delivery_pack_prepared_at: params[3],
          }),
          status: 'enterprise_delivery_pack_ready',
          next_step: 'Use the enterprise delivery pack for client onboarding, access boundaries, support cadence, and 30-day value review.',
        },
      ],
      rowCount: 1,
    }
  }

  const prepared = await callHandler({
    body: JSON.stringify({
      operation: 'prepare_enterprise_delivery_pack',
      action_id: 'TASK-TEST123',
      lead_id: 'LEAD-TEST123',
      enterprise_delivery_reference: 'signed delivery boundary 001',
      support_window: 'business-hours Myanmar time, urgent blockers reviewed same day',
    }),
  })
  const preparedBody = parseJson(prepared)
  assert.equal(prepared.statusCode, 200)
  assert.equal(preparedBody.operation, 'prepare_enterprise_delivery_pack')
  assert.equal(preparedBody.operation_status, 'prepared')
  assert.equal(preparedBody.enterprise_delivery_pack.status, 'enterprise_delivery_pack_ready')
  assert.equal(preparedBody.enterprise_delivery_pack.real_mrr_delta, 0)
  assert.equal(preparedBody.action.status, 'enterprise_delivery_pack_ready')
  assert.ok(preparedBody.action.first_proof.pilot_order_room.enterprise_delivery_packet.includes('Real MRR delta: 0'))
  assert.ok(preparedBody.action.first_proof.pilot_order_room.enterprise_access_matrix_csv.includes('"agent_worker"'))
  assert.ok(preparedBody.action.first_proof.pilot_order_room.enterprise_value_ledger_csv.includes('"time_saved"'))
  assert.ok(preparedBody.action.first_proof.pilot_order_room.enterprise_delivery_config_json.includes('"approval_required_per_action"'))
  assert.equal(queryCount, 2)

  datastore.query = async () => ({
    status: 'ready',
    rows: [baseRow({ production_approval_queue: productionApprovalQueue, enterprise_delivery_pack: preparedBody.enterprise_delivery_pack })],
    rowCount: 1,
  })
  const idempotent = await callHandler({
    body: JSON.stringify({
      operation: 'prepare_enterprise_delivery_pack',
      action_id: 'TASK-TEST123',
      lead_id: 'LEAD-TEST123',
      enterprise_delivery_reference: 'signed delivery boundary 001',
    }),
  })
  const idempotentBody = parseJson(idempotent)
  assert.equal(idempotent.statusCode, 200)
  assert.equal(idempotentBody.operation_status, 'already_prepared')
  assert.equal(idempotentBody.enterprise_delivery_pack.status, 'enterprise_delivery_pack_ready')

  console.log(
    JSON.stringify(
      {
        status: 'ready',
        audit: 'pipeline-control-enterprise-delivery-pack',
        missing_reference_status: missingReference.statusCode,
        blocked_status: blocked.statusCode,
        operation_status: preparedBody.operation_status,
        delivery_mode: preparedBody.enterprise_delivery_pack.delivery_mode,
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
