// Measures what the kernel store does when its connection pool is exhausted, for the
// kernel/README.md "Honest Limits" entry on pool pressure (ENTERPRISE-READINESS-SCORECARD gap 5).
// Companion to gateway.budget-overshoot.test.mjs and api/brief.scheduler-ceiling.test.mjs.
//
// What "pooling" is here, verified 2026-09-02:
//   * memory mode   — no pool. Every call is an in-process Map operation.
//   * supabase mode — no pool in this process. Every call is one fetch() to PostgREST; connection
//                     reuse belongs to Node's HTTP agent and pooling to Supabase's side (PostgREST →
//                     Supavisor). Nothing in store.mjs bounds or observes it.
//   * postgres mode — one lazily created `pg.Pool` with `max: 3, idleTimeoutMillis: 10_000` and
//                     no `connectionTimeoutMillis` (store.mjs pg()). `q()` checks a client out per
//                     statement; `tx()` holds one client for a whole transaction. Client-side
//                     workcell bootstrap accepts only direct or session-pooler (port 5432) URLs
//                     (workcell-provision.mjs); the transaction pooler is refused.
//
// What pg-pool does at the fourth simultaneous checkout with that configuration (pg-pool
// index.js connect()): when the pool is full it pushes the caller onto `_pendingQueue`, and because
// no connectionTimeoutMillis is set it arms no timer — the caller waits until a client is released,
// however long that takes. So pool exhaustion QUEUES: it never refuses, never times out, and the
// queue has no length bound. That is what the sweep below measures at 2/8/32/128 simultaneous
// checkouts through the real pg-pool with the store's exact options and an injected in-process
// Client (pg-pool's documented `Client` option), so no socket is ever opened.
//
// Offline: globalThis.fetch is stubbed to refuse before the store loads; the store runs in memory
// mode; the pool sweep never connects anywhere. Opt-in: SUPERMEGA_POOL_PROBE_POSTGRES_URL=<loopback
// postgres url> re-runs the store's own postgres-mode claim and reservation paths at the same N on a
// disposable local database and checks that none of them is refused (a pool refusal would surface
// as `claim_store_unavailable`, or as a rejected reservation). Not measured anywhere: the peak
// backend count on a live database, the Supabase-side pooler, or the HTTP agent behind supabase mode.
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const ENV_KEYS = [
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY',
  'POSTGRES_URL_NON_POOLING', 'POSTGRES_URL', 'DATABASE_URL_UNPOOLED', 'POSTGRES_PRISMA_URL',
  'SUPERMEGA_DATABASE_URL', 'DATABASE_URL', 'SUPERMEGA_POOL_PROBE_POSTGRES_URL',
]
const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))
const PROBE_URL = String(process.env.SUPERMEGA_POOL_PROBE_POSTGRES_URL || '').trim()
for (const key of ENV_KEYS) delete process.env[key]

const realFetch = globalThis.fetch
const fetchLog = []
globalThis.fetch = async (url) => {
  fetchLog.push(String(url))
  throw new Error(`pool_pressure_harness_unexpected_network_call:${url}`)
}

const store = (await import('./store.mjs')).default
assert.equal(store.mode, 'memory', 'the pool pressure harness must never touch a real database')
const source = await readFile(new URL('./store.mjs', import.meta.url), 'utf8')

let pgmod = null
try { pgmod = (await import('pg')).default } catch { pgmod = null }

after(() => {
  globalThis.fetch = realFetch
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  assert.deepEqual(fetchLog, [], 'no network surface was invoked')
})

const SWEEP = [2, 8, 32, 128]
// The exact pool construction in store.mjs. A change here changes the measured behaviour below, so
// the literal is pinned; re-measure and rewrite the README sentence together with it.
const POOL_LITERAL = 'new pgmod.Pool({ connectionString: CONN, ssl, max: 3, idleTimeoutMillis: 10_000 })'
const POOL_MAX = 3

