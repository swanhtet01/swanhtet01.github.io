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

async function post(payload) {
  const response = await callHandler({ body: JSON.stringify(payload) })
  const body = parseJson(response)
  assert.equal(response.statusCode, 200, `${payload.operation}_expected_200:${JSON.stringify(body).slice(0, 220)}`)
  assert.equal(body.adapter, 'vercel_blob', `${payload.operation}_should_use_blob_fallback`)
  return body
}

const actionId = 'TASK-POSTFALLBACK123'
const leadId = 'LEAD-POSTFALLBACK123'
const workspaceSlug = 'pilot-daily-intelligence-brief-lead-postfallback123'

const createdState = {
  status: 'persisted_order_room_state',
  action_id: actionId,
  lead_id: leadId,
  scope_approval_state: 'approved',
  price_approval_state: 'approved',
  payment_route_state: 'approved',
  payment_request_state: 'sent',
  payment_proof_state: 'proof_attached',
  private_workspace_state: 'created_after_payment_proof',
  private_workspace_slug: workspaceSlug,
  private_workspace_url: `https://supermega.dev/app/start?workspace=${workspaceSlug}&lead=${leadId}`,
  payment_proof_reference: 'setup-payment-proof-post-fallback',
  workspace_created_at: '2026-07-01T01:00:00.000Z',
  workspace_created_by: 'operator_console',
  real_mrr_delta: 0,
}

const ownerAcceptance = {
  status: 'owner_acceptance_recorded',
  decision: 'accepted',
  workspace_slug: workspaceSlug,
  lead_id: leadId,
  template_name: 'Daily Intelligence Brief Agent',
  evidence_reference: 'owner-accepted-first-run-post-fallback',
  first_run_state: 'accepted_for_next_approval_only_run',
  external_action_state: 'approval_only_next_run_allowed',
  connector_write_state: 'blocked_until_explicit_policy',
  recurring_revenue_state: 'not_claimed',
  real_mrr_delta: 0,
}

let currentRow = {
  action_id: actionId,
  lead_id: leadId,
  task_id: 'task-postfallback123',
  action_type: 'lead_followup',
  status: 'owner_accepted_first_run',
  priority: 'high',
  owner: 'Revenue Pod',
  title: 'Build first proof',
  next_step: 'Run the next production cycle approval-only.',
  approval_required: true,
  approval_state: 'approved',
  notification_channel: 'console',
  notification_status: 'queued',
  created_at: '2026-07-01T00:00:00.000Z',
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
    owner_acceptance: ownerAcceptance,
  },
}

