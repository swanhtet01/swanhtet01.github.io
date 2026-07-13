import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ownerEvidenceConfigured,
  previewOwnerEvidence,
  readOwnerEvidence,
  storeOwnerEvidence,
} from './owner-evidence.mjs'

const NOW = new Date('2026-07-13T04:30:00.000Z')
const ENV = {
  WORKCELL_OWNER_EVIDENCE_ENABLED: 'true',
  SUPABASE_URL: 'https://client-project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
}
const INPUT = {
  source: 'viber',
  reviewedBy: 'Swan',
  items: [{
    at: '2026-07-13T04:00:00.000Z',
    text: 'Sales 450000 MMK. Delivery moved to 4 PM.',
    sourceRef: 'viber-export-17',
  }],
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body },
  }
}

test('owner evidence requires the explicit feature flag and isolated Supabase service role', () => {
  assert.equal(ownerEvidenceConfigured(ENV), true)
  assert.equal(ownerEvidenceConfigured({ ...ENV, WORKCELL_OWNER_EVIDENCE_ENABLED: 'false' }), false)
  assert.equal(ownerEvidenceConfigured({ ...ENV, SUPABASE_SERVICE_ROLE_KEY: '' }), false)
  assert.equal(ownerEvidenceConfigured({ ...ENV, SUPABASE_URL: 'http://client-project.supabase.co' }), false)
  assert.equal(ownerEvidenceConfigured({ ...ENV, SUPABASE_URL: 'https://attacker.example.com' }), false)
})

test('owner evidence preview is canonical, bounded, and produces an exact confirmation', () => {
  const preview = previewOwnerEvidence(INPUT, { now: NOW })
  assert.match(preview.payloadHash, /^[a-f0-9]{64}$/)
  assert.equal(preview.confirmation, `STORE ${preview.payloadHash.slice(0, 12).toUpperCase()}`)
  assert.equal(preview.items[0].at, '2026-07-13T04:00:00.000Z')
  assert.match(preview.items[0].fingerprint, /^[a-f0-9]{64}$/)
  assert.throws(() => previewOwnerEvidence({ ...INPUT, source: 'telegram' }, { now: NOW }), /invalid_source/)
  assert.throws(() => previewOwnerEvidence({ ...INPUT, items: [{ ...INPUT.items[0], unexpected: true }] }, { now: NOW }), /invalid_item/)
  assert.throws(() => previewOwnerEvidence({ ...INPUT, items: [INPUT.items[0], INPUT.items[0]] }, { now: NOW }), /duplicate_item/)
  assert.throws(() => previewOwnerEvidence({ ...INPUT, items: [{ ...INPUT.items[0], at: '2030-01-01T00:00:00Z' }] }, { now: NOW }), /invalid_time/)
})

test('store requires the preview hash and confirmation before one immutable insert', async () => {
  const preview = previewOwnerEvidence(INPUT, { now: NOW })
  let calls = 0
  const fetch = async (url, options) => {
    calls += 1
    assert.equal(String(url), 'https://client-project.supabase.co/rest/v1/supermega_owner_evidence?on_conflict=fingerprint')
    assert.equal(options.method, 'POST')
    assert.match(options.headers.prefer, /ignore-duplicates/)
    assert.equal(options.headers.authorization, 'Bearer service-role-secret')
    const rows = JSON.parse(options.body)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].text, INPUT.items[0].text)
    assert.equal(rows[0].reviewed_by, 'Swan')
    return response(201, [{ fingerprint: rows[0].fingerprint }])
  }

  const rejected = await storeOwnerEvidence({ ...INPUT, payloadHash: preview.payloadHash, confirmation: 'STORE WRONG' }, { env: ENV, now: NOW, fetch })
  assert.equal(rejected.reason, 'owner_evidence_confirmation_required')
  assert.equal(calls, 0)

  const result = await storeOwnerEvidence({ ...INPUT, payloadHash: preview.payloadHash, confirmation: preview.confirmation }, { env: ENV, now: NOW, fetch })
  assert.equal(result.ok, true)
  assert.equal(result.stored, 1)
  assert.equal(result.duplicates, 0)
  assert.equal(calls, 1)
  assert.doesNotMatch(JSON.stringify(result), /450000|Delivery moved|service-role-secret/)
})

test('read is window-bounded, reduced, and hides database or provider errors', async () => {
  const calls = []
  const fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return response(200, [{
      id: 'owner-evidence-abc',
      source: 'line',
      source_ref: 'line-export-2',
      occurred_at: '2026-07-13T03:00:00.000Z',
      text: 'Factory stopped for one hour.',
      reviewed_by: 'Private Operator',
      reviewed_at: '2026-07-13T04:10:00.000Z',
      fingerprint: 'a'.repeat(64),
      unexpected_secret: 'do not return',
    }])
  }
  const result = await readOwnerEvidence({
    startDate: '2026-07-12T04:30:00.000Z',
    endDate: NOW.toISOString(),
    limit: 500,
  }, { env: ENV, fetch })
  assert.equal(result.ok, true)
  assert.equal(result.updates.length, 1)
  assert.deepEqual(Object.keys(result.updates[0]), ['evidenceId', 'source', 'sourceRef', 'at', 'text', 'reviewedAt', 'fingerprint'])
  assert.doesNotMatch(JSON.stringify(result), /Private Operator|unexpected_secret|do not return/)
  const url = new URL(calls[0].url)
  assert.equal(url.origin, 'https://client-project.supabase.co')
  assert.equal(url.pathname, '/rest/v1/supermega_owner_evidence')
  assert.equal(url.searchParams.get('limit'), '100')
  assert.equal(url.searchParams.getAll('occurred_at').length, 2)

  const failed = await readOwnerEvidence({ startDate: '2026-07-12T04:30:00Z', endDate: NOW.toISOString() }, {
    env: ENV,
    fetch: async () => response(500, { message: 'hostile database detail' }),
  })
  assert.deepEqual(failed, { ok: false, reason: 'owner_evidence_read_failed' })
})
