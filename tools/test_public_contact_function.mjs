import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { buildClientContactReviewTemplate, initializeClientWorkspaceFromContact, prepareClientDemo, verifyClientDemoPreparation } from './prepare_client_demo.mjs'
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

// Notification fixtures still require an independent retained full record.
const notificationFixtureRows = new Map()
function enableFixtureStore() {
  process.env.SUPABASE_URL = 'https://retention.example.test'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-retention-key'
}
function retainedFixtureResponse(url, options) {
  assert.equal(options.redirect, 'error', 'private delivery must refuse redirects')
  const target = new URL(String(url))
  if (target.origin !== 'https://retention.example.test') return null
  let rows
  if (options.method === 'POST') {
    const record = JSON.parse(options.body)
    rows = notificationFixtureRows.has(record.lead_id) ? [] : [record]
    if (rows.length) notificationFixtureRows.set(record.lead_id, record)
  } else {
    const record = notificationFixtureRows.get(target.searchParams.get('lead_id').slice(3))
    rows = record ? [record] : []
  }
  return { ok: true, status: 200, json: async () => structuredClone(rows) }
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
  product: 'shop',
  plan: 'shop-pilot',
  template: 'mini-mart',
  service: '',
  goal: 'Make sales and stock exceptions visible.',
  source_url: 'https://supermega.dev/contact/?product=shop',
}
const guideSubmission = { ...validSubmission, product: 'guide', plan: '', template: '', service: '' }

