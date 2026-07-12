import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const handler = require('../api/contact-submissions.js')
const bundledContactPath = resolve(process.cwd(), '.vercel/output/functions/api/contact-submissions.js.func/api/contact-submissions.js')
const bundledContact = readFileSync(bundledContactPath, 'utf8')
const bundledHandler = require(bundledContactPath)
const {
  buildSolutionRoute,
  buildRuntimeWorkcellActivationHandoff,
  buildFirstProofTaskPayload,
  pipelineActionPayload,
} = handler.__test || {}

for (const [name, fn] of Object.entries({
  buildSolutionRoute,
  buildRuntimeWorkcellActivationHandoff,
  buildFirstProofTaskPayload,
  pipelineActionPayload,
})) {
  assert.equal(typeof fn, 'function', `${name}_not_exported`)
}

const cases = [
  {
    slug: 'cash-close',
    name: 'Cash Close',
    lane: 'cash_close_workcell',
    status: 'needs_client_credentials',
    clickupRequired: false,
    providerInputs: ['SUPERMEGA_NEW_CLIENT_PAYPAL_CLIENT_ID', 'SUPERMEGA_NEW_CLIENT_PAYPAL_CLIENT_SECRET'],
  },
  {
    slug: 'pipeline-control',
    name: 'Pipeline Control',
    lane: 'pipeline_control_workcell',
    status: 'needs_manifest_inputs',
    clickupRequired: true,
    providerInputs: [
      'SUPERMEGA_NEW_CLIENT_PIPEDRIVE_ACCESS_TOKEN|SUPERMEGA_NEW_CLIENT_PIPEDRIVE_API_TOKEN',
      'SUPERMEGA_NEW_CLIENT_CLICKUP_ACCESS_TOKEN|SUPERMEGA_NEW_CLIENT_CLICKUP_API_TOKEN',
    ],
  },
  {
    slug: 'owner-command',
    name: 'Owner Command',
    lane: 'owner_command_workcell',
    status: 'needs_manifest_inputs',
    clickupRequired: true,
    providerInputs: [
      'SUPERMEGA_NEW_CLIENT_PAYPAL_CLIENT_ID',
      'SUPERMEGA_NEW_CLIENT_PAYPAL_CLIENT_SECRET',
      'SUPERMEGA_NEW_CLIENT_PIPEDRIVE_ACCESS_TOKEN|SUPERMEGA_NEW_CLIENT_PIPEDRIVE_API_TOKEN',
      'SUPERMEGA_NEW_CLIENT_CLICKUP_ACCESS_TOKEN|SUPERMEGA_NEW_CLIENT_CLICKUP_API_TOKEN',
    ],
  },
]

const sharedInputs = [
  'SUPERMEGA_NEW_CLIENT_OPS_KEY',
  'SUPERMEGA_NEW_CLIENT_ANTHROPIC_API_KEY|SUPERMEGA_NEW_CLIENT_CLAUDE_API_KEY|SUPERMEGA_NEW_CLIENT_OPENROUTER_API_KEY',
  'SUPERMEGA_NEW_CLIENT_SUPABASE_URL',
  'SUPERMEGA_NEW_CLIENT_SUPABASE_SERVICE_ROLE_KEY',
  'SUPERMEGA_NEW_CLIENT_TELEGRAM_BOT_TOKEN',
  'SUPERMEGA_NEW_CLIENT_TELEGRAM_ALERT_CHAT_ID|SUPERMEGA_NEW_CLIENT_TELEGRAM_CHAT_ID',
]

for (const token of [
  "'cash-close': {",
  "'pipeline-control': {",
  "'owner-command': {",
  'buildRuntimeWorkcellActivationHandoff',
  "handoff_type: 'isolated_workcell_provisioner'",
  'workcell_activation_handoff: firstProofTask.workcell_activation_handoff',
  'apply_allowed: false',
]) {
  assert.ok(bundledContact.includes(token), `bundled_contact_missing:${token}`)
}
assert.equal(typeof bundledHandler.__test?.buildRuntimeWorkcellActivationHandoff, 'function', 'bundled_handoff_helper_not_executable')

