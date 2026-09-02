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
//
// ---------------------------------------------------------------------------------------
// WHAT THIS FILE COVERS NOW (it outgrew its name): the LOCAL TELEMETRY CONTRACT, both lanes.
//
// Sections 1-4 are the original persistence guard for analytics/metrics-collector.ts.
// Sections 5-10 are the behavioural guard for core/client-error-reporter.ts, which until
// they existed had NO behavioural test at all -- it was held up only by source-string pins
// in tools/verify_app_build.mjs, exactly the vacuity pattern
// hq/strategy/VERIFIER-VACUITY-AUDIT.md exists to catch. A string pin proves a line of code
// is still present; it cannot prove the code does what the line claims. That matters more
// here than almost anywhere else in the repo, because the error reporter is the ONE module
// that puts bytes on an egress path: it rides the Vercel Web Analytics window.vaq queue and
// installs on production hostnames only (main.tsx gates it behind isBeaconHost). Untested
// code on an egress path is the worst combination there is -- a silent regression does not
// break the app, it leaks.
//
//  5. classifyError() is a total function into the closed ERROR_CLASSES enum. Every member
//     including the 'unknown' fallback is reachable, and a raw message never comes back out.
//  6. hashErrorMessage() is stable, discriminating, and one-way -- the raw text never
//     appears in the digest and the width is fixed no matter how much text went in.
//  7. The emitted event carries EXACTLY its four documented fields, and no stack frame, URL,
//     query string or hash fragment reaches the queue.
//  8. The isBeaconHost gate is real: on a non-production hostname nothing is queued on
//     window.vaq at ALL, checked against a positive control on a production hostname so the
//     assertion cannot pass by simply never emitting.
//  9. MetricEvent's structural PII exclusion holds at the emission boundary too, not only
//     across storage -- a field outside the closed shape cannot be recorded in the first
//     place.
//  10. The entry point really is gated. Section 8 proves the gate over the real function, but
//     that proves nothing about showroom/src/main.tsx, which is where the gate is applied. This
//     reads main.tsx and holds that startClientErrorReporter() is called exactly once, that the
//     call is the guarded statement `if (isBeaconHost()) startClientErrorReporter()`, and that
//     both names are imported from core/client-error-reporter with nothing shadowing them --
//     so an unconditional call, a reversed condition, or a local look-alike guard all fail.
// ---------------------------------------------------------------------------------------
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

// ===========================================================================================
// The client error lane (core/client-error-reporter.ts) -- the egress half of the contract.
// ===========================================================================================

