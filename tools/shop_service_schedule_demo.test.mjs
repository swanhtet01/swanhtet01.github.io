import assert from 'node:assert/strict'
import test from 'node:test'

import {
  GUIDED_SAMPLE_SCHEDULE_ACTOR,
  SHOP_SERVICE_SCHEDULE_SCHEMA,
  SHOP_SERVICE_SCHEDULE_STORAGE_KEY,
  advanceShopServiceBooking,
  cancelShopServiceBooking,
  createShopServiceSchedule,
  createShopServiceScheduleDemo,
  isGuidedSampleShopSchedule,
  projectShopServiceSchedule,
  provisionEmptyShopServiceSchedule,
  readShopServiceSchedule,
  registerShopService,
  registerShopServiceResource,
  scheduleShopServiceBooking,
  shopIndustryPack,
  shopIndustryPacks,
  shopScheduleVocabulary,
  validateShopServiceSchedule,
} from '../showroom/src/core/shop-service-scheduling.ts'
import {
  clearUnreadableShopSchedule,
  prepareUnreadableShopScheduleRecovery,
} from '../showroom/src/core/shop-recover.ts'

const PLANNING_DAY = '2026-08-07'
const MIDDAY_MMT = new Date(`${PLANNING_DAY}T05:30:00.000Z`)

test('every industry pack provisions a valid, populated guided-sample schedule', () => {
  for (const pack of shopIndustryPacks) {
    const schedule = createShopServiceScheduleDemo(pack.id, PLANNING_DAY)
    validateShopServiceSchedule(schedule)
    assert.equal(schedule.industryPackId, pack.id)
    assert.equal(schedule.bookings.length, 3)
    assert.deepEqual(schedule.bookings.map((booking) => booking.status), ['completed', 'checked_in', 'confirmed'])
    assert.equal(schedule.events.length, schedule.revision)
    assert.ok(schedule.events.every((event) => event.actor === GUIDED_SAMPLE_SCHEDULE_ACTOR))
    assert.ok(isGuidedSampleShopSchedule(schedule))

    const projection = projectShopServiceSchedule(schedule, MIDDAY_MMT)
    assert.equal(projection.today.length, 3)
    assert.equal(projection.completedToday, 1)
    assert.equal(projection.inService, 1)
    assert.equal(projection.awaitingArrival, 1)
    assert.ok(projection.expectedRevenueMmk > 0)
  }
})

test('the guided-sample schedule is deterministic for a fixed planning day', () => {
  for (const pack of shopIndustryPacks) {
    assert.deepEqual(
      createShopServiceScheduleDemo(pack.id, PLANNING_DAY),
      createShopServiceScheduleDemo(pack.id, PLANNING_DAY),
    )
  }
})

test('an invalid planning day fails closed', () => {
  assert.throws(() => createShopServiceScheduleDemo('spa', '2026-8-7'), /exact YYYY-MM-DD/)
  assert.throws(() => createShopServiceScheduleDemo('spa', 'today'), /exact YYYY-MM-DD/)
  assert.throws(() => createShopServiceScheduleDemo('spa', '2026-13-40'), /exact YYYY-MM-DD/)
})

test('real appointment evidence is distinguishable from the guided sample', () => {
  const demo = createShopServiceScheduleDemo('spa', PLANNING_DAY)
  const withHumanBooking = scheduleShopServiceBooking(demo, {
    customerName: 'Walk-in customer',
    contact: '09 111 222 333',
    appointmentUpdates: 'declined',
    serviceId: demo.services[0].id,
    resourceId: demo.resources[1].id,
    startsAt: `${PLANNING_DAY}T10:30:00.000Z`,
  }, { actor: 'Shop operator', reason: 'Real customer appointment.', happenedAt: `${PLANNING_DAY}T10:00:00.000Z` })
  assert.equal(isGuidedSampleShopSchedule(withHumanBooking), false)
})

test('an empty schedule can switch industry pack, but any evidence blocks the switch', () => {
  const empty = createShopServiceSchedule('retail')
  assert.equal(empty.revision, 0)
  assert.equal(empty.bookings.length, 0)

  const switched = provisionEmptyShopServiceSchedule(empty, 'spa')
  validateShopServiceSchedule(switched)
  assert.equal(switched.industryPackId, 'spa')
  assert.equal(switched.revision, 0)

  // A guided-sample demo carries events and bookings — switching is blocked.
  const demo = createShopServiceScheduleDemo('retail', PLANNING_DAY)
  assert.ok(demo.events.length > 0)
  assert.throws(
    () => provisionEmptyShopServiceSchedule(demo, 'spa'),
    /Reset that local demo/,
  )

  // A schedule with real bookings is also blocked.
  const withBooking = scheduleShopServiceBooking(createShopServiceSchedule('retail'), {
    customerName: 'Walk-in',
    contact: '09 111 222 333',
    appointmentUpdates: 'declined',
    serviceId: empty.services[0].id,
    resourceId: empty.resources[0].id,
    startsAt: `${PLANNING_DAY}T05:00:00.000Z`,
  }, { actor: 'Operator', reason: 'Real booking.', happenedAt: `${PLANNING_DAY}T04:30:00.000Z` })
  assert.ok(withBooking.bookings.length > 0)
  assert.throws(
    () => provisionEmptyShopServiceSchedule(withBooking, 'spa'),
    /Reset that local demo/,
  )
})

