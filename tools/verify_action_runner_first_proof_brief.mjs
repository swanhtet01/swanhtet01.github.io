import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const handler = require('../api/action-runner.js')

function fail(message, extra = {}) {
  console.error(JSON.stringify({ status: 'error', message, ...extra }, null, 2))
  process.exit(1)
}

const internals = handler.__test || {}
if (typeof internals.renderFirstProofBrief !== 'function') {
  fail('action_runner_first_proof_renderer_missing')
}

const row = {
  action_id: 'TASK-TEST123',
  lead_id: 'LEAD-TEST123',
  action_type: 'lead_followup',
  payload: {
    first_proof_task: {
      type: 'first_proof_build',
      template_id: 'daily-intelligence-brief',
      template_name: 'Daily Intelligence Brief Agent',
      starter_kit_url: '/site/agent-templates/daily-intelligence-brief.json',
      first_proof_target: 'One-page morning brief with what changed, why it matters, and exact follow-up actions.',
      operator_brief: 'Daily Intelligence Brief Agent first proof for Yangon Import Co.\nGoal: Watch suppliers and shipping updates.\nFirst proof: One-page morning brief.',
      checklist: [
        'Open starter kit: /site/agent-templates/daily-intelligence-brief.json',
        'Review buyer goal, company context, source links, and attached file manifest.',
        'Build the first proof: One-page morning brief.',
      ],
      acceptance_tests: [
        'Produces: One-page morning brief with what changed, why it matters, and exact follow-up actions.',
        'Shows source trace for every important number, record, or recommendation.',
        'Keeps every external action in approval-only mode until the owner signs off.',
        'Uses only approved sample sources on the first run.',
      ],
      approval_required: true,
      human_gate: 'owner approval before send/write/payment actions',
    },
  },
}

const lead = {
  lead_id: 'LEAD-TEST123',
  name: 'Swan',
  email: 'owner@example.com',
  company: 'Yangon Import Co',
  goal: 'Watch suppliers and shipping updates.',
}

const brief = internals.renderFirstProofBrief(row, lead)
assert.equal(brief.status, 'ready')
assert.equal(brief.type, 'first_proof_operator_brief')
assert.equal(brief.template_id, 'daily-intelligence-brief')
assert.equal(brief.approval_required, true)
assert.equal(brief.human_gate, 'owner approval before send/write/payment actions')
assert.ok(brief.title.includes('Daily Intelligence Brief Agent'))
assert.ok(brief.title.includes('Yangon Import Co'))
assert.ok(brief.body.includes('Operator brief'))
assert.ok(brief.body.includes('Starter kit'))
assert.ok(brief.body.includes('/site/agent-templates/daily-intelligence-brief.json'))
assert.ok(brief.body.includes('Acceptance tests'))
assert.ok(brief.body.includes('Source trace'))
assert.ok(brief.body.includes('Do not send, write, charge, or edit live business records'))
assert.ok(Array.isArray(brief.checklist))
assert.ok(brief.checklist.length >= 3)
assert.ok(Array.isArray(brief.acceptance_tests))
assert.ok(brief.acceptance_tests.length >= 4)

console.log(
  JSON.stringify(
    {
      status: 'ready',
      type: brief.type,
      template_id: brief.template_id,
      checklist_items: brief.checklist.length,
      acceptance_tests: brief.acceptance_tests.length,
    },
    null,
    2,
  ),
)
