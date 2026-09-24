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
const python = spawnSync('python', ['-c', 'import json,sys; from supermega_runtime.commerce_runtime import _validate_service_schedule; _validate_service_schedule(json.load(sys.stdin)); print("runtime accepted frontend schedule")'], { input: JSON.stringify(next), encoding: 'utf8' })
assert.equal(python.status, 0, python.stderr)
console.log('Booking resources: canonical shape, ordering, duplicates, overlap, legacy reload and Python parity passed')
