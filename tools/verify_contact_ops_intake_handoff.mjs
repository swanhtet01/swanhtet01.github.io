import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const handler = require('../api/contact-submissions.js')
const { forwardOpsIntake, isSafeOpsIntakeUrl, opsIntakeStatus } = handler.__test

assert.equal(typeof forwardOpsIntake, 'function')
assert.equal(isSafeOpsIntakeUrl('https://supermega-machine.vercel.app/api/intake'), true)
assert.equal(isSafeOpsIntakeUrl('https://supermega-machine.vercel.app.evil.example/api/intake'), false)
assert.equal(isSafeOpsIntakeUrl('https://supermega-machine.vercel.app/api/intake?redirect=1'), false)

const originalFetch = globalThis.fetch
const originalSecret = process.env.SUPERMEGA_INTAKE_SECRET
const originalUrl = process.env.SUPERMEGA_OPS_INTAKE_URL
const calls = []
const secret = 'contract-test-secret'

try {
  process.env.SUPERMEGA_INTAKE_SECRET = secret
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
}

console.log('contact_ops_intake_handoff=ready')
