import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const handler = require('../api/contact-submissions.js')
const {
  contactEntryIntent,
  buildLeadRecord,
  buildSolutionRoute,
  buildFirstProofTaskPayload,
} = handler.__test

for (const fn of [contactEntryIntent, buildLeadRecord, buildSolutionRoute, buildFirstProofTaskPayload]) {
  assert.equal(typeof fn, 'function')
}

const contact = await readFile(resolve('.vercel/output/static/contact/index.html'), 'utf8')
for (const required of [
  'data-contact-heading',
  'data-contact-goal-label',
  "entryIntent==='ai-agent-solution'",
  'What do you want to improve?',
  'Start here',
  'What should work better?',
  "idleSubmitLabel='Contact us'",
  'one reviewed example',
  "entryIntent==='shop-workspace'?'Shop':entryIntent==='plant-workspace'?'Plant':''",
  "text('[data-contact-heading]','Request a private '+workspaceProduct+' workspace.')",
  "text('[data-contact-goal-label]','What should be ready first?')",
  "idleSubmitLabel='Request workspace'",
]) {
  assert.ok(contact.includes(required), `missing agent intake copy: ${required}`)
}

for (const forbidden of [
  'name="workflow"',
  'name="requested_package"',
  'name="product_area"',
  'name="template_id"',
  'name="source_links"',
  '/site/agent-templates/',
]) {
  assert.equal(contact.includes(forbidden), false, `retired intake field or path returned: ${forbidden}`)
}

assert.match(contact, /name="name" required/)
assert.match(contact, /name="email" required type="email"/)
assert.match(contact, /name="company" required/)
assert.match(contact, /<textarea name="goal" required><\/textarea>/)
assert.doesNotMatch(contact, /name="(?:name|email|company)"[^>]*\svalue=/)

for (const source of [...contact.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1])) {
  new Function(source)
}

assert.equal(contactEntryIntent({ page_path: '/contact/?from=ai-agent-solution' }), 'ai-agent-solution')
assert.equal(contactEntryIntent({ source_url: 'https://www.supermega.dev/contact/?from=ai-agent-solution' }), 'ai-agent-solution')
assert.equal(contactEntryIntent({ page_path: '/contact/?from=shop-workspace' }), 'shop-workspace')
assert.equal(contactEntryIntent({ source_url: 'https://www.supermega.dev/contact/?from=plant-workspace' }), 'plant-workspace')
assert.equal(contactEntryIntent({ page_path: '/contact/?from=shop' }), '')
assert.equal(contactEntryIntent({ source_url: 'https://example.com/contact/?from=ai-agent-solution' }), '')
assert.equal(contactEntryIntent({ source_url: 'https://example.com/contact/?from=shop-workspace' }), '')

function lead(payload = {}) {
  return buildLeadRecord({
    leadId: 'LEAD-AGENT-INTAKE',
    taskId: 'TASK-AGENT-INTAKE',
    payload: {
      name: 'Test Buyer',
      email: 'buyer@example.com',
      company: 'Example Company',
      goal: 'Our team repeats the same task every week.',
      ...payload,
    },
    req: { headers: {}, socket: { remoteAddress: '127.0.0.1' } },
  })
}

const vagueAgentLead = lead({ page_path: '/contact/?from=ai-agent-solution' })
assert.equal(vagueAgentLead.workflow, 'AI Agent Solutions discovery')
assert.equal(vagueAgentLead.requested_package, 'AI Agent Solutions')
assert.equal(vagueAgentLead.product_area, 'Custom Solutions & AI Agents')
assert.match(vagueAgentLead.first_proof_target, /one redacted approved sample/i)

const vagueAgentRoute = buildSolutionRoute(vagueAgentLead)
assert.equal(vagueAgentRoute.template_id, 'agent-solution-discovery')
assert.equal(vagueAgentRoute.delivery_lane, 'agent_solution_discovery')
assert.equal(vagueAgentRoute.status, 'needs_operator_review')
assert.equal(vagueAgentRoute.starter_kit_url, '')
assert.deepEqual(vagueAgentRoute.matched_keywords, [])

