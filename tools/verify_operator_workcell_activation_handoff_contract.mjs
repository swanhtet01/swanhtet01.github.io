import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const pipelinePath = resolve(process.cwd(), 'api/pipeline-control.js')
const bundledPipelinePath = resolve(process.cwd(), '.vercel/output/functions/api/pipeline-control.js.func/api/pipeline-control.js')
const generatorPath = resolve(process.cwd(), 'tools/create_public_vercel_output.mjs')
const operatorHtmlPath = resolve(process.cwd(), '.vercel/output/static/operator/index.html')
const pipelineSource = readFileSync(pipelinePath, 'utf8')
const bundledPipelineSource = readFileSync(bundledPipelinePath, 'utf8')
const generatorSource = readFileSync(generatorPath, 'utf8')
const operatorHtml = readFileSync(operatorHtmlPath, 'utf8')
const pipelineHandler = require(pipelinePath)
const bundledPipelineHandler = require(bundledPipelinePath)
const contactHandler = require('../api/contact-submissions.js')

for (const [label, handler] of [['source', pipelineHandler], ['bundled', bundledPipelineHandler]]) {
  assert.equal(typeof handler.__test?.safeWorkcellActivationHandoff, 'function', `${label}_safe_handoff_not_exported`)
  assert.equal(typeof handler.__test?.firstProofPacket, 'function', `${label}_first_proof_not_exported`)
}

const hostileHandoff = {
  status: 'ready',
  handoff_type: 'isolated_workcell_provisioner',
  runtime_workcell_slug: 'pipeline-control',
  lead_id: 'LEAD-OPERATOR-HANDOFF\nInjected',
  manifest_file: '../../unsafe.json',
  manifest_draft: {
    version: 99,
    clientSlug: 'Acme Regional Trading',
    clientName: 'Acme\u0000 Regional Trading',
    clientId: 'attacker-controlled',
    projectName: 'attacker-controlled',
    workcells: ['owner-command', 'unapproved-worker'],
    timeZone: 'Asia/Yangon',
    currency: 'mmk',
    lookbackHours: 24,
    clickupListId: '',
    deliveryUtc: '01:30',
    tokenCap: 150000,
    secret: 'must-not-survive',
  },
  required_secret_input_names: ['ATTACKER_CONTROLLED'],
  credentials: { token: 'must-not-survive' },
  plan_command: 'powershell -Command Invoke-Expression unsafe',
  apply_command: 'npm run unsafe',
  exact_apply_confirmation: 'SKIP REVIEW',
  operator_steps: ['Run arbitrary text'],
  credentials_present: true,
  apply_allowed: true,
  real_mrr_delta: 999999999,
  packet: 'Attacker-controlled packet',
}

function assertSanitized(handler, label) {
  const safe = handler.__test.safeWorkcellActivationHandoff(hostileHandoff)
  assert.ok(safe, `${label}_handoff_missing`)
  assert.equal(safe.runtime_workcell_slug, 'pipeline-control')
  assert.equal(safe.lead_id, 'LEAD-OPERATOR-HANDOFF-Injected')
  assert.equal(safe.status, 'needs_manifest_inputs')
  assert.equal(safe.manifest_draft.version, 1)
  assert.equal(safe.manifest_draft.clientSlug, 'acme-regional-trading')
  assert.equal(safe.manifest_draft.clientId, 'workcell-acme-regional-trading')
  assert.equal(safe.manifest_draft.projectName, 'supermega-wc-acme-regional-trading')
  assert.deepEqual(safe.manifest_draft.workcells, ['pipeline-control'])
  assert.equal(safe.manifest_draft.currency, 'MMK')
  assert.equal(Object.hasOwn(safe.manifest_draft, 'secret'), false)
  assert.equal(Object.hasOwn(safe, 'credentials'), false)
  assert.deepEqual(safe.missing_manifest_fields, ['clickupListId'])
  assert.equal(safe.manifest_ready, false)
  assert.equal(safe.credentials_present, false)
  assert.equal(safe.apply_allowed, false)
  assert.equal(safe.real_mrr_delta, 0)
  assert.match(safe.plan_command, /^npm run workcell:provision -- --manifest workcells\/acme-regional-trading\.json --scope <vercel-team>$/)
  assert.match(safe.apply_command, /--confirm "PROVISION supermega-wc-acme-regional-trading"$/)
  assert.doesNotMatch(JSON.stringify(safe), /Invoke-Expression|npm run unsafe|SKIP REVIEW|must-not-survive|ATTACKER_CONTROLLED/)
  assert.match(safe.packet, /No credential value belongs in this packet or manifest/)
  assert.match(safe.packet, /No project creation, schema write, provider action, send, or payment occurs from this console/)

  const firstProof = handler.__test.firstProofPacket({
    action_id: 'ACTION-OPERATOR-HANDOFF',
    lead_id: 'LEAD-OPERATOR-HANDOFF',
    title: 'Pipeline Control first proof',
    payload: {
      first_proof_task: {
        type: 'first_proof_build',
        template_id: 'pipeline-control',
        template_name: 'Pipeline Control',
        first_proof_target: 'One read-only revenue-control preview.',
        workcell_activation_handoff: hostileHandoff,
      },
    },
    result: {},
  })
  assert.ok(firstProof, `${label}_first_proof_missing`)
  assert.deepEqual(firstProof.workcell_activation_handoff, safe)
  assert.equal(firstProof.workcell_activation_packet, safe.packet)
  assert.equal(firstProof.workcell_activation_manifest_json, JSON.stringify(safe.manifest_draft, null, 2))
}

