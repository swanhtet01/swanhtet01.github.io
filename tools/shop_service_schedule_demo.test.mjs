import assert from 'node:assert/strict'
import test from 'node:test'

import {
  GUIDED_SAMPLE_SCHEDULE_ACTOR,
  createShopServiceScheduleDemo,
  isGuidedSampleShopSchedule,
  projectShopServiceSchedule,
  scheduleShopServiceBooking,
  shopIndustryPacks,
  validateShopServiceSchedule,
} from '../showroom/src/core/shop-service-scheduling.ts'

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
    serviceId: demo.services[0].id,
    resourceId: demo.resources[1].id,
    startsAt: `${PLANNING_DAY}T10:30:00.000Z`,
  }, { actor: 'Shop operator', reason: 'Real customer appointment.', happenedAt: `${PLANNING_DAY}T10:00:00.000Z` })
  assert.equal(isGuidedSampleShopSchedule(withHumanBooking), false)
})
