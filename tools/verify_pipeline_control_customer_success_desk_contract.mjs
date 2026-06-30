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
  action_id: 'TASK-TEST456',
  lead_id: 'LEAD-TEST456',
  scope_approval_state: 'approved',
  price_approval_state: 'approved',
  payment_route_state: 'approved',
  payment_request_state: 'sent',
  payment_proof_state: 'proof_attached',
  private_workspace_state: 'created_after_payment_proof',
  private_workspace_slug: 'pilot-daily-intelligence-brief-lead-test456',
  private_workspace_url: 'https://app.supermega.dev/login?next=%2Fapp%2Fstart%3Fworkspace%3Dpilot-daily-intelligence-brief-lead-test456%26lead%3DLEAD-TEST456',
  payment_proof_reference: 'KBZ transfer screenshot 456',
  workspace_created_at: '2026-06-30T01:00:00.000Z',
  workspace_created_by: 'operator_console',
  real_mrr_delta: 0,
}

const enterpriseDeliveryPack = {
  status: 'enterprise_delivery_pack_ready',
  delivery_mode: 'managed_ai_workcell',
  workspace_slug: 'pilot-daily-intelligence-brief-lead-test456',
  lead_id: 'LEAD-TEST456',
  template_name: 'Daily Intelligence Brief Agent',
  evidence_reference: 'signed delivery boundary 456',
  support_window: 'business-hours Myanmar time, urgent blockers reviewed same day',
  external_send_state: 'approval_required_per_action',
  connector_write_state: 'approval_required_per_action',
  recurring_revenue_state: 'not_claimed',
  real_mrr_delta: 0,
}

