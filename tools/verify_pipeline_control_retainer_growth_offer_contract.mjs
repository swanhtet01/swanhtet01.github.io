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
  action_id: 'TASK-TEST789',
  lead_id: 'LEAD-TEST789',
  scope_approval_state: 'approved',
  price_approval_state: 'approved',
  payment_route_state: 'approved',
  payment_request_state: 'sent',
  payment_proof_state: 'proof_attached',
  private_workspace_state: 'created_after_payment_proof',
  private_workspace_slug: 'pilot-daily-intelligence-brief-lead-test789',
  private_workspace_url: 'https://app.supermega.dev/login?next=%2Fapp%2Fstart%3Fworkspace%3Dpilot-daily-intelligence-brief-lead-test789%26lead%3DLEAD-TEST789',
  payment_proof_reference: 'KBZ transfer screenshot 789',
  workspace_created_at: '2026-06-30T01:00:00.000Z',
  workspace_created_by: 'operator_console',
  real_mrr_delta: 0,
}

const customerSuccessDesk = {
  status: 'customer_success_desk_ready',
  desk_type: 'managed_ai_agent_customer_success',
  workspace_slug: 'pilot-daily-intelligence-brief-lead-test789',
  lead_id: 'LEAD-TEST789',
  template_name: 'Daily Intelligence Brief Agent',
  evidence_reference: '30-day success evidence 789',
  support_window: 'business-hours Myanmar time, urgent blockers reviewed same day',
  external_send_state: 'approval_required_per_action',
  connector_write_state: 'approval_required_per_action',
  recurring_revenue_state: 'not_claimed',
  real_mrr_delta: 0,
}

