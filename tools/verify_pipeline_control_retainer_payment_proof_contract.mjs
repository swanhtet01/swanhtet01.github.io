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
  action_id: 'TASK-TEST900',
  lead_id: 'LEAD-TEST900',
  scope_approval_state: 'approved',
  price_approval_state: 'approved',
  payment_route_state: 'approved',
  payment_request_state: 'sent',
  payment_proof_state: 'proof_attached',
  private_workspace_state: 'created_after_payment_proof',
  private_workspace_slug: 'pilot-daily-intelligence-brief-lead-test900',
  payment_proof_reference: 'KBZ transfer screenshot 900',
  workspace_created_at: '2026-06-30T01:00:00.000Z',
  workspace_created_by: 'operator_console',
  real_mrr_delta: 0,
}

const retainerGrowthOffer = {
  status: 'retainer_growth_offer_ready',
  offer_type: 'evidence_gated_retainer_growth',
  workspace_slug: 'pilot-daily-intelligence-brief-lead-test900',
  lead_id: 'LEAD-TEST900',
  template_name: 'Daily Intelligence Brief Agent',
  evidence_reference: 'retainer evidence 900',
  retainer_quote: 'OWNER_APPROVED_RETAINER_QUOTE_REQUIRED',
  recurring_revenue_state: 'not_claimed',
  payment_state: 'payment_proof_required_before_mrr',
  real_mrr_delta: 0,
}

