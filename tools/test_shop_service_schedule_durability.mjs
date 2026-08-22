// Durability guard for the Shop appointment book.
//
// For an appointment trade -- a spa, a gym, a clinic -- the book IS the business. Losing a
// booking is losing a customer who arrives to find nobody expecting them.
//
// The book used to be written with a bare `localStorage.setItem`. That is three silent
// failure modes. A quota or private-mode rejection throws where nobody catches it, so the
// booking is gone but the screen says saved. Two open tabs interleave read-modify-write and
// the later one overwrites the earlier one's booking with no trace. And an invalid state can
// be persisted, after which `readShopServiceSchedule` refuses to load the book at all --
// turning one bad write into total loss of the appointment history.
//
// Commerce already solved this in `mutateCommerceWorkspace`: exclusive Web Lock, validate the
// proposal, write, then READ IT BACK and confirm. This guard holds the appointment book to the
// same contract, and asserts the concurrency guard is direction-correct -- it must refuse a
// write whose base is older than what is stored, and must NOT refuse the ordinary case where
// they agree, because refusing there would make the book unusable.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export {
      SHOP_SERVICE_SCHEDULE_STORAGE_KEY, SHOP_SERVICE_SCHEDULE_LOCK,
      createShopServiceSchedule, mutateShopServiceSchedule, readShopServiceSchedule,
      planShopServiceScheduleWrite, scheduleShopServiceBooking,
    } from './shop-service-scheduling.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/schedule-durability-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  SHOP_SERVICE_SCHEDULE_STORAGE_KEY, SHOP_SERVICE_SCHEDULE_LOCK,
  createShopServiceSchedule, mutateShopServiceSchedule, readShopServiceSchedule,
  planShopServiceScheduleWrite, scheduleShopServiceBooking,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed))
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, value) },
    removeItem: (key) => { map.delete(key) },
  }
}

// A lock manager that records the names it was asked for and serializes callbacks.
function recordingLocks() {
  const names = []
  let chain = Promise.resolve()
  return {
    names,
    request: (name, options, callback) => {
      names.push({ name, mode: options?.mode })
      const run = chain.then(() => callback())
      chain = run.then(() => undefined, () => undefined)
      return run
    },
  }
}

const booked = (base, startsAt = '2026-09-01T03:00:00.000Z', customerName = 'Daw Hla') => {
  const service = base.services[0]
  const resource = base.resources[0]
  return scheduleShopServiceBooking(base, {
    serviceId: service.id,
    resourceId: resource.id,
    customerName,
    contact: `test-${customerName}`,
    appointmentUpdates: 'declined',
    startsAt,
  }, { actor: 'Owner', reason: 'Booked at the counter.', happenedAt: '2026-08-18T02:00:00.000Z' })
}

// ---- 1. the ordinary write is durable ------------------------------------------------
{
  const storage = memoryStorage()
  const locks = recordingLocks()
  const base = createShopServiceSchedule('spa')
  const next = booked(base)

  const result = await mutateShopServiceSchedule((current) => (current.revision > base.revision ? null : next), storage, locks)
  check(result.ok === true, 'a first booking on an empty device is written')
  check(locks.names.length === 1, 'the write took exactly one lock')
  check(locks.names[0].name === SHOP_SERVICE_SCHEDULE_LOCK, `the lock is the appointment lock, got ${locks.names[0].name}`)
  check(locks.names[0].mode === 'exclusive', 'and it is exclusive, so two tabs cannot interleave')

  const stored = readShopServiceSchedule(storage.getItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY))
  check(stored.bookings.length === 1, 'the booking is really in storage, not only in memory')
  check(stored.revision === next.revision, 'and the stored revision matches what was committed')
}

// ---- 2. an absent key is a fresh install, not an error -------------------------------
// Commerce refuses to write when its key is missing because it demands explicit
// initialization. The appointment book must NOT copy that: a missing key is a new device.
{
  const storage = memoryStorage()
  const base = createShopServiceSchedule('spa')
  const result = await mutateShopServiceSchedule(() => booked(base), storage, recordingLocks())
  check(result.ok === true, 'a missing appointment key seeds a fresh book instead of failing closed')
}

