// Permanent gate for the /api/crew endpoint (runs under `node --test` in kernel verify).
// Exercises every path with a mock req/res — list, auth gates, input validation, the no-path-leak fix,
// and graceful degradation with no AI key. OPS_KEY is read at module load, so each case re-imports the
// handler with a cache-busting query after setting env.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const mkRes = () => ({ _s: 200, status(s) { this._s = s; return this }, setHeader() {}, json(j) { this._out = { status: this._s, body: j } } })
async function handlerWith(env) {
  for (const k of ['SUPERMEGA_OPS_KEY', 'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'OPENROUTER_API_KEY']) delete process.env[k]
  Object.assign(process.env, env || {})
  return (await import(`./crew.mjs?t=${Math.random()}`)).default
}
async function call(env, req) { const h = await handlerWith(env); const res = mkRes(); await h(req, res); return res._out }

test('GET lists the catalog as public product metadata', async () => {
  const r = await call({}, { method: 'GET', headers: {} })
  assert.equal(r.status, 200)
  assert.equal(r.body.ok, true)
  assert.ok(r.body.count >= 3, 'at least the seed crews')
  const chase = r.body.crews.find((c) => c.slug === 'chase-the-money')
  assert.ok(chase, 'chase-the-money present')
  assert.equal(chase.requires_account_access, true, 'bright-line flag exposed')
  assert.ok(Array.isArray(chase.roles) && chase.roles[0].id === 'intake')
  assert.ok(Array.isArray(chase.returns) && chase.returns.length)
})

test('POST run is ops-gated', async () => {
  assert.equal((await call({}, { method: 'POST', headers: {}, body: { slug: 'read-my-chaos' } })).status, 503)
  assert.equal((await call({ SUPERMEGA_OPS_KEY: 'k-0123456789abcdef0123456789abcdef' }, { method: 'POST', headers: { 'x-ops-key': 'wrong' }, body: { slug: 'read-my-chaos' } })).status, 401)
})

test('POST validates input and never leaks the fs path', async () => {
  assert.equal((await call({ SUPERMEGA_OPS_KEY: 'k-0123456789abcdef0123456789abcdef' }, { method: 'POST', headers: { 'x-ops-key': 'k-0123456789abcdef0123456789abcdef' }, body: {} })).body.reason, 'missing_slug')
  const unknown = await call({ SUPERMEGA_OPS_KEY: 'k-0123456789abcdef0123456789abcdef' }, { method: 'POST', headers: { 'x-ops-key': 'k-0123456789abcdef0123456789abcdef' }, body: { slug: 'does-not-exist' } })
  assert.equal(unknown.status, 400)
  assert.equal(unknown.body.reason, 'crew_not_found')
  assert.doesNotMatch(unknown.body.reason, /[A-Za-z]:\\|\/Users\//, 'no server path in the reason')
})

test('POST run degrades gracefully with no AI key (no crash)', async () => {
  const r = await call({ SUPERMEGA_OPS_KEY: 'k-0123456789abcdef0123456789abcdef' }, { method: 'POST', headers: { 'x-ops-key': 'k-0123456789abcdef0123456789abcdef' }, body: { slug: 'read-my-chaos', intake: 'Viber: 3 boxes @ 12000 MMK, paid KBZPay' } })
  assert.equal(r.status, 400)
  assert.equal(r.body.reason, 'crew_role_failed')
})

test('unsupported method → 405', async () => {
  assert.equal((await call({ SUPERMEGA_OPS_KEY: 'k-0123456789abcdef0123456789abcdef' }, { method: 'PUT', headers: {} })).status, 405)
})
