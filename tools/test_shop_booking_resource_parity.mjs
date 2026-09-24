import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
const require = createRequire(resolve('showroom/package.json'))
const { build } = require('esbuild')
const bundle = await build({ entryPoints: ['showroom/src/core/shop-service-scheduling.ts'], bundle: true, platform: 'node', format: 'esm', write: false })
const model = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)
const initial = model.createShopServiceSchedule('spa')
const staff = initial.resources.find(r => r.kind === 'staff').id
const room = initial.resources.find(r => r.kind === 'room').id
const input = { customerName: 'Synthetic QA', contact: 'qa-reference', appointmentUpdates: 'declined', serviceId: initial.services[0].id, resourceIds: [staff, room], startsAt: '2026-09-25T03:00:00.000Z' }
const proof = { actor: 'QA', reason: 'Synthetic resource parity check', happenedAt: '2026-09-24T03:00:00.000Z' }
const next = model.scheduleShopServiceBooking(initial, input, proof)
assert.deepEqual(next.bookings[0].resourceIds, [staff, room])
assert.equal('resourceId' in next.bookings[0], false)
assert.throws(() => model.scheduleShopServiceBooking(initial, { ...input, resourceIds: [staff] }, proof))
assert.throws(() => model.scheduleShopServiceBooking(initial, { ...input, resourceIds: [room, staff] }, proof))
assert.throws(() => model.scheduleShopServiceBooking(initial, { ...input, resourceIds: [staff, room, room] }, proof))
assert.throws(() => model.scheduleShopServiceBooking(next, input, proof))
const withStaff = model.registerShopServiceResource(next, { name: 'Second staff', kind: 'staff' }, proof)
assert.throws(() => model.scheduleShopServiceBooking(withStaff, { ...input, resourceIds: [withStaff.resources.at(-1).id, room] }, proof), /already booked/)
const withRoom = model.registerShopServiceResource(next, { name: 'Second room', kind: 'room' }, proof)
assert.throws(() => model.scheduleShopServiceBooking(withRoom, { ...input, resourceIds: [staff, withRoom.resources.at(-1).id] }, proof), /already booked/)
const legacy = model.scheduleShopServiceBooking(initial, { ...input, resourceIds: undefined, resourceId: staff }, proof)
assert.equal(model.readShopServiceSchedule(JSON.stringify(legacy)).bookings[0].resourceId, staff)
assert.deepEqual(model.readShopServiceSchedule(JSON.stringify(next)).bookings[0].resourceIds, [staff, room])
const mixed = model.scheduleShopServiceBooking(legacy, { ...input, startsAt: '2026-09-26T03:00:00.000Z' }, proof)
const advanced = model.advanceShopServiceBooking(mixed, mixed.bookings[1].id, proof)
const cancelled = model.cancelShopServiceBooking(advanced, advanced.bookings[0].id, proof)
const migrated = model.assignLegacyBookingResources(legacy, legacy.bookings[0].id, [staff, room], proof)
assert.equal('resourceId' in migrated.bookings[0], false)
assert.equal(migrated.bookings[0].id, legacy.bookings[0].id)
assert.deepEqual(migrated.events.slice(0, -1), legacy.events)
assert.throws(() => model.assignLegacyBookingResources(migrated, migrated.bookings[0].id, [staff, room], proof))
assert.throws(() => model.assignLegacyBookingResources(legacy, legacy.bookings[0].id, [staff], proof))
const pythonCode = `
import json,sys
from copy import deepcopy
from supermega_runtime.trial_store import TrialValidationError
from supermega_runtime.commerce_runtime import _validate_service_schedule
from tests.test_commerce_runtime import catalog_state, apply_event
payload = json.load(sys.stdin)
base = catalog_state()
base['serviceSchedule'] = payload['initial']
def save(before, schedule):
    event = schedule['events'][-1]
    return apply_event(before, 'commerce.service_schedule.saved', {**before, 'serviceSchedule': schedule}, {
        'actionId': 'ACT-SERVICE-SCHEDULE-R' + str(event['revision']),
        'capturedAt': event['happenedAt'], 'actor': event['actor'],
        'reason': event['reason'], 'evidenceReference': 'SHOP-SERVICE-SCHEDULE:R' + str(event['revision']),
    })
save(base, payload['next'])
legacy = save(base, payload['legacy'])
save(legacy, payload['migrated'])
for field, value in [('note', 'unrelated edit'), ('status', 'confirmed')]:
    tampered = deepcopy(payload['migrated'])
    tampered['bookings'][0][field] = value
    try:
        save(legacy, tampered)
    except TrialValidationError:
        pass
    else:
        raise AssertionError('resource migration allowed unrelated ' + field)
mixed = save(legacy, payload['mixed'])
advanced = save(mixed, payload['advanced'])
final = save(advanced, payload['cancelled'])
_validate_service_schedule(final['serviceSchedule'])
print('Five frontend-generated transitions accepted by runtime')
`
const python = spawnSync('python', ['-X', 'utf8', '-c', pythonCode], { input: JSON.stringify({ initial, next, legacy, mixed, advanced, cancelled, migrated }), encoding: 'utf8' })
assert.equal(python.status, 0, python.stderr)
console.log('Booking resources: shape, ordering, overlap, reload and six runtime save transitions including explicit legacy assignment passed')
