import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { Readable, Writable } from 'node:stream'

const require = createRequire(import.meta.url)
const root = process.cwd()
const apiPath = resolve(root, 'api/first-run-acceptance-submissions.js')

assert.ok(existsSync(apiPath), 'first_run_acceptance_submissions_api_missing')

const datastore = require('../api/lib/supermega-datastore.js')
const blobQueue = require('../api/lib/supermega-blob-queue.js')
const handler = require('../api/first-run-acceptance-submissions.js')
const pipelineControlHandler = require('../api/pipeline-control.js')

const originalPostgresConfigured = datastore.postgresConfigured
const originalFindActionRecord = blobQueue.findActionRecord
const originalUpdateActionRecord = blobQueue.updateActionRecord

function callHandler({ method = 'POST', body = {} } = {}) {
  return new Promise((resolveResponse, reject) => {
    const req = Readable.from(method === 'POST' ? [JSON.stringify(body)] : [])
    req.method = method
    req.url = '/api/first-run-acceptance-submissions'
    req.headers = { 'content-type': 'application/json' }

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
      resolveResponse({ statusCode: res.statusCode, headers: res.headers, body: responseBody })
    }

    Promise.resolve(handler(req, res)).catch(reject)
  })
}

function parseJson(response) {
  return JSON.parse(response.body)
}

const {
  normalizeFirstRunAcceptanceSubmission,
  publicSubmissionResponse,
} = handler.__test

assert.equal(typeof normalizeFirstRunAcceptanceSubmission, 'function')
assert.equal(typeof publicSubmissionResponse, 'function')

const actionRow = {
  action_id: 'TASK-FIRST-RUN-ACCEPT-001',
  lead_id: 'LEAD-FIRST-RUN-ACCEPT-001',
  task_id: 'TASK-FIRST-RUN-ACCEPT-001',
  action_type: 'activation_session_first_proof',
  status: 'first_run_output_ready',
  priority: 'high',
  owner: 'Delivery Pod',
  title: 'AI Workcell first run for Yangon Retail Co',
  next_step: 'Ask the client to accept or request changes.',
  approval_required: true,
  approval_state: 'pending_owner_review',
  notification_channel: 'operator_console',
  notification_status: 'first_run_output_ready',
  created_at: '2026-07-01T00:00:00.000Z',
  payload: {
    lead: {
      company: 'Yangon Retail Co',
      name: 'Ko Tun',
      requested_package: 'AI Workcell Pilot',
    },
  },
  result: {
    type: 'first_proof_operator_brief',
    template_id: 'chat-ledger',
    template_name: 'Chat Ledger Agent',
    first_production_run: {
      status: 'first_production_run_recorded',
      first_run_state: 'ready_for_owner_acceptance',
      output: 'Owner queue with three follow-up tasks and source trace.',
      evidence_reference: 'workspace-first-run-001',
      external_action_state: 'approval_only_until_owner_acceptance',
      connector_write_state: 'blocked_until_owner_acceptance',
      recurring_revenue_state: 'not_claimed',
      real_mrr_delta: 0,
    },
  },
}

let currentRow = JSON.parse(JSON.stringify(actionRow))
let recordedPatch = null

