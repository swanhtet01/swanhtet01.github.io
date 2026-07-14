import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const STORE_ENV = [
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

function captureEnvironment() {
  return Object.fromEntries(STORE_ENV.map((name) => [name, {
    present: Object.hasOwn(process.env, name),
    value: process.env[name],
  }]))
}

function restoreEnvironment(saved) {
  for (const name of STORE_ENV) {
    if (saved[name].present) process.env[name] = saved[name].value
    else delete process.env[name]
  }
}

test('cache transition is compare-and-swap in memory and uses bounded PostgREST filters', async () => {
  const saved = captureEnvironment()
  const originalFetch = globalThis.fetch
  const planHash = 'a'.repeat(64)
  try {
    for (const name of STORE_ENV) delete process.env[name]
    const memoryStore = await import(`./store.mjs?agent-company-memory-transition=${Date.now()}`)
    const key = `agent-company-transition-${Date.now()}`
    await memoryStore.putCachedResponse(key, { status: 'planned', planHash, revision: 1, input: { private: true } })
    const first = await memoryStore.transitionCachedResponse(
      key,
      { status: 'planned', planHash, revision: 1 },
      { status: 'cancelled', planHash, revision: 2, input: null },
    )
    assert.equal(first.updated, true)
    assert.deepEqual(await memoryStore.getCachedResponse(key), { status: 'cancelled', planHash, revision: 2, input: null })
    const stale = await memoryStore.transitionCachedResponse(
      key,
      { status: 'cancelled', planHash, revision: 1 },
      { status: 'running', planHash, revision: 2 },
    )
    assert.deepEqual(stale, { updated: false, durable: false, reason: 'transition_conflict' })
    assert.equal((await memoryStore.transitionCachedResponse(key, { status: 'cancelled', planHash, revision: 0 }, {})).reason, 'invalid_transition')
    assert.equal((await memoryStore.transitionCachedResponse(key, { status: 'planned', planHash: 'bad' }, {})).reason, 'invalid_transition')

    process.env.SUPABASE_URL = 'https://project.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role'
    let request
    globalThis.fetch = async (url, init) => {
      request = { url: String(url), init }
      return {
        ok: true,
        status: 200,
        json: async () => [{ cache_key: key }],
        text: async () => '',
      }
    }
    const supabaseStore = await import(`./store.mjs?agent-company-supabase-transition=${Date.now()}`)
    const remote = await supabaseStore.transitionCachedResponse(
      key,
      { status: 'planned', planHash, revision: 4 },
      { status: 'running', planHash, revision: 5, input: { private: true } },
    )
    assert.deepEqual(remote, { updated: true, durable: true })
    assert.equal(request.init.method, 'PATCH')
    assert.match(request.url, /supermega_ai_cache\?cache_key=eq\./)
    assert.match(request.url, /payload->>status=eq\.planned/)
    assert.match(request.url, /payload->>planHash=eq\.a{64}/)
    assert.match(request.url, /payload->>revision=eq\.4/)
    assert.match(request.url, /select=cache_key/)
    assert.deepEqual(JSON.parse(request.init.body).payload, { status: 'running', planHash, revision: 5, input: { private: true } })

    const source = readFileSync(new URL('./store.mjs', import.meta.url), 'utf8')
    assert.match(source, /where cache_key=\$1 and payload->>'status'=\$2 and payload->>'planHash'=\$3/)
    assert.match(source, /and payload->>'revision'=\$4/)
  } finally {
    globalThis.fetch = originalFetch
    restoreEnvironment(saved)
  }
})

test('cache control-record listing is prefix-bounded, tenant-filtered, and reports durability', async () => {
  const saved = captureEnvironment()
  const originalFetch = globalThis.fetch
  const prefix = `agent-company-list-${Date.now()}:`
  try {
    for (const name of STORE_ENV) delete process.env[name]
    const memoryStore = await import(`./store.mjs?agent-company-memory-list=${Date.now()}`)
    await memoryStore.putCachedResponse(`${prefix}one`, {
      clientId: 'client-acme',
      status: 'active',
      issuedAt: '2026-07-14T09:00:00.000Z',
      expiresAt: '2026-07-14T10:00:00.000Z',
    })
    await memoryStore.putCachedResponse(`${prefix}other`, {
      clientId: 'client-other',
      status: 'active',
      issuedAt: '2026-07-14T09:01:00.000Z',
      expiresAt: '2026-07-14T10:00:00.000Z',
    })
    const local = await memoryStore.listCachedResponseRecords({
      prefix,
      clientId: 'client-acme',
      status: 'active',
      expiresAfter: '2026-07-14T09:30:00.000Z',
      limit: 10,
    })
    assert.equal(local.durable, false)
    assert.deepEqual(local.records.map((record) => record.key), [`${prefix}one`])
    await assert.rejects(
      memoryStore.listCachedResponseRecords({ prefix: 'agent-company:*', limit: 10 }),
      /invalid_cached_response_list_query/,
    )
    await assert.rejects(
      memoryStore.listCachedResponseRecords({ prefix: 'agent_company:', limit: 10 }),
      /invalid_cached_response_list_query/,
    )

    process.env.SUPABASE_URL = 'https://project.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role'
    let request
    globalThis.fetch = async (url, init) => {
      request = { url: String(url), init }
      return {
        ok: true,
        status: 200,
        json: async () => [{ cache_key: `${prefix}one`, payload: { clientId: 'client-acme', status: 'active' } }],
        text: async () => '',
      }
    }
    const supabaseStore = await import(`./store.mjs?agent-company-supabase-list=${Date.now()}`)
    const remote = await supabaseStore.listCachedResponseRecords({
      prefix,
      clientId: 'client-acme',
      status: 'active',
      expiresAfter: '2026-07-14T09:30:00.000Z',
      limit: 11,
    })
    assert.equal(remote.durable, true)
    assert.equal(remote.records[0].key, `${prefix}one`)
    assert.equal(request.init.method, 'GET')
    assert.match(request.url, /supermega_ai_cache\?cache_key=like\./)
    assert.match(request.url, /payload->>clientId=eq\.client-acme/)
    assert.match(request.url, /payload->>status=eq\.active/)
    assert.match(request.url, /payload->>expiresAt=gt\./)
    assert.match(request.url, /select=cache_key,payload/)
    assert.match(request.url, /order=created_at\.desc/)
    assert.match(request.url, /limit=11/)
  } finally {
    globalThis.fetch = originalFetch
    restoreEnvironment(saved)
  }
})