for (const [index, item] of cases.entries()) {
  const record = {
    lead_id: `LEAD-RUNTIME-${index + 1}`,
    task_id: `TASK-RUNTIME-${index + 1}`,
    company: index === 1 ? 'Mingalar Distribution & Trading Co.' : 'Acme Regional Trading',
    name: 'Owner',
    email: 'owner@example.com',
    template_id: item.slug,
    public_package: item.name,
    requested_package: item.name,
    product_area: 'Custom Solutions & AI Agents',
    first_output: item.name,
    first_proof_target: `Accepted ${item.name} first proof`,
    acceptance_tests: 'Uses approved sources | Shows exact source trace | Keeps writes approval-only',
    launch_blockers: 'No owner reviewer | No client-owned source access',
    automation_boundary: 'No external send, write, payment, or provider action without owner approval.',
    price_hint: index === 0 ? 'From 8,000,000 MMK' : 'From 13,000,000 MMK',
    goal: `Prove ${item.name} from client-owned sources.`,
    source_links: 'Approved source inventory only; no credentials.',
    owner: 'Revenue Pod',
  }

  const route = buildSolutionRoute(record)
  assert.equal(route.template_id, item.slug)
  assert.equal(route.package_name, item.name)
  assert.equal(route.delivery_lane, item.lane)
  assert.equal(route.runtime_workcell_slug, item.slug)
  assert.equal(route.provisioner_handoff_supported, true)
  assert.equal(route.starter_kit_url, '')
  assert.ok(route.source_requests.every((request) => !/send|paste|email.+credential/i.test(request)))
  assert.ok(route.source_requests.some((request) => /never in this form or email/i.test(request)))

  const task = buildFirstProofTaskPayload(record)
  const handoff = task.workcell_activation_handoff
  assert.ok(handoff)
  assert.equal(task.solution_route.delivery_lane, item.lane)
  assert.equal(task.starter_kit_url, '')
  assert.equal(task.intake_job.source_manifest.some((source) => source.source_type === 'runtime_contract' && source.value === `runtime-workcell:${item.slug}`), true)
  assert.doesNotMatch(JSON.stringify(task), new RegExp(`/site/agent-templates/${item.slug}\\.json`))

  assert.equal(handoff.status, item.status)
  assert.equal(handoff.handoff_type, 'isolated_workcell_provisioner')
  assert.equal(handoff.runtime_workcell_slug, item.slug)
  assert.equal(handoff.manifest_draft.version, 1)
  assert.ok(handoff.manifest_draft.clientName.length <= 120)
  assert.doesNotMatch(handoff.manifest_draft.clientName, /[\u0000-\u001f\u007f]/)
  assert.match(handoff.manifest_draft.clientSlug, /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/)
  assert.equal(handoff.manifest_draft.clientId, `workcell-${handoff.manifest_draft.clientSlug}`)
  assert.equal(handoff.manifest_draft.projectName, `supermega-wc-${handoff.manifest_draft.clientSlug}`)
  assert.deepEqual(handoff.manifest_draft.workcells, [item.slug])
  assert.equal(handoff.manifest_draft.timeZone, 'Asia/Yangon')
  assert.equal(handoff.manifest_draft.currency, 'MMK')
  assert.equal(handoff.manifest_draft.lookbackHours, 24)
  assert.equal(handoff.manifest_draft.deliveryUtc, '01:30')
  assert.equal(handoff.manifest_draft.tokenCap, 150000)
  assert.deepEqual(handoff.missing_manifest_fields, item.clickupRequired ? ['clickupListId'] : [])
  assert.equal(handoff.manifest_ready, !item.clickupRequired)
  assert.equal(handoff.credentials_present, false)
  assert.equal(handoff.apply_allowed, false)
  assert.equal(handoff.real_mrr_delta, 0)
  assert.equal(handoff.exact_apply_confirmation, `PROVISION ${handoff.manifest_draft.projectName}`)
  assert.match(handoff.plan_command, new RegExp(`--manifest workcells/${handoff.manifest_draft.clientSlug}\\.json`))
  assert.match(handoff.apply_command, /--apply/)
  assert.match(handoff.apply_command, new RegExp(`--confirm "PROVISION ${handoff.manifest_draft.projectName}"`))
  assert.deepEqual(handoff.required_secret_input_names, [...sharedInputs, ...item.providerInputs])
  assert.deepEqual(handoff.optional_bootstrap_input_names, ['SUPERMEGA_NEW_CLIENT_SUPABASE_DB_URL', 'SUPERMEGA_NEW_CLIENT_CRON_SECRET'])
  assert.equal(Object.prototype.hasOwnProperty.call(handoff, 'secrets'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(handoff.manifest_draft, 'secret'), false)
  assert.match(handoff.packet, /Apply allowed: false/)
  assert.match(handoff.packet, /No credential value belongs in this packet or manifest/)

  const action = pipelineActionPayload(record)
  assert.deepEqual(action.payload.workcell_activation_handoff, handoff)
  assert.deepEqual(action.payload.first_proof_task.workcell_activation_handoff, handoff)
}

const unsupported = buildRuntimeWorkcellActivationHandoff({ template_id: 'document-extraction-ledger' }, {}, {})
assert.equal(unsupported, null)

const bundledProof = bundledHandler.__test.buildFirstProofTaskPayload({
  lead_id: 'LEAD-BUNDLED-PROOF',
  task_id: 'TASK-BUNDLED-PROOF',
  template_id: 'owner-command',
  public_package: 'Owner Command',
  requested_package: 'Owner Command',
  company: 'Bundled Contract Client',
  name: 'Owner',
  email: 'owner@example.com',
  first_proof_target: 'One owner brief from approved sources.',
})
assert.equal(bundledProof.solution_route.delivery_lane, 'owner_command_workcell')
assert.equal(bundledProof.workcell_activation_handoff.runtime_workcell_slug, 'owner-command')
assert.equal(bundledProof.workcell_activation_handoff.apply_allowed, false)

const sanitized = buildRuntimeWorkcellActivationHandoff({
  lead_id: 'LEAD-SANITIZE',
  template_id: 'cash-close',
  company: `${'Very Long Client Name '.repeat(12)}\nInjected`,
}, { runtime_workcell_slug: 'cash-close' }, {})
assert.ok(sanitized.manifest_draft.clientName.length <= 120)
assert.doesNotMatch(sanitized.manifest_draft.clientName, /[\u0000-\u001f\u007f]/)
assert.match(sanitized.manifest_draft.clientSlug, /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/)

console.log(JSON.stringify({
  ok: true,
  contract: 'runtime_workcell_activation_handoff',
  workcells: cases.map((item) => item.slug),
  mutation: false,
}, null, 2))
