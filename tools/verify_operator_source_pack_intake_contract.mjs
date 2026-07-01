import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const handler = require('../api/pipeline-control.js')

function fail(reason, detail = {}) {
  console.error(JSON.stringify({ status: 'error', reason, ...detail }, null, 2))
  process.exit(1)
}

const root = process.cwd()
const generatorPath = resolve(root, 'tools/create_public_vercel_output.mjs')
const operatorPath = resolve(root, '.vercel/output/static/operator/index.html')
const intakePath = resolve(root, '.vercel/output/static/app/source-pack/index.html')

if (!existsSync(generatorPath)) fail('public_generator_missing')
if (!existsSync(operatorPath)) fail('operator_output_missing', { next: 'Run node tools/create_public_vercel_output.mjs first.' })
if (!existsSync(intakePath)) fail('source_pack_intake_output_missing', { next: 'Run node tools/create_public_vercel_output.mjs after adding /app/source-pack.' })

const internals = handler.__test || {}
if (typeof internals.buildActivationSourcePackRequest !== 'function') fail('source_pack_request_builder_missing')
if (typeof internals.buildActivationSessionLead !== 'function') fail('activation_session_lead_builder_missing')
if (typeof internals.buildActivationSessionActionPayload !== 'function') fail('activation_session_action_builder_missing')
if (typeof internals.firstProofPacket !== 'function') fail('first_proof_packet_builder_missing')

const lead = internals.buildActivationSessionLead({
  lead_id: 'LEAD-SOURCEPACKINTAKE',
  task_id: 'TASK-SOURCEPACKINTAKE',
  company: 'Yangon Owner Co',
  name: 'Daw May',
  email: 'owner@example.com',
  requested_package: 'Managed AI Workcell',
  buyer_goal: 'Turn Gmail and order exports into a daily owner action queue.',
  source_sample: 'Source pack will be uploaded by client.',
  first_proof_target: 'Daily owner action queue with unpaid order and reply priorities.',
})
const action = internals.buildActivationSessionActionPayload(lead)
const task = action.payload.first_proof_task
const request = task.source_pack_request

assert.equal(request.status, 'source_pack_request_ready')
assert.equal(request.request_type, 'client_source_pack_intake')
assert.equal(request.lead_id, 'LEAD-SOURCEPACKINTAKE')
assert.equal(request.action_id, 'TASK-SOURCEPACKINTAKE')
assert.ok(request.intake_url.includes('/app/source-pack?'))
assert.ok(request.intake_url.includes('lead=LEAD-SOURCEPACKINTAKE'))
assert.ok(request.intake_url.includes('action=TASK-SOURCEPACKINTAKE'))
assert.ok(request.client_message.includes('3 approved source samples'))
assert.deepEqual(
  request.minimum_sources.map((item) => item.source_type),
  ['gmail_or_chat', 'spreadsheet_or_pos_export', 'process_note_or_screenshot'],
)
assert.equal(request.external_action_state, 'blocked_until_owner_approval')
assert.equal(request.real_mrr_delta, 0)

const packet = internals.firstProofPacket(action)
assert.equal(packet.source_pack_request.status, 'source_pack_request_ready')
assert.ok(packet.source_pack_request.client_message.includes('3 approved source samples'))

const generator = readFileSync(generatorPath, 'utf8')
const operator = readFileSync(operatorPath, 'utf8')
const intake = readFileSync(intakePath, 'utf8')

const sourceTokens = [
  'buildActivationSourcePackRequest',
  'source_pack_request',
  'sourcePackRequest',
  '/app/source-pack',
  'Client source request',
]
for (const token of sourceTokens) {
  if (!generator.includes(token) && !readFileSync(resolve(root, 'api/pipeline-control.js'), 'utf8').includes(token)) {
    fail('source_pack_intake_source_token_missing', { token })
  }
}

const operatorTokens = [
  'Client source request',
  'Source-pack intake link',
  '3 approved source samples',
  'data-source-pack-request',
]
for (const token of operatorTokens) {
  if (!operator.includes(token)) fail('source_pack_intake_operator_token_missing', { token })
}

const intakeTokens = [
  'AI Workcell Source Pack Intake',
  'Source pack JSON',
  'Copy source pack',
  'No external access',
  'owner approval before send/write/payment/browser actions',
]
for (const token of intakeTokens) {
  if (!intake.includes(token)) fail('source_pack_intake_page_token_missing', { token })
}

console.log(
  JSON.stringify(
    {
      status: 'ready',
      audit: 'operator-source-pack-intake-contract',
      minimum_sources: request.minimum_sources.length,
      intake_url: request.intake_url,
      real_mrr_delta: request.real_mrr_delta,
    },
    null,
    2,
  ),
)
