import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const handlerPath = resolve('.vercel', 'output', 'functions', 'api', 'contact-submissions.js.func', 'index.js')
const handler = require(handlerPath)

const environmentNames = [
  'SUPERMEGA_CONTACT_IDEMPOTENCY_SECRET',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
  'SUPERMEGA_LEAD_WEBHOOK_URL',
  'SUPERMEGA_LEAD_WEBHOOK_SECRET',
]
const savedEnvironment = Object.fromEntries(environmentNames.map((name) => [name, process.env[name]]))
const originalFetch = globalThis.fetch

function clearChannels() {
  for (const name of environmentNames) delete process.env[name]
}

function responseRecorder() {
  return {
    statusCode: 0,
    headers: {},
    payload: '',
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = String(value)
    },
    end(value = '') {
      this.payload = String(value)
    },
  }
}

async function invoke({ method = 'POST', body = {}, headers = {} } = {}) {
  const req = {
    method,
    body,
    headers: {
      'content-type': 'application/json',
      host: 'supermega.dev',
      origin: 'https://supermega.dev',
      'x-forwarded-for': '203.0.113.10',
      ...headers,
    },
  }
  const res = responseRecorder()
  await handler(req, res)
  return { status: res.statusCode, headers: res.headers, body: JSON.parse(res.payload || '{}') }
}

const requestKey = (value) => `contact-test-key-${String(value).padStart(6, '0')}`
const withKey = (value, headers = {}) => ({ 'x-idempotency-key': requestKey(value), ...headers })

const validSubmission = {
  name: 'Trial Operator',
  email: 'operator@example.com',
  company: 'Example Works',
  product: 'plant',
  template: 'production-control',
  goal: 'Make shift output and exceptions visible.',
  source_url: 'https://supermega.dev/contact/?product=plant',
}

try {
  clearChannels()
  globalThis.fetch = async () => { throw new Error('unexpected_external_request') }

  const status = await invoke({ method: 'GET' })
  assert.equal(status.status, 200)
  assert.deepEqual(status.body, {
    status: 'attention',
    service: 'supermega-contact',
    accepting: false,
    controls: { idempotency: 'required', edge_rate_limit: 'required' },
  })

  process.env.SUPERMEGA_LEAD_WEBHOOK_URL = 'https://lead-router.example.test/events'
  const channelWithoutControls = await invoke({ method: 'GET' })
  assert.equal(channelWithoutControls.status, 200)
  assert.equal(channelWithoutControls.body.accepting, false)

  process.env.SUPERMEGA_CONTACT_IDEMPOTENCY_SECRET = 'test-only-contact-idempotency-secret-0001'
  delete process.env.SUPERMEGA_LEAD_WEBHOOK_URL

  const invalid = await invoke({ body: { company: 'Missing identity' } })
  assert.equal(invalid.status, 400)
  assert.equal(invalid.body.reason, 'required_fields_missing')

  const wrongOrigin = await invoke({ body: validSubmission, headers: withKey(1, { origin: 'https://attacker.example' }) })
  assert.equal(wrongOrigin.status, 403)
  assert.equal(wrongOrigin.body.reason, 'origin_not_allowed')

  const trapped = await invoke({ body: { ...validSubmission, website: 'spam.example' }, headers: { origin: '' } })
  assert.equal(trapped.status, 202)
  assert.deepEqual(trapped.body, { status: 'ready' })

  const missingKey = await invoke({ body: validSubmission })
  assert.equal(missingKey.status, 400)
  assert.equal(missingKey.body.reason, 'idempotency_key_required')

  const unavailable = await invoke({ body: validSubmission, headers: withKey(2) })
  assert.equal(unavailable.status, 503)
  assert.equal(unavailable.body.reason, 'contact_channel_unavailable')
  assert.equal(unavailable.body.fallback_email, 'swanhtet@supermega.dev')

  let delivered
  let fetchCalls = 0
  process.env.SUPERMEGA_LEAD_WEBHOOK_URL = 'https://lead-router.example.test/events'
  process.env.SUPERMEGA_LEAD_WEBHOOK_SECRET = 'test-only-webhook-secret'
  globalThis.fetch = async (url, options) => {
    fetchCalls += 1
    delivered = { url: String(url), options }
    return { ok: true, status: 202 }
  }

  const readyStatus = await invoke({ method: 'GET' })
  assert.equal(readyStatus.body.accepting, true)

  const accepted = await invoke({ body: { ...validSubmission, product: 'UNRECOGNIZED' }, headers: withKey(3) })
  assert.equal(accepted.status, 202)
  assert.match(accepted.body.request_id, /^LEAD-[A-F0-9]{16}$/)
  assert.equal(fetchCalls, 1)
  assert.equal(delivered.url, 'https://lead-router.example.test/events')
  assert.equal(delivered.options.headers.authorization, 'Bearer test-only-webhook-secret')
  assert.equal(delivered.options.headers['idempotency-key'], `supermega.contact.created/${accepted.body.request_id}`)
  const event = JSON.parse(delivered.options.body)
  assert.equal(event.event, 'supermega.contact.created')
  assert.equal(event.record.workflow, 'guide')
  assert.equal(event.record.email, 'operator@example.com')
  assert.equal(event.record.source, 'supermega.dev')

  const replay = await invoke({ body: { ...validSubmission, product: 'UNRECOGNIZED' }, headers: withKey(3) })
  assert.equal(replay.status, 202)
  assert.equal(replay.body.request_id, accepted.body.request_id)
  assert.equal(replay.headers['x-idempotent-replay'], 'true')
  assert.equal(fetchCalls, 1)

  const conflict = await invoke({ body: { ...validSubmission, product: 'UNRECOGNIZED', goal: 'Different request.' }, headers: withKey(3) })
  assert.equal(conflict.status, 409)
  assert.equal(conflict.body.reason, 'idempotency_conflict')

  const rateHeaders = { 'x-forwarded-for': '203.0.113.77' }
  for (let index = 0; index < 5; index += 1) {
    const limited = await invoke({ body: validSubmission, headers: withKey(100 + index, rateHeaders) })
    assert.equal(limited.status, 202)
  }
  const rateLimited = await invoke({ body: validSubmission, headers: withKey(106, rateHeaders) })
  assert.equal(rateLimited.status, 429)
  assert.equal(rateLimited.body.reason, 'rate_limited')
  assert.ok(Number(rateLimited.headers['retry-after']) > 0)

  clearChannels()
  process.env.SUPERMEGA_CONTACT_IDEMPOTENCY_SECRET = 'test-only-contact-idempotency-secret-0001'
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-service-role'
  let storeRequest
  let storeCalls = 0
  globalThis.fetch = async (url, options) => {
    storeCalls += 1
    storeRequest = { url: String(url), options }
    return { ok: true, status: 201, json: async () => [] }
  }
  const durableReplay = await invoke({ body: validSubmission, headers: withKey(200, { 'x-forwarded-for': '203.0.113.88' }) })
  assert.equal(durableReplay.status, 202)
  assert.equal(durableReplay.headers['x-idempotent-replay'], 'true')
  assert.equal(storeCalls, 1)
  assert.match(storeRequest.url, /on_conflict=lead_id$/)
  assert.equal(storeRequest.options.headers.prefer, 'resolution=ignore-duplicates,return=representation')

  console.log(JSON.stringify({ ok: true, contract: 'supermega_public_contact_behavior', checks: 45 }, null, 2))
} finally {
  globalThis.fetch = originalFetch
  for (const name of environmentNames) {
    if (savedEnvironment[name] === undefined) delete process.env[name]
    else process.env[name] = savedEnvironment[name]
  }
}
