// Myanmar QR (MMQR) helpers. These functions validate and transform a merchant-issued
// EMVCo payload; they do not authenticate a merchant, call a payment provider, or prove
// that a generated dynamic payload is accepted by any bank or wallet.

const ID_POI = '01' // Point of Initiation Method: 11 = static, 12 = dynamic
const ID_ACCOUNT_INFO = '26'
const ID_MCC = '52'
const ID_CURRENCY = '53'
const ID_AMOUNT = '54'
const ID_COUNTRY = '58'
const ID_MERCHANT_NAME = '59'
const ID_MERCHANT_CITY = '60'
const ID_ADDITIONAL = '62'
const ID_CRC = '63'
const ID_MERCHANT_LANGUAGE = '64'
const MMK_NUMERIC = '104'

function utf8(value) {
  return Buffer.from(String(value ?? ''), 'utf8')
}

// CRC-16/CCITT-FALSE per the Myanmar QR specification. The payload is UTF-8 so
// Burmese characters in tag 64 are checksummed as their encoded bytes.
export function crc16ccitt(input) {
  let crc = 0xffff
  for (const byte of utf8(input)) {
    crc ^= byte << 8
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) : crc << 1
      crc &= 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

// Parse an EMVCo TLV payload by UTF-8 byte length, including Myanmar Unicode values.
// Malformed or truncated input fails closed instead of returning a valid-looking prefix.
export function parseEmvco(payload) {
  const encoded = utf8(String(payload ?? ''))
  // Myanmar QR caps the complete payload at 512 characters and requires a
  // proportional reduction for multibyte Unicode. A 512-byte ceiling is the
  // conservative interpretation for UTF-8 TLV payloads.
  if (encoded.length > 512) throw new Error('Payment QR exceeds the 512-byte MMQR payload limit.')
  const fields = []
  let cursor = 0
  while (cursor < encoded.length) {
    if (cursor + 4 > encoded.length) throw new Error('Payment QR has a truncated TLV header.')
    const id = encoded.subarray(cursor, cursor + 2).toString('ascii')
    const lengthText = encoded.subarray(cursor + 2, cursor + 4).toString('ascii')
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(lengthText)) throw new Error('Payment QR has an invalid TLV header.')
    const length = Number.parseInt(lengthText, 10)
    const start = cursor + 4
    const end = start + length
    if (end > encoded.length) throw new Error('Payment QR has a truncated TLV value.')
    const valueBytes = encoded.subarray(start, end)
    const value = valueBytes.toString('utf8')
    if (!utf8(value).equals(valueBytes)) throw new Error('Payment QR contains invalid UTF-8.')
    fields.push({ id, value })
    cursor = end
  }
  return fields
}

function field(id, value) {
  if (!/^\d{2}$/.test(id)) throw new Error('Payment QR has an invalid field ID.')
  const text = String(value ?? '')
  const byteLength = utf8(text).length
  if (byteLength > 99) throw new Error(`Payment QR field ${id} exceeds the EMVCo length limit.`)
  return `${id}${String(byteLength).padStart(2, '0')}${text}`
}

function uniqueValues(fields, context = 'Payment QR') {
  const values = new Map()
  for (const item of fields) {
    if (values.has(item.id)) throw new Error(`${context} contains duplicate field ${item.id}.`)
    values.set(item.id, item.value)
  }
  return values
}

function hasMyanmarText(value) {
  return /\p{Script=Myanmar}/u.test(value)
}

function assertMerchantLanguage(value) {
  const values = uniqueValues(parseEmvco(value), 'Merchant language template')
  if ([...values.keys()].some((id) => !['00', '01', '02'].includes(id))) {
    throw new Error('MMQR merchant language template contains a reserved field.')
  }
  const name = values.get('01') || ''
  const city = values.get('02')
  if (values.get('00') !== 'my' || !name || !hasMyanmarText(name) || utf8(name).length > 25) {
    throw new Error('MMQR requires a Burmese merchant name in tag 64.')
  }
  if (city != null && (!city || utf8(city).length > 15)) {
    throw new Error('MMQR Burmese merchant city in tag 64 exceeds 15 UTF-8 bytes.')
  }
}

function assertMerchantAccount(value) {
  const values = uniqueValues(parseEmvco(value), 'MMQR merchant account')
  if (values.get('00')?.toUpperCase() !== 'MM.COM.MMQR'
    || !/^\d{15}$/.test(values.get('01') || '')
    || !/^\d{1,25}$/.test(values.get('02') || '')) {
    throw new Error('MMQR tag 26 must contain the acquirer-issued merchant and terminal IDs.')
  }
}