// Same esbuild-from-source strategy as the collector entry above. The reporter reaches for
// window/location/fetch only from inside its functions, never at module scope, so the module
// imports cleanly into Node and the browser can be supplied per test.
const reporterBundle = await build({
  stdin: {
    contents: `export {
      ERROR_CLASSES, isBeaconHost, classifyError, hashErrorMessage,
      report, getReportedErrors, startClientErrorReporter,
    } from '../core/client-error-reporter.ts'
    export { startMetricsCollector, emitMetric, getSessionEvents } from './metrics-collector.ts'`,
    resolveDir: 'showroom/src/analytics',
    sourcefile: 'showroom/src/analytics/telemetry-contract-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})
const reporterSource = Buffer.from(reporterBundle.outputFiles[0].contents).toString()

// The reporter keeps per-session state (report budget, dedupe keys, the memoised commit
// fetch). A "new browser session" is therefore a new module instance: appending a unique
// comment changes the data: URL, so Node's module cache hands back a fresh evaluation.
let sessionCounter = 0
async function freshTelemetrySession() {
  sessionCounter += 1
  const source = `${reporterSource}\n// session ${sessionCounter}\n`
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

// A minimal browser: an EventTarget for window (so the real addEventListener/dispatchEvent
// paths run rather than a stub), a location, and a /__release.json fetch. Nothing else is
// provided -- if the reporter reaches for anything more, the test fails loudly.
async function withBrowser({ hostname = 'app.supermega.dev', hash = '#/', commit = 'a1b2c3d4e5f6' }, body) {
  const win = new EventTarget()
  win.location = { hostname, hash }
  const saved = {
    window: globalThis.window, location: globalThis.location, fetch: globalThis.fetch,
  }
  const fetched = []
  globalThis.window = win
  globalThis.location = win.location
  globalThis.fetch = async (url) => {
    fetched.push(url)
    return { ok: true, json: async () => ({ commit }) }
  }
  try {
    return await body(win, fetched)
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key]
      else globalThis[key] = value
    }
  }
}

// A page error as the browser delivers it: window 'error' with .error and .message.
function dispatchPageError(win, error, message = '') {
  const event = new Event('error')
  event.error = error
  event.message = message
  win.dispatchEvent(event)
}

// report() resolves the commit through a promise before it queues, so the queue is only
// settled after the microtask turn completes.
const settle = () => new Promise((resolve) => { setTimeout(resolve, 0) })

const { ERROR_CLASSES, isBeaconHost, classifyError, hashErrorMessage } = await freshTelemetrySession()

// ---- 5. classifyError is total over the closed enum, and leaks no message text ------------
{
  const domException = (message, name) => new DOMException(message, name)
  // One case per member of ERROR_CLASSES, written in the shape the browser actually hands
  // over: an Error for a real throw, a bare string for a thrown non-Error, and (candidate,
  // fallback) = (null, message) for the masked cross-origin case window.onerror reports.
  const cases = [
    ['chunk_load', new Error('Failed to fetch dynamically imported module: https://app.supermega.dev/assets/Shop-a1b2.js'), ''],
    ['network_fetch', new TypeError('Failed to fetch'), ''],
    ['quota_exceeded', domException('The quota has been exceeded.', 'QuotaExceededError'), ''],
    ['security', domException('Blocked a frame with origin', 'SecurityError'), ''],
    ['type', new TypeError('u is not a function'), ''],
    ['reference', new ReferenceError('draft is not defined'), ''],
    ['range', new RangeError('Maximum call stack size exceeded'), ''],
    ['syntax', new SyntaxError('Unexpected token < in JSON'), ''],
    ['uri', new URIError('URI malformed'), ''],
    ['dom', domException('The operation was aborted.', 'AbortError'), ''],
    ['generic_error', new Error('close failed'), ''],
    ['opaque', null, 'Script error.'],
    ['non_error', 'the till exploded', 'the till exploded'],
    // window.onerror with a message but no error object -- a real browser path, and the one
    // place the classifier could fall through and hand the raw text back as the "class".
    ['non_error', null, 'Uncaught ReferenceError: draft is not defined'],
    ['unknown', undefined, ''],
    ['unknown', null, ''],
  ]

  const produced = new Set()
  for (const [expected, candidate, fallback] of cases) {
    const actual = classifyError(candidate, fallback)
    check(actual === expected, `classifyError buckets the ${expected} shape as '${expected}' (got '${actual}')`)
    check(ERROR_CLASSES.includes(actual), `and '${actual}' is a member of the closed ERROR_CLASSES enum`)
    produced.add(actual)
  }

  // Totality, stated as a set equality rather than a count: every declared class is
  // reachable from a real failure shape, and no case produced a class outside the enum.
  // If someone adds a class to ERROR_CLASSES without a way to reach it, this fails.
  check(
    produced.size === ERROR_CLASSES.length
      && ERROR_CLASSES.every((name) => produced.has(name)),
    'every member of ERROR_CLASSES is reachable, including the unknown fallback',
  )

  // Anything unrecognised must still land inside the enum rather than falling through.
  const exotic = [
    ['a thrown object', { code: 500 }, ''],
    ['a thrown number', 42, ''],
    ['a nameless Error subclass', Object.assign(new Error('x'), { name: 'WeirdError' }), ''],
    ['no information at all', null, ''],
  ]
  for (const [label, candidate, fallback] of exotic) {
    check(ERROR_CLASSES.includes(classifyError(candidate, fallback)), `an unrecognised failure (${label}) still classifies inside the enum`)
  }

  // The decisive one: the classifier is a bucket, not a passthrough. A message carrying
  // customer detail must not come back out as, or inside, the returned class.
  const personal = 'Cannot read properties of undefined reading order for Daw Hla 09-771234'
  const bucketed = classifyError(new Error(personal), personal)
  check(ERROR_CLASSES.includes(bucketed), 'a message full of customer detail still classifies to an enum member')
  check(!bucketed.includes('Daw Hla') && !bucketed.includes('09-771234'), 'and no customer detail survives into the class')
  check(bucketed !== personal, 'classifyError never returns the raw message')
}

// ---- 6. hashErrorMessage is stable, discriminating, and one-way ---------------------------
{
  const personal = 'Order 4471 for Daw Hla (09-771234) failed to save'
  const digest = hashErrorMessage(personal)

  check(hashErrorMessage(personal) === digest, 'the same message hashes to the same value -- it is a usable dedupe key')
  check(hashErrorMessage(`${personal}!`) !== digest, 'a different message hashes differently')
  check(hashErrorMessage('Order 4471 for U Ba (09-000000) failed to save') !== digest,
    'two errors differing only in the customer detail are still told apart')

  check(/^[0-9a-f]{8}$/.test(digest), 'the digest is exactly 8 lowercase hex characters')
  check(/^[0-9a-f]{8}$/.test(hashErrorMessage('')), 'including for an empty message')

  // NOT reversible. Two independent statements of that:
  //  (a) nothing of the input is present in the output, and
  //  (b) the output width is fixed regardless of input size, so the mapping is lossy by
  //      construction -- a 4KB message and a 1-character message produce the same 32 bits.
  for (const fragment of ['Daw Hla', 'U Ba', '09-771234', '4471', 'Order', personal]) {
    check(!digest.includes(fragment), `the digest does not contain '${fragment}' from the raw message`)
  }
  check(!Buffer.from(digest, 'hex').toString('utf8').includes('Daw'), 'and hex-decoding the digest yields no message text either')

  const long = `${personal} ${'x'.repeat(4096)}`
  check(hashErrorMessage(long).length === 8, 'a 4KB message still yields 8 characters -- the input cannot be reconstructed from it')
  check(hashErrorMessage('a').length === 8, 'as does a 1-character message: fixed width, information destroyed')

  // Distinct inputs must not all collapse onto one value, or the "hash" would be a constant
  // that happens to satisfy every leak assertion above while carrying no signal.
  const spread = new Set(Array.from({ length: 200 }, (_, index) => hashErrorMessage(`failure ${index}`)))
  check(spread.size === 200, 'two hundred distinct messages produce two hundred distinct digests')
}

// ---- 7. the emitted event carries exactly four fields and no location detail --------------
{
  // A hash carrying a record id and a customer name in its query string, which is precisely
  // the raw value that must NOT reach the beacon.
  const leakyHash = '#/shop/orders?id=ORD-4471&customer=Daw%20Hla&token=abc'
  await withBrowser({ hash: leakyHash, commit: 'a1b2c3d4e5f6abcdef' }, async (win, fetched) => {
    const telemetry = await freshTelemetrySession()
    telemetry.startClientErrorReporter()

    const crash = new Error('Cannot read properties of undefined reading total for Daw Hla 09-771234')
    check(typeof crash.stack === 'string' && crash.stack.includes('at '), 'precondition: the thrown error really does carry stack frames')
    dispatchPageError(win, crash, 'Uncaught TypeError')
    await settle()

    check(Array.isArray(win.vaq) && win.vaq.length === 1, 'exactly one event is queued on window.vaq')
    const [verb, payload] = win.vaq[0]
    check(verb === 'event', 'queued through the documented plain-script custom-event verb')
    check(payload.name === 'client_error', 'under the client_error event name')

    const data = payload.data
    assert.deepEqual(
      Object.keys(data).sort(),
      ['class', 'commit', 'hash', 'route'],
      'the event body has EXACTLY the four documented fields -- no more, no fewer',
    )
    checks += 1
    check(ERROR_CLASSES.includes(data.class), 'class is an enum member')
    check(/^[0-9a-f]{8}$/.test(data.hash), 'hash is the one-way digest, not the message')
    check(data.route === 'shop.orders', 'route is the coarse SURFACE_MAP label')
    check(data.commit === 'a1b2c3d4e5f6', 'commit is the build commit, truncated to 12 characters')
    check(fetched.length === 1 && fetched[0] === '/__release.json', 'the commit came from /__release.json, fetched once')

    // The whole outbound payload, as text. Nothing that identifies a person, a record or a
    // source file may appear anywhere in it.
    const wire = JSON.stringify(win.vaq)
    for (const forbidden of ['Daw', '09-771234', 'ORD-4471', 'customer', 'token', 'abc', 'undefined reading total']) {
      check(!wire.includes(forbidden), `the outbound payload contains no '${forbidden}'`)
    }
    check(!wire.includes('at '), 'no stack frames reach the beacon')
    check(!wire.includes('.ts') && !wire.includes('.js'), 'no source file names reach the beacon')
    check(!wire.includes('http'), 'no URL reaches the beacon')
    check(!wire.includes('?'), 'no query string reaches the beacon')
    check(!wire.includes('#'), 'no hash fragment reaches the beacon')
    check(!wire.includes('/'), 'not even a path separator reaches the beacon')
    check(wire.length < 200, 'and the event stays tiny and bounded')

    // The in-memory session record must be the same PII-free shape, not a richer local copy.
    const recorded = telemetry.getReportedErrors()
    check(recorded.length === 1, 'the session record holds the one report')
    assert.deepEqual(Object.keys(recorded[0]).sort(), ['class', 'commit', 'hash', 'route'],
      'and the local record is the same four fields -- there is no fuller copy kept anywhere')
    checks += 1
  })

  // The route field's OTHER branch. A hash that SURFACE_MAP does not know must degrade to the
  // constant 'other' -- an unmapped route is exactly where the raw hash (and whatever record
  // id or name is embedded in it) would otherwise escape.
  await withBrowser({ hash: '#/customers/Daw%20Hla/ORD-4471?print=1' }, async (win) => {
    const telemetry = await freshTelemetrySession()
    telemetry.startClientErrorReporter()
    dispatchPageError(win, new Error('print failed'), 'Uncaught Error')
    await settle()

    const data = win.vaq[0][1].data
    check(data.route === 'other', 'an unmapped route degrades to the constant "other", never to the raw hash')
    const wire = JSON.stringify(win.vaq)
    for (const forbidden of ['customers', 'Daw', 'ORD-4471', 'print', '/', '?', '#', '%']) {
      check(!wire.includes(forbidden), `an unmapped route leaks no '${forbidden}' onto the wire`)
    }
  })

  // report() is the direct entry RouteErrorBoundary calls, because React's componentDidCatch
  // never reaches window.onerror. Its egress bound is the thing worth pinning: a render loop
  // rethrowing one error must not become an unbounded stream of beacon events.
  await withBrowser({ hash: '#/shop' }, async (win) => {
    const telemetry = await freshTelemetrySession()
    for (let attempt = 0; attempt < 40; attempt += 1) telemetry.report(new Error('render loop'), '')
    await settle()
    check(win.vaq.length === 1, 'the same error reported forty times queues exactly one event (deduped)')

    for (let attempt = 0; attempt < 40; attempt += 1) telemetry.report(new Error(`distinct failure ${attempt}`), '')
    await settle()
    check(win.vaq.length === 5, 'and forty DISTINCT errors stop at the five-per-session budget')
    check(telemetry.getReportedErrors().length === 5, 'the session record is bounded to the same five')
  })
}

// ---- 8. the isBeaconHost gate is real, checked against a positive control -----------------
{
  const gated = [
    ['localhost', false],
    ['127.0.0.1', false],
    ['showroom-git-main.vercel.app', false],
    ['swanhtet01.github.io', false],
    ['notsupermega.dev', false],
    ['supermega.dev.attacker.example', false],
    ['supermega.dev', true],
    ['app.supermega.dev', true],
  ]
  for (const [hostname, expected] of gated) {
    check(isBeaconHost(hostname) === expected, `isBeaconHost('${hostname}') === ${expected}`)
  }

  // Behavioural, exactly as main.tsx wires it: `if (isBeaconHost()) startClientErrorReporter()`.
  // A non-production host must queue NOTHING -- not an empty queue, no queue at all, and no
  // window.va stub installed either.
  await withBrowser({ hostname: 'localhost', hash: '#/shop/orders' }, async (win) => {
    const telemetry = await freshTelemetrySession()
    if (telemetry.isBeaconHost()) telemetry.startClientErrorReporter()
    dispatchPageError(win, new Error('Cannot read properties of undefined'), 'Uncaught TypeError')
    await settle()
    check(win.vaq === undefined, 'on a non-production hostname nothing is queued on window.vaq at all')
    check(win.va === undefined, 'and the beacon queue stub is never even installed')
    check(telemetry.getReportedErrors().length === 0, 'and nothing is recorded in the session either')
  })

  // Positive control. Without this the assertions above would also pass if report() had been
  // broken outright, which is the failure mode a gating test is most likely to hide.
  await withBrowser({ hostname: 'app.supermega.dev', hash: '#/shop/orders' }, async (win) => {
    const telemetry = await freshTelemetrySession()
    if (telemetry.isBeaconHost()) telemetry.startClientErrorReporter()
    dispatchPageError(win, new Error('Cannot read properties of undefined'), 'Uncaught TypeError')
    await settle()
    check(Array.isArray(win.vaq) && win.vaq.length === 1, 'positive control: the SAME error on a production hostname does queue')
    check(telemetry.getReportedErrors().length === 1, 'so the gate above is what suppressed it, not a broken reporter')
  })
}

// ---- 9. MetricEvent PII exclusion holds at the emission boundary, not only in storage -----
{
  await withBrowser({ hash: '#/shop/orders' }, async (win) => {
    const telemetry = await freshTelemetrySession()
    telemetry.startMetricsCollector()

    const good = { product: 'shop', capability: 'shop-counter', action: 'sale.completed', ts: 1 }
    telemetry.emitMetric(good)
    check(telemetry.getSessionEvents().some((event) => event.action === 'sale.completed' && event.ts === 1),
      'a well-formed metric event is recorded')

    // A field outside MetricEvent cannot be emitted -- exclusion is structural, so the event
    // is refused whole rather than having the stray field stripped.
    const rejected = [
      ['a customer name', { ...good, ts: 2, customerName: 'Daw Hla' }],
      ['a phone number', { ...good, ts: 3, phone: '09-771234' }],
      ['a free-text note', { ...good, ts: 4, note: 'paid in cash by Daw Hla' }],
      ['an unknown product', { ...good, ts: 5, product: 'accounting' }],
      ['a non-numeric ts', { ...good, ts: 'just now' }],
      ['an object capability', { ...good, ts: 6, capability: { id: 'shop-counter' } }],
    ]
    for (const [label, event] of rejected) {
      const before = telemetry.getSessionEvents().length
      telemetry.emitMetric(event)
      check(telemetry.getSessionEvents().length === before,
        `an event outside the closed MetricEvent shape is never recorded (${label})`)
    }

    const wire = JSON.stringify(telemetry.getSessionEvents())
    for (const forbidden of ['Daw Hla', '09-771234', 'paid in cash', 'accounting']) {
      check(!wire.includes(forbidden), `no '${forbidden}' reaches the session record`)
    }
    check(win.location.hash === '#/shop/orders', 'sanity: the harness never mutated the page location')
  })
}

// ---- 10. the entry point applies the gate: main.tsx wiring, not a re-enactment of it -------
{
  // Section 8 exercises isBeaconHost() and startClientErrorReporter() as real functions, but
  // the line that joins them lives in main.tsx. If that entry point ever called the reporter
  // unconditionally, reversed the condition, or guarded it with a look-alike, section 8 would
  // stay green while every preview and local host started shipping error events. So the
  // wiring is held here, against the file as written, with comments stripped first so a
  // commented-out call or a comment quoting the guard cannot satisfy or defeat it.
  const { readFileSync } = await import('node:fs')
  const entry = readFileSync('showroom/src/main.tsx', 'utf8')
  const code = entry.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

  const calls = code.match(/startClientErrorReporter\s*\(/g) || []
  check(calls.length === 1, `main.tsx calls startClientErrorReporter exactly once (found ${calls.length})`)

  // The whole statement, not a substring: the guard and the call on one line, the call being
  // the guard's only consequence. `if (!isBeaconHost())`, `isBeaconHost() || true`, a call
  // outside the if, or a second call elsewhere all fail the count or the shape.
  const guarded = code.match(/^[ \t]*if \(isBeaconHost\(\)\) startClientErrorReporter\(\)[ \t]*;?[ \t]*$/m)
  check(guarded !== null, 'the one call is the guarded statement `if (isBeaconHost()) startClientErrorReporter()`')

  // Both names must be the real exports section 8 tested, not local definitions.
  const importLine = code.match(/^import \{([^}]*)\} from '\.\/core\/client-error-reporter'/m)
  const imported = importLine ? importLine[1].split(',').map((name) => name.trim()) : []
  check(imported.includes('isBeaconHost'), 'isBeaconHost is imported from ./core/client-error-reporter')
  check(imported.includes('startClientErrorReporter'), 'startClientErrorReporter is imported from ./core/client-error-reporter')
  check(!/\b(?:function|const|let|var)\s+isBeaconHost\b/.test(code), 'nothing in main.tsx shadows isBeaconHost')
  check(!/\b(?:function|const|let|var)\s+startClientErrorReporter\b/.test(code), 'nothing in main.tsx shadows startClientErrorReporter')

  // Sanity on the stripping itself, so a future comment style cannot hollow this section out:
  // the guard must be findable in the raw file too, and the raw file must still be TSX.
  check(entry.includes('if (isBeaconHost()) startClientErrorReporter()'), 'sanity: the guard is present in the unstripped source')
  check(/createRoot\(/.test(code), 'sanity: main.tsx is still the React entry point after comment stripping')
}

console.log(`local telemetry contract (metrics persistence + client error lane): ${checks} checks passed`)
