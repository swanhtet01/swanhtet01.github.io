import { test } from 'node:test'
import assert from 'node:assert/strict'

import { handleOwnerEvidence } from './owner-evidence.mjs'

const NOW = new Date('2026-07-13T04:30:00.000Z')
const ENV = { SUPERMEGA_OPS_KEY: 'ops-secret' }
const HEADERS = { 'x-ops-key': 'ops-secret' }
const BODY = {
  source: 'line',
  reviewedBy: 'Swan',
  items: [{ at: '2026-07-13T04:00:00.000Z', text: 'Order 21 is ready.' }],
}

test('owner evidence API is ops-gated and fails closed when the inbox is not configured', async () => {
  const unauthorized = await handleOwnerEvidence({ method: 'GET', headers: {} }, { env: ENV })
  assert.equal(unauthorized.status, 401)
  const unavailable = await handleOwnerEvidence({ method: 'GET', headers: HEADERS }, { env: ENV, configured: () => false })
  assert.equal(unavailable.status, 200)
  assert.equal(unavailable.json.ok, true)
  assert.equal(unavailable.json.configured, false)
})

test('preview returns the exact reviewed payload without mutation', async () => {
  let writes = 0
  const result = await handleOwnerEvidence({ method: 'POST', headers: HEADERS, body: { command: 'preview', ...BODY } }, {
    env: ENV,
    now: NOW,
    configured: () => true,
    store: async () => { writes += 1 },
  })
  assert.equal(result.status, 200)
  assert.equal(result.json.mutation, false)
  assert.equal(result.json.items[0].text, 'Order 21 is ready.')
  assert.match(result.json.payloadHash, /^[a-f0-9]{64}$/)
  assert.equal(writes, 0)
  const extra = await handleOwnerEvidence({ method: 'POST', headers: HEADERS, body: { command: 'preview', ...BODY, credential: 'must-not-be-accepted' } }, {
    env: ENV, now: NOW, configured: () => true,
  })
  assert.equal(extra.status, 400)
  assert.equal(extra.json.reason, 'owner_evidence_invalid_payload')
})

test('store delegates only after a matching preview contract and never echoes evidence text', async () => {
  const preview = await handleOwnerEvidence({ method: 'POST', headers: HEADERS, body: { command: 'preview', ...BODY } }, {
    env: ENV,
    now: NOW,
    configured: () => true,
  })
  const stored = await handleOwnerEvidence({
    method: 'POST',
    headers: HEADERS,
    body: {
      command: 'store',
      ...BODY,
      payloadHash: preview.json.payloadHash,
      confirmation: preview.json.confirmation,
    },
  }, {
    env: ENV,
    now: NOW,
    configured: () => true,
    store: async (input) => {
      assert.equal(input.items[0].text, 'Order 21 is ready.')
      return {
        ok: true,
        payloadHash: input.payloadHash,
        stored: 1,
        duplicates: 0,
        evidence: [{ id: 'owner-evidence-1', source: 'line', at: BODY.items[0].at, fingerprint: 'a'.repeat(64), stored: true }],
      }
    },
  })
  assert.equal(stored.status, 200)
  assert.equal(stored.json.mutation, true)
  assert.doesNotMatch(JSON.stringify(stored.json), /Order 21 is ready/)
})

test('GET returns metadata only for the bounded seven-day operator view', async () => {
  const result = await handleOwnerEvidence({ method: 'GET', headers: HEADERS }, {
    env: ENV,
    now: NOW,
    configured: () => true,
    read: async (input) => {
      assert.equal(input.limit, 25)
      return {
        ok: true,
        updates: [{ evidenceId: 'e-1', source: 'viber', at: '2026-07-13T03:00:00Z', reviewedAt: '2026-07-13T04:00:00Z', fingerprint: 'b'.repeat(64), text: 'private' }],
      }
    },
  })
  assert.equal(result.status, 200)
  assert.equal(result.json.count, 1)
  assert.doesNotMatch(JSON.stringify(result.json), /private/)
})
