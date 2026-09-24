import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
const require = createRequire(resolve('showroom/package.json'))
const { build } = require('esbuild')
const bundled = await build({ stdin: { contents: "export * from './shop-service-scheduling.ts'; export * from './shop-spa-membership.ts'", resolveDir: resolve('showroom/src/core'), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false })
const model = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString('base64')}`)
function python(code, input) {
  const result = spawnSync('python', ['-X', 'utf8', '-c', code], { input: input === undefined ? undefined : JSON.stringify(input), encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}
const fixtures = python(`
import json
from copy import deepcopy
from unittest.mock import patch
import tests.test_commerce_runtime as tests
original = tests.apply_event
samples = {}
def capture(*args, **kwargs):
    result = original(*args, **kwargs)
    schedule = result.get('serviceSchedule', {})
    revision = schedule.get('revision')
    if revision in (7,8) and len(schedule.get('packageLedger', [])) == 2:
        samples.setdefault(str(revision), deepcopy(result))
    return result
with patch.object(tests, 'apply_event', capture):
    tests.CommerceRuntimeTests('test_service_schedule_is_versioned_inside_commerce_and_fails_closed').test_service_schedule_is_versioned_inside_commerce_and_fails_closed()
print(json.dumps(samples))
`)
const before = fixtures['7'], expected = fixtures['8'].serviceSchedule
const schedule = model.readShopServiceSchedule(JSON.stringify(before.serviceSchedule))
const event = expected.events.at(-1)
const proof = { actor: event.actor, reason: event.reason, happenedAt: event.happenedAt }
const bookingId = expected.packageLedger[0].evidence.at(-1).bookingId
const balance = model.availableSpaMembershipForBooking(before, schedule, bookingId, proof.happenedAt)
assert.equal(balance.clientId, schedule.bookings.find(b => b.id === bookingId).clientId)
assert.equal(balance.remaining, 5)
for (const [field, value] of [['refundStatus', 'requested'], ['paymentStatus', 'pending'], ['customer', 'client-other'], ['owner', 'changed evidence']]) {
  const changed = structuredClone(before)
  for (const order of changed.orders) order[field] = value
  assert.equal(model.availableSpaMembershipForBooking(changed, schedule, bookingId, proof.happenedAt), null, field)
  assert.throws(() => model.redeemSpaMembershipSession(schedule, changed, bookingId, proof), undefined, field)
}
const missingOrders = { ...before, orders: [] }
assert.equal(model.availableSpaMembershipForBooking(missingOrders, schedule, bookingId, proof.happenedAt), null)
const next = model.redeemSpaMembershipSession(schedule, before, bookingId, proof)
assert.deepEqual(next, expected)
assert.equal(model.redeemSpaMembershipSession(next, before, bookingId, proof), next)
assert.equal(model.availableSpaMembershipForBooking(before, schedule, bookingId, schedule.packageLedger[1].expiresAt), null)
const tampered = structuredClone(next); tampered.packageLedger[0].remainingSessions++
assert.throws(() => model.validateShopServiceSchedule(tampered))
const renamed = structuredClone(schedule)
const client = renamed.clients.find(c => c.id === balance.clientId)
client.name = 'Renamed QA client'
for (const booking of renamed.bookings) if (booking.clientId === client.id) booking.customerName = client.name
assert.equal(model.availableSpaMembershipForBooking(before, renamed, bookingId, proof.happenedAt).entitlementId, balance.entitlementId)
const result = python(`
import json,sys
from tests.test_commerce_runtime import apply_event
p=json.load(sys.stdin); e=p['next']['events'][-1]; revision=e['revision']
r=apply_event(p['before'], 'commerce.service_schedule.saved', {**p['before'], 'serviceSchedule': p['next']}, {'actionId':f'ACT-SERVICE-SCHEDULE-R{revision}', 'capturedAt':e['happenedAt'], 'actor':e['actor'], 'reason':e['reason'], 'evidenceReference':f'SHOP-SERVICE-SCHEDULE:R{revision}'})
print(json.dumps(r['serviceSchedule']))
`, { before, next })
assert.deepEqual(result, next)
console.log('Package ledger: runtime fixture read, client-ID balance, exact redemption parity, replay, expiry, tamper rejection and rename continuity passed')
