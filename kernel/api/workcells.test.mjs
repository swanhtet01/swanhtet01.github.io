import { test } from 'node:test'
import assert from 'node:assert/strict'

import { handleWorkcells } from './workcells.mjs'

const KEY = 'ops-secret-0123456789abcdef012345'
const headers = { 'x-ops-key': KEY }
const env = {
  SUPERMEGA_OPS_KEY: KEY,
  WORKCELL_CLIENT_NAME: 'Acme Trading',
  WORKCELL_CLIENT_ID: 'workcell-acme-trading',
  WORKCELL_CLICKUP_LIST_ID: '12345',
  SUPERMEGA_WORKCELL_SLUG: 'cash-close',
}
const availableTools = () => [
  { name: 'settled_transactions_read' },
  { name: 'crm_deals_read' },
  { name: 'work_tasks_read' },
  { name: 'owner_updates_read' },
]

test('workcell API fails closed and exposes readiness only behind the ops key', async () => {
  assert.equal((await handleWorkcells({ method: 'GET' }, { env: {} })).status, 503)
  assert.equal((await handleWorkcells({ method: 'GET', headers: { 'x-ops-key': 'wrong' } }, { env })).status, 401)
  const result = await handleWorkcells({ method: 'GET', headers }, { env, availableTools })
  assert.equal(result.status, 200)
  assert.equal(result.json.isolation, 'one_client_per_deployment')
  assert.equal(result.json.workcells.length, 3)
  assert.equal(result.json.workcells.find((item) => item.slug === 'cash-close').configured, true)
  assert.equal(result.json.workcells.find((item) => item.slug === 'cash-close').actionDraftSupported, false)
  assert.equal(result.json.workcells.find((item) => item.slug === 'owner-command').actionDraftSupported, true)
  assert.equal(result.json.workcells.find((item) => item.slug === 'owner-command').actionDraftReady, true)
  assert.equal(result.json.schedule.configuredSlugs[0], 'cash-close')

  const noClickUp = await handleWorkcells(
    { method: 'GET', headers },
    { env: { ...env, WORKCELL_CLICKUP_LIST_ID: '' }, availableTools },
  )
  const owner = noClickUp.json.workcells.find((item) => item.slug === 'owner-command')
  assert.equal(owner.configured, true)
  assert.equal(owner.actionDraftSupported, true)
  assert.equal(owner.actionDraftReady, false)
  assert.deepEqual(owner.missing, [])
})

test('workcell API queues an immutable action only when the owner explicitly requests it', async () => {
  const created = []
  const runWorkcell = async (slug) => ({
    ok: true,
    slug,
    name: slug === 'owner-command' ? 'Owner Command' : 'Cash Close',
    clientName: 'Acme Trading',
    localDate: '2026-07-13',
    timeZone: 'Asia/Yangon',
    sources: [{ tool: 'work_tasks_read', items: 3 }],
    output: {
      headline: 'Deal 42 needs follow-up.', metrics: [], exceptions: [],
      priorities: [{ title: 'Deal 42', evidence: 'No current task', next_action: 'Call buyer' }],
      owner_action: 'Call the Deal 42 buyer',
    },
  })
  const noQueue = await handleWorkcells(
    { method: 'POST', headers, body: { slug: 'owner-command' } },
    { env, runWorkcell, createActionDraft: async (draft) => { created.push(draft); return { ok: true } } },
  )
  assert.equal(noQueue.json.approvalQueue.requested, false)
  assert.equal(created.length, 0)

  const queued = await handleWorkcells(
    { method: 'POST', headers, body: { slug: 'owner-command', queueAction: true, clientId: 'attacker-client' } },
    {
      env,
      runWorkcell,
      createActionDraft: async (draft) => {
        created.push(draft)
        return { ok: true, approval: { id: 'approval-1', status: 'draft', payloadHash: 'frozen-hash' } }
      },
    },
  )
  assert.equal(queued.status, 200)
  assert.equal(queued.json.approvalQueue.ok, true)
  assert.equal(created[0].clientId, 'workcell-acme-trading')
  assert.equal(created[0].payload.list_id, '12345')
  assert.equal(created[0].payload.name, 'Call the Deal 42 buyer')

  const unsupported = await handleWorkcells(
    { method: 'POST', headers, body: { slug: 'cash-close', queueAction: true } },
    { env, runWorkcell, createActionDraft: async () => { throw new Error('must not run') } },
  )
  assert.equal(unsupported.status, 200)
  assert.equal(unsupported.json.approvalQueue.reason, 'workcell_action_draft_not_available')

  const storeUnavailable = await handleWorkcells(
    { method: 'POST', headers, body: { slug: 'owner-command', queueAction: true } },
    { env, runWorkcell, createActionDraft: async () => ({ ok: false, reason: 'approval_store_unavailable' }) },
  )
  assert.equal(storeUnavailable.status, 200)
  assert.equal(storeUnavailable.json.ok, true)
  assert.equal(storeUnavailable.json.approvalQueue.reason, 'approval_store_unavailable')
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
    { env, runWorkcell: async (slug) => ({ ok: false, slug, reason: 'workcell_not_ready', missing: ['tool:owner_updates_read'] }) },
  )
  assert.equal(notReady.status, 409)
  assert.equal(notReady.json.ok, false)
  assert.deepEqual(notReady.json.missing, ['tool:owner_updates_read'])

  const failed = await handleWorkcells(
    { method: 'POST', headers, body: { slug: 'cash-close' } },
    { env, runWorkcell: async (slug) => ({ ok: false, slug, reason: 'workcell_source_failed', source: 'settled_transactions_read' }) },
  )
  assert.equal(failed.status, 502)
})
