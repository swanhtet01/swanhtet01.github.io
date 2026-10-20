// Guard MMQR parsing and generation. Fixtures are synthetic and are never provider-tested.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crc16ccitt, parseEmvco, buildDynamicMmqr, readMmqr, selfTest } from './_mmqr-core.mjs'

function field(id, value) {
  return `${id}${String(Buffer.byteLength(value, 'utf8')).padStart(2, '0')}${value}`
}

function sampleBase({
  amount,
  language = true,
  additional = true,
  billNumber,
  languageName = 'ဆိုင်',
  languageCity,
  additionalFields,
  feeFields = [],
  extraRootFields = [],
} = {}) {
  const merchant = [field('00', 'MM.COM.MMQR'), field('01', '999999999999999'), field('02', '000000')].join('')
  const fields = [
    field('00', '01'), field('01', '11'), field('26', merchant), field('52', '5411'),
    field('53', '104'),
  ]
  if (amount !== undefined) fields.push(field('54', String(amount)))
  fields.push(...feeFields.map(([id, value]) => field(id, value)))
  fields.push(field('58', 'MM'), field('59', 'TEST STORE'), field('60', 'Yangon'))
  if (additional) fields.push(field('62', additionalFields || [
    ...(billNumber ? [field('01', billNumber)] : []),
    field('03', 'TEST LOCATION'),
  ].join('')))
  if (language) fields.push(field('64', [
    field('00', 'my'),
    field('01', languageName),
    ...(languageCity ? [field('02', languageCity)] : []),
  ].join('')))
  fields.push(...extraRootFields.map(([id, value]) => field(id, value)))
  const body = `${fields.join('')}${field('63', '0000')}`
  return body.slice(0, -4) + crc16ccitt(body.slice(0, -4))
}

test('canonical CRC-16/CCITT-FALSE reference vector', () => {
  assert.equal(crc16ccitt('123456789'), '29B1')
})

test('selfTest passes using a clearly synthetic merchant record', () => {
  const result = selfTest()
  assert.equal(result.ok, true, JSON.stringify(result))
})

test('build and read round-trip preserves MMK amount, reference, and Burmese merchant name', () => {
  const dynamic = buildDynamicMmqr({ basePayload: sampleBase(), amount: 35800, reference: 'INV-1' })
  const info = readMmqr(dynamic)
  assert.equal(info.valid, true)
  assert.equal(info.crcOk, true)
  assert.equal(info.isDynamic, true)
  assert.equal(info.amount, '35800')
  assert.equal(info.currencyNumeric, '104')
  assert.equal(info.countryCode, 'MM')
  assert.equal(info.merchantName, 'TEST STORE')
  assert.match(parseEmvco(dynamic).find((item) => item.id === '64').value, /ဆိုင်/)
})

test('UTF-8 TLV lengths and CRC preserve Burmese merchant text', () => {
  const base = sampleBase()
  const languageTemplate = parseEmvco(base).find((item) => item.id === '64').value
  const languageBytes = Buffer.byteLength(languageTemplate, 'utf8')
  assert.equal(Number(field('64', languageTemplate).slice(2, 4)), languageBytes)
  assert.equal(parseEmvco(languageTemplate).find((item) => item.id === '01').value, 'ဆိုင်')
  assert.equal(readMmqr(base).crcOk, true)
})

test('a new reference is added without dropping merchant additional-data fields', () => {
  const dynamic = buildDynamicMmqr({ basePayload: sampleBase(), amount: 1000, reference: 'INV-1' })
  const additional = parseEmvco(dynamic).find((item) => item.id === '62')
  assert.deepEqual(parseEmvco(additional.value), [
    { id: '01', value: 'INV-1' },
    { id: '03', value: 'TEST LOCATION' },
  ])
})

test('does not silently overwrite an existing merchant bill number', () => {
  assert.throws(() => buildDynamicMmqr({ basePayload: sampleBase({ billNumber: 'FIXED' }), amount: 1000, reference: 'INV-1' }), /different bill number/)
})

test('refuses non-positive, fractional, unsafe, or oversized MMK amounts', () => {
  for (const amount of [0, -1, 1.5, NaN, Infinity, 10_000_000_000_000]) {
    assert.throws(() => buildDynamicMmqr({ basePayload: sampleBase(), amount }), /positive whole-number MMK/)
  }
})

test('refuses a base QR without the required Burmese merchant template', () => {
  assert.throws(() => buildDynamicMmqr({ basePayload: sampleBase({ language: false }), amount: 1000 }), /Burmese merchant information/)
  assert.equal(readMmqr(sampleBase({ language: false })).valid, false)
})

test('refuses a static base with an amount so checkout cannot silently replace it', () => {
  assert.throws(() => buildDynamicMmqr({ basePayload: sampleBase({ amount: 500 }), amount: 1000 }), /no-amount merchant QR/)
})

test('rejects malformed or truncated TLV instead of accepting a valid-looking prefix', () => {
  assert.throws(() => parseEmvco(`${sampleBase()}12`), /truncated TLV header/)
  assert.equal(readMmqr(`${sampleBase()}12`).valid, false)
})

test('a tampered payload fails the checksum', () => {
  const dynamic = buildDynamicMmqr({ basePayload: sampleBase(), amount: 1000 })
  const flipped = dynamic.slice(0, -1) + (dynamic.slice(-1) === '0' ? '1' : '0')
  assert.equal(readMmqr(flipped).crcOk, false)
  assert.equal(readMmqr(flipped).valid, false)
})

