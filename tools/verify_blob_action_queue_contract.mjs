import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const blobQueue = require('../api/lib/supermega-blob-queue.js')

function memoryBlobSdk() {
  const blobs = new Map()
  return {
    blobs,
    async put(pathname, body) {
      blobs.set(pathname, String(body))
      return { pathname }
    },
    async list({ prefix = '', limit = 100 } = {}) {
      return {
        blobs: [...blobs.keys()]
          .filter((pathname) => pathname.startsWith(prefix))
          .slice(0, limit)
          .map((pathname) => ({ pathname })),
      }
    },
    async get(pathname) {
      const body = blobs.get(pathname)
      if (body === undefined) throw new Error('blob_not_found')
      return { stream: new Blob([body]).stream() }
    },
  }
}

const sdk = memoryBlobSdk()

const action = {
  action_id: 'BLOB-CONTRACT-ACTION-001',
  lead_id: 'BLOB-CONTRACT-LEAD',
  task_id: 'BLOB-CONTRACT-TASK',
  run_id: 'BLOB-CONTRACT-RUN',
  action_type: 'source_request',
  status: 'queued',
  priority: 'high',
  owner: 'Revenue Pod',
  title: 'Ask for source: Daily Intelligence Brief Agent',
  next_step: 'Ask for one approved source sample.',
  approval_required: true,
  approval_state: 'pending',
  notification_channel: 'blob_queue',
  notification_status: 'queued',
  payload: {
    lead: {
      lead_id: 'BLOB-CONTRACT-LEAD',
      requested_package: 'Daily Intelligence Brief Agent',
      lead_score: 82,
      next_step: 'Send one approved source sample.',
    },
    offer: {
      package: 'Daily Intelligence Brief Agent',
      first_output: 'One source-traced owner brief.',
      source_request: 'Ask for one supplier email thread.',
    },
  },
}

const saved = await blobQueue.savePipelineAction(action, { blobSdk: sdk, allowWithoutToken: true })
assert.equal(saved.status, 'ready')
assert.equal(saved.adapter, 'vercel_blob')
assert.equal(saved.table, 'supermega_pipeline_actions')
assert.equal(saved.action_id, action.action_id)

const claimed = await blobQueue.claimBatch(1, { blobSdk: sdk, allowWithoutToken: true })
assert.equal(claimed.status, 'ready')
assert.equal(claimed.adapter, 'vercel_blob')
assert.equal(claimed.rows.length, 1)
assert.equal(claimed.rows[0].status, 'processing')
assert.equal(claimed.rows[0].action_type, 'source_request')

const updated = await blobQueue.updateAction(action.action_id, {
  status: 'done',
  result: {
    status: 'ready',
    type: 'source_request_packet',
    packet: 'Internal source request only.',
    sent: false,
    real_mrr_delta: 0,
  },
  processed_at: '2026-07-01T00:00:00.000Z',
}, { blobSdk: sdk, allowWithoutToken: true })
assert.equal(updated.status, 'ready')

const run = await blobQueue.saveSalesRun({
  run_id: 'BLOB-CONTRACT-RUN',
  run_type: 'sales_daily',
  campaign: 'general-growth',
  status: 'ready',
  core_pitch: 'One messy workflow becomes one usable work screen.',
  metrics: { action_count: 3 },
  generated_at: '2026-07-01T00:00:00.000Z',
}, { blobSdk: sdk, allowWithoutToken: true })
assert.equal(run.status, 'ready')
assert.equal(run.table, 'supermega_sales_runs')

const latestRun = await blobQueue.latestSalesRun({ blobSdk: sdk, allowWithoutToken: true })
assert.equal(latestRun.status, 'ready')
assert.equal(latestRun.rows[0].run_id, 'BLOB-CONTRACT-RUN')

const lead = await blobQueue.findLeadById('BLOB-CONTRACT-LEAD', { blobSdk: sdk, allowWithoutToken: true })
assert.equal(lead.lead_id, 'BLOB-CONTRACT-LEAD')
assert.equal(lead.requested_package, 'Daily Intelligence Brief Agent')

const snapshot = await blobQueue.pipelineSnapshot({ actionLimit: 8 }, { blobSdk: sdk, allowWithoutToken: true })
assert.equal(snapshot.status, 'ready')
assert.equal(snapshot.provider, 'vercel_blob')
assert.equal(snapshot.latestActions.length, 1)
assert.equal(snapshot.latestLeads.length, 1)
assert.equal(snapshot.latestRuns.length, 1)
assert.equal(snapshot.latestActions[0].result.sent, false)
assert.equal(snapshot.latestActions[0].result.real_mrr_delta, 0)

console.log(JSON.stringify({
  status: 'ready',
  contract: 'blob_action_queue',
  adapter: 'vercel_blob',
  rows: snapshot.latestActions.length,
  runs: snapshot.latestRuns.length,
  guardrail: 'drafts_do_not_send_or_claim_mrr',
}, null, 2))
