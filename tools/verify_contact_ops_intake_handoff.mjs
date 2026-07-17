import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const handler = require('../api/contact-submissions.js')
const healthHandler = require('../api/health.js')
const {
  forwardOpsIntake,
  isSafeOpsIntakeUrl,
  opsIntakeStatus,
  publicContactStatus,
  contactDiagnostics,
  hasStatusDiagnosticsAccess,
  buildContactRoutingEvent,
  publicSubmissionReceipt,
  publicSubmissionFailure,
  html,
  receiptHtml,
  buildLeadRecord,
  isShopLead,
  isSafeShopPipelineUrl,
  shopPipelinePayload,
  forwardShopPipeline,
} = handler.__test

assert.equal(typeof forwardOpsIntake, 'function')
assert.equal(typeof buildLeadRecord, 'function')
assert.equal(typeof isShopLead, 'function')
assert.equal(typeof isSafeShopPipelineUrl, 'function')
assert.equal(typeof shopPipelinePayload, 'function')
assert.equal(typeof forwardShopPipeline, 'function')
assert.equal(typeof buildContactRoutingEvent, 'function')
assert.equal(typeof html, 'function')
assert.equal(isSafeOpsIntakeUrl('https://supermega-machine.vercel.app/api/intake'), true)
assert.equal(isSafeOpsIntakeUrl('https://supermega-machine.vercel.app.evil.example/api/intake'), false)
assert.equal(isSafeOpsIntakeUrl('https://supermega-machine.vercel.app/api/intake?redirect=1'), false)
assert.equal(isSafeShopPipelineUrl('https://pos.supermega.dev/api/pipeline-leads'), true)
assert.equal(isSafeShopPipelineUrl('https://pos.supermega.dev.evil.example/api/pipeline-leads'), false)
assert.equal(isSafeShopPipelineUrl('https://pos.supermega.dev/api/pipeline-leads?redirect=1'), false)

const originalFetch = globalThis.fetch
const originalSecret = process.env.SUPERMEGA_INTAKE_SECRET
const originalUrl = process.env.SUPERMEGA_OPS_INTAKE_URL
const originalShopPipelineUrl = process.env.SHOP_PIPELINE_URL
const originalLegacyDeskposPipelineUrl = process.env.DESKPOS_PIPELINE_URL
const originalShopPipelineIngestToken = process.env.SHOP_PIPELINE_INGEST_TOKEN
const originalOpsKey = process.env.SUPERMEGA_OPS_KEY
const originalSupabaseUrl = process.env.SUPABASE_URL
const originalSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const originalResendApiKey = process.env.RESEND_API_KEY
const calls = []
const secret = 'contract-test-secret'
const opsKey = 'contract-test-ops-key'
const shopIngestToken = 'contract-test-shop-ingest-token'
const shopSuccessBody = {
  ok: true,
  accepted: true,
  duplicate: false,
  leadCount: 1,
  lead: { id: 'SHOP-LEAD-1' },
}
const opsSuccessBody = {
  ok: true,
  accepted: true,
  duplicate: false,
  lead_id: 'OPS-LEAD-1',
  fit_score: 84,
}
const contactSource = readFileSync(new URL('../api/contact-submissions.js', import.meta.url), 'utf8')
const handlerSource = contactSource.slice(
  contactSource.indexOf('async function handler'),
  contactSource.indexOf('handler.__test'),
)

async function invokeStatus(url, headers = {}) {
  let rawBody = ''
  const responseHeaders = {}
  const res = {
    statusCode: 0,
    setHeader(name, value) {
      responseHeaders[name.toLowerCase()] = value
    },
    end(body = '') {
      rawBody = body
    },
  }
  await handler({ method: 'GET', url, headers }, res)
  return {
    statusCode: res.statusCode,
    headers: responseHeaders,
    body: JSON.parse(rawBody),
  }
}

async function invokeHealth(method) {
  let rawBody = ''
  const responseHeaders = {}
  const res = {
    statusCode: 0,
    setHeader(name, value) {
      responseHeaders[name.toLowerCase()] = value
    },
    end(body = '') {
      rawBody = body
    },
  }
  await healthHandler({ method }, res)
  return {
    statusCode: res.statusCode,
    headers: responseHeaders,
    rawBody,
    body: rawBody ? JSON.parse(rawBody) : null,
  }
}