test('rejects duplicates and payloads missing acquirer-issued MMQR account fields', () => {
  const fields = parseEmvco(sampleBase()).filter((item) => item.id !== '52')
  const duplicateMcc = [...fields, { id: '52', value: '5411' }, { id: '52', value: '5411' }]
  const body = duplicateMcc.filter((item) => item.id !== '63')
    .map((item) => field(item.id, item.value)).join('')
  const malformed = `${body}${field('63', crc16ccitt(`${body}6304`))}`
  assert.equal(readMmqr(malformed).valid, false)
  assert.throws(() => buildDynamicMmqr({ basePayload: 'not-a-qr', amount: 1 }))
})

test('enforces the conservative 512-byte whole-payload ceiling', () => {
  const exactly512 = `${field('50', 'A'.repeat(99)).repeat(4)}${field('50', 'A'.repeat(96))}`
  assert.equal(Buffer.byteLength(exactly512, 'utf8'), 512)
  assert.equal(parseEmvco(exactly512).length, 5)
  assert.throws(() => parseEmvco(`${exactly512}${field('50', 'A')}`), /512-byte/)
})

test('refuses to generate a dynamic payload that crosses the aggregate ceiling', () => {
  const basePayload = sampleBase({
    extraRootFields: [
      ['80', 'A'.repeat(99)], ['81', 'B'.repeat(99)], ['82', 'C'.repeat(99)], ['83', 'D'.repeat(25)],
    ],
  })
  assert.ok(Buffer.byteLength(basePayload, 'utf8') <= 512)
  assert.equal(readMmqr(basePayload).valid, true)
  assert.throws(() => buildDynamicMmqr({ basePayload, amount: 1000, reference: 'R'.repeat(25) }), /512-byte/)
})

test('validates fee indicator dependencies and supported numeric values', () => {
  for (const feeFields of [
    [['55', '01']],
    [['55', '02'], ['56', '100']],
    [['55', '02'], ['56', '100.50']],
    [['55', '02'], ['56', '1234567890123']],
    [['55', '03'], ['57', '5']],
    [['55', '03'], ['57', '12345']],
  ]) {
    assert.equal(readMmqr(sampleBase({ feeFields })).valid, true, JSON.stringify(feeFields))
  }
  const invalidFees = [
    [['56', '10']],
    [['55', '01'], ['56', '10']],
    [['55', '02']],
    [['55', '02'], ['57', '5']],
    [['55', '02'], ['56', '10'], ['57', '5']],
    [['55', '03']],
    [['55', '03'], ['56', '10']],
    [['55', '03'], ['57', '5%']],
    [['55', '03'], ['57', '123456']],
    [['55', '04']],
    [['55', '02'], ['56', '1234567890123.45']],
  ]
  for (const feeFields of invalidFees) {
    const basePayload = sampleBase({ feeFields })
    assert.equal(readMmqr(basePayload).valid, false, JSON.stringify(feeFields))
    assert.throws(() => buildDynamicMmqr({ basePayload, amount: 1000 }))
  }
})

test('bounds Myanmar-language merchant name and city by conservative UTF-8 byte limits', () => {
  assert.equal(readMmqr(sampleBase({ languageName: 'ဆိုင်', languageCity: 'ပဲခူး' })).valid, true)
  assert.equal(readMmqr(sampleBase({ languageName: `X${'ဆ'.repeat(8)}`, languageCity: 'ဆ'.repeat(5) })).valid, true)
  assert.equal(readMmqr(sampleBase({ languageName: `XX${'ဆ'.repeat(8)}` })).valid, false)
  assert.equal(readMmqr(sampleBase({ languageCity: 'ဆ'.repeat(6) })).valid, false)
  assert.equal(readMmqr(sampleBase({ languageName: 'ဆ'.repeat(8) })).valid, true) // 24 UTF-8 bytes
  assert.equal(readMmqr(sampleBase({ languageName: 'ဆ'.repeat(17) })).valid, false)
  assert.equal(readMmqr(sampleBase({ languageCity: 'ရန်'.repeat(3) })).valid, false)
})

test('validates known additional-data field lengths, codes, and reserved IDs', () => {
  for (const additionalFields of [
    field('01', '***'),
    field('01', 'A'.repeat(25)),
    field('09', 'AME'),
    field('10', 'TAX-123'),
    field('11', '400'),
    field('50', field('00', 'PAYMENT-SYSTEM-DATA')),
  ]) assert.equal(readMmqr(sampleBase({ additionalFields })).valid, true, additionalFields)

  const invalidAdditional = [
    field('01', 'A'.repeat(26)),
    field('03', 'Contains Burmese ဆ'),
    field('09', 'AAM'),
    field('09', 'X'),
    field('09', ''),
    field('10', 'T'.repeat(21)),
    field('11', '840'),
    field('12', 'reserved'),
    field('50', 'PAYMENT-SYSTEM-DATA'),
    field('50', field('00', 'A') + field('00', 'B')),
  ]
  for (const additionalFields of invalidAdditional) {
    assert.equal(readMmqr(sampleBase({ additionalFields })).valid, false, additionalFields)
  }
})
