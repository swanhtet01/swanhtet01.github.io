import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const handler = require('../api/pipeline-control.js')

const { safeAction } = handler.__test

const action = safeAction({
  action_id: 'AUTO-LEAD-001-source',
  lead_id: 'LEAD-001',
  task_id: 'TASK-001',
  action_type: 'source_request',
  status: 'done',
  priority: 'high',
  owner: 'Revenue Pod',
  title: 'Ask for source: Daily Intelligence Brief Agent',
  next_step: 'Ask for one supplier email thread, shipment sheet, or Viber update sample.',
  approval_required: true,
  approval_state: 'pending',
  notification_channel: 'internal_queue',
  notification_status: 'queued',
  created_at: '2026-07-01T03:00:00.000Z',
  result: {
    status: 'ready',
    type: 'source_request_packet',
    lead_id: 'LEAD-001',
    package_name: 'Daily Intelligence Brief Agent',
    title: 'Daily Intelligence Brief Agent source request packet',
    source_request: 'Ask for one supplier email thread, shipment sheet, or Viber update sample.',
    first_output: 'One owner-ready morning brief with source trace and exact follow-up actions.',
    packet: '# Daily Intelligence Brief Agent source request packet\n\nStatus: internal_draft_ready\nExternal send state: blocked_until_owner_approval\n\n## Guardrails\n- No external send from the runner.',
    external_action_state: 'blocked_until_owner_approval',
    payment_or_connector_state: 'blocked_until_owner_approval',
    real_mrr_delta: 0,
    approval_required: true,
    sent: false,
    guardrails: [
      'internal_draft_only',
      'no_external_send_from_runner',
      'owner_approval_before_buyer_message',
      'no_payment_or_connector_without_owner_approval',
    ],
  },
})

assert.equal(action.action_type, 'source_request')
assert.equal(action.status, 'done')
assert.equal(action.autopilot_draft.status, 'ready')
assert.equal(action.autopilot_draft.type, 'source_request_packet')
assert.equal(action.autopilot_draft.package_name, 'Daily Intelligence Brief Agent')
assert.equal(action.autopilot_draft.title, 'Daily Intelligence Brief Agent source request packet')
assert.equal(action.autopilot_draft.sent, false)
assert.equal(action.autopilot_draft.real_mrr_delta, 0)
assert.equal(action.autopilot_draft.external_action_state, 'blocked_until_owner_approval')
assert.equal(action.autopilot_draft.payment_or_connector_state, 'blocked_until_owner_approval')
assert.ok(action.autopilot_draft.packet.includes('source request packet'))
assert.ok(action.autopilot_draft.guardrails.includes('no_external_send_from_runner'))
assert.equal(action.first_proof, null)

const ignored = safeAction({
  action_id: 'AUTO-IGNORED',
  action_type: 'freeform',
  result: {
    status: 'ready',
    type: 'unexpected_internal_payload',
    packet: 'should not leak',
  },
})
assert.equal(ignored.autopilot_draft, null)

console.log(JSON.stringify({
  status: 'ready',
  contract: 'pipeline_control_autopilot_draft',
  type: action.autopilot_draft.type,
  external_action_state: action.autopilot_draft.external_action_state,
  real_mrr_delta: action.autopilot_draft.real_mrr_delta,
}, null, 2))
