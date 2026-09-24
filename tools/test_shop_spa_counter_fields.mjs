import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
const require = createRequire(resolve('showroom/package.json'))
const { build } = require('esbuild')
const bundled = await build({ entryPoints: ['showroom/src/core/shop-spa-counter-fields.ts'], bundle: true, platform: 'node', format: 'esm', write: false })
const { spaCounterFields } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString('base64')}`)
const fields = ['Cash', 'KBZPay', 'WavePay', 'AYA Pay', 'MMQR'].map(method => spaCounterFields('Synthetic QA', method, true, { clientId: 'client-0001', customerName: 'Synthetic QA' }))
assert.deepEqual(spaCounterFields('Demo client', 'Cash', false), { customer: 'Demo client', payment: 'Cash' })
assert.throws(() => spaCounterFields('Same name', 'Cash', true))
for (const method of ['Card', 'constructor', '__proto__']) assert.throws(() => spaCounterFields('Synthetic QA', method, true, { clientId: 'client-0001', customerName: 'Synthetic QA' }))
assert.throws(() => spaCounterFields('Different client', 'Cash', true, { clientId: 'client-0001', customerName: 'Synthetic QA' }))
assert.throws(() => spaCounterFields('Synthetic QA', 'Cash', true, { clientId: '', customerName: 'Synthetic QA' }))
const result = spawnSync('python', ['-X', 'utf8', '-c', `
import json,sys
from tests.test_commerce_runtime import spa_counter_state, spa_counter_order_intent, action_evidence
from supermega_runtime.commerce_runtime import create_commerce_order_from_intent
for fields in json.load(sys.stdin):
    state = create_commerce_order_from_intent(spa_counter_state(), spa_counter_order_intent(**fields), action_evidence('ACT-QA-COUNTER'))
    order = state['orders'][0]
    assert order['customer'] == 'client-0001'
    assert order['paymentStatus'] == 'pending'
    assert 'paymentReconciledAt' not in order
`], { input: JSON.stringify(fields), encoding: 'utf8' })
assert.equal(result.status, 0, result.stderr)
console.log('Spa counter fields: five UI tender methods accepted by runtime as pending; invalid client/tender and local preservation passed')
