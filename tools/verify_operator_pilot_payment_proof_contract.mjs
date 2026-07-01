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
  'recordPilotPaymentProof',
  'data-pilot-payment-proof-command',
  'payment_amount_mmk',
  'payment_proof_reference',
  'owner_reconciliation_reference',
  'Record pilot payment proof',
  'pilot_payment_proof_reference_required',
  "operation:'record_pilot_payment_proof'",
]

for (const token of sourceTokens) {
  if (!generator.includes(token)) fail('pilot_payment_proof_source_token_missing', { token })
}

const outputTokens = [
  'Record pilot payment proof',
  'Payment amount MMK',
  'Payment proof reference',
  'Owner reconciliation reference',
  'Pilot payment proof record',
  'Copy pilot payment proof',
  'data-pilot-payment-proof-command',
  'payment_amount_mmk',
  'payment_proof_reference',
]

for (const token of outputTokens) {
  if (!operator.includes(token)) fail('pilot_payment_proof_output_token_missing', { token })
}

console.log(
  JSON.stringify(
    {
      status: 'ready',
      audit: 'operator-pilot-payment-proof-contract',
      source_tokens: sourceTokens.length,
      output_tokens: outputTokens.length,
    },
    null,
    2,
  ),
)
