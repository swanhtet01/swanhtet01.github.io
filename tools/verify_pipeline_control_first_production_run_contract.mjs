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
    next_step: 'Record first production run.',
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

  const missingOutput = await callHandler({
    body: JSON.stringify({
      operation: 'record_first_production_run',
      action_id: 'TASK-TEST123',
      lead_id: 'LEAD-TEST123',
      first_run_evidence_reference: 'workspace output draft 001',
    }),
  })
  assert.equal(missingOutput.statusCode, 400)
  assert.equal(parseJson(missingOutput).reason, 'missing_first_run_output')

  datastore.query = async () => ({ status: 'ready', rows: [baseRow(blockedState)], rowCount: 1 })
  const blocked = await callHandler({
    body: JSON.stringify({
      operation: 'record_first_production_run',
      action_id: 'TASK-TEST123',
      lead_id: 'LEAD-TEST123',
      first_run_output: 'Drafted morning brief with three urgent invoices and one customer issue.',
      first_run_evidence_reference: 'workspace output draft 001',
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
      assert.ok(sql.includes('from public.supermega_pipeline_actions'), 'first_production_run_select_missing')
      assert.equal(params[0], 'TASK-TEST123')
      assert.equal(params[1], 'LEAD-TEST123')
      return { status: 'ready', rows: [baseRow(createdState)], rowCount: 1 }
    }
    assert.ok(sql.includes("'{first_production_run}'"), 'first_production_run_jsonb_set_missing')
    assert.ok(sql.includes("'{first_production_run_recorded_at}'"), 'first_production_run_recorded_at_missing')
    const firstRun = JSON.parse(params[2])
    assert.equal(firstRun.status, 'first_production_run_recorded')
    assert.equal(firstRun.evidence_reference, 'workspace output draft 001')
    assert.equal(firstRun.first_run_state, 'ready_for_owner_acceptance')
    assert.equal(firstRun.external_action_state, 'approval_only_until_owner_acceptance')
    assert.equal(firstRun.connector_write_state, 'blocked_until_owner_acceptance')
    assert.equal(firstRun.recurring_revenue_state, 'not_claimed')
    assert.equal(firstRun.real_mrr_delta, 0)
    assert.ok(firstRun.output.includes('three urgent invoices'))
    assert.ok(firstRun.packet.includes('workspace output draft 001'))
    assert.ok(firstRun.ledger_csv.includes('"first_production_run_recorded"'))
    assert.deepEqual(firstRun.source_trace, ['Gmail thread export 2026-06-30', 'Owner-approved POS CSV'])
    return {
      status: 'ready',
      rows: [
        {
          ...baseRow(createdState, {
            first_production_run: firstRun,
            first_production_run_recorded_at: params[3],
          }),
          status: 'first_run_output_ready',
          next_step: 'Prepare owner acceptance for the recorded first production run before any external send or connector write.',
        },
      ],
      rowCount: 1,
    }
  }

  const recorded = await callHandler({
    body: JSON.stringify({
      operation: 'record_first_production_run',
      action_id: 'TASK-TEST123',
      lead_id: 'LEAD-TEST123',
      first_run_output: 'Drafted morning brief with three urgent invoices and one customer issue.',
      first_run_evidence_reference: 'workspace output draft 001',
      source_trace: ['Gmail thread export 2026-06-30', 'Owner-approved POS CSV'],
    }),
  })
  const recordedBody = parseJson(recorded)
  assert.equal(recorded.statusCode, 200)
  assert.equal(recordedBody.operation, 'record_first_production_run')
  assert.equal(recordedBody.operation_status, 'recorded')
  assert.equal(recordedBody.first_production_run.status, 'first_production_run_recorded')
  assert.equal(recordedBody.first_production_run.real_mrr_delta, 0)
  assert.equal(recordedBody.action.status, 'first_run_output_ready')
  assert.ok(recordedBody.action.first_proof.pilot_order_room.first_production_run_packet.includes('three urgent invoices'))
  assert.ok(recordedBody.action.first_proof.pilot_order_room.first_production_run_ledger_csv.includes('"ready_for_owner_acceptance"'))
  assert.equal(queryCount, 2)

  const existingFirstRun = recordedBody.first_production_run
  datastore.query = async () => ({
    status: 'ready',
    rows: [baseRow(createdState, { first_production_run: existingFirstRun })],
    rowCount: 1,
  })
  const idempotent = await callHandler({
    body: JSON.stringify({
      operation: 'record_first_production_run',
      action_id: 'TASK-TEST123',
      lead_id: 'LEAD-TEST123',
      first_run_output: 'Drafted morning brief with three urgent invoices and one customer issue.',
      first_run_evidence_reference: 'workspace output draft 001',
      source_trace: ['Gmail thread export 2026-06-30', 'Owner-approved POS CSV'],
    }),
  })
  const idempotentBody = parseJson(idempotent)
  assert.equal(idempotent.statusCode, 200)
  assert.equal(idempotentBody.operation_status, 'already_recorded')
  assert.equal(idempotentBody.first_production_run.status, 'first_production_run_recorded')

  const legacyRow = baseRow(createdState)
  legacyRow.payload = {
    ...legacyRow.payload,
    ...legacyRow.result,
  }
  legacyRow.result = legacyRow.payload
  let legacyQueryCount = 0
  datastore.query = async (sql, params) => {
    legacyQueryCount += 1
    if (legacyQueryCount === 1) {
      assert.ok(sql.includes('payload,'), 'legacy_initial_select_payload_missing')
      assert.ok(sql.includes('result'), 'legacy_initial_select_should_try_result_column')
      assert.ok(!sql.includes("coalesce(payload, '{}'::jsonb) as result"), 'legacy_initial_select_should_not_payload_alias')
      return {
        status: 'error',
        reason: 'column "result" does not exist',
        code: '42703',
      }
    }
    if (legacyQueryCount === 2) {
      assert.ok(sql.includes("coalesce(payload, '{}'::jsonb) as result"), 'legacy_select_payload_as_result_missing')
      assert.equal(params[0], 'TASK-TEST123')
      assert.equal(params[1], 'LEAD-TEST123')
      return { status: 'ready', rows: [legacyRow], rowCount: 1 }
    }
    assert.ok(sql.includes('payload = jsonb_set'), 'legacy_payload_update_missing')
    assert.ok(sql.includes("'{first_production_run}'"), 'legacy_first_production_run_jsonb_set_missing')
    assert.ok(sql.includes("'{first_production_run_recorded_at}'"), 'legacy_first_production_run_recorded_at_missing')
    assert.ok(sql.includes("coalesce(a.payload, '{}'::jsonb) as result"), 'legacy_return_payload_as_result_missing')
    const firstRun = JSON.parse(params[2])
    assert.equal(firstRun.status, 'first_production_run_recorded')
    assert.equal(firstRun.first_run_state, 'ready_for_owner_acceptance')
    assert.equal(firstRun.external_action_state, 'approval_only_until_owner_acceptance')
    assert.equal(firstRun.real_mrr_delta, 0)
    return {
      status: 'ready',
      rows: [
        {
          ...legacyRow,
          payload: {
            ...legacyRow.payload,
            first_production_run: firstRun,
            first_production_run_recorded_at: params[3],
          },
          result: {
            ...legacyRow.payload,
            first_production_run: firstRun,
            first_production_run_recorded_at: params[3],
          },
          status: 'first_run_output_ready',
          next_step: 'Prepare owner acceptance for the recorded first production run before any external send or connector write.',
        },
      ],
      rowCount: 1,
    }
  }
  const legacy = await callHandler({
    body: JSON.stringify({
      operation: 'record_first_production_run',
      action_id: 'TASK-TEST123',
      lead_id: 'LEAD-TEST123',
      first_run_output: 'Legacy payload-only SQL first production run.',
      first_run_evidence_reference: 'legacy payload evidence 001',
      source_trace: ['Legacy payload source trace'],
    }),
  })
  const legacyBody = parseJson(legacy)
  assert.equal(legacy.statusCode, 200)
  assert.equal(legacyBody.adapter, 'vercel_postgres_neon_legacy_payload')
  assert.equal(legacyBody.operation_status, 'recorded')
  assert.equal(legacyBody.action.status, 'first_run_output_ready')
  assert.equal(legacyBody.first_production_run.status, 'first_production_run_recorded')
  assert.equal(legacyBody.first_production_run.real_mrr_delta, 0)
  assert.equal(legacyQueryCount, 3)

  console.log(
    JSON.stringify(
      {
        status: 'ready',
        audit: 'pipeline-control-first-production-run',
        missing_output_status: missingOutput.statusCode,
        blocked_status: blocked.statusCode,
        operation_status: recordedBody.operation_status,
        first_run_status: recordedBody.first_production_run.status,
        idempotent_status: idempotentBody.operation_status,
        legacy_status: legacyBody.operation_status,
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
