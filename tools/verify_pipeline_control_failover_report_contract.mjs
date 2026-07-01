import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { Readable, Writable } from 'node:stream'

const require = createRequire(import.meta.url)
const datastore = require('../api/lib/supermega-datastore.js')
const blobQueue = require('../api/lib/supermega-blob-queue.js')
const handler = require('../api/pipeline-control.js')

const originalOpsKey = process.env.SUPERMEGA_OPS_KEY
const originalPostgresConfigured = datastore.postgresConfigured
const originalDatastoreStatus = datastore.datastoreStatus
const originalPipelineSnapshot = blobQueue.pipelineSnapshot
const originalQueueStatus = blobQueue.queueStatus

function callHandler({ method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = Readable.from([])
    req.method = method
    req.url = '/api/pipeline-control/status'
    req.headers = {
      authorization: 'Bearer test-ops-key',
      ...headers,
    }

    let responseBody = ''
    const res = new Writable({
      write(chunk, _encoding, callback) {
        responseBody += chunk.toString()
        callback()
      },
    })
    res.statusCode = 200
    res.headers = {}
    res.setHeader = (name, value) => {
      res.headers[String(name).toLowerCase()] = value
    }
    res.end = (chunk = '') => {
      if (chunk) responseBody += chunk.toString()
      resolve({ statusCode: res.statusCode, headers: res.headers, body: responseBody })
    }

    Promise.resolve(handler(req, res)).catch(reject)
  })
}

function parseJson(response) {
  try {
    return JSON.parse(response.body)
  } catch {
    throw new Error(`response_not_json=${response.statusCode}:${response.body.slice(0, 160)}`)
  }
}

try {
  process.env.SUPERMEGA_OPS_KEY = 'test-ops-key'
  datastore.postgresConfigured = () => false
  datastore.datastoreStatus = () => ({
    status: 'not_configured',
    provider: 'vercel_postgres_neon',
    adapter: 'pg',
    env: 'POSTGRES_URL_or_DATABASE_URL',
    source: 'vercel_marketplace',
  })
  blobQueue.queueStatus = () => ({
    status: 'ready',
    adapter: 'vercel_blob',
    access: 'private',
    purpose: 'Durable fallback queue for owner-gated SuperMega revenue actions when SQL is degraded.',
  })
  blobQueue.pipelineSnapshot = async () => ({
    status: 'ready',
    latestLeads: [
      {
        lead_id: 'LEAD-FAILOVER',
        task_id: 'TASK-FAILOVER',
        submitted_at: '2026-07-01T00:00:00.000Z',
        requested_package: 'Daily Intelligence Brief Agent',
        lead_score: 95,
        lead_stage: 'new',
        status: 'routed',
        next_step: 'Build first proof from approved source sample.',
      },
    ],
    latestActions: [
      {
        action_id: 'ACTION-FAILOVER',
        lead_id: 'LEAD-FAILOVER',
        task_id: 'TASK-FAILOVER',
        action_type: 'lead_followup',
        status: 'queued',
        priority: 'high',
        owner: 'Revenue Pod',
        title: 'Build first proof',
        next_step: 'Run first proof packet.',
        approval_required: true,
        approval_state: 'pending',
        notification_channel: 'blob_queue',
        notification_status: 'queued',
        payload: {
          first_proof_task: {
            type: 'first_proof_build',
            template_id: 'daily-intelligence-brief',
            template_name: 'Daily Intelligence Brief Agent',
            first_proof_target: 'One-page owner brief.',
          },
        },
        result: {},
        created_at: '2026-07-01T00:05:00.000Z',
      },
    ],
    latestRuns: [{ run_id: 'RUN-FAILOVER', status: 'ready', generated_at: '2026-07-01T00:06:00.000Z' }],
    pendingActionCount: 1,
    lead24hCount: 1,
    lead7dCount: 1,
  })

  const response = await callHandler()
  const body = parseJson(response)
  assert.equal(response.statusCode, 200)
  assert.equal(body.status, 'ready')
  assert.equal(body.runtime_status, 'degraded')
  assert.equal(body.datastore_failover_report.status, 'active')
  assert.equal(body.datastore_failover_report.report_type, 'datastore_failover_report')
  assert.equal(body.datastore_failover_report.primary.adapter, 'pg')
  assert.equal(body.datastore_failover_report.primary.status, 'not_configured')
  assert.equal(body.datastore_failover_report.fallback.adapter, 'vercel_blob')
  assert.equal(body.datastore_failover_report.fallback.status, 'ready')
  assert.equal(body.datastore_failover_report.client_onboarding_allowed, true)
  assert.equal(body.datastore_failover_report.operator_mode, 'blob_queue_approval_only')
  assert.equal(body.datastore_failover_report.real_mrr_policy, 'zero_until_payment_proof')
  assert.ok(body.datastore_failover_report.safe_actions.includes('capture_leads'))
  assert.ok(body.datastore_failover_report.safe_actions.includes('run_action_runner'))
  assert.ok(body.datastore_failover_report.safe_actions.includes('start_private_workspace_after_payment_proof'))
  assert.ok(body.datastore_failover_report.blocked_actions.includes('claim_mrr_without_payment_proof'))
  assert.ok(body.datastore_failover_report.blocked_actions.includes('connector_writes_without_owner_acceptance'))
  assert.ok(body.datastore_failover_report.next_fix.includes('Provision'))
  assert.ok(body.operator_runtime_summary.includes('Blob fallback active'))
  assert.ok(body.operator_runtime_summary.includes('client onboarding allowed'))

  console.log(JSON.stringify({
    status: 'ready',
    audit: 'pipeline-control-failover-report',
    runtime_status: body.runtime_status,
    operator_mode: body.datastore_failover_report.operator_mode,
    client_onboarding_allowed: body.datastore_failover_report.client_onboarding_allowed,
    fallback_adapter: body.datastore_failover_report.fallback.adapter,
    real_mrr_policy: body.datastore_failover_report.real_mrr_policy,
  }, null, 2))
} finally {
  if (originalOpsKey === undefined) delete process.env.SUPERMEGA_OPS_KEY
  else process.env.SUPERMEGA_OPS_KEY = originalOpsKey
  datastore.postgresConfigured = originalPostgresConfigured
  datastore.datastoreStatus = originalDatastoreStatus
  blobQueue.pipelineSnapshot = originalPipelineSnapshot
  blobQueue.queueStatus = originalQueueStatus
}
