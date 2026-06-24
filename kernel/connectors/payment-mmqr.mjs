// Connector: payment — Myanmar MMQR (KBZPay / AYA Pay / CB Pay, EMVCo MPM).
//
// This is a THIN adapter. The real, tested implementation already lives in DeskPOS:
//   spa-desk-pilot/src/lib/mmqr.ts
//     - buildDynamicMmqr({ basePayload, amount, reference }) -> dynamic QR string (+CRC16)
//     - readMmqr(payload) -> { valid, crcOk, amount, merchantName, ... }
//     - crc16ccitt / parseEmvco (EMVCo helpers)
//
// We do NOT duplicate that pure, deterministic code here (it's a browser-side .ts module with no
// network/keys). We register MMQR as a KNOWN payment connector so the Integrations page lists it
// alongside Stripe. It's always "configured" because it needs no credentials — a merchant's static
// QR string is the only input, supplied at call time in the DeskPOS UI.
//
// If/when the kernel needs server-side MMQR, port mmqr.ts to a .mjs sibling here and have this
// adapter import it — the registry contract stays identical.

import { register } from './registry.mjs'

export const paymentMmqr = {
  key: 'payment-mmqr',
  name: 'MMQR (KBZPay / AYA / CB — EMVCo)',
  category: 'payment',
  docs: 'spa-desk-pilot/src/lib/mmqr.ts',
  // No credentials needed — pure transform on a merchant-supplied static QR. Always available.
  configured: () => true,
  async health() {
    return { ok: true, detail: 'implemented in DeskPOS (spa-desk-pilot/src/lib/mmqr.ts) — no creds, pure EMVCo transform' }
  },
}

register(paymentMmqr)
export default paymentMmqr
