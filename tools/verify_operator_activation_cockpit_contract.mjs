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
  'renderActivationCockpit',
  'activationTargetAction',
  'activationStepState',
  'runActivationStep',
  'operator-activation-cockpit',
  'data-activation-command',
  'payment_proof_gate',
  'workspace_start_gate',
  'customer_success_gate',
  'retainer_gate',
  'One-click activation runbook',
]

for (const token of sourceTokens) {
  if (!generator.includes(token)) fail('activation_cockpit_source_token_missing', { token })
}

const outputTokens = [
  'Activation cockpit',
  'One-click activation runbook',
  'data-activation-command',
  'payment_proof_gate',
  'workspace_start_gate',
  'customer_success_gate',
  'retainer_gate',
  'client onboarding allowed',
  'Real MRR stays 0 until payment proof',
]

for (const token of outputTokens) {
  if (!operator.includes(token)) fail('activation_cockpit_output_token_missing', { token })
}

console.log(JSON.stringify({
  status: 'ready',
  audit: 'operator-activation-cockpit-contract',
  source_tokens: sourceTokens.length,
  output_tokens: outputTokens.length,
}, null, 2))
