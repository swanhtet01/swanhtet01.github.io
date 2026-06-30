import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const handler = require('../api/pipeline-control.js')

const { autopilotCommandBoard, buildRetainerPaymentRecord, revenueProofBoard } = handler.__test

const paidRecord = buildRetainerPaymentRecord({
  retainerGrowthOffer: {
    workspace_slug: 'pilot-daily-intelligence-brief-acme',
    lead_id: 'LEAD-PAID',
    template_name: 'Daily Intelligence Brief Agent',
  },
  paymentProofReference: 'KBZ-PROOF-002',
  ownerApprovalReference: 'OWNER-APPROVAL-002',
  amountMmk: 900000,
  paymentPeriod: 'monthly',
  preparedAt: '2026-07-01T02:00:00.000Z',
})

const paidAction = {
  action_id: 'ACTION-PAID',
  lead_id: 'LEAD-PAID',
  action_type: 'lead_followup',
  status: 'retainer_payment_proof_recorded',
  priority: 'high',
  owner: 'Revenue Pod',
  title: 'Paid intelligence brief retainer',
  next_step: 'Reconcile bank match.',
  approval_required: true,
  approval_state: 'approved',
  notification_channel: 'console',
  notification_status: 'queued',
  payload: {
    first_proof_task: {
      type: 'first_proof_build',
      template_id: 'daily-intelligence-brief',
      template_name: 'Daily Intelligence Brief Agent',
      first_proof_target: 'One-page morning brief.',
    },
  },
  result: {
    type: 'first_proof_operator_brief',
    template_id: 'daily-intelligence-brief',
    retainer_payment_record: paidRecord,
  },
}

const queuedAction = {
  action_id: 'ACTION-FIRST-PROOF',
  lead_id: 'LEAD-FIRST-PROOF',
  action_type: 'lead_followup',
  status: 'queued',
  priority: 'high',
  owner: 'Revenue Pod',
  title: 'Build first proof for importer',
  next_step: 'Build source-traced first proof.',
  approval_required: true,
  approval_state: 'pending',
  notification_channel: 'console',
  notification_status: 'queued',
  payload: {
    first_proof_task: {
      type: 'first_proof_build',
      template_id: 'daily-intelligence-brief',
      template_name: 'Daily Intelligence Brief Agent',
      first_proof_target: 'Owner-ready morning brief.',
      checklist: ['Open sources'],
      acceptance_tests: ['Source trace included'],
    },
  },
  result: {
    type: 'first_proof_operator_brief',
    template_id: 'daily-intelligence-brief',
    title: 'Daily Intelligence Brief first proof',
    first_proof_target: 'Owner-ready morning brief.',
  },
}

const proofBoard = revenueProofBoard([paidAction, queuedAction])
const board = autopilotCommandBoard({
  actions: [paidAction, queuedAction],
  leads: [
    {
      lead_id: 'LEAD-NEW',
      task_id: 'TASK-NEW',
      submitted_at: '2026-07-01T02:05:00.000Z',
      requested_package: 'Inbox & Calendar Operator',
      lead_score: 88,
      lead_stage: 'new',
      status: 'routed',
      next_step: 'Ask for one approved inbox sample.',
    },
  ],
  proofBoard,
  latestRuns: [{ run_id: 'RUN-1' }],
})

assert.equal(board.status, 'ready')
assert.equal(board.board_type, 'autopilot_command_board')
assert.equal(board.mode, 'approval_gated_autopilot')
assert.ok(board.command_count >= 3)
assert.ok(board.critical_count >= 1)
assert.ok(board.internal_autorun_count >= 2)
assert.ok(board.owner_approval_count >= 2)
assert.equal(board.commands[0].lane, 'cash_reconciliation')
assert.equal(board.commands[0].priority, 'critical')
assert.equal(board.commands[0].external_action_state, 'internal_review')
assert.equal(board.commands[0].revenue_claim_state, 'proof_backed_not_bank_verified')
assert.ok(board.commands.some((command) => command.lane === 'first_proof_delivery'))
assert.ok(board.commands.some((command) => command.lane === 'new_lead_intake'))
assert.ok(board.command_queue_csv.includes('cash_reconciliation'))
assert.ok(board.command_queue_csv.includes('draft_only_until_owner_approval'))
assert.ok(board.operator_brief_markdown.includes('Autopilot daily money brief'))
assert.ok(board.operator_brief_markdown.includes('approval_gated_autopilot'))
assert.ok(board.guardrails.includes('money_actions_require_payment_or_bank_evidence'))

console.log(JSON.stringify({
  status: 'ok',
  commandCount: board.command_count,
  topLane: board.commands[0].lane,
  internalAutorunCount: board.internal_autorun_count,
}, null, 2))
