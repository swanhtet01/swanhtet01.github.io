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

test('authority-bearing compatibility keys use the control store and never the response cache', async () => {
  const saved = captureEnvironment()
  const originalFetch = globalThis.fetch
  const planHash = 'b'.repeat(64)
  const key = `company-work-order-record:company-order:${'1'.repeat(40)}`
  const planned = {
    version: 1,
    workOrderId: `company-order:${'1'.repeat(40)}`,
    clientId: 'client-acme',
    status: 'planned',
    planHash,
    input: { private: true },
  }
  try {
    for (const name of STORE_ENV) delete process.env[name]
    const memoryStore = await import(`./store.mjs?agent-company-control-memory=${Date.now()}`)
    assert.equal(await memoryStore.putResponseCache(key, planned), null)
    assert.equal(await memoryStore.getResponseCache(key), null)
    assert.equal(await memoryStore.putCachedResponse(key, planned), true)
    assert.deepEqual(await memoryStore.getCachedResponse(key), planned)
    assert.equal(await memoryStore.getResponseCache(key), null)

    const listed = await memoryStore.listCachedResponseRecords({
      prefix: 'company-work-order-record:',
      clientId: 'client-acme',
      status: 'planned',
      limit: 10,
    })
    assert.equal(listed.durable, false)
    assert.deepEqual(listed.records.map((record) => record.key), [key])

    const running = { ...planned, status: 'running' }
    assert.deepEqual(
      await memoryStore.transitionCachedResponse(key, { status: 'planned', planHash }, running),
      { updated: true, durable: false },
    )
    assert.deepEqual(await memoryStore.getControlRecord(key), running)
    assert.deepEqual(
      await memoryStore.transitionCachedResponse(key, { status: 'planned', planHash }, planned),
      { updated: false, durable: false, reason: 'transition_conflict' },
    )
    assert.equal(await memoryStore.putCachedResponse(key, { ...running, clientId: 'client-other' }), null)

    process.env.SUPABASE_URL = 'https://project.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role'
    const requests = []
    globalThis.fetch = async (url, init) => {
      const request = { url: String(url), init }
      requests.push(request)
      if (request.url.includes('/rpc/supermega_put_control_record')) {
        return { ok: true, status: 200, json: async () => [{ updated: true, version: 1 }], text: async () => '' }
      }
      if (request.url.includes('/rpc/supermega_transition_control_record')) {
        return { ok: true, status: 200, json: async () => [{ updated: true, version: 2 }], text: async () => '' }
      }
      if (request.url.includes('supermega_control_records?record_key=')) {
        return { ok: true, status: 200, json: async () => [{ payload: planned }], text: async () => '' }
      }
      if (request.url.includes('supermega_control_records?record_type=')) {
        return { ok: true, status: 200, json: async () => [{ record_key: key, payload: planned }], text: async () => '' }
      }
      return { ok: true, status: 200, json: async () => [{ payload: { status: 'malicious-cache-row' } }], text: async () => '' }
    }
    const supabaseStore = await import(`./store.mjs?agent-company-control-supabase=${Date.now()}`)
    assert.equal(await supabaseStore.putCachedResponse(key, planned), true)
    assert.deepEqual(await supabaseStore.getCachedResponse(key), planned)
    const remoteList = await supabaseStore.listCachedResponseRecords({
      prefix: 'company-work-order-record:',
      clientId: 'client-acme',
      status: 'planned',
      limit: 10,
    })
    assert.equal(remoteList.durable, true)
    assert.equal(remoteList.records[0].key, key)
    assert.deepEqual(
      await supabaseStore.transitionCachedResponse(key, { status: 'planned', planHash }, running),
      { updated: true, durable: true },
    )
    assert.equal(requests.some((request) => request.url.includes('supermega_ai_cache')), false)
    assert.match(requests[0].url, /rpc\/supermega_put_control_record/)
    assert.match(requests[1].url, /supermega_control_records\?record_key=/)
    assert.match(requests[2].url, /supermega_control_records\?record_type=eq\.work_order/)
    assert.match(requests[2].url, /tenant_id=eq\.client-acme/)
    assert.match(requests[3].url, /rpc\/supermega_transition_control_record/)
  } finally {
    globalThis.fetch = originalFetch
    restoreEnvironment(saved)
  }
})

test('control-record migration is service-only, append-only, cache-inert, and rollback is fail-closed', () => {
  const migration = readFileSync(new URL('./supabase/control-records-migration.sql', import.meta.url), 'utf8')
  const rollback = readFileSync(new URL('./supabase/control-records-rollback.sql', import.meta.url), 'utf8')
  const store = readFileSync(new URL('./store.mjs', import.meta.url), 'utf8')

  assert.match(migration, /create table if not exists public\.supermega_control_records/)
  assert.match(migration, /create table if not exists public\.supermega_control_transitions/)
  assert.match(migration, /create unique index if not exists supermega_control_transitions_record_version_uidx/)
  assert.match(migration, /before update or delete on public\.supermega_control_transitions/)
  assert.match(migration, /security definer\s+set search_path = ''/)
  assert.match(migration, /revoke all on public\.supermega_control_records from public, anon, authenticated, service_role/)
  assert.match(migration, /grant select on public\.supermega_control_records to service_role/)
  assert.match(migration, /grant execute on function public\.supermega_transition_control_record/)
  assert.doesNotMatch(migration, /insert\s+into\s+public\.supermega_control_records[^;]*select[^;]*supermega_ai_cache/i)
  assert.match(rollback, /control_records_require_explicit_reconciliation_before_rollback/)
  assert.match(rollback, /control_transition_history_requires_explicit_reconciliation_before_rollback/)
  assert.match(rollback, /drop table if exists public\.supermega_control_transitions/)
  assert.match(store, /controlRecordType\(cacheKey\) \? getControlRecord\(cacheKey\) : getResponseCache\(cacheKey\)/)
  assert.match(store, /old cache row with the same key is inert/)
})
