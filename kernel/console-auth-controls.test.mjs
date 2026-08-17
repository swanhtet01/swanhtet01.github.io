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
  // Tested against the shared helper rather than through handle(): every owner surface now
  // routes through usableOpsKey, and it warns once per process so a second consumer must not
  // be able to swallow the message for the first. A fresh import gives a clean warn state.
  const originalError = console.error
  const errors = []
  try {
    console.error = (...args) => { errors.push(args.join(' ')) }
    const { usableOpsKey, OPS_KEY_MINIMUM_LENGTH } = await import(`./ops-key.mjs?weak-key=${Date.now()}-${Math.random()}`)
    assert.equal(OPS_KEY_MINIMUM_LENGTH, 32)
    assert.equal(usableOpsKey('short-owner-key'), '', 'a below-floor key must read as absent to every caller')
    assert.equal(usableOpsKey(''), '', 'a blank key stays blank')
    assert.equal(usableOpsKey(`  ${CONFORMING_KEY}  `), CONFORMING_KEY, 'a conforming key is returned trimmed')
  } finally {
    console.error = originalError
  }
  const logged = errors.join('\n')
  assert.match(logged, /SUPERMEGA_OPS_KEY/, 'the owner needs to be told which variable is wrong')
  assert.match(logged, /at least 32/, 'and what the requirement is')
  assert.ok(!logged.includes('short-owner-key'), 'the key itself must never be logged')
})

test('a burst of rejected attempts is recorded even when it stops inside the throttle window', async () => {
  const saved = captureEnvironment()
  try {
    for (const name of ENV_KEYS) delete process.env[name]
    process.env.SUPERMEGA_OPS_KEY = CONFORMING_KEY
    const { handle } = await import(`./console/api.mjs?burst=${Date.now()}-${Math.random()}`)
    const store = (await import('./store.mjs')).default
    assert.equal(store.mode, 'memory', 'this test must not touch a real database')

    const before = (await store.listActivity(500)).filter((entry) => entry.kind === 'console.auth_rejected').length
    // 250 attempts far faster than the 60s window. A pure time throttle logs the first and
    // silently drops the rest, which is the defect this pins.
    for (let attempt = 0; attempt < 250; attempt += 1) {
      await handle({ method: 'GET', path: '/api/state', headers: { 'x-ops-key': 'wrong' } })
    }
    const entries = (await store.listActivity(500)).filter((entry) => entry.kind === 'console.auth_rejected')
    const written = entries.length - before

    assert.ok(written > 1, `a 250-attempt burst must leave more than one trace, got ${written}`)
    assert.ok(written <= 12, `writes must stay bounded so the log cannot be flooded, got ${written}`)
    // The magnitude has to be recoverable from the log itself.
    const loudest = entries.map((entry) => Number((/Rejected (\d+) console requests/.exec(entry.summary) || [])[1] || 1))
    assert.ok(Math.max(...loudest) >= 100, `the recorded count must reveal the scale, saw ${Math.max(...loudest)}`)
  } finally {
    restoreEnvironment(saved)
  }
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
