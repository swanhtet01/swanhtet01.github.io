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

function approvedContextFields({
  contract = 'supermega.ai_context_export.v1',
  digest = `sha256:${'c'.repeat(64)}`,
  outcomeDigest = `sha256:${'b'.repeat(64)}`,
  approved = true,
  rawRecords = false,
} = {}) {
  return {
    proof_context_contract: contract,
    proof_context_digest: digest,
    proof_context_outcome_digest: outcomeDigest,
    proof_context_approved: String(approved),
    proof_context_raw_records: String(rawRecords),
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

  const accepted = await invoke({ body: { ...validSubmission, product: 'guide' }, headers: withKey(3) })
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

  const replay = await invoke({ body: { ...validSubmission, product: 'guide' }, headers: withKey(3) })
  assert.equal(replay.status, 202)
  assert.equal(replay.body.request_id, accepted.body.request_id)
  assert.equal(replay.headers['x-idempotent-replay'], 'true')
  assert.equal(fetchCalls, 1)

  const conflict = await invoke({ body: { ...validSubmission, product: 'guide', goal: 'Different request.' }, headers: withKey(3) })
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
  const attachedContext = approvedContextFields()
  const proofAccepted = await invoke({
    body: {
      ...validSubmission,
      ...attachedProof,
      ...attachedContext,
      source_url: `https://supermega.dev/contact/?product=plant&template=production-control#${new URLSearchParams({ ...attachedProof, ...attachedContext })}`,
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
    approved_context: {
      contract: 'supermega.ai_context_export.v1',
      digest: attachedContext.proof_context_digest,
      outcome_digest: attachedProof.proof_outcome_digest,
      approved: true,
      raw_records_included: false,
      verification: 'client_provided_digest',
    },
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

  const partialContext = await invoke({
    body: { ...validSubmission, ...attachedProof, proof_context_contract: attachedContext.proof_context_contract },
    headers: withKey(10, { 'x-forwarded-for': '203.0.113.18' }),
  })
  assert.equal(partialContext.status, 400)
  assert.equal(partialContext.body.reason, 'trial_proof_invalid')

  const mismatchedContextOutcome = await invoke({
    body: { ...validSubmission, ...attachedProof, ...approvedContextFields({ outcomeDigest: `sha256:${'d'.repeat(64)}` }) },
    headers: withKey(11, { 'x-forwarded-for': '203.0.113.19' }),
  })
  assert.equal(mismatchedContextOutcome.status, 400)
  assert.equal(mismatchedContextOutcome.body.reason, 'trial_proof_invalid')

  const wrongContextContract = await invoke({
    body: { ...validSubmission, ...attachedProof, ...approvedContextFields({ contract: 'supermega.ai_context_export.v2' }) },
    headers: withKey(12, { 'x-forwarded-for': '203.0.113.20' }),
  })
  assert.equal(wrongContextContract.status, 400)
  assert.equal(wrongContextContract.body.reason, 'trial_proof_invalid')

  const unapprovedContext = await invoke({
    body: { ...validSubmission, ...attachedProof, ...approvedContextFields({ approved: false }) },
    headers: withKey(13, { 'x-forwarded-for': '203.0.113.21' }),
  })
  assert.equal(unapprovedContext.status, 400)
  assert.equal(unapprovedContext.body.reason, 'trial_proof_invalid')

  const rawContext = await invoke({
    body: { ...validSubmission, ...attachedProof, ...approvedContextFields({ rawRecords: true }) },
    headers: withKey(14, { 'x-forwarded-for': '203.0.113.22' }),
  })
  assert.equal(rawContext.status, 400)
  assert.equal(rawContext.body.reason, 'trial_proof_invalid')

  const unacceptedProof = trialProofFields({ outcomeAccepted: false })
  const contextWithoutAcceptedOutcome = await invoke({
    body: { ...validSubmission, ...unacceptedProof, ...attachedContext },
    headers: withKey(15, { 'x-forwarded-for': '203.0.113.23' }),
  })
  assert.equal(contextWithoutAcceptedOutcome.status, 400)
  assert.equal(contextWithoutAcceptedOutcome.body.reason, 'trial_proof_invalid')

  const emptyContextProof = trialProofFields({ sources: 0, behavior: 0, decisions: 0 })
  const contextWithoutEligibleEvidence = await invoke({
    body: { ...validSubmission, ...emptyContextProof, ...attachedContext },
    headers: withKey(16, { 'x-forwarded-for': '203.0.113.24' }),
  })
  assert.equal(contextWithoutEligibleEvidence.status, 400)
  assert.equal(contextWithoutEligibleEvidence.body.reason, 'trial_proof_invalid')

  const changedProofFields = trialProofFields({ sources: 13 })
  const proofConflict = await invoke({
    body: { ...validSubmission, ...changedProofFields },
    headers: withKey(6, { 'x-forwarded-for': '203.0.113.17' }),
  })
  assert.equal(proofConflict.status, 409)
  assert.equal(proofConflict.body.reason, 'idempotency_conflict')
  const retiredProduct = await invoke({
    body: { ...validSubmission, product: 'vision', template: 'release-qa' },
    headers: withKey(300, { 'x-forwarded-for': '203.0.113.30' }),
  })
  assert.equal(retiredProduct.status, 400)
  assert.equal(retiredProduct.body.reason, 'product_not_supported')

  const unknownProduct = await invoke({
    body: { ...validSubmission, product: 'unrecognized' },
    headers: withKey(301, { 'x-forwarded-for': '203.0.113.31' }),
  })
  assert.equal(unknownProduct.status, 400)
  assert.equal(unknownProduct.body.reason, 'product_not_supported')

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
  process.env.RESEND_API_KEY = 're_test_only_key'
  const resendMail = []
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), 'https://api.resend.com/emails')
    resendMail.push({ headers: options.headers, body: JSON.parse(options.body) })
    return { ok: true, status: 200, json: async () => ({ id: 'email-' + resendMail.length }) }
  }
  const resendHandler = loadHandler({ fresh: true })
  const ackAccepted = await invoke({ body: validSubmission, headers: withKey(400, { 'x-forwarded-for': '203.0.113.40' }), activeHandler: resendHandler })
  assert.equal(ackAccepted.status, 202)
  assert.equal(resendMail.length, 2)
  const founderNotify = resendMail[0]
  const customerAck = resendMail[1]
  assert.deepEqual(founderNotify.body.to, ['swanhtet@supermega.dev'])
  assert.equal(founderNotify.body.reply_to, validSubmission.email)
  assert.deepEqual(customerAck.body.to, [validSubmission.email])
  assert.equal(customerAck.body.reply_to, 'swanhtet@supermega.dev')
  assert.equal(customerAck.headers['idempotency-key'], `supermega-contact-ack/${ackAccepted.body.request_id}`)
  assert.ok(customerAck.body.text.includes(ackAccepted.body.request_id))
  assert.ok(customerAck.body.subject.includes('We received your request'))

  // The acknowledgement is best-effort: its failure must never fail a delivered lead.
  let ackAttempted = false
  globalThis.fetch = async (url, options) => {
    if (String(options.headers['idempotency-key'] || '').startsWith('supermega-contact-ack/')) {
      ackAttempted = true
      return { ok: false, status: 500, json: async () => ({ message: 'ack_down' }) }
    }
    return { ok: true, status: 200, json: async () => ({ id: 'email-x' }) }
  }
  const ackFailed = await invoke({ body: validSubmission, headers: withKey(401, { 'x-forwarded-for': '203.0.113.41' }), activeHandler: resendHandler })
  assert.equal(ackFailed.status, 202)
  assert.equal(ackAttempted, true)

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
    ...approvedContextFields(),
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
  assert.equal(durableProofRecord.raw.trial_proof.approved_context.digest, durableProofSubmission.proof_context_digest)
  assert.equal(durableProofRecord.raw.trial_proof.approved_context.outcome_digest, durableProofSubmission.proof_outcome_digest)
  assert.equal(durableProofRecord.raw.trial_proof.approved_context.raw_records_included, false)
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

  console.log(JSON.stringify({ ok: true, contract: 'supermega_public_contact_behavior', checks: 139 }, null, 2))
} finally {
  globalThis.fetch = originalFetch
  for (const name of environmentNames) {
    if (savedEnvironment[name] === undefined) delete process.env[name]
    else process.env[name] = savedEnvironment[name]
  }
}