function assertAdditionalData(value) {
  if (value == null) return
  const fields = parseEmvco(value)
  if (fields.length === 0) throw new Error('MMQR additional data must contain at least one field.')
  uniqueValues(fields, 'MMQR additional data')
  for (const { id, value: fieldValue } of fields) {
    const bytes = utf8(fieldValue).length
    if (/^0[1-8]$/.test(id)) {
      if (bytes > 25 || !/^[\x20-\x7E]+$/.test(fieldValue)) {
        throw new Error(`MMQR additional-data field ${id} must be printable ASCII up to 25 bytes.`)
      }
    } else if (id === '09') {
      if (!/^[AME]{1,3}$/.test(fieldValue) || new Set(fieldValue).size !== fieldValue.length) {
        throw new Error('MMQR additional consumer data must contain unique A, M, or E codes.')
      }
    } else if (id === '10') {
      if (bytes > 20 || !/^[\x20-\x7E]+$/.test(fieldValue)) {
        throw new Error('MMQR merchant tax ID must be printable ASCII up to 20 bytes.')
      }
    } else if (id === '11') {
      if (!/^[0-7][0-3][0-3]$/.test(fieldValue)) {
        throw new Error('MMQR merchant channel must use supported media, location, and presence codes.')
      }
    } else if (/^1[2-9]$|^([2-4]\d)$/.test(id)) {
      throw new Error(`MMQR additional-data field ${id} is reserved for future use.`)
    } else if (/^([5-9]\d)$/.test(id)) {
      const templateFields = parseEmvco(fieldValue)
      if (templateFields.length === 0) throw new Error(`MMQR payment-system template ${id} must contain nested TLV data.`)
      uniqueValues(templateFields, `MMQR payment-system template ${id}`)
    } else {
      throw new Error(`MMQR additional-data field ${id} is not supported.`)
    }
  }
}

function assertFeeFields(values) {
  const indicator = values.get('55')
  const fixed = values.get('56')
  const percentage = values.get('57')
  if (indicator == null) {
    if (fixed != null || percentage != null) throw new Error('MMQR fee values require a tip/convenience indicator.')
    return
  }
  if (indicator === '01') {
    if (fixed != null || percentage != null) throw new Error('MMQR tip-prompt indicator 01 must not include fee values.')
    return
  }
  if (indicator === '02') {
    if (fixed == null || percentage != null) throw new Error('MMQR indicator 02 requires only fixed fee field 56.')
    if (utf8(fixed).length > 13 || !/^\d+(?:\.\d{1,2})?$/.test(fixed)) {
      throw new Error('MMQR fixed fee must be numeric with at most two decimal places.')
    }
    return
  }
  if (indicator === '03') {
    if (percentage == null || fixed != null) throw new Error('MMQR indicator 03 requires only percentage fee field 57.')
    if (!/^\d{1,5}$/.test(percentage)) throw new Error('MMQR fee percentage must contain digits only, up to five characters.')
    return
  }
  throw new Error('MMQR tip/convenience indicator must be 01, 02, or 03.')
}

function assertMmqrStructure(fields, { requireStatic = false, rejectAmount = false } = {}) {
  const values = uniqueValues(fields)
  if (fields[0]?.id !== '00') throw new Error('MMQR payload-format tag must be first.')
  if (fields.at(-1)?.id !== ID_CRC) throw new Error('MMQR CRC must be the final field.')
  const crcValue = values.get(ID_CRC)
  if (!/^[0-9A-F]{4}$/.test(crcValue || '')) throw new Error('MMQR CRC is malformed.')

  const accountTags = fields.filter(({ id }) => /^\d{2}$/.test(id)
    && Number(id) >= 2 && Number(id) <= 51)
  if (values.get('00') !== '01' || accountTags.length === 0) throw new Error('MMQR is missing its payload or merchant account data.')
  if (values.get(ID_MCC)?.match(/^\d{4}$/) == null) throw new Error('MMQR is missing its merchant category code.')
  if (values.get(ID_CURRENCY) !== MMK_NUMERIC) throw new Error('Only MMK MMQR payloads are supported.')
  if (values.get(ID_COUNTRY) !== 'MM') throw new Error('Only Myanmar MMQR payloads are supported.')
  if (!/^[\x20-\x7E]{1,25}$/.test(values.get(ID_MERCHANT_NAME) || '')) throw new Error('MMQR is missing a valid English merchant name.')
  if (!/^[\x20-\x7E]{1,15}$/.test(values.get(ID_MERCHANT_CITY) || '')) throw new Error('MMQR is missing a valid merchant city.')
  if (!values.has(ID_ACCOUNT_INFO)) throw new Error('MMQR tag 26 is required for the supported merchant scheme.')
  assertMerchantAccount(values.get(ID_ACCOUNT_INFO))
  if (!values.has(ID_MERCHANT_LANGUAGE)) throw new Error('MMQR requires its Burmese merchant information template.')
  assertMerchantLanguage(values.get(ID_MERCHANT_LANGUAGE))
  assertAdditionalData(values.get(ID_ADDITIONAL))
  assertFeeFields(values)

  const initiation = values.get(ID_POI)
  if (initiation != null && !['11', '12'].includes(initiation)) throw new Error('MMQR has an unsupported initiation method.')
  if (requireStatic && initiation != null && initiation !== '11') throw new Error('A merchant-issued static MMQR is required as the base.')
  if (rejectAmount && values.has(ID_AMOUNT)) throw new Error('Use a no-amount merchant QR as the base payload.')
  if (values.has(ID_AMOUNT) && !/^[1-9]\d{0,12}$/.test(values.get(ID_AMOUNT))) {
    throw new Error('MMQR amount must be a positive integer MMK amount.')
  }

  return values
}

