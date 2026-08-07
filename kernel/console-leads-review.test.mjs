// Founder lead-review surface: fail-closed without a configured leads source, review decisions
// recorded as tenant-scoped control records, and zero outbound/lead-mutating side effects.
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import realStore from './store.mjs'
import {
  LEAD_REVIEW_RECORD_PREFIX,
  LEADS_REVIEW_TENANT,
  LEADS_SOURCE_REQUIRED_ENV,
  leadReviewRecordKey,
  leadsSourceConfigured,
  listLeadsForReview,
  markLeadReviewed,
} from './console/leads-review.mjs'

const HASH_RE = /^[a-f0-9]{64}$/

const LEADS = [
  { id: 'lead-1', lead_id: 'lead-1', source: 'website', name: 'Aye', company: 'Alpha Co', contact: 'aye@example.com', package: 'build', message: 'Automate intake', score: 80, stage: 'new', created_at: '2026-08-01T00:00:00.000Z' },
  { id: 'lead-2', lead_id: 'lead-2', source: 'website', name: 'Ba', company: 'Beta Co', contact: 'ba@example.com', package: 'dashboard', message: 'Dashboard', score: 60, stage: 'qualified', created_at: '2026-08-02T00:00:00.000Z' },
]

function fakeStore({ leads = LEADS, converted = [], mode = 'supabase', putResult = true } = {}) {
  const controlRecords = new Map()
  const calls = []
  return {
    mode,
    calls,
    controlRecords,
    async listLeads(limit) { calls.push('listLeads'); return leads.slice(0, limit) },
    async getLead(id) { calls.push('getLead'); return leads.find((l) => l.id === id) || null },
    async convertedLeadIds() { calls.push('convertedLeadIds'); return converted },
    async listControlRecords({ prefix, clientId, status, limit }) {
      calls.push('listControlRecords')
      const records = [...controlRecords.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, payload]) => ({ key, payload }))
        .filter((record) => (!clientId || record.payload.clientId === clientId)
          && (!status || record.payload.status === status))
        .slice(0, limit)
      return { durable: true, records }
    },
    async getControlRecord(key) { calls.push('getControlRecord'); return controlRecords.get(key) || null },
    async putControlRecord(key, payload) {
      calls.push('putControlRecord')
      if (!putResult) return false
      controlRecords.set(key, payload)
      return true
    },
    // The review surface is read + record only. Any of these firing is a defect.
    async updateLead() { throw new Error('updateLead_must_not_be_called') },
    async insertLead() { throw new Error('insertLead_must_not_be_called') },
    async saveDeal() { throw new Error('saveDeal_must_not_be_called') },
  }
}

