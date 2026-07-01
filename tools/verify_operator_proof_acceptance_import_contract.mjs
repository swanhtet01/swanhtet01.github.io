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
  'recordProofReviewAcceptanceJson',
  'data-proof-acceptance-json-command',
  'proof_acceptance_json',
  'Import proof acceptance JSON',
  'Paste Proof acceptance JSON',
  'proof_acceptance_json_parse_failed',
  "operation:'record_proof_review_acceptance'",
]

for (const token of sourceTokens) {
  if (!generator.includes(token)) fail('proof_acceptance_import_source_token_missing', { token })
}

const outputTokens = [
  'Import proof acceptance JSON',
  'Paste Proof acceptance JSON',
  'data-proof-acceptance-json-command',
  'proof_acceptance_json',
  'proof_acceptance_json_parse_failed',
]

for (const token of outputTokens) {
  if (!operator.includes(token)) fail('proof_acceptance_import_output_token_missing', { token })
}

console.log(
  JSON.stringify(
    {
      status: 'ready',
      audit: 'operator-proof-acceptance-import-contract',
      source_tokens: sourceTokens.length,
      output_tokens: outputTokens.length,
    },
    null,
    2,
  ),
)
