import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { handleWorkcellPlan } from './workcell-plan.mjs'

const KEY = 'ops-secret-0123456789abcdef012345'
const request = {
  method: 'POST',
  headers: { 'x-ops-key': KEY },
  body: {
    scope: 'swanhtet01s-projects',
    manifest: {
      version: 1,
      clientSlug: 'acme-trading',
      clientName: 'Acme Trading',
      workcells: ['owner-command'],
      timeZone: 'Asia/Yangon',
      currency: 'MMK',
      lookbackHours: 24,
      clickupListId: '',
      deliveryUtc: '01:30',
    },
  },
}

test('activation planner is ops-gated and method-restricted', async () => {
  assert.equal((await handleWorkcellPlan(request, { env: {} })).status, 503)
  assert.equal((await handleWorkcellPlan({ ...request, headers: {} }, { opsKey: KEY })).status, 401)
  assert.equal((await handleWorkcellPlan({ ...request, method: 'GET' }, { opsKey: KEY })).status, 405)
})

test('activation planner returns a normalized no-secret plan without mutation', async () => {
  const result = await handleWorkcellPlan(request, {
    opsKey: KEY,
    randomBytes: () => Buffer.from('not-returned'),
  })
  assert.equal(result.status, 200)
  assert.equal(result.json.mode, 'plan')
  assert.equal(result.json.mutation, false)
  assert.equal(result.json.secretValuesAccepted, false)
  assert.equal(result.json.manifest.projectName, 'supermega-wc-acme-trading')
  assert.equal(result.json.plan.confirmation, 'PROVISION supermega-wc-acme-trading')
  assert.ok(result.json.plan.missingSecretInputs.includes('SUPERMEGA_NEW_CLIENT_SUPABASE_URL'))
  assert.ok(result.json.plan.missingSecretInputs.includes('SUPERMEGA_NEW_CLIENT_TELEGRAM_BOT_TOKEN'))
  assert.equal(result.json.plan.missingSecretInputs.some((name) => /PAYPAL|PIPEDRIVE|CLICKUP/.test(name)), false)
  assert.ok(result.json.plan.requiredSecretInputs.some((name) => name.startsWith('SUPERMEGA_NEW_CLIENT_SUPABASE_DB_URL ')))
  assert.equal(result.json.plan.schemaBootstrap.supplied, false)
  assert.equal(result.json.plan.schemaBootstrap.targetProjectRef, null)
  assert.equal(result.json.plan.schemaBootstrap.deployedToVercel, false)
  assert.equal(result.json.plan.sourceDirectory, null)
  assert.doesNotMatch(JSON.stringify(result.json), /not-returned|ops-secret/)
})

test('activation planner preserves canonical manifest validation', async () => {
  const invalid = await handleWorkcellPlan({
    ...request,
    body: { ...request.body, manifest: { ...request.body.manifest, workcells: ['invented'] } },
  }, { opsKey: KEY })
  assert.equal(invalid.status, 400)
  assert.match(invalid.json.reason, /manifest_unknown_workcell/)
})

test('planner runtime cannot enter the mutating provision path', async () => {
  const source = await readFile(new URL('./workcell-plan.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /applyProvisionPlan|vercel deploy|vercel env|child_process/)
})
