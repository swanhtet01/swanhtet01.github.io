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
  'recordFirstProductionRun',
  'data-first-production-run-command',
  'first_run_output',
  'first_run_evidence_reference',
  'first_run_source_trace',
  'Record first production run',
  'first_run_output_required',
  "operation:'record_first_production_run'",
]

for (const token of sourceTokens) {
  if (!generator.includes(token)) fail('first_production_run_source_token_missing', { token })
}

const outputTokens = [
  'Record first production run',
  'First production run output',
  'First run evidence reference',
  'Source trace',
  'First production run packet',
  'Copy first production run',
  'data-first-production-run-command',
  'first_run_output',
  'first_run_evidence_reference',
]

for (const token of outputTokens) {
  if (!operator.includes(token)) fail('first_production_run_output_token_missing', { token })
}

console.log(
  JSON.stringify(
    {
      status: 'ready',
      audit: 'operator-first-production-run-contract',
      source_tokens: sourceTokens.length,
      output_tokens: outputTokens.length,
    },
    null,
    2,
  ),
)
