import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const handler = require('../api/pipeline-control.js')

function fail(message, extra = {}) {
  console.error(JSON.stringify({ status: 'error', message, ...extra }, null, 2))
  process.exit(1)
}

const internals = handler.__test || {}
if (typeof internals.firstProofPacket !== 'function') fail('first_proof_packet_missing')
if (typeof internals.buildPrivateWorkspaceManifest !== 'function') fail('private_workspace_manifest_builder_missing')

const row = {
  action_id: 'TASK-DELIVERYROOM123',
  lead_id: 'LEAD-DELIVERYROOM123',
  task_id: 'TASK-DELIVERYROOM123',
  action_type: 'activation_session_first_proof',
  status: 'workspace_ready',
  priority: 'high',
  owner: 'Delivery Pod',
  title: 'Start Owner Ops Agent pilot for Yangon Retail Co',
  next_step: 'Open the private workspace handoff and run the first production job approval-only.',
  approval_required: true,
  approval_state: 'approved',
  notification_channel: 'operator_console',
  notification_status: 'workspace_ready',
  created_at: '2026-07-01T00:00:00.000Z',
  payload: {
    lead: {
      lead_id: 'LEAD-DELIVERYROOM123',
      task_id: 'TASK-DELIVERYROOM123',
      company: 'Yangon Retail Co',
      requested_package: 'Owner Ops Agent',
      public_package: 'Owner Ops Agent',
      first_proof_target: 'Daily owner action queue from approved messages and files.',
      price_hint: '11,000,000 MMK',
    },
    first_proof_task: {
      type: 'first_proof_build',
      template_id: 'owner-ops-agent',
      template_name: 'Owner Ops Agent',
      first_proof_target: 'Daily owner action queue from approved messages and files.',
      price_hint: '11,000,000 MMK',
      acceptance_tests: ['Owner can see the daily action queue.', 'Every important claim has a source trace.'],
      approval_required: true,
    },
  },
  result: {
    status: 'ready',
    type: 'first_proof_operator_brief',
    template_id: 'owner-ops-agent',
    template_name: 'Owner Ops Agent',
    first_proof_target: 'Daily owner action queue from approved messages and files.',
    client_kickoff_pack: {
      status: 'client_kickoff_ready',
      packet: [
        '# Client kickoff packet',
        '',
        'Goal: turn approved owner messages and files into a daily action queue.',
        'Access needed: approved screenshots, exports, folders, or email threads only.',
        'First live run: approval-only until owner acceptance.',
      ].join('\n'),
    },
    activation_first_proof: {
      status: 'activation_first_proof_ready',
      action_id: 'TASK-DELIVERYROOM123',
      lead_id: 'LEAD-DELIVERYROOM123',
      proof_delivery_packet: [
        '# First proof delivery packet',
        '',
        'Result: owner action queue draft.',
        'Source trace: approved inbox screenshot and file export.',
      ].join('\n'),
      real_mrr_delta: 0,
    },
    pilot_order_room_state: {
      status: 'persisted_order_room_state',
      action_id: 'TASK-DELIVERYROOM123',
      lead_id: 'LEAD-DELIVERYROOM123',
      scope_approval_state: 'approved',
      price_approval_state: 'approved',
      payment_route_state: 'approved',
      payment_request_state: 'sent',
      payment_proof_state: 'proof_attached',
      private_workspace_state: 'created_after_payment_proof',
      private_workspace_slug: 'pilot-owner-ops-agent-deliveryroom',
      private_workspace_url: 'https://supermega.dev/app/start?workspace=pilot-owner-ops-agent-deliveryroom&lead=LEAD-DELIVERYROOM123',
      workspace_created_at: '2026-07-01T02:00:00.000Z',
      workspace_created_by: 'operator_console',
      payment_proof_reference: 'KBZ receipt 2026-07-01',
      real_mrr_delta: 0,
    },
  },
}

const firstProof = internals.firstProofPacket(row)
assert.equal(firstProof.status, 'operator_brief_ready')
const room = firstProof.pilot_order_room
const manifest = room.private_workspace_manifest

assert.equal(manifest.status, 'private_workspace_created')
assert.equal(manifest.delivery_room_status, 'workspace_delivery_room_ready')
assert.equal(manifest.workspace_delivery_gate, 'approval_only_until_owner_acceptance')
assert.equal(manifest.next_operator_action, 'record_first_production_run')
assert.equal(manifest.real_mrr_delta, 0)
assert.match(manifest.client_kickoff_packet, /Client kickoff packet/)
assert.match(manifest.proof_delivery_packet, /First proof delivery packet/)
assert.match(manifest.first_run_queue_csv, /build_first_production_run/)
assert.ok(Array.isArray(manifest.first_run_checklist))
assert.ok(manifest.first_run_checklist.includes('First production run remains approval-only until owner acceptance.'))

assert.match(room.private_workspace_handoff_packet, /Client kickoff packet/)
assert.match(room.private_workspace_handoff_packet, /workspace_delivery_room_ready/)
assert.match(room.private_workspace_handoff_packet, /approval_only_until_owner_acceptance/)
assert.match(room.first_run_queue_csv, /owner_acceptance_review/)

const pilotWorkspaceHtmlPath = resolve('.vercel/output/static/app/start/index.html')
if (!existsSync(pilotWorkspaceHtmlPath)) fail('generated_pilot_workspace_page_missing')
const pilotWorkspaceHtml = readFileSync(pilotWorkspaceHtmlPath, 'utf8')
for (const token of [
  'Client kickoff packet',
  'First production run queue',
  'Copy kickoff packet',
  'Copy first run queue',
  'workspace_delivery_room_ready',
  'approval_only_until_owner_acceptance',
]) {
  if (!pilotWorkspaceHtml.includes(token)) fail('delivery_room_page_contract_missing', { token })
}

console.log(
  JSON.stringify(
    {
      status: 'ok',
      checked: 'private_workspace_delivery_room_contract',
      workspace_status: manifest.status,
      delivery_room_status: manifest.delivery_room_status,
      real_mrr_delta: manifest.real_mrr_delta,
    },
    null,
    2,
  ),
)