try {
  const normalized = normalizeFirstRunAcceptanceSubmission({
    lead_id: 'LEAD-FIRST-RUN-ACCEPT-001',
    action_id: 'TASK-FIRST-RUN-ACCEPT-001',
    decision: 'accepted',
    client_note: 'This is useful. Continue with the next approval-only run.',
    first_run_packet_excerpt: 'Owner queue with three follow-up tasks and source trace.',
  })
  assert.equal(normalized.status, 'first_run_acceptance_submitted')
  assert.equal(normalized.acceptance_type, 'client_first_run_acceptance')
  assert.equal(normalized.decision, 'accepted')
  assert.equal(normalized.next_gate, 'operator_owner_acceptance_record_required')
  assert.equal(normalized.external_action_state, 'blocked_until_operator_owner_acceptance')
  assert.equal(normalized.connector_write_state, 'blocked_until_operator_owner_acceptance')
  assert.equal(normalized.payment_request_state, 'blocked_until_retainer_offer_approval')
  assert.equal(normalized.recurring_revenue_state, 'not_claimed')
  assert.equal(normalized.real_mrr_delta, 0)
  assert.ok(normalized.guardrails.includes('no_connector_write'))
  assert.ok(normalized.guardrails.includes('no_recurring_revenue_claim'))

  const publicResponse = publicSubmissionResponse({
    submission: normalized,
    action: {
      action_id: 'TASK-FIRST-RUN-ACCEPT-001',
      lead_id: 'LEAD-FIRST-RUN-ACCEPT-001',
      status: 'client_accepted_first_run',
      approval_state: 'pending_owner_review',
      notification_status: 'first_run_acceptance_received',
    },
    adapter: 'vercel_blob',
  })
  assert.equal(publicResponse.status, 'ready')
  assert.equal(publicResponse.submission_status, 'first_run_acceptance_received')
  assert.equal(publicResponse.first_run_acceptance.decision, 'accepted')
  assert.equal(publicResponse.first_run_acceptance.real_mrr_delta, 0)
  assert.equal(publicResponse.first_run_acceptance.client_note, undefined, 'public_response_must_not_echo_client_note')
  assert.equal(publicResponse.first_run_acceptance.first_run_packet_excerpt, undefined, 'public_response_must_not_echo_first_run_excerpt')

  datastore.postgresConfigured = () => false
  blobQueue.findActionRecord = async (selector) => {
    assert.equal(selector.action_id, 'TASK-FIRST-RUN-ACCEPT-001')
    assert.equal(selector.lead_id, 'LEAD-FIRST-RUN-ACCEPT-001')
    return { status: 'ready', adapter: 'vercel_blob', row: currentRow }
  }
  blobQueue.updateActionRecord = async (selector, patch) => {
    assert.equal(selector.action_id, 'TASK-FIRST-RUN-ACCEPT-001')
    assert.equal(selector.lead_id, 'LEAD-FIRST-RUN-ACCEPT-001')
    recordedPatch = patch
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
      lead_id: 'LEAD-FIRST-RUN-ACCEPT-001',
      action_id: 'TASK-FIRST-RUN-ACCEPT-001',
      decision: 'accepted',
      client_note: 'This is useful. Continue with the next approval-only run.',
      first_run_packet_excerpt: 'Owner queue with three follow-up tasks and source trace.',
    },
  })
  const body = parseJson(response)
  assert.equal(response.statusCode, 200)
  assert.equal(body.status, 'ready')
  assert.equal(body.endpoint, 'first-run-acceptance-submissions')
  assert.equal(body.submission_status, 'first_run_acceptance_received')
  assert.equal(body.action.status, 'client_accepted_first_run')
  assert.equal(body.action.approval_state, 'pending_owner_review')
  assert.equal(body.first_run_acceptance.decision, 'accepted')
  assert.equal(body.first_run_acceptance.next_gate, 'operator_owner_acceptance_record_required')
  assert.equal(body.first_run_acceptance.external_action_state, 'blocked_until_operator_owner_acceptance')
  assert.equal(body.first_run_acceptance.connector_write_state, 'blocked_until_operator_owner_acceptance')
  assert.equal(body.first_run_acceptance.recurring_revenue_state, 'not_claimed')
  assert.equal(body.first_run_acceptance.real_mrr_delta, 0)
  assert.equal(body.first_run_acceptance.client_note, undefined, 'handler_response_must_not_echo_client_note')
  assert.ok(recordedPatch, 'first_run_acceptance_patch_missing')
  assert.equal(recordedPatch.status, 'client_accepted_first_run')
  assert.equal(recordedPatch.result.client_first_run_acceptance.decision, 'accepted')
  assert.equal(recordedPatch.result.client_first_run_acceptance.real_mrr_delta, 0)
  const proofPacket = pipelineControlHandler.__test.firstProofPacket(currentRow)
  assert.equal(proofPacket.pilot_order_room.client_first_run_acceptance.decision, 'accepted')
  assert.equal(proofPacket.pilot_order_room.client_first_run_acceptance.real_mrr_delta, 0)
  assert.ok(proofPacket.pilot_order_room.client_first_run_acceptance_json.includes('"decision": "accepted"'), 'client_first_run_acceptance_json_missing')

  const invalidDecision = await callHandler({
    body: {
      lead_id: 'LEAD-FIRST-RUN-ACCEPT-001',
      action_id: 'TASK-FIRST-RUN-ACCEPT-001',
      decision: 'maybe',
    },
  })
  const invalidDecisionBody = parseJson(invalidDecision)
  assert.equal(invalidDecision.statusCode, 400)
  assert.equal(invalidDecisionBody.status, 'error')
  assert.equal(invalidDecisionBody.reason, 'invalid_first_run_acceptance_decision')

  const workspacePage = existsSync(resolve(root, '.vercel/output/static/app/start/index.html'))
    ? readFileSync(resolve(root, '.vercel/output/static/app/start/index.html'), 'utf8')
    : ''
  if (workspacePage) {
    for (const token of [
      'Submit first-run acceptance',
      '/api/first-run-acceptance-submissions',
      'first_run_acceptance_submitted',
      'Submitted for operator owner-acceptance review',
      'Submitting stores the first-run decision for operator review only',
    ]) {
      assert.ok(workspacePage.includes(token), `first_run_acceptance_page_missing_${token}`)
    }
  }

  console.log(JSON.stringify({
    status: 'ready',
    contract: 'first_run_acceptance_submission',
    decision: body.first_run_acceptance.decision,
    next_gate: body.first_run_acceptance.next_gate,
    action_status: body.action.status,
    real_mrr_delta: body.first_run_acceptance.real_mrr_delta,
  }, null, 2))
} finally {
  datastore.postgresConfigured = originalPostgresConfigured
  blobQueue.findActionRecord = originalFindActionRecord
  blobQueue.updateActionRecord = originalUpdateActionRecord
}
