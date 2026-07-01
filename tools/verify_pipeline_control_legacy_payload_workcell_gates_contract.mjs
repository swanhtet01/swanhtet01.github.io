import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { Readable, Writable } from 'node:stream'

const require = createRequire(import.meta.url)
const datastore = require('../api/lib/supermega-datastore.js')
const handler = require('../api/pipeline-control.js')

const originalOpsKey = process.env.SUPERMEGA_OPS_KEY
const originalPostgresConfigured = datastore.postgresConfigured
const originalQuery = datastore.query

function callHandler(body) {
  return new Promise((resolve, reject) => {
    const req = Readable.from([JSON.stringify(body)])
    req.method = 'POST'
    req.url = '/api/pipeline-control'
    req.headers = {
      authorization: 'Bearer test-ops-key',
      'content-type': 'application/json',
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
      resolve({ statusCode: res.statusCode, body: responseBody })
    }

    Promise.resolve(handler(req, res)).catch(reject)
  })
}

function parseJson(response) {
  return JSON.parse(response.body)
}

const actionId = 'TASK-LEGACY-GATES'
const leadId = 'LEAD-LEGACY-GATES'
let actionStatus = 'client_accepted_first_run'
let nextStep = 'Operator records owner acceptance.'
let currentPayload = {
  type: 'first_proof_operator_brief',
  template_id: 'daily-intelligence-brief',
  template_name: 'Daily Intelligence Brief Agent',
  title: 'Daily Intelligence Brief Agent first proof',
  first_proof_target: 'One-page morning brief with what changed.',
  checklist: ['Open starter kit', 'Build first proof', 'Keep approval-only'],
  acceptance_tests: ['Shows source trace', 'Approval-only external actions', 'Uses approved source'],
  pilot_order_room_state: {
    status: 'persisted_order_room_state',
    action_id: actionId,
    lead_id: leadId,
    scope_approval_state: 'approved',
    price_approval_state: 'approved',
    payment_route_state: 'approved',
    payment_request_state: 'sent',
    payment_proof_state: 'proof_attached',
    private_workspace_state: 'created_after_payment_proof',
    private_workspace_slug: 'pilot-daily-intelligence-brief-legacy',
    private_workspace_url: 'https://supermega.dev/app/start?workspace=pilot-daily-intelligence-brief-legacy&lead=LEAD-LEGACY-GATES',
    payment_proof_reference: 'legacy payment proof 001',
    workspace_created_at: '2026-07-01T00:00:00.000Z',
    workspace_created_by: 'operator_console',
    real_mrr_delta: 0,
  },
  first_production_run: {
    status: 'first_production_run_recorded',
    first_run_state: 'ready_for_owner_acceptance',
    output: 'Legacy table first production run output.',
    evidence_reference: 'legacy first run evidence 001',
    source_trace: ['Legacy source trace'],
    external_action_state: 'approval_only_until_owner_acceptance',
    connector_write_state: 'blocked_until_owner_acceptance',
    recurring_revenue_state: 'not_claimed',
    real_mrr_delta: 0,
  },
  client_first_run_acceptance: {
    status: 'first_run_acceptance_submitted',
    decision: 'accepted',
    next_gate: 'operator_owner_acceptance_record_required',
    external_action_state: 'blocked_until_operator_owner_acceptance',
    connector_write_state: 'blocked_until_operator_owner_acceptance',
    recurring_revenue_state: 'not_claimed',
    real_mrr_delta: 0,
    recorded_at: '2026-07-01T00:05:00.000Z',
  },
}

function currentRow() {
  return {
    action_id: actionId,
    lead_id: leadId,
    task_id: actionId,
    action_type: 'activation_session_first_proof',
    status: actionStatus,
    priority: 'high',
    owner: 'Revenue Pod',
    title: 'Legacy payload workcell gate smoke',
    next_step: nextStep,
    approval_required: true,
    approval_state: 'pending_owner_review',
    notification_channel: 'console',
    notification_status: 'queued',
    payload: currentPayload,
    result: currentPayload,
    created_at: '2026-07-01T00:00:00.000Z',
  }
}