assertSanitized(pipelineHandler, 'source')
assertSanitized(bundledPipelineHandler, 'bundled')

for (const runtimeWorkcellSlug of ['cash-close', 'pipeline-control', 'owner-command']) {
  const intakeHandoff = contactHandler.__test.buildFirstProofTaskPayload({
    lead_id: `LEAD-DRIFT-${runtimeWorkcellSlug}`,
    task_id: `TASK-DRIFT-${runtimeWorkcellSlug}`,
    template_id: runtimeWorkcellSlug,
    public_package: runtimeWorkcellSlug,
    requested_package: runtimeWorkcellSlug,
    company: `Drift Check ${runtimeWorkcellSlug}`,
    name: 'Owner',
    email: 'owner@example.com',
    first_proof_target: 'One accepted proof.',
  }).workcell_activation_handoff
  const operatorHandoff = pipelineHandler.__test.safeWorkcellActivationHandoff(intakeHandoff)
  assert.ok(operatorHandoff, `runtime_handoff_dropped:${runtimeWorkcellSlug}`)
  assert.equal(operatorHandoff.runtime_workcell_slug, runtimeWorkcellSlug)
  assert.deepEqual(operatorHandoff.required_secret_input_names, intakeHandoff.required_secret_input_names)
  assert.deepEqual(operatorHandoff.optional_bootstrap_input_names, intakeHandoff.optional_bootstrap_input_names)
  assert.deepEqual(operatorHandoff.manifest_draft, intakeHandoff.manifest_draft)
  assert.equal(operatorHandoff.apply_allowed, false)
  assert.equal(operatorHandoff.credentials_present, false)
}

const ownerHandoff = contactHandler.__test.buildFirstProofTaskPayload({
  lead_id: 'LEAD-OWNER-NO-SAAS',
  template_id: 'owner-command',
  company: 'Owner Message Business',
  name: 'Owner',
  email: 'owner@example.com',
}).workcell_activation_handoff
const safeOwnerHandoff = pipelineHandler.__test.safeWorkcellActivationHandoff(ownerHandoff)
assert.deepEqual(safeOwnerHandoff.missing_manifest_fields, [])
assert.equal(safeOwnerHandoff.manifest_ready, true)
assert.equal(safeOwnerHandoff.manifest_draft.clickupListId, '')
assert.equal(safeOwnerHandoff.required_secret_input_names.some((name) => /PAYPAL|PIPEDRIVE|CLICKUP/.test(name)), false)
assert.ok(safeOwnerHandoff.required_secret_input_names.includes('SUPERMEGA_NEW_CLIENT_TELEGRAM_BOT_TOKEN'))

for (const [label, source] of [['pipeline', pipelineSource], ['bundled_pipeline', bundledPipelineSource]]) {
  for (const token of [
    'function safeWorkcellActivationHandoff',
    "handoff_type: 'isolated_workcell_provisioner'",
    'credentials_present: false',
    'apply_allowed: false',
    'workcell_activation_manifest_json',
  ]) {
    assert.ok(source.includes(token), `${label}_missing:${token}`)
  }
}

const rendererStart = generatorSource.indexOf('function proofWorkcellActivationHandoff')
const rendererEnd = generatorSource.indexOf('function proofSourcePackRequest', rendererStart)
assert.ok(rendererStart > 0 && rendererEnd > rendererStart, 'operator_handoff_renderer_missing')
const rendererSource = generatorSource.slice(rendererStart, rendererEnd)
for (const token of [
  'data-workcell-activation-handoff="isolated_workcell_provisioner"',
  'Download manifest draft',
  'Copy plan command',
  'Copy gated apply command',
  'No credential values belong in this console',
  'href="https://console.supermega.dev/#activation"',
  'Open activation planner',
]) {
  assert.ok(rendererSource.includes(token), `renderer_missing:${token}`)
}
assert.doesNotMatch(rendererSource, /fetch\s*\(|<input|data-(?:execute|apply)-workcell|applyProvisionPlan/)
assert.doesNotMatch(rendererSource, /console\.supermega\.dev\/[^"']*[?&](?:key|token|secret|credential|password)=/i)

for (const token of [
  'SAMPLE-CASH-CLOSE-ACTIVATION',
  'data-workcell-activation-handoff="isolated_workcell_provisioner"',
  'data-download-workcell-manifest=',
  'Copy gated apply command',
  'No credential values belong in this console',
  'href="https://console.supermega.dev/#activation"',
  'Open activation planner',
  '.operator-grid>*{min-width:0}',
  '.operator-panel .btn{min-height:44px}',
  '.operator-reply{box-sizing:border-box;width:100%;max-width:100%;min-width:0',
]) {
  assert.ok(operatorHtml.includes(token), `generated_operator_missing:${token}`)
}
assert.ok(generatorSource.includes("actionsEl.querySelectorAll('[data-download-workcell-manifest]')"), 'manifest_download_listener_missing')
assert.ok(generatorSource.includes("new Blob([JSON.stringify(parsed,null,2)+'\\\\n']"), 'manifest_download_not_json_only')

const generatedScripts = [...operatorHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((match) => match[1])
assert.ok(generatedScripts.length >= 2, 'generated_operator_scripts_missing')
for (const [index, script] of generatedScripts.entries()) {
  assert.doesNotThrow(() => new vm.Script(script), 'generated_operator_script_'+index+'_invalid')
}

console.log(JSON.stringify({
  ok: true,
  contract: 'operator_workcell_activation_handoff',
  handoff_type: 'isolated_workcell_provisioner',
  mutation: false,
  browser_apply_control: false,
}, null, 2))