test('a booking advances through the full lifecycle and terminal states block further operations', () => {
  const proof = (happenedAt) => ({ actor: 'Operator', reason: 'Status update.', happenedAt })
  const base = createShopServiceSchedule('spa')
  const afterBook = scheduleShopServiceBooking(base, {
    customerName: 'Naw Su',
    contact: '09 444 555 666',
    appointmentUpdates: 'declined',
    serviceId: base.services[0].id,
    resourceId: base.resources[0].id,
    startsAt: `${PLANNING_DAY}T04:00:00.000Z`,
  }, { actor: 'Operator', reason: 'New appointment.', happenedAt: `${PLANNING_DAY}T03:30:00.000Z` })
  const bookingId = afterBook.bookings[0].id
  assert.equal(afterBook.bookings[0].status, 'held')

  const confirmed = advanceShopServiceBooking(afterBook, bookingId, proof(`${PLANNING_DAY}T04:00:00.000Z`))
  assert.equal(confirmed.bookings[0].status, 'confirmed')

  const checkedIn = advanceShopServiceBooking(confirmed, bookingId, proof(`${PLANNING_DAY}T04:05:00.000Z`))
  assert.equal(checkedIn.bookings[0].status, 'checked_in')

  const completed = advanceShopServiceBooking(checkedIn, bookingId, proof(`${PLANNING_DAY}T05:00:00.000Z`))
  assert.equal(completed.bookings[0].status, 'completed')

  // Terminal state: completed booking cannot be advanced or cancelled.
  assert.throws(() => advanceShopServiceBooking(completed, bookingId, proof(`${PLANNING_DAY}T05:01:00.000Z`)), /no next operating step/)
  assert.throws(() => cancelShopServiceBooking(completed, bookingId, proof(`${PLANNING_DAY}T05:01:00.000Z`)), /cannot be cancelled/)
})

test('a booking can be cancelled from any non-terminal state and cannot be cancelled twice', () => {
  const proof = (happenedAt) => ({ actor: 'Operator', reason: 'Cancellation.', happenedAt })
  const base = createShopServiceSchedule('spa')
  const afterBook = scheduleShopServiceBooking(base, {
    customerName: 'Ma Hnin',
    contact: '09 777 888 999',
    appointmentUpdates: 'declined',
    serviceId: base.services[0].id,
    resourceId: base.resources[0].id,
    startsAt: `${PLANNING_DAY}T06:00:00.000Z`,
  }, { actor: 'Operator', reason: 'New appointment.', happenedAt: `${PLANNING_DAY}T05:30:00.000Z` })
  const bookingId = afterBook.bookings[0].id
  assert.equal(afterBook.bookings[0].status, 'held')

  // Cancel from held.
  const cancelled = cancelShopServiceBooking(afterBook, bookingId, proof(`${PLANNING_DAY}T05:45:00.000Z`))
  assert.equal(cancelled.bookings[0].status, 'cancelled')

  // Cannot cancel twice or advance a cancelled booking.
  assert.throws(() => cancelShopServiceBooking(cancelled, bookingId, proof(`${PLANNING_DAY}T05:46:00.000Z`)), /cannot be cancelled/)
  assert.throws(() => advanceShopServiceBooking(cancelled, bookingId, proof(`${PLANNING_DAY}T05:46:00.000Z`)), /no next operating step/)

  // Also verify cancel works from confirmed state.
  const afterBook2 = scheduleShopServiceBooking(base, {
    customerName: 'Ko Zaw',
    contact: '09 321 654 987',
    appointmentUpdates: 'declined',
    serviceId: base.services[0].id,
    resourceId: base.resources[0].id,
    startsAt: `${PLANNING_DAY}T07:00:00.000Z`,
  }, { actor: 'Operator', reason: 'New appointment.', happenedAt: `${PLANNING_DAY}T06:30:00.000Z` })
  const bookingId2 = afterBook2.bookings[0].id
  const confirmed2 = advanceShopServiceBooking(afterBook2, bookingId2, proof(`${PLANNING_DAY}T07:00:00.000Z`))
  assert.equal(confirmed2.bookings[0].status, 'confirmed')
  const cancelledFromConfirmed = cancelShopServiceBooking(confirmed2, bookingId2, proof(`${PLANNING_DAY}T07:01:00.000Z`))
  assert.equal(cancelledFromConfirmed.bookings[0].status, 'cancelled')
})

