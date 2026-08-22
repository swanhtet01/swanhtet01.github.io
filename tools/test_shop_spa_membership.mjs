import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `
      export { createShopServiceSchedule, scheduleShopServiceBooking, advanceShopServiceBooking } from './shop-service-scheduling.ts'
      export { spaMembershipBalances, availableSpaMembershipForBooking, redeemSpaMembershipSession } from './shop-spa-membership.ts'
    `,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/spa-membership-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  createShopServiceSchedule,
  scheduleShopServiceBooking,
  advanceShopServiceBooking,
  spaMembershipBalances,
  availableSpaMembershipForBooking,
  redeemSpaMembershipSession,
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

const proof = (happenedAt, reason = 'Spa membership verification.') => ({ actor: 'Spa owner', reason, happenedAt })
const paidOrder = (customer = 'Daw Aye Aye', sku = 'SPA-PACK-MASSAGE-5', quantity = 1) => ({
  customer,
  status: 'completed',
  paymentStatus: 'reconciled',
  refundStatus: 'none',
  paymentReconciledAt: '2026-08-21T01:00:00.000Z',
  lines: [{ sku, quantity }],
})

function completeBooking(state, customer, serviceId, hour, resourceId = 'resource-staff-1') {
  const startsAt = `2026-08-21T${String(hour).padStart(2, '0')}:00:00.000Z`
  let next = scheduleShopServiceBooking(state, {
    customerName: customer,
    contact: '09-450-000-111',
    appointmentUpdates: 'declined',
    serviceId,
    resourceId,
    startsAt,
  }, proof(`2026-08-21T${String(hour - 1).padStart(2, '0')}:00:00.000Z`))
  const bookingId = next.bookings.at(-1).id
  next = advanceShopServiceBooking(next, bookingId, proof(`2026-08-21T${String(hour).padStart(2, '0')}:10:00.000Z`))
  next = advanceShopServiceBooking(next, bookingId, proof(`2026-08-21T${String(hour).padStart(2, '0')}:20:00.000Z`))
  next = advanceShopServiceBooking(next, bookingId, proof(`2026-08-21T${String(hour + 1).padStart(2, '0')}:00:00.000Z`))
  return { state: next, bookingId }
}

let schedule = createShopServiceSchedule('spa')
const commerce = { orders: [
  paidOrder(),
  { ...paidOrder('Pending Customer'), paymentStatus: 'pending', paymentReconciledAt: undefined },
  paidOrder('Guest'),
  { ...paidOrder('Refunded Customer'), refundStatus: 'settled' },
] }
const sourceOrders = structuredClone(commerce.orders)

let completed = completeBooking(schedule, 'Daw Aye Aye', 'service-session', 3)
schedule = completed.state
const firstBookingId = completed.bookingId

let balances = spaMembershipBalances(commerce, schedule)
check(balances.length === 1, 'only a named customer with a completed reconciled purchase receives a balance')
check(balances[0].purchased === 5 && balances[0].remaining === 5, 'one massage package funds five sessions')
check(availableSpaMembershipForBooking(commerce, schedule, firstBookingId)?.remaining === 5, 'the completed matching treatment can use the package')

const beforeBookings = structuredClone(schedule.bookings)
schedule = redeemSpaMembershipSession(schedule, commerce, firstBookingId, proof('2026-08-21T04:01:00.000Z'))
balances = spaMembershipBalances(commerce, schedule)
check(balances[0].redeemed === 1 && balances[0].remaining === 4, 'one immutable redemption consumes exactly one paid session')
check(schedule.events.at(-1).type === 'package_redeemed' && schedule.events.at(-1).subjectId === firstBookingId, 'redemption is bound to the completed booking')
check(JSON.stringify(schedule.bookings) === JSON.stringify(beforeBookings), 'redemption cannot rewrite appointment records')
check(JSON.stringify(commerce.orders) === JSON.stringify(sourceOrders), 'redemption cannot rewrite the source sale')
check(redeemSpaMembershipSession(schedule, commerce, firstBookingId, proof('2026-08-21T04:02:00.000Z')) === schedule, 'replaying the same booking is idempotent')
check(availableSpaMembershipForBooking(commerce, schedule, firstBookingId) === null, 'a booking cannot consume a second session')

for (const hour of [5, 7, 9, 11]) {
  completed = completeBooking(schedule, 'Daw Aye Aye', 'service-session', hour)
  schedule = redeemSpaMembershipSession(completed.state, commerce, completed.bookingId, proof(`2026-08-21T${String(hour + 1).padStart(2, '0')}:01:00.000Z`))
}
balances = spaMembershipBalances(commerce, schedule)
check(balances[0].redeemed === 5 && balances[0].remaining === 0, 'the package stops at its purchased session count')

completed = completeBooking(schedule, 'Daw Aye Aye', 'service-session', 13)
rejects(() => redeemSpaMembershipSession(completed.state, commerce, completed.bookingId, proof('2026-08-21T14:01:00.000Z')), 'a sixth treatment cannot overdraw the package')

let wrongCustomer = completeBooking(createShopServiceSchedule('spa'), 'Another Customer', 'service-session', 3)
rejects(() => redeemSpaMembershipSession(wrongCustomer.state, commerce, wrongCustomer.bookingId, proof('2026-08-21T04:01:00.000Z')), 'a package cannot cross customer names')

let wrongService = completeBooking(createShopServiceSchedule('spa'), 'Daw Aye Aye', 'service-facial', 3)
rejects(() => redeemSpaMembershipSession(wrongService.state, commerce, wrongService.bookingId, proof('2026-08-21T04:01:00.000Z')), 'a massage package cannot fund a facial')

const held = scheduleShopServiceBooking(createShopServiceSchedule('spa'), {
  customerName: 'Daw Aye Aye', contact: '09-450-000-111', appointmentUpdates: 'declined', serviceId: 'service-session', resourceId: 'resource-staff-1', startsAt: '2026-08-22T03:00:00.000Z',
}, proof('2026-08-22T02:00:00.000Z'))
rejects(() => redeemSpaMembershipSession(held, commerce, held.bookings[0].id, proof('2026-08-22T03:01:00.000Z')), 'an unfinished appointment cannot consume a package')

const early = completeBooking(createShopServiceSchedule('spa'), 'Daw Aye Aye', 'service-session', 3)
rejects(() => redeemSpaMembershipSession(early.state, commerce, early.bookingId, proof('2026-08-21T03:59:00.000Z')), 'redemption evidence cannot predate completion')

const gym = createShopServiceSchedule('gym')
rejects(() => redeemSpaMembershipSession(gym, commerce, 'booking-0001', proof('2026-08-21T04:01:00.000Z')), 'another industry pack cannot use Spa packages')
rejects(() => spaMembershipBalances(commerce, schedule, 'not-a-timestamp'), 'an invalid balance cutoff fails closed')

console.log(`shop Spa membership verified (${checks} checks)`)