function baseRow(resultExtra = {}) {
  return {
    action_id: 'TASK-TEST789',
    lead_id: 'LEAD-TEST789',
    task_id: 'task-test789',
    action_type: 'lead_followup',
    status: 'customer_success_desk_ready',
    priority: 'high',
    owner: 'Revenue Pod',
    title: 'Build first proof',
    next_step: 'Use the customer success desk to run support and value evidence.',
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
      operation: 'prepare_retainer_growth_offer',
      action_id: 'TASK-TEST789',
      lead_id: 'LEAD-TEST789',
    }),
  })
  assert.equal(missingReference.statusCode, 400)
  assert.equal(parseJson(missingReference).reason, 'missing_retainer_growth_reference')

  datastore.query = async () => ({ status: 'ready', rows: [baseRow()], rowCount: 1 })
  const blocked = await callHandler({
    body: JSON.stringify({
      operation: 'prepare_retainer_growth_offer',
      action_id: 'TASK-TEST789',
      lead_id: 'LEAD-TEST789',
      retainer_growth_reference: 'retainer evidence 789',
    }),
  })
  assert.equal(blocked.statusCode, 409)
  assert.equal(parseJson(blocked).reason, 'customer_success_desk_required')

  let queryCount = 0
  datastore.query = async (sql, params) => {
    queryCount += 1
    if (queryCount === 1) {
      assert.ok(sql.includes('from public.supermega_pipeline_actions'), 'retainer_growth_select_missing')
      assert.equal(params[0], 'TASK-TEST789')
      assert.equal(params[1], 'LEAD-TEST789')
      return { status: 'ready', rows: [baseRow({ customer_success_desk: customerSuccessDesk })], rowCount: 1 }
    }
    assert.ok(sql.includes("'{retainer_growth_offer}'"), 'retainer_growth_offer_jsonb_set_missing')
    assert.ok(sql.includes("'{retainer_growth_offer_prepared_at}'"), 'retainer_growth_offer_prepared_at_missing')
    const offer = JSON.parse(params[2])
    assert.equal(offer.status, 'retainer_growth_offer_ready')
    assert.equal(offer.offer_type, 'evidence_gated_retainer_growth')
    assert.equal(offer.evidence_reference, 'retainer evidence 789')
    assert.equal(offer.retainer_quote, 'OWNER_APPROVED_RETAINER_QUOTE_REQUIRED')
    assert.equal(offer.recurring_revenue_state, 'not_claimed')
    assert.equal(offer.payment_state, 'payment_proof_required_before_mrr')
    assert.equal(offer.real_mrr_delta, 0)
    assert.ok(offer.packet.includes('Real MRR delta: 0'))
    assert.ok(offer.offer_options_csv.includes('"growth_operator_retainer"'))
    assert.ok(offer.decision_ledger_csv.includes('"approve_retainer_quote"'))
    assert.ok(offer.next_module_roadmap_csv.includes('"approval_inbox"'))
    assert.ok(offer.invoice_request_draft.includes('PAYMENT_LINK_REQUIRED_AFTER_OWNER_APPROVAL'))
    assert.ok(offer.client_email_draft.includes('managed AI-agent workcell'))
    assert.ok(offer.config_json.includes('"evidence_gated_retainer_growth"'))
    return {
      status: 'ready',
      rows: [
        {
          ...baseRow({
            customer_success_desk: customerSuccessDesk,
            retainer_growth_offer: offer,
            retainer_growth_offer_prepared_at: params[3],
          }),
          status: 'retainer_growth_offer_ready',
          next_step: 'Review value evidence, approve the retainer quote, then send the retainer offer only after owner approval.',
        },
      ],
      rowCount: 1,
    }
  }

  const prepared = await callHandler({
    body: JSON.stringify({
      operation: 'prepare_retainer_growth_offer',
      action_id: 'TASK-TEST789',
      lead_id: 'LEAD-TEST789',
      retainer_growth_reference: 'retainer evidence 789',
    }),
  })
  const preparedBody = parseJson(prepared)
  assert.equal(prepared.statusCode, 200)
  assert.equal(preparedBody.operation, 'prepare_retainer_growth_offer')
  assert.equal(preparedBody.operation_status, 'prepared')
  assert.equal(preparedBody.retainer_growth_offer.status, 'retainer_growth_offer_ready')
  assert.equal(preparedBody.retainer_growth_offer.real_mrr_delta, 0)
  assert.equal(preparedBody.action.status, 'retainer_growth_offer_ready')
  assert.ok(preparedBody.action.first_proof.pilot_order_room.retainer_growth_packet.includes('Recurring revenue state: not_claimed'))
  assert.ok(preparedBody.action.first_proof.pilot_order_room.retainer_offer_options_csv.includes('"managed_support_retainer"'))
  assert.ok(preparedBody.action.first_proof.pilot_order_room.retainer_decision_ledger_csv.includes('"attach_payment_proof"'))
  assert.ok(preparedBody.action.first_proof.pilot_order_room.retainer_next_module_roadmap_csv.includes('"source_monitor"'))
  assert.ok(preparedBody.action.first_proof.pilot_order_room.retainer_invoice_request_draft.includes('OWNER_APPROVED_RETAINER_QUOTE_REQUIRED'))
  assert.ok(preparedBody.action.first_proof.pilot_order_room.retainer_client_email_draft.includes('value review'))
  assert.ok(preparedBody.action.first_proof.pilot_order_room.retainer_growth_config_json.includes('"payment_proof_required_before_mrr"'))
  assert.equal(queryCount, 2)

  datastore.query = async () => ({
    status: 'ready',
    rows: [baseRow({ customer_success_desk: customerSuccessDesk, retainer_growth_offer: preparedBody.retainer_growth_offer })],
    rowCount: 1,
  })
  const idempotent = await callHandler({
    body: JSON.stringify({
      operation: 'prepare_retainer_growth_offer',
      action_id: 'TASK-TEST789',
      lead_id: 'LEAD-TEST789',
      retainer_growth_reference: 'retainer evidence 789',
    }),
  })
  const idempotentBody = parseJson(idempotent)
  assert.equal(idempotent.statusCode, 200)
  assert.equal(idempotentBody.operation_status, 'already_prepared')
  assert.equal(idempotentBody.retainer_growth_offer.status, 'retainer_growth_offer_ready')

  console.log(
    JSON.stringify(
      {
        status: 'ready',
        audit: 'pipeline-control-retainer-growth-offer',
        missing_reference_status: missingReference.statusCode,
        blocked_status: blocked.statusCode,
        operation_status: preparedBody.operation_status,
        offer_type: preparedBody.retainer_growth_offer.offer_type,
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