test('registerShopService and registerShopServiceResource extend the schedule and appear in projections', () => {
  const proof = { actor: 'Owner', reason: 'Setup.', happenedAt: `${PLANNING_DAY}T08:00:00.000Z` }
  const base = createShopServiceSchedule('spa')
  const initialServiceCount = base.services.length
  const initialResourceCount = base.resources.length

  const withService = registerShopService(base, {
    name: 'Hot stone therapy',
    durationMinutes: 90,
    priceMmk: 75000,
  }, proof)
  validateShopServiceSchedule(withService)
  assert.equal(withService.services.length, initialServiceCount + 1)
  const newService = withService.services.find((s) => s.name === 'Hot stone therapy')
  assert.ok(newService)
  assert.equal(newService.durationMinutes, 90)
  assert.equal(newService.priceMmk, 75000)
  assert.equal(newService.active, true)

  const withResource = registerShopServiceResource(base, { name: 'Room 3', kind: 'room' }, proof)
  validateShopServiceSchedule(withResource)
  assert.equal(withResource.resources.length, initialResourceCount + 1)
  const newResource = withResource.resources.find((r) => r.name === 'Room 3')
  assert.ok(newResource)
  assert.equal(newResource.kind, 'room')

  // An invalid resource kind must throw.
  assert.throws(() => registerShopServiceResource(base, { name: 'Robot', kind: 'machine' }, proof), /staff, room, or equipment/)
})

test('shopScheduleVocabulary returns pack-specific wording and falls back gracefully', () => {
  for (const pack of shopIndustryPacks) {
    const vocab = shopScheduleVocabulary(pack.id)
    assert.ok(vocab.plural, `${pack.id} must have a plural label`)
    assert.ok(vocab.singular, `${pack.id} must have a singular label`)
    assert.ok(vocab.holdAction, `${pack.id} must have a holdAction label`)
  }
  // Unknown pack degrades to neutral wording rather than throwing.
  const fallback = shopScheduleVocabulary('unknown-pack')
  assert.ok(fallback.plural)
  assert.ok(fallback.singular)

  // shopIndustryPack throws on an unknown id.
  assert.throws(() => shopIndustryPack('unknown-pack'), /supported Shop industry pack/)
})

test('readShopServiceSchedule returns a fresh schedule for null, round-trips valid JSON, and throws for corrupt data', () => {
  // Null input → fresh retail schedule.
  const fresh = readShopServiceSchedule(null)
  validateShopServiceSchedule(fresh)
  assert.equal(fresh.schema, SHOP_SERVICE_SCHEDULE_SCHEMA)
  assert.equal(fresh.revision, 0)

  // Empty string → same as null.
  const fromEmpty = readShopServiceSchedule('')
  validateShopServiceSchedule(fromEmpty)
  assert.equal(fromEmpty.revision, 0)

  // A valid serialised schedule round-trips correctly.
  const demo = createShopServiceScheduleDemo('spa', PLANNING_DAY)
  const serialised = JSON.stringify(demo)
  const roundTripped = readShopServiceSchedule(serialised)
  validateShopServiceSchedule(roundTripped)
  assert.deepEqual(roundTripped, demo)

  // Corrupt JSON must throw with a clear message.
  assert.throws(
    () => readShopServiceSchedule('{not valid json}'),
    /unreadable/i,
  )
})

test('unreadable appointment recovery backs up the device before clearing only the unchanged corrupt record', () => {
  const records = new Map([[SHOP_SERVICE_SCHEDULE_STORAGE_KEY, '{old unreadable appointment data}']])
  const storage = {
    get length() { return records.size },
    getItem: (key) => records.get(key) ?? null,
    key: (index) => [...records.keys()][index] ?? null,
    removeItem: (key) => { records.delete(key) },
  }
  const recovery = prepareUnreadableShopScheduleRecovery(storage, '2026-08-22T10:00:00.000Z')
  assert.equal(recovery.filename, 'supermega-workspace-before-appointment-recovery-2026-08-22.json')
  assert.equal(recovery.backup.records[SHOP_SERVICE_SCHEDULE_STORAGE_KEY], recovery.raw)
  assert.equal(records.has(SHOP_SERVICE_SCHEDULE_STORAGE_KEY), true)
  assert.deepEqual(clearUnreadableShopSchedule(storage, recovery.raw), {
    cleared: true,
    storageKey: SHOP_SERVICE_SCHEDULE_STORAGE_KEY,
  })
  assert.equal(records.has(SHOP_SERVICE_SCHEDULE_STORAGE_KEY), false)
})

