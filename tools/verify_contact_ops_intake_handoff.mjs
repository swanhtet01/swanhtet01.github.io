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
  publicSubmissionReceipt,
  publicSubmissionFailure,
  receiptHtml,
  buildLeadRecord,
  isDeskposLead,
  deskposPipelinePayload,
  forwardDeskposPipeline,
} = handler.__test

assert.equal(typeof forwardOpsIntake, 'function')
assert.equal(typeof buildLeadRecord, 'function')
assert.equal(typeof isDeskposLead, 'function')
assert.equal(typeof deskposPipelinePayload, 'function')
assert.equal(typeof forwardDeskposPipeline, 'function')
assert.equal(isSafeOpsIntakeUrl('https://supermega-machine.vercel.app/api/intake'), true)
assert.equal(isSafeOpsIntakeUrl('https://supermega-machine.vercel.app.evil.example/api/intake'), false)
assert.equal(isSafeOpsIntakeUrl('https://supermega-machine.vercel.app/api/intake?redirect=1'), false)

const originalFetch = globalThis.fetch
const originalSecret = process.env.SUPERMEGA_INTAKE_SECRET
const originalUrl = process.env.SUPERMEGA_OPS_INTAKE_URL
const originalDeskposPipelineUrl = process.env.DESKPOS_PIPELINE_URL
const originalShopPipelineIngestToken = process.env.SHOP_PIPELINE_INGEST_TOKEN
const originalOpsKey = process.env.SUPERMEGA_OPS_KEY
const originalSupabaseUrl = process.env.SUPABASE_URL
const originalSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const originalResendApiKey = process.env.RESEND_API_KEY
const calls = []
const secret = 'contract-test-secret'
const opsKey = 'contract-test-ops-key'
const shopIngestToken = 'contract-test-shop-ingest-token'
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
  delete process.env.DESKPOS_PIPELINE_URL
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    if (url === 'https://pos.supermega.dev/api/pipeline-leads') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ accepted: true, duplicate: false, leadCount: 1, lead: { id: 'SHOP-LEAD-1' } }),
      }
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, lead_id: 'OPS-LEAD-1', fit_score: 84 }),
    }
  }

  assert.deepEqual(opsIntakeStatus(), {
    status: 'ready',
    target: 'https://supermega-machine.vercel.app/api/intake',
    contract: 'body_secret',
  })

  assert.deepEqual(publicContactStatus(), {
    status: 'ready',
    service: 'supermega-contact',
  })
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
  ]) {
    assert.equal(receiptHtmlBody.includes(required), true, `receipt_missing_${required}`)
  }
  for (const forbidden of [
    'TASK-INTERNAL-1',
    'Internal route',
    'Source pack room',
    'App access',
    'swanhtet@supermega.dev',
  ]) {
    assert.equal(receiptHtmlBody.includes(forbidden), false, `receipt_exposes_${forbidden}`)
  }

  for (const retiredResponseFragment of [
    'submission: publicSubmission',
    'owner_onboarding_alert: firstProofTask.owner_onboarding_alert',
    'pipeline_action: pipelineAction',
    'shop_pipeline: deskposPipeline',
    'ops_intake: opsIntake',
    'fallback_email: notifyEmail',
    "reason: 'rate_limited', rate",
  ]) {
    assert.equal(handlerSource.includes(retiredResponseFragment), false, `public_response_exposes_${retiredResponseFragment}`)
  }
  assert.equal(handlerSource.includes('json(res, 200, publicSubmissionReceipt(record))'), true)
  assert.equal(handlerSource.match(/json\(res, 502, publicSubmissionFailure\(\)\)/g)?.length, 4)

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
  assert.equal(isDeskposLead(shopRecord), true)
  assert.equal(isDeskposLead({ template_id: 'deskpos-quickstart' }), true)
  assert.equal(isDeskposLead({ page_path: '/contact/?from=shop-workspace' }), true)
  assert.equal(isDeskposLead(plantRecord), false)
  assert.equal(isDeskposLead({ goal: 'Help with a weekly management report.' }), false)

  const shopPayload = deskposPipelinePayload(shopRecord)
  assert.equal(shopPayload.businessName, 'Example Shop')
  assert.equal(shopPayload.externalId, 'LEAD-SHOP-1')
  assert.equal(shopPayload.vertical, 'retail')
  assert.match(shopPayload.notes, /Product: Shop/)
  assert.match(shopPayload.notes, /Template: deskpos-quickstart/)
  assert.match(shopPayload.notes, /Onboarding: workspace_request/)
  assert.match(shopPayload.notes, /First proof: One private Shop workspace/)

  const shopForward = await forwardDeskposPipeline({ record: shopRecord })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://pos.supermega.dev/api/pipeline-leads')
  assert.equal(calls[0].options.method, 'POST')
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
  assert.deepEqual(await forwardDeskposPipeline({ record: plantRecord }), {
    status: 'skipped',
    reason: 'not_shop_lead',
  })
  assert.equal(calls.length, 1)

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

  process.env.SUPERMEGA_OPS_INTAKE_URL = 'https://supermega-machine.vercel.app.evil.example/api/intake'
  const unsafe = await forwardOpsIntake({ record: {} })
  assert.deepEqual(unsafe, { status: 'skipped', reason: 'unsafe_ops_intake_url' })
  assert.equal(calls.length, 2)

  delete process.env.SHOP_PIPELINE_INGEST_TOKEN
  assert.equal(contactDiagnostics().shop_pipeline.status, 'not_configured')
  assert.deepEqual(await forwardDeskposPipeline({ record: shopRecord }), {
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
  if (originalDeskposPipelineUrl === undefined) delete process.env.DESKPOS_PIPELINE_URL
  else process.env.DESKPOS_PIPELINE_URL = originalDeskposPipelineUrl
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
