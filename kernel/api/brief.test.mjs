import { test } from 'node:test'
import assert from 'node:assert/strict'

import { runScheduledBrief } from './brief.mjs'
import { executionClaimId } from '../workcell-run.mjs'

const NOW = new Date('2026-07-13T01:30:00.000Z')

function workcell(slug) {
  return {
    ok: true,
    slug,
    name: slug,
    clientName: 'Acme',
    localDate: '2026-07-13',
    timeZone: 'Asia/Yangon',
    sources: [{ tool: 'read', items: 1 }],
    output: { headline: 'Ready', metrics: [], priorities: [], exceptions: [], owner_action: 'Act' },
  }
}

function durableClaimStore(prefix) {
  const claims = new Set()
  return {
    claim: async (slug) => {
      const claimId = `${prefix}:${slug}`
      if (claims.has(claimId)) return { fresh: false, durable: true, claimId }
      claims.add(claimId)
      return { fresh: true, durable: true, claimId }
    },
    release: async (claim) => claims.delete(claim?.claimId),
  }
}

test('scheduled workcells deliver once and duplicate events do not resend', async () => {
  const sent = []
  const executions = durableClaimStore('execution')
  const deliveries = durableClaimStore('delivery')
  let runs = 0
  const options = {
    env: { SUPERMEGA_WORKCELL_SLUGS: 'cash-close,owner-command', WORKCELL_CLIENT_NAME: 'Acme' },
    now: NOW,
    runWorkcell: async (slug) => { runs += 1; return workcell(slug) },
    claimWorkcellExecution: executions.claim,
    claimWorkcellDelivery: deliveries.claim,
    releaseWorkcellDelivery: async (claim) => (await executions.release(claim)) || deliveries.release(claim),
    notify: async (message) => { sent.push(message); return true },
  }
  const first = await runScheduledBrief(options)
  assert.equal(first.ok, true)
  assert.equal(sent.length, 2)
  const duplicate = await runScheduledBrief(options)
  assert.equal(duplicate.ok, true)
  assert.equal(duplicate.results.every((item) => item.duplicate), true)
  assert.equal(sent.length, 2)
  assert.equal(runs, 2)
  assert.equal((sent[0].match(/Owner action:/g) || []).length, 1)
})

test('execution admission is stable only within one client, workcell, and UTC hour', () => {
  const config = { clientId: 'acme', localDate: '2026-07-13' }
  const first = executionClaimId('cash-close', config, new Date('2026-07-13T01:05:00.000Z'))
  assert.equal(first, executionClaimId('cash-close', config, new Date('2026-07-13T01:59:59.999Z')))
  assert.notEqual(first, executionClaimId('cash-close', config, new Date('2026-07-13T02:00:00.000Z')))
  assert.notEqual(first, executionClaimId('owner-command', config, new Date('2026-07-13T01:05:00.000Z')))
  assert.notEqual(first, executionClaimId('cash-close', { ...config, clientId: 'other' }, new Date('2026-07-13T01:05:00.000Z')))
})

test('scheduled delivery refuses to send without a durable idempotency claim', async () => {
  let sends = 0
  let runs = 0
  const result = await runScheduledBrief({
    env: { SUPERMEGA_WORKCELL_SLUG: 'cash-close' },
    now: NOW,
    runWorkcell: async (slug) => { runs += 1; return workcell(slug) },
    claimWorkcellExecution: async () => ({ fresh: true, durable: false }),
    claimWorkcellDelivery: async () => ({ fresh: true, durable: true }),
    notify: async () => { sends += 1; return true },
  })
  assert.equal(result.ok, false)
  assert.equal(result.results[0].reason, 'durable_execution_claim_unavailable')
  assert.equal(sends, 0)
  assert.equal(runs, 0)
})

test('execution claim storage errors fail closed before work begins', async () => {
  let runs = 0
  let sends = 0
  const result = await runScheduledBrief({
    env: { SUPERMEGA_WORKCELL_SLUG: 'cash-close' },
    now: NOW,
    runWorkcell: async (slug) => { runs += 1; return workcell(slug) },
    claimWorkcellExecution: async () => { throw new Error('private storage detail') },
    notify: async () => { sends += 1; return true },
  })
  assert.equal(result.ok, false)
  assert.equal(result.results[0].reason, 'durable_execution_claim_unavailable')
  assert.equal(runs, 0)
  assert.equal(sends, 0)
  assert.doesNotMatch(JSON.stringify(result), /private storage detail/)
})

