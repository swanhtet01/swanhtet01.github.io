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

const connectorPolicy = {
  status: 'connector_policy_recorded',
  policy_mode: 'approval_only',
  workspace_slug: 'pilot-daily-intelligence-brief-lead-test123',
  lead_id: 'LEAD-TEST123',
  template_name: 'Daily Intelligence Brief Agent',
  evidence_reference: 'owner connector policy note 001',
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
    status: 'connector_policy_recorded',
    priority: 'high',
    owner: 'Revenue Pod',
    title: 'Build first proof',
    next_step: 'Run the next production cycle under the approval-only connector policy.',
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
      owner_acceptance: ownerAcceptance,
      ...resultExtra,
    },
  }
}

try {
  process.env.SUPERMEGA_OPS_KEY = 'test-ops-key'
  datastore.postgresConfigured = () => true

  const missingReference = await callHandler({
    body: JSON.stringify({
      operation: 'prepare_production_approval_queue',
      action_id: 'TASK-TEST123',
      lead_id: 'LEAD-TEST123',
    }),
  })
  assert.equal(missingReference.statusCode, 400)
  assert.equal(parseJson(missingReference).reason, 'missing_production_queue_reference')

  datastore.query = async () => ({ status: 'ready', rows: [baseRow()], rowCount: 1 })
  const blocked = await callHandler({
    body: JSON.stringify({
      operation: 'prepare_production_approval_queue',
      action_id: 'TASK-TEST123',
      lead_id: 'LEAD-TEST123',
      production_queue_reference: 'first accepted production source trace 001',
    }),
  })
  assert.equal(blocked.statusCode, 409)
  assert.equal(parseJson(blocked).reason, 'connector_policy_required')

  let queryCount = 0
  datastore.query = async (sql, params) => {
    queryCount += 1
    if (queryCount === 1) {
      assert.ok(sql.includes('from public.supermega_pipeline_actions'), 'production_queue_select_missing')
      assert.equal(params[0], 'TASK-TEST123')
      assert.equal(params[1], 'LEAD-TEST123')
      return { status: 'ready', rows: [baseRow({ connector_policy: connectorPolicy })], rowCount: 1 }
    }
    assert.ok(sql.includes("'{production_approval_queue}'"), 'production_approval_queue_jsonb_set_missing')
    assert.ok(sql.includes("'{production_approval_queue_prepared_at}'"), 'production_approval_queue_prepared_at_missing')
    const productionQueue = JSON.parse(params[2])
    assert.equal(productionQueue.status, 'production_approval_queue_ready')
    assert.equal(productionQueue.autopilot_state, 'draft_queue_only')
    assert.equal(productionQueue.evidence_reference, 'first accepted production source trace 001')
    assert.equal(productionQueue.external_send_state, 'approval_required_per_action')
    assert.equal(productionQueue.connector_write_state, 'approval_required_per_action')
    assert.equal(productionQueue.recurring_revenue_state, 'not_claimed')
    assert.equal(productionQueue.real_mrr_delta, 0)
    assert.ok(productionQueue.queue.some((item) => item.queue_id === 'queue_client_update' && item.approval_state === 'owner_approval_required'))
    assert.ok(productionQueue.packet.includes('Autopilot state: draft_queue_only'))
    assert.ok(productionQueue.queue_csv.includes('"queue_connector_writeback"'))
    assert.ok(productionQueue.config_json.includes('"approval_required_per_action"'))
    return {
      status: 'ready',
      rows: [
        {
          ...baseRow({
            connector_policy: connectorPolicy,
            production_approval_queue: productionQueue,
            production_approval_queue_prepared_at: params[3],
          }),
          status: 'production_approval_queue_ready',
          next_step: 'Let agents prepare the next run drafts; approve each external send or connector write from the production approval queue.',
        },
      ],
      rowCount: 1,
    }
  }

  const prepared = await callHandler({
    body: JSON.stringify({
      operation: 'prepare_production_approval_queue',
      action_id: 'TASK-TEST123',
      lead_id: 'LEAD-TEST123',
      production_queue_reference: 'first accepted production source trace 001',
      source_trace: 'approved source folder / client inbox thread',
    }),
  })
  const preparedBody = parseJson(prepared)
  assert.equal(prepared.statusCode, 200)
  assert.equal(preparedBody.operation, 'prepare_production_approval_queue')
  assert.equal(preparedBody.operation_status, 'prepared')
  assert.equal(preparedBody.production_approval_queue.status, 'production_approval_queue_ready')
  assert.equal(preparedBody.production_approval_queue.real_mrr_delta, 0)
  assert.equal(preparedBody.action.status, 'production_approval_queue_ready')
  assert.ok(preparedBody.action.first_proof.pilot_order_room.production_approval_packet.includes('Real MRR delta: 0'))
  assert.ok(preparedBody.action.first_proof.pilot_order_room.production_approval_queue_csv.includes('"queued_for_owner_approval"'))
  assert.ok(preparedBody.action.first_proof.pilot_order_room.production_approval_config_json.includes('"draft_queue_only"'))
  assert.equal(queryCount, 2)

  datastore.query = async () => ({
    status: 'ready',
    rows: [baseRow({ connector_policy: connectorPolicy, production_approval_queue: preparedBody.production_approval_queue })],
    rowCount: 1,
  })
  const idempotent = await callHandler({
    body: JSON.stringify({
      operation: 'prepare_production_approval_queue',
      action_id: 'TASK-TEST123',
      lead_id: 'LEAD-TEST123',
      production_queue_reference: 'first accepted production source trace 001',
    }),
  })
  const idempotentBody = parseJson(idempotent)
  assert.equal(idempotent.statusCode, 200)
  assert.equal(idempotentBody.operation_status, 'already_prepared')
  assert.equal(idempotentBody.production_approval_queue.status, 'production_approval_queue_ready')

  console.log(
    JSON.stringify(
      {
        status: 'ready',
        audit: 'pipeline-control-production-approval-queue',
        missing_reference_status: missingReference.statusCode,
        blocked_status: blocked.statusCode,
        operation_status: preparedBody.operation_status,
        autopilot_state: preparedBody.production_approval_queue.autopilot_state,
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