function verifyCrc(clean, fields) {
  const crc = fields.at(-1)
  return Boolean(crc && crc.id === ID_CRC && crc.value === crc16ccitt(clean.slice(0, -4)))
}

function formatAmount(amount) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 9_999_999_999_999) {
    throw new Error('MMQR amount must be a positive whole-number MMK amount.')
  }
  return String(amount)
}

function sanitizeReference(reference) {
  return String(reference || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 25)
}

function withBillNumber(existingValue, reference) {
  const fields = existingValue ? parseEmvco(existingValue) : []
  const values = uniqueValues(fields, 'MMQR additional data')
  if (values.has('01') && values.get('01') !== reference) {
    throw new Error('The merchant QR already contains a different bill number.')
  }
  values.set('01', reference)
  return Array.from(values.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, value]) => field(id, value))
    .join('')
}

// Transform only a structurally valid, static, provider-issued MMQR. This is a local
// standards check, not proof that a particular issuer accepts a derived dynamic QR.
export function buildDynamicMmqr(input) {
  if (!input || typeof input.basePayload !== 'string') throw new Error('A merchant-issued static MMQR payload is required.')
  const clean = input.basePayload
  const base = parseEmvco(clean)
  const values = assertMmqrStructure(base, { requireStatic: true, rejectAmount: true })
  if (!verifyCrc(clean, base)) throw new Error('Merchant MMQR checksum did not match.')

  values.delete(ID_CRC)
  values.set(ID_POI, '12')
  values.set(ID_AMOUNT, formatAmount(input.amount))
  const reference = input.reference ? sanitizeReference(input.reference) : ''
  if (reference) values.set(ID_ADDITIONAL, withBillNumber(values.get(ID_ADDITIONAL), reference))

  const body = Array.from(values.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, value]) => field(id, value))
    .join('')
  const withCrcTag = `${body}${ID_CRC}04`
  const result = `${withCrcTag}${crc16ccitt(withCrcTag)}`
  if (utf8(result).length > 512) throw new Error('Generated payment QR exceeds the 512-byte MMQR payload limit.')
  return result
}

// Structural MMQR inspection only. Issuer/bank/wallet acceptance is not implied.
export function readMmqr(payload) {
  const clean = String(payload || '')
  const empty = {
    amount: '', countryCode: '', crcOk: false, currencyNumeric: '', isDynamic: false,
    merchantCity: '', merchantName: '', reason: 'No payment QR payload set.', valid: false,
  }
  if (clean.length < 12) return empty

  try {
    const fields = parseEmvco(clean)
    const values = assertMmqrStructure(fields)
    const crcOk = verifyCrc(clean, fields)
    return {
      amount: values.get(ID_AMOUNT) || '',
      countryCode: values.get(ID_COUNTRY) || '',
      crcOk,
      currencyNumeric: values.get(ID_CURRENCY) || '',
      isDynamic: values.get(ID_POI) === '12',
      merchantCity: values.get(ID_MERCHANT_CITY) || '',
      merchantName: values.get(ID_MERCHANT_NAME) || '',
      reason: crcOk
        ? 'MMQR structure and checksum are valid; issuer acceptance has not been tested.'
        : 'Checksum did not match — QR may be incomplete or mistyped.',
      valid: crcOk,
    }
  } catch (error) {
    return { ...empty, reason: error instanceof Error ? error.message : 'Payment QR is invalid.' }
  }
}

// Health probe fixture is synthetic and only proves this module's local parser/CRC
// round-trip. It is never shown to a customer or submitted to a payment provider.
export function selfTest() {
  const canonicalOk = crc16ccitt('123456789') === '29B1'
  const merchant = [field('00', 'MM.COM.MMQR'), field('01', '999999999999999'), field('02', '000000')].join('')
  const language = [field('00', 'my'), field('01', 'ဆိုင်')].join('')
  const body = [
    field('00', '01'), field('26', merchant), field('52', '5411'), field('53', MMK_NUMERIC),
    field('58', 'MM'), field('59', 'TEST STORE'), field('60', 'Yangon'), field('64', language),
    `${ID_CRC}04`,
  ].join('')
  const base = `${body}${crc16ccitt(body)}`
  let roundTripOk = false
  let amountOk = false
  try {
    const dynamic = buildDynamicMmqr({ basePayload: base, amount: 35800, reference: 'INV-1' })
    const read = readMmqr(dynamic)
    roundTripOk = read.valid && read.crcOk && read.isDynamic
    amountOk = read.amount === '35800'
  } catch {
    roundTripOk = false
  }
  return { ok: canonicalOk && roundTripOk && amountOk, canonicalOk, roundTripOk, amountOk }
}
