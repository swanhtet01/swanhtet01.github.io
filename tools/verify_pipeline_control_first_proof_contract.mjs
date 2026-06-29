import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const handler = require('../api/pipeline-control.js')

function fail(message, extra = {}) {
  console.error(JSON.stringify({ status: 'error', message, ...extra }, null, 2))
  process.exit(1)
}

const internals = handler.__test || {}
if (typeof internals.safeAction !== 'function') {
  fail('pipeline_control_safe_action_missing')
}

const action = internals.safeAction({
  action_id: 'TASK-TEST123',
  lead_id: 'LEAD-TEST123',
  task_id: 'task-test123',
  action_type: 'lead_followup',
  status: 'done',
  priority: 'high',
  owner: 'Revenue Pod',
  title: 'Build first proof',
  next_step: 'Run first proof packet.',
  approval_required: true,
  approval_state: 'pending',
  notification_channel: 'email',
  notification_status: 'queued',
  created_at: '2026-06-30T00:00:00.000Z',
  payload: {
    first_proof_task: {
      type: 'first_proof_build',
      template_id: 'daily-intelligence-brief',
      template_name: 'Daily Intelligence Brief Agent',
      starter_kit_url: '/site/agent-templates/daily-intelligence-brief.json',
      price_hint: '11,000,000 MMK setup',
      first_proof_target: 'One-page morning brief with what changed and what to do next.',
      checklist: ['Open starter kit', 'Review buyer goal', 'Build first proof'],
      acceptance_tests: ['Shows source trace', 'Approval-only external actions', 'Uses approved sample sources'],
      approval_required: true,
      human_gate: 'owner approval before send/write/payment actions',
    },
  },
  result: {
    status: 'ready',
    type: 'first_proof_operator_brief',
    template_id: 'daily-intelligence-brief',
    title: 'Daily Intelligence Brief Agent first proof for Yangon Import Co',
    checklist: ['Open starter kit', 'Review buyer goal', 'Build first proof'],
    acceptance_tests: ['Shows source trace', 'Approval-only external actions', 'Uses approved sample sources'],
    starter_kit_url: '/site/agent-templates/daily-intelligence-brief.json',
    first_proof_target: 'One-page morning brief with what changed and what to do next.',
    approval_required: true,
    human_gate: 'owner approval before send/write/payment actions',
    body: 'Internal raw operator body with Buyer email: owner@example.com',
  },
})

assert.equal(action.first_proof.status, 'operator_brief_ready')
assert.equal(action.first_proof.template_id, 'daily-intelligence-brief')
assert.equal(action.first_proof.template_name, 'Daily Intelligence Brief Agent')
assert.equal(action.first_proof.starter_kit_url, '/site/agent-templates/daily-intelligence-brief.json')
assert.equal(action.first_proof.approval_required, true)
assert.equal(action.first_proof.human_gate, 'owner approval before send/write/payment actions')
assert.ok(action.first_proof.title.includes('Daily Intelligence Brief Agent'))
assert.ok(action.first_proof.checklist.length >= 3)
assert.ok(action.first_proof.acceptance_tests.length >= 3)
assert.ok(action.first_proof.buyer_reply_draft.includes('Hi there,'))
assert.ok(action.first_proof.buyer_reply_draft.includes('First proof: One-page morning brief'))
assert.ok(action.first_proof.buyer_reply_draft.includes('will not send messages'))
assert.ok(action.first_proof.proof_delivery_packet.includes('# Daily Intelligence Brief Agent first proof'))
assert.ok(action.first_proof.proof_delivery_packet.includes('## Source trace'))
assert.ok(action.first_proof.proof_delivery_packet.includes('## Acceptance test status'))
assert.ok(action.first_proof.pilot_close_packet.includes('# Daily Intelligence Brief Agent pilot close packet'))
assert.ok(action.first_proof.pilot_close_packet.includes('Price hint: 11,000,000 MMK setup'))
assert.ok(action.first_proof.pilot_close_packet.includes('Confirm pilot scope and price'))
assert.equal(action.first_proof.pilot_order_room.status, 'draft_owner_approval_required')
assert.equal(action.first_proof.pilot_order_room.payment_state, 'payment_proof_required')
assert.equal(action.first_proof.pilot_order_room.order_state, 'order_not_started')
assert.ok(action.first_proof.pilot_order_room.payment_request_draft.includes('PAYMENT_LINK_REQUIRED_AFTER_OWNER_APPROVAL'))
assert.ok(action.first_proof.pilot_order_room.payment_request_draft.includes('Do not claim real MRR until payment proof is recorded.'))
assert.ok(action.first_proof.pilot_order_room.payment_proof_ledger_csv.includes('"payment_proof_required"'))
assert.ok(action.first_proof.pilot_order_room.order_room_ledger_csv.includes('"order_not_started"'))
assert.ok(action.first_proof.pilot_order_room.order_room_ledger_csv.includes('"real_mrr_delta"'))
assert.ok(action.first_proof.pilot_order_room.pilot_start_checklist.includes('Payment proof is attached to the payment-proof ledger.'))
assert.ok(!JSON.stringify(action).includes('owner@example.com'))

console.log(
  JSON.stringify(
    {
      status: 'ready',
      first_proof_status: action.first_proof.status,
      template_id: action.first_proof.template_id,
      checklist_items: action.first_proof.checklist.length,
      acceptance_tests: action.first_proof.acceptance_tests.length,
      buyer_reply_draft: 'ready',
      proof_delivery_packet: 'ready',
      pilot_close_packet: 'ready',
      pilot_order_room: 'ready',
    },
    null,
    2,
  ),
)