try {
  process.env.SUPERMEGA_INTAKE_SECRET = secret
  process.env.SUPERMEGA_OPS_KEY = opsKey
  process.env.SHOP_PIPELINE_INGEST_TOKEN = shopIngestToken
  process.env.SUPABASE_URL = 'https://contract-test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'contract-test-service-role-key'
  process.env.RESEND_API_KEY = 'contract-test-resend-key'
  delete process.env.SUPERMEGA_OPS_INTAKE_URL
  delete process.env.SHOP_PIPELINE_URL
  delete process.env.DESKPOS_PIPELINE_URL
  const contractFetch = async (url, options) => {
    calls.push({ url, options })
    if (url === 'https://pos.supermega.dev/api/pipeline-leads') {
      return {
        ok: true,
        status: 200,
        json: async () => shopSuccessBody,
      }
    }
    return {
      ok: true,
      status: 200,
      json: async () => opsSuccessBody,
    }
  }
  globalThis.fetch = contractFetch

  assert.deepEqual(opsIntakeStatus(), {
    status: 'ready',
    target: 'https://supermega-machine.vercel.app/api/intake',
    contract: 'body_secret',
  })

  assert.deepEqual(publicContactStatus(), {
    status: 'ready',
    service: 'supermega-contact',
  })
  process.env.SHOP_PIPELINE_URL = 'https://pos.supermega.dev.evil.example/api/pipeline-leads'
  assert.equal(contactDiagnostics().shop_pipeline.status, 'invalid_target')
  assert.deepEqual(publicContactStatus(), { status: 'degraded', service: 'supermega-contact' })
  delete process.env.SHOP_PIPELINE_URL
  assert.equal(hasStatusDiagnosticsAccess({ headers: { 'x-ops-key': opsKey } }), true)
  assert.equal(hasStatusDiagnosticsAccess({ headers: { 'x-ops-key': `${opsKey}-wrong` } }), false)

  const publicStatus = await invokeStatus('/api/contact-submissions/status')
  assert.equal(publicStatus.statusCode, 200)
  assert.deepEqual(publicStatus.body, { status: 'ready', service: 'supermega-contact' })
  const publicBody = JSON.stringify(publicStatus.body).toLowerCase()
  for (const forbidden of ['table', 'env', 'email', 'target', 'deskpos', 'supabase', 'resend']) {
    assert.equal(publicBody.includes(forbidden), false, `public_status_exposes_${forbidden}`)
  }

  for (const suppliedKey of ['', `${opsKey}-wrong`]) {
    const protectedStatus = await invokeStatus('/api/contact-submissions/status?detail=1', suppliedKey ? { 'x-ops-key': suppliedKey } : {})
    assert.equal(protectedStatus.statusCode, 401)
    assert.deepEqual(protectedStatus.body, { status: 'error', reason: 'operator_auth_required' })
  }

  const authorizedStatus = await invokeStatus('/api/contact-submissions/status?detail=1', { 'x-ops-key': opsKey })
  assert.equal(authorizedStatus.statusCode, 200)
  assert.deepEqual(authorizedStatus.body, contactDiagnostics())
  assert.equal(authorizedStatus.body.shop_pipeline.mode, 'public_contact_to_shop_queue')
  assert.equal(Object.hasOwn(authorizedStatus.body, 'deskpos_pipeline'), false)

  const receipt = publicSubmissionReceipt({ lead_id: 'LEAD-RECEIPT-1' })
  assert.deepEqual(receipt, {
    status: 'ready',
    message: 'Request received.',
    next_step: 'We will review the request and reply to the submitted email.',
    reference: 'LEAD-RECEIPT-1',
  })
  assert.deepEqual(Object.keys(receipt).sort(), ['message', 'next_step', 'reference', 'status'])
  assert.deepEqual(publicSubmissionReceipt(), {
    status: 'ready',
    message: 'Request received.',
    next_step: 'We will review the request and reply to the submitted email.',
  })
  assert.deepEqual(publicSubmissionFailure(), {
    status: 'error',
    reason: 'submission_unavailable',
    message: 'Request could not be received. Please try again later.',
  })

  let receiptHtmlBody = ''
  const receiptHeaders = {}
  const receiptResponse = {
    statusCode: 0,
    setHeader(name, value) {
      receiptHeaders[name.toLowerCase()] = value
    },
    end(body = '') {
      receiptHtmlBody = body
    },
  }
  receiptHtml(receiptResponse, {
    lead_id: 'LEAD-RECEIPT-1',
    task_id: 'TASK-INTERNAL-1',
    company: 'Example Co',
    email: 'buyer@example.com',
    requested_package: 'Internal route',
  })
  assert.equal(receiptResponse.statusCode, 200)
  assert.equal(receiptHeaders['cache-control'], 'no-store')
  for (const required of [
    'Request received.',
    'LEAD-RECEIPT-1',
    'Example Co',
    'buyer@example.com',
    'Nothing is connected, changed, or sent on your behalf until you approve it.',
    'class="terminal-mark"',
    'supermega<span class="domain">.dev</span>',
    'class="response-shell"',
    'Back to supermega.dev',
  ]) {
    assert.equal(receiptHtmlBody.includes(required), true, `receipt_missing_${required}`)
  }
  for (const forbidden of [
    'TASK-INTERNAL-1',
    'Internal route',
    'Source pack room',
    'App access',
    'swanhtet@supermega.dev',
    'SUPERMEGA.dev',
    'radial-gradient',
    'border-radius: 28px',
    'border-radius: 999px',
    'letter-spacing: -.07em',
  ]) {
    assert.equal(receiptHtmlBody.includes(forbidden), false, `receipt_exposes_${forbidden}`)
  }

  let errorHtmlBody = ''
  const errorHeaders = {}
  const errorResponse = {
    statusCode: 0,
    setHeader(name, value) {
      errorHeaders[name.toLowerCase()] = value
    },
    end(body = '') {
      errorHtmlBody = body
    },
  }
  html(errorResponse, 400, 'Missing details.', 'Please include your name, work email, company, and the workflow to fix first.')
  assert.equal(errorResponse.statusCode, 400)
  assert.equal(errorHeaders['cache-control'], 'no-store')
  for (const required of [
    'Missing details.',
    'Back to contact',
    'class="terminal-mark"',
    'supermega<span class="domain">.dev</span>',
    'class="response-shell"',
  ]) {
    assert.equal(errorHtmlBody.includes(required), true, `error_response_missing_${required}`)
  }
  for (const forbidden of ['SUPERMEGA.dev', 'radial-gradient', 'border-radius: 28px', 'border-radius: 999px', 'letter-spacing: -.07em']) {
    assert.equal(errorHtmlBody.includes(forbidden), false, `error_response_retired_${forbidden}`)
  }

  for (const retiredResponseFragment of [
    'submission: publicSubmission',
    'owner_onboarding_alert: firstProofTask.owner_onboarding_alert',
    'pipeline_action: pipelineAction',
    'shop_pipeline: shopPipeline',
    'ops_intake: opsIntake',
    'fallback_email: notifyEmail',
    "reason: 'rate_limited', rate",
  ]) {
    assert.equal(handlerSource.includes(retiredResponseFragment), false, `public_response_exposes_${retiredResponseFragment}`)
  }
  assert.equal(handlerSource.includes('json(res, 200, publicSubmissionReceipt(record))'), true)
  assert.equal(handlerSource.includes('emitContactRoutingEvent({'), true)
  assert.equal(handlerSource.match(/json\(res, 502, publicSubmissionFailure\(\)\)/g)?.length, 4)

  const routingEvent = buildContactRoutingEvent({
    record: {
      lead_id: 'LEAD-ROUTING-1',
      task_id: 'TASK-ROUTING-1',
      product_area: 'Shop',
      template_id: 'shop-private-workspace',
      submitted_at: '2026-07-15T12:00:00.000Z',
      name: 'Private Person',
      email: 'private@example.com',
      phone: '+959000000000',
      company: 'Private Company',
      goal: 'Private workflow detail',
    },
    ledger: { status: 'ready', adapter: 'vercel_postgres_neon' },
    pipelineAction: { status: 'ready', adapter: 'vercel_blob_private' },
    webhook: { status: 'skipped', reason: 'webhook_not_configured' },
    shopPipeline: { status: 'ready', duplicate: false, lead_count: 2, shop_lead_id: 'PRIVATE-SHOP-ID' },
    opsIntake: { status: 'ready', duplicate: false, fit_score: 84, lead_id: 'PRIVATE-OPS-ID' },
    delivery: { status: 'ready', email_id: 'PRIVATE-EMAIL-ID', to: 'private@example.com' },
    confirmation: { status: 'skipped', reason: 'confirmation_disabled' },
    telegram: { status: 'skipped', reason: 'telegram_not_configured' },
    sheets: { status: 'skipped', reason: 'sheets_not_configured' },
  })
  assert.deepEqual(routingEvent, {
    event: 'supermega.contact.routed',
    version: 1,
    reference: 'LEAD-ROUTING-1',
    task_reference: 'TASK-ROUTING-1',
    product_area: 'Shop',
    template_id: 'shop-private-workspace',
    submitted_at: '2026-07-15T12:00:00.000Z',
    durable: true,
    notified: true,
    sinks: {
      lead_ledger: { status: 'ready', adapter: 'vercel_postgres_neon' },
      pipeline_action: { status: 'ready', adapter: 'vercel_blob_private' },
      webhook: { status: 'skipped', reason: 'webhook_not_configured' },
      shop_pipeline: { status: 'ready', lead_count: 2, duplicate: false },
      ops_intake: { status: 'ready', duplicate: false },
      owner_notification: { status: 'ready' },
      requester_confirmation: { status: 'skipped', reason: 'confirmation_disabled' },
      telegram: { status: 'skipped', reason: 'telegram_not_configured' },
      sheets: { status: 'skipped', reason: 'sheets_not_configured' },
    },
  })
  const serializedRoutingEvent = JSON.stringify(routingEvent)
  for (const privateValue of [
    'Private Person',
    'private@example.com',
    '+959000000000',
    'Private Company',
    'Private workflow detail',
    'PRIVATE-SHOP-ID',
    'PRIVATE-OPS-ID',
    'PRIVATE-EMAIL-ID',
  ]) {
    assert.equal(serializedRoutingEvent.includes(privateValue), false, `routing_event_exposes_${privateValue}`)
  }

  const healthGet = await invokeHealth('GET')
  assert.equal(healthGet.statusCode, 200)
  assert.deepEqual(healthGet.body, { ok: true, status: 'ready', service: 'supermega-public-site' })
  assert.equal(healthGet.headers['cache-control'], 'no-store')

  const healthHead = await invokeHealth('HEAD')
  assert.equal(healthHead.statusCode, 200)
  assert.equal(healthHead.rawBody, '')

  const healthPost = await invokeHealth('POST')
  assert.equal(healthPost.statusCode, 405)
  assert.equal(healthPost.headers.allow, 'GET, HEAD')
  assert.deepEqual(healthPost.body, { ok: false, status: 'method_not_allowed', service: 'supermega-public-site' })

  const requestStub = { headers: {}, socket: { remoteAddress: '127.0.0.1' } }
  const shopRecord = buildLeadRecord({
    leadId: 'LEAD-SHOP-1',
    taskId: 'TASK-SHOP-1',
    payload: {
      name: 'Shop Buyer',
      email: 'shop@example.com',
      company: 'Example Shop',
      goal: 'Set up checkout and stock from our approved catalog.',
      page_path: '/contact/?from=shop-workspace',
    },
    req: requestStub,
  })
  const plantRecord = buildLeadRecord({
    leadId: 'LEAD-PLANT-1',
    taskId: 'TASK-PLANT-1',
    payload: {
      name: 'Plant Buyer',
      email: 'plant@example.com',
      company: 'Example Plant',
      goal: 'Set up a production and quality risk queue.',
      page_path: '/contact/?from=plant-workspace',
    },
    req: requestStub,
  })
  assert.equal(isShopLead(shopRecord), true)
  assert.equal(isShopLead({ template_id: 'shop-private-workspace' }), true)
  assert.equal(isShopLead({ template_id: 'deskpos-quickstart' }), true)
  assert.equal(isShopLead({ page_path: '/contact/?from=shop-workspace' }), true)
  assert.equal(isShopLead(plantRecord), false)
  assert.equal(isShopLead({ goal: 'Help with a weekly management report.' }), false)

  const shopPayload = shopPipelinePayload(shopRecord)
  assert.equal(shopPayload.businessName, 'Example Shop')
  assert.equal(shopPayload.externalId, 'LEAD-SHOP-1')
  assert.equal(shopPayload.vertical, 'retail')
  assert.match(shopPayload.notes, /Product: Shop/)
  assert.match(shopPayload.notes, /Template: shop-private-workspace/)
  assert.match(shopPayload.notes, /Onboarding: workspace_request/)
  assert.match(shopPayload.notes, /First proof: One private Shop workspace/)

  const shopForward = await forwardShopPipeline({ record: shopRecord })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://pos.supermega.dev/api/pipeline-leads')
  assert.equal(calls[0].options.method, 'POST')
  assert.equal(calls[0].options.redirect, 'error')
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${shopIngestToken}`)
  assert.deepEqual(JSON.parse(calls[0].options.body), shopPayload)
  assert.deepEqual(shopForward, {
    status: 'ready',
    target: 'https://pos.supermega.dev/api/pipeline-leads',
    duplicate: false,
    lead_count: 1,
    shop_lead_id: 'SHOP-LEAD-1',
  })
  assert.equal(JSON.stringify(shopForward).includes(shopIngestToken), false)
  assert.deepEqual(await forwardShopPipeline({ record: plantRecord }), {
    status: 'skipped',
    reason: 'not_shop_lead',
  })
  assert.equal(calls.length, 1)

  const retryCalls = []
  globalThis.fetch = async (url, options) => {
    retryCalls.push({ url, options })
    if (retryCalls.length === 1) {
      return { ok: false, status: 503, json: async () => ({ ok: false }) }
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ ...shopSuccessBody, duplicate: true }),
    }
  }
  assert.deepEqual(await forwardShopPipeline({ record: shopRecord }), {
    status: 'ready',
    target: 'https://pos.supermega.dev/api/pipeline-leads',
    duplicate: true,
    lead_count: 1,
    shop_lead_id: 'SHOP-LEAD-1',
  })
  assert.equal(retryCalls.length, 2)
  for (const call of retryCalls) {
    assert.equal(call.url, 'https://pos.supermega.dev/api/pipeline-leads')
    assert.equal(call.options.redirect, 'error')
    assert.equal(call.options.headers.Authorization, `Bearer ${shopIngestToken}`)
    assert.deepEqual(JSON.parse(call.options.body), shopPayload)
  }

  const networkCalls = []
  globalThis.fetch = async (url, options) => {
    networkCalls.push({ url, options })
    if (networkCalls.length === 1) throw new TypeError('temporary network failure')
    return { ok: true, status: 200, json: async () => shopSuccessBody }
  }
  assert.equal((await forwardShopPipeline({ record: shopRecord })).status, 'ready')
  assert.equal(networkCalls.length, 2)

  const malformedCalls = []
  globalThis.fetch = async (url, options) => {
    malformedCalls.push({ url, options })
    return { ok: true, status: 200, json: async () => ({ accepted: true }) }
  }
  assert.deepEqual(await forwardShopPipeline({ record: shopRecord }), {
    status: 'error',
    reason: 'shop_invalid_response',
    target: 'https://pos.supermega.dev/api/pipeline-leads',
  })
  assert.equal(malformedCalls.length, 2)

  const rejectedCalls = []
  globalThis.fetch = async (url, options) => {
    rejectedCalls.push({ url, options })
    return { ok: true, status: 200, json: async () => ({ ok: true, accepted: false }) }
  }
  assert.deepEqual(await forwardShopPipeline({ record: shopRecord }), {
    status: 'error',
    reason: 'shop_rejected',
    target: 'https://pos.supermega.dev/api/pipeline-leads',
  })
  assert.equal(rejectedCalls.length, 1)

  const unauthorizedCalls = []
  globalThis.fetch = async (url, options) => {
    unauthorizedCalls.push({ url, options })
    return { ok: false, status: 401, json: async () => ({ error: 'Unauthorized.' }) }
  }
  assert.deepEqual(await forwardShopPipeline({ record: shopRecord }), {
    status: 'error',
    reason: 'shop_401',
    target: 'https://pos.supermega.dev/api/pipeline-leads',
  })
  assert.equal(unauthorizedCalls.length, 1)
  globalThis.fetch = contractFetch

  const result = await forwardOpsIntake({
    record: {
      lead_id: 'LEAD-PUBLIC-1',
      name: 'Test Buyer',
      email: 'buyer@example.com',
      phone: '+959000000000',
      company: 'Example Co',
      requested_package: 'General enquiry',
      product_area: 'Operations',
      goal: 'Replace a manual daily reconciliation task.',
    },
  })

  assert.equal(calls.length, 2)
  const opsCall = calls[1]
  assert.equal(opsCall.url, 'https://supermega-machine.vercel.app/api/intake')
  assert.equal(opsCall.options.method, 'POST')
  assert.equal(opsCall.options.redirect, 'error')
  assert.equal(opsCall.options.headers.Authorization, `Bearer ${secret}`)
  const payload = JSON.parse(opsCall.options.body)
  assert.equal(payload.secret, secret)
  assert.equal(payload.external_id, 'LEAD-PUBLIC-1')
  assert.equal(payload.source, 'website')
  assert.match(payload.workflow, /manual daily reconciliation/i)
  assert.deepEqual(result, {
    status: 'ready',
    target: 'https://supermega-machine.vercel.app/api/intake',
    lead_id: 'OPS-LEAD-1',
    duplicate: false,
    fit_score: 84,
  })
  assert.equal(JSON.stringify(result).includes(secret), false)

  const opsRetryCalls = []
  globalThis.fetch = async (url, options) => {
    opsRetryCalls.push({ url, options })
    if (opsRetryCalls.length === 1) {
      return { ok: false, status: 503, json: async () => ({ ok: false }) }
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ ...opsSuccessBody, duplicate: true }),
    }
  }
  assert.deepEqual(await forwardOpsIntake({ record: {
    lead_id: 'LEAD-PUBLIC-1',
    name: 'Test Buyer',
    email: 'buyer@example.com',
    goal: 'Replace a manual daily reconciliation task.',
  } }), {
    status: 'ready',
    target: 'https://supermega-machine.vercel.app/api/intake',
    lead_id: 'OPS-LEAD-1',
    duplicate: true,
    fit_score: 84,
  })
  assert.equal(opsRetryCalls.length, 2)
  assert.equal(opsRetryCalls[0].options.body, opsRetryCalls[1].options.body)
  for (const call of opsRetryCalls) {
    assert.equal(call.url, 'https://supermega-machine.vercel.app/api/intake')
    assert.equal(call.options.redirect, 'error')
    assert.equal(call.options.headers.Authorization, `Bearer ${secret}`)
    assert.equal(JSON.parse(call.options.body).external_id, 'LEAD-PUBLIC-1')
  }

  const opsNetworkCalls = []
  globalThis.fetch = async (url, options) => {
    opsNetworkCalls.push({ url, options })
    if (opsNetworkCalls.length === 1) throw new TypeError('temporary network failure')
    return { ok: true, status: 200, json: async () => opsSuccessBody }
  }
  assert.equal((await forwardOpsIntake({ record: { lead_id: 'LEAD-NETWORK-1', name: 'Network Retry' } })).status, 'ready')
  assert.equal(opsNetworkCalls.length, 2)

  const opsTimeoutCalls = []
  globalThis.fetch = async (url, options) => {
    opsTimeoutCalls.push({ url, options })
    if (opsTimeoutCalls.length === 1) throw Object.assign(new Error('request expired'), { name: 'TimeoutError' })
    return { ok: true, status: 200, json: async () => opsSuccessBody }
  }
  assert.equal((await forwardOpsIntake({ record: { lead_id: 'LEAD-TIMEOUT-1', name: 'Timeout Retry' } })).status, 'ready')
  assert.equal(opsTimeoutCalls.length, 2)

  const opsMalformedCalls = []
  globalThis.fetch = async (url, options) => {
    opsMalformedCalls.push({ url, options })
    return { ok: true, status: 200, json: async () => ({ ok: true, accepted: true }) }
  }
  assert.deepEqual(await forwardOpsIntake({ record: { lead_id: 'LEAD-MALFORMED-1', name: 'Malformed Response' } }), {
    status: 'error',
    reason: 'ops_intake_invalid_response',
    target: 'https://supermega-machine.vercel.app/api/intake',
  })
  assert.equal(opsMalformedCalls.length, 2)

  const opsRejectedCalls = []
  globalThis.fetch = async (url, options) => {
    opsRejectedCalls.push({ url, options })
    return { ok: true, status: 200, json: async () => ({ ok: true, accepted: false }) }
  }
  assert.deepEqual(await forwardOpsIntake({ record: { lead_id: 'LEAD-REJECTED-1', name: 'Rejected Response' } }), {
    status: 'error',
    reason: 'ops_intake_rejected',
    target: 'https://supermega-machine.vercel.app/api/intake',
  })
  assert.equal(opsRejectedCalls.length, 1)

  const opsUnauthorizedCalls = []
  globalThis.fetch = async (url, options) => {
    opsUnauthorizedCalls.push({ url, options })
    return { ok: false, status: 401, json: async () => ({ ok: false }) }
  }
  assert.deepEqual(await forwardOpsIntake({ record: { lead_id: 'LEAD-UNAUTHORIZED-1', name: 'Unauthorized Response' } }), {
    status: 'error',
    reason: 'ops_intake_401',
    target: 'https://supermega-machine.vercel.app/api/intake',
  })
  assert.equal(opsUnauthorizedCalls.length, 1)
  globalThis.fetch = contractFetch

  process.env.SUPERMEGA_OPS_INTAKE_URL = 'https://supermega-machine.vercel.app.evil.example/api/intake'
  const unsafe = await forwardOpsIntake({ record: {} })
  assert.deepEqual(unsafe, { status: 'skipped', reason: 'unsafe_ops_intake_url' })
  assert.equal(calls.length, 2)

  delete process.env.SHOP_PIPELINE_INGEST_TOKEN
  assert.equal(contactDiagnostics().shop_pipeline.status, 'not_configured')
  assert.deepEqual(publicContactStatus(), { status: 'degraded', service: 'supermega-contact' })
  assert.deepEqual(await forwardShopPipeline({ record: shopRecord }), {
    status: 'skipped',
    reason: 'shop_pipeline_not_configured',
  })
  assert.equal(calls.length, 2)

  delete process.env.SUPERMEGA_INTAKE_SECRET
  delete process.env.SUPERMEGA_OPS_INTAKE_URL
  const missing = await forwardOpsIntake({ record: {} })
  assert.deepEqual(missing, { status: 'skipped', reason: 'ops_intake_not_configured' })
} finally {
  globalThis.fetch = originalFetch
  if (originalSecret === undefined) delete process.env.SUPERMEGA_INTAKE_SECRET
  else process.env.SUPERMEGA_INTAKE_SECRET = originalSecret
  if (originalUrl === undefined) delete process.env.SUPERMEGA_OPS_INTAKE_URL
  else process.env.SUPERMEGA_OPS_INTAKE_URL = originalUrl
  if (originalShopPipelineUrl === undefined) delete process.env.SHOP_PIPELINE_URL
  else process.env.SHOP_PIPELINE_URL = originalShopPipelineUrl
  if (originalLegacyDeskposPipelineUrl === undefined) delete process.env.DESKPOS_PIPELINE_URL
  else process.env.DESKPOS_PIPELINE_URL = originalLegacyDeskposPipelineUrl
  if (originalShopPipelineIngestToken === undefined) delete process.env.SHOP_PIPELINE_INGEST_TOKEN
  else process.env.SHOP_PIPELINE_INGEST_TOKEN = originalShopPipelineIngestToken
  if (originalOpsKey === undefined) delete process.env.SUPERMEGA_OPS_KEY
  else process.env.SUPERMEGA_OPS_KEY = originalOpsKey
  if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL
  else process.env.SUPABASE_URL = originalSupabaseUrl
  if (originalSupabaseServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceRoleKey
  if (originalResendApiKey === undefined) delete process.env.RESEND_API_KEY
  else process.env.RESEND_API_KEY = originalResendApiKey
}

console.log('contact_ops_intake_handoff=ready')