function baseRow(resultExtra = {}) {
  return {
    action_id: 'TASK-TEST456',
    lead_id: 'LEAD-TEST456',
    task_id: 'task-test456',
    action_type: 'lead_followup',
    status: 'enterprise_delivery_pack_ready',
    priority: 'high',
    owner: 'Revenue Pod',
    title: 'Build first proof',
    next_step: 'Use the enterprise delivery pack for client onboarding.',
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
      operation: 'prepare_customer_success_desk',
      action_id: 'TASK-TEST456',
      lead_id: 'LEAD-TEST456',
    }),
  })
  assert.equal(missingReference.statusCode, 400)
  assert.equal(parseJson(missingReference).reason, 'missing_customer_success_reference')

  datastore.query = async () => ({ status: 'ready', rows: [baseRow()], rowCount: 1 })
  const blocked = await callHandler({
    body: JSON.stringify({
      operation: 'prepare_customer_success_desk',
      action_id: 'TASK-TEST456',
      lead_id: 'LEAD-TEST456',
      customer_success_reference: '30-day success evidence 456',
    }),
  })
  assert.equal(blocked.statusCode, 409)
  assert.equal(parseJson(blocked).reason, 'enterprise_delivery_pack_required')

  let queryCount = 0
  datastore.query = async (sql, params) => {
    queryCount += 1
    if (queryCount === 1) {
      assert.ok(sql.includes('from public.supermega_pipeline_actions'), 'customer_success_select_missing')
      assert.equal(params[0], 'TASK-TEST456')
      assert.equal(params[1], 'LEAD-TEST456')
      return { status: 'ready', rows: [baseRow({ enterprise_delivery_pack: enterpriseDeliveryPack })], rowCount: 1 }
    }
    assert.ok(sql.includes("'{customer_success_desk}'"), 'customer_success_desk_jsonb_set_missing')
    assert.ok(sql.includes("'{customer_success_desk_prepared_at}'"), 'customer_success_desk_prepared_at_missing')
    const desk = JSON.parse(params[2])
    assert.equal(desk.status, 'customer_success_desk_ready')
    assert.equal(desk.desk_type, 'managed_ai_agent_customer_success')
    assert.equal(desk.evidence_reference, '30-day success evidence 456')
    assert.equal(desk.external_send_state, 'approval_required_per_action')
    assert.equal(desk.connector_write_state, 'approval_required_per_action')
    assert.equal(desk.recurring_revenue_state, 'not_claimed')
    assert.equal(desk.real_mrr_delta, 0)
    assert.ok(desk.packet.includes('30-day cadence'))
    assert.ok(desk.ticket_queue_csv.includes('"onboarding_blocker"'))
    assert.ok(desk.value_ledger_csv.includes('"renewal_reason"'))
    assert.ok(desk.renewal_queue_csv.includes('"decide_retainer"'))
    assert.ok(desk.client_update_draft.includes('draft - review before sending'))
    assert.ok(desk.config_json.includes('"managed_ai_agent_customer_success"'))
    return {
      status: 'ready',
      rows: [
        {
          ...baseRow({
            enterprise_delivery_pack: enterpriseDeliveryPack,
            customer_success_desk: desk,
            customer_success_desk_prepared_at: params[3],
          }),
          status: 'customer_success_desk_ready',
          next_step: 'Use the customer success desk to run support, value evidence, renewal review, and next-module approvals.',
        },
      ],
      rowCount: 1,
    }
  }

  const prepared = await callHandler({
    body: JSON.stringify({
      operation: 'prepare_customer_success_desk',
      action_id: 'TASK-TEST456',
      lead_id: 'LEAD-TEST456',
      customer_success_reference: '30-day success evidence 456',
      support_window: 'business-hours Myanmar time, urgent blockers reviewed same day',
    }),
  })
  const preparedBody = parseJson(prepared)
  assert.equal(prepared.statusCode, 200)
  assert.equal(preparedBody.operation, 'prepare_customer_success_desk')
  assert.equal(preparedBody.operation_status, 'prepared')
  assert.equal(preparedBody.customer_success_desk.status, 'customer_success_desk_ready')
  assert.equal(preparedBody.customer_success_desk.real_mrr_delta, 0)
  assert.equal(preparedBody.action.status, 'customer_success_desk_ready')
  assert.ok(preparedBody.action.first_proof.pilot_order_room.customer_success_packet.includes('Real MRR delta: 0'))
  assert.ok(preparedBody.action.first_proof.pilot_order_room.customer_success_ticket_queue_csv.includes('"source_quality_issue"'))
  assert.ok(preparedBody.action.first_proof.pilot_order_room.customer_success_value_ledger_csv.includes('"time_saved"'))
  assert.ok(preparedBody.action.first_proof.pilot_order_room.customer_success_renewal_queue_csv.includes('"prepare_30_day_review"'))
  assert.ok(preparedBody.action.first_proof.pilot_order_room.customer_success_client_update.includes('What happened'))
  assert.ok(preparedBody.action.first_proof.pilot_order_room.customer_success_config_json.includes('"approval_required_per_action"'))
  assert.equal(queryCount, 2)

  datastore.query = async () => ({
    status: 'ready',
    rows: [baseRow({ enterprise_delivery_pack: enterpriseDeliveryPack, customer_success_desk: preparedBody.customer_success_desk })],
    rowCount: 1,
  })
  const idempotent = await callHandler({
    body: JSON.stringify({
      operation: 'prepare_customer_success_desk',
      action_id: 'TASK-TEST456',
      lead_id: 'LEAD-TEST456',
      customer_success_reference: '30-day success evidence 456',
    }),
  })
  const idempotentBody = parseJson(idempotent)
  assert.equal(idempotent.statusCode, 200)
  assert.equal(idempotentBody.operation_status, 'already_prepared')
  assert.equal(idempotentBody.customer_success_desk.status, 'customer_success_desk_ready')

  console.log(
    JSON.stringify(
      {
        status: 'ready',
        audit: 'pipeline-control-customer-success-desk',
        missing_reference_status: missingReference.statusCode,
        blocked_status: blocked.statusCode,
        operation_status: preparedBody.operation_status,
        desk_type: preparedBody.customer_success_desk.desk_type,
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
