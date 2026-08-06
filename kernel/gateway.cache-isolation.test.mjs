// Tenant-safe response-cache containment. Runs fully offline with the memory store and stubbed providers.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'

const DATABASE_ENV = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_KEY',
  'POSTGRES_URL_NON_POOLING',
  'POSTGRES_URL',
  'DATABASE_URL_UNPOOLED',
  'POSTGRES_PRISMA_URL',
  'SUPERMEGA_DATABASE_URL',
  'DATABASE_URL',
]
for (const key of DATABASE_ENV) delete process.env[key]
process.env.SUPERMEGA_GATEWAY_PERSIST = '1'
process.env.ANTHROPIC_API_KEY = 'sk-ant-test-not-a-real-key'
delete process.env.CLAUDE_API_KEY
delete process.env.OPENROUTER_API_KEY

const { complete } = await import('./gateway.mjs')
const store = (await import('./store.mjs')).default
assert.equal(store.mode, 'memory', 'cache-isolation tests must never touch a real database')

const realFetch = globalThis.fetch
const wireCalls = []
globalThis.fetch = async (url, opts = {}) => {
  const body = JSON.parse(opts.body)
  wireCalls.push({ url: String(url), body })
  if (String(url).includes('openrouter.ai')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: body.tools
          ? { tool_calls: [{ function: { arguments: JSON.stringify({ value: 'openrouter' }) } }] }
          : { content: `openrouter-${wireCalls.length}` } }],
        usage: { prompt_tokens: 7, completion_tokens: 3 },
      }),
      text: async () => '',
    }
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({
      content: body.tools
        ? [{ type: 'tool_use', name: 'emit', input: { value: 'anthropic' } }]
        : [{ type: 'text', text: `anthropic-${wireCalls.length}` }],
      usage: { input_tokens: 7, output_tokens: 3 },
    }),
    text: async () => '',
  }
}

after(() => { globalThis.fetch = realFetch })

const ask = (content, options = {}) => complete({
  system: 'cache-isolation-test',
  messages: [{ role: 'user', content }],
  ...options,
})

test('same explicit hint cannot collide across tenants', async () => {
  const before = wireCalls.length
  const first = await ask('same request', { clientId: 'tenant-cache-a', cacheKey: 'shared-hint' })
  const second = await ask('same request', { clientId: 'tenant-cache-b', cacheKey: 'shared-hint' })

  assert.equal(wireCalls.length - before, 2, 'each tenant must execute its own provider call')
  assert.notEqual(first.text, second.text)
  assert.notEqual(second.cached, true)
})

test('explicit hint cannot bypass request identity', async () => {
  const before = wireCalls.length
  const first = await ask('request alpha', { clientId: 'tenant-explicit-bypass', cacheKey: 'same-hint' })
  const second = await ask('request beta', { clientId: 'tenant-explicit-bypass', cacheKey: 'same-hint' })

  assert.equal(wireCalls.length - before, 2, 'different requests must not alias through one explicit hint')
  assert.notEqual(first.text, second.text)
  assert.notEqual(second.cached, true)
})

test('reserved control-record prefixes are rejected case-insensitively', async () => {
  const before = wireCalls.length
  for (const cacheKey of [
    'company-work-order-record:customer-controlled',
    ' AGENT-COMPANY-SIGN-IN-CODE:customer-controlled ',
    'company-mission-record:customer-controlled',
  ]) {
    await assert.rejects(
      () => ask('reserved prefix', { clientId: 'tenant-reserved-prefix', cacheKey }),
      /gateway_reserved_cache_key/,
    )
  }
  assert.equal(wireCalls.length, before, 'reserved hints must fail before provider execution')
})

test('identical same-tenant context produces a deterministic cache hit', async () => {
  const before = wireCalls.length
  const options = { clientId: 'tenant-deterministic-hit', cacheKey: 'stable-hint', tier: 'bulk' }
  const first = await ask('deterministic request', options)
  const second = await ask('deterministic request', options)

  assert.equal(wireCalls.length - before, 1)
  assert.equal(first.cached, undefined)
  assert.equal(second.cached, true)
  assert.equal(second.text, first.text)
})

test('persistent response-cache keys contain only a versioned SHA-256 digest', async () => {
  const persistedKeys = []
  const originalPut = store.putCachedResponse
  store.putCachedResponse = async (key, payload) => {
    persistedKeys.push(key)
    return originalPut(key, payload)
  }
  try {
    await ask('raw request material must be hashed', {
      clientId: 'tenant-raw-material-must-not-leak',
      cacheKey: 'raw-caller-hint-must-not-leak',
    })
  } finally {
    store.putCachedResponse = originalPut
  }

  assert.equal(persistedKeys.length, 1)
  assert.match(persistedKeys[0], /^ai-response:v2:[a-f0-9]{64}$/)
  assert.doesNotMatch(persistedKeys[0], /tenant|caller|request/i)
})

test('full schema content participates in cache identity', async () => {
  const before = wireCalls.length
  const common = { clientId: 'tenant-schema-context', cacheKey: 'schema-hint' }
  const stringSchema = { title: 'SameTitle', type: 'object', properties: { value: { type: 'string' } }, required: ['value'] }
  const integerSchema = { title: 'SameTitle', type: 'object', properties: { value: { type: 'integer' } }, required: ['value'] }

  await ask('schema request', { ...common, schema: stringSchema })
  const second = await ask('schema request', { ...common, schema: integerSchema })

  assert.equal(wireCalls.length - before, 2, 'schemas with the same title but different contracts must not collide')
  assert.notEqual(second.cached, true)
})

test('provider and model route participate in cache identity', async () => {
  const before = wireCalls.length
  const options = { clientId: 'tenant-route-context', cacheKey: 'route-hint', tier: 'bulk' }
  const anthropic = await ask('route request', options)

  delete process.env.ANTHROPIC_API_KEY
  process.env.OPENROUTER_API_KEY = 'sk-or-test-not-a-real-key'
  try {
    const openrouter = await ask('route request', options)
    const openrouterHit = await ask('route request', options)
    assert.equal(wireCalls.length - before, 2, 'changing provider/model must miss once, then hit its own cache')
    assert.equal(anthropic.provider, 'anthropic')
    assert.equal(openrouter.provider, 'openrouter')
    assert.equal(openrouter.cached, undefined)
    assert.equal(openrouterHit.cached, true)
    assert.equal(openrouterHit.text, openrouter.text)
  } finally {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-not-a-real-key'
    delete process.env.OPENROUTER_API_KEY
  }
})