function trialProofFields({
  product = 'shop',
  template = 'mini-mart',
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
  assert.equal(unavailable.body.reason, 'contact_persistence_unavailable')
  assert.equal(unavailable.body.fallback_email, 'swanhtet@supermega.dev')

  let delivered
  enableFixtureStore()
  let fetchCalls = 0
  process.env.SUPERMEGA_LEAD_WEBHOOK_URL = 'https://lead-router.example.test/events'
  process.env.SUPERMEGA_LEAD_WEBHOOK_SECRET = 'test-only-webhook-secret'
  globalThis.fetch = async (url, options) => {
    assert.equal(options.redirect, 'error', 'private delivery must refuse redirects')
    const stored = retainedFixtureResponse(url, options)
    if (stored) return stored
    fetchCalls += 1
    delivered = { url: String(url), options }
    return { ok: true, status: 202 }
  }

  const readyStatus = await invoke({ method: 'GET' })
  assert.equal(readyStatus.body.accepting, true)

  const accepted = await invoke({ body: guideSubmission, headers: withKey(3) })
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
  assert.equal(event.record.next_step, 'Choose the smallest suitable product path and return one scoped setup recommendation.')
  assert.equal(accepted.body.proof_bound, false)

  const replay = await invoke({ body: guideSubmission, headers: withKey(3) })
  assert.equal(replay.status, 202)
  assert.equal(replay.body.request_id, accepted.body.request_id)
  assert.equal(replay.headers['x-idempotent-replay'], 'true')
  assert.equal(fetchCalls, 1)

  const conflict = await invoke({ body: { ...guideSubmission, goal: 'Different request.' }, headers: withKey(3) })
  assert.equal(conflict.status, 409)
  assert.equal(conflict.body.reason, 'idempotency_conflict')

  const longCampaign = 'p'.repeat(200)
  const attributed = await invoke({
    body: {
      ...validSubmission,
      source_url: `https://url-user:url-password@supermega.dev/contact/?product=shop&utm_source=facebook&utm_medium=social&utm_campaign=${longCampaign}&utm_content=hero&utm_term=pos&token=private-query&email=private-contact&password=private-password#private-fragment`,
    },
    headers: withKey(204, { 'x-forwarded-for': '203.0.113.204' }),
  })
  assert.equal(attributed.status, 202)
  const attributedEvent = JSON.parse(delivered.options.body)
  assert.equal(attributedEvent.record.source_url, 'https://supermega.dev/contact/')
  assert.equal(attributedEvent.record.page_path, '/contact/')
  assert.deepEqual(
    Object.fromEntries(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].map((field) => [field, attributedEvent.record[field]])),
    { utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '' },
  )
  assert.doesNotMatch(
    JSON.stringify(attributedEvent.record),
    /url-user|url-password|private-query|private-contact|private-password|private-fragment/,
  )

  const trustedAttribution = await invoke({
    body: {
      ...validSubmission,
      source_url: `https://supermega.dev/shop/?utm_source=facebook&utm_medium=social&utm_campaign=${longCampaign}&utm_content=hero&utm_term=pos`,
    },
    headers: withKey(205, { 'x-forwarded-for': '203.0.113.205' }),
  })
  assert.equal(trustedAttribution.status, 202)
  const trustedEvent = JSON.parse(delivered.options.body)
  assert.equal(trustedEvent.record.page_path, '/shop/')
  assert.deepEqual(
    Object.fromEntries(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].map((field) => [field, trustedEvent.record[field]])),
    { utm_source: 'facebook', utm_medium: 'social', utm_campaign: longCampaign.slice(0, 160), utm_content: 'hero', utm_term: 'pos' },
  )

  for (const [index, source_url] of [
    'https://outside.example/contact/?utm_source=forged',
    'http://supermega.dev/contact/?utm_source=insecure',
    'https://supermega.dev/private/admin/?utm_source=wrong-route',
  ].entries()) {
    const rejectedAttribution = await invoke({
      body: { ...validSubmission, source_url },
      headers: withKey(206 + index, { 'x-forwarded-for': `203.0.113.${206 + index}` }),
    })
    assert.equal(rejectedAttribution.status, 202)
    const rejectedEvent = JSON.parse(delivered.options.body)
    assert.equal(rejectedEvent.record.page_path, '/contact/')
    assert.equal(rejectedEvent.record.utm_source, '')
  }

  const previewAttribution = await invoke({
    body: { ...validSubmission, source_url: 'https://preview.example.vercel.app/contact/?utm_source=preview' },
    headers: withKey(209, {
      host: 'preview.example.vercel.app',
      origin: 'https://preview.example.vercel.app',
      'x-forwarded-for': '203.0.113.209',
    }),
  })
  assert.equal(previewAttribution.status, 202)
  const previewEvent = JSON.parse(delivered.options.body)
  assert.equal(previewEvent.record.page_path, '/contact/')
  assert.equal(previewEvent.record.utm_source, 'preview')

  for (const [index, product] of ['production', 'plant', 'website', 'ecommerce', 'commerce'].entries()) {
    const retired = await invoke({ body: { ...validSubmission, product }, headers: withKey(4 + index, { 'x-forwarded-for': `203.0.113.${11 + index}` }) })
    assert.equal(retired.status, 400)
    assert.equal(retired.body.reason, 'product_not_supported')
  }

  for (const [index, template] of ['mini-mart', 'tea-coffee', 'fashion', 'beauty-spa'].entries()) {
    const acceptedTemplate = await invoke({ body: { ...validSubmission, template }, headers: withKey(30 + index, { 'x-forwarded-for': `203.0.113.${70 + index}` }) })
    assert.equal(acceptedTemplate.status, 202)
    const templateEvent = JSON.parse(delivered.options.body)
    assert.equal(templateEvent.record.workflow, 'commerce')
    assert.equal(templateEvent.record.raw.plan, 'shop-pilot')
    assert.equal(templateEvent.record.requested_package, template)
    assert.equal(templateEvent.record.raw.service, '')
  }

  const assisted = await invoke({ body: { ...validSubmission, service: 'assisted-launch' }, headers: withKey(34, { 'x-forwarded-for': '203.0.113.74' }) })
  assert.equal(assisted.status, 202)
  assert.equal(JSON.parse(delivered.options.body).record.raw.service, 'assisted-launch')

  for (const [index, body] of [
    { ...validSubmission, plan: 'managed' },
    { ...validSubmission, template: 'production-control' },
    { ...validSubmission, service: 'managed-cloud' },
    { ...guideSubmission, plan: 'shop-pilot' },
    { ...guideSubmission, template: 'mini-mart' },
    { ...guideSubmission, service: 'assisted-launch' },
  ].entries()) {
    const rejected = await invoke({ body, headers: withKey(40 + index, { 'x-forwarded-for': `203.0.113.${80 + index}` }) })
    assert.equal(rejected.status, 400)
    assert.equal(rejected.body.reason, 'invalid_request')
  }

  const claimAccepted = await invoke({
    body: { ...validSubmission, trial_claim_code: 'sm-7hk2-9mt4' },
    headers: withKey(17, { 'x-forwarded-for': '203.0.113.25' }),
  })
  assert.equal(claimAccepted.status, 202)
  const claimEvent = JSON.parse(delivered.options.body)
  assert.equal(claimEvent.record.raw.trial_claim_code, 'SM-7HK2-9MT4')

  // I, L, O and U are not in the claim alphabet: an invalid code is dropped, not stored.
  const badClaim = await invoke({
    body: { ...validSubmission, trial_claim_code: 'SM-ILOU-0000' },
    headers: withKey(18, { 'x-forwarded-for': '203.0.113.26' }),
  })
  assert.equal(badClaim.status, 202)
  const badClaimEvent = JSON.parse(delivered.options.body)
  assert.equal('trial_claim_code' in badClaimEvent.record.raw, false)

  const attachedProof = trialProofFields()
  const attachedContext = approvedContextFields()
  const proofAccepted = await invoke({
    body: {
      ...validSubmission,
      ...attachedProof,
      ...attachedContext,
      source_url: `https://supermega.dev/contact/?product=shop&template=mini-mart#${new URLSearchParams({ ...attachedProof, ...attachedContext })}`,
      referrer: 'https://app.supermega.dev/settings/?product=shop#private-fragment',
    },
    headers: withKey(6, { 'x-forwarded-for': '203.0.113.13' }),
  })
  assert.equal(proofAccepted.status, 202)
  assert.equal(proofAccepted.body.proof_bound, true)
  const proofEvent = JSON.parse(delivered.options.body)
  assert.equal(proofEvent.record.workflow, 'commerce')
  assert.equal(proofEvent.record.source_url, 'https://supermega.dev/contact/')
  assert.equal(proofEvent.record.referrer, 'https://app.supermega.dev/settings/')
  assert.deepEqual(proofEvent.record.raw.trial_proof, {
    contract: 'supermega.managed_trial_proof.v2',
    version: 2,
    summary_digest: attachedProof.proof_digest,
    product: 'shop',
    template: 'mini-mart',
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
  assert.equal(proofEvent.record.raw.contact_idempotency.version, 4)
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

  const wrongProductProof = trialProofFields({ product: 'plant' })
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
  enableFixtureStore()
  const resendMail = []
  globalThis.fetch = async (url, options) => {
    assert.equal(options.redirect, 'error', 'private delivery must refuse redirects')
    const stored = retainedFixtureResponse(url, options)
    if (stored) return stored
    assert.equal(String(url), 'https://api.resend.com/emails')
    resendMail.push({ headers: options.headers, body: JSON.parse(options.body) })
    return { ok: true, status: 200, json: async () => ({ id: 'email-' + resendMail.length }) }
  }
  const resendHandler = loadHandler({ fresh: true })
  const ackAccepted = await invoke({ body: { ...validSubmission, trial_claim_code: 'SM-2CDE-4FGH' }, headers: withKey(400, { 'x-forwarded-for': '203.0.113.40' }), activeHandler: resendHandler })
  assert.equal(ackAccepted.status, 202)
  assert.equal(resendMail.length, 2)
  const founderNotify = resendMail[0]
  const customerAck = resendMail[1]
  assert.deepEqual(founderNotify.body.to, ['swanhtet@supermega.dev'])
  assert.equal(founderNotify.body.reply_to, validSubmission.email)
  assert.ok(founderNotify.body.text.includes('Trial claim code: SM-2CDE-4FGH'))
  assert.match(founderNotify.body.text, /Operator next step: Validate the Shop trade, import source and first-sale workflow/)
  assert.match(founderNotify.body.text, /Customer brief:/)
  assert.deepEqual(customerAck.body.to, [validSubmission.email])
  assert.equal(customerAck.body.reply_to, 'swanhtet@supermega.dev')
  assert.equal(customerAck.headers['idempotency-key'], `supermega-contact-ack/${ackAccepted.body.request_id}`)
  assert.ok(customerAck.body.text.includes(ackAccepted.body.request_id))
  assert.ok(customerAck.body.text.includes('Workspace reference: SM-2CDE-4FGH'))
  assert.ok(customerAck.body.subject.includes('We received your request'))
  assert.match(customerAck.body.text, /confirm scope, price and timing/)
  assert.match(customerAck.body.text, /Please do not include passwords or customer records/)
  assert.doesNotMatch(customerAck.body.text.split('\n').slice(1).join('\n'), /demo|preview|trial|account created|payment received/i)
  assert.doesNotMatch(customerAck.body.text, /one business day|founder|trial keeps working/)

  const productAcknowledgements = {
    shop: /your catalog, stock and sales workflow/,
    guide: /review the brief and recommend the suitable product/,
  }
  for (const [index, [product, expectedPlan]] of Object.entries(productAcknowledgements).entries()) {
    const before = resendMail.length
    const accepted = await invoke({ body: { ...(product === 'guide' ? guideSubmission : validSubmission), goal: 'Prepare our setup for review' }, headers: withKey(410 + index, { 'x-forwarded-for': '203.0.113.' + (50 + index) }), activeHandler: resendHandler })
    assert.equal(accepted.status, 202)
    assert.equal(resendMail.length, before + 2)
    const acknowledgement = resendMail.at(-1)
    assert.deepEqual(acknowledgement.body.to, [validSubmission.email])
    assert.ok(acknowledgement.body.text.includes(accepted.body.request_id))
    assert.match(acknowledgement.body.text, expectedPlan)
    assert.match(acknowledgement.body.text, /confirm scope, price and timing/)
    assert.match(acknowledgement.body.text, /Reply to this email with questions or corrections/)
    assert.doesNotMatch(acknowledgement.body.text, /Prepare our setup for review/)
    assert.doesNotMatch(acknowledgement.body.text, /Your trial claim code|one business day|founder|trial keeps working/)
  }

  const burmeseAcknowledged = await invoke({
    body: {
      ...validSubmission,
      goal: 'မြန်မာဘာသာဖြင့် Shop ကို စမ်းသပ်မည်။',
      source_url: 'https://supermega.dev/my/contact/?product=shop',
    },
    headers: withKey(420, { 'x-forwarded-for': '203.0.113.60' }),
    activeHandler: resendHandler,
  })
  assert.equal(burmeseAcknowledged.status, 202)
  const burmeseAcknowledgement = resendMail.at(-1)
  assert.equal(
    burmeseAcknowledgement.body.subject,
    'သင့်တောင်းဆိုချက်ကို လက်ခံရရှိပါပြီ - SuperMega',
  )
  assert.match(burmeseAcknowledgement.body.text, /သင့်တောင်းဆိုချက်ကို လက်ခံရရှိပါပြီ/)
  assert.match(burmeseAcknowledgement.body.text, /https:\/\/supermega\.dev\/my\/shop\//)

  const forgedAcknowledged = await invoke({
    body: {
      ...validSubmission,
      goal: 'Keep an external source from selecting the acknowledgement locale.',
      source_url: 'https://outside.example/my/contact/?utm_source=forged',
    },
    headers: withKey(421, { 'x-forwarded-for': '203.0.113.61' }),
    activeHandler: resendHandler,
  })
  assert.equal(forgedAcknowledged.status, 202)
  const forgedAcknowledgement = resendMail.at(-1)
  assert.equal(
    forgedAcknowledgement.body.subject,
    'We received your request - SuperMega',
  )
  assert.match(forgedAcknowledgement.body.text, /confirm scope, price and timing/)
  assert.doesNotMatch(forgedAcknowledgement.body.text, /https:\/\/supermega\.dev\/my\/shop\//)

  // The acknowledgement is best-effort: its failure must never fail a delivered lead.
  let ackAttempted = false
  globalThis.fetch = async (url, options) => {
    assert.equal(options.redirect, 'error', 'private delivery must refuse redirects')
    const stored = retainedFixtureResponse(url, options)
    if (stored) return stored
    if (String(options.headers['idempotency-key'] || '').startsWith('supermega-contact-ack/')) {
      ackAttempted = true
      return { ok: false, status: 500, json: async () => ({ message: 'ack_down' }) }
    }
    return { ok: true, status: 200, json: async () => ({ id: 'email-x' }) }
  }
  const ackFailed = await invoke({ body: validSubmission, headers: withKey(401, { 'x-forwarded-for': '203.0.113.41' }), activeHandler: resendHandler })
  assert.equal(ackFailed.status, 202)
  assert.equal(ackAttempted, true)

  // Overlapping retries must not start a second delivery in this instance.
  let finishDelivery, deliveryStarted
  const started = new Promise(resolve => { deliveryStarted = resolve })
  const held = new Promise(resolve => { finishDelivery = resolve })
  let overlappingCalls = 0
  globalThis.fetch = async (url, options) => {
    assert.equal(options.redirect, 'error', 'private delivery must refuse redirects')
    const stored = retainedFixtureResponse(url, options)
    if (stored) return stored
    overlappingCalls++
    if (overlappingCalls === 1) { deliveryStarted(); await held }
    return { ok: true, status: 200, json: async () => ({ id: 'local-simulated-mail' }) }
  }
  const concurrentHandler = loadHandler({ fresh: true })
  const concurrentArgs = { body: validSubmission, headers: withKey(450), activeHandler: concurrentHandler }
  const firstDelivery = invoke(concurrentArgs)
  await started
  const overlapping = await invoke(concurrentArgs)
  assert.equal(overlapping.status, 409)
  assert.equal(overlapping.body.reason, 'request_in_progress')
  const conflicting = await invoke({ ...concurrentArgs, body: { ...validSubmission, goal: 'A different brief' } })
  assert.equal(conflicting.body.reason, 'idempotency_conflict')
  assert.equal(overlappingCalls, 2, 'acknowledgement starts while operator notification is still pending')
  finishDelivery()
  const originalDelivery = await firstDelivery
  assert.equal(originalDelivery.status, 202)
  const completedReplay = await invoke(concurrentArgs)
  assert.deepEqual(completedReplay.body, originalDelivery.body)
  assert.equal(completedReplay.headers['x-idempotent-replay'], 'true')
  assert.equal(overlappingCalls, 2, 'one operator notification and one acknowledgement only')
  const recoveryArgs = { ...concurrentArgs, headers: withKey(451) }
  globalThis.fetch = async () => { throw new Error('simulated delivery unavailable') }
  const failedDelivery = await invoke(recoveryArgs)
  assert.equal(failedDelivery.status, 503)
  globalThis.fetch = async (url, options) => retainedFixtureResponse(url, options) || ({ ok: true, status: 200, json: async () => ({ id: 'recovered-local-mail' }) })
  const recoveredDelivery = await invoke(recoveryArgs)
  assert.equal(recoveredDelivery.status, 202, 'failed delivery releases the in-flight guard for an exact retry')

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
    assert.equal(options.redirect, 'error', 'private delivery must refuse redirects')
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
    version: 4,
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
    source_url: 'https://supermega.dev/contact/?product=shop&template=mini-mart#proof_digest=must-not-persist',
  }
  const durableProofAccepted = await invoke({
    activeHandler: loadHandler({ fresh: true }),
    body: durableProofSubmission,
    headers: withKey(203, { 'x-forwarded-for': '203.0.113.96' }),
  })
  assert.equal(durableProofAccepted.status, 202)
  assert.equal(durableProofAccepted.body.proof_bound, true)
  const durableProofRecord = persistedLeads.get(durableProofAccepted.body.request_id)
  assert.equal(durableProofRecord.raw.contact_idempotency.version, 4)
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

  // Frozen v1/v2 and pre-offer-contract v3 fingerprints must replay without
  // notifying or rewriting the original retained row. A changed brief conflicts.
  for (const [version, submission, row, key] of [[1, validSubmission, persistedLeads.get(durableAccepted.body.request_id), 200], [2, durableProofSubmission, durableProofRecord, 203], [3, validSubmission, persistedLeads.get(durableAccepted.body.request_id), 200]]) {
    const historicalSource = version === 3 ? new URL(submission.source_url).origin + new URL(submission.source_url).pathname : submission.source_url.split('#')[0]
    const projection = {
      name: submission.name, email: submission.email.toLowerCase(), company: submission.company,
      product: 'commerce', template: submission.template, goal: submission.goal,
      source_url: historicalSource, referrer: '',
      ...(version === 2 ? { trial_proof: row.raw.trial_proof } : version === 3 ? { trial_proof: null } : {}),
    }
    row.raw.contact_idempotency = { version, algorithm: 'sha256', payload_fingerprint: createHash('sha256').update('supermega.contact.payload.v' + version + '\n' + JSON.stringify(projection)).digest('hex') }
    assert.equal(persistedLeads.get(row.lead_id).raw.contact_idempotency.version, version)
    const before = JSON.stringify(row)
    const replay = await invoke({ activeHandler: loadHandler({ fresh: true }), body: submission, headers: withKey(key) })
    assert.equal(replay.status, 202, `historical v${version} fingerprint replays`)
    assert.equal(replay.headers['x-idempotent-replay'], 'true')
    assert.equal(JSON.stringify(persistedLeads.get(row.lead_id)), before)
    const conflict = await invoke({ activeHandler: loadHandler({ fresh: true }), body: { ...submission, goal: 'changed' }, headers: withKey(key) })
    assert.equal(conflict.status, 409)
    assert.equal(JSON.stringify(persistedLeads.get(row.lead_id)), before)
  }

  const legacyAccepted = await invoke({ activeHandler: loadHandler({ fresh: true }), body: validSubmission, headers: withKey(201, { 'x-forwarded-for': '203.0.113.91' }) })
  assert.equal(legacyAccepted.status, 202)
  const legacyRecord = persistedLeads.get(legacyAccepted.body.request_id)
  delete legacyRecord.raw.contact_idempotency
  legacyRecord.workflow = 'commerce'
  legacyRecord.raw.product = 'commerce'
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

  // Retired workflow rows remain readable for safe collision resolution even
  // though no new public request may select any of these runtime identities.
  for (const [index, workflow] of ['commerce', 'production', 'website', 'ecommerce'].entries()) {
    const key = 210 + index
    const seeded = await invoke({ activeHandler: loadHandler({ fresh: true }), body: validSubmission, headers: withKey(key, { 'x-forwarded-for': `203.0.113.${110 + index}` }) })
    assert.equal(seeded.status, 202)
    const row = persistedLeads.get(seeded.body.request_id)
    delete row.raw.contact_idempotency
    row.workflow = workflow
    row.requested_package = workflow === 'commerce' ? 'social-commerce' : 'historical-template'
    row.raw.product = workflow
    row.raw.template = row.requested_package
    delete row.raw.plan
    delete row.raw.service
    const collision = await invoke({ activeHandler: loadHandler({ fresh: true }), body: validSubmission, headers: withKey(key, { 'x-forwarded-for': `203.0.113.${120 + index}` }) })
    assert.equal(collision.status, 409, `${workflow} retained row stays readable and conflicts closed`)
    assert.equal(collision.body.reason, 'idempotency_conflict')
  }

  const ambiguousAccepted = await invoke({ activeHandler: loadHandler({ fresh: true }), body: validSubmission, headers: withKey(202, { 'x-forwarded-for': '203.0.113.94' }) })
  assert.equal(ambiguousAccepted.status, 202)
  persistedLeads.get(ambiguousAccepted.body.request_id).raw.contact_idempotency.payload_fingerprint = 'not-a-fingerprint'
  process.env.SUPERMEGA_LEAD_WEBHOOK_URL = 'https://lead-router.example.test/events'
  const ambiguousReplay = await invoke({ activeHandler: loadHandler({ fresh: true }), body: validSubmission, headers: withKey(202, { 'x-forwarded-for': '203.0.113.95' }) })
  assert.equal(ambiguousReplay.status, 503)
  assert.equal(ambiguousReplay.body.reason, 'contact_persistence_unavailable')
  assert.equal(unexpectedDeliveryCalls, 0)

  // Independent cold handlers share only the simulated atomic database, not maps.
  const independentOne = loadHandler({ fresh: true })
  const independentTwo = loadHandler({ fresh: true })
  const beforeConcurrentRows = persistedLeads.size
  const independentResults = await Promise.all([
    invoke({ activeHandler: independentOne, body: validSubmission, headers: withKey(260) }),
    invoke({ activeHandler: independentTwo, body: validSubmission, headers: withKey(260) }),
  ])
  assert.deepEqual(independentResults.map(result => result.status), [202, 202])
  assert.equal(independentResults[0].body.request_id, independentResults[1].body.request_id)
  assert.equal(independentResults.filter(result => result.headers['x-idempotent-replay'] === 'true').length, 1)
  assert.equal(persistedLeads.size, beforeConcurrentRows + 1)
  assert.equal(unexpectedDeliveryCalls, 1, 'only the insert winner notifies the webhook')

  const conflictResults = await Promise.all([
    invoke({ activeHandler: loadHandler({ fresh: true }), body: validSubmission, headers: withKey(261) }),
    invoke({ activeHandler: loadHandler({ fresh: true }), body: { ...validSubmission, goal: 'Conflicting concurrent brief' }, headers: withKey(261) }),
  ])
  assert.deepEqual(conflictResults.map(result => result.status).sort(), [202, 409])
  assert.equal(conflictResults.find(result => result.status === 409).body.reason, 'idempotency_conflict')
  assert.equal(unexpectedDeliveryCalls, 2, 'conflicting cold handler cannot notify')

  // Exercise the actual generated API event through the actual staff preparation
  // consumer. Delivery is intercepted: no network, messages or customer records.
  clearChannels()
  process.env.SUPERMEGA_CONTACT_IDEMPOTENCY_SECRET = randomUUID()
  enableFixtureStore()
  process.env.SUPERMEGA_LEAD_WEBHOOK_URL = 'https://lead-router.example.test/events'
  const integrationRoot = await mkdtemp(resolve(tmpdir(), 'supermega-contact-handoff-'))
  try {
    for (const product of ['shop']) {
      let deliveredEvent
      let deliveryCount = 0
      globalThis.fetch = async (url, options) => {
    assert.equal(options.redirect, 'error', 'private delivery must refuse redirects')
        const stored = retainedFixtureResponse(url, options)
        if (stored) return stored
        assert.equal(url, 'https://lead-router.example.test/events')
        assert.equal(options.method, 'POST')
        deliveryCount++
        deliveredEvent = JSON.parse(options.body)
        return { ok: true, status: 200 }
      }
      const response = await invoke({
        activeHandler: loadHandler({ fresh: true }),
        body: { ...validSubmission, product, goal: 'Prepare our ' + product + ' for review', source_url: 'https://supermega.dev/contact/?product=' + product },
        headers: { 'x-idempotency-key': randomUUID() },
      })
      assert.equal(response.status, 202)
      assert.equal(deliveryCount, 1)
      assert.equal(deliveredEvent.record.lead_id, response.body.request_id)
      assert.equal(deliveredEvent.record.goal, 'Prepare our ' + product + ' for review')
      const review = {
        ...buildClientContactReviewTemplate(deliveredEvent),
        workspace: 'Synthetic handoff workspace', implementationOwner: 'Synthetic reviewer',
        companyReviewed: true, goalReviewed: true, privateWorkspaceApproved: true,
        reviewedAt: new Date().toISOString(),
      }
      const directory = resolve(integrationRoot, product)
      const initialized = await initializeClientWorkspaceFromContact({ directory, event: deliveredEvent, review })
      assert.equal(initialized.requestedProduct, 'commerce')
      const preparation = await prepareClientDemo({ dataDirectory: directory })
      assert.deepEqual(preparation.products.map(item => item.product), ['commerce'])
      assert.equal(preparation.client.owner, 'Synthetic reviewer')
      assert.equal(verifyClientDemoPreparation(preparation).status, 'verified_not_applied')
      assert.equal(preparation.controls.externalWritesPerformed, false)
      assert.equal(preparation.controls.containsSampleFixtures, true)
      assert.doesNotMatch(JSON.stringify(preparation), /operator@example\.com|Trial Operator/)
    }
  } finally {
    await rm(integrationRoot, { recursive: true, force: true })
  }

  console.log(JSON.stringify({ ok: true, contract: 'supermega_public_contact_behavior', assertions: 'all_passed', serviceHandoffJourneys: 1, independentInstanceRaceScenarios: 2, evidence: 'local_mocked_not_hosted' }, null, 2))
} finally {
  globalThis.fetch = originalFetch
  for (const name of environmentNames) {
    if (savedEnvironment[name] === undefined) delete process.env[name]
    else process.env[name] = savedEnvironment[name]
  }
}

await import('./test_public_contact_retention.mjs')
