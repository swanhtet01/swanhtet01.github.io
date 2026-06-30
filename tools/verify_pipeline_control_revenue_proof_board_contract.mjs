import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const handler = require('../api/pipeline-control.js')

const { buildRetainerPaymentRecord, revenueProofBoard } = handler.__test

const paidRecord = buildRetainerPaymentRecord({
  retainerGrowthOffer: {
    workspace_slug: 'pilot-daily-intelligence-brief-acme',
    lead_id: 'LEAD-PAID',
    template_name: 'Daily Intelligence Brief Agent',
  },
  paymentProofReference: 'KBZ-PROOF-001',
  ownerApprovalReference: 'OWNER-APPROVAL-001',
  amountMmk: 3600000,
  paymentPeriod: 'quarterly',
  preparedAt: '2026-07-01T01:00:00.000Z',
})

const board = revenueProofBoard([
  {
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
  },
  {
    action_id: 'ACTION-OFFER',
    lead_id: 'LEAD-OFFER',
    action_type: 'lead_followup',
    status: 'retainer_growth_offer_ready',
    priority: 'high',
    owner: 'Revenue Pod',
    title: 'Retainer offer waiting payment proof',
    next_step: 'Collect proof after owner-approved quote.',
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
      retainer_growth_offer: {
        status: 'retainer_growth_offer_ready',
        workspace_slug: 'pilot-daily-intelligence-brief-offer',
        lead_id: 'LEAD-OFFER',
        template_name: 'Daily Intelligence Brief Agent',
        recurring_revenue_state: 'not_claimed',
        real_mrr_delta: 0,
      },
    },
  },
])

assert.equal(board.status, 'ready')
assert.equal(board.board_type, 'revenue_proof_board')
assert.equal(board.action_count, 2)
assert.equal(board.payment_record_count, 1)
assert.equal(board.proof_backed_mrr_mmk, 1200000)
assert.equal(board.bank_verified_mrr_mmk, 0)
assert.equal(board.bank_unverified_mrr_mmk, 1200000)
assert.equal(board.stage_counts.retainer_payment_proof_recorded, 1)
assert.equal(board.stage_counts.retainer_growth_offer_ready, 1)
assert.equal(board.payment_records.length, 1)
assert.equal(board.payment_records[0].payment_proof_reference, 'KBZ-PROOF-001')
assert.equal(board.payment_records[0].bank_reconciliation_state, 'not_bank_verified')
assert.equal(board.next_cash_actions.length, 1)
assert.equal(board.next_cash_actions[0].next_action, 'collect_retainer_payment_proof')
assert.equal(board.next_cash_actions[0].revenue_claim_state, 'mrr_still_zero_until_payment_proof')
assert.ok(board.payment_ledger_csv.includes('KBZ-PROOF-001'))
assert.ok(board.payment_ledger_csv.includes('"1200000"'))
assert.ok(board.next_cash_actions_csv.includes('collect_retainer_payment_proof'))
assert.ok(board.guardrails.includes('drafts_and_offers_do_not_count_as_mrr'))

console.log(JSON.stringify({
  status: 'ok',
  proofBackedMrrMmk: board.proof_backed_mrr_mmk,
  bankUnverifiedMrrMmk: board.bank_unverified_mrr_mmk,
  nextCashActions: board.next_cash_actions.length,
}, null, 2))
