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
      advanceShopServiceBooking, prepareShopServiceCharge,
      validateShopServiceSchedule, projectShopServiceSchedule, readShopServiceSchedule,
      catalogNameSellsShopService, shopServiceSaleSku,
      anonymizeShopServiceClient, recordShopServiceClientExport,
      setShopServiceClientRetention, shopServiceClientAnonymizationReadiness,
      shopServiceClientCsv,
    } from './shop-service-scheduling.ts'
    export {
      projectShopAppointmentTillReconciliation,
    } from './shop-appointment-till-reconciliation.ts'`,
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
  advanceShopServiceBooking, prepareShopServiceCharge,
  validateShopServiceSchedule, projectShopServiceSchedule, readShopServiceSchedule,
  catalogNameSellsShopService, shopServiceSaleSku, projectShopAppointmentTillReconciliation,
  anonymizeShopServiceClient, recordShopServiceClientExport,
  setShopServiceClientRetention, shopServiceClientAnonymizationReadiness,
  shopServiceClientCsv,
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
    customerName, contact: '09-777-000111', appointmentUpdates: 'declined', serviceId: service.id, resourceId, startsAt,
  }, proof())

// --- a first booking ----------------------------------------------------------
const START = '2026-07-25T03:00:00.000Z'
const first = book(schedule, START)
check(first.bookings.length === 1, 'a booking is recorded')
check(first.clients.length === 1 && first.bookings[0].clientId === first.clients[0].id, 'the booking is linked to one privacy-minimal client record')
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
check(backToBack.clients.length === 1, 'a matching contact reuses one client record')

rejects(
  () => book(first, booking.endsAt, resource.id, 'Different customer'),
  'a contact already bound to a client cannot silently change identity',
)

const updatesAllowed = scheduleShopServiceBooking(schedule, {
  customerName: 'Mya', contact: '09-777-000222', appointmentUpdates: 'allowed', serviceId: service.id,
  resourceId: resource.id, startsAt: START,
}, proof())
check(updatesAllowed.clients[0].appointmentUpdates === 'allowed' && updatesAllowed.clients[0].consentRecordedAt === proof().happenedAt, 'allowed appointment updates retain explicit consent evidence')

const legacyV2 = {
  ...first,
  schema: 'supermega.shop.service_schedule.v2',
  clients: undefined,
  bookings: first.bookings.map(({ clientId: _clientId, appointmentUpdates: _appointmentUpdates, ...legacy }) => legacy),
}
const migratedV2 = readShopServiceSchedule(JSON.stringify(legacyV2))
check(migratedV2.schema === 'supermega.shop.service_schedule.v4' && migratedV2.clients.length === 1, 'a v2 appointment book migrates to privacy-minimal clients')
check(migratedV2.bookings[0].appointmentUpdates === 'not_recorded', 'legacy bookings do not invent messaging consent')
const legacyV3 = { ...first, schema: 'supermega.shop.service_schedule.v3', privacyPolicy: undefined }
const migratedV3 = readShopServiceSchedule(JSON.stringify(legacyV3))
check(migratedV3.schema === 'supermega.shop.service_schedule.v4' && migratedV3.privacyPolicy.clientRetentionDays === null, 'a v3 schedule migrates to an explicit unset retention policy')

// --- owner-governed privacy lifecycle ----------------------------------------
rejects(() => setShopServiceClientRetention(first, 29, proof()), 'retention shorter than 30 days is refused')
const privacyClosed = cancelShopServiceBooking(first, booking.id, proof('2026-07-24T08:30:00.000Z'))
const retained = setShopServiceClientRetention(privacyClosed, 30, proof('2026-07-24T09:00:00.000Z'))
check(retained.privacyPolicy.clientRetentionDays === 30 && retained.events.at(-1).type === 'client_retention_set', 'owner retention is explicit and evidenced')
const csvInjectionSchedule = scheduleShopServiceBooking(schedule, {
  customerName: '=SUM(A1:A2)', contact: '+959000000', appointmentUpdates: 'declined', serviceId: service.id,
  resourceId: resource.id, startsAt: START,
}, proof())
check(shopServiceClientCsv(csvInjectionSchedule).includes("\"'=SUM(A1:A2)\"") && shopServiceClientCsv(csvInjectionSchedule).includes("\"'+959000000\""), 'client CSV neutralizes spreadsheet formulas')
const exported = recordShopServiceClientExport(retained, `sha256:${'a'.repeat(64)}`, proof('2026-07-24T09:01:00.000Z'))
check(exported.events.at(-1).type === 'client_exported', 'client export appends an attributable digest receipt')
check(!shopServiceClientAnonymizationReadiness(first, booking.clientId, [], new Date('2026-09-01T00:00:00.000Z')).allowed, 'an open visit blocks anonymization')
const due = shopServiceClientAnonymizationReadiness(retained, booking.clientId, [], new Date('2026-07-25T00:00:00.000Z'))
check(!due.allowed && Boolean(due.dueAt), 'active retention blocks anonymization with a due date')
const ready = shopServiceClientAnonymizationReadiness(retained, booking.clientId, [], new Date('2026-09-01T00:00:00.000Z'))
check(ready.allowed, 'a closed unpaid-free visit can reach owner anonymization review after retention')
const anonymized = anonymizeShopServiceClient(retained, booking.clientId, [], proof('2026-09-01T00:00:00.000Z'))
check(anonymized.clients[0].anonymizedAt && anonymized.clients[0].contact.startsWith('anonymized:'), 'anonymization removes the client contact')
check(anonymized.bookings[0].note === '' && anonymized.bookings[0].customerName.startsWith('Former client'), 'anonymization scrubs linked appointment identity and notes')

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
    customerName: 'May', contact: '09-777-000111', appointmentUpdates: 'declined', serviceId: 'SVC-DOES-NOT-EXIST',
    resourceId: resource.id, startsAt: START,
  }, proof()),
  'booking a service that does not exist is refused',
)

// --- input validation ---------------------------------------------------------
rejects(() => book(schedule, 'not a date'), 'a booking with an unparseable start time is refused')
rejects(() => book(schedule, START, resource.id, ''), 'a booking with no customer name is refused')
rejects(
  () => scheduleShopServiceBooking(schedule, {
    customerName: 'May', contact: '09-777-000111', appointmentUpdates: 'declined', serviceId: service.id, resourceId: resource.id, startsAt: START,
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


// --- the appointment-to-till reconciliation -----------------------------------
// The appointment book reaches no ledger. That boundary is deliberate and stays. What was
// missing is the owner being TOLD when the two disagree: she completes a treatment in the
// book, forgets to ring it at the counter, and the money never reaches her daily close.
// Nothing said so.
//
// projectShopAppointmentTillReconciliation is a read-only derivation over state that already
// exists. It must never create, modify or settle an order -- one check below asserts exactly
// that, because an "obvious" convenience here would be auto-posting money on the owner's
// behalf.
const TILL_DAY = '2026-08-21'
const TILL_NOW = '2026-08-21T11:00:00.000Z'
let spaBook = createShopServiceSchedule('spa')
const treatmentMassage = spaBook.services.find((entry) => entry.id === 'service-session')
const treatmentOil = spaBook.services.find((entry) => entry.id === 'service-oil-massage')
const treatmentConsult = spaBook.services.find((entry) => entry.id === 'service-consultation')
check(Boolean(treatmentMassage && treatmentOil && treatmentConsult), 'the spa pack still ships the three treatments this block reasons about')

let tillClock = 0
const tillProof = () => ({
  actor: 'Spa owner',
  reason: 'Pilot day walkthrough.',
  happenedAt: new Date(Date.parse(`${TILL_DAY}T00:00:00.000Z`) + (tillClock += 1) * 60_000).toISOString(),
})
function completeTreatment(state, serviceId, resourceId, startsAt, customerName, advances = 3) {
  let next = scheduleShopServiceBooking(state, { customerName, contact: `test-${customerName}`, appointmentUpdates: 'declined', serviceId, resourceId, startsAt }, tillProof())
  const bookingId = next.bookings[next.bookings.length - 1].id
  for (let step = 0; step < advances; step += 1) next = advanceShopServiceBooking(next, bookingId, tillProof())
  return { state: next, bookingId }
}

const treatedFirst = completeTreatment(spaBook, treatmentMassage.id, 'resource-staff-1', `${TILL_DAY}T01:30:00.000Z`, 'Ma Hnin Wai')
spaBook = treatedFirst.state
const treatedSecond = completeTreatment(spaBook, treatmentMassage.id, 'resource-staff-2', `${TILL_DAY}T03:00:00.000Z`, 'Daw Aye Aye')
spaBook = treatedSecond.state
const treatedThird = completeTreatment(spaBook, treatmentOil.id, 'resource-staff-1', `${TILL_DAY}T05:00:00.000Z`, 'Ko Thiha')
spaBook = treatedThird.state
// Checked in, not completed. An unfinished treatment is not money she failed to collect.
spaBook = completeTreatment(spaBook, treatmentConsult.id, 'resource-staff-1', `${TILL_DAY}T07:30:00.000Z`, 'Ma Su Myat', 2).state
check(treatedThird.bookingId !== treatedFirst.bookingId, 'the fixture books three distinct completed treatments')

const tillLine = (name, quantity, unitPriceMmk, sku = 'SPA-SVC-X') => ({ sku, name, quantity, unitPriceMmk })
const tillOrder = (id, createdAt, lines, extra = {}) => ({
  id,
  createdAt,
  customer: 'Guest',
  channel: 'Walk-in',
  item: lines.map((entry) => entry.name).join(' + '),
  quantity: lines.reduce((total, entry) => total + entry.quantity, 0),
  payment: 'Cash',
  paymentStatus: 'pending',
  refundStatus: 'none',
  status: 'confirmed',
  lines,
  ...extra,
})

// One of the two massages was rung up. The oil massage was not.
const tillState = { orders: [tillOrder('ORD-1', `${TILL_DAY}T04:00:00.000Z`, [tillLine('Traditional Myanmar massage 60 min', 1, 45_000, 'SPA-SVC-MASSAGE')])] }
const tillReconciliation = projectShopAppointmentTillReconciliation(spaBook, tillState, TILL_NOW)

check(tillReconciliation.businessDate === TILL_DAY, `the list is scoped to the Myanmar business date the close uses, got ${tillReconciliation.businessDate}`)
check(tillReconciliation.completedBookings === 3, `three treatments were completed today, got ${tillReconciliation.completedBookings}`)
check(tillReconciliation.unpostedBookings === 2, `two of them never reached the till, got ${tillReconciliation.unpostedBookings}`)
check(tillReconciliation.unpostedValueMmk === 45_000 + 65_000, `and they are worth 110,000 MMK, got ${tillReconciliation.unpostedValueMmk}`)
check(tillReconciliation.gaps.length === 2, `one gap row per treatment, got ${tillReconciliation.gaps.length}`)

const tillMassageGap = tillReconciliation.gaps.find((gap) => gap.serviceId === treatmentMassage.id)
check(tillMassageGap?.completedCount === 2 && tillMassageGap?.chargedQuantity === 1 && tillMassageGap?.unpostedCount === 1,
  `the massage row counts 2 completed against 1 charged, got ${JSON.stringify(tillMassageGap && [tillMassageGap.completedCount, tillMassageGap.chargedQuantity, tillMassageGap.unpostedCount])}`)
// Positional, earliest-first: an order line cannot say WHICH massage it rang, so the earlier
// booking is treated as the settled one and the later is the one still owing. The COUNT is the
// load-bearing fact; the identity is best-effort so she has a row to act on.
check(tillMassageGap?.unpostedBookingIds.join(',') === treatedSecond.bookingId,
  `the later massage is the one still owing, got ${tillMassageGap?.unpostedBookingIds.join(',')}`)
check(tillMassageGap?.serviceNameMy === treatmentMassage.nameMy, 'the gap row carries the Burmese treatment name the book already shows')

// --- what must NOT count as charged -------------------------------------------
const tillYesterday = projectShopAppointmentTillReconciliation(spaBook, {
  orders: [tillOrder('ORD-OLD', '2026-08-20T04:00:00.000Z', [tillLine('Traditional Myanmar massage 60 min', 2, 45_000)])],
}, TILL_NOW)
check(tillYesterday.unpostedBookings === 3, `yesterday's sales cannot settle today's treatments, got ${tillYesterday.unpostedBookings}`)

const tillVoided = projectShopAppointmentTillReconciliation(spaBook, {
  orders: [tillOrder('ORD-VOID', `${TILL_DAY}T04:00:00.000Z`, [tillLine('Traditional Myanmar massage 60 min', 2, 45_000)], { status: 'cancelled' })],
}, TILL_NOW)
check(tillVoided.unpostedBookings === 3, `a cancelled order is not money taken, got ${tillVoided.unpostedBookings}`)

// The pairing guard's own recorded failure was a t-shirt matching "Personal shopping" purely
// because both cost 15,000. Price coincidence must never read as coverage here either.
const tillCoincidence = projectShopAppointmentTillReconciliation(spaBook, {
  orders: [tillOrder('ORD-ROBE', `${TILL_DAY}T04:00:00.000Z`, [tillLine('Cotton spa robe', 3, 45_000, 'SPA-ROBE')])],
}, TILL_NOW)
check(tillCoincidence.unpostedBookings === 3, `a robe priced like a massage does not settle a massage, got ${tillCoincidence.unpostedBookings}`)

// --- what MUST count as charged ------------------------------------------------
const tillBulk = projectShopAppointmentTillReconciliation(spaBook, {
  orders: [tillOrder('ORD-2', `${TILL_DAY}T04:00:00.000Z`, [tillLine('Traditional Myanmar massage 60 min', 2, 45_000)])],
}, TILL_NOW)
check(tillBulk.unpostedBookings === 1 && tillBulk.gaps.length === 1,
  `one line of quantity 2 settles both massages, got ${tillBulk.unpostedBookings}`)

// Deliberate generosity, and the reason is asymmetric harm: a missed nudge leaves her exactly
// where she is today, but telling her a treatment is unpaid when she discounted it invites a
// SECOND charge to a customer who already paid. So a matched name at a different price counts.
const tillDiscounted = projectShopAppointmentTillReconciliation(spaBook, {
  orders: [tillOrder('ORD-3', `${TILL_DAY}T04:00:00.000Z`, [tillLine('Traditional Myanmar massage 60 min', 2, 30_000)])],
}, TILL_NOW)
check(tillDiscounted.unpostedBookings === 1, `a discounted treatment still counts as rung up, got ${tillDiscounted.unpostedBookings}`)

// Orders written before order lines existed carry a single item name and a quantity.
const tillLegacy = projectShopAppointmentTillReconciliation(spaBook, {
  orders: [{
    id: 'ORD-LEGACY', createdAt: `${TILL_DAY}T04:00:00.000Z`, customer: 'Guest', channel: 'Walk-in',
    item: 'Aromatic oil massage 90 min', quantity: 1, payment: 'Cash',
    paymentStatus: 'pending', refundStatus: 'none', status: 'confirmed',
  }],
}, TILL_NOW)
check(tillLegacy.gaps.every((gap) => gap.serviceId !== treatmentOil.id), 'a line-less legacy order still settles its treatment')

// --- the pairing rule itself ---------------------------------------------------
check(catalogNameSellsShopService('Traditional Myanmar massage 60 min', treatmentMassage), 'the shipped catalog name pairs its treatment')
check(catalogNameSellsShopService('Traditional Myanmar massage', treatmentMassage), 'an exactly-named line pairs it too')
check(!catalogNameSellsShopService('Traditional Myanmar massages', treatmentMassage), 'a longer word is not a duration suffix')
check(!catalogNameSellsShopService('Cotton spa robe', treatmentMassage), 'an unrelated item does not pair')

// --- it is a projection, not a posting mechanism -------------------------------
// If this ever mutates, it is auto-posting money on the owner's behalf.
const tillScheduleBefore = JSON.stringify(spaBook)
const tillStateBefore = JSON.stringify(tillState)
projectShopAppointmentTillReconciliation(spaBook, tillState, TILL_NOW)
check(JSON.stringify(spaBook) === tillScheduleBefore, 'reconciling leaves the appointment book untouched')
check(JSON.stringify(tillState) === tillStateBefore, 'reconciling creates, modifies and settles nothing in commerce')

// Nothing completed, nothing owed -- the panel must be silent on a clean day rather than
// nagging, or she learns to ignore it.
const tillClean = projectShopAppointmentTillReconciliation(createShopServiceSchedule('spa'), { orders: [] }, TILL_NOW)
check(tillClean.completedBookings === 0 && tillClean.unpostedBookings === 0 && tillClean.gaps.length === 0, 'a day with no completed treatment raises nothing')


console.log(`shop service scheduling contract: ${checks} checks passed`)
