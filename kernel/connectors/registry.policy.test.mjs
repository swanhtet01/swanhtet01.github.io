import assert from 'node:assert/strict'
import test from 'node:test'

import aiGateway from './ai-gateway.mjs'
import {
  connectorAllowedByProviderPolicy,
  get,
  healthAll,
  list,
  register,
} from './registry.mjs'

const ENV_KEYS = [
  'SUPERMEGA_AI_PROVIDER_POLICY',
  'SUPERMEGA_OLLAMA_ENABLED',
  'SUPERMEGA_OLLAMA_MODEL',
  'VERCEL',
  'VERCEL_ENV',
  'AWS_LAMBDA_FUNCTION_NAME',
]
const saved = new Map(ENV_KEYS.map((key) => [key, process.env[key]]))

function restoreEnvironment() {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

test.after(restoreEnvironment)

test('local-only hides direct cloud AI connectors and never runs their health probes', async () => {
  let cloudHealthCalls = 0
  register({
    key: 'ai-test-cloud-policy',
    name: 'Test cloud model',
    category: 'ai',
    configured: () => true,
    health: async () => {
      cloudHealthCalls += 1
      return { ok: true }
    },
  })
  register({
    key: 'data-test-policy',
    name: 'Test data connector',
    category: 'data',
    configured: () => true,
    health: async () => ({ ok: true }),
  })

  process.env.SUPERMEGA_AI_PROVIDER_POLICY = 'local-only'
  assert.equal(get('ai-test-cloud-policy'), null)
  assert.ok(get('data-test-policy'))
  assert.equal(connectorAllowedByProviderPolicy({ key: 'ai-test-cloud-policy', category: 'ai' }), false)
  assert.equal(list().find((entry) => entry.key === 'ai-test-cloud-policy').configured, false)

  const report = await healthAll({ timeoutMs: 100 })
  const cloud = report.connectors.find((entry) => entry.key === 'ai-test-cloud-policy')
  assert.deepEqual({ configured: cloud.configured, ok: cloud.ok, detail: cloud.detail }, {
    configured: false,
    ok: false,
    detail: 'disabled_by_local_only_policy',
  })
  assert.equal(cloudHealthCalls, 0)
})

test('invalid provider policy also fails closed for direct AI connectors', async () => {
  process.env.SUPERMEGA_AI_PROVIDER_POLICY = 'typo-policy'
  assert.equal(get('ai-test-cloud-policy'), null)
  const report = await healthAll({ timeoutMs: 100 })
  assert.equal(report.connectors.find((entry) => entry.key === 'ai-test-cloud-policy').detail, 'disabled_by_invalid_provider_policy')
})

test('cloud-enabled policy preserves explicitly configured connector access', async () => {
  process.env.SUPERMEGA_AI_PROVIDER_POLICY = 'cloud-enabled'
  assert.ok(get('ai-test-cloud-policy'))
  const report = await healthAll({ timeoutMs: 100 })
  assert.equal(report.connectors.find((entry) => entry.key === 'ai-test-cloud-policy').ok, true)
})

test('AI gateway reports only the provider chain admitted by local-only policy without inference', async () => {
  process.env.SUPERMEGA_AI_PROVIDER_POLICY = 'local-only'
  process.env.SUPERMEGA_OLLAMA_ENABLED = '1'
  process.env.SUPERMEGA_OLLAMA_MODEL = 'llama3.2:1b'
  delete process.env.VERCEL
  delete process.env.VERCEL_ENV
  delete process.env.AWS_LAMBDA_FUNCTION_NAME

  assert.equal(aiGateway.configured(), true)
  assert.deepEqual(await aiGateway.health(), {
    ok: true,
    detail: 'policy=local-only; providers=ollama-local',
  })

  delete process.env.SUPERMEGA_OLLAMA_MODEL
  assert.equal(aiGateway.configured(), false)
  assert.deepEqual(await aiGateway.health(), {
    ok: false,
    detail: 'local_provider_unavailable',
  })
})