// ---- 3. storage that silently drops the write is caught ------------------------------
// This is the private-mode and quota case. setItem appears to succeed; nothing persists.
{
  const storage = memoryStorage()
  storage.setItem = () => {}
  const base = createShopServiceSchedule('spa')
  const result = await mutateShopServiceSchedule(() => booked(base), storage, recordingLocks())
  check(result.ok === false, 'a write that does not persist is reported as a failure, not a success')
  check(/did not confirm/i.test(result.error), `the operator is told the write was not confirmed, got: ${result.error}`)
}

// ---- 4. storage that throws is caught --------------------------------------------------
{
  const storage = memoryStorage()
  storage.setItem = () => { throw new Error('QuotaExceededError') }
  const base = createShopServiceSchedule('spa')
  const result = await mutateShopServiceSchedule(() => booked(base), storage, recordingLocks())
  check(result.ok === false, 'a throwing storage does not escape as an unhandled rejection')
  check(/rejected the write/i.test(result.error), `the operator is told the booking was not saved, got: ${result.error}`)
}

// ---- 5. an invalid proposal never reaches storage ---------------------------------------
{
  const storage = memoryStorage()
  const base = createShopServiceSchedule('spa')
  const before = storage.getItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY)
  const result = await mutateShopServiceSchedule(() => ({ ...base, revision: -1 }), storage, recordingLocks())
  check(result.ok === false, 'a state that fails validation is refused')
  check(storage.getItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY) === before, 'and storage is untouched, so a bad write cannot make the book unreadable')
}

// ---- 6. the concurrency guard is direction-correct -------------------------------------
// Both directions matter. Refusing when storage moved ahead prevents silent data loss.
// NOT refusing when they agree keeps the book usable -- a guard that refuses everything
// would pass a one-sided test while making the product unusable.
// NOTE: every case below drives `planShopServiceScheduleWrite`, the guard the component
// actually ships. An earlier version of this test hand-wrote an equivalent closure, which
// meant the shipped guard was never executed here and could have been changed freely
// without failing anything.
{
  const storage = memoryStorage()
  const base = createShopServiceSchedule('spa')

  const tabA = booked(base)
  const first = await mutateShopServiceSchedule(planShopServiceScheduleWrite(base.revision, tabA), storage, recordingLocks())
  check(first.ok === true, 'the first tab writes its booking')

  // A second tab still holding the pre-write state tries to commit its own booking.
  const tabB = booked(base)
  const second = await mutateShopServiceSchedule(planShopServiceScheduleWrite(base.revision, tabB), storage, recordingLocks())
  check(second.ok === false, 'the stale tab is refused instead of overwriting the first booking')

  const stored = readShopServiceSchedule(storage.getItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY))
  check(stored.revision === tabA.revision, 'the first tab\'s booking survives')
  check(stored.bookings.length === 1, 'and no booking was lost to the overwrite')

  // The same tab, now up to date, must be able to continue working. A guard that refused
  // everything would satisfy the check above while making the appointment book unusable.
  const fresh = readShopServiceSchedule(storage.getItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY))
  const later = booked(fresh, '2026-09-01T06:00:00.000Z', 'U Ba')
  const third = await mutateShopServiceSchedule(planShopServiceScheduleWrite(fresh.revision, later), storage, recordingLocks())
  check(third.ok === true, 'a tab that has caught up can write again -- the guard is not a deadlock')
  check(readShopServiceSchedule(storage.getItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY)).bookings.length === 2, 'and both real bookings are now in the book')
}

