// Guard: every industry pack ships a usable, bilingual service menu -- and stays switchable.
//
// Four of the six packs (restaurant, spa, gym, school) have no trade template in
// business-templates.ts, and three of them never will: a spa sells a therapist-hour, not a
// stock unit with a reorder level. Their starter depth therefore lives in shopIndustryPacks
// here, and nothing checked it. Three things can silently rot:
//
//   1. Burmese names. Every trade template carries {en, my} and is validated for both. Pack
//      services carried English only, so a spa owner in Yangon saw "Standard treatment" where
//      a mini-mart owner saw a Burmese shop name. nameMy is optional on the TYPE -- it has to
//      be, because ShopService is persisted and old saved schedules predate the field -- which
//      means nothing would complain if a pack seed quietly shipped without it.
//   2. Depth. A pack that drops back to two generic services still passes every other test.
//   3. Switchability. createShopServiceSchedule MUST return an empty appointment book:
//      provisionEmptyShopServiceSchedule refuses to change pack once any booking or event
//      exists, so seeding demo bookings into a pack would lock owners into their first choice.
//      That failure only shows up when someone tries to switch, which no other test does.
//
// The booking round-trip is included deliberately: it proves the newly added services and
// resources are actually bookable, not just well-formed data.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `
      export { shopIndustryPacks, createShopServiceSchedule, validateShopServiceSchedule,
               scheduleShopServiceBooking, advanceShopServiceBooking, projectShopServiceSchedule,
               provisionEmptyShopServiceSchedule, registerShopService } from './shop-service-scheduling.ts'
    `,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/pack-depth-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  shopIndustryPacks, createShopServiceSchedule, validateShopServiceSchedule,
  scheduleShopServiceBooking, advanceShopServiceBooking, projectShopServiceSchedule,
  provisionEmptyShopServiceSchedule, registerShopService,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)

// Myanmar block. Burmese digits and letters both fall inside it.
const burmese = /[က-႟]/
// The packs that own their starter depth here because no trade template covers them.
const serviceLedPacks = new Set(['spa', 'gym', 'school'])

let checks = 0
const check = (condition, label) => {
  assert.ok(condition, label)
  checks += 1
}

check(shopIndustryPacks.length === 6, 'six industry packs ship')

for (const pack of shopIndustryPacks) {
  check(burmese.test(pack.nameMy ?? ''), `${pack.id}: pack carries a Burmese display name`)

  const schedule = createShopServiceSchedule(pack.id)
  validateShopServiceSchedule(schedule)

  check(schedule.services.length === pack.services.length, `${pack.id}: every pack service is seeded`)
  check(schedule.resources.length >= 2, `${pack.id}: at least two resources, so bookings can be spread`)
  check(
    schedule.bookings.length === 0 && schedule.events.length === 0 && schedule.revision === 0,
    `${pack.id}: the appointment book starts empty, so the pack can still be switched`,
  )

  for (const service of schedule.services) {
    check(burmese.test(service.nameMy ?? ''), `${pack.id}/${service.id}: service carries a Burmese name`)
    check(service.priceMmk > 0 && Number.isSafeInteger(service.priceMmk), `${pack.id}/${service.id}: priced in whole MMK`)
  }
  for (const resource of schedule.resources) {
    check(burmese.test(resource.nameMy ?? ''), `${pack.id}/${resource.id}: resource carries a Burmese name`)
  }

  // The service-led packs are the ones an owner actually runs their day from. Two generic
  // entries is the shallow default this guard exists to prevent regressing to.
  if (serviceLedPacks.has(pack.id)) {
    check(schedule.services.length >= 6, `${pack.id}: service-led pack ships a real menu, not a two-line stub`)
    check(schedule.resources.length >= 4, `${pack.id}: service-led pack ships enough staff and rooms to schedule against`)
    check(new Set(schedule.services.map((service) => service.durationMinutes)).size >= 3, `${pack.id}: service durations actually vary`)
  }

  // Switching away from a fresh pack must not throw.
  provisionEmptyShopServiceSchedule(schedule, pack.id === 'spa' ? 'gym' : 'spa')
  checks += 1

  // The newest service and resource in each pack must be genuinely bookable.
  const service = schedule.services.at(-1)
  const resource = schedule.resources.at(-1)
  const proof = { actor: 'pack depth guard', reason: 'verify seeded services are bookable', happenedAt: '2026-08-10T03:00:00.000Z' }
  const booked = scheduleShopServiceBooking(schedule, {
    customerName: 'Daw Sandar',
    contact: '09-700-000-000',
    appointmentUpdates: 'declined',
    serviceId: service.id,
    resourceId: resource.id,
    startsAt: '2026-08-10T04:00:00.000Z',
  }, proof)
  check(booked.bookings.length === 1, `${pack.id}: "${service.name}" is bookable on "${resource.name}"`)

  const bookingId = booked.bookings[0].id
  const completed = ['confirmed', 'checked_in', 'completed'].reduce((state) => advanceShopServiceBooking(state, bookingId, proof), booked)
  check(completed.bookings[0].status === 'completed', `${pack.id}: the booking runs held through to completed`)

  const projected = projectShopServiceSchedule(completed, new Date('2026-08-10T04:30:00.000Z'))
  check(projected.expectedRevenueMmk === service.priceMmk, `${pack.id}: the completed booking projects ${service.priceMmk.toLocaleString()} MMK`)
}

// nameMy is additive on purpose. Both of these would break if it were ever made required.
const legacy = createShopServiceSchedule('spa')
legacy.services = legacy.services.map(({ nameMy, ...rest }) => rest)
legacy.resources = legacy.resources.map(({ nameMy, ...rest }) => rest)
validateShopServiceSchedule(legacy)
check(true, 'a schedule saved before nameMy existed still validates instead of reading as unreadable evidence')

const ownerAdded = registerShopService(
  createShopServiceSchedule('spa'),
  { name: 'Owner added service', durationMinutes: 30, priceMmk: 9_000 },
  { actor: 'owner', reason: 'manual add', happenedAt: '2026-08-10T03:00:00.000Z' },
)
check(ownerAdded.services.at(-1).nameMy === undefined, 'owner-registered services stay single-name -- the booking form is not forced to collect two')

console.log(`shop industry pack depth: ${checks} checks passed across ${shopIndustryPacks.length} packs`)