function baseRow(resultExtra = {}) {
  return {
    action_id: 'TASK-TEST900',
    lead_id: 'LEAD-TEST900',
    task_id: 'task-test900',
    action_type: 'lead_followup',
    status: 'retainer_growth_offer_ready',
    priority: 'high',
    owner: 'Revenue Pod',
    title: 'Build first proof',
    next_step: 'Review value evidence and approve retainer quote.',
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

  const missingProof = await callHandler({
    body: JSON.stringify({
      operation: 'record_retainer_payment_proof',
      action_id: 'TASK-TEST900',
      lead_id: 'LEAD-TEST900',
      amount_mmk: '3600000',
      payment_period: 'quarterly',
      owner_approval_reference: 'owner approved quote 900',
    }),
  })
  assert.equal(missingProof.statusCode, 400)
  assert.equal(parseJson(missingProof).reason, 'missing_retainer_payment_proof_reference')

  const invalidAmount = await callHandler({
    body: JSON.stringify({
      operation: 'record_retainer_payment_proof',
      action_id: 'TASK-TEST900',
      lead_id: 'LEAD-TEST900',
      amount_mmk: '0',
      payment_period: 'quarterly',
      owner_approval_reference: 'owner approved quote 900',
      payment_proof_reference: 'KBZ proof 900',
    }),
  })
  assert.equal(invalidAmount.statusCode, 400)
  assert.equal(parseJson(invalidAmount).reason, 'invalid_retainer_payment_amount')

  datastore.query = async () => ({ status: 'ready', rows: [baseRow()], rowCount: 1 })
  const blocked = await callHandler({
    body: JSON.stringify({
      operation: 'record_retainer_payment_proof',
      action_id: 'TASK-TEST900',
      lead_id: 'LEAD-TEST900',
      amount_mmk: '3600000',
      payment_period: 'quarterly',
      owner_approval_reference: 'owner approved quote 900',
      payment_proof_reference: 'KBZ proof 900',
    }),
  })
  assert.equal(blocked.statusCode, 409)
  assert.equal(parseJson(blocked).reason, 'retainer_growth_offer_required')

  let queryCount = 0
  datastore.query = async (sql, params) => {
    queryCount += 1
    if (queryCount === 1) {
      assert.ok(sql.includes('from public.supermega_pipeline_actions'), 'retainer_payment_select_missing')
      assert.equal(params[0], 'TASK-TEST900')
      assert.equal(params[1], 'LEAD-TEST900')
      return { status: 'ready', rows: [baseRow({ retainer_growth_offer: retainerGrowthOffer })], rowCount: 1 }
    }
    assert.ok(sql.includes("'{retainer_payment_record}'"), 'retainer_payment_record_jsonb_set_missing')
    assert.ok(sql.includes("'{retainer_payment_recorded_at}'"), 'retainer_payment_recorded_at_missing')
    const record = JSON.parse(params[2])
    assert.equal(record.status, 'retainer_payment_proof_recorded')
    assert.equal(record.amount_mmk, 3600000)
    assert.equal(record.payment_period, 'quarterly')
    assert.equal(record.normalized_mrr_delta_mmk, 1200000)
    assert.equal(record.real_mrr_delta, 1200000)
    assert.equal(record.payment_proof_reference, 'KBZ proof 900')
    assert.equal(record.owner_approval_reference, 'owner approved quote 900')
    assert.equal(record.bank_reconciliation_state, 'not_bank_verified')
    assert.ok(record.packet.includes('Normalized MRR delta MMK: 1200000'))
    assert.ok(record.ledger_csv.includes('"not_bank_verified"'))
    assert.ok(record.summary_json.includes('"payment_proof_attached"'))
    return {
      status: 'ready',
      rows: [
        {
          ...baseRow({
            retainer_growth_offer: retainerGrowthOffer,
            retainer_payment_record: record,
            retainer_payment_recorded_at: params[3],
          }),
          status: 'retainer_payment_proof_recorded',
          next_step: 'Reconcile the payment proof, keep delivery running, and update the value ledger before the next renewal.',
        },
      ],
      rowCount: 1,
    }
  }

  const recorded = await callHandler({
    body: JSON.stringify({
      operation: 'record_retainer_payment_proof',
      action_id: 'TASK-TEST900',
      lead_id: 'LEAD-TEST900',
      amount_mmk: '3,600,000',
      payment_period: 'quarterly',
      owner_approval_reference: 'owner approved quote 900',
      payment_proof_reference: 'KBZ proof 900',
    }),
  })
  const recordedBody = parseJson(recorded)
  assert.equal(recorded.statusCode, 200)
  assert.equal(recordedBody.operation, 'record_retainer_payment_proof')
  assert.equal(recordedBody.operation_status, 'recorded')
  assert.equal(recordedBody.retainer_payment_record.status, 'retainer_payment_proof_recorded')
  assert.equal(recordedBody.retainer_payment_record.real_mrr_delta, 1200000)
  assert.equal(recordedBody.action.status, 'retainer_payment_proof_recorded')
  assert.ok(recordedBody.action.first_proof.pilot_order_room.retainer_payment_packet.includes('Bank reconciliation state: not_bank_verified'))
  assert.ok(recordedBody.action.first_proof.pilot_order_room.retainer_payment_ledger_csv.includes('"KBZ proof 900"'))
  assert.ok(recordedBody.action.first_proof.pilot_order_room.retainer_mrr_summary_json.includes('"real_mrr_delta": 1200000'))
  assert.equal(queryCount, 2)

  datastore.query = async () => ({
    status: 'ready',
    rows: [baseRow({ retainer_growth_offer: retainerGrowthOffer, retainer_payment_record: recordedBody.retainer_payment_record })],
    rowCount: 1,
  })
  const idempotent = await callHandler({
    body: JSON.stringify({
      operation: 'record_retainer_payment_proof',
      action_id: 'TASK-TEST900',
      lead_id: 'LEAD-TEST900',
      amount_mmk: '3600000',
      payment_period: 'quarterly',
      owner_approval_reference: 'owner approved quote 900',
      payment_proof_reference: 'KBZ proof 900',
    }),
  })
  const idempotentBody = parseJson(idempotent)
  assert.equal(idempotent.statusCode, 200)
  assert.equal(idempotentBody.operation_status, 'already_recorded')
  assert.equal(idempotentBody.retainer_payment_record.status, 'retainer_payment_proof_recorded')

  console.log(
    JSON.stringify(
      {
        status: 'ready',
        audit: 'pipeline-control-retainer-payment-proof',
        missing_proof_status: missingProof.statusCode,
        invalid_amount_status: invalidAmount.statusCode,
        blocked_status: blocked.statusCode,
        operation_status: recordedBody.operation_status,
        normalized_mrr_delta_mmk: recordedBody.retainer_payment_record.normalized_mrr_delta_mmk,
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
