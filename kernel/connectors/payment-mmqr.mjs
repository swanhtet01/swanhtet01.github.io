// Connector helper for structural validation and transformation of a merchant-issued
// Myanmar MMQR payload. This is not a bank/wallet integration and does not prove that a
// derived dynamic QR is accepted by KBZPay, AYA Pay, CB Pay, WavePay, or another issuer.

import { register } from './registry.mjs'
import { buildDynamicMmqr, readMmqr, crc16ccitt, parseEmvco, selfTest } from './_mmqr-core.mjs'

export const paymentMmqr = {
  key: 'payment-mmqr',
  name: 'Myanmar MMQR format helper (EMVCo)',
  category: 'payment',
  docs: 'kernel/connectors/_mmqr-core.mjs',
  // The helper itself has no provider credentials. Merchant identity still has to come
  // from the payment provider; a phone number is not a merchant account payload.
  configured: () => true,
  async health() {
    const t = selfTest()
    if (t.ok) return { ok: true, detail: 'local synthetic MMQR parser/CRC round-trip passed; issuer acceptance not tested' }
    return { ok: false, detail: `MMQR self-test failed (canonical=${t.canonicalOk} roundTrip=${t.roundTripOk} amount=${t.amountOk})` }
  },
  // Expose the core so other kernel code can build/validate without re-importing the file.
  // Boundary-guarded: invalid input yields a clean domain error, never a raw TypeError crash, so an
  // autonomous caller can try/catch a meaningful message instead of the kernel throwing 'Cannot read
  // properties of null'. The proven core (_mmqr-core.mjs) is untouched — guards live only here.
  build: (input) => {
    if (!input || typeof input !== 'object') throw new Error('mmqr_bad_input: build expects a payload object')
    return buildDynamicMmqr(input)
  },
  read: (payload) => {
    if (typeof payload !== 'string' || !payload) throw new Error('mmqr_bad_input: read expects an EMVCo string')
    return readMmqr(payload)
  },
  crc16ccitt: (payload) => {
    if (typeof payload !== 'string') throw new Error('mmqr_bad_input: crc16ccitt expects a string')
    return crc16ccitt(payload)
  },
  parseEmvco: (payload) => {
    if (typeof payload !== 'string' || !payload) throw new Error('mmqr_bad_input: parseEmvco expects an EMVCo string')
    return parseEmvco(payload)
  },
}

register(paymentMmqr)
export default paymentMmqr
