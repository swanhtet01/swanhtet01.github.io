import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const root = process.cwd()
const apiPath = resolve(root, 'api/source-pack-submissions.js')

assert.ok(existsSync(apiPath), 'source_pack_submissions_api_missing')

const handler = require('../api/source-pack-submissions.js')
const {
  normalizeSourcePackSubmission,
  publicSubmissionResponse,
} = handler.__test

assert.equal(typeof normalizeSourcePackSubmission, 'function')
assert.equal(typeof publicSubmissionResponse, 'function')

const submission = normalizeSourcePackSubmission({
  lead_id: 'LEAD-SOURCE-SUBMIT-001',
  action_id: 'TASK-SOURCE-SUBMIT-001',
  source_pack_name: 'Client approved first-proof source pack',
  sources: [
    {
      source_id: 'SRC-01',
      source_type: 'gmail_or_chat',
      reference: 'Customer message sample',
      content: 'Customer asked for a weekly stock and payment follow-up summary.',
      approved: true,
    },
    {
      source_id: 'SRC-02',
      source_type: 'spreadsheet_or_pos_export',
      reference: 'Order export',
      content: 'order_id,total,status\\nA-100,120000,unpaid',
      approved: true,
    },
  ],
})

assert.equal(submission.status, 'client_source_pack_submitted')
assert.equal(submission.submission_type, 'client_source_pack')
assert.equal(submission.lead_id, 'LEAD-SOURCE-SUBMIT-001')
assert.equal(submission.action_id, 'TASK-SOURCE-SUBMIT-001')
assert.equal(submission.source_count, 2)
assert.equal(submission.approval_scope, 'first_proof_only')
assert.equal(submission.external_action_state, 'blocked_until_owner_approval')
assert.equal(submission.connector_write_state, 'blocked_until_owner_approval')
assert.equal(submission.payment_request_state, 'blocked_until_owner_approval')
assert.equal(submission.real_mrr_delta, 0)
assert.ok(submission.guardrails.includes('no_external_send'))
assert.ok(submission.guardrails.includes('no_mrr_delta_without_payment_proof'))
assert.ok(submission.sources.every((source) => source.approved === true))

const publicResponse = publicSubmissionResponse({
  submission,
  action: {
    action_id: 'TASK-SOURCE-SUBMIT-001',
    lead_id: 'LEAD-SOURCE-SUBMIT-001',
    status: 'client_source_pack_received',
    approval_state: 'pending_source_review',
    notification_status: 'client_source_pack_received',
  },
  adapter: 'vercel_postgres_neon',
})

assert.equal(publicResponse.status, 'ready')
assert.equal(publicResponse.submission_status, 'client_source_pack_received')
assert.equal(publicResponse.source_pack_submission.source_count, 2)
assert.equal(publicResponse.source_pack_submission.real_mrr_delta, 0)
assert.equal(publicResponse.source_pack_submission.external_action_state, 'blocked_until_owner_approval')
assert.equal(publicResponse.action.status, 'client_source_pack_received')
assert.equal(publicResponse.action.approval_state, 'pending_source_review')
assert.equal(publicResponse.source_pack_submission.sources, undefined, 'public_response_must_not_echo_source_content')

const missingIds = normalizeSourcePackSubmission({
  sources: [{ source_type: 'gmail_or_chat', reference: 'Customer message', content: 'hello' }],
})
assert.equal(missingIds.status, 'error')
assert.equal(missingIds.reason, 'missing_action_or_lead_id')

const missingSources = normalizeSourcePackSubmission({
  lead_id: 'LEAD-SOURCE-SUBMIT-002',
  action_id: 'TASK-SOURCE-SUBMIT-002',
  sources: [],
})
assert.equal(missingSources.status, 'error')
assert.equal(missingSources.reason, 'missing_source_pack_sources')

const sourcePackPage = existsSync(resolve(root, '.vercel/output/static/app/source-pack/index.html'))
  ? readFileSync(resolve(root, '.vercel/output/static/app/source-pack/index.html'), 'utf8')
  : ''

if (sourcePackPage) {
  for (const token of ['Submit source pack', '/api/source-pack-submissions', 'client_source_pack_submitted', 'Submitted for operator review']) {
    assert.ok(sourcePackPage.includes(token), `source_pack_page_missing_${token}`)
  }
}

console.log(JSON.stringify({
  status: 'ready',
  contract: 'source_pack_submission',
  source_count: submission.source_count,
  external_action_state: submission.external_action_state,
  real_mrr_delta: submission.real_mrr_delta,
}, null, 2))
