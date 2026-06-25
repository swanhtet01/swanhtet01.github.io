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
  build: buildDynamicMmqr,
  read: readMmqr,
  crc16ccitt,
  parseEmvco,
}

register(paymentMmqr)
export default paymentMmqr
