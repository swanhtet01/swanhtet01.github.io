import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { Readable, Writable } from 'node:stream'

const require = createRequire(import.meta.url)
const datastore = require('../api/lib/supermega-datastore.js')
const blobQueue = require('../api/lib/supermega-blob-queue.js')
const handler = require('../api/pipeline-control.js')

const originalOpsKey = process.env.SUPERMEGA_OPS_KEY
const originalPostgresConfigured = datastore.postgresConfigured
const originalQuery = datastore.query
const originalFindActionRecord = blobQueue.findActionRecord
const originalUpdateActionRecord = blobQueue.updateActionRecord

function fail(message, extra = {}) {
  console.error(JSON.stringify({ status: 'error', message, ...extra }, null, 2))
  process.exit(1)
}

function callHandler({ body = {} } = {}) {
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

const internals = handler.__test || {}
if (typeof internals.reconcileClientPaymentSubmission !== 'function') fail('reconcile_client_payment_submission_missing')

const scopePriceApproval = {
  status: 'scope_price_payment_gate_approved',
  approval_type: 'paid_pilot_scope_price',
  lead_id: 'LEAD-CLIENTPAY123',
  action_id: 'TASK-CLIENTPAY123',
  template_name: 'Owner Ops Agent',
  company: 'Yangon Retail Co',
  approved_scope_summary: 'Private owner-operated AI workcell with approved source imports and daily owner queue.',
  approved_price_mmk: 11000000,
  approved_price_label: '11,000,000 MMK',
  payment_route: 'manual_invoice_or_payment_link_after_owner_approval',
  owner_approval_reference: 'Owner approved scope and payment route.',
  payment_request_state: 'approved_to_send',
  payment_proof_state: 'payment_proof_required',
  private_workspace_state: 'not_created_until_payment_proof',
  real_mrr_delta: 0,
}

const baseRow = {
  action_id: 'TASK-CLIENTPAY123',
  lead_id: 'LEAD-CLIENTPAY123',
  task_id: 'TASK-CLIENTPAY123',
  action_type: 'activation_session_first_proof',
  status: 'client_payment_proof_received',
  priority: 'high',
  owner: 'Revenue Pod',
  title: 'Start Owner Ops Agent pilot for Yangon Retail Co',
  next_step: 'Owner reconcile submitted payment proof, then record pilot payment proof before workspace start.',
  approval_required: true,
  approval_state: 'pending_payment_review',
  notification_channel: 'operator_console',
  notification_status: 'client_payment_proof_received',
  created_at: '2026-07-01T00:00:00.000Z',
  payload: {
    lead: {
      lead_id: 'LEAD-CLIENTPAY123',
      task_id: 'TASK-CLIENTPAY123',
      company: 'Yangon Retail Co',
      requested_package: 'Owner Ops Agent',
      public_package: 'Owner Ops Agent',
      first_proof_target: 'Daily owner action queue from messages and files.',
      price_hint: '11,000,000 MMK',
    },
    first_proof_task: {
      type: 'first_proof_build',
      template_id: 'owner-ops-agent',
      template_name: 'Owner Ops Agent',
      first_proof_target: 'Daily owner action queue from messages and files.',
      price_hint: '11,000,000 MMK',
      approval_required: true,
    },
  },
  result: {
    status: 'ready',
    type: 'first_proof_operator_brief',
    template_id: 'owner-ops-agent',
    template_name: 'Owner Ops Agent',
    first_proof_target: 'Daily owner action queue from messages and files.',
    scope_price_approval: scopePriceApproval,
    client_pilot_payment_submission: {
      status: 'client_pilot_payment_submitted',
      submission_type: 'client_pilot_payment_proof',
      action_id: 'TASK-CLIENTPAY123',
      lead_id: 'LEAD-CLIENTPAY123',
      payment_amount_mmk: 5500000,
      payment_method: 'KBZPay transfer',
      payment_proof_reference: 'KBZ client screenshot 2026-07-01',
      client_note: 'Paid the pilot deposit and uploaded the receipt.',
      paid_at: '2026-07-01T01:00:00.000Z',
      submitted_at: '2026-07-01T01:05:00.000Z',
      payment_proof_state: 'client_submitted_owner_review_required',
      private_workspace_state: 'not_created_until_owner_reconciliation',
      setup_cash_delta_mmk: 0,
      real_mrr_delta: 0,
    },
    pilot_order_room_state: {
      status: 'persisted_order_room_state',
      action_id: 'TASK-CLIENTPAY123',
      lead_id: 'LEAD-CLIENTPAY123',
      scope_approval_state: 'approved',
      price_approval_state: 'approved',
      payment_route_state: 'approved',
      payment_request_state: 'sent',
      payment_proof_state: 'client_submitted_owner_review_required',
      private_workspace_state: 'not_created_until_owner_reconciliation',
      real_mrr_delta: 0,
    },
  },
}

let currentRow = JSON.parse(JSON.stringify(baseRow))
const recordedPatches = []

try {
  process.env.SUPERMEGA_OPS_KEY = 'test-ops-key'
  datastore.postgresConfigured = () => false
  blobQueue.findActionRecord = async (selector) => {
    assert.equal(selector.action_id, 'TASK-CLIENTPAY123')
    assert.equal(selector.lead_id, 'LEAD-CLIENTPAY123')
    return { status: 'ready', adapter: 'vercel_blob', row: currentRow }
  }
  blobQueue.updateActionRecord = async (selector, patch) => {
    assert.equal(selector.action_id, 'TASK-CLIENTPAY123')
    assert.equal(selector.lead_id, 'LEAD-CLIENTPAY123')
    recordedPatches.push(patch)
    currentRow = {
      ...currentRow,
      ...patch,
      result: {
        ...currentRow.result,
        ...patch.result,
      },
    }
    return { status: 'ready', adapter: 'vercel_blob', record: currentRow }
  }

  const response = await callHandler({
    body: {
      operation: 'reconcile_client_payment_submission',
      action_id: 'TASK-CLIENTPAY123',
      lead_id: 'LEAD-CLIENTPAY123',
      owner_reconciliation_reference: 'Owner matched KBZ transfer to client screenshot and invoice.',
      create_workspace: true,
    },
  })
  const body = parseJson(response)

  assert.equal(response.statusCode, 200)
  assert.equal(body.status, 'ready')
  assert.equal(body.operation, 'reconcile_client_payment_submission')
  assert.equal(body.operation_status, 'reconciled_and_workspace_created')
  assert.equal(body.payment_reconciliation.status, 'client_payment_submission_reconciled')
  assert.equal(body.payment_reconciliation.setup_cash_delta_mmk, 5500000)
  assert.equal(body.payment_reconciliation.real_mrr_delta, 0)
  assert.equal(body.pilot_payment_proof.status, 'pilot_payment_proof_recorded')
  assert.equal(body.pilot_payment_proof.payment_amount_mmk, 5500000)
  assert.equal(body.pilot_payment_proof.payment_method, 'KBZPay transfer')
  assert.equal(body.pilot_payment_proof.payment_proof_reference, 'KBZ client screenshot 2026-07-01')
  assert.equal(body.pilot_payment_proof.owner_reconciliation_reference, 'Owner matched KBZ transfer to client screenshot and invoice.')
  assert.equal(body.pilot_payment_proof.client_payment_submission_status, 'client_pilot_payment_submitted')
  assert.equal(body.pilot_payment_proof.setup_cash_delta_mmk, 5500000)
  assert.equal(body.pilot_payment_proof.real_mrr_delta, 0)
  assert.equal(body.private_workspace_manifest.status, 'private_workspace_created')
  assert.equal(body.action.status, 'workspace_ready')
  assert.equal(recordedPatches.length, 2)
  assert.equal(recordedPatches[0].status, 'payment_proof_recorded')
  assert.equal(recordedPatches[0].result.pilot_payment_proof.payment_proof_reference, 'KBZ client screenshot 2026-07-01')
  assert.equal(recordedPatches[1].status, 'workspace_ready')

  currentRow = JSON.parse(JSON.stringify(baseRow))
  currentRow.result.client_pilot_payment_submission = {}
  const missing = await callHandler({
    body: {
      operation: 'reconcile_client_payment_submission',
      action_id: 'TASK-CLIENTPAY123',
      lead_id: 'LEAD-CLIENTPAY123',
      owner_reconciliation_reference: 'Owner matched payment.',
      create_workspace: true,
    },
  })
  const missingBody = parseJson(missing)
  assert.equal(missing.statusCode, 400)
  assert.equal(missingBody.status, 'error')
  assert.equal(missingBody.reason, 'client_payment_submission_required')

  const legacyPayloadRow = JSON.parse(JSON.stringify(baseRow))
  legacyPayloadRow.payload = {
    ...legacyPayloadRow.payload,
    scope_price_approval: scopePriceApproval,
    client_pilot_payment_submission: baseRow.result.client_pilot_payment_submission,
    pilot_order_room_state: baseRow.result.pilot_order_room_state,
  }
  legacyPayloadRow.result = legacyPayloadRow.payload
  currentRow = JSON.parse(JSON.stringify(legacyPayloadRow))
  recordedPatches.length = 0
  let selectWithMissingResultColumn = true
  datastore.postgresConfigured = () => true
  blobQueue.findActionRecord = async () => ({ status: 'error', reason: 'action_not_found' })
  datastore.query = async (sql, params = []) => {
    const query = String(sql)
    const isPlainSelect = query.trimStart().toLowerCase().startsWith('select')
    if (isPlainSelect && query.includes('from public.supermega_pipeline_actions') && query.includes('result') && selectWithMissingResultColumn) {
      selectWithMissingResultColumn = false
      return { status: 'error', reason: 'column "result" does not exist', code: '42703' }
    }
    if (isPlainSelect && query.includes('from public.supermega_pipeline_actions')) {
      assert.deepEqual(params, ['TASK-CLIENTPAY123', 'LEAD-CLIENTPAY123'])
      return { status: 'ready', rows: [currentRow] }
    }
    if (query.includes("status = 'payment_proof_recorded'")) {
      const proof = JSON.parse(params[2])
      const state = JSON.parse(params[4])
      currentRow = {
        ...currentRow,
        status: 'payment_proof_recorded',
        next_step: 'Create private workspace, then run the first production job approval-only.',
        payload: {
          ...currentRow.payload,
          pilot_payment_proof: proof,
          pilot_payment_proof_recorded_at: params[3],
          pilot_order_room_state: state,
        },
      }
      currentRow.result = currentRow.payload
      return { status: 'ready', rows: [currentRow] }
    }
    if (query.includes('private_workspace_started_at')) {
      const state = JSON.parse(params[2])
      const manifest = JSON.parse(params[3])
      currentRow = {
        ...currentRow,
        status: 'workspace_ready',
        next_step: 'Open the private workspace handoff and run the first production job approval-only.',
        payload: {
          ...currentRow.payload,
          pilot_order_room_state: state,
          private_workspace_manifest: manifest,
          private_workspace_started_at: params[4],
        },
      }
      currentRow.result = currentRow.payload
      return { status: 'ready', rows: [currentRow] }
    }
    return { status: 'error', reason: 'unexpected_query', sql: query.slice(0, 120) }
  }
  const legacyResponse = await callHandler({
    body: {
      operation: 'reconcile_client_payment_submission',
      action_id: 'TASK-CLIENTPAY123',
      lead_id: 'LEAD-CLIENTPAY123',
      owner_reconciliation_reference: 'Owner matched legacy-payload payment proof.',
      create_workspace: true,
    },
  })
  const legacyBody = parseJson(legacyResponse)
  assert.equal(legacyResponse.statusCode, 200)
  assert.equal(legacyBody.status, 'ready')
  assert.equal(legacyBody.adapter, 'vercel_postgres_neon_legacy_payload')
  assert.equal(legacyBody.operation_status, 'reconciled_and_workspace_created')
  assert.equal(legacyBody.pilot_payment_proof.client_payment_submission_status, 'client_pilot_payment_submitted')
  assert.equal(legacyBody.payment_reconciliation.setup_cash_delta_mmk, 5500000)
  assert.equal(legacyBody.payment_reconciliation.real_mrr_delta, 0)
  assert.equal(legacyBody.private_workspace_manifest.status, 'private_workspace_created')

  console.log(JSON.stringify({
    status: 'ready',
    audit: 'pipeline-control-client-payment-reconciliation',
    operation_status: body.operation_status,
    action_status: body.action.status,
    payment_amount_mmk: body.pilot_payment_proof.payment_amount_mmk,
    workspace_status: body.private_workspace_manifest.status,
    setup_cash_delta_mmk: body.payment_reconciliation.setup_cash_delta_mmk,
    real_mrr_delta: body.payment_reconciliation.real_mrr_delta,
  }, null, 2))
} finally {
  if (originalOpsKey === undefined) delete process.env.SUPERMEGA_OPS_KEY
  else process.env.SUPERMEGA_OPS_KEY = originalOpsKey
  datastore.postgresConfigured = originalPostgresConfigured
  datastore.query = originalQuery
  blobQueue.findActionRecord = originalFindActionRecord
  blobQueue.updateActionRecord = originalUpdateActionRecord
}
