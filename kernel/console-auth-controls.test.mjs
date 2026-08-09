// Console authentication controls: the ops-key strength floor and the failed-attempt log.
// Both were shipped without tests; these lock in the two properties that matter.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const ENV_KEYS = [
  'SUPERMEGA_OPS_KEY',
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY',
  'POSTGRES_URL_NON_POOLING', 'POSTGRES_URL', 'DATABASE_URL_UNPOOLED', 'POSTGRES_PRISMA_URL',
  'SUPERMEGA_DATABASE_URL', 'DATABASE_URL',
]

const captureEnvironment = () => Object.fromEntries(ENV_KEYS.map((name) => [name, {
  present: Object.hasOwn(process.env, name),
  value: process.env[name],
}]))

function restoreEnvironment(saved) {
  for (const name of ENV_KEYS) {
    if (saved[name].present) process.env[name] = saved[name].value
    else delete process.env[name]
  }
}

// Each case needs the module-level OPS_KEY re-read, so the import is cache-busted.
async function withOpsKey(key, run) {
  const saved = captureEnvironment()
  const originalError = console.error
  const errors = []
  try {
    for (const name of ENV_KEYS) delete process.env[name]
    if (key !== undefined) process.env.SUPERMEGA_OPS_KEY = key
    console.error = (...args) => { errors.push(args.join(' ')) }
    const { handle } = await import(`./console/api.mjs?auth-controls=${Date.now()}-${Math.random()}`)
    return await run(handle, errors)
  } finally {
    console.error = originalError
    restoreEnvironment(saved)
  }
}

const CONFORMING_KEY = 'console-auth-controls-key-0123456789'

test('a key below the strength floor is refused, and is indistinguishable from no key at all', async () => {
  assert.ok(CONFORMING_KEY.length >= 32)

  const weak = await withOpsKey('short-owner-key', (handle) => handle({ method: 'GET', path: '/api/state', headers: { 'x-ops-key': 'short-owner-key' } }))
  const missing = await withOpsKey(undefined, (handle) => handle({ method: 'GET', path: '/api/state', headers: {} }))

  assert.equal(weak.status, 503, 'a weak key must refuse every request rather than defend the console with it')
  // The response must not tell an unauthenticated caller that the key is merely SHORT —
  // that is the one fact that makes guessing worth attempting.
  assert.deepEqual(weak.json, missing.json, 'a weak key must be indistinguishable from a missing key to the caller')
  assert.equal(weak.json.reason, 'ops_key_not_configured')
  assert.ok(!JSON.stringify(weak.json).toLowerCase().includes('weak'), 'the refusal must not disclose why')
})

test('the weak-key cause is reported to the server log, where the owner can see it', async () => {
  const errors = await withOpsKey('short-owner-key', async (handle, captured) => {
    await handle({ method: 'GET', path: '/api/state', headers: {} })
    return captured
  })
  const logged = errors.join('\n')
  assert.match(logged, /SUPERMEGA_OPS_KEY/, 'the owner needs to be told which variable is wrong')
  assert.match(logged, /at least 32/, 'and what the requirement is')
  assert.ok(!logged.includes('short-owner-key'), 'the key itself must never be logged')
})

test('a conforming key still authenticates, and a rejected attempt never records the supplied key', async () => {
  await withOpsKey(CONFORMING_KEY, async (handle, errors) => {
    const wrong = await handle({ method: 'GET', path: '/api/state', headers: { 'x-ops-key': 'guessed-value-that-is-long-enough-x' } })
    assert.equal(wrong.status, 401)
    assert.equal(wrong.json.reason, 'unauthorized')

    const accepted = await handle({ method: 'GET', path: '/api/state', headers: { 'x-ops-key': CONFORMING_KEY } })
    assert.notEqual(accepted.status, 401, 'the correct key must not be rejected')
    assert.notEqual(accepted.status, 503, 'a conforming key must not trip the floor')

    // Whatever the rejection path recorded, it must not contain the attempted secret.
    const everything = errors.join('\n')
    assert.ok(!everything.includes('guessed-value-that-is-long-enough-x'), 'a rejected attempt must never echo the supplied key')
    assert.ok(!everything.includes(CONFORMING_KEY), 'the real key must never be logged either')
  })
})
