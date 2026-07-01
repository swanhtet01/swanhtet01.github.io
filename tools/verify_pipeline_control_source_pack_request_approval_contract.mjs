import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const handler = require('../api/pipeline-control.js')

const {
  buildSourcePackRequestApprovalRecord,
  safeAction,
  sourcePackRequestFromPayload,
} = handler.__test

assert.equal(typeof buildSourcePackRequestApprovalRecord, 'function')
assert.equal(typeof sourcePackRequestFromPayload, 'function')

const request = {
  status: 'source_pack_request_ready',
  request_type: 'client_source_pack_intake',
  lead_id: 'LEAD-SOURCE-001',
  action_id: 'TASK-SOURCE-001',
  template_name: 'AI Workcell Pilot',
  company: 'Yangon Import Co',
  first_proof_target: 'One useful output from client source material',
  intake_url: 'https://supermega.dev/app/source-pack?lead=LEAD-SOURCE-001&action=TASK-SOURCE-001',
  client_message: 'Minimum source pack request body',
  external_action_state: 'blocked_until_owner_approval',
  payment_request_state: 'blocked_until_owner_approval',
  real_mrr_delta: 0,
  guardrails: ['draft_only_no_send', 'no_mrr_delta_without_payment_proof'],
}

const approval = buildSourcePackRequestApprovalRecord(
  {
    action_id: 'TASK-SOURCE-001',
    lead_id: 'LEAD-SOURCE-001',
    source_pack_request_decision: 'approved',
    source_pack_request_reference: 'OWNER-SOURCE-APPROVAL-001',
    operator_note: 'Approved to send source request manually.',
  },
  request,
)

assert.equal(approval.status, 'source_pack_request_approval_recorded')
assert.equal(approval.decision, 'approved')
assert.equal(approval.approval_reference, 'OWNER-SOURCE-APPROVAL-001')
assert.equal(approval.external_action_state, 'approved_for_manual_owner_send')
assert.equal(approval.payment_request_state, 'blocked_until_owner_approval')
assert.equal(approval.approved_to_request_sources, true)
assert.equal(approval.sent, false)
assert.equal(approval.real_mrr_delta, 0)
assert.ok(approval.guardrails.includes('runner_does_not_send'))
assert.ok(approval.guardrails.includes('no_mrr_delta_without_payment_proof'))

const action = safeAction({
  action_id: 'TASK-SOURCE-001',
  lead_id: 'LEAD-SOURCE-001',
  action_type: 'first_proof',
  status: 'open',
  priority: 'high',
  owner: 'Revenue Pod',
  title: 'AI Workcell Pilot first proof',
  approval_state: 'approved',
  notification_status: 'source_request_approved_manual_send_only',
  result: {
    type: 'first_proof_operator_brief',
    source_pack_request: request,
    source_pack_request_approval: approval,
  },
})

assert.equal(action.first_proof.source_pack_request.approval.decision, 'approved')
assert.equal(action.first_proof.source_pack_request.approval.sent, false)
assert.equal(action.first_proof.source_pack_request.approval.real_mrr_delta, 0)
assert.equal(action.first_proof.source_pack_request.approval.external_action_state, 'approved_for_manual_owner_send')

const fallbackRequest = sourcePackRequestFromPayload({
  action_id: 'TASK-FALLBACK-001',
  lead_id: 'LEAD-FALLBACK-001',
  source_pack_request_url: 'https://supermega.dev/app/source-pack?lead=LEAD-FALLBACK-001&action=TASK-FALLBACK-001',
  source_pack_request_packet: 'Fallback source request body',
  source_pack_request_template_name: 'AI Workcell Pilot',
  first_proof_target: 'Clean the owner inbox and produce a buyer-ready action list',
})

assert.equal(fallbackRequest.status, 'source_pack_request_ready')
assert.equal(fallbackRequest.request_type, 'client_source_pack_intake')
assert.equal(fallbackRequest.lead_id, 'LEAD-FALLBACK-001')
assert.equal(fallbackRequest.action_id, 'TASK-FALLBACK-001')
assert.equal(fallbackRequest.template_name, 'AI Workcell Pilot')
assert.equal(fallbackRequest.client_message, 'Fallback source request body')
assert.equal(fallbackRequest.external_action_state, 'blocked_until_owner_approval')
assert.equal(fallbackRequest.payment_request_state, 'blocked_until_owner_approval')
assert.equal(fallbackRequest.real_mrr_delta, 0)

const changeRequest = buildSourcePackRequestApprovalRecord(
  {
    decision: 'changes_requested',
    approval_reference: 'OWNER-SOURCE-CHANGES-001',
    operator_note: 'Ask for a shorter source request.',
  },
  request,
)
assert.equal(changeRequest.status, 'source_pack_request_approval_recorded')
assert.equal(changeRequest.decision, 'changes_requested')
assert.equal(changeRequest.external_action_state, 'blocked_until_changes_resolved')
assert.equal(changeRequest.approved_to_request_sources, false)

const missingReference = buildSourcePackRequestApprovalRecord({ decision: 'approved' }, request)
assert.equal(missingReference.status, 'error')
assert.equal(missingReference.reason, 'missing_source_pack_request_reference')

const badDecision = buildSourcePackRequestApprovalRecord({ decision: 'send_now', approval_reference: 'NOPE' }, request)
assert.equal(badDecision.status, 'error')
assert.equal(badDecision.reason, 'invalid_source_pack_request_decision')

console.log(JSON.stringify({
  status: 'ready',
  contract: 'pipeline_control_source_pack_request_approval',
  decision: approval.decision,
  external_action_state: approval.external_action_state,
  sent: approval.sent,
  real_mrr_delta: approval.real_mrr_delta,
}, null, 2))
