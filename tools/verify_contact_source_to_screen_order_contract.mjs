import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const handler = require('../api/contact-submissions.js')

const internals = handler.__test || {}
assert.equal(typeof internals.buildFirstProofTaskPayload, 'function')
assert.equal(typeof internals.pipelineActionPayload, 'function')
assert.equal(typeof internals.buildContactSourcePackRequest, 'function')

const orderPacket = [
  '# AI Workcell Pilot order packet',
  '',
  'workcell_template: Receivables chase',
  'workcell_id: receivables_chase',
  'source_hash: 00abc123',
  'free_load_policy: browser_only_until_contact',
  'real_mrr_delta: 0',
  '',
  'proof_target: Owner can see who owes money, what was promised, and the next safe follow-up draft.',
  '',
  'required_sources:',
  '- invoice or customer balance list',
  '- chat promise or payment note',
  '- owner follow-up rule',
].join('\n')

const record = {
  lead_id: 'LEAD-S2S-001',
  task_id: 'TASK-S2S-001',
  name: 'Owner',
  email: 'owner@example.com',
  company: 'Yangon Wholesale Co',
  requested_package: 'AI Workcell Pilot',
  public_package: 'AI Workcell Pilot',
  first_output: 'AI Workcell Pilot',
  product_area: 'AI agent workcell',
  goal: 'Use the free receivables draft to prepare a paid first proof.',
  source_links: '',
  source_to_screen_workcell_id: 'receivables_chase',
  source_to_screen_workcell_name: 'Receivables chase',
  source_to_screen_source_hash: '00abc123',
  source_to_screen_proof_target: 'Owner can see who owes money, what was promised, and the next safe follow-up draft.',
  source_to_screen_order_packet: orderPacket,
  source_to_screen_free_load_policy: 'browser_only_until_contact',
  data: 'Source-to-Screen handoff: Receivables chase | Source hash: 00abc123',
  lead_score: 80,
  lead_stage: 'hot',
}

const sourceRequest = internals.buildContactSourcePackRequest(record)
assert.equal(sourceRequest.status, 'source_pack_request_ready')
assert.ok(sourceRequest.source_to_screen_order, 'source_to_screen_order_missing')
assert.equal(sourceRequest.source_to_screen_order.status, 'source_to_screen_order_attached')
assert.equal(sourceRequest.source_to_screen_order.workcell_id, 'receivables_chase')
assert.equal(sourceRequest.source_to_screen_order.workcell_name, 'Receivables chase')
assert.equal(sourceRequest.source_to_screen_order.source_hash, '00abc123')
assert.equal(sourceRequest.source_to_screen_order.proof_target, record.source_to_screen_proof_target)
assert.equal(sourceRequest.source_to_screen_order.free_load_policy, 'browser_only_until_contact')
assert.equal(sourceRequest.source_to_screen_order.order_packet, orderPacket)
assert.deepEqual(sourceRequest.source_to_screen_order.cost_boundary, {
  plan: 'free',
  execution_mode: 'browser_only_until_contact',
  server_run_allowed: false,
  llm_calls_allowed: false,
  model_tier_allowed: 'none',
  customer_pii_to_model: false,
  tenant_training_allowed: false,
  external_action_allowed: false,
  paid_upgrade_trigger: 'owner_approves_first_proof_pilot',
  approval_gate: 'owner_approval_required_before_send_write_payment',
})
assert.deepEqual(sourceRequest.source_to_screen_order.execution_route, {
  crew_slug: 'source-to-screen-pilot',
  crew_name: 'Source-to-Screen Pilot',
  minimum_plan: 'pilot',
  route_status: 'paid_pilot_required',
  free_fallback: 'browser-only draft and order packet',
  paid_pilot_scope: 'Turn the approved Source-to-Screen packet into a source-traced first proof with an owner approval queue.',
  first_run_mode: 'approval_only',
})
assert.equal(sourceRequest.first_proof_target, record.source_to_screen_proof_target)
assert.ok(sourceRequest.client_message.includes('Source-to-Screen workcell: Receivables chase'))
assert.ok(sourceRequest.client_message.includes('Source hash: 00abc123'))
assert.ok(sourceRequest.client_message.includes('Minimum source pack'))
assert.ok(sourceRequest.minimum_sources.some((source) => source.source_type === 'source_to_screen_order_packet'))
assert.equal(sourceRequest.real_mrr_delta, 0)

const proofTask = internals.buildFirstProofTaskPayload(record)
assert.equal(proofTask.first_proof_target, record.source_to_screen_proof_target)
assert.ok(proofTask.source_to_screen_order, 'proof_task_source_to_screen_order_missing')
assert.equal(proofTask.source_to_screen_order.workcell_id, 'receivables_chase')
assert.equal(proofTask.source_pack_request.source_to_screen_order.order_packet, orderPacket)
assert.ok(proofTask.operator_brief.includes('Source-to-Screen: Receivables chase'))
assert.ok(proofTask.operator_brief.includes('Source hash: 00abc123'))
assert.ok(proofTask.source_trace.some((item) => item.includes('source_to_screen_order_packet')))

const action = internals.pipelineActionPayload(record)
assert.ok(action.payload.source_to_screen_order, 'pipeline_source_to_screen_order_missing')
assert.equal(action.payload.source_to_screen_order.workcell_id, 'receivables_chase')
assert.equal(action.payload.source_to_screen_order.order_packet, orderPacket)
assert.equal(action.payload.source_to_screen_order.cost_boundary.llm_calls_allowed, false)
assert.equal(action.payload.source_to_screen_order.cost_boundary.server_run_allowed, false)
assert.equal(action.payload.source_to_screen_order.execution_route.crew_slug, 'source-to-screen-pilot')
assert.equal(action.payload.source_pack_request.source_to_screen_order.source_hash, '00abc123')
assert.equal(action.payload.first_proof_task.source_to_screen_order.proof_target, record.source_to_screen_proof_target)
assert.equal(action.payload.first_proof_task.source_to_screen_order.cost_boundary.paid_upgrade_trigger, 'owner_approves_first_proof_pilot')
assert.equal(action.payload.first_proof_task.source_to_screen_order.execution_route.first_run_mode, 'approval_only')
assert.equal(action.payload.first_proof_task.real_mrr_delta, 0)

console.log(JSON.stringify({
  status: 'ready',
  contract: 'contact_source_to_screen_order',
  workcell_id: sourceRequest.source_to_screen_order.workcell_id,
  source_hash: sourceRequest.source_to_screen_order.source_hash,
  real_mrr_delta: action.payload.first_proof_task.real_mrr_delta,
}, null, 2))
