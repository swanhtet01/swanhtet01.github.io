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
  "entryIntent==='shop-workspace'?'Shop':entryIntent==='plant-workspace'?'Plant':''",
  "text('[data-contact-heading]','Request a private '+workspaceProduct+' workspace.')",
  "text('[data-contact-goal-label]','What should be ready first?')",
  "idleSubmitLabel='Request workspace'",
  'Choose the first workspace',
]) {
  assert.ok(contact.includes(required), `missing workspace intake copy: ${required}`)
}

for (const forbidden of [
  'ai-agent-solution',
  'AI Agent Solutions',
  'What do you want to improve?',
  'Start here',
  "idleSubmitLabel='Contact us'",
  'one reviewed example',
  'name="workflow"',
  'name="requested_package"',
  'name="product_area"',
  'name="template_id"',
  'name="source_links"',
  '/site/agent-templates/',
]) {
  assert.equal(contact.includes(forbidden), false, `retired public intake copy or field returned: ${forbidden}`)
}

assert.match(contact, /name="name" required/)
assert.match(contact, /name="email" required type="email"/)
assert.match(contact, /name="company" required/)
assert.match(contact, /<textarea name="goal" required><\/textarea>/)
assert.doesNotMatch(contact, /name="(?:name|email|company)"[^>]*\svalue=/)

for (const source of [...contact.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1])) {
  new Function(source)
}

assert.equal(contactEntryIntent({ page_path: '/contact/?from=shop-workspace' }), 'shop-workspace')
assert.equal(contactEntryIntent({ source_url: 'https://www.supermega.dev/contact/?from=plant-workspace' }), 'plant-workspace')
assert.equal(contactEntryIntent({ source_url: 'https://supermega.dev/contact/?from=ai-agent-solution' }), '')
assert.equal(contactEntryIntent({ source_url: 'https://example.com/contact/?from=shop-workspace' }), '')

function lead(payload = {}) {
  return buildLeadRecord({
    leadId: 'LEAD-WORKSPACE-INTAKE',
    taskId: 'TASK-WORKSPACE-INTAKE',
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

const shopWorkspaceLead = lead({ page_path: '/contact/?from=shop-workspace' })
assert.equal(shopWorkspaceLead.workflow, 'Shop private workspace request')
assert.equal(shopWorkspaceLead.requested_package, 'Shop private workspace')
assert.equal(shopWorkspaceLead.public_package, 'Shop private workspace')
assert.equal(shopWorkspaceLead.product_area, 'Shop')
assert.equal(shopWorkspaceLead.template_id, 'shop-private-workspace')
assert.equal(shopWorkspaceLead.onboarding_stage, 'workspace_request')
assert.equal(shopWorkspaceLead.access_policy, 'approval_required')
assert.equal(shopWorkspaceLead.workspace_status, 'not_created_until_approved')
const shopWorkspaceRoute = buildSolutionRoute(shopWorkspaceLead)
assert.equal(shopWorkspaceRoute.template_id, 'shop-private-workspace')
assert.equal(shopWorkspaceRoute.delivery_lane, 'shop_workspace_setup')
const shopWorkspaceTask = buildFirstProofTaskPayload(shopWorkspaceLead)
assert.equal(shopWorkspaceTask.product_area, 'Shop')
assert.ok(shopWorkspaceTask.implementation_blueprint_pack.modules.includes('register_shift'))
assert.equal(shopWorkspaceTask.approval_required, true)

const plantWorkspaceLead = lead({ source_url: 'https://supermega.dev/contact/?from=plant-workspace' })
assert.equal(plantWorkspaceLead.workflow, 'Plant private workspace request')
assert.equal(plantWorkspaceLead.requested_package, 'Plant private workspace')
assert.equal(plantWorkspaceLead.product_area, 'Plant')
assert.equal(plantWorkspaceLead.template_id, 'plant-private-workspace')
const plantWorkspaceRoute = buildSolutionRoute(plantWorkspaceLead)
assert.equal(plantWorkspaceRoute.template_id, 'plant-private-workspace')
assert.equal(plantWorkspaceRoute.delivery_lane, 'plant_workspace_setup')
const plantWorkspaceTask = buildFirstProofTaskPayload(plantWorkspaceLead)
assert.equal(plantWorkspaceTask.product_area, 'Plant')
assert.ok(plantWorkspaceTask.implementation_blueprint_pack.modules.includes('shift_handoff'))
assert.equal(plantWorkspaceTask.approval_required, true)

const neutralLead = lead({ goal: 'We need help.' })
const neutralRoute = buildSolutionRoute(neutralLead)
assert.equal(neutralRoute.template_id, 'outcome-discovery')
assert.equal(neutralRoute.delivery_lane, 'operator_discovery')
assert.equal(neutralRoute.product_area, 'Workflow discovery')
assert.equal(neutralRoute.status, 'needs_operator_review')

const retiredAgentIntentLead = lead({ source_url: 'https://supermega.dev/contact/?from=ai-agent-solution' })
assert.equal(retiredAgentIntentLead.public_package, '')
assert.equal(retiredAgentIntentLead.product_area, '')
assert.equal(retiredAgentIntentLead.workflow, 'Workflow system')

console.log(JSON.stringify({
  status: 'ok',
  contract: 'public_workspace_intake',
  contextual_copy: true,
  visible_fields: 4,
  workspace_routes: [shopWorkspaceRoute.template_id, plantWorkspaceRoute.template_id],
  retired_public_agent_intent_blocked: true,
}))
