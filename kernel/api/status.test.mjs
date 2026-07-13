// Public status surface — shape + secret-safety. `node --test`.
import { readFile } from 'node:fs/promises'
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
  assert.deepEqual(s.agentCompany, {
    plannerReady: true,
    actionMode: 'draft_only',
    maxAgents: 2,
    maxRoleBudget: 8,
    probeMode: 'plan_only',
    modelRequest: false,
    durableClaimCreated: false,
    externalWrites: false,
  })
  assert.ok('stripe_configured' in s.money && 'stripe_webhook_configured' in s.money)
  assert.equal(typeof s.latency_ms, 'number')
  // Never leak a secret value through the public surface.
  const blob = JSON.stringify(s)
  assert.equal(/sk_(live|test)_|whsec_|Bearer |SUPABASE_SERVICE/.test(blob), false, 'no secret material in the payload')
})

test('planner failure makes public health fail closed without leaking the reason', async () => {
  const s = await buildStatus({
    planCompanyCycle: async () => ({ ok: false, reason: 'private_planner_failure_detail' }),
  })
  assert.equal(s.ok, false)
  assert.deepEqual(s.agentCompany, {
    plannerReady: false,
    actionMode: 'unavailable',
    maxAgents: 2,
    maxRoleBudget: 8,
    probeMode: 'plan_only',
    modelRequest: false,
    durableClaimCreated: false,
    externalWrites: null,
  })
  assert.doesNotMatch(JSON.stringify(s), /private_planner_failure_detail/)
})

test('public status imports only the Agent Company planner, never its runner', async () => {
  const source = await readFile(new URL('./status.mjs', import.meta.url), 'utf8')
  assert.match(source, /planCompanyCycle/)
  assert.doesNotMatch(source, /runCompanyCycle|SUPERMEGA_OPS_KEY|x-ops-key|gateway\.complete/)
})
