import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const handler = require('../api/action-runner.js')

function fail(message, extra = {}) {
  console.error(JSON.stringify({ status: 'error', message, ...extra }, null, 2))
  process.exit(1)
}

const internals = handler.__test || {}
for (const name of ['renderSalesAutopilotDraft', 'renderSourceRequestPacket', 'renderOfferPacket', 'renderBuyerReplyDraft']) {
  if (typeof internals[name] !== 'function') {
    fail('action_runner_sales_autopilot_helper_missing', { name })
  }
}

const lead = {
  lead_id: 'LEAD-SALES-001',
  name: 'Daw May',
  email: 'owner@example.com',
  company: 'Yangon Import Co',
  workflow: 'Manager follows shipment updates in chat, sheets, and email.',
  requested_package: 'Daily Intelligence Brief Agent',
  lead_score: 91,
}

const basePayload = {
  lead,
  offer: {
    package: 'Daily Intelligence Brief Agent',
    first_output: 'One owner-ready morning brief with source trace and exact follow-up actions.',
    price_band: 'Scope first; build starts only after source, access, and approval boundary are confirmed.',
    source_request: 'Ask for one supplier email thread, shipment sheet, or Viber update sample.',
  },
  policy: 'draft_only_no_external_send_no_payment_no_connector_without_owner_approval',
  prepared_by: 'sales_daily_autopilot',
}

function row(actionType) {
  return {
    id: `ROW-${actionType}`,
    action_id: `AUTO-LEAD-SALES-001-${actionType}`,
    lead_id: lead.lead_id,
    action_type: actionType,
    status: 'queued',
    priority: 'high',
    owner: 'Revenue Pod',
    title: `Prepare ${actionType}`,
    next_step: basePayload.offer.source_request,
    approval_required: true,
    approval_state: 'pending',
    notification_channel: 'internal_queue',
    notification_status: 'queued',
    payload: basePayload,
  }
}

const sourcePacket = internals.renderSalesAutopilotDraft(row('source_request'))
assert.equal(sourcePacket.status, 'ready')
assert.equal(sourcePacket.type, 'source_request_packet')
assert.equal(sourcePacket.sent, false)
assert.equal(sourcePacket.external_action_state, 'blocked_until_owner_approval')
assert.equal(sourcePacket.payment_or_connector_state, 'blocked_until_owner_approval')
assert.ok(sourcePacket.packet.includes('Source sample to request'))
assert.ok(sourcePacket.packet.includes('supplier email thread'))
assert.ok(sourcePacket.packet.includes('No external send from the runner'))
assert.ok(sourcePacket.guardrails.includes('owner_approval_before_buyer_message'))

const offerPacket = internals.renderSalesAutopilotDraft(row('offer_packet'))
assert.equal(offerPacket.status, 'ready')
assert.equal(offerPacket.type, 'offer_packet')
assert.equal(offerPacket.real_mrr_delta, 0)
assert.equal(offerPacket.sent, false)
assert.ok(offerPacket.packet.includes('First useful output'))
assert.ok(offerPacket.packet.includes('Owner approval checklist'))
assert.ok(offerPacket.packet.includes('Revenue remains 0 until payment proof exists'))
assert.ok(offerPacket.guardrails.includes('no_revenue_claim_without_payment_proof'))

const replyDraft = internals.renderSalesAutopilotDraft(row('reply_draft'))
assert.equal(replyDraft.status, 'ready')
assert.equal(replyDraft.type, 'buyer_reply_draft')
assert.equal(replyDraft.to, lead.email)
assert.equal(replyDraft.sent, false)
assert.equal(replyDraft.external_action_state, 'draft_only_until_owner_approval')
assert.ok(replyDraft.body.includes('I can start with a Daily Intelligence Brief Agent first proof'))
assert.ok(replyDraft.body.includes('will not connect accounts'))
assert.ok(replyDraft.guardrails.includes('draft_only_no_send'))

console.log(JSON.stringify({
  status: 'ready',
  contract: 'action_runner_sales_autopilot',
  renders: [sourcePacket.type, offerPacket.type, replyDraft.type],
  external_send: 'blocked_until_owner_approval',
  real_mrr_delta: offerPacket.real_mrr_delta,
}, null, 2))
