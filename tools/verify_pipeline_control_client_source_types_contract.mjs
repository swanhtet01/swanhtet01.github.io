import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const handler = require('../api/pipeline-control.js')

function fail(reason, detail = {}) {
  console.error(JSON.stringify({ status: 'error', reason, ...detail }, null, 2))
  process.exit(1)
}

const internals = handler.__test || {}
if (typeof internals.buildActivationSourcePack !== 'function') fail('activation_source_pack_builder_missing')

const pack = internals.buildActivationSourcePack(
  {
    action_id: 'TASK-CLIENT-TYPES',
    lead_id: 'LEAD-CLIENT-TYPES',
    payload: {
      lead: {
        company: 'Client Type Smoke',
        requested_package: 'Managed AI Workcell',
        first_proof_target: 'Preserve client source pack types.',
      },
    },
    result: {
      template_name: 'Managed AI Workcell',
      first_proof_target: 'Preserve client source pack types.',
    },
  },
  {
    source_pack_name: 'Client source pack type smoke',
    sources: [
      { source_type: 'gmail_or_chat', reference: 'Customer thread', content: 'Customer A asked for delivery.', approved: true },
      { source_type: 'spreadsheet_or_pos_export', reference: 'POS CSV', content: 'Customer A 820,000 MMK unpaid.', approved: true },
      { source_type: 'process_note_or_screenshot', reference: 'Process note', content: 'Owner checks payment before delivery.', approved: true },
    ],
  },
)

assert.equal(pack.status, 'source_pack_attached')
assert.deepEqual(
  pack.sources.map((source) => source.source_type),
  ['gmail_or_chat', 'spreadsheet_or_pos_export', 'process_note_or_screenshot'],
)
assert.ok(pack.source_trace.some((item) => item.includes('gmail_or_chat')))
assert.ok(pack.combined_source_text.includes('820,000 MMK'))
assert.equal(pack.external_action_state, 'blocked_until_owner_approval')
assert.equal(pack.real_mrr_delta, 0)

console.log(
  JSON.stringify(
    {
      status: 'ready',
      audit: 'pipeline-control-client-source-types-contract',
      source_types: pack.sources.map((source) => source.source_type),
      real_mrr_delta: pack.real_mrr_delta,
    },
    null,
    2,
  ),
)
