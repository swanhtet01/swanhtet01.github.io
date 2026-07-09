// Connector: payment — Myanmar MMQR (KBZPay / AYA Pay / CB Pay, EMVCo MPM).
//
// Now a REAL server-side adapter, not just a registry placeholder. The proven, browser-
// tested logic from DeskPOS (spa-desk-pilot/src/lib/mmqr.ts) is ported to _mmqr-core.mjs
// (pure ESM, zero deps) so the whole platform can build + validate MMQR server-side —
// payment links, emailed invoices, server-rendered receipts, reconciliation. MMQR is
// EMVCo MPM and interoperable across every Myanmar wallet, so one correct implementation
// covers KBZPay / AYA / CB at once.
//
// health() runs a self-test (canonical CRC-16 vector + a build->read round-trip), so a
// broken checksum surfaces on the Integrations page instead of silently shipping bad QRs.

import { register } from './registry.mjs'
import { buildDynamicMmqr, readMmqr, crc16ccitt, parseEmvco, selfTest } from './_mmqr-core.mjs'

export const paymentMmqr = {
  key: 'payment-mmqr',
  name: 'MMQR (KBZPay / AYA / CB — EMVCo)',
  category: 'payment',
  docs: 'kernel/connectors/_mmqr-core.mjs (ported from spa-desk-pilot/src/lib/mmqr.ts)',
  // No credentials needed — a pure, deterministic transform on a merchant-supplied static
  // QR string. Always available.
  configured: () => true,
  async health() {
    const t = selfTest()
    if (t.ok) return { ok: true, detail: 'server-side EMVCo build+validate OK (canonical CRC-16 vector + round-trip verified)' }
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
