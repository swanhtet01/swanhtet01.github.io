import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const handler = require('../api/action-runner.js')

function fail(message, extra = {}) {
  console.error(JSON.stringify({ status: 'error', message, ...extra }, null, 2))
  process.exit(1)
}

const internals = handler.__test || {}
for (const name of ['claimPostgresBatch', 'updatePostgresAction', 'fetchPostgresLead', 'claimSupabaseBatch', 'blobStore']) {
  if (typeof internals[name] !== 'function') {
    fail('action_runner_queue_helper_missing', { name })
  }
}

const claimSource = internals.claimPostgresBatch.toString()
for (const token of [
  'public.supermega_pipeline_actions',
  'for update skip locked',
  'payload',
  'result',
  'vercel_postgres_neon',
]) {
  assert.ok(claimSource.includes(token), `postgres claim missing ${token}`)
}

const updateSource = internals.updatePostgresAction.toString()
for (const token of ['status = $2', 'result = $3::jsonb', 'processed_at = $4::timestamptz', 'error = $5']) {
  assert.ok(updateSource.includes(token), `postgres update missing ${token}`)
}

const fetchSource = internals.fetchPostgresLead.toString()
for (const token of ['public.supermega_leads', 'lead_id = $1', 'name, email, company, goal, workflow']) {
  assert.ok(fetchSource.includes(token), `postgres lead fetch missing ${token}`)
}

const handlerSource = readFileSync('api/action-runner.js', 'utf8')
for (const token of ['blobStore()', 'vercel_blob', 'claimBatch(fallback)']) {
  assert.ok(handlerSource.includes(token), `action runner blob fallback missing ${token}`)
}

console.log(
  JSON.stringify(
    {
      status: 'ready',
      contract: 'action_runner_postgres_queue',
      primary_adapter: 'vercel_postgres_neon',
      fallback_adapter: 'supabase_rest',
      durable_blob_fallback: 'vercel_blob',
    },
    null,
    2,
  ),
)
