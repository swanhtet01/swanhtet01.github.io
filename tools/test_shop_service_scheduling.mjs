// Contract guard for Shop service scheduling -- the appointment book behind the spa, gym
// and school packs.
//
// Double-booking is the failure that reaches a customer directly: two people arrive for the
// same therapist at the same hour. The guard against it is four comparisons, and one detail
// in them is easy to get wrong in either direction. The inequalities are STRICT, so a 10:00
// booking that ends at 11:00 must not block an 11:00 booking -- back-to-back appointments
// are the normal case, and refusing them would make the book unusable. Overlapping by even a
// minute must still be refused.
//
// Both directions are asserted here, because a fix for one silently breaks the other.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export {
      createShopServiceSchedule, scheduleShopServiceBooking, cancelShopServiceBooking,
      validateShopServiceSchedule, projectShopServiceSchedule, shopServiceSaleSku,
    } from './shop-service-scheduling.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/scheduling-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  createShopServiceSchedule, scheduleShopServiceBooking, cancelShopServiceBooking,
  validateShopServiceSchedule, projectShopServiceSchedule, shopServiceSaleSku,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}
function rejects(run, label) {
  checks += 1
  assert.throws(run, undefined, label)
}

const schedule = createShopServiceSchedule('spa')
check(schedule.services.length > 0, 'the spa pack ships services')
check(schedule.resources.length > 0, 'and resources to deliver them')
check(schedule.bookings.length === 0, 'with an empty appointment book')
check(shopServiceSaleSku('spa', 'service-session') === 'SPA-SVC-MASSAGE', 'a reviewed Spa treatment maps to its exact counter SKU')
check(shopServiceSaleSku('spa', 'service-herbal-steam') === 'SPA-SVC-STEAM', 'the Spa map includes the complete treatment menu')
check(shopServiceSaleSku('spa', 'custom-service') === null, 'a custom Spa service is never guessed')
check(shopServiceSaleSku('gym', 'service-session') === null, 'another industry never inherits the Spa mapping')

const service = schedule.services[0]
const resource = schedule.resources[0]
const otherResource = schedule.resources[1]
const DURATION = service.durationMinutes
check(Number.isFinite(DURATION) && DURATION > 0, `the service has a positive duration, got ${DURATION}`)

const proof = (happenedAt = '2026-07-24T08:00:00.000Z') => ({
  actor: 'Swan Htet',
  reason: 'Customer booked at the counter',
  happenedAt,
})

const book = (state, startsAt, resourceId = resource.id, customerName = 'May') =>
  scheduleShopServiceBooking(state, {
    customerName, contact: '09-777-000111', serviceId: service.id, resourceId, startsAt,
  }, proof())

// --- a first booking ----------------------------------------------------------
const START = '2026-07-25T03:00:00.000Z'
const first = book(schedule, START)
check(first.bookings.length === 1, 'a booking is recorded')
const booking = first.bookings[0]
check(booking.status === 'held', 'and starts held rather than confirmed')
check(
  Date.parse(booking.endsAt) - Date.parse(booking.startsAt) === DURATION * 60_000,
  'its end time is derived from the service duration, not supplied by the caller',
)
check(first.revision === schedule.revision + 1, 'the revision advances')
check(schedule.bookings.length === 0, 'and the original schedule is not mutated')

// --- overlapping the same resource is refused --------------------------------
const overlapping = [
  ['the identical slot', START],
  ['a start one minute inside it', new Date(Date.parse(START) + 60_000).toISOString()],
  ['a start one minute before its end', new Date(Date.parse(booking.endsAt) - 60_000).toISOString()],
  ['an earlier start that runs into it', new Date(Date.parse(START) - 60_000).toISOString()],
]
for (const [label, startsAt] of overlapping) {
  rejects(() => book(first, startsAt), `booking ${label} on the same resource is refused`)
}

// --- back-to-back is allowed -------------------------------------------------
// This is the other half. A guard using <= would refuse these and make the book unusable.
const backToBack = book(first, booking.endsAt)
check(backToBack.bookings.length === 2, 'a booking starting exactly when the previous one ends IS allowed')

const justBefore = book(first, new Date(Date.parse(START) - DURATION * 60_000).toISOString())
check(justBefore.bookings.length === 2, 'and one ending exactly when the next begins is allowed too')

// --- a different resource at the same time is fine ---------------------------
if (otherResource) {
  const parallel = book(first, START, otherResource.id)
  check(parallel.bookings.length === 2, 'the same slot on a DIFFERENT resource is allowed -- the clash is per resource')
}

// --- a cancelled booking frees its slot --------------------------------------
const cancelled = cancelShopServiceBooking(first, booking.id, proof())
check(
  cancelled.bookings.find((entry) => entry.id === booking.id).status === 'cancelled',
  'a booking can be cancelled',
)
const rebooked = book(cancelled, START)
check(rebooked.bookings.length === 2, 'and its slot becomes available again -- a cancellation really releases the time')

// --- inactive services and resources -----------------------------------------
const deactivated = {
  ...schedule,
  resources: schedule.resources.map((entry) => (entry.id === resource.id ? { ...entry, active: false } : entry)),
}
rejects(() => book(deactivated, START), 'booking an inactive resource is refused')

const noService = {
  ...schedule,
  services: schedule.services.map((entry) => (entry.id === service.id ? { ...entry, active: false } : entry)),
}
rejects(() => book(noService, START), 'booking an inactive service is refused')
rejects(
  () => scheduleShopServiceBooking(schedule, {
    customerName: 'May', contact: '09-777-000111', serviceId: 'SVC-DOES-NOT-EXIST',
    resourceId: resource.id, startsAt: START,
  }, proof()),
  'booking a service that does not exist is refused',
)

// --- input validation ---------------------------------------------------------
rejects(() => book(schedule, 'not a date'), 'a booking with an unparseable start time is refused')
rejects(() => book(schedule, START, resource.id, ''), 'a booking with no customer name is refused')
rejects(
  () => scheduleShopServiceBooking(schedule, {
    customerName: 'May', contact: '09-777-000111', serviceId: service.id, resourceId: resource.id, startsAt: START,
  }, { actor: '', reason: 'r', happenedAt: '2026-07-24T08:00:00.000Z' }),
  'a booking with no named actor is refused',
)

// --- the resulting schedule stays valid --------------------------------------
check(Boolean(validateShopServiceSchedule(backToBack)), 'a schedule with back-to-back bookings validates')
check(Boolean(projectShopServiceSchedule(backToBack)), 'and projects without error')

// --- layered guard, recorded so the count is not over-read -------------------
// Deleting the conflict throw in scheduleShopServiceBooking leaves every check here
// passing, because validateShopServiceSchedule runs on the result and refuses the overlap
// itself ("Bookings booking-0001 and booking-0002 overlap"). Verified by running the
// mutated build. Double-booking is protected twice; this file proves the BEHAVIOUR, not
// that the booking-time clause is individually load-bearing.
//
// The three mutations that ARE caught here are the ones the validator cannot see: widening
// the inequalities to <= (which would refuse legitimate back-to-back appointments), letting
// cancelled bookings keep blocking their slot, and dropping the per-resource condition.

console.log(`shop service scheduling contract: ${checks} checks passed`)