const shopWorkspaceLead = lead({ page_path: '/contact/?from=shop-workspace' })
assert.equal(shopWorkspaceLead.workflow, 'Shop private workspace request')
assert.equal(shopWorkspaceLead.requested_package, 'Shop private workspace')
assert.equal(shopWorkspaceLead.public_package, 'Shop private workspace')
assert.equal(shopWorkspaceLead.product_area, 'Shop')
assert.equal(shopWorkspaceLead.template_id, 'deskpos-quickstart')
assert.equal(shopWorkspaceLead.onboarding_stage, 'workspace_request')
assert.equal(shopWorkspaceLead.access_policy, 'approval_required')
assert.equal(shopWorkspaceLead.workspace_status, 'not_created_until_approved')
assert.equal(shopWorkspaceLead.lead_stage, 'qualified')
assert.match(shopWorkspaceLead.first_proof_target, /buyer-approved starting data/i)
const shopWorkspaceRoute = buildSolutionRoute(shopWorkspaceLead)
assert.equal(shopWorkspaceRoute.template_id, 'deskpos-quickstart')
assert.equal(shopWorkspaceRoute.delivery_lane, 'pos_launch_workcell')
assert.equal(shopWorkspaceRoute.status, 'route_ready')

const plantWorkspaceLead = lead({ source_url: 'https://supermega.dev/contact/?from=plant-workspace' })
assert.equal(plantWorkspaceLead.workflow, 'Plant private workspace request')
assert.equal(plantWorkspaceLead.requested_package, 'Plant private workspace')
assert.equal(plantWorkspaceLead.public_package, 'Plant private workspace')
assert.equal(plantWorkspaceLead.product_area, 'Plant')
assert.equal(plantWorkspaceLead.template_id, 'factory-ops-ledger')
assert.equal(plantWorkspaceLead.onboarding_stage, 'workspace_request')
assert.equal(plantWorkspaceLead.lead_stage, 'qualified')
const plantWorkspaceRoute = buildSolutionRoute(plantWorkspaceLead)
assert.equal(plantWorkspaceRoute.template_id, 'factory-ops-ledger')
assert.equal(plantWorkspaceRoute.delivery_lane, 'factory_ops_workcell')
assert.equal(plantWorkspaceRoute.status, 'route_ready')

const reportingLead = lead({
  page_path: '/contact/?from=ai-agent-solution',
  goal: 'Every Monday we combine three Excel spreadsheets into one clean report and exception list.',
})
const reportingRoute = buildSolutionRoute(reportingLead)
assert.equal(reportingRoute.template_id, 'data-clean-report-agent')
assert.equal(reportingRoute.delivery_lane, 'data_cleanup_workcell')
assert.equal(reportingRoute.starter_kit_url, '')
assert.ok(reportingRoute.matched_keywords.includes('excel'))

const neutralRoute = buildSolutionRoute(lead({ goal: 'We need help.' }))
assert.equal(neutralRoute.template_id, 'outcome-discovery')
assert.equal(neutralRoute.delivery_lane, 'operator_discovery')
assert.equal(neutralRoute.status, 'needs_operator_review')

const invalidExplicitRoute = buildSolutionRoute(lead({ template_id: '../../not-allowlisted' }))
assert.equal(invalidExplicitRoute.template_id, 'outcome-discovery')
assert.equal(invalidExplicitRoute.starter_kit_url, '')

const proofTask = buildFirstProofTaskPayload(vagueAgentLead)
assert.equal(proofTask.starter_kit_url, '')
assert.equal(proofTask.template_id, 'agent-solution-discovery')
assert.equal(proofTask.intake_job.source_manifest.some((item) => item.source_type === 'starter_kit'), false)
assert.equal(proofTask.intake_job.source_manifest.some((item) => item.source_type === 'solution_route'), true)
assert.equal(JSON.stringify(proofTask).includes('/site/agent-templates/'), false)
assert.ok(proofTask.checklist.includes('Review the saved solution route and first-proof boundary.'))

console.log(JSON.stringify({
  status: 'ok',
  contract: 'public_agent_intake',
  contextual_copy: true,
  visible_fields: 4,
  fallback_route: vagueAgentRoute.template_id,
  specific_route: reportingRoute.template_id,
  workspace_routes: [shopWorkspaceRoute.template_id, plantWorkspaceRoute.template_id],
  phantom_starter_kit_paths: 0,
}))
