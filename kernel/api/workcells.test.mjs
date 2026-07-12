import { test } from 'node:test'
import assert from 'node:assert/strict'

import { handleWorkcells } from './workcells.mjs'

const KEY = 'ops-secret'
const headers = { 'x-ops-key': KEY }
const env = {
  SUPERMEGA_OPS_KEY: KEY,
  WORKCELL_CLIENT_NAME: 'Acme Trading',
  WORKCELL_CLICKUP_LIST_ID: '12345',
  SUPERMEGA_WORKCELL_SLUG: 'cash-close',
}
const availableTools = () => [
  { name: 'settled_transactions_read' },
  { name: 'crm_deals_read' },
  { name: 'work_tasks_read' },
]

test('workcell API fails closed and exposes readiness only behind the ops key', async () => {
  assert.equal((await handleWorkcells({ method: 'GET' }, { env: {} })).status, 503)
  assert.equal((await handleWorkcells({ method: 'GET', headers: { 'x-ops-key': 'wrong' } }, { env })).status, 401)
  const result = await handleWorkcells({ method: 'GET', headers }, { env, availableTools })
  assert.equal(result.status, 200)
  assert.equal(result.json.isolation, 'one_client_per_deployment')
  assert.equal(result.json.workcells.length, 3)
  assert.equal(result.json.workcells.find((item) => item.slug === 'cash-close').configured, true)
  assert.equal(result.json.schedule.configuredSlugs[0], 'cash-close')
})

test('workcell API runs a fixed product and delivers only when explicitly requested', async () => {
  const deliveries = []
  const runWorkcell = async (slug) => ({
    ok: true,
    slug,
    name: 'Cash Close',
    clientName: 'Acme Trading',
    localDate: '2026-07-13',
    timeZone: 'Asia/Yangon',
    sources: [{ tool: 'settled_transactions_read', items: 3 }],
    output: { headline: 'Closed', metrics: [], priorities: [], exceptions: [], owner_action: 'None' },
  })
  const preview = await handleWorkcells(
    { method: 'POST', headers, body: { slug: 'cash-close' } },
    { env, runWorkcell, notify: async (message) => { deliveries.push(message); return true } },
  )
  assert.equal(preview.status, 200)
  assert.equal(preview.json.delivery.requested, false)
  assert.equal(deliveries.length, 0)

  const delivered = await handleWorkcells(
    { method: 'POST', headers, body: { slug: 'cash-close', deliver: true } },
    { env, runWorkcell, notify: async (message) => { deliveries.push(message); return true } },
  )
  assert.equal(delivered.json.delivery.sent, true)
  assert.equal(deliveries.length, 1)
})

test('workcell API preserves readiness and source failures as non-success responses', async () => {
  const notReady = await handleWorkcells(
    { method: 'POST', headers, body: { slug: 'owner-command' } },
    { env, runWorkcell: async (slug) => ({ ok: false, slug, reason: 'workcell_not_ready', missing: ['tool:crm_deals_read'] }) },
  )
  assert.equal(notReady.status, 409)
  assert.equal(notReady.json.ok, false)
  assert.deepEqual(notReady.json.missing, ['tool:crm_deals_read'])

  const failed = await handleWorkcells(
    { method: 'POST', headers, body: { slug: 'cash-close' } },
    { env, runWorkcell: async (slug) => ({ ok: false, slug, reason: 'workcell_source_failed', source: 'settled_transactions_read' }) },
  )
  assert.equal(failed.status, 502)
})
