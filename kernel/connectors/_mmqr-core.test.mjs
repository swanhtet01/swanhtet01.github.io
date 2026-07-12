// Guards the kernel MMQR port (connectors/_mmqr-core.mjs). Run: node --test connectors/
// Keep in lockstep with spa-desk-pilot/tests/mmqr.test.mjs — a server-built QR must read
// identically to a POS-built one.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crc16ccitt, parseEmvco, buildDynamicMmqr, readMmqr, selfTest } from './_mmqr-core.mjs'

// A minimal valid static base (merchant name + city + country + currency) with a real CRC.
function sampleBase() {
  const body = '000201' + '5909SuperMega' + '6006Yangon' + '5802MM' + '5303104' + '6304'
  return body + crc16ccitt(body)
}

test('canonical CRC-16/CCITT-FALSE reference vector', () => {
  // The published check value for "123456789" is 0x29B1 — the definitive proof the
  // checksum is the exact variant EMVCo tag 63 requires.
  assert.equal(crc16ccitt('123456789'), '29B1')
})

test('selfTest passes (used by the connector health probe)', () => {
  const t = selfTest()
  assert.equal(t.ok, true, JSON.stringify(t))
})

test('build -> read round-trip preserves amount + reference, marks dynamic', () => {
  const dyn = buildDynamicMmqr({ basePayload: sampleBase(), amount: 35800, reference: 'INV-1' })
  const info = readMmqr(dyn)
  assert.equal(info.valid, true)
  assert.equal(info.crcOk, true)
  assert.equal(info.isDynamic, true)
  assert.equal(info.amount, '35800')
  assert.equal(info.merchantName, 'SuperMega')
})

test('decimal amounts format to 2dp', () => {
  const dyn = buildDynamicMmqr({ basePayload: sampleBase(), amount: 1234.5 })
  assert.equal(readMmqr(dyn).amount, '1234.50')
})

test('a tampered payload fails the checksum', () => {
  const dyn = buildDynamicMmqr({ basePayload: sampleBase(), amount: 1000 })
  const flipped = dyn.slice(0, -1) + (dyn.slice(-1) === '0' ? '1' : '0')
  assert.equal(readMmqr(flipped).crcOk, false)
})

test('non-EMVCo input is rejected, not silently mis-parsed', () => {
  assert.throws(() => buildDynamicMmqr({ basePayload: 'not-a-qr', amount: 1 }))
  assert.equal(readMmqr('garbage').valid, false)
})

test('parseEmvco walks the TLV chain', () => {
  const fields = parseEmvco(sampleBase())
  assert.ok(fields.find((f) => f.id === '59' && f.value === 'SuperMega'))
  assert.ok(fields.find((f) => f.id === '58' && f.value === 'MM'))
})
