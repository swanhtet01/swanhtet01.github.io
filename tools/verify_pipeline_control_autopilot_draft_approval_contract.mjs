import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const handler = require('../api/pipeline-control.js')

const {
  autopilotApprovalLedgerStatus,
  autopilotDraftFromPayload,
  buildAutopilotApprovalLedgerRecord,
  buildAutopilotDraftApprovalRecord,
  safeAction,
  writeAutopilotApprovalLedger,
} = handler.__test

const draft = {
  status: 'ready',
  type: 'buyer_reply_draft',
  lead_id: 'LEAD-APPROVAL-001',
  package_name: 'Daily Intelligence Brief Agent',
  title: 'Buyer reply draft',
  body: 'Draft reply body',
  external_action_state: 'blocked_until_owner_approval',
  payment_or_connector_state: 'blocked_until_owner_approval',
  real_mrr_delta: 0,
  approval_required: true,
  sent: false,
  guardrails: ['internal_draft_only', 'no_external_send_from_runner'],
}

const approval = buildAutopilotDraftApprovalRecord(
  {
    action_id: 'AUTO-APPROVAL-001',
    lead_id: 'LEAD-APPROVAL-001',
    autopilot_draft_decision: 'approved',
    autopilot_draft_reference: 'OWNER-APPROVAL-REF-001',
    operator_note: 'Approved for manual owner send after review.',
  },
  draft,
)

assert.equal(approval.status, 'autopilot_draft_approval_recorded')
assert.equal(approval.decision, 'approved')
assert.equal(approval.approval_reference, 'OWNER-APPROVAL-REF-001')
assert.equal(approval.external_action_state, 'approved_for_manual_owner_send')
assert.equal(approval.payment_or_connector_state, 'blocked_until_owner_approval')
assert.equal(approval.sent, false)
assert.equal(approval.real_mrr_delta, 0)
assert.ok(approval.guardrails.includes('runner_does_not_send'))
assert.ok(approval.guardrails.includes('no_mrr_delta_without_payment_proof'))

const action = safeAction({
  action_id: 'AUTO-APPROVAL-001',
  lead_id: 'LEAD-APPROVAL-001',
  action_type: 'reply_draft',
  status: 'done',
  priority: 'high',
  owner: 'Revenue Pod',
  title: 'Autopilot draft: buyer reply',
  approval_state: 'approved',
  result: {
    ...draft,
    autopilot_draft_approval: approval,
  },
})

assert.equal(action.autopilot_draft.approval.decision, 'approved')
assert.equal(action.autopilot_draft.approval.sent, false)
assert.equal(action.autopilot_draft.approval.real_mrr_delta, 0)
assert.equal(action.autopilot_draft.approval.external_action_state, 'approved_for_manual_owner_send')

const fallbackDraft = autopilotDraftFromPayload({
  lead_id: 'LEAD-FALLBACK-001',
  autopilot_draft_type: 'offer_packet',
  package_name: 'SME Revenue Operator',
  title: 'Offer packet draft',
  autopilot_draft_packet: 'Fallback approval packet body',
})
assert.equal(fallbackDraft.type, 'offer_packet')
assert.equal(fallbackDraft.lead_id, 'LEAD-FALLBACK-001')
assert.equal(fallbackDraft.packet, 'Fallback approval packet body')
assert.equal(fallbackDraft.external_action_state, 'blocked_until_owner_approval')
assert.equal(fallbackDraft.payment_or_connector_state, 'blocked_until_owner_approval')
assert.equal(fallbackDraft.sent, false)
assert.equal(fallbackDraft.real_mrr_delta, 0)

const ledgerRecord = buildAutopilotApprovalLedgerRecord({
  approval,
  draft,
  blocker: { status: 'error', provider: 'vercel_postgres_neon', adapter: 'pg', reason: 'vercel_postgres_query_failed', detail: 'quota exceeded' },
  fallbackDelivery: { status: 'ready', adapter: 'email_fallback' },
})
assert.equal(ledgerRecord.status, 'autopilot_approval_ledger_recorded')
assert.equal(ledgerRecord.ledger_type, 'owner_approval_fallback')
assert.equal(ledgerRecord.decision, 'approved')
assert.equal(ledgerRecord.sent, false)
assert.equal(ledgerRecord.real_mrr_delta, 0)
assert.equal(ledgerRecord.primary_database.reason, 'vercel_postgres_query_failed')
assert.equal(ledgerRecord.notification.adapter, 'email_fallback')
assert.ok(ledgerRecord.guardrails.includes('private_internal_ledger'))
assert.ok(ledgerRecord.guardrails.includes('no_mrr_delta_without_payment_proof'))

const ledgerStatus = autopilotApprovalLedgerStatus()
assert.equal(ledgerStatus.adapter, 'vercel_blob')
assert.equal(ledgerStatus.access, 'private')

const missingBlobWrite = await writeAutopilotApprovalLedger({
  approval,
  draft,
  blocker: { status: 'error', reason: 'postgres_not_configured' },
  fallbackDelivery: { status: 'error', reason: 'resend_not_configured' },
}, { blobSdk: null })
assert.equal(missingBlobWrite.status, 'skipped')
assert.equal(missingBlobWrite.adapter, 'vercel_blob')

const missingReference = buildAutopilotDraftApprovalRecord({ decision: 'approved' }, draft)
assert.equal(missingReference.status, 'error')
assert.equal(missingReference.reason, 'missing_autopilot_draft_reference')

const badDecision = buildAutopilotDraftApprovalRecord({ decision: 'send_now', approval_reference: 'NOPE' }, draft)
assert.equal(badDecision.status, 'error')
assert.equal(badDecision.reason, 'invalid_autopilot_draft_decision')

console.log(JSON.stringify({
  status: 'ready',
  contract: 'pipeline_control_autopilot_draft_approval',
  decision: approval.decision,
  external_action_state: approval.external_action_state,
  sent: approval.sent,
  real_mrr_delta: approval.real_mrr_delta,
}, null, 2))
