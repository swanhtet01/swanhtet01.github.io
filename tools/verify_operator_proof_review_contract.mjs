import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const handler = require('../api/pipeline-control.js')

function fail(reason, detail = {}) {
  console.error(JSON.stringify({ status: 'error', reason, ...detail }, null, 2))
  process.exit(1)
}

const root = process.cwd()
const generatorPath = resolve(root, 'tools/create_public_vercel_output.mjs')
const operatorPath = resolve(root, '.vercel/output/static/operator/index.html')
const proofReviewPath = resolve(root, '.vercel/output/static/app/proof-review/index.html')

if (!existsSync(generatorPath)) fail('public_generator_missing')
if (!existsSync(operatorPath)) fail('operator_output_missing', { next: 'Run node tools/create_public_vercel_output.mjs first.' })

const internals = handler.__test || {}
if (typeof internals.buildActivationProofReviewRequest !== 'function') fail('proof_review_request_builder_missing')
if (typeof internals.buildActivationFirstProof !== 'function') fail('activation_first_proof_builder_missing')

const row = {
  action_id: 'TASK-PROOFREVIEW',
  lead_id: 'LEAD-PROOFREVIEW',
  payload: {
    lead: {
      lead_id: 'LEAD-PROOFREVIEW',
      task_id: 'TASK-PROOFREVIEW',
      company: 'Yangon Proof Review Co',
      name: 'Daw Review',
      requested_package: 'Managed AI Workcell',
      first_proof_target: 'Daily customer priority queue.',
    },
    first_proof_task: {
      template_name: 'Managed AI Workcell',
      first_proof_target: 'Daily customer priority queue.',
    },
  },
  result: {
    template_name: 'Managed AI Workcell',
    first_proof_target: 'Daily customer priority queue.',
  },
}

const proof = internals.buildActivationFirstProof(row, {
  approved_source_sample: 'Customer A asked for invoice resend. Customer B has 820,000 MMK unpaid.',
  source_reference: 'proof review contract sample',
})

const request = proof.proof_review_request
assert.equal(request.status, 'proof_review_request_ready')
assert.equal(request.request_type, 'client_first_proof_review')
assert.equal(request.lead_id, 'LEAD-PROOFREVIEW')
assert.equal(request.action_id, 'TASK-PROOFREVIEW')
assert.ok(request.review_url.includes('/app/proof-review?'))
assert.ok(request.review_url.includes('lead=LEAD-PROOFREVIEW'))
assert.ok(request.review_url.includes('action=TASK-PROOFREVIEW'))
assert.ok(request.client_review_message.includes('review the first proof'))
assert.deepEqual(request.decision_options, ['ready_for_paid_pilot', 'changes_requested', 'not_useful'])
assert.equal(request.external_action_state, 'blocked_until_owner_approval')
assert.equal(request.real_mrr_delta, 0)

if (!existsSync(proofReviewPath)) fail('proof_review_output_missing', { next: 'Run node tools/create_public_vercel_output.mjs after adding /app/proof-review.' })

const generator = readFileSync(generatorPath, 'utf8')
const operator = readFileSync(operatorPath, 'utf8')
const proofReview = readFileSync(proofReviewPath, 'utf8')

const sourceTokens = [
  'buildActivationProofReviewRequest',
  'proof_review_request',
  'proofReviewRequest',
  '/app/proof-review',
  'Client proof review',
]
for (const token of sourceTokens) {
  if (!generator.includes(token) && !readFileSync(resolve(root, 'api/pipeline-control.js'), 'utf8').includes(token)) {
    fail('proof_review_source_token_missing', { token })
  }
}

const operatorTokens = [
  'Client proof review',
  'Proof-review link',
  'Copy review request',
  'data-proof-review-request',
]
for (const token of operatorTokens) {
  if (!operator.includes(token)) fail('proof_review_operator_token_missing', { token })
}

const pageTokens = [
  'AI Workcell Proof Review',
  'Proof acceptance JSON',
  'Copy acceptance JSON',
  'ready_for_paid_pilot',
  'changes_requested',
  'owner approval before send/write/payment/browser actions',
]
for (const token of pageTokens) {
  if (!proofReview.includes(token)) fail('proof_review_page_token_missing', { token })
}

console.log(
  JSON.stringify(
    {
      status: 'ready',
      audit: 'operator-proof-review-contract',
      review_url: request.review_url,
      decisions: request.decision_options.length,
      real_mrr_delta: request.real_mrr_delta,
    },
    null,
    2,
  ),
)
