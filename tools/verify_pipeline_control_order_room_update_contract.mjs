import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
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

try {
  const schema = readFileSync('docs/supabase/supermega_pipeline_actions.sql', 'utf8')
  assert.ok(schema.includes('add column if not exists result jsonb'), 'pipeline_actions_result_column_schema_missing')

  process.env.SUPERMEGA_OPS_KEY = 'test-ops-key'
  datastore.postgresConfigured = () => true
  datastore.query = async (sql, params) => {
    assert.ok(sql.includes("jsonb_set(coalesce(a.result, '{}'::jsonb), '{pilot_order_room_state}'"), 'order_room_state_jsonb_set_missing')
    assert.equal(params[0], 'TASK-TEST123')
    assert.equal(params[1], 'LEAD-TEST123')
    const state = JSON.parse(params[2])
    assert.equal(state.payment_proof_state, 'proof_attached')
    assert.equal(state.private_workspace_state, 'ready_after_payment_proof')
    assert.equal(state.real_mrr_delta, 0)
    return {
      status: 'ready',
      rows: [
        {
          action_id: 'TASK-TEST123',
          lead_id: 'LEAD-TEST123',
          task_id: 'task-test123',
          action_type: 'lead_followup',
          status: 'queued',
          priority: 'high',
          owner: 'Revenue Pod',
          title: 'Build first proof',
          next_step: 'Persist order room state.',
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
          },
        },
      ],
      rowCount: 1,
    }
  }

  const response = await callHandler({
    body: JSON.stringify({
      operation: 'update_order_room',
      action_id: 'TASK-TEST123',
      lead_id: 'LEAD-TEST123',
      scope_approval_state: 'approved',
      price_approval_state: 'approved',
      payment_route_state: 'approved',
      payment_request_state: 'sent',
      payment_proof_state: 'proof_attached',
      private_workspace_state: 'ready_after_payment_proof',
      payment_proof_reference: 'KBZ transfer screenshot 123',
      real_mrr_delta: 11000000,
    }),
  })
  const body = parseJson(response)
  assert.equal(response.statusCode, 200)
  assert.equal(body.status, 'ready')
  assert.equal(body.operation, 'update_order_room')
  assert.equal(body.order_room_state.real_mrr_delta, 0)
  assert.equal(body.order_room_state.payment_proof_reference, 'KBZ transfer screenshot 123')
  assert.equal(body.action.first_proof.pilot_order_room.state.payment_proof_state, 'proof_attached')
  assert.equal(body.action.first_proof.pilot_order_room.state.real_mrr_delta, 0)
  assert.equal(body.action.first_proof.pilot_order_room.private_workspace_manifest.status, 'ready_to_create_private_workspace')
  assert.equal(body.action.first_proof.pilot_order_room.private_workspace_manifest.create_workspace_allowed, true)
  assert.equal(body.action.first_proof.pilot_order_room.private_workspace_manifest.real_mrr_delta, 0)
  assert.ok(body.action.first_proof.pilot_order_room.private_workspace_handoff_packet.includes('First run mode: approval_only'))
  assert.ok(body.action.first_proof.pilot_order_room.first_run_queue_csv.includes('"owner_acceptance_review"'))

  const unauthorized = await callHandler({ headers: { authorization: 'Bearer wrong' }, body: '{}' })
  assert.equal(unauthorized.statusCode, 401)
  assert.equal(parseJson(unauthorized).reason, 'unauthorized')

  console.log(
    JSON.stringify(
      {
        status: 'ready',
        audit: 'pipeline-control-order-room-update',
        update_status: body.status,
        payment_proof_state: body.order_room_state.payment_proof_state,
        private_workspace_manifest: body.action.first_proof.pilot_order_room.private_workspace_manifest.status,
        real_mrr_delta: body.order_room_state.real_mrr_delta,
        unauthorized_status: unauthorized.statusCode,
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
