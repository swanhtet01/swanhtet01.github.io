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

const readyState = {
  status: 'persisted_order_room_state',
  action_id: 'TASK-TEST123',
  lead_id: 'LEAD-TEST123',
  scope_approval_state: 'approved',
  price_approval_state: 'approved',
  payment_route_state: 'approved',
  payment_request_state: 'sent',
  payment_proof_state: 'proof_attached',
  private_workspace_state: 'ready_after_payment_proof',
  payment_proof_reference: 'KBZ transfer screenshot 123',
  real_mrr_delta: 0,
}

const baseRow = {
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
    pilot_order_room_state: readyState,
  },
}

try {
  process.env.SUPERMEGA_OPS_KEY = 'test-ops-key'
  datastore.postgresConfigured = () => true

  let queryCount = 0
  datastore.query = async (sql, params) => {
    queryCount += 1
    if (queryCount === 1) {
      assert.ok(sql.includes('from public.supermega_pipeline_actions'), 'workspace_select_missing')
      assert.equal(params[0], 'TASK-TEST123')
      assert.equal(params[1], 'LEAD-TEST123')
      return { status: 'ready', rows: [baseRow], rowCount: 1 }
    }
    assert.ok(sql.includes("'{private_workspace_manifest}'"), 'workspace_manifest_jsonb_set_missing')
    assert.ok(sql.includes("'{private_workspace_started_at}'"), 'workspace_started_at_jsonb_set_missing')
    const createdState = JSON.parse(params[2])
    const manifest = JSON.parse(params[3])
    assert.equal(createdState.private_workspace_state, 'created_after_payment_proof')
    assert.equal(createdState.private_workspace_slug, 'pilot-daily-intelligence-brief-lead-test123')
    assert.equal(createdState.real_mrr_delta, 0)
    assert.equal(manifest.status, 'private_workspace_created')
    assert.equal(manifest.workspace_created, true)
    assert.equal(manifest.first_run_mode, 'approval_only')
    assert.equal(manifest.real_mrr_delta, 0)
    assert.ok(manifest.workspace_url.startsWith('https://supermega.dev/app/start?'))
    assert.ok(manifest.workspace_url.includes('workspace=pilot-daily-intelligence-brief-lead-test123'))
    assert.ok(manifest.workspace_url.includes('lead=LEAD-TEST123'))
    return {
      status: 'ready',
      rows: [
        {
          ...baseRow,
          status: 'workspace_ready',
          next_step: 'Open the private workspace handoff and run the first production job approval-only.',
          result: {
            ...baseRow.result,
            pilot_order_room_state: createdState,
            private_workspace_manifest: manifest,
            private_workspace_started_at: params[4],
          },
        },
      ],
      rowCount: 1,
    }
  }

  const created = await callHandler({
    body: JSON.stringify({
      operation: 'start_private_workspace',
      action_id: 'TASK-TEST123',
      lead_id: 'LEAD-TEST123',
    }),
  })
  const createdBody = parseJson(created)
  assert.equal(created.statusCode, 200)
  assert.equal(createdBody.status, 'ready')
  assert.equal(createdBody.operation, 'start_private_workspace')
  assert.equal(createdBody.operation_status, 'created')
  assert.equal(createdBody.private_workspace_manifest.status, 'private_workspace_created')
  assert.equal(createdBody.private_workspace_manifest.workspace_created, true)
  assert.equal(createdBody.action.status, 'workspace_ready')
  assert.equal(createdBody.action.first_proof.pilot_order_room.private_workspace_manifest.status, 'private_workspace_created')
  assert.ok(createdBody.action.first_proof.pilot_order_room.private_workspace_handoff_packet.includes('Workspace created: yes'))
  assert.ok(createdBody.action.first_proof.pilot_order_room.first_run_queue_csv.includes('"owner_acceptance_review"'))
  assert.equal(queryCount, 2)

  datastore.query = async () => {
    throw new Error('update_order_room_should_not_query_when_workspace_created_is_requested')
  }
  const bypass = await callHandler({
    body: JSON.stringify({
      operation: 'update_order_room',
      action_id: 'TASK-TEST123',
      lead_id: 'LEAD-TEST123',
      scope_approval_state: 'approved',
      price_approval_state: 'approved',
      payment_route_state: 'approved',
      payment_request_state: 'sent',
      payment_proof_state: 'proof_attached',
      private_workspace_state: 'created_after_payment_proof',
    }),
  })
  const bypassBody = parseJson(bypass)
  assert.equal(bypass.statusCode, 409)
  assert.equal(bypassBody.reason, 'use_start_private_workspace_operation')

  console.log(
    JSON.stringify(
      {
        status: 'ready',
        audit: 'pipeline-control-start-private-workspace',
        operation_status: createdBody.operation_status,
        manifest_status: createdBody.private_workspace_manifest.status,
        workspace_created: createdBody.private_workspace_manifest.workspace_created,
        bypass_status: bypass.statusCode,
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
