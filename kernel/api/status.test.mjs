// Public status surface — shape + secret-safety. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildStatus } from './status.mjs'

test('buildStatus returns a complete, secret-safe snapshot', async () => {
  const s = await buildStatus()
  assert.equal(typeof s.ok, 'boolean')
  assert.equal(s.service, 'supermega-kernel')
  assert.ok(s.connectors.total > 0, 'connectors are registered')
  assert.ok('configured' in s.connectors && 'registrationErrors' in s.connectors)
  assert.ok(Array.isArray(s.ai.providers))
  assert.ok('stripe_configured' in s.money && 'stripe_webhook_configured' in s.money)
  assert.equal(typeof s.latency_ms, 'number')
  // Never leak a secret value through the public surface.
  const blob = JSON.stringify(s)
  assert.equal(/sk_(live|test)_|whsec_|Bearer |SUPABASE_SERVICE/.test(blob), false, 'no secret material in the payload')
})