try {
  process.env.SUPERMEGA_OPS_KEY = 'test-ops-key'
  datastore.postgresConfigured = () => true

  let selectCount = 0
  let legacySelectCount = 0
  let legacyUpdateCount = 0

  datastore.query = async (sql, params) => {
    if (/select[\s\S]*payload,\s*result,?\s*created_at/.test(sql)) {
      selectCount += 1
      assert.equal(params[0], actionId)
      assert.equal(params[1], leadId)
      return {
        status: 'error',
        reason: 'column "result" does not exist',
        code: '42703',
      }
    }
    if (sql.includes("coalesce(payload, '{}'::jsonb) as result") && sql.trim().toLowerCase().startsWith('select')) {
      legacySelectCount += 1
      assert.equal(params[0], actionId)
      assert.equal(params[1], leadId)
      return { status: 'ready', rows: [currentRow()], rowCount: 1 }
    }
    if (sql.includes('payload = jsonb_set')) {
      legacyUpdateCount += 1
      if (sql.includes('{first_run_acceptance}')) {
        currentPayload = {
          ...currentPayload,
          first_run_acceptance: JSON.parse(params[2]),
          first_run_acceptance_prepared_at: JSON.parse(params[3]),
        }
      } else if (sql.includes('{owner_acceptance}')) {
        currentPayload = {
          ...currentPayload,
          owner_acceptance: JSON.parse(params[2]),
          owner_acceptance_recorded_at: JSON.parse(params[3]),
        }
      } else if (sql.includes('{connector_policy}')) {
        currentPayload = {
          ...currentPayload,
          connector_policy: JSON.parse(params[2]),
          connector_policy_recorded_at: JSON.parse(params[3]),
        }
      } else if (sql.includes('{production_approval_queue}')) {
        currentPayload = {
          ...currentPayload,
          production_approval_queue: JSON.parse(params[2]),
          production_approval_queue_prepared_at: JSON.parse(params[3]),
        }
      } else {
        throw new Error('unexpected_legacy_payload_patch')
      }
      actionStatus = params[4]
      nextStep = params[5]
      return { status: 'ready', rows: [currentRow()], rowCount: 1 }
    }
    throw new Error(`unexpected_query=${sql.slice(0, 120)}`)
  }

  const prepared = parseJson(await callHandler({
    operation: 'prepare_first_run_acceptance',
    action_id: actionId,
    lead_id: leadId,
  }))
  assert.equal(prepared.status, 'ready')
  assert.equal(prepared.adapter, 'vercel_postgres_neon_legacy_payload')
  assert.equal(prepared.operation_status, 'prepared')
  assert.equal(prepared.first_run_acceptance.status, 'first_run_acceptance_packet_ready')
  assert.equal(prepared.first_run_acceptance.real_mrr_delta, 0)

  const owner = parseJson(await callHandler({
    operation: 'record_owner_acceptance',
    action_id: actionId,
    lead_id: leadId,
    owner_acceptance_decision: 'accepted',
    owner_acceptance_reference: 'legacy owner acceptance 001',
  }))
  assert.equal(owner.status, 'ready')
  assert.equal(owner.adapter, 'vercel_postgres_neon_legacy_payload')
  assert.equal(owner.operation_status, 'recorded')
  assert.equal(owner.owner_acceptance.status, 'owner_acceptance_recorded')
  assert.equal(owner.owner_acceptance.decision, 'accepted')
  assert.equal(owner.owner_acceptance.real_mrr_delta, 0)

  const connector = parseJson(await callHandler({
    operation: 'record_connector_policy',
    action_id: actionId,
    lead_id: leadId,
    connector_policy_mode: 'approval_only',
    connector_policy_reference: 'legacy connector policy 001',
    allowed_connector_actions: ['read_approved_sources', 'draft_next_run', 'queue_external_send_for_owner_approval', 'queue_connector_write_for_owner_approval', 'record_source_trace'],
  }))
  assert.equal(connector.status, 'ready')
  assert.equal(connector.adapter, 'vercel_postgres_neon_legacy_payload')
  assert.equal(connector.operation_status, 'recorded')
  assert.equal(connector.connector_policy.status, 'connector_policy_recorded')
  assert.equal(connector.connector_policy.real_mrr_delta, 0)

  const queue = parseJson(await callHandler({
    operation: 'prepare_production_approval_queue',
    action_id: actionId,
    lead_id: leadId,
    production_queue_reference: 'legacy production queue 001',
  }))
  assert.equal(queue.status, 'ready')
  assert.equal(queue.adapter, 'vercel_postgres_neon_legacy_payload')
  assert.equal(queue.operation_status, 'prepared')
  assert.equal(queue.production_approval_queue.status, 'production_approval_queue_ready')
  assert.equal(queue.production_approval_queue.autopilot_state, 'draft_queue_only')
  assert.equal(queue.production_approval_queue.real_mrr_delta, 0)

  assert.equal(selectCount, 4)
  assert.equal(legacySelectCount, 4)
  assert.equal(legacyUpdateCount, 4)

  console.log(JSON.stringify({
    status: 'ready',
    audit: 'pipeline-control-legacy-payload-workcell-gates',
    operations: ['prepare_first_run_acceptance', 'record_owner_acceptance', 'record_connector_policy', 'prepare_production_approval_queue'],
    legacy_selects: legacySelectCount,
    legacy_updates: legacyUpdateCount,
    final_action_status: actionStatus,
    real_mrr_delta: queue.production_approval_queue.real_mrr_delta,
  }, null, 2))
} finally {
  if (originalOpsKey === undefined) delete process.env.SUPERMEGA_OPS_KEY
  else process.env.SUPERMEGA_OPS_KEY = originalOpsKey
  datastore.postgresConfigured = originalPostgresConfigured
  datastore.query = originalQuery
}