test('leads review fails closed when no durable leads source is configured', async () => {
  assert.equal(realStore.mode, 'memory', 'these tests must run without database credentials')
  assert.equal(leadsSourceConfigured(realStore), false)

  const list = await listLeadsForReview({}, realStore)
  assert.equal(list.ok, false)
  assert.equal(list.reason, 'leads_source_not_configured')
  assert.deepEqual(list.requiredEnv, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
  assert.deepEqual(list.requiredEnv, [...LEADS_SOURCE_REQUIRED_ENV])
  assert.equal('leads' in list, false, 'fail-closed responses must not carry a leads list')

  const mark = await markLeadReviewed({ leadId: 'lead-1' }, realStore)
  assert.equal(mark.ok, false)
  assert.equal(mark.reason, 'leads_source_not_configured')
})

test('configured source lists recent leads with converted + reviewed state', async () => {
  const store = fakeStore({ converted: ['lead-2'] })
  const first = await listLeadsForReview({ limit: 10 }, store)
  assert.equal(first.ok, true)
  assert.equal(first.source, 'configured')
  assert.equal(first.leads.length, 2)
  assert.deepEqual(first.leads.map((l) => l.reviewed), [false, false])
  assert.equal(first.leads[1].converted, true)

  const marked = await markLeadReviewed({ leadId: 'lead-1', reviewedBy: 'founder' }, store, () => '2026-08-07T10:00:00.000Z')
  assert.equal(marked.ok, true)
  assert.equal(marked.replayed, false)

  const second = await listLeadsForReview({ limit: 10 }, store)
  const lead1 = second.leads.find((l) => l.id === 'lead-1')
  assert.equal(lead1.reviewed, true)
  assert.deepEqual(Object.keys(lead1.review).sort(), ['leadId', 'reviewHash', 'reviewedAt', 'reviewedBy'])
  assert.equal(lead1.review.reviewedBy, 'founder')
  assert.equal(lead1.review.reviewedAt, '2026-08-07T10:00:00.000Z')
  assert.match(lead1.review.reviewHash, HASH_RE)
  assert.equal(second.leads.find((l) => l.id === 'lead-2').reviewed, false)
})

test('review records are tenant-scoped: a foreign-tenant record never marks a lead reviewed', async () => {
  const store = fakeStore()
  store.controlRecords.set(leadReviewRecordKey('lead-2'), {
    version: 1, status: 'reviewed', leadId: 'lead-2', clientId: 'some-other-tenant',
    reviewedBy: 'intruder', reviewedAt: '2026-08-07T00:00:00.000Z', reviewHash: 'a'.repeat(64),
  })
  const list = await listLeadsForReview({}, store)
  assert.equal(list.leads.find((l) => l.id === 'lead-2').reviewed, false)

  const mark = await markLeadReviewed({ leadId: 'lead-2' }, store)
  assert.equal(mark.ok, false)
  assert.equal(mark.reason, 'lead_review_conflict')
})

test('mark-reviewed stores a well-formed lead_review control record and is idempotent', async () => {
  const store = fakeStore()
  const result = await markLeadReviewed({ leadId: 'lead-1', reviewedBy: 'founder' }, store, () => '2026-08-07T10:00:00.000Z')
  assert.equal(result.ok, true)

  const stored = store.controlRecords.get(leadReviewRecordKey('lead-1'))
  assert.ok(stored, 'record stored under console-lead-review-record:<lead_id>')
  assert.equal(stored.status, 'reviewed')
  assert.equal(stored.clientId, LEADS_REVIEW_TENANT)
  assert.equal(stored.leadId, 'lead-1')
  assert.equal(stored.version, 1)
  assert.match(stored.reviewHash, HASH_RE)
  assert.match(stored.leadHash, HASH_RE)

  const replay = await markLeadReviewed({ leadId: 'lead-1', reviewedBy: 'founder' }, store)
  assert.equal(replay.ok, true)
  assert.equal(replay.replayed, true)
  assert.deepEqual(replay.review, { leadId: 'lead-1', reviewedBy: 'founder', reviewedAt: '2026-08-07T10:00:00.000Z', reviewHash: stored.reviewHash })
  assert.equal(store.calls.filter((name) => name === 'putControlRecord').length, 1, 'replay must not write again')
})

test('mark-reviewed validates input and surfaces store failures without side effects', async () => {
  const store = fakeStore()
  assert.equal((await markLeadReviewed({ leadId: '' }, store)).reason, 'invalid_lead_id')
  assert.equal((await markLeadReviewed({ leadId: '../escape' }, store)).reason, 'invalid_lead_id')
  assert.equal((await markLeadReviewed({ leadId: 'lead-1', reviewedBy: '<script>' }, store)).reason, 'invalid_reviewer')
  assert.equal(store.calls.length, 0, 'invalid input must fail before any store access')

  assert.equal((await markLeadReviewed({ leadId: 'lead-404' }, store)).reason, 'lead_not_found')

  const failing = fakeStore({ putResult: false })
  const blocked = await markLeadReviewed({ leadId: 'lead-1' }, failing)
  assert.equal(blocked.ok, false)
  assert.equal(blocked.reason, 'lead_review_store_unavailable')
})

test('store routes lead-review keys into the control-record store, never the response cache', async () => {
  const key = leadReviewRecordKey('routing-check')
  const reviewHash = 'b'.repeat(64)
  const payload = {
    version: 1, status: 'reviewed', leadId: 'routing-check', clientId: LEADS_REVIEW_TENANT,
    reviewedBy: 'founder', reviewedAt: '2026-08-07T10:00:00.000Z', reviewHash,
  }
  assert.equal(await realStore.putControlRecord(key, payload), true)
  assert.deepEqual(await realStore.getControlRecord(key), payload)
  assert.equal(await realStore.getResponseCache(key), null, 'authority keys must never resolve from the AI cache')
  assert.deepEqual(await realStore.getCachedResponse(key), payload, 'compatibility adapter must route the prefix to the control store')
})

test('console API exposes the review surface behind the ops key and fails closed in memory mode', async () => {
  const savedKey = { present: Object.hasOwn(process.env, 'SUPERMEGA_OPS_KEY'), value: process.env.SUPERMEGA_OPS_KEY }
  try {
    process.env.SUPERMEGA_OPS_KEY = 'leads-review-test-key'
    const { handle } = await import(`./console/api.mjs?leads-review=${Date.now()}`)

    const unauthorized = await handle({ method: 'GET', path: '/api/leads/review', headers: {} })
    assert.equal(unauthorized.status, 401)

    const headers = { 'x-ops-key': 'leads-review-test-key' }
    const list = await handle({ method: 'GET', path: '/api/leads/review', headers })
    assert.equal(list.status, 503)
    assert.equal(list.json.reason, 'leads_source_not_configured')
    assert.deepEqual(list.json.requiredEnv, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])

    const mark = await handle({ method: 'POST', path: '/api/leads/lead-1/review', headers, body: {} })
    assert.equal(mark.status, 503)
    assert.equal(mark.json.reason, 'leads_source_not_configured')
  } finally {
    if (savedKey.present) process.env.SUPERMEGA_OPS_KEY = savedKey.value
    else delete process.env.SUPERMEGA_OPS_KEY
  }
})

test('console UI wires the review surface: fail-closed banner, reviewed pill, mark-reviewed action', async () => {
  const html = await readFile(new URL('./public/index.html', import.meta.url), 'utf8')
  assert.match(html, /api\('GET','\/api\/leads\/review'\)/)
  assert.match(html, /leads_source_not_configured/)
  assert.match(html, /SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(html, /data-review="\$\{esc\(l\.id\)\}">Mark reviewed<\/button>/)
  assert.match(html, /✓ reviewed/)
  assert.match(html, /'\/api\/leads\/'\+encodeURIComponent\(b\.dataset\.review\)\+'\/review'/)
})

test('lead_review is registered across store, SQL migration, and gateway isolation', async () => {
  const storeSource = await readFile(new URL('./store.mjs', import.meta.url), 'utf8')
  assert.match(storeSource, /\['console-lead-review-record:', 'lead_review'\]/)
  assert.match(storeSource, /supermega_control_records_type_check check \(record_type in \([^)]*'lead_review'\)\)/)

  const migration = await readFile(new URL('./supabase/control-records-migration.sql', import.meta.url), 'utf8')
  const occurrences = migration.match(/'lead_review'/g) || []
  assert.equal(occurrences.length, 2, 'both the create-table constraint and the widen block must allow lead_review')
  assert.match(migration, /not like '%lead_review%'/)

  const gatewaySource = await readFile(new URL('./gateway.mjs', import.meta.url), 'utf8')
  assert.match(gatewaySource, /'console-lead-review-record:',/)
})
