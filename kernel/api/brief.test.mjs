import { test } from 'node:test'
import assert from 'node:assert/strict'

import { runScheduledBrief } from './brief.mjs'

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

test('scheduled workcells deliver once and duplicate events do not resend', async () => {
  const sent = []
  const claims = new Map()
  const options = {
    env: { SUPERMEGA_WORKCELL_SLUGS: 'cash-close,owner-command', WORKCELL_CLIENT_NAME: 'Acme' },
    now: NOW,
    runWorkcell: async (slug) => workcell(slug),
    claimWorkcellDelivery: async (slug) => {
      if (claims.has(slug)) return { fresh: false, durable: true }
      claims.set(slug, true)
      return { fresh: true, durable: true }
    },
    notify: async (message) => { sent.push(message); return true },
  }
  const first = await runScheduledBrief(options)
  assert.equal(first.ok, true)
  assert.equal(sent.length, 2)
  const duplicate = await runScheduledBrief(options)
  assert.equal(duplicate.ok, true)
  assert.equal(duplicate.results.every((item) => item.duplicate), true)
  assert.equal(sent.length, 2)
})

test('scheduled delivery refuses to send without a durable idempotency claim', async () => {
  let sends = 0
  const result = await runScheduledBrief({
    env: { SUPERMEGA_WORKCELL_SLUG: 'cash-close' },
    now: NOW,
    runWorkcell: async (slug) => workcell(slug),
    claimWorkcellDelivery: async () => ({ fresh: true, durable: false }),
    notify: async () => { sends += 1; return true },
  })
  assert.equal(result.ok, false)
  assert.equal(result.results[0].reason, 'durable_delivery_claim_unavailable')
  assert.equal(sends, 0)
})

test('a failed owner send releases its claim so a manual retry can deliver', async () => {
  let claimed = false
  let attempts = 0
  let releases = 0
  const options = {
    env: { SUPERMEGA_WORKCELL_SLUG: 'cash-close' },
    now: NOW,
    runWorkcell: async (slug) => workcell(slug),
    claimWorkcellDelivery: async () => claimed
      ? { fresh: false, durable: true, claimId: 'workcell:test' }
      : (claimed = true, { fresh: true, durable: true, claimId: 'workcell:test' }),
    releaseWorkcellDelivery: async () => { claimed = false; releases += 1; return true },
    notify: async () => { attempts += 1; return attempts > 1 },
  }
  const failed = await runScheduledBrief(options)
  assert.equal(failed.ok, false)
  assert.equal(failed.results[0].reason, 'owner_delivery_failed')
  assert.equal(releases, 1)
  const retried = await runScheduledBrief(options)
  assert.equal(retried.ok, true)
  assert.equal(retried.results[0].sent, true)
  assert.equal(attempts, 2)
})

test('legacy CEO brief remains available and is also duplicate-safe', async () => {
  let sends = 0
  const result = await runScheduledBrief({
    env: {},
    now: NOW,
    runOperator: async () => ({ ok: true, answer: 'Real numbers', results: [{ tool: 'platform_status' }] }),
    claimWorkcellDelivery: async () => ({ fresh: false, durable: true }),
    notify: async () => { sends += 1; return true },
  })
  assert.equal(result.ok, true)
  assert.equal(result.mode, 'legacy')
  assert.equal(result.duplicate, true)
  assert.equal(sends, 0)
})
