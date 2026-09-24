import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const path = require.resolve(resolve('.vercel/output/functions/api/contact-submissions.js.func/index.js'))
const fresh = () => { delete require.cache[path]; return require(path) }
const names = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPERMEGA_CONTACT_IDEMPOTENCY_SECRET', 'RESEND_API_KEY', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'SUPERMEGA_LEAD_WEBHOOK_URL']
const saved = Object.fromEntries(names.map(name => [name, process.env[name]]))
const originalFetch = globalThis.fetch
const body = { name: 'Synthetic', company: 'Synthetic', email: 'test@example.com', product: 'shop', goal: 'x'.repeat(4000), source_url: 'https://url-user:url-password@supermega.dev/contact/?token=private-query&email=private-contact#private-fragment', referrer: 'data:text/plain,private-referrer' }
async function invoke(method = 'POST') {
  const res = { statusCode: 0, setHeader() {}, end(value) { this.body = JSON.parse(value) } }
  await fresh()({ method, body, headers: { host: 'supermega.dev', origin: 'https://supermega.dev', 'content-type': 'application/json', 'x-idempotency-key': 'durable-retention-test-0001' } }, res)
  return res
}
try {
  for (const name of names) delete process.env[name]
  process.env.SUPERMEGA_CONTACT_IDEMPOTENCY_SECRET = 'synthetic-contact-secret-not-operating-0001'
  process.env.TELEGRAM_BOT_TOKEN = 'synthetic'
  process.env.TELEGRAM_CHAT_ID = 'synthetic'
  let calls = 0
  globalThis.fetch = async () => { calls++; throw new Error('network must not be used') }
  for (const partial of ['missing', 'url', 'key']) {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    if (partial === 'url') process.env.SUPABASE_URL = 'https://store.example.test'
    if (partial === 'key') process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic'
    assert.equal((await invoke('GET')).body.accepting, false)
    const rejected = await invoke()
    assert.equal(rejected.statusCode, 503)
    assert.equal(rejected.body.reason, 'contact_persistence_unavailable')
  }
  assert.equal(calls, 0)
  process.env.SUPABASE_URL = 'https://store.example.test'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic'
  let retained, notificationBody, notificationUrl, notifications = 0
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('https://store.example.test/')) {
      let rows
      if (options.method === 'POST') {
        rows = retained ? [] : [JSON.parse(options.body)]
        retained ||= rows[0]
      } else rows = [retained]
      return { ok: true, status: 200, json: async () => rows }
    }
    notifications++
    notificationBody = JSON.parse(options.body)
    notificationUrl = String(url)
    throw new Error('notification response lost after simulated acceptance')
  }
  const accepted = await invoke()
  assert.equal(accepted.statusCode, 202)
  assert.equal(retained.goal, body.goal, 'complete brief survives truncated notification')
  assert.equal(retained.source_url, 'https://supermega.dev/contact/')
  assert.equal(retained.page_path, '/contact/')
  assert.equal(retained.referrer, '')
  assert.doesNotMatch(JSON.stringify(retained), /url-user|url-password|private-query|private-contact|private-fragment|private-referrer/)
  assert.doesNotMatch(JSON.stringify(notificationBody), /url-user|url-password|private-query|private-contact|private-fragment|private-referrer/)
  assert.equal(notifications, 1)
  assert.ok(notificationUrl.startsWith('https://api.telegram.org/'))
  assert.equal(notificationBody.text.length, 3900)
  assert.equal(notificationBody.text.includes(body.goal), false)
  const replay = await invoke()
  assert.deepEqual(replay.body, accepted.body)
  assert.equal(notifications, 1, 'cold retry must not repeat ambiguous notification')
  const ambiguousCases = [
    { insert: null },
    { insert: [retained, retained] },
    { insert: [{ ...retained, lead_id: 'LEAD-WRONG' }] },
    { insert: [], lookup: [] },
    { insert: [], lookup: [retained, retained] },
    { insert: [], lookup: [{ ...retained, lead_id: 'LEAD-WRONG' }] },
  ]
  for (const candidate of ambiguousCases) {
    let lookupCount = 0
    globalThis.fetch = async (url, options) => {
      assert.ok(String(url).startsWith('https://store.example.test/'), 'ambiguous storage must never notify')
      const rows = options.method === 'POST' ? candidate.insert : (lookupCount++, candidate.lookup)
      return { ok: true, status: 200, json: async () => rows }
    }
    const rejected = await invoke()
    assert.equal(rejected.statusCode, 503)
    assert.equal(rejected.body.reason, 'contact_persistence_unavailable')
    assert.equal(rejected.body.request_id, undefined)
    assert.equal(lookupCount, candidate.lookup === undefined ? 0 : 1)
  }
  console.log(JSON.stringify({ ok: true, evidence: 'local_mocked_not_hosted', partialConfigCases: 3, ambiguousStorageCases: ambiguousCases.length, completeBriefRetained: true, coldRetryNoRenotify: true }))
} finally {
  globalThis.fetch = originalFetch
  for (const name of names) {
    if (saved[name] === undefined) delete process.env[name]
    else process.env[name] = saved[name]
  }
}
