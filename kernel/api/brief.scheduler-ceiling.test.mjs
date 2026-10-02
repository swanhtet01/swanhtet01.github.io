// Measures what the "25 invocations/day scheduler ceiling" (OPS-026, AI-NATIVE-ARCHITECTURE 3.3/4.2,
// ENTERPRISE-READINESS-SCORECARD gap 5) actually is in code, and pins the part the kernel enforces.
// Companion to gateway.budget-overshoot.test.mjs, which measured the other half of that gap.
//
// What was verified before this file was written (2026-09-02):
//   * The number 25 is cron arithmetic, not a counter. tools/supermega_scheduler_authority.json's
//     activation plan is two Vercel crons — `5 * * * *` (24 firings per UTC day) and `45 0 * * *`
//     (1 firing) — and `maximum_scheduler_invocations_per_day: 25` is their sum. The plan is
//     dormant (`crons: []`, maximum 0). tools/scheduler_authority_contract.mjs, verify_app_build,
//     and supermega_runtime/cloud_runtime.py all validate that shape; none of them counts runs.
//   * The two cron paths route to the Python runtime (cloud_runtime.py agent_queue_cron /
//     daily_cron). Those handlers check the bearer secret and the activation gate, then dispatch;
//     they keep no per-day tally, so a 26th authenticated request in a UTC day is admitted exactly
//     like the first. That runtime is outside this test's reach; the sentence above is a code
//     reading, not a measurement.
//   * In the kernel the number appears only as display copy (api/agent-company.mjs
//     `plannedInvocationsPerDay: 25`, already pinned against the authority file by
//     api/agent-company.test.mjs). What the kernel DOES enforce on its own cron receiver
//     (api/brief.mjs runScheduledBrief) is two idempotency claims per workcell slug, both atomic
//     insert-or-ignore rows in store.claimActivity: an execution claim keyed by UTC hour
//     (workcell-run.mjs executionClaimId) and a delivery claim keyed by the client's local date
//     (deliveryClaimId, WORKCELL_TIME_ZONE). They partition time; nothing sums them to 25.
//
// So the pinned facts are: (1) the cadence count; (2) per workcell slug, at most one execution per
// UTC hour and one owner delivery per client-local date, measured by driving the real claim path
// once per minute across a UTC day and into the next; (3) the first invocation of the next UTC day
// is admitted again; (4) N simultaneous cron deliveries at the ceiling admit exactly one execution
// at 2/8/32/128, and exactly two when the burst straddles the UTC-day boundary; (5) which clock
// anchors which claim, by counting distinct claim ids over a UTC day for a UTC and a UTC+6:30 tenant.
//
// Offline: globalThis.fetch is replaced before any kernel module loads by a stub that records and
// refuses every call; the store runs in memory mode; the workcell run and the owner send are
// injected stubs. Nothing is timing-based: `now` is injected everywhere the code accepts it.
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const ENV_KEYS = [
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY',
  'POSTGRES_URL_NON_POOLING', 'POSTGRES_URL', 'DATABASE_URL_UNPOOLED', 'POSTGRES_PRISMA_URL',
  'SUPERMEGA_DATABASE_URL', 'DATABASE_URL',
]
const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))
for (const key of ENV_KEYS) delete process.env[key]

const realFetch = globalThis.fetch
const fetchLog = []
globalThis.fetch = async (url) => {
  fetchLog.push(String(url))
  throw new Error(`scheduler_ceiling_harness_unexpected_network_call:${url}`)
}

const { runScheduledBrief } = await import('./brief.mjs')
const { claimWorkcellDelivery, claimWorkcellExecution, deliveryClaimId, executionClaimId } = await import('../workcell-run.mjs')
const { resolveWorkcellConfig } = await import('../workcells.mjs')
const store = (await import('../store.mjs')).default
assert.equal(store.mode, 'memory', 'the scheduler ceiling harness must never touch a real database')

after(() => {
  globalThis.fetch = realFetch
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  assert.deepEqual(fetchLog, [], 'no network surface was invoked')
})

const authority = JSON.parse(await readFile(new URL('../../tools/supermega_scheduler_authority.json', import.meta.url), 'utf8'))
const MINUTES_PER_DAY = 24 * 60
const SWEEP = [2, 8, 32, 128]
const DAY = '2026-07-13'
const NEXT_DAY = '2026-07-14'
const SLUG = 'cash-close'

