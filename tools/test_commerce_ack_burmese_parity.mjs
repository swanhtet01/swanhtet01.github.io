import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { commerceOrderAcknowledgement } from '../showroom/src/core/commerce-workspace.ts'

// Exercise both implementations with the same validated Burmese-named order.
// A mismatch breaks the digest that binds a Shop order to its customer copy.
const python = `
import json
from tests.test_commerce_runtime import created_state
from supermega_runtime.commerce_runtime import commerce_order_acknowledgement
state = created_state()
state['orders'][0]['lines'] = [{'sku': 'SKU-1', 'name': 'Test item', 'nameMy': 'ဆန်မွှေး', 'quantity': 2, 'unitPriceMmk': 100}]
state['orders'][0]['calculation'] = {'schema': 'supermega.commerce.order-calculation.v1', 'currency': 'MMK', 'catalogRevision': 0, 'subtotalMmk': 200, 'taxMode': 'not_configured', 'taxMmk': 0, 'totalMmk': 200}
artifact = commerce_order_acknowledgement(state, 'ORD-1')
print(json.dumps({'state': state, 'artifact': artifact}, ensure_ascii=False))
`
const result = spawnSync('python', ['-c', python], {
  encoding: 'utf8', cwd: new URL('..', import.meta.url), env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
})
assert.equal(result.status, 0, result.stderr || 'Python acknowledgement fixture failed')
const { state, artifact } = JSON.parse(result.stdout)
const client = commerceOrderAcknowledgement(state, 'ORD-1')
assert.ok(client && artifact)
assert.equal(client.lines[0].nameMy, 'ဆန်မွှေး')
assert.equal(artifact.lines[0].nameMy, 'ဆန်မွှေး')
assert.equal(client.digest, artifact.digest)
const withoutBurmeseName = structuredClone(state)
delete withoutBurmeseName.orders[0].lines[0].nameMy
assert.notEqual(client.digest, commerceOrderAcknowledgement(withoutBurmeseName, 'ORD-1')?.digest)
console.log('PASS Burmese order acknowledgement digest parity across browser and backend')
