// Persistence guard for local product analytics.
//
// The collector held events in a module-level array, so every page reload erased the record.
// The first pilot is a month of real trading whose entire purpose is EVIDENCE -- how often the
// counter is used, whether a daily close actually happens, which surfaces get visited. None of
// that survived a refresh, so the pilot would have produced nothing measurable at all.
//
// The storage key was already reserved in core/local-workspace-storage.ts and already
// classified in core/company-backup.ts as deliberately NOT portable (counters describe THIS
// device; restoring them elsewhere would assert activity that never happened there). Only the
// writing was missing.
//
// This guard holds three properties: the record survives a reload, it stays bounded on a device
// that trades for months, and instrumentation NEVER breaks the product -- a storage failure
// must be swallowed, because losing a metric matters and losing a sale does not.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export {
      LOCAL_METRICS_STORAGE_KEY, LOCAL_METRICS_SCHEMA, LOCAL_METRICS_MAX_EVENTS,
      readStoredMetrics, writeStoredMetrics, validMetricEvent,
    } from './metrics-collector.ts'`,
    resolveDir: 'showroom/src/analytics',
    sourcefile: 'showroom/src/analytics/metrics-persistence-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  LOCAL_METRICS_STORAGE_KEY, LOCAL_METRICS_SCHEMA, LOCAL_METRICS_MAX_EVENTS,
  readStoredMetrics, writeStoredMetrics, validMetricEvent,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)) },
    removeItem: (key) => { map.delete(key) },
  }
}

const sale = (ts = 1) => ({ product: 'shop', capability: 'shop-counter', action: 'sale.completed', ts })

// ---- 1. the record survives a reload ------------------------------------------------------
{
  const storage = memoryStorage()
  check(readStoredMetrics(storage).length === 0, 'a fresh device has no recorded events')

  const written = writeStoredMetrics([sale(1), sale(2)], storage)
  check(written === true, 'events are written to storage')

  // A reload is exactly this: a fresh read of the same storage with no memory of the session.
  const afterReload = readStoredMetrics(storage)
  check(afterReload.length === 2, 'the record survives a reload -- this is the whole point')
  check(afterReload[0].action === 'sale.completed', 'and the events come back intact')
  check(afterReload[1].ts === 2, 'in the order they happened')

  const raw = JSON.parse(storage.getItem(LOCAL_METRICS_STORAGE_KEY))
  check(raw.schema === LOCAL_METRICS_SCHEMA, 'the record is schema-stamped so a future shape can be told apart')
  check(raw.version === 1, 'and version-stamped')
}

// ---- 2. bounded on a device that trades for months ---------------------------------------
{
  const storage = memoryStorage()
  const many = Array.from({ length: LOCAL_METRICS_MAX_EVENTS + 250 }, (_, index) => sale(index))
  writeStoredMetrics(many, storage)

  // Read the raw record, NOT via readStoredMetrics: that caps on read too, so asserting
  // through it would pass even with the write cap removed while localStorage grew forever.
  const serialised = JSON.parse(storage.getItem(LOCAL_METRICS_STORAGE_KEY))
  check(serialised.events.length === LOCAL_METRICS_MAX_EVENTS, 'the SERIALISED record is capped, so storage cannot grow without bound')
  check(serialised.events[serialised.events.length - 1].ts === many[many.length - 1].ts, 'and the newest event is the one kept on disk')

  const stored = readStoredMetrics(storage)
  check(stored.length === LOCAL_METRICS_MAX_EVENTS, 'the stored history is capped')
  check(stored[stored.length - 1].ts === many[many.length - 1].ts, 'and it is the NEWEST events that are kept')
  check(stored[0].ts === many.length - LOCAL_METRICS_MAX_EVENTS, 'the oldest tail is what gets dropped')

  // Bounded on READ too, so an older or hand-edited oversized record cannot grow unbounded.
  const oversized = memoryStorage({
    [LOCAL_METRICS_STORAGE_KEY]: JSON.stringify({ schema: LOCAL_METRICS_SCHEMA, version: 1, events: many }),
  })
  check(readStoredMetrics(oversized).length === LOCAL_METRICS_MAX_EVENTS, 'an oversized stored record is bounded on read as well')
}

// ---- 3. instrumentation never breaks the product -----------------------------------------
{
  const rejecting = {
    getItem: () => { throw new Error('storage disabled') },
    setItem: () => { throw new Error('quota exceeded') },
  }
  check(writeStoredMetrics([sale()], rejecting) === false, 'a storage rejection is reported, not thrown')
  check(readStoredMetrics(rejecting).length === 0, 'an unreadable store yields no events rather than an exception')
  check(writeStoredMetrics([sale()], undefined) === false, 'no storage at all is survivable')
  check(readStoredMetrics(undefined).length === 0, 'and reads without storage return nothing')

  const corruptRecords = [
    ['not json', '{{{'],
    ['wrong schema', JSON.stringify({ schema: 'something.else.v1', events: [sale()] })],
    ['events not an array', JSON.stringify({ schema: LOCAL_METRICS_SCHEMA, events: 'nope' })],
    ['null', 'null'],
  ]
  for (const [label, raw] of corruptRecords) {
    const corrupt = memoryStorage({ [LOCAL_METRICS_STORAGE_KEY]: raw })
    check(readStoredMetrics(corrupt).length === 0, `a corrupt record (${label}) reads as empty instead of throwing`)
  }
}

// ---- 4. the event shape is closed, so a reload cannot resurrect a stray field -------------
{
  check(validMetricEvent(sale()) === true, 'a well-formed event is accepted')
  check(validMetricEvent({ ...sale(), capability: null }) === true, 'a null capability is allowed')

  const malformed = [
    ['unknown product', { ...sale(), product: 'accounting' }],
    ['missing action', { ...sale(), action: '' }],
    ['non-numeric ts', { ...sale(), ts: 'now' }],
    ['infinite ts', { ...sale(), ts: Infinity }],
    ['object capability', { ...sale(), capability: {} }],
    ['extra field', { ...sale(), customerName: 'Daw Hla' }],
  ]
  for (const [label, event] of malformed) {
    check(validMetricEvent(event) === false, `a malformed event is refused (${label})`)
  }

  // The decisive one. Metric events carry no customer data by construction, and that has to
  // survive a round trip through storage -- otherwise a hand-edited or future-shaped record
  // could reintroduce a name that the type system alone can no longer exclude.
  const leaky = memoryStorage({
    [LOCAL_METRICS_STORAGE_KEY]: JSON.stringify({
      schema: LOCAL_METRICS_SCHEMA,
      version: 1,
      events: [sale(1), { ...sale(2), customerName: 'Daw Hla', phone: '09-000000' }, sale(3)],
    }),
  })
  const cleaned = readStoredMetrics(leaky)
  check(cleaned.length === 2, 'an event carrying fields outside the closed shape is dropped on read')
  check(!JSON.stringify(cleaned).includes('Daw Hla'), 'and no customer name survives into the returned events')
  check(cleaned[0].ts === 1 && cleaned[1].ts === 3, 'while the well-formed events around it are kept')
}

console.log(`local metrics persistence: ${checks} checks passed`)