test('appointment recovery refuses readable or changed records without deleting them', () => {
  const valid = JSON.stringify(createShopServiceSchedule('spa'))
  const validRecords = new Map([[SHOP_SERVICE_SCHEDULE_STORAGE_KEY, valid]])
  const storageFor = (records) => ({
    get length() { return records.size },
    getItem: (key) => records.get(key) ?? null,
    key: (index) => [...records.keys()][index] ?? null,
    removeItem: (key) => { records.delete(key) },
  })
  assert.throws(() => prepareUnreadableShopScheduleRecovery(storageFor(validRecords)), /readable or no longer exists/)
  assert.equal(validRecords.get(SHOP_SERVICE_SCHEDULE_STORAGE_KEY), valid)

  const changedRecords = new Map([[SHOP_SERVICE_SCHEDULE_STORAGE_KEY, '{old corrupt value}']])
  const changedStorage = storageFor(changedRecords)
  const recovery = prepareUnreadableShopScheduleRecovery(changedStorage, '2026-08-22T10:00:00.000Z')
  changedRecords.set(SHOP_SERVICE_SCHEDULE_STORAGE_KEY, '{new corrupt value}')
  assert.throws(() => clearUnreadableShopSchedule(changedStorage, recovery.raw), /changed or became readable/)
  assert.equal(changedRecords.get(SHOP_SERVICE_SCHEDULE_STORAGE_KEY), '{new corrupt value}')
})

test('booking the same resource during an overlapping window throws', () => {
  const base = createShopServiceSchedule('spa')
  const service = base.services[0]
  const resource = base.resources[0]
  const startA = `${PLANNING_DAY}T05:00:00.000Z`

  const withFirst = scheduleShopServiceBooking(base, {
    customerName: 'Ma Aye',
    contact: '09 111 222 333',
    appointmentUpdates: 'declined',
    serviceId: service.id,
    resourceId: resource.id,
    startsAt: startA,
  }, { actor: 'Operator', reason: 'First booking.', happenedAt: `${PLANNING_DAY}T04:30:00.000Z` })

  // Second booking starts half-way through the first window — must be rejected.
  const halfwayMs = Math.floor(service.durationMinutes / 2) * 60_000
  const overlapStart = new Date(Date.parse(startA) + halfwayMs).toISOString()

  assert.throws(
    () => scheduleShopServiceBooking(withFirst, {
      customerName: 'Ma Su',
      contact: '09 444 555 666',
      appointmentUpdates: 'declined',
      serviceId: service.id,
      resourceId: resource.id,
      startsAt: overlapStart,
    }, { actor: 'Operator', reason: 'Overlapping attempt.', happenedAt: `${PLANNING_DAY}T04:45:00.000Z` }),
    /already booked during that time/,
  )
})

test('back-to-back bookings on the same resource succeed when windows do not overlap', () => {
  const base = createShopServiceSchedule('spa')
  const service = base.services[0]
  const resource = base.resources[0]
  const startA = `${PLANNING_DAY}T05:00:00.000Z`

  const withFirst = scheduleShopServiceBooking(base, {
    customerName: 'Ma Aye',
    contact: '09 111 222 333',
    appointmentUpdates: 'declined',
    serviceId: service.id,
    resourceId: resource.id,
    startsAt: startA,
  }, { actor: 'Operator', reason: 'First booking.', happenedAt: `${PLANNING_DAY}T04:30:00.000Z` })

  // Second starts exactly when the first ends — no overlap.
  const adjacentStart = new Date(Date.parse(startA) + service.durationMinutes * 60_000).toISOString()

  const withSecond = scheduleShopServiceBooking(withFirst, {
    customerName: 'Ko Zaw',
    contact: '09 777 888 999',
    appointmentUpdates: 'declined',
    serviceId: service.id,
    resourceId: resource.id,
    startsAt: adjacentStart,
  }, { actor: 'Operator', reason: 'Back-to-back booking.', happenedAt: `${PLANNING_DAY}T04:45:00.000Z` })

  assert.equal(withSecond.bookings.length, 2)
  assert.ok(withSecond.bookings.every((b) => b.status !== 'cancelled'))
})

test('a v1 schedule without industryPackId migrates to v2 with spa as the default', () => {
  const base = createShopServiceSchedule('retail')
  // Simulate a stored v1 schedule: same structure but old schema, no industryPackId.
  const { industryPackId: _drop, ...rest } = base
  const v1Json = JSON.stringify({ ...rest, schema: 'supermega.shop.service_schedule.v1' })

  const migrated = readShopServiceSchedule(v1Json)
  validateShopServiceSchedule(migrated)
  assert.equal(migrated.schema, SHOP_SERVICE_SCHEDULE_SCHEMA)
  assert.equal(migrated.industryPackId, 'spa')
})
