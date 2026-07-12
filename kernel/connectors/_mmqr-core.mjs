// Kernel-side MMQR core — Myanmar dynamic payment QR (EMVCo Merchant-Presented Mode).
//
// A faithful ESM port of the proven, browser-tested implementation in
//   spa-desk-pilot/src/lib/mmqr.ts
// so the PLATFORM (not just DeskPOS) can build + validate MMQR server-side: payment
// links, emailed invoices, server-rendered receipts, reconciliation. Pure + deterministic:
// no network, no keys, zero dependencies (matches gateway.mjs / store.mjs / the connector
// framework). MMQR is built on EMVCo MPM and is interoperable across KBZPay / AYA Pay /
// CB Pay, so one correct implementation covers every Myanmar wallet.
//
// Keep this in lockstep with mmqr.ts — the CRC + field logic must stay identical so a QR
// built on the server reads the same as one built in the POS, and vice-versa.

const ID_POI = '01' // Point of Initiation Method: 11 = static, 12 = dynamic
const ID_CURRENCY = '53'
const ID_AMOUNT = '54'
const ID_COUNTRY = '58'
const ID_MERCHANT_NAME = '59'
const ID_MERCHANT_CITY = '60'
const ID_ADDITIONAL = '62' // Additional Data Field Template (nested)
const ID_CRC = '63'
const MMK_NUMERIC = '104'

// CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF, no reflection, no final xor) — the
// checksum EMVCo tag 63 carries. Computed over the payload up to and including the
// "6304" CRC tag+length, then appended as 4 upper-hex chars.
export function crc16ccitt(input) {
  let crc = 0xffff
  for (let index = 0; index < input.length; index += 1) {
    crc ^= (input.charCodeAt(index) & 0xff) << 8
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) : crc << 1
      crc &= 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

// Parse the top-level EMVCo tag-length-value chain.
export function parseEmvco(payload) {
  const fields = []
  let cursor = 0
  const clean = String(payload || '').trim()
  while (cursor + 4 <= clean.length) {
    const id = clean.slice(cursor, cursor + 2)
    const length = Number.parseInt(clean.slice(cursor + 2, cursor + 4), 10)
    if (!/^\d{2}$/.test(id) || Number.isNaN(length)) break
    const start = cursor + 4
    const end = start + length
    if (end > clean.length) break
    fields.push({ id, value: clean.slice(start, end) })
    cursor = end
  }
  return fields
}

function field(id, value) {
  return `${id}${value.length.toString().padStart(2, '0')}${value}`
}

function formatAmount(amount) {
  if (!Number.isFinite(amount) || amount < 0) return '0'
  const rounded = Math.round(amount * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
}

function sanitizeReference(reference) {
  return String(reference || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 25)
}

// Build a dynamic MMQR by re-emitting the merchant's base (static) payload with the live
// amount, an optional reference, POI set to dynamic, and a freshly computed CRC.
export function buildDynamicMmqr(input) {
  const base = parseEmvco(input.basePayload)
  if (!base.length) throw new Error('Payment QR payload is not a valid EMVCo string.')

  const values = new Map()
  for (const item of base) {
    if (item.id === ID_CRC) continue // recomputed below
    values.set(item.id, item.value)
  }

  values.set(ID_POI, '12') // dynamic, single-use
  const currency = input.currencyNumeric || values.get(ID_CURRENCY) || MMK_NUMERIC
  values.set(ID_CURRENCY, currency)
  values.set(ID_AMOUNT, formatAmount(input.amount))

  const reference = input.reference ? sanitizeReference(input.reference) : ''
  if (reference) values.set(ID_ADDITIONAL, field('01', reference)) // 01 = Bill Number / reference

  const body = Array.from(values.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([id, value]) => field(id, value))
    .join('')

  const withCrcTag = `${body}${ID_CRC}04`
  return `${withCrcTag}${crc16ccitt(withCrcTag)}`
}

// Inspect any MMQR/EMVCo payload: verify its CRC and surface what it encodes.
export function readMmqr(payload) {
  const clean = String(payload || '').trim()
  const empty = {
    amount: '', countryCode: '', crcOk: false, currencyNumeric: '', isDynamic: false,
    merchantCity: '', merchantName: '', reason: 'No payment QR payload set.', valid: false,
  }
  if (clean.length < 12) return empty

  const fields = parseEmvco(clean)
  const get = (id) => fields.find((item) => item.id === id)?.value ?? ''
  const crcField = clean.slice(-8)
  const providedCrc = clean.slice(-4).toUpperCase()
  const crcOk = crcField.startsWith(`${ID_CRC}04`) && crc16ccitt(clean.slice(0, -4)) === providedCrc

  return {
    amount: get(ID_AMOUNT),
    countryCode: get(ID_COUNTRY),
    crcOk,
    currencyNumeric: get(ID_CURRENCY),
    isDynamic: get(ID_POI) === '12',
    merchantCity: get(ID_MERCHANT_CITY),
    merchantName: get(ID_MERCHANT_NAME),
    reason: crcOk ? 'Valid EMVCo/MMQR payload.' : 'Checksum did not match — QR may be incomplete or mistyped.',
    valid: fields.length > 1 && crcOk,
  }
}

// Self-test used by the connector health probe. Verifies the canonical CRC-16/CCITT-FALSE
// reference vector ("123456789" -> 0x29B1) AND a full build->read round-trip, so a broken
// port fails loudly at health-check time instead of silently emitting bad QRs.
export function selfTest() {
  const canonicalOk = crc16ccitt('123456789') === '29B1'
  // A minimal valid static base: merchant name + city + country + currency.
  const base = '000201' + '5909SuperMega' + '6006Yangon' + '5802MM' + '5303104' + '6304'
  const baseWithCrc = base + crc16ccitt(base)
  let roundTripOk = false
  let amountOk = false
  try {
    const dynamic = buildDynamicMmqr({ basePayload: baseWithCrc, amount: 35800, reference: 'INV-1' })
    const read = readMmqr(dynamic)
    roundTripOk = read.valid && read.crcOk && read.isDynamic
    amountOk = read.amount === '35800'
  } catch {
    roundTripOk = false
  }
  return { ok: canonicalOk && roundTripOk && amountOk, canonicalOk, roundTripOk, amountOk }
}