// ---- 6b. the guard must survive MORE THAN ONE collision -------------------------------
// The dangerous case is the refused tab's SECOND attempt. The component advances its
// on-screen book optimistically, so after a refusal its in-memory revision equals the
// revision storage independently reached. If that stale book is used as the next
// baseline, the numbers match by coincidence, the guard says yes, and the other tab's
// booking is overwritten -- the exact loss this whole change exists to prevent.
// commit() therefore re-reads storage on refusal; this asserts the consequence.
{
  const storage = memoryStorage()
  const base = createShopServiceSchedule('spa')

  const tabA = booked(base, '2026-09-01T03:00:00.000Z', 'Daw Hla')
  await mutateShopServiceSchedule(planShopServiceScheduleWrite(base.revision, tabA), storage, recordingLocks())

  const tabB = booked(base, '2026-09-01T09:00:00.000Z', 'U Ba')
  const refused = await mutateShopServiceSchedule(planShopServiceScheduleWrite(base.revision, tabB), storage, recordingLocks())
  check(refused.ok === false, 'tab B is refused on its first attempt')

  // Demonstrate WHY commit() must reconcile, rather than asserting a guarantee this
  // guard cannot give. Booking ids come from `identifier(prefix, revision)`, so two tabs
  // booking from revision 5 produce byte-identical events AND the same booking id. The
  // guard has nothing to tell the lineages apart. Fed the phantom baseline a
  // non-reconciling tab would hold, it therefore ACCEPTS, and the winner is lost.
  // This is the documented limit, pinned so that if someone later gives the schedule
  // per-write identity, this check fails and points them at the stronger guarantee.
  {
    const probe = memoryStorage({ [SHOP_SERVICE_SCHEDULE_STORAGE_KEY]: storage.getItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY) })
    const phantomBaseline = tabB.revision
    const fromStale = booked(tabB, '2026-09-01T12:00:00.000Z', 'Ma Thida')
    const clobber = await mutateShopServiceSchedule(planShopServiceScheduleWrite(phantomBaseline, fromStale), probe, recordingLocks())
    check(clobber.ok === true, 'a stale baseline is accepted -- revision is a count, not an identity')
    check(
      !readShopServiceSchedule(probe.getItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY)).bookings.some((b) => b.customerName === 'Daw Hla'),
      'and it loses the winning booking, which is exactly why commit() re-reads storage when refused',
    )
  }

  // RIGHT baseline: what commit() actually does -- re-read storage, then continue.
  const reconciled = readShopServiceSchedule(storage.getItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY))
  check(reconciled.bookings.some((booking) => booking.customerName === 'Daw Hla'), 'storage still holds the winning booking before tab B retries')
  const retry = booked(reconciled, '2026-09-01T12:00:00.000Z', 'Ma Thida')
  const accepted = await mutateShopServiceSchedule(planShopServiceScheduleWrite(reconciled.revision, retry), storage, recordingLocks())
  check(accepted.ok === true, 'and after reconciling, tab B can book again')
  const finalBook = readShopServiceSchedule(storage.getItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY))
  check(finalBook.bookings.length === 2, 'both surviving bookings are present')
  check(finalBook.bookings.some((booking) => booking.customerName === 'Daw Hla'), 'the first tab\'s customer was never lost')
}

// ---- 7. a no-op transition is reported as replayed, not written ------------------------
{
  const storage = memoryStorage()
  const base = createShopServiceSchedule('spa')
  await mutateShopServiceSchedule(() => booked(base), storage, recordingLocks())
  const result = await mutateShopServiceSchedule((current) => current, storage, recordingLocks())
  check(result.ok === true && result.replayed === true, 'returning the current state is an idempotent replay, not a rewrite')
}

// ---- 8. a browser with no lock support fails closed ------------------------------------
// Writing without the lock would reintroduce exactly the interleaving this guard prevents,
// so refusing is correct even though it costs the write.
//
// Absence must be passed EXPLICITLY. Omitting the argument (or passing undefined) triggers
// the default parameter, and Node 24 ships a real `navigator.locks` -- so the "unsupported
// browser" path would quietly run on Node's own LockManager and the guard would go untested.
{
  const storage = memoryStorage()
  const base = createShopServiceSchedule('spa')
  const result = await mutateShopServiceSchedule(() => booked(base), storage, {})
  check(result.ok === false, 'a browser without Web Locks is refused rather than written unsafely')
  check(storage.getItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY) === null, 'and nothing was written behind the refusal')
}

console.log(`shop appointment book durability: ${checks} checks passed`)