// Counts how many minutes of one UTC day match a five-field cron expression whose minute and hour
// fields are a literal or `*` and whose remaining fields are `*`. That is the whole shape the
// activation plan uses; anything else is refused rather than guessed at.
function firingsPerUtcDay(schedule) {
  const fields = String(schedule).trim().split(/\s+/)
  assert.equal(fields.length, 5, `five-field cron: ${schedule}`)
  const [minute, hour, ...rest] = fields
  assert.deepEqual(rest, ['*', '*', '*'], `day/month/weekday must be unrestricted: ${schedule}`)
  const literal = (field) => (field === '*' ? null : Number(field))
  const wantMinute = literal(minute)
  const wantHour = literal(hour)
  assert.ok(wantMinute === null || Number.isInteger(wantMinute), `minute field: ${schedule}`)
  assert.ok(wantHour === null || Number.isInteger(wantHour), `hour field: ${schedule}`)
  let count = 0
  for (let m = 0; m < MINUTES_PER_DAY; m += 1) {
    const h = Math.floor(m / 60)
    if ((wantMinute === null || wantMinute === m % 60) && (wantHour === null || wantHour === h)) count += 1
  }
  return count
}

function minuteOf(day, m) {
  return new Date(`${day}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00.000Z`)
}

// One isolated tenant per test so the memory-mode claim rows of one sweep never collide with another.
function tenantEnv(clientId, timeZone = 'UTC') {
  return { SUPERMEGA_WORKCELL_SLUG: SLUG, WORKCELL_CLIENT_ID: clientId, WORKCELL_CLIENT_NAME: clientId, WORKCELL_TIME_ZONE: timeZone }
}

function workcell(slug, config) {
  return {
    ok: true,
    slug,
    name: slug,
    clientName: config.clientName,
    localDate: config.localDate,
    timeZone: config.timeZone,
    sources: [{ tool: 'read', items: 1 }],
    output: { headline: 'Ready', metrics: [], priorities: [], exceptions: [], owner_action: 'Act' },
  }
}

// The receiver only runs on a claim the store reports as durable (brief.mjs claimAccepted), and the
// memory store reports `durable: false`, so the memory mode alone never executes anything (pinned
// below). The measurements therefore route the real claim ids through the real memory-mode
// check-and-set in store.claimActivity — the same one-synchronous-segment shape as the SQL
// `insert ... on conflict do nothing` — with only the durability flag asserted by the harness.
const durableClaim = async (row) => ({ ...(await store.claimActivity(row)), durable: true })
const claimOptions = {
  claimWorkcellExecution: (slug, options) => claimWorkcellExecution(slug, { ...options, claimActivity: durableClaim }),
  claimWorkcellDelivery: (slug, options) => claimWorkcellDelivery(slug, { ...options, claimActivity: durableClaim }),
}

// Drives the real cron receiver with the real claim functions and counts what it did.
function harness(env) {
  const counters = { runs: 0, sends: 0 }
  const options = {
    env,
    ...claimOptions,
    runWorkcell: async (slug, { now }) => { counters.runs += 1; return workcell(slug, resolveWorkcellConfig(env, now)) },
    notify: async () => { counters.sends += 1; return true },
  }
  return {
    counters,
    async invoke(now) {
      const result = await runScheduledBrief({ ...options, now })
      assert.equal(result.mode, 'workcells')
      assert.equal(result.results.length, 1)
      return result.results[0]
    },
  }
}

function classify(row) {
  if (row.ok && row.duplicate) return 'duplicate'
  if (row.ok && row.sent) return 'sent'
  return `refused:${row.reason || 'unknown'}`
}

test('the 25/day ceiling is the firing count of the two dormant activation crons over one UTC day', (t) => {
  assert.equal(authority.contract, 'supermega.scheduler-authority.v2')
  assert.equal(authority.timezone, 'UTC')
  assert.equal(authority.activation.state, 'dormant')
  assert.deepEqual(authority.crons, [])
  assert.equal(authority.maximum_scheduler_invocations_per_day, 0)
  const rows = authority.activation_plan.crons.map((cron) => ({ id: cron.id, schedule: cron.schedule, firingsPerUtcDay: firingsPerUtcDay(cron.schedule), declared: cron.maximum_invocations_per_day }))
  for (const row of rows) assert.equal(row.firingsPerUtcDay, row.declared, `${row.id}: declared per-day maximum equals the schedule's firing count`)
  const total = rows.reduce((sum, row) => sum + row.firingsPerUtcDay, 0)
  assert.equal(total, 25)
  assert.equal(total, authority.activation_plan.maximum_scheduler_invocations_per_day)
  t.diagnostic(`activation plan firings per UTC day ${JSON.stringify(rows)} total=${total}`)
})