test('concurrent cron deliveries claim before running expensive work', async () => {
  let claimed = false
  let runs = 0
  let sends = 0
  const options = {
    env: { SUPERMEGA_WORKCELL_SLUG: 'cash-close' },
    now: NOW,
    runWorkcell: async (slug) => { runs += 1; await new Promise((resolve) => setTimeout(resolve, 5)); return workcell(slug) },
    claimWorkcellExecution: async () => claimed
      ? { fresh: false, durable: true, claimId: 'workcell:test' }
      : (claimed = true, { fresh: true, durable: true, claimId: 'workcell:test' }),
    claimWorkcellDelivery: async () => ({ fresh: true, durable: true, claimId: 'delivery:test' }),
    notify: async () => { sends += 1; return true },
  }
  const results = await Promise.all([runScheduledBrief(options), runScheduledBrief(options)])
  assert.equal(results.every((result) => result.ok), true)
  assert.equal(results.some((result) => result.results[0].duplicate), true)
  assert.equal(runs, 1)
  assert.equal(sends, 1)
})

test('a failed owner send releases its claim so a manual retry can deliver', async () => {
  const executions = durableClaimStore('execution')
  const deliveries = durableClaimStore('delivery')
  let attempts = 0
  let releases = 0
  const options = {
    env: { SUPERMEGA_WORKCELL_SLUG: 'cash-close' },
    now: NOW,
    runWorkcell: async (slug) => workcell(slug),
    claimWorkcellExecution: executions.claim,
    claimWorkcellDelivery: deliveries.claim,
    releaseWorkcellDelivery: async (claim) => {
      releases += 1
      return (await executions.release(claim)) || deliveries.release(claim)
    },
    notify: async () => { attempts += 1; return attempts > 1 },
  }
  const failed = await runScheduledBrief(options)
  assert.equal(failed.ok, false)
  assert.equal(failed.results[0].reason, 'owner_delivery_failed')
  assert.equal(failed.results[0].retryable, true)
  assert.equal(releases, 2)
  const retried = await runScheduledBrief(options)
  assert.equal(retried.ok, true)
  assert.equal(retried.results[0].sent, true)
  assert.equal(attempts, 2)
})

test('failed computation releases only the execution claim for an immediate retry', async () => {
  const executions = durableClaimStore('execution')
  const deliveries = durableClaimStore('delivery')
  let runs = 0
  let sends = 0
  const options = {
    env: { SUPERMEGA_WORKCELL_SLUG: 'cash-close' },
    now: NOW,
    runWorkcell: async (slug) => {
      runs += 1
      return runs === 1 ? { ok: false, slug, reason: 'workcell_source_failed' } : workcell(slug)
    },
    claimWorkcellExecution: executions.claim,
    claimWorkcellDelivery: deliveries.claim,
    releaseWorkcellDelivery: async (claim) => (await executions.release(claim)) || deliveries.release(claim),
    notify: async () => { sends += 1; return true },
  }
  const failed = await runScheduledBrief(options)
  assert.equal(failed.ok, false)
  assert.equal(failed.results[0].retryable, true)
  const retried = await runScheduledBrief(options)
  assert.equal(retried.ok, true)
  assert.equal(runs, 2)
  assert.equal(sends, 1)
})

test('legacy CEO brief remains available and is also duplicate-safe', async () => {
  let sends = 0
  let runs = 0
  const result = await runScheduledBrief({
    env: {},
    now: NOW,
    runOperator: async () => { runs += 1; return { ok: true, answer: 'Real numbers', results: [{ tool: 'platform_status' }] } },
    claimWorkcellExecution: async () => ({ fresh: false, durable: true }),
    claimWorkcellDelivery: async () => ({ fresh: false, durable: true }),
    notify: async () => { sends += 1; return true },
  })
  assert.equal(result.ok, true)
  assert.equal(result.mode, 'legacy')
  assert.equal(result.duplicate, true)
  assert.equal(sends, 0)
  assert.equal(runs, 0)
})
