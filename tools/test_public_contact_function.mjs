import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const handlerPath = resolve('.vercel', 'output', 'functions', 'api', 'contact-submissions.js.func', 'index.js')
const loadHandler = ({ fresh = false } = {}) => {
  const resolvedPath = require.resolve(handlerPath)
  if (fresh) delete require.cache[resolvedPath]
  return require(resolvedPath)
}
const handler = loadHandler()

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

async function invoke({ method = 'POST', body = {}, headers = {}, activeHandler = handler } = {}) {
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
  await activeHandler(req, res)
  return { status: res.statusCode, headers: res.headers, body: JSON.parse(res.payload || '{}') }
}

const requestKey = (value) => `contact-test-key-${String(value).padStart(6, '0')}`
const withKey = (value, headers = {}) => ({ 'x-idempotency-key': requestKey(value), ...headers })

const validSubmission = {
  name: 'Trial Operator',
  email: 'operator@example.com',
  company: 'Example Works',
  product: 'production',
  template: 'production-control',
  goal: 'Make shift output and exceptions visible.',
  source_url: 'https://supermega.dev/contact/?product=production',
}

function trialProofFields({
  product = 'plant',
  template = 'production-control',
  readiness = 67,
  sources = 12,
  behavior = 4,
  decisions = 2,
  outcome = 'improved',
  outcomeDigest = `sha256:${'b'.repeat(64)}`,
  outcomeAccepted = true,
} = {}) {
  const contract = 'supermega.managed_trial_proof.v2'
  const projection = [contract, 2, product, template, readiness, sources, behavior, decisions, outcome, outcomeDigest, outcomeAccepted, false]
  return {
    proof_contract: contract,
    proof_version: '2',
    proof_digest: `sha256:${createHash('sha256').update(JSON.stringify(projection)).digest('hex')}`,
    proof_product: product,
    proof_template: template,
    proof_readiness: String(readiness),
    proof_sources: String(sources),
    proof_behavior: String(behavior),
    proof_decisions: String(decisions),
    proof_outcome: outcome,
    proof_outcome_digest: outcomeDigest ?? '',
    proof_outcome_accepted: String(outcomeAccepted),
    proof_raw_records: 'false',
  }
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
    controls: { idempotency: 'required', edge_rate_limit: 'required', trial_proof: 'optional_client_provided' },
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
  assert.equal(accepted.body.proof_bound, false)

  const replay = await invoke({ body: { ...validSubmission, product: 'UNRECOGNIZED' }, headers: withKey(3) })
  assert.equal(replay.status, 202)
  assert.equal(replay.body.request_id, accepted.body.request_id)
  assert.equal(replay.headers['x-idempotent-replay'], 'true')
  assert.equal(fetchCalls, 1)

  const conflict = await invoke({ body: { ...validSubmission, product: 'UNRECOGNIZED', goal: 'Different request.' }, headers: withKey(3) })
  assert.equal(conflict.status, 409)
  assert.equal(conflict.body.reason, 'idempotency_conflict')

  const websiteAccepted = await invoke({
    body: {
      ...validSubmission,
      product: 'website',
      template: 'lead-generation',
      source_url: 'https://supermega.dev/contact/?product=website&template=lead-generation&utm_source=linkedin&utm_medium=social&utm_campaign=website-launch&utm_content=carousel&utm_term=myanmar',
    },
    headers: withKey(4, { 'x-forwarded-for': '203.0.113.11' }),
  })
  assert.equal(websiteAccepted.status, 202)
  const websiteEvent = JSON.parse(delivered.options.body)
  assert.equal(websiteEvent.record.workflow, 'website')
  assert.equal(websiteEvent.record.requested_package, 'lead-generation')
  assert.equal(websiteEvent.record.utm_source, 'linkedin')
  assert.equal(websiteEvent.record.utm_medium, 'social')
  assert.equal(websiteEvent.record.utm_campaign, 'website-launch')
  assert.equal(websiteEvent.record.utm_content, 'carousel')
  assert.equal(websiteEvent.record.utm_term, 'myanmar')

  const ecommerceAccepted = await invoke({
    body: { ...validSubmission, product: 'ecommerce', template: 'social-storefront' },
    headers: withKey(5, { 'x-forwarded-for': '203.0.113.12' }),
  })
  assert.equal(ecommerceAccepted.status, 202)
  const ecommerceEvent = JSON.parse(delivered.options.body)
  assert.equal(ecommerceEvent.record.workflow, 'ecommerce')
  assert.equal(ecommerceEvent.record.requested_package, 'social-storefront')

  const attachedProof = trialProofFields()
  const proofAccepted = await invoke({
    body: {
      ...validSubmission,
      ...attachedProof,
      source_url: `https://supermega.dev/contact/?product=plant&template=production-control#${new URLSearchParams(attachedProof)}`,
      referrer: 'https://app.supermega.dev/settings/?product=plant#private-fragment',
    },
    headers: withKey(6, { 'x-forwarded-for': '203.0.113.13' }),
  })
  assert.equal(proofAccepted.status, 202)
  assert.equal(proofAccepted.body.proof_bound, true)
  const proofEvent = JSON.parse(delivered.options.body)
  assert.equal(proofEvent.record.workflow, 'production')
  assert.equal(proofEvent.record.source_url, 'https://supermega.dev/contact/?product=plant&template=production-control')
  assert.equal(proofEvent.record.referrer, 'https://app.supermega.dev/settings/?product=plant')
  assert.deepEqual(proofEvent.record.raw.trial_proof, {
    contract: 'supermega.managed_trial_proof.v2',
    version: 2,
    summary_digest: attachedProof.proof_digest,
    product: 'plant',
    template: 'production-control',
    readiness_score: 67,
    source_record_count: 12,
    behavior_signal_count: 4,
    reviewed_decision_count: 2,
    outcome_status: 'improved',
    outcome_digest: `sha256:${'b'.repeat(64)}`,
    outcome_accepted: true,
    raw_records_included: false,
    verification: 'client_provided_summary',
  })
  assert.equal(proofEvent.record.raw.contact_idempotency.version, 2)
  assert.equal(JSON.stringify(proofEvent.record.raw).includes('private-fragment'), false)

  const tamperedProof = await invoke({
    body: { ...validSubmission, ...attachedProof, proof_sources: '13' },
    headers: withKey(7, { 'x-forwarded-for': '203.0.113.14' }),
  })
  assert.equal(tamperedProof.status, 400)
  assert.equal(tamperedProof.body.reason, 'trial_proof_invalid')

  const partialProof = await invoke({
    body: { ...validSubmission, proof_contract: attachedProof.proof_contract },
    headers: withKey(8, { 'x-forwarded-for': '203.0.113.15' }),
  })
  assert.equal(partialProof.status, 400)
  assert.equal(partialProof.body.reason, 'trial_proof_invalid')

  const wrongProductProof = trialProofFields({ product: 'shop' })
  const mismatchedProof = await invoke({
    body: { ...validSubmission, ...wrongProductProof },
    headers: withKey(9, { 'x-forwarded-for': '203.0.113.16' }),
  })
  assert.equal(mismatchedProof.status, 400)
  assert.equal(mismatchedProof.body.reason, 'trial_proof_invalid')

  const changedProofFields = trialProofFields({ sources: 13 })
  const proofConflict = await invoke({
    body: { ...validSubmission, ...changedProofFields },
    headers: withKey(6, { 'x-forwarded-for': '203.0.113.17' }),
  })
  assert.equal(proofConflict.status, 409)
  assert.equal(proofConflict.body.reason, 'idempotency_conflict')

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
  const clone = (value) => JSON.parse(JSON.stringify(value))
  const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => clone(body) })
  const persistedLeads = new Map()
  const storeRequests = []
  let storeCalls = 0
  let unexpectedDeliveryCalls = 0
  globalThis.fetch = async (url, options) => {
    const target = new URL(String(url))
    if (target.origin !== 'https://example.supabase.co') {
      unexpectedDeliveryCalls += 1
      return { ok: true, status: 202 }
    }
    storeCalls += 1
    assert.equal(target.pathname, '/rest/v1/supermega_leads')
    if (options.method === 'POST') {
      assert.equal(target.searchParams.get('on_conflict'), 'lead_id')
      assert.equal(options.headers.prefer, 'resolution=ignore-duplicates,return=representation')
      const incoming = JSON.parse(options.body)
      storeRequests.push({ method: 'POST', record: clone(incoming) })
      if (persistedLeads.has(incoming.lead_id)) return jsonResponse(201, [])
      persistedLeads.set(incoming.lead_id, clone(incoming))
      return jsonResponse(201, [incoming])
    }
    if (options.method === 'GET') {
      assert.equal(target.searchParams.get('limit'), '2')
      assert.match(target.searchParams.get('select'), /lead_id.*raw/)
      const filter = target.searchParams.get('lead_id') || ''
      assert.match(filter, /^eq\.LEAD-[A-F0-9]{16}$/)
      const stored = persistedLeads.get(filter.slice(3))
      storeRequests.push({ method: 'GET', leadId: filter.slice(3) })
      return jsonResponse(200, stored ? [stored] : [])
    }
    throw new Error('unexpected_supabase_method')
  }

  const durableAccepted = await invoke({ body: validSubmission, headers: withKey(200, { 'x-forwarded-for': '203.0.113.88' }) })
  assert.equal(durableAccepted.status, 202)
  assert.equal(durableAccepted.headers['x-idempotent-replay'], undefined)
  assert.equal(storeCalls, 1)
  const durableRecord = storeRequests[0].record
  assert.equal(durableRecord.lead_id, durableAccepted.body.request_id)
  assert.deepEqual(durableRecord.raw.contact_idempotency, {
    version: 1,
    algorithm: 'sha256',
    payload_fingerprint: durableRecord.raw.contact_idempotency.payload_fingerprint,
  })
  assert.match(durableRecord.raw.contact_idempotency.payload_fingerprint, /^[a-f0-9]{64}$/)

  const coldSameHandler = loadHandler({ fresh: true })
  const durableReplay = await invoke({ activeHandler: coldSameHandler, body: validSubmission, headers: withKey(200, { 'x-forwarded-for': '203.0.113.89' }) })
  assert.equal(durableReplay.status, 202)
  assert.equal(durableReplay.body.request_id, durableAccepted.body.request_id)
  assert.equal(durableReplay.headers['x-idempotent-replay'], 'true')
  assert.equal(storeCalls, 3)
  assert.deepEqual(storeRequests.slice(-2).map(({ method }) => method), ['POST', 'GET'])
  assert.equal(
    storeRequests.at(-2).record.raw.contact_idempotency.payload_fingerprint,
    durableRecord.raw.contact_idempotency.payload_fingerprint,
  )

  const coldChangedHandler = loadHandler({ fresh: true })
  const durableConflict = await invoke({
    activeHandler: coldChangedHandler,
    body: { ...validSubmission, goal: 'A changed request must not replay.' },
    headers: withKey(200, { 'x-forwarded-for': '203.0.113.90' }),
  })
  assert.equal(durableConflict.status, 409)
  assert.equal(durableConflict.body.reason, 'idempotency_conflict')
  assert.equal(storeCalls, 5)
  assert.notEqual(
    storeRequests.at(-2).record.raw.contact_idempotency.payload_fingerprint,
    durableRecord.raw.contact_idempotency.payload_fingerprint,
  )

  const durableProofSubmission = {
    ...validSubmission,
    ...trialProofFields(),
    source_url: 'https://supermega.dev/contact/?product=plant&template=production-control#proof_digest=must-not-persist',
  }
  const durableProofAccepted = await invoke({
    activeHandler: loadHandler({ fresh: true }),
    body: durableProofSubmission,
    headers: withKey(203, { 'x-forwarded-for': '203.0.113.96' }),
  })
  assert.equal(durableProofAccepted.status, 202)
  assert.equal(durableProofAccepted.body.proof_bound, true)
  const durableProofRecord = persistedLeads.get(durableProofAccepted.body.request_id)
  assert.equal(durableProofRecord.raw.contact_idempotency.version, 2)
  assert.equal(durableProofRecord.raw.trial_proof.verification, 'client_provided_summary')
  assert.equal(durableProofRecord.raw.trial_proof.summary_digest, durableProofSubmission.proof_digest)
  assert.equal(durableProofRecord.raw.trial_proof.raw_records_included, false)
  assert.equal(durableProofRecord.source_url.includes('#'), false)

  const durableProofReplay = await invoke({
    activeHandler: loadHandler({ fresh: true }),
    body: durableProofSubmission,
    headers: withKey(203, { 'x-forwarded-for': '203.0.113.97' }),
  })
  assert.equal(durableProofReplay.status, 202)
  assert.equal(durableProofReplay.body.request_id, durableProofAccepted.body.request_id)
  assert.equal(durableProofReplay.body.proof_bound, true)
  assert.equal(durableProofReplay.headers['x-idempotent-replay'], 'true')

  const legacyAccepted = await invoke({ activeHandler: loadHandler({ fresh: true }), body: validSubmission, headers: withKey(201, { 'x-forwarded-for': '203.0.113.91' }) })
  assert.equal(legacyAccepted.status, 202)
  const legacyRecord = persistedLeads.get(legacyAccepted.body.request_id)
  delete legacyRecord.raw.contact_idempotency
  legacyRecord.workflow = 'plant'
  legacyRecord.raw.product = 'plant'
  const legacyReplay = await invoke({ activeHandler: loadHandler({ fresh: true }), body: validSubmission, headers: withKey(201, { 'x-forwarded-for': '203.0.113.92' }) })
  assert.equal(legacyReplay.status, 202)
  assert.equal(legacyReplay.headers['x-idempotent-replay'], 'true')
  const legacyConflict = await invoke({
    activeHandler: loadHandler({ fresh: true }),
    body: { ...validSubmission, company: 'Changed Legacy Company' },
    headers: withKey(201, { 'x-forwarded-for': '203.0.113.93' }),
  })
  assert.equal(legacyConflict.status, 409)
  assert.equal(legacyConflict.body.reason, 'idempotency_conflict')

  const ambiguousAccepted = await invoke({ activeHandler: loadHandler({ fresh: true }), body: validSubmission, headers: withKey(202, { 'x-forwarded-for': '203.0.113.94' }) })
  assert.equal(ambiguousAccepted.status, 202)
  persistedLeads.get(ambiguousAccepted.body.request_id).raw.contact_idempotency.payload_fingerprint = 'not-a-fingerprint'
  process.env.SUPERMEGA_LEAD_WEBHOOK_URL = 'https://lead-router.example.test/events'
  const ambiguousReplay = await invoke({ activeHandler: loadHandler({ fresh: true }), body: validSubmission, headers: withKey(202, { 'x-forwarded-for': '203.0.113.95' }) })
  assert.equal(ambiguousReplay.status, 503)
  assert.equal(ambiguousReplay.body.reason, 'contact_persistence_unavailable')
  assert.equal(unexpectedDeliveryCalls, 0)

  console.log(JSON.stringify({ ok: true, contract: 'supermega_public_contact_behavior', checks: 120 }, null, 2))
} finally {
  globalThis.fetch = originalFetch
  for (const name of environmentNames) {
    if (savedEnvironment[name] === undefined) delete process.env[name]
    else process.env[name] = savedEnvironment[name]
  }
}