test('with the memory store alone the cron receiver refuses every run: the claim is not durable', async (t) => {
  const env = tenantEnv('ceiling-memory-only')
  let runs = 0
  const outcomes = new Map()
  for (let m = 0; m < 60; m += 1) {
    const result = await runScheduledBrief({ env, now: minuteOf(DAY, m), runWorkcell: async () => { runs += 1; throw new Error('unreachable') }, notify: async () => true })
    const key = classify(result.results[0])
    outcomes.set(key, (outcomes.get(key) || 0) + 1)
  }
  assert.equal(runs, 0)
  assert.deepEqual(Object.fromEntries(outcomes), { 'refused:durable_execution_claim_unavailable': 60 })
  t.diagnostic(`memory-mode claims are reported non-durable, so the receiver fails closed: ${JSON.stringify(Object.fromEntries(outcomes))}`)
})

test('per workcell: one execution per UTC hour and one owner delivery per local date, with no count-based refusal; the next UTC day is admitted again', async (t) => {
  const env = tenantEnv('ceiling-sweep')
  const cron = harness(env)
  const outcomes = new Map()
  const tally = (row) => outcomes.set(classify(row), (outcomes.get(classify(row)) || 0) + 1)

  // Every minute of one UTC day, in order: 1,440 cron deliveries against a 24-hour execution partition.
  for (let m = 0; m < MINUTES_PER_DAY; m += 1) tally(await cron.invoke(minuteOf(DAY, m)))
  const day = { invocations: MINUTES_PER_DAY, executions: cron.counters.runs, deliveries: cron.counters.sends, outcomes: Object.fromEntries(outcomes) }
  assert.equal(day.executions, 24, 'one execution per UTC hour')
  assert.equal(day.deliveries, 1, 'one owner delivery per local date')
  assert.deepEqual(Object.keys(day.outcomes).sort(), ['duplicate', 'sent'], 'every non-first invocation is reported as a duplicate; nothing is refused')
  assert.equal(day.outcomes.sent, 1)
  assert.equal(day.outcomes.duplicate, MINUTES_PER_DAY - 1)

  // The 24 executions that the delivery claim did not stop each ran the workcell before finding the
  // day's delivery already claimed: the execution claim dedupes within an hour, the delivery claim
  // dedupes the send, and neither stops a fresh hour from spending a run.
  assert.equal(day.executions - day.deliveries, 23)

  // A 26th, 27th... invocation inside the same UTC day lands in an hour that already holds its claim.
  const sameDayAgain = await cron.invoke(new Date(`${DAY}T23:59:59.999Z`))
  assert.equal(classify(sameDayAgain), 'duplicate')
  assert.equal(cron.counters.runs, 24)

  // The first invocation of the next UTC day is admitted: fresh hour, fresh local date, fresh send.
  const rollover = await cron.invoke(new Date(`${NEXT_DAY}T00:00:00.000Z`))
  assert.equal(classify(rollover), 'sent')
  assert.equal(cron.counters.runs, 25)
  assert.equal(cron.counters.sends, 2)
  t.diagnostic(`minute sweep over ${DAY} ${JSON.stringify(day)}; rollover to ${NEXT_DAY} executions=${cron.counters.runs} deliveries=${cron.counters.sends}`)
})

// Fire N cron deliveries at once, park every admitted execution at the workcell stub until the
// harness has seen all N either parked or settled, read the peak, then release.
async function burst(env, callers) {
  const gate = { parked: 0, waiters: [] }
  const settled = []
  let sends = 0
  const options = {
    env,
    ...claimOptions,
    runWorkcell: async (slug, { now }) => {
      gate.parked += 1
      await new Promise((resolve) => gate.waiters.push(resolve))
      return workcell(slug, resolveWorkcellConfig(env, now))
    },
    notify: async () => { sends += 1; return true },
  }
  const promises = callers.map((now) => runScheduledBrief({ ...options, now }).then(
    (value) => { settled.push(value); return value },
    (error) => { settled.push(error); throw error },
  ))
  const deadline = Date.now() + 20_000
  while (gate.parked + settled.length < callers.length) {
    if (Date.now() > deadline) throw new Error(`scheduler_ceiling_burst_stalled parked=${gate.parked} settled=${settled.length} of ${callers.length}`)
    await new Promise((resolve) => setImmediate(resolve))
  }
  const peak = gate.parked
  for (const resolve of gate.waiters.splice(0)) resolve()
  const results = await Promise.all(promises)
  const rows = results.map((result) => result.results[0])
  return { peak, sends, outcomes: rows.map(classify) }
}