// Returns the source of every `tx(async (query) => { ... })` body in store.mjs by brace matching.
function transactionBodies(text) {
  const opener = 'tx(async (query) => {'
  const bodies = []
  let from = 0
  for (;;) {
    const start = text.indexOf(opener, from)
    if (start < 0) return bodies
    let depth = 0
    let index = start + opener.length - 1
    for (; index < text.length; index += 1) {
      if (text[index] === '{') depth += 1
      else if (text[index] === '}') { depth -= 1; if (depth === 0) break }
    }
    bodies.push(text.slice(start + opener.length, index + 1))
    from = index
  }
}

test('store.mjs opens one pg.Pool of at most three clients with no checkout timeout, and no transaction re-enters the pool', () => {
  assert.equal(source.split(POOL_LITERAL).length - 1, 1, 'the pinned pool construction appears exactly once')
  assert.equal((source.match(/new pgmod\.Pool\(/g) || []).length, 1, 'there is exactly one pool')
  assert.doesNotMatch(source, /connectionTimeoutMillis/, 'no checkout timeout: an exhausted pool queues callers indefinitely')
  assert.doesNotMatch(source, /waitingCount|totalCount|idleCount/, 'the store never reads pool pressure')
  assert.doesNotMatch(source, /pool\.end\(/, 'the store never closes the pool')
  const bodies = transactionBodies(source)
  assert.equal(bodies.length, 5, 'five transaction bodies hold a client for their whole duration')
  for (const body of bodies) {
    assert.doesNotMatch(body, /\bq\(|\bpg\(\)|\btx\(/, 'a transaction body must not check out a second client: with max 3, three such transactions would wait on each other forever')
  }
})

// pg-pool's Client contract as exercised by connect/release/end: an EventEmitter with connect(cb),
// end(cb), and the private flags the pool reads. Nothing here opens a socket.
class InProcessClient extends EventEmitter {
  static created = 0
  constructor(options) {
    super()
    this.options = options
    this._queryable = true
    this._ending = false
    InProcessClient.created += 1
  }
  connect(callback) { process.nextTick(() => callback(null)) }
  end(callback) { this._ending = true; if (callback) process.nextTick(callback); return Promise.resolve() }
  query() { throw new Error('pool_pressure_harness_query_unused') }
  isConnected() { return !this._ending }
  unref() {}
}

// Runs the event loop until `done()` holds. Only nextTick/setImmediate turns are consumed; the harness
// arms no timers, and with no connectionTimeoutMillis neither does the pool for a queued caller.
async function settle(done, label) {
  for (let turn = 0; turn < 10_000; turn += 1) {
    if (done()) return turn
    await new Promise((resolve) => setImmediate(resolve))
  }
  throw new Error(`pool_pressure_settle_stalled:${label}`)
}

test(
  'pg-pool with the store\'s options queues every checkout past the third, refuses none, times none out, and serves the queue in order at 2/8/32/128',
  { skip: pgmod ? false : 'pg is not installed (npm --prefix kernel ci); the offline pool sweep needs pg-pool itself' },
  async (t) => {
    const rows = []
    for (const n of SWEEP) {
      InProcessClient.created = 0
      const pool = new pgmod.Pool({ max: POOL_MAX, idleTimeoutMillis: 10_000, Client: InProcessClient })
      const held = []
      const served = []
      let rejected = 0
      const checkouts = Array.from({ length: n }, (_, index) => pool.connect().then(
        (client) => { served.push(index); held.push(client); return client },
        (error) => { rejected += 1; throw error },
      ))
      await settle(() => held.length === Math.min(n, POOL_MAX) && pool.waitingCount === Math.max(0, n - POOL_MAX), `checkout N=${n}`)
      const peak = { connected: pool.totalCount, held: held.length, waiting: pool.waitingCount, rejected, clientsCreated: InProcessClient.created }
      assert.equal(peak.connected, Math.min(n, POOL_MAX), `the pool never opens more than ${POOL_MAX} clients at N=${n}`)
      assert.equal(peak.waiting, Math.max(0, n - POOL_MAX), `every checkout past the third is queued at N=${n}`)
      assert.equal(peak.rejected, 0, 'no checkout is refused')

      // With no checkout timeout nothing can move a queued caller: 500 further event-loop turns
      // leave the queue exactly as it was. This is the "hang" — it lasts as long as the holders do.
      for (let turn = 0; turn < 500; turn += 1) await new Promise((resolve) => setImmediate(resolve))
      assert.equal(pool.waitingCount, peak.waiting, 'queued callers stay queued until a holder releases')
      assert.equal(rejected, 0)

      // Release holders one at a time; each release hands the same client to the next queued caller.
      let releases = 0
      while (held.length) {
        const client = held.shift()
        client.release()
        releases += 1
        await settle(() => served.length === Math.min(n, POOL_MAX + releases) || served.length === n, `release ${releases} N=${n}`)
      }
      await Promise.all(checkouts)
      assert.deepEqual(served, Array.from({ length: n }, (_, index) => index), 'the queue is served first-in first-out')
      assert.equal(InProcessClient.created, Math.min(n, POOL_MAX), 'no client was created for a queued caller')
      assert.equal(pool.waitingCount, 0)
      await pool.end()
      rows.push({ N: n, ...peak, served: served.length, fifo: true })
    }
    t.diagnostic(`pg-pool max=${POOL_MAX} simultaneous checkouts ${JSON.stringify(rows)}`)
  },
)

test('memory mode has no pool: 512 simultaneous claims and reservations all complete', async (t) => {
  const n = 512
  const claims = await Promise.all(Array.from({ length: n }, () => store.claimActivity({ id: `pool-pressure:${randomUUID()}`, kind: 'probe', summary: 'pool pressure' })))
  assert.equal(claims.filter((claim) => claim.fresh).length, n)
  assert.equal(claims.filter((claim) => claim.reason).length, 0)
  const grants = await Promise.all(Array.from({ length: n }, () => store.reserveAiBudget({
    reservationId: randomUUID(), window: '2097-01-01', reservedUnits: 1, capUnits: 1_000_000, tenantId: 'pool-pressure', tier: 'bulk', provider: 'stub',
  })))
  assert.equal(grants.filter((grant) => grant.granted).length, n)
  t.diagnostic(`memory mode: ${n} simultaneous claims and ${n} simultaneous reservations, 0 refused`)
})

test(
  'postgres probe: the store\'s own postgres paths under simultaneous load are queued by the pool, never refused',
  { skip: PROBE_URL ? false : 'set SUPERMEGA_POOL_PROBE_POSTGRES_URL to a loopback Postgres to measure the durable path' },
  async (t) => {
    const host = new URL(PROBE_URL).hostname
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(host), 'the probe only ever runs against a loopback database')
    process.env.POSTGRES_URL = PROBE_URL
    let probe
    try { probe = (await import('./store.mjs?probe=postgres')).default } finally { delete process.env.POSTGRES_URL }
    assert.equal(probe.mode, 'postgres')
    const rows = []
    for (const n of SWEEP) {
      const claims = await Promise.all(Array.from({ length: n }, () => probe.claimActivity({ id: `pool-pressure:${randomUUID()}`, kind: 'probe', summary: 'pool pressure' })))
      const fresh = claims.filter((claim) => claim.fresh && claim.durable).length
      const unavailable = claims.filter((claim) => claim.reason === 'claim_store_unavailable').length
      const stamp = randomUUID()
      const window = `2099-${String(1 + (parseInt(stamp.slice(0, 2), 16) % 12)).padStart(2, '0')}-${String(1 + (parseInt(stamp.slice(2, 4), 16) % 28)).padStart(2, '0')}`
      const grants = await Promise.all(Array.from({ length: n }, () => probe.reserveAiBudget({
        reservationId: randomUUID(), window, reservedUnits: 1, capUnits: 1_000_000, tenantId: 'pool-pressure', tier: 'bulk', provider: 'stub',
      })))
      const granted = grants.filter((grant) => grant.granted && grant.durable).length
      rows.push({ N: n, claims: { fresh, unavailable }, reservations: { granted, refused: n - granted } })
      assert.equal(fresh, n, `every one of ${n} simultaneous claims is admitted through a pool of ${POOL_MAX}`)
      assert.equal(unavailable, 0)
      assert.equal(granted, n, `every one of ${n} simultaneous transactions completes through a pool of ${POOL_MAX}`)
    }
    t.diagnostic(`postgres probe through the store's pool ${JSON.stringify(rows)}`)
  },
)
