import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const handler = require('../api/contact-submissions.js')

function fail(message, extra = {}) {
  console.error(JSON.stringify({ status: 'error', message, ...extra }, null, 2))
  process.exit(1)
}

const internals = handler.__test || {}
if (typeof internals.buildFirstProofTaskPayload !== 'function' || typeof internals.pipelineActionPayload !== 'function') {
  fail('contact_submission_test_exports_missing')
}

const record = {
  lead_id: 'LEAD-TEST123',
  task_id: 'TASK-TEST123',
  name: 'Swan',
  email: 'owner@example.com',
  phone: '+9595000721',
  company: 'Yangon Import Co',
  goal: 'I need a morning brief that watches suppliers, inbox labels, and shipping updates.',
  data: 'Template intake: daily-intelligence-brief | Starter kit: /site/agent-templates/daily-intelligence-brief.json | First proof: One-page morning brief with what changed, why it matters, and exact follow-up actions.',
  requested_package: 'Daily Intelligence Brief Agent',
  public_package: 'Daily Intelligence Brief Agent',
  first_output: 'Daily Intelligence Brief Agent',
  product_area: 'Custom Solutions & AI Agents',
  template_id: 'daily-intelligence-brief',
  template_status: 'build-ready',
  template_source_category: 'import export company',
  template_source_area: 'Yangon, Myanmar',
  starter_kit_url: '/site/agent-templates/daily-intelligence-brief.json',
  price_hint: '11,000,000 MMK setup',
  first_proof_target: 'One-page morning brief with what changed, why it matters, and exact follow-up actions.',
  acceptance_tests: '',
  launch_blockers: '',
  automation_boundary: 'Approval required before workspace access, external sends, connector writes, or payment actions.',
  access_policy: 'approval_required',
  workspace_status: 'not_created_until_approved',
  source_links: 'https://drive.example/sample-folder',
  source_file_count: '2',
  lead_score: 85,
  lead_stage: 'hot',
  owner: 'Revenue Pod',
  next_step: 'Reply with one proof request.',
}

const proofTask = internals.buildFirstProofTaskPayload(record)
assert.equal(proofTask.type, 'first_proof_build')
assert.equal(proofTask.template_id, 'daily-intelligence-brief')
assert.equal(proofTask.starter_kit_url, '/site/agent-templates/daily-intelligence-brief.json')
assert.equal(proofTask.first_proof_target, record.first_proof_target)
assert.equal(proofTask.approval_required, true)
assert.equal(proofTask.human_gate, 'owner approval before send/write/payment actions')
assert.ok(proofTask.operator_brief.includes('Daily Intelligence Brief Agent'))
assert.ok(proofTask.operator_brief.includes('Yangon Import Co'))
assert.ok(proofTask.operator_brief.includes('One-page morning brief'))
assert.ok(Array.isArray(proofTask.checklist))
assert.ok(proofTask.checklist.length >= 5)
assert.ok(proofTask.checklist.some((item) => item.toLowerCase().includes('starter kit')))
assert.ok(Array.isArray(proofTask.acceptance_tests))
assert.ok(proofTask.acceptance_tests.length >= 4)
assert.ok(proofTask.acceptance_tests.some((item) => item.includes('source trace')))

const action = internals.pipelineActionPayload(record)
assert.equal(action.action_type, 'lead_followup')
assert.equal(action.payload.first_proof_task.type, 'first_proof_build')
assert.equal(action.payload.first_proof_task.template_id, 'daily-intelligence-brief')
assert.equal(action.payload.first_proof_task.operator_brief, proofTask.operator_brief)
assert.deepEqual(action.payload.first_proof_task.acceptance_tests, proofTask.acceptance_tests)

console.log(
  JSON.stringify(
    {
      status: 'ready',
      proof_task: proofTask.type,
      template_id: proofTask.template_id,
      checklist_items: proofTask.checklist.length,
      acceptance_tests: proofTask.acceptance_tests.length,
    },
    null,
    2,
  ),
)