test('N simultaneous cron deliveries at the ceiling admit exactly one execution and one send at 2/8/32/128', async (t) => {
  const rows = []
  for (const n of SWEEP) {
    const env = tenantEnv(`ceiling-burst-${n}`)
    const now = new Date(`${DAY}T01:05:00.000Z`)
    const run = await burst(env, Array.from({ length: n }, () => now))
    const counts = { N: n, peakExecutions: run.peak, sends: run.sends, sent: run.outcomes.filter((o) => o === 'sent').length, duplicate: run.outcomes.filter((o) => o === 'duplicate').length, refused: run.outcomes.filter((o) => o.startsWith('refused')).length }
    rows.push(counts)
    assert.equal(counts.peakExecutions, 1, `exactly one execution in flight at N=${n}`)
    assert.equal(counts.sends, 1, `exactly one owner send at N=${n}`)
    assert.equal(counts.sent, 1)
    assert.equal(counts.duplicate, n - 1)
    assert.equal(counts.refused, 0)
  }
  t.diagnostic(`simultaneous deliveries in one UTC hour ${JSON.stringify(rows)}`)
})

test('a simultaneous burst straddling the UTC-day boundary admits exactly one execution per side', async (t) => {
  const rows = []
  for (const n of SWEEP) {
    const env = tenantEnv(`ceiling-boundary-${n}`)
    const before = new Date(`${DAY}T23:59:59.999Z`)
    const after = new Date(`${NEXT_DAY}T00:00:00.000Z`)
    const callers = Array.from({ length: n }, (_, index) => (index % 2 === 0 ? before : after))
    const run = await burst(env, callers)
    const counts = { N: n, peakExecutions: run.peak, sends: run.sends, sent: run.outcomes.filter((o) => o === 'sent').length, duplicate: run.outcomes.filter((o) => o === 'duplicate').length, refused: run.outcomes.filter((o) => o.startsWith('refused')).length }
    rows.push(counts)
    assert.equal(counts.peakExecutions, 2, `one execution per UTC hour on each side of midnight at N=${n}`)
    assert.equal(counts.sends, 2, `one delivery per local date on each side of midnight at N=${n}`)
    assert.equal(counts.duplicate, n - 2)
    assert.equal(counts.refused, 0)
  }
  t.diagnostic(`simultaneous deliveries across the UTC-day boundary ${JSON.stringify(rows)}`)
})

test('the execution claim is anchored to the UTC hour and the delivery claim to the client-local date', (t) => {
  const rows = []
  for (const timeZone of ['UTC', 'Asia/Yangon']) {
    const env = tenantEnv('ceiling-anchor', timeZone)
    const executionIds = new Set()
    const deliveryIds = new Set()
    for (let m = 0; m < MINUTES_PER_DAY; m += 1) {
      const now = minuteOf(DAY, m)
      const config = resolveWorkcellConfig(env, now)
      assert.equal(config.timeZone, timeZone)
      executionIds.add(executionClaimId(SLUG, config, now))
      deliveryIds.add(deliveryClaimId(SLUG, config))
    }
    rows.push({ timeZone, distinctExecutionClaims: executionIds.size, distinctDeliveryClaims: deliveryIds.size })
  }
  // UTC: 24 hour buckets, one local date. UTC+6:30: the local date flips at 17:30Z, splitting the
  // 17:00Z hour bucket in two (25 execution keys) and spanning two local dates (2 delivery keys).
  assert.deepEqual(rows, [
    { timeZone: 'UTC', distinctExecutionClaims: 24, distinctDeliveryClaims: 1 },
    { timeZone: 'Asia/Yangon', distinctExecutionClaims: 25, distinctDeliveryClaims: 2 },
  ])
  t.diagnostic(`distinct claim ids over one UTC day ${JSON.stringify(rows)}`)
})