try {
  process.env.SUPERMEGA_OPS_KEY = 'test-ops-key'
  datastore.postgresConfigured = () => true
  datastore.query = async () => ({ status: 'error', reason: 'column "result" does not exist', code: '42703' })

  const patches = []
  blobQueue.findActionRecord = async (selector) => {
    assert.equal(selector.action_id, actionId)
    assert.equal(selector.lead_id, leadId)
    return { status: 'ready', adapter: 'vercel_blob', row: currentRow }
  }
  blobQueue.updateActionRecord = async (selector, patch) => {
    assert.equal(selector.action_id, actionId)
    assert.equal(selector.lead_id, leadId)
    patches.push(patch)
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

  const connector = await post({
    operation: 'record_connector_policy',
    action_id: actionId,
    lead_id: leadId,
    connector_policy_mode: 'approval_only',
    connector_policy_reference: 'connector-policy-post-fallback',
    allowed_connector_actions: ['read_approved_sources', 'draft_next_run', 'queue_external_send_for_owner_approval', 'queue_connector_write_for_owner_approval', 'record_source_trace'],
  })
  assert.equal(connector.operation_status, 'recorded')
  assert.equal(connector.connector_policy.status, 'connector_policy_recorded')
  assert.equal(connector.action.status, 'connector_policy_recorded')

  const production = await post({
    operation: 'prepare_production_approval_queue',
    action_id: actionId,
    lead_id: leadId,
    production_queue_reference: 'production-queue-post-fallback',
    source_trace: 'approved inbox + POS export',
  })
  assert.equal(production.operation_status, 'prepared')
  assert.equal(production.production_approval_queue.status, 'production_approval_queue_ready')
  assert.equal(production.action.status, 'production_approval_queue_ready')

  const enterprise = await post({
    operation: 'prepare_enterprise_delivery_pack',
    action_id: actionId,
    lead_id: leadId,
    enterprise_delivery_reference: 'enterprise-boundary-post-fallback',
    support_window: 'business-hours Myanmar time, urgent blockers reviewed same day',
  })
  assert.equal(enterprise.operation_status, 'prepared')
  assert.equal(enterprise.enterprise_delivery_pack.status, 'enterprise_delivery_pack_ready')
  assert.equal(enterprise.action.status, 'enterprise_delivery_pack_ready')

  const customerSuccess = await post({
    operation: 'prepare_customer_success_desk',
    action_id: actionId,
    lead_id: leadId,
    customer_success_reference: 'customer-success-post-fallback',
    support_window: 'business-hours Myanmar time, urgent blockers reviewed same day',
  })
  assert.equal(customerSuccess.operation_status, 'prepared')
  assert.equal(customerSuccess.customer_success_desk.status, 'customer_success_desk_ready')
  assert.equal(customerSuccess.action.status, 'customer_success_desk_ready')

  const retainerOffer = await post({
    operation: 'prepare_retainer_growth_offer',
    action_id: actionId,
    lead_id: leadId,
    retainer_growth_reference: 'retainer-growth-post-fallback',
    retainer_quote: '1,200,000 MMK / month',
  })
  assert.equal(retainerOffer.operation_status, 'prepared')
  assert.equal(retainerOffer.retainer_growth_offer.status, 'retainer_growth_offer_ready')
  assert.equal(retainerOffer.action.status, 'retainer_growth_offer_ready')

  const retainerPayment = await post({
    operation: 'record_retainer_payment_proof',
    action_id: actionId,
    lead_id: leadId,
    amount_mmk: '1,200,000',
    payment_period: 'monthly',
    owner_approval_reference: 'owner-approved-retainer-post-fallback',
    payment_proof_reference: 'retainer-payment-proof-post-fallback',
  })
  assert.equal(retainerPayment.operation_status, 'recorded')
  assert.equal(retainerPayment.retainer_payment_record.status, 'retainer_payment_proof_recorded')
  assert.equal(retainerPayment.retainer_payment_record.real_mrr_delta, 1200000)
  assert.equal(retainerPayment.action.status, 'retainer_payment_proof_recorded')
  assert.ok(retainerPayment.action.first_proof.pilot_order_room.retainer_mrr_summary_json.includes('"real_mrr_delta": 1200000'))

  assert.ok(patches.some((patch) => patch.result?.connector_policy), 'connector_policy_blob_patch_missing')
  assert.ok(patches.some((patch) => patch.result?.production_approval_queue), 'production_queue_blob_patch_missing')
  assert.ok(patches.some((patch) => patch.result?.enterprise_delivery_pack), 'enterprise_delivery_blob_patch_missing')
  assert.ok(patches.some((patch) => patch.result?.customer_success_desk), 'customer_success_blob_patch_missing')
  assert.ok(patches.some((patch) => patch.result?.retainer_growth_offer), 'retainer_growth_blob_patch_missing')
  assert.ok(patches.some((patch) => patch.result?.retainer_payment_record), 'retainer_payment_blob_patch_missing')

  console.log(
    JSON.stringify(
      {
        status: 'ready',
        audit: 'pipeline-control-post-acceptance-blob-fallback',
        connector_status: connector.connector_policy.status,
        production_status: production.production_approval_queue.status,
        enterprise_status: enterprise.enterprise_delivery_pack.status,
        customer_success_status: customerSuccess.customer_success_desk.status,
        retainer_offer_status: retainerOffer.retainer_growth_offer.status,
        retainer_payment_status: retainerPayment.retainer_payment_record.status,
        real_mrr_delta: retainerPayment.retainer_payment_record.real_mrr_delta,
        patches: patches.length,
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
  blobQueue.findActionRecord = originalFindActionRecord
  blobQueue.updateActionRecord = originalUpdateActionRecord
}
