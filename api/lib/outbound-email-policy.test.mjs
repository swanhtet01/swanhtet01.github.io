import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { getOutboundEmailPolicy } = require('./outbound-email-policy.js')

test('outbound email is disabled by default', () => {
  assert.deepEqual(getOutboundEmailPolicy({}), { allowed: false, reason: 'outbound_email_disabled' })
})

test('a single stale email flag cannot enable delivery', () => {
  assert.deepEqual(
    getOutboundEmailPolicy({ SUPERMEGA_EMAIL_SENDS_ENABLED: '1' }),
    { allowed: false, reason: 'outbound_email_locked' },
  )
})

test('delivery requires both explicit owner gates', () => {
  assert.deepEqual(
    getOutboundEmailPolicy({
      SUPERMEGA_OUTBOUND_EMAILS_ENABLED: '1',
      SUPERMEGA_OUTBOUND_EMAIL_APPROVAL: 'UNLOCK_SUPERMEGA_OUTBOUND_EMAIL_001',
    }),
    { allowed: true, reason: 'outbound_email_enabled' },
  )
})

test('every direct Resend sender checks the shared owner gate first', () => {
  const files = [
    '../contact-submissions.js',
    '../action-runner.js',
    '../lead.js',
    '../pipeline-control.js',
    '../sales-daily.js',
  ]

  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    assert.match(source, /outbound-email-policy/)
    assert.match(source, /getOutboundEmailPolicy\(\)/)
  }
})
