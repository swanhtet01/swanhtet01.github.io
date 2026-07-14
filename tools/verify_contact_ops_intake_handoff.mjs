import assert from 'node:assert/strict'
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
} = handler.__test

assert.equal(typeof forwardOpsIntake, 'function')
assert.equal(isSafeOpsIntakeUrl('https://supermega-machine.vercel.app/api/intake'), true)
assert.equal(isSafeOpsIntakeUrl('https://supermega-machine.vercel.app.evil.example/api/intake'), false)
assert.equal(isSafeOpsIntakeUrl('https://supermega-machine.vercel.app/api/intake?redirect=1'), false)

const originalFetch = globalThis.fetch
const originalSecret = process.env.SUPERMEGA_INTAKE_SECRET
const originalUrl = process.env.SUPERMEGA_OPS_INTAKE_URL
const originalOpsKey = process.env.SUPERMEGA_OPS_KEY
const originalSupabaseUrl = process.env.SUPABASE_URL
const originalSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const originalResendApiKey = process.env.RESEND_API_KEY
const calls = []
const secret = 'contract-test-secret'
const opsKey = 'contract-test-ops-key'

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
  process.env.SUPABASE_URL = 'https://contract-test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'contract-test-service-role-key'
  process.env.RESEND_API_KEY = 'contract-test-resend-key'
  delete process.env.SUPERMEGA_OPS_INTAKE_URL
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
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

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://supermega-machine.vercel.app/api/intake')
  assert.equal(calls[0].options.method, 'POST')
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${secret}`)
  const payload = JSON.parse(calls[0].options.body)
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
  assert.equal(calls.length, 1)

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
