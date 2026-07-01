import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function fail(reason, detail = {}) {
  console.error(JSON.stringify({ status: 'error', reason, ...detail }, null, 2))
  process.exit(1)
}

const root = process.cwd()
const generatorPath = resolve(root, 'tools/create_public_vercel_output.mjs')
const operatorPath = resolve(root, '.vercel/output/static/operator/index.html')

if (!existsSync(generatorPath)) fail('public_generator_missing')
if (!existsSync(operatorPath)) fail('operator_output_missing', { next: 'Run node tools/create_public_vercel_output.mjs first.' })

const generator = readFileSync(generatorPath, 'utf8')
const operator = readFileSync(operatorPath, 'utf8')

const sourceTokens = [
  'operator-client-first-run-acceptance',
  'operator-owner-acceptance-control',
  'operator-connector-policy-control',
  'operator-production-approval-control',
  'fieldByTargetOrAction',
  'data-owner-acceptance-reference-for',
  'data-owner-acceptance-note-for',
  'data-connector-policy-reference-for',
  'data-connector-policy-note-for',
  'data-production-queue-reference-for',
  'owner_acceptance_reference',
  'connector_policy_reference',
  'production_queue_reference',
  'owner_note:ownerNote',
  'client_first_run_acceptance',
]

for (const token of sourceTokens) {
  if (!generator.includes(token)) fail('owner_connector_control_source_token_missing', { token })
}

for (const stalePrompt of [
  "window.prompt('Owner acceptance evidence reference')",
  "window.prompt('Connector policy evidence reference')",
  "window.prompt('Autopilot queue evidence reference')",
]) {
  if (generator.includes(stalePrompt)) fail('stale_prompt_control_still_present', { stalePrompt })
}

const outputTokens = [
  'Client first-run acceptance',
  'Owner acceptance evidence',
  'Connector policy evidence',
  'Production approval queue evidence',
  'data-owner-acceptance-reference-for',
  'data-connector-policy-reference-for',
  'data-production-queue-reference-for',
  'owner_acceptance_reference',
  'connector_policy_reference',
  'production_queue_reference',
  'Record owner accepted',
  'Record connector policy',
  'Prepare autopilot approval queue',
]

for (const token of outputTokens) {
  if (!operator.includes(token)) fail('owner_connector_control_output_token_missing', { token })
}

console.log(
  JSON.stringify(
    {
      status: 'ready',
      audit: 'operator-owner-connector-controls',
      source_tokens: sourceTokens.length,
      output_tokens: outputTokens.length,
    },
    null,
    2,
  ),
)
