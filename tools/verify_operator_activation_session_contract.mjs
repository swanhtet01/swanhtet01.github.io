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
  'operator-activation-session',
  'Start activation session',
  'startActivationSession',
  'activationSessionPayload',
  'data-activation-session-field',
  "operation:'start_activation_session'",
  'source_sample',
  'first_proof_target',
  'No external send',
  'Real MRR stays 0',
]

for (const token of sourceTokens) {
  if (!generator.includes(token)) fail('activation_session_source_token_missing', { token })
}

const outputTokens = [
  'Autopilot intake',
  'Start activation session',
  'data-activation-session-field',
  'source_sample',
  'first_proof_target',
  'No external send',
  'Real MRR stays 0',
  'one owner-approved action queue',
]

for (const token of outputTokens) {
  if (!operator.includes(token)) fail('activation_session_output_token_missing', { token })
}

console.log(JSON.stringify({
  status: 'ready',
  audit: 'operator-activation-session-contract',
  source_tokens: sourceTokens.length,
  output_tokens: outputTokens.length,
}, null, 2))
